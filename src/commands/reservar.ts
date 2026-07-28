import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ApiError, fetchTheaters } from "../api.js";
import { fetchPrices, fetchSeatMap, holdSeats, openOrder } from "../api-auth.js";
import type { HoldSeatEntry, PriceCategory, TicketListEntry } from "../api-auth.js";
import { auditPending, auditResolve, newAuditId } from "../audit-log.js";
import { currentSession } from "../auth.js";
import { ok, printEnvelope, reportError } from "../format.js";
import type { Flags } from "../format.js";
import { findSeatByLabel, isAvailableStatus, parseSeatLabel, parseSeatMap } from "../seat-map.js";
import type { Seat, SeatMap } from "../seat-map.js";
import { amber, bold, dim, green } from "../style.js";

export interface ReservarOptions {
  sessionId: string;
  cine: string | null;
  asientos: string[];
  asignada: boolean;
  dryRun: boolean;
  yes: boolean;
}

/**
 * Construye el ticketList mínimo para abrir la orden: el primer ticket de la
 * primera categoría que devuelve get-prices, con su buyOption entero
 * reenviado tal cual (order-tickets lo exige completo, no solo recogId/
 * promoId). Verificado contra un payload real de get-prices y un
 * order-tickets que devolvió transIdTemp.
 */
export function buildTicketList(categories: PriceCategory[]): TicketListEntry[] {
  const category = categories[0];
  const ticket = category?.tickets[0];
  const buyOption = ticket?.buyOptions[0];
  if (!category || !ticket || !buyOption) {
    throw new ApiError(
      "ORDER_FAILED",
      "Cinemark no devolvió tarifas para esta función",
      "Puede que la función ya haya cerrado la venta. Probá con otra.",
    );
  }
  return [
    {
      areaCategoryCode: "",
      hOCode: ticket.hoCode,
      recogId: buyOption.recogId,
      promoId: buyOption.promoId,
      voucher: "",
      quantity: 1,
      price: buyOption.value,
      ticketsQty: ticket.ticketsQty,
      buyOptions: [buyOption],
    },
  ];
}

export interface ResolvedSeat {
  label: string;
  seat: Seat;
}

/**
 * Traduce cada etiqueta pedida (F12) a su asiento en el mapa. Falla claro y
 * junta todos los problemas de una vez, en vez de cortar en el primero, para
 * que quien reserva vea de una todas las etiquetas que hay que corregir.
 */
/**
 * write-hard: sin --yes, `reservar` exige una terminal interactiva de verdad
 * para poder preguntar. Si el modo es máquina o no hay TTY, colgarse esperando
 * una respuesta que nunca va a llegar es peor que fallar rápido.
 */
export function needsInteractiveConfirmation(opts: {
  yes: boolean;
  machineMode: boolean;
  stdinIsTty: boolean;
}): boolean {
  if (opts.yes) return false;
  return opts.machineMode || !opts.stdinIsTty;
}

/**
 * Lo que se va a reservar, con los datos del mapa y no con lo que el usuario
 * tipeó. Confirmar sobre el input sería confirmar su typo: acá cada butaca ya
 * está resuelta contra la sala real, con su estado.
 */
export function previewReserva(seats: ResolvedSeat[], sessionId: string): string {
  const filas = seats.map((s) => {
    const etiqueta = `${s.seat.row}-${s.seat.number}`;
    return `  ${bold(etiqueta)}  ${dim(`fila ${s.seat.row}, asiento ${s.seat.number}`)}  ${green(s.seat.status.toLowerCase())}`;
  });
  const titulo =
    seats.length === 1
      ? `${amber("Vas a reservar 1 butaca")} ${dim(`en la función ${sessionId}`)}`
      : `${amber(`Vas a reservar ${seats.length} butacas`)} ${dim(`en la función ${sessionId}`)}`;
  return [titulo, ...filas].join("\n");
}

export function resolveSeats(
  labels: string[],
  areas: ReturnType<typeof parseSeatMap>["areas"],
  // La preasignada (estado 5) no es reservable pidiéndola por número, porque el
  // número que ve el usuario es de otra orden. Pero dentro de la orden que este
  // comando abre sí lo es: verificado con order-set-seats devolviendo Code 0
  // sobre la butaca preasignada de esa misma orden. --asignada es el único
  // camino que la resuelve desde adentro, así que es el único que la permite.
  permitirAsignada = false,
): ResolvedSeat[] {
  const seatMap = { areas, summary: { total: 0, available: 0, accessible: 0, broken: 0 }, screen: { rows: 0, columns: 0 } };
  const resolved: ResolvedSeat[] = [];
  const problems: string[] = [];

  for (const label of labels) {
    const parsed = parseSeatLabel(label);
    if (!parsed) {
      problems.push(`"${label}" no tiene el formato fila+número (ej: F12)`);
      continue;
    }
    const seat = findSeatByLabel(seatMap, parsed.row, parsed.number);
    if (!seat) {
      problems.push(`"${label}" no existe en el mapa de esta función`);
      continue;
    }
    if (!isAvailableStatus(seat.statusId) && !(permitirAsignada && seat.statusId === 5)) {
      problems.push(`"${label}" no está disponible (estado: ${seat.status})`);
      continue;
    }
    resolved.push({ label, seat });
  }

  if (problems.length > 0) {
    throw new ApiError(
      "SEATS_UNAVAILABLE",
      `Hay problemas con los asientos pedidos: ${problems.join("; ")}`,
      "Corré `butaca butacas` para ver el mapa actualizado y elegir otras butacas.",
    );
  }

  return resolved;
}

/**
 * Traduce a asientos resueltos al shape que pide order-set-seats. Usa
 * `seat.gridNumber` tal cual lo dejó `parseSeatMap` (el `gridSeatNumber`
 * original del upstream), nunca el índice que `buildGrid` invierte para
 * dibujar. Mezclar los dos reservaría la butaca del lado equivocado.
 */
export function toHoldSeatEntries(
  resolved: ResolvedSeat[],
  areaCode: string,
  areaNumber: string,
): HoldSeatEntry[] {
  return resolved.map(({ seat }) => ({
    areaCatCode: areaCode,
    areaNumber,
    gridSeatRowId: seat.gridRow,
    gridSeatNumber: seat.gridNumber,
  }));
}

/**
 * Con --asignada se toma la butaca que Cinemark preasignó a ESTA orden. No se
 * puede pasar por --asientos porque el número cambia en cada orden: la que
 * muestra `butaca butacas` pertenece a la orden que ese comando abrió, y muere
 * con ella. Resolverla acá adentro es la única forma de pedirla, porque el
 * mapa que se lee ya es el de la orden que este comando abrió.
 */
export function etiquetasPedidas(
  options: Pick<ReservarOptions, "asientos" | "asignada">,
  seatMap: SeatMap,
): string[] {
  if (!options.asignada) return options.asientos;
  const asignadas = seatMap.areas
    .flatMap((a) => a.seats)
    .filter((s) => s.statusId === 5)
    .map((s) => `${s.row}-${s.number}`);
  if (asignadas.length === 0) {
    throw new ApiError(
      "SEATS_UNAVAILABLE",
      "Cinemark no preasignó ninguna butaca a esta orden",
      "Elegí una a mano: corré `butaca butacas` y pasá --asientos.",
    );
  }
  return [...asignadas, ...options.asientos];
}

export async function runReservar(options: ReservarOptions, flags: Flags, machineMode: boolean): Promise<number> {
  try {
    if (options.asientos.length === 0 && !options.asignada) {
      return reportError(
        machineMode,
        new ApiError(
          "BAD_INPUT",
          "reservar necesita --asientos 7-12 o --asignada",
          "Ejemplo: butaca reservar 159037 --cine palermo --asientos 7-12",
        ),
      );
    }

    const session = currentSession();
    if (!session) {
      return reportError(
        machineMode,
        new ApiError("AUTH_REQUIRED", "No hay sesión activa", "Corré `butaca auth login`."),
      );
    }

    if (!options.cine) {
      return reportError(
        machineMode,
        new ApiError(
          "BAD_INPUT",
          "reservar necesita --cine <slug> para saber a qué complejo pertenece la función",
          "Corré `butaca cines` para ver los slugs disponibles.",
        ),
      );
    }

    const theaters = await fetchTheaters();
    const theater = theaters.find((t) => t.slug === options.cine);
    if (!theater) {
      return reportError(
        machineMode,
        new ApiError(
          "NOT_FOUND",
          `No existe un cine con slug "${options.cine}"`,
          "Corré `butaca cines` para ver los slugs disponibles.",
        ),
      );
    }
    const cinemaId = String(theater.id);

    // El gate de confirmación no aplica a --dry-run: no toma inventario ni deja
    // nada reservado, así que exigir --yes para previsualizar obliga a tipear la
    // bandera que saltea confirmaciones justo cuando el usuario está siendo
    // cuidadoso. Peor: acostumbra a pasarla, que es lo que el gate quiere evitar.
    if (
      !options.dryRun &&
      needsInteractiveConfirmation({ yes: options.yes, machineMode, stdinIsTty: Boolean(stdin.isTTY) })
    ) {
      return reportError(
        machineMode,
        new ApiError(
          "BAD_INPUT",
          "reservar necesita confirmación y no hay terminal interactiva para pedirla",
          "Pasá --yes para confirmar sin preguntar.",
        ),
      );
    }

    const prices = await fetchPrices(cinemaId, options.sessionId, session.session.memberSessionId);
    const ticketList = buildTicketList(prices);

    const auditId = newAuditId();
    const commandStr = `butaca reservar ${options.sessionId} --cine ${options.cine} --asientos ${options.asientos.join(",")}`;

    if (options.dryRun) {
      auditPending({ id: auditId, kind: "order.dry-run", command: commandStr, meta: { sessionId: options.sessionId } });
      const opened = await openOrder(
        { sessionId: options.sessionId, cinemaId, memberId: session.session.memberId, ticketList },
        session.session.memberSessionId,
      );
      const rawMap = await fetchSeatMap(cinemaId, opened.transIdTemp, options.sessionId, session.session.memberSessionId);
      const seatMap = parseSeatMap(rawMap);
      const pedidos = etiquetasPedidas(options, seatMap);
      const resolved = resolveSeats(pedidos, seatMap.areas, options.asignada);
      auditResolve(auditId, "order.dry-run", commandStr, "ok", {
        transIdTemp: opened.transIdTemp,
        validated: resolved.map((r) => r.label),
      });

      const payload = {
        wouldHold: true,
        transIdTemp: opened.transIdTemp,
        seats: resolved.map((r) => ({ row: r.seat.row, number: r.seat.number })),
      };
      if (machineMode) {
        printEnvelope(ok(payload));
      } else {
        process.stdout.write(
          `${amber("dry-run")}: los asientos ${bold(options.asientos.join(", "))} están disponibles, no se reservó nada.\n`,
        );
      }
      return 0;
    }

    auditPending({ id: auditId, kind: "order.hold", command: commandStr, meta: { sessionId: options.sessionId } });

    let held: Awaited<ReturnType<typeof holdSeats>>;
    let transIdTemp: number;
    try {
      const opened = await openOrder(
        { sessionId: options.sessionId, cinemaId, memberId: session.session.memberId, ticketList },
        session.session.memberSessionId,
      );
      transIdTemp = opened.transIdTemp;

      const rawMap = await fetchSeatMap(cinemaId, transIdTemp, options.sessionId, session.session.memberSessionId);
      const seatMap = parseSeatMap(rawMap);
      const pedidos = etiquetasPedidas(options, seatMap);
      const resolved = resolveSeats(pedidos, seatMap.areas, options.asignada);
      const firstArea = seatMap.areas[0];
      if (!firstArea) {
        throw new ApiError("ORDER_FAILED", "El mapa de asientos no trajo ninguna área", "Reportá este error si persiste.");
      }

      // El preview va acá y no antes: recién con el mapa en mano se sabe qué
      // butacas son de verdad. Confirmar sobre lo que el usuario tipeó sería
      // confirmar su typo.
      if (!machineMode) {
        process.stdout.write(`\n${previewReserva(resolved, options.sessionId)}\n`);
        if (!options.yes) {
          const rl = createInterface({ input: stdin, output: stdout });
          try {
            const answer = await rl.question("¿Confirmar reserva? [y/N] ");
            if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
              process.stdout.write(`Cancelado. ${dim(`Para saltear esta pregunta: ${commandStr} --yes`)}\n`);
              auditResolve(auditId, "order.hold", commandStr, "ok", { cancelled: true });
              return 0;
            }
          } finally {
            rl.close();
          }
        }
      }

      held = await holdSeats(
        {
          numberOfSeats: resolved.length,
          seats: toHoldSeatEntries(resolved, firstArea.code, firstArea.number),
          cinemaId: Number(cinemaId),
          transIdTemp,
        },
        session.session.memberSessionId,
      );

      auditResolve(auditId, "order.hold", commandStr, "ok", { transIdTemp, seats: options.asientos });
    } catch (err) {
      auditResolve(auditId, "order.hold", commandStr, "error", {
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const checkoutUrl = held.Data?.checkoutUrl ?? "https://www.cinemark.com.ar/checkout";
    const payload = {
      transIdTemp,
      seats: options.asientos.map((label) => {
        const parsed = parseSeatLabel(label);
        return { row: parsed?.row ?? label, number: parsed?.number ?? "" };
      }),
      held: true,
      checkoutUrl,
      ...(held.Data?.expiresAt ? { expiresAt: held.Data.expiresAt } : {}),
    };

    if (machineMode) {
      printEnvelope(ok(payload));
    } else {
      process.stdout.write(`${green("✓")} Reservado. Completá el pago en:\n  ${bold(checkoutUrl)}\n`);
    }
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError ? err : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

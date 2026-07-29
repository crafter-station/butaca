import { ApiError, fetchMovies, fetchShowtimesByTheater, fetchTheaters } from "../api.js";
import { fetchPrices, openOrder, fetchSeatMap } from "../api-auth.js";
import type { PriceCategory, TicketListEntry } from "../api-auth.js";
import { auditPending, auditResolve, newAuditId } from "../audit-log.js";
import { currentSession } from "../auth.js";
import { ok, printEnvelope, reportError } from "../format.js";
import type { Flags } from "../format.js";
import { parseSeatMap, renderSeatMap } from "../seat-map.js";
import type { SeatMap } from "../seat-map.js";
import { toFuncion } from "./funciones.js";
import { linkCorto, linkPelicula, openUrl } from "../links.js";
import { amber, bold, dim, errAmber, italic } from "../style.js";

export interface ButacasOptions {
  sessionId: string;
  cine: string | null;
  dryRun: boolean;
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

/**
 * El mapa no dice qué película es, así que el slug sale de cruzar el sessionId
 * contra los showtimes del cine. Si falla, el comando sigue: el link es un
 * extra, no el resultado.
 */
export interface FuncionInfo {
  slug: string | null;
  pelicula: string;
  sala: string;
  formato: string;
  idioma: string;
  dateTime: string;
  displayDate: string;
}

/**
 * El mapa no dice de qué función es, así que los metadatos salen de cruzar el
 * sessionId contra los showtimes del cine. Si falla, el comando sigue: el mapa
 * es el resultado, esto es contexto.
 */
export async function resolveFuncion(cinemaId: string, sessionId: string): Promise<FuncionInfo | null> {
  try {
    const showtimes = await fetchShowtimesByTheater(cinemaId);
    const match = showtimes.find((s) => s.sessionId === sessionId);
    if (!match) return null;
    const funcion = toFuncion(match);
    const movies = await fetchMovies(cinemaId);
    return {
      slug: movies.find((m) => m.corporateId === match.corporateId)?.slug ?? null,
      pelicula: funcion.movie.name,
      sala: funcion.theater.room,
      formato: funcion.format,
      idioma: funcion.language,
      dateTime: funcion.dateTime,
      displayDate: funcion.displayDate,
    };
  } catch {
    return null;
  }
}

/**
 * El nextSteps nombra butacas que existen y están libres en ESTA sala, no un
 * placeholder. Un ejemplo con butacas inventadas falla al pegarlo, que es peor
 * que no dar ejemplo.
 */
export function reservarSugerido(sessionId: string, cine: string, seatMap: SeatMap): string {
  const todas = seatMap.areas.flatMap((a) => a.seats);
  // NO se sugiere la butaca preasignada (estado 5). Es tentador porque es la que
  // el sitio te deja marcada, pero pertenece a ESTA orden y muere con ella:
  // `reservar` abre una orden nueva, que recibe otra preasignada, y la anterior
  // vuelve al mapa como NO_DISPONIBLE. Verificado con tres llamadas seguidas a
  // la misma función: 13-4, 13-6, 13-8, cada una con su transIdTemp. Sugerirla
  // producía un comando que fallaba al pegarlo con "no está disponible".
  // Una butaca libre sigue libre en la orden siguiente, salvo que alguien la
  // compre en el medio, que es un fallo honesto y no uno que nosotros creamos.
  const elegidas = todas
    .filter((s) => s.statusId === 0)
    .slice(0, 1)
    .map((s) => `${s.row}-${s.number}`);
  const ejemplo = elegidas.length > 0 ? elegidas.join(",") : "<fila-asiento>";
  return `butaca reservar ${sessionId} --cine ${cine} --asientos ${ejemplo}`;
}

export async function runButacas(options: ButacasOptions, flags: Flags, machineMode: boolean): Promise<number> {
  try {
    let cinemaId: string | null = null;
    if (options.cine) {
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
      cinemaId = String(theater.id);
    }

    if (!cinemaId) {
      return reportError(
        machineMode,
        new ApiError(
          "BAD_INPUT",
          "butacas necesita --cine <slug> para saber a qué complejo pertenece la función",
          "Corré `butaca cines` para ver los slugs disponibles.",
        ),
      );
    }

    // dry-run explica el plan sin tocar la red autenticada: no exige sesión,
    // porque su valor es justamente poder verificarlo sin credenciales.
    if (options.dryRun) {
      const explicacion = {
        wouldOpenOrder: true,
        sessionId: options.sessionId,
        cinemaId,
        steps: ["GET /get-prices", "POST /order-tickets", "GET /order-get-map"],
      };
      if (machineMode) {
        printEnvelope(ok(explicacion));
      } else {
        process.stdout.write(
          `${amber("dry-run")}: no se abrió ninguna orden.\n` +
            `Con sesión, ${bold("butaca butacas")} llamaría en este orden:\n` +
            `  1. GET /get-prices (cinemaId=${cinemaId}, sessionId=${options.sessionId})\n` +
            `  2. POST /order-tickets ${dim("(esto abre una transacción real en Cinemark)")}\n` +
            `  3. GET /order-get-map\n`,
        );
      }
      return 0;
    }

    const session = currentSession();
    if (!session) {
      return reportError(
        machineMode,
        new ApiError("AUTH_REQUIRED", "No hay sesión activa", "Corré `butaca auth login`."),
      );
    }

    if (!machineMode) {
      // A stderr: es un diagnóstico, no el dato pedido. En stdout contaminaba la
      // salida de `butaca butacas ... > mapa.txt` con una advertencia que el
      // archivo no debería llevar.
      process.stderr.write(
        `${errAmber("Aviso")}: este comando abre una orden real en Cinemark (POST /order-tickets). ` +
          `Correrlo varias veces deja varias transacciones abiertas.\n`,
      );
    }

    const prices = await fetchPrices(cinemaId, options.sessionId, session.session.memberSessionId);
    const ticketList = buildTicketList(prices);

    const auditId = newAuditId();
    auditPending({
      id: auditId,
      kind: "order.open",
      command: `butaca butacas ${options.sessionId} --cine ${options.cine ?? ""}`,
      meta: { sessionId: options.sessionId, cinemaId },
    });

    let transIdTemp: number;
    try {
      const opened = await openOrder(
        { sessionId: options.sessionId, cinemaId, memberId: session.session.memberId, ticketList },
        session.session.memberSessionId,
      );
      transIdTemp = opened.transIdTemp;
      auditResolve(auditId, "order.open", "butaca butacas", "ok", { transIdTemp });
    } catch (err) {
      auditResolve(auditId, "order.open", "butaca butacas", "error", {
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const rawMap = await fetchSeatMap(cinemaId, transIdTemp, options.sessionId, session.session.memberSessionId);
    const seatMap = parseSeatMap(rawMap);

    const funcion = await resolveFuncion(cinemaId, options.sessionId);
    const siteUrl =
      funcion?.slug && options.cine ? linkPelicula(funcion.slug, options.cine) : null;

    const payload = {
      sessionId: options.sessionId,
      movie: funcion ? { slug: funcion.slug, name: funcion.pelicula } : null,
      showtime: funcion
        ? {
            dateTime: funcion.dateTime,
            displayDate: funcion.displayDate,
            format: funcion.formato,
            language: funcion.idioma,
          }
        : null,
      theater: { id: cinemaId, room: funcion?.sala ?? "" },
      transIdTemp,
      screen: seatMap.screen,
      areas: seatMap.areas,
      summary: seatMap.summary,
      // No hay deep link a la orden: esto lleva a la peli con el cine elegido,
      // que es lo más cerca que se puede llegar. Ver el comentario de abajo.
      siteUrl,
    };

    if (machineMode) {
      printEnvelope(
        ok(
          payload,
          options.cine ? [reservarSugerido(options.sessionId, options.cine, seatMap)] : undefined,
        ),
      );
      return 0;
    }

    if (funcion) {
      const meta = [funcion.formato, funcion.idioma, `sala ${funcion.sala}`]
        .filter(Boolean)
        .join(dim(" · "));
      process.stdout.write(`${bold(funcion.pelicula)}\n`);
      process.stdout.write(`${dim(`${funcion.dateTime}hs`)}  ${dim("·")} ${meta}\n\n`);
    }

    process.stdout.write(`${renderSeatMap(seatMap, { numerada: flags.numeros })}\n`);

    // No hay deep link a la orden abierta: probadas /butacas, /checkout y
    // /pelicula/{slug}/compra-entradas/butacas, con sesión y con transIdTemp
    // como query, todas dan el 404 de la SPA. El estado de la orden vive en
    // memoria del cliente. Lo más cerca que se llega es la página de la peli
    // con el cine ya elegido, que sí está verificado.
    if (options.cine) {
      // El comando salía pelado y el usuario lo leía como "la butaca elegida",
      // que chocaba con la ámbar del mapa: dos butacas distintas en la misma
      // pantalla sin nada que las explicara. Ninguna está seleccionada; el CLI
      // no tiene selección, se pide lo que se quiere. Decirlo evita la
      // contradicción aparente.
      process.stdout.write(
        `\n${dim("Ninguna está elegida todavía. Ejemplo con una libre:")}\n${dim(reservarSugerido(options.sessionId, options.cine, seatMap))}\n` +
          `${dim(`O quedate con la ámbar: butaca reservar ${options.sessionId} --cine ${options.cine} --asignada --orden ${transIdTemp}`)}\n`,
      );
    }

    if (siteUrl) {
      const destino = siteUrl;
      if (flags.open) {
        const r = await openUrl(destino);
        process.stdout.write(
          `\n${dim(r.opened ? `Abriendo ${linkCorto(destino)}` : `Abrilo vos: ${linkCorto(destino)}`)}\n`,
        );
      } else {
        process.stdout.write(
          `\n${dim(`Elegir en el sitio: ${linkCorto(destino)}`)}  ${dim(italic("--open lo abre"))}\n`,
        );
      }
    }
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError ? err : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

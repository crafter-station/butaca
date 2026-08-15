import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ApiError, fetchMovies, fetchShowtimesByMovie, fetchTheaters } from "../api.js";
import { buildTicketList, fetchPrices, fetchSeatMap, holdSeats, openOrder } from "../api-auth.js";
import type { HoldSeatsResult } from "../api-auth.js";
import { auditPending, auditResolve, newAuditId } from "../audit-log.js";
import { isSessionExpired, loadConfig } from "../config.js";
import { ok, printEnvelope, reportError } from "../format.js";
import type { Flags } from "../format.js";
import { linkPelicula } from "../links.js";
import { parseSeatMap, sugerirGrupoButacas } from "../seat-map.js";
import type { SeatMap } from "../seat-map.js";
import { amber, bold, dim, green } from "../style.js";
import type { CarteleraMovie, Funcion, RawCarteleraMovie, RawShowtime } from "../types.js";
import { toCarteleraMovie } from "./cartelera.js";
import { matchesFecha, matchesFormato, matchesIdioma, sortKey, toFuncion } from "./funciones.js";
import { toHoldSeatEntries } from "./reservar.js";

export interface ElegirOptions {
  busqueda: string;
  cine: string | null;
  fecha: string | null;
  formato: string | null;
  idioma: string | null;
  cantidad: number;
  dryRun: boolean;
  preflight: boolean;
  yes: boolean;
  hold: boolean;
}

export function normalizeMovieQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveMovie(movies: RawCarteleraMovie[], query: string): CarteleraMovie {
  const normalized = normalizeMovieQuery(query);
  const compact = normalized.replaceAll(" ", "");
  const converted = movies.map(toCarteleraMovie);
  const exact = converted.filter(
    (movie) =>
      normalizeMovieQuery(movie.title) === normalized ||
      normalizeMovieQuery(movie.slug) === normalized ||
      normalizeMovieQuery(movie.title).replaceAll(" ", "") === compact ||
      normalizeMovieQuery(movie.slug).replaceAll(" ", "") === compact,
  );
  if (exact.length === 1 && exact[0]) return exact[0];
  const partial = converted.filter(
    (movie) =>
      normalizeMovieQuery(movie.title).includes(normalized) ||
      normalizeMovieQuery(movie.slug).includes(normalized) ||
      normalizeMovieQuery(movie.title).replaceAll(" ", "").includes(compact) ||
      normalizeMovieQuery(movie.slug).replaceAll(" ", "").includes(compact),
  );
  if (partial.length === 1 && partial[0]) return partial[0];
  if (partial.length > 1 || exact.length > 1) {
    const candidates = (exact.length > 1 ? exact : partial).map((movie) => movie.title);
    throw new ApiError(
      "BAD_INPUT",
      `La búsqueda "${query}" coincide con varias películas`,
      `Sé más específico. Coincidencias: ${candidates.join(", ")}.`,
      { retryable: false, sideEffect: "none" },
    );
  }
  throw new ApiError(
    "NOT_FOUND",
    `No encontré una película que coincida con "${query}"`,
    "Corré `butaca cartelera --cine <slug>` para ver los títulos disponibles.",
    { retryable: false, sideEffect: "none" },
  );
}

export function resolveRelativeDate(value: string | null, now = new Date()): string | null {
  if (value === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const normalized = normalizeMovieQuery(value);
  if (normalized !== "hoy" && normalized !== "manana") {
    throw new ApiError(
      "BAD_INPUT",
      `Fecha desconocida: "${value}"`,
      "Usá hoy, mañana o YYYY-MM-DD.",
      { retryable: false, sideEffect: "none" },
    );
  }
  const target = new Date(now.getTime() + (normalized === "manana" ? 86_400_000 : 0));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(target);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function selectShowtime(
  showtimes: RawShowtime[],
  options: Pick<ElegirOptions, "fecha" | "formato" | "idioma" | "cantidad">,
): Funcion {
  const functions = showtimes
    .map((raw) => ({ funcion: toFuncion(raw), lateNight: raw.isLateNightSession }))
    .filter(({ funcion }) => matchesFecha(funcion, options.fecha))
    .filter(({ funcion }) => matchesFormato(funcion, options.formato))
    .filter(({ funcion }) => matchesIdioma(funcion, options.idioma))
    .filter(({ funcion }) => funcion.seats.available >= options.cantidad)
    .sort(
      (a, b) =>
        Number(a.lateNight) - Number(b.lateNight) ||
        b.funcion.seats.available - a.funcion.seats.available ||
        sortKey(a.funcion).localeCompare(sortKey(b.funcion)),
    );
  const selected = functions[0]?.funcion;
  if (!selected) {
    throw new ApiError(
      "NOT_FOUND",
      "No hay una función que cumpla todos los filtros y tenga suficientes butacas",
      "Probá otra fecha, formato, idioma o una cantidad menor.",
      { retryable: false, sideEffect: "none" },
    );
  }
  return selected;
}

function commandFor(options: ElegirOptions): string {
  const command = options.hold ? "elegir" : "recomendar";
  const quantityFlag = options.hold ? "--cantidad" : "--personas";
  const parts = [`butaca ${command}`, JSON.stringify(options.busqueda)];
  if (options.cine) parts.push("--cine", options.cine);
  if (options.fecha) parts.push("--fecha", options.fecha);
  if (options.formato) parts.push("--formato", options.formato);
  if (options.idioma) parts.push("--idioma", options.idioma);
  parts.push(quantityFlag, String(options.cantidad), "--mejor-asiento");
  return parts.join(" ");
}

export function reserveRecommendedCommand(
  sessionId: string,
  cine: string,
  labels: string[],
  transIdTemp: number,
): string {
  return `butaca reservar ${sessionId} --cine ${cine} --asientos ${labels.join(",")} --orden ${transIdTemp}`;
}

function priceData(raw: number) {
  return { amount: raw / 100, currency: "ARS", raw };
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export async function runElegir(
  options: ElegirOptions,
  _flags: Flags,
  machineMode: boolean,
): Promise<number> {
  try {
    const commandName = options.hold ? "elegir" : "recomendar";
    if (!options.busqueda.trim()) {
      throw new ApiError(
        "BAD_INPUT",
        `${commandName} necesita una película`,
        `Ejemplo: butaca ${commandName} spiderman --cine palermo --fecha mañana`,
        { retryable: false, sideEffect: "none" },
      );
    }
    if (!options.cine) {
      throw new ApiError(
        "BAD_INPUT",
        `${commandName} necesita --cine <slug>`,
        "Corré `butaca cines` para ver los slugs disponibles.",
        { retryable: false, sideEffect: "none" },
      );
    }
    const theaters = await fetchTheaters();
    const theater = theaters.find((item) => item.slug === options.cine);
    if (!theater) {
      throw new ApiError(
        "NOT_FOUND",
        `No existe un cine con slug "${options.cine}"`,
        "Corré `butaca cines` para ver los slugs disponibles.",
        { retryable: false, sideEffect: "none" },
      );
    }
    const cinemaId = String(theater.id);
    const movie = resolveMovie(await fetchMovies(cinemaId), options.busqueda);
    const funcion = selectShowtime(
      await fetchShowtimesByMovie(movie.corporateId, cinemaId),
      options,
    );
    const base = {
      movie: { slug: movie.slug, title: movie.title },
      theater: { id: cinemaId, slug: options.cine, name: theater.name, room: funcion.theater.room },
      showtime: funcion,
      quantity: options.cantidad,
      browserCheckoutAvailable: false,
      siteUrl: linkPelicula(movie.slug, options.cine),
    };
    const command = commandFor(options);

    if (options.dryRun) {
      const payload = {
        ...base,
        price: null,
        seats: null,
        sideEffect: "none" as const,
        retryable: false,
        wouldOpenOrder: true,
      };
      if (machineMode) printEnvelope(ok(payload, [`${command} --preflight`]));
      else
        process.stdout.write(
          `${amber("dry-run")}: ${movie.title}, ${funcion.dateTime}hs. No se abrió ninguna orden.\n${dim(`Precio: ${command} --preflight`)}\n`,
        );
      return 0;
    }

    const config = loadConfig();
    if (!config) {
      throw new ApiError("AUTH_REQUIRED", "No hay sesión activa", "Corré `butaca auth login`.", {
        retryable: false,
        sideEffect: "none",
      });
    }
    if (isSessionExpired(config.session)) {
      throw new ApiError(
        "AUTH_EXPIRED",
        "La sesión de Cinemark venció",
        "Corré `butaca auth login`.",
        { retryable: true, sideEffect: "none" },
      );
    }
    const prices = await fetchPrices(
      cinemaId,
      funcion.sessionId,
      config.session.memberSessionId,
      config.session.memberId,
    );
    const ticketList = buildTicketList(prices, options.cantidad);
    const price = priceData((ticketList[0]?.price ?? 0) * options.cantidad);
    if (options.preflight) {
      const payload = {
        ...base,
        price,
        seats: null,
        sideEffect: "none" as const,
        retryable: false,
        wouldOpenOrder: false,
      };
      if (machineMode) printEnvelope(ok(payload, [`${command} --yes`]));
      else
        process.stdout.write(
          `${green("✓")} ${movie.title}, ${funcion.dateTime}hs, $${price.amount.toLocaleString("es-AR")} total. No se abrió ninguna orden.\n${dim(`Continuar: ${command} --yes`)}\n`,
        );
      return 0;
    }

    if (!options.yes && (machineMode || !stdin.isTTY)) {
      throw new ApiError(
        "BAD_INPUT",
        `${commandName} necesita confirmación antes de abrir una orden real`,
        `Revisá primero con --preflight y después corré: ${command} --yes`,
        { retryable: false, sideEffect: "none" },
      );
    }
    if (!machineMode && !options.yes) {
      process.stdout.write(
        `${amber("Aviso")}: Cinemark no permite continuar esta orden en el navegador.\n${bold(movie.title)}  ${funcion.dateTime}hs  $${price.amount.toLocaleString("es-AR")}\n`,
      );
      if (!(await confirm("¿Abrir una orden para buscar la mejor butaca? [y/N] "))) {
        process.stdout.write("Cancelado. No se abrió ninguna orden.\n");
        return 0;
      }
    }

    const auditId = newAuditId();
    auditPending({
      id: auditId,
      kind: "order.open",
      command,
      meta: { sessionId: funcion.sessionId, cinemaId },
    });
    let transIdTemp: number;
    try {
      const opened = await openOrder(
        { sessionId: funcion.sessionId, cinemaId, memberId: config.session.memberId, ticketList },
        config.session.memberSessionId,
      );
      transIdTemp = opened.transIdTemp;
      auditResolve(auditId, "order.open", command, "ok", { transIdTemp });
    } catch (error) {
      auditResolve(auditId, "order.open", command, "error", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    let seatMap: SeatMap;
    try {
      seatMap = parseSeatMap(
        await fetchSeatMap(
          cinemaId,
          transIdTemp,
          funcion.sessionId,
          config.session.memberSessionId,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError(error.code, error.message, error.hint, {
          ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
          sideEffect: "order_opened",
        });
      }
      throw error;
    }
    const suggested = sugerirGrupoButacas(seatMap, options.cantidad);
    if (suggested.length !== options.cantidad) {
      throw new ApiError(
        "SEATS_UNAVAILABLE",
        "No hay un grupo contiguo disponible para la cantidad pedida",
        "Probá una cantidad menor u otra función.",
        { retryable: true, sideEffect: "order_opened" },
      );
    }
    const labels = suggested.map((seat) => seat.label);
    const score =
      Math.round((suggested.reduce((sum, seat) => sum + seat.score, 0) / suggested.length) * 100) /
      100;
    if (!machineMode) {
      process.stdout.write(
        `${bold(movie.title)}  ${funcion.dateTime}hs  sala ${funcion.theater.room}\nButaca${labels.length > 1 ? "s" : ""}: ${bold(labels.join(", "))}  score ${score}  $${price.amount.toLocaleString("es-AR")}\n`,
      );
    }
    if (!options.hold) {
      const reserveCommand = reserveRecommendedCommand(
        funcion.sessionId,
        options.cine,
        labels,
        transIdTemp,
      );
      const payload = {
        ...base,
        price,
        seats: suggested,
        score,
        transIdTemp,
        seatHeld: false,
        browserCheckoutAvailable: false,
        sideEffect: "order_opened" as const,
        retryable: false,
      };
      if (machineMode) printEnvelope(ok(payload, [reserveCommand]));
      else
        process.stdout.write(
          `${dim("No se hizo hold. Para mantenerlas:")}\n${reserveCommand}\n`,
        );
      return 0;
    }
    if (!machineMode) {
      process.stdout.write(`${dim("Side effect al confirmar: seat_held. No hay handoff al navegador.")}\n`);
      if (!options.yes && !(await confirm("¿Mantener estas butacas? [y/N] "))) {
        process.stdout.write(
          `Cancelado. La orden ${transIdTemp} quedó abierta, pero no se hizo el hold.\n`,
        );
        return 0;
      }
    }
    const selectedArea = seatMap.areas.find((area) =>
      labels.every((label) => area.seats.some((seat) => `${seat.row}-${seat.number}` === label)),
    );
    if (!selectedArea) {
      throw new ApiError("ORDER_FAILED", "El mapa no trajo áreas", "Probá otra función.", {
        retryable: true,
        sideEffect: "order_opened",
      });
    }
    const resolved = suggested.map((suggestion) => {
      const seat = selectedArea.seats.find(
        (item) => `${item.row}-${item.number}` === suggestion.label,
      );
      if (!seat)
        throw new ApiError(
          "SEATS_UNAVAILABLE",
          `La butaca ${suggestion.label} cambió antes del hold`,
          "Volvé a ejecutar elegir.",
          { retryable: true, sideEffect: "order_opened" },
        );
      return { label: suggestion.label, seat };
    });
    const holdAuditId = newAuditId();
    auditPending({
      id: holdAuditId,
      kind: "order.hold",
      command,
      meta: { transIdTemp, seats: labels },
    });
    let held: HoldSeatsResult;
    try {
      held = await holdSeats(
        {
          numberOfSeats: resolved.length,
          seats: toHoldSeatEntries(resolved, selectedArea.code, selectedArea.number),
          cinemaId: Number(cinemaId),
          transIdTemp,
        },
        config.session.memberSessionId,
      );
      auditResolve(holdAuditId, "order.hold", command, "ok", { transIdTemp, seats: labels });
    } catch (error) {
      auditResolve(holdAuditId, "order.hold", command, "error", {
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof ApiError) {
        throw new ApiError(error.code, error.message, error.hint, {
          ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
          sideEffect: "order_opened",
        });
      }
      throw error;
    }
    const payload = {
      ...base,
      price,
      seats: suggested,
      score,
      transIdTemp,
      seatHeld: true,
      browserCheckoutAvailable: false,
      sideEffect: "seat_held" as const,
      retryable: false,
      ...(held.Data?.expiresAt ? { expiresAt: held.Data.expiresAt } : {}),
    };
    if (machineMode) printEnvelope(ok(payload));
    else
      process.stdout.write(
        `${green("✓")} Hold confirmado en ${labels.join(", ")}. No hay handoff al navegador.\n${dim(`Para pagar, elegí de nuevo en ${base.siteUrl}`)}\n`,
      );
    return 0;
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError("UPSTREAM_ERROR", String(error), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

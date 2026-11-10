import { ApiError } from "./api.js";
import {
  CineplanetClient,
  CP_SITE,
  type CpMovie,
  type CpSession,
  limaDate,
  renderCpSeats,
} from "./api-cineplanet.js";
import type { ParsedArgs } from "./args.js";
import {
  applyFields,
  ok,
  printEnvelope,
  renderTable,
  reportError,
} from "./format.js";
import { openUrl } from "./links.js";
import { sugerirButacas, sugerirGrupoButacas } from "./seat-map.js";
import type { Funcion } from "./types.js";

const SUPPORTED = ["cines", "cartelera", "funciones", "butacas", "recomendar"];
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export async function runCineplanet(
  args: ParsedArgs,
  cine: string | null,
  machine: boolean,
): Promise<number> {
  try {
    let command = args.command ?? "";
    if (command.startsWith("cp-")) {
      cine = command;
      command = "funciones";
    }
    if (!SUPPORTED.includes(command) || args.preflight) {
      throw new ApiError(
        "BAD_INPUT",
        "Esta versión de Cineplanet admite consultas y recomendaciones, sin reservas ni precios.",
        `Comandos: ${SUPPORTED.join(", ")}. La compra se hace en cineplanet.com.pe.`,
      );
    }
    const api = new CineplanetClient(fetch, args.noCache);
    const emit = (data: Record<string, unknown>[]) => {
      const filtered = applyFields(data, args.fields);
      if (machine) printEnvelope(ok(filtered));
      else
        process.stdout.write(
          `${renderTable(filtered, args.fields ?? Object.keys(filtered[0] ?? {}))}\n`,
        );
    };
    if (command === "cines") {
      const { cinemas } = await api.get<{
        cinemas: import("./api-cineplanet.js").CpCinema[];
      }>("cache/cinemascache");
      emit(
        cinemas.map((c) => ({
          id: Number(c.ID),
          slug: c.formattedCinemaName,
          name: c.name,
          address: c.address.trim(),
          city: c.city,
          region: c.secondAddress,
          lat: Number(c.latitude),
          lng: Number(c.longitude),
        })),
      );
      return 0;
    }
    const catalog = await api.catalog();
    const cinema = cine
      ? catalog.cinemas.find(
          (c) => c.formattedCinemaName === cine || c.ID === cine,
        )
      : undefined;
    if (cine && !cinema)
      throw new ApiError(
        "NOT_FOUND",
        `Cine desconocido: ${cine}`,
        "Usa cp-brasil o cp-centro-civico; consulta la lista con butaca cines.",
      );
    let movies = catalog.movies.filter(
      (m) => !cinema || m.cinemas.some((c) => c.cinemaId === cinema.ID),
    );
    const search =
      args.peli ?? (command === "recomendar" ? args.positional.join(" ") : "");
    if (search) {
      const exact = movies.filter(
        (m) =>
          m.movieDetailsUrl === search ||
          normalized(m.title) === normalized(search),
      );
      movies = exact.length
        ? exact
        : movies.filter((m) =>
            normalized(m.title).includes(normalized(search)),
          );
      if (!movies.length)
        throw new ApiError(
          "NOT_FOUND",
          `No hay película que coincida con ${search}.`,
          "Consulta butaca cartelera; la programación puede cambiar.",
        );
      if (command === "recomendar" && movies.length > 1)
        throw new ApiError(
          "BAD_INPUT",
          "Coinciden varias películas.",
          `Elige --peli ${movies.map((m) => m.movieDetailsUrl).join(", ")}`,
        );
    }
    if (command === "cartelera") {
      emit(
        movies
          .filter((m) => !m.isComingSoon || m.isPreSale)
          .map((m) => ({
            id: m.id,
            corporateId: m.id,
            slug: m.movieDetailsUrl,
            title: m.title,
            runTime: m.runTime,
            rating: m.ratingDescription,
            formats: m.formats,
            premiere: m.isNewRelease,
          })),
      );
      return 0;
    }
    if (!cinema)
      throw new ApiError(
        "BAD_INPUT",
        "Elige un cine para esta consulta.",
        "Usa --cine cp-brasil o --cine cp-centro-civico.",
      );
    if (command === "recomendar" && !search)
      throw new ApiError(
        "BAD_INPUT",
        "Indica la película que quieres ver.",
        "Ejemplo: butaca recomendar clayface --cine cp-brasil --fecha mañana",
      );
    const index = new Map(catalog.sessions.map((s) => [s.id, s]));
    const pairs: { movie: CpMovie; session: CpSession }[] = [];
    const seen = new Set<string>();
    for (const movie of movies) {
      for (const c of movie.cinemas.filter((c) => c.cinemaId === cinema.ID)) {
        for (const date of c.dates)
          for (const id of date.sessions) {
            const session = index.get(id);
            if (session && !seen.has(id)) {
              seen.add(id);
              pairs.push({ movie, session });
            }
          }
      }
    }
    const siteUrl = (movie: CpMovie) =>
      `${CP_SITE}/peliculas/${encodeURIComponent(movie.movieDetailsUrl)}`;
    if (command === "butacas") {
      const pair = pairs.find(
        (p) =>
          p.session.sessionId === args.positional[0] ||
          p.session.id === args.positional[0],
      );
      if (!pair)
        throw new ApiError(
          "NOT_FOUND",
          "La función no figura en este cine.",
          "Consulta butaca funciones para obtener un sessionId vigente.",
        );
      if (Date.parse(pair.session.showtime) <= Date.now())
        throw new ApiError(
          "NOT_FOUND",
          "Esta función ya empezó.",
          "Consulta una función futura.",
        );
      const map = await api.seats(cinema.ID, pair.session.sessionId);
      const data = {
        sessionId: pair.session.sessionId,
        movie: { slug: pair.movie.movieDetailsUrl, name: pair.movie.title },
        showtime: {
          dateTime: pair.session.showtime,
          displayDate: pair.session.showtime.slice(0, 10),
          format: pair.session.formats.join(" "),
          language: pair.session.languages.join(" "),
        },
        theater: { id: cinema.ID, room: pair.session.screenName },
        transIdTemp: 0,
        ...map,
        sugeridas: sugerirButacas(map),
        siteUrl: siteUrl(pair.movie),
        sideEffect: "none",
      };
      if (machine) printEnvelope(ok(applyFields([data], args.fields)[0]));
      else
        process.stdout.write(
          `${pair.movie.title} · ${cinema.name} · ${pair.session.showtime}\n${renderCpSeats(map, args.numeros)}\nSugeridas: ${data.sugeridas.map((s) => s.label).join(", ")}\n${data.siteUrl}\n`,
        );
      if (args.open) await openUrl(data.siteUrl);
      return 0;
    }
    const date =
      args.todas && !args.fecha && command === "funciones"
        ? null
        : limaDate(args.fecha);
    const language = args.idioma ? normalized(args.idioma) : null;
    const matching = pairs
      .filter(
        ({ session: s }) =>
          Date.parse(s.showtime) > Date.now() &&
          (!date || s.showtime.slice(0, 10) === date) &&
          (!args.formato ||
            s.formats.some(
              (f) => normalized(f) === normalized(args.formato ?? ""),
            )) &&
          (!language ||
            s.languages.some((l) =>
              language === "sub"
                ? l.startsWith("SUB")
                : ["castellano", "dob"].includes(language)
                  ? l === "DOBLADA"
                  : normalized(l) === language,
            )),
      )
      .sort(
        (a, b) =>
          Date.parse(a.session.showtime) - Date.parse(b.session.showtime),
      );
    const results: { movie: CpMovie; session: CpSession; funcion: Funcion }[] =
      [];
    for (let i = 0; i < matching.length; i += 4) {
      const batch = await Promise.all(
        matching.slice(i, i + 4).map(async ({ movie, session: s }) => ({
          movie,
          session: s,
          funcion: {
            sessionId: s.sessionId,
            movie: { corporateId: movie.id, name: movie.title },
            theater: { id: cinema.ID, room: s.screenName },
            dateTime: s.showtime,
            displayDate: s.showtime.slice(0, 10),
            format: s.formats.join(" "),
            language: s.languages.join(" "),
            seats: await api.availability(cinema.ID, s.sessionId),
          },
        })),
      );
      results.push(
        ...batch.filter(
          (r) =>
            args.libres === null || r.funcion.seats.available >= args.libres,
        ),
      );
    }
    if (command === "funciones") {
      if (machine) emit(results.map((r) => ({ ...r.funcion })));
      else if (args.fields) emit(results.map((r) => ({ ...r.funcion })));
      else
        emit(
          results.map((r) => ({
            película: r.movie.title,
            fecha: r.funcion.displayDate,
            hora: r.session.showtime.slice(11, 16),
            formato: r.funcion.format,
            idioma: r.funcion.language,
            libres: r.funcion.seats.available,
            butacas: r.session.sessionId,
          })),
        );
      if (args.open && results[0]) await openUrl(siteUrl(results[0].movie));
      return 0;
    }
    const ranked = results.sort(
      (a, b) =>
        b.funcion.seats.available - a.funcion.seats.available ||
        Date.parse(a.session.showtime) - Date.parse(b.session.showtime),
    );
    for (const selected of ranked) {
      if (selected.funcion.seats.available < args.cantidad) continue;
      const map = args.dryRun
        ? null
        : await api.seats(cinema.ID, selected.session.sessionId);
      const seats = map ? sugerirGrupoButacas(map, args.cantidad) : null;
      if (seats && seats.length < args.cantidad) continue;
      const data = {
        movie: {
          slug: selected.movie.movieDetailsUrl,
          title: selected.movie.title,
        },
        theater: {
          id: cinema.ID,
          slug: cinema.formattedCinemaName,
          name: cinema.name,
          room: selected.session.screenName,
        },
        showtime: selected.funcion,
        quantity: args.cantidad,
        price: null,
        seats,
        seatHeld: false,
        browserCheckoutAvailable: false,
        siteUrl: siteUrl(selected.movie),
        sideEffect: "none",
        retryable: true,
      };
      if (machine) printEnvelope(ok(applyFields([data], args.fields)[0]));
      else
        process.stdout.write(
          `${data.movie.title} · ${cinema.name}\n${data.showtime.dateTime} · ${data.showtime.language}\nButacas sugeridas: ${seats?.map((s) => s.label).join(", ") ?? "sin consultar (--dry-run)"}\nSin reserva. Elige la función y las butacas en ${data.siteUrl}\n`,
        );
      if (args.open) await openUrl(data.siteUrl);
      return 0;
    }
    throw new ApiError(
      "NOT_FOUND",
      "No hay una función con asientos suficientes para los filtros indicados.",
      "Prueba otra fecha, cine o película.",
    );
  } catch (error) {
    return reportError(
      machine,
      error instanceof ApiError
        ? error
        : new ApiError(
            "UPSTREAM_ERROR",
            "No se pudo interpretar el catálogo de Cineplanet.",
            "Reintenta más tarde o consulta el sitio.",
          ),
    );
  }
}

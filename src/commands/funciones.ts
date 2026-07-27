import {
  ApiError,
  fetchMovies,
  fetchShowtimesByMovie,
  fetchShowtimesByTheater,
  fetchTheaters,
} from "../api.js";
import { formatLocalDateTime, parseSessionDateTime } from "../datetime.js";
import { escapeText } from "../escape.js";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
import type { Flags } from "../format.js";
import type { Funcion, RawShowtime } from "../types.js";

export interface FuncionesOptions {
  cine: string;
  peli: string | null;
  fecha: string | null;
  formato: string | null;
  idioma: string | null;
  libres: number | null;
}

export function toFuncion(raw: RawShowtime): Funcion {
  const parts = parseSessionDateTime(raw.sessionDateTime);
  const capacity = raw.occupation.capacity;
  const available = raw.occupation.availableSeats;
  const pct = capacity > 0 ? Math.round((available / capacity) * 1000) / 10 : 0;

  return {
    sessionId: raw.sessionId,
    movie: {
      corporateId: raw.corporateId,
      name: escapeText(raw.movieName),
    },
    theater: {
      id: raw.theaterId,
      room: raw.theaterRoom,
    },
    dateTime: formatLocalDateTime(parts),
    displayDate: raw.sessionDisplayDate,
    format: escapeText(raw.sessionFormat),
    language: escapeText(raw.language.shortName),
    seats: {
      available,
      capacity,
      pct,
    },
  };
}

// Ordena por displayDate (ISO, ordena bien) y no por dateTime (DD/MM/YYYY, que
// ordenaría 01/08 antes que 27/07).
export function sortKey(funcion: Funcion): string {
  return `${funcion.displayDate}T${funcion.dateTime.slice(-5)}`;
}

export function matchesFecha(funcion: Funcion, fecha: string | null): boolean {
  if (!fecha) return true;
  return funcion.displayDate === fecha;
}

export function matchesFormato(funcion: Funcion, formato: string | null): boolean {
  if (!formato) return true;
  return funcion.format.toUpperCase() === formato.toUpperCase();
}

export function matchesIdioma(funcion: Funcion, idioma: string | null): boolean {
  if (!idioma) return true;
  return funcion.language.toUpperCase() === idioma.toUpperCase();
}

export function matchesLibres(funcion: Funcion, libres: number | null): boolean {
  if (libres === null) return true;
  return funcion.seats.available >= libres;
}

export async function runFunciones(
  options: FuncionesOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  try {
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
    const theaterId = String(theater.id);

    let corporateId: string | null = null;
    if (options.peli) {
      const movies = await fetchMovies(theaterId);
      const movie = movies.find((m) => m.slug === options.peli);
      if (!movie) {
        return reportError(
          machineMode,
          new ApiError(
            "NOT_FOUND",
            `No existe la película "${options.peli}" en el cine "${options.cine}"`,
            "Corré `butaca cartelera --cine " + options.cine + "` para ver el slug correcto.",
          ),
        );
      }
      corporateId = movie.corporateId;
    }

    const rawShowtimes = corporateId
      ? await fetchShowtimesByMovie(corporateId, theaterId)
      : await fetchShowtimesByTheater(theaterId);

    const funciones = rawShowtimes
      .map(toFuncion)
      .filter((f) => matchesFecha(f, options.fecha))
      .filter((f) => matchesFormato(f, options.formato))
      .filter((f) => matchesIdioma(f, options.idioma))
      .filter((f) => matchesLibres(f, options.libres))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    if (machineMode) {
      const jsonRows = applyFields(
        funciones as unknown as Array<Record<string, unknown>>,
        flags.fields,
      );
      printEnvelope(ok(jsonRows));
      return 0;
    }

    const rows = funciones.map((f) => ({
      fecha: f.dateTime.slice(0, 5),
      hora: f.dateTime.slice(-5),
      pelicula: f.movie.name,
      sala: f.theater.room,
      formato: f.format,
      idioma: f.language,
      libres: f.seats.available,
      capacidad: f.seats.capacity,
      pct: `${f.seats.pct}%`,
    }));
    const columns = flags.fields ?? [
      "fecha",
      "hora",
      "pelicula",
      "sala",
      "formato",
      "idioma",
      "libres",
      "capacidad",
      "pct",
    ];
    process.stdout.write(`${renderTable(rows, columns)}\n`);
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

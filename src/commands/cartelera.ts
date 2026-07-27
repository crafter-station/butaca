import { ApiError, fetchMovies, fetchTheaters } from "../api.js";
import { escapeText } from "../escape.js";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
import type { Flags } from "../format.js";
import type { CarteleraMovie, RawCarteleraMovie } from "../types.js";

export interface CarteleraOptions {
  cine: string | null;
}

export function toCarteleraMovie(raw: RawCarteleraMovie): CarteleraMovie {
  return {
    id: raw.id,
    corporateId: raw.corporateId,
    slug: raw.slug,
    title: escapeText(raw.title),
    runTime: raw.runTime,
    rating: escapeText(raw.rating),
    formats: raw.formats.map((f) => escapeText(f.shortName)),
    premiere: raw.premiere,
  };
}

export async function runCartelera(
  options: CarteleraOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  try {
    let theaterId: string | undefined;
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
      theaterId = String(theater.id);
    }

    const raw = await fetchMovies(theaterId);
    const movies = raw.map(toCarteleraMovie);
    const nextSteps =
      movies.length > 0 && movies[0]
        ? [
            `butaca funciones --cine ${options.cine ?? "<slug-de-cine>"} --peli ${movies[0].slug}`,
          ]
        : undefined;
    const rows = applyFields(movies as unknown as Array<Record<string, unknown>>, flags.fields);

    if (machineMode) {
      printEnvelope(ok(rows, nextSteps));
      return 0;
    }

    const columns = flags.fields ?? ["slug", "title", "rating", "runTime", "formats"];
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

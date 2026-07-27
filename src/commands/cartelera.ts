import { ApiError, fetchMovies, fetchTheaters } from "../api.js";
import { escapeText } from "../escape.js";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
import type { Flags } from "../format.js";
import { blue, bold, dim, formatearDuracion, italic } from "../style.js";
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

    if (flags.fields) {
      process.stdout.write(`${renderTable(rows, flags.fields)}\n`);
      return 0;
    }

    // title y slug decían casi lo mismo en dos columnas. El título manda, el
    // slug queda en dim porque es lo que se pasa a --peli.
    // El slug se queda porque acá NO es derivable del título: las tildes y los
    // dos puntos se pierden (OBSESIÓN da obsesion, SPIDER-MAN: UN NUEVO DÍA da
    // spider-man-un-nuevo-dia). Es lo que se tipea en --peli, así que
    // esconderlo obliga a adivinarlo. En `cines` sí es derivable y por eso allá
    // no está.
    const humanRows = movies.map((m) => ({
      pelicula: bold(m.title),
      dura: dim(formatearDuracion(m.runTime)),
      apta: dim(m.rating),
      formatos: m.formats.map((f) => (f === "2D" ? dim(f) : blue(f))).join(dim(" · ")),
      "--peli": dim(m.slug),
    }));
    const cine = options.cine ?? "<cine>";
    process.stdout.write(
      `${renderTable(humanRows, ["pelicula", "dura", "apta", "formatos", "--peli"])}\n` +
        `\n${dim(`Horarios de una: ${italic(`butaca funciones --cine ${cine} --peli <slug>`)}`)}\n`,
    );
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

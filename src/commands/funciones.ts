import {
  ApiError,
  fetchMovies,
  fetchShowtimesByMovie,
  fetchShowtimesByTheater,
  fetchTheaters,
} from "../api.js";
import { formatLocalDateTime, parseSessionDateTime } from "../datetime.js";
import { escapeText } from "../escape.js";
import { sparkline } from "@crafter/charts";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
import { linkCartelera, linkCorto, linkPelicula, openUrl } from "../links.js";
import {
  barraOcupacion,
  blue,
  bold,
  dim,
  etiquetaOcupacion,
  italic,
  underline,
} from "../style.js";
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
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** Parsea YYYY-MM-DD como fecha local, sin pasar por UTC. */
function partesFecha(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function formatearFechaCorta(iso: string): string {
  const p = partesFecha(iso);
  if (!p) return iso;
  return `${p.d} ${MESES[p.m - 1] ?? ""}`;
}

export function encabezadoDia(iso: string, cantidad: number): string {
  const p = partesFecha(iso);
  if (!p) return bold(iso);
  const fecha = new Date(p.y, p.m - 1, p.d);
  const hoy = new Date();
  const mismoDia =
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate();
  const nombre = mismoDia ? "hoy" : (DIAS[fecha.getDay()] ?? "");
  const etiqueta = `${nombre} ${p.d} ${MESES[p.m - 1] ?? ""}`;
  return `${bold(underline(etiqueta))} ${dim(`· ${cantidad} funciones`)}\n`;
}

/**
 * Ocupación promedio por franja horaria del día. Muestra de un vistazo si
 * conviene ir temprano o tarde, que es la pregunta detrás de elegir función.
 */
export function sparklineDelDia(funciones: Funcion[]): string | null {
  if (funciones.length < 4) return null;

  const franjas = new Map<string, { vendido: number; n: number }>();
  for (const f of funciones) {
    const hora = f.dateTime.slice(-5, -3);
    const prev = franjas.get(hora) ?? { vendido: 0, n: 0 };
    const vendido = f.seats.capacity > 0 ? 1 - f.seats.available / f.seats.capacity : 0;
    franjas.set(hora, { vendido: prev.vendido + vendido, n: prev.n + 1 });
  }

  const horas = [...franjas.keys()].sort();
  if (horas.length < 3) return null;
  const serie = horas.map((h) => {
    const v = franjas.get(h);
    return v && v.n > 0 ? (v.vendido / v.n) * 100 : 0;
  });

  // charts dibuja el valor cero como espacio en blanco, y un valle real se lee
  // entonces como dato faltante. Sustituimos el espacio por el glifo más bajo.
  const linea = sparkline(serie).replaceAll(" ", "▁");
  const desde = horas[0] ?? "";
  const hasta = horas[horas.length - 1] ?? "";
  return `\n${dim("ocupación por hora")}  ${linea}  ${dim(`${desde}h a ${hasta}h`)}`;
}

/**
 * Una película por bloque, sus funciones ordenadas por horario. Los bloques van
 * por hora de inicio de la primera función, no alfabéticos, porque la pregunta
 * es "qué puedo ver ahora" y no "qué títulos hay".
 */
export function agruparPorPelicula(
  funciones: Funcion[],
  slugs: Map<string, string> = new Map(),
  cine = "",
): string {
  // Agrupado por corporateId y no por nombre: la clave de display descarta el
  // identificador, y el slug es lo que se pasa a --peli.
  const grupos = new Map<string, Funcion[]>();
  for (const f of funciones) {
    const key = f.movie.corporateId;
    grupos.set(key, [...(grupos.get(key) ?? []), f]);
  }

  const bloques = [...grupos.entries()]
    .sort((a, b) => {
      const ha = a[1][0]?.dateTime.slice(-5) ?? "";
      const hb = b[1][0]?.dateTime.slice(-5) ?? "";
      return ha.localeCompare(hb);
    })
    .map(([corporateId, fs]) => {
      const nombre = fs[0]?.movie.name ?? corporateId;
      const formatos = [...new Set(fs.map((f) => f.format))];
      const idiomas = [...new Set(fs.map((f) => f.language))];
      const meta = [...formatos, ...idiomas].join(dim(" · "));
      const slug = slugs.get(corporateId);
      // El comando entero, no el slug pelado: se copia sin armarlo a mano.
      const comando =
        slug && cine
          ? `\n  ${dim(`butaca funciones --cine ${cine} --peli ${slug}`)}`
          : "";
      const titulo = `${bold(nombre)}  ${dim("·")} ${meta}  ${dim(`· ${fs.length} funciones`)}${comando}`;

      // Si toda la película va en un solo formato o idioma, ya lo dice el
      // encabezado y repetirlo por fila es ruido.
      const variaFormato = formatos.length > 1;
      const variaIdioma = idiomas.length > 1;

      const filas = fs.map((f) => ({
        hora: bold(f.dateTime.slice(-5)),
        sala: dim(`sala ${f.theater.room}`),
        formato: variaFormato ? (f.format === "2D" ? dim(f.format) : blue(f.format)) : "",
        idioma: variaIdioma ? dim(f.language) : "",
        libres: `${f.seats.available}${dim(`/${f.seats.capacity}`)}`,
        "": barraOcupacion(f.seats.available, f.seats.capacity),
        " ": etiquetaOcupacion(f.seats.available, f.seats.capacity),
      }));

      const cols = ["hora", "sala"];
      if (variaFormato) cols.push("formato");
      if (variaIdioma) cols.push("idioma");
      cols.push("libres", "", " ");

      const cuerpo = renderTable(filas, cols)
        .split("\n")
        .slice(2) // los encabezados se repetirían por bloque
        .map((l) => `  ${l}`)
        .join("\n");

      return `${titulo}\n${cuerpo}`;
    });

  return bloques.join("\n\n");
}

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

    // showtimes trae corporateId pero no slug, y el slug es lo que se pasa a
    // --peli. Se resuelve sólo para el humano: el modo máquina ya salió arriba.
    const slugs = new Map<string, string>();
    try {
      for (const m of await fetchMovies(theaterId)) {
        slugs.set(m.corporateId, m.slug);
      }
    } catch {
      // Sin slugs la tabla sigue siendo útil, apenas pierde el próximo comando.
    }

    // El humano pidió "qué dan en Palermo", no la programación del mes. El
    // JSON sigue devolviendo todo; acá se recorta y se dice cuánto quedó afuera.
    const acotar = !options.fecha && !flags.todas;
    const primerDia = funciones[0]?.displayDate;
    const visibles = acotar ? funciones.filter((f) => f.displayDate === primerDia) : funciones;
    const ocultas = funciones.length - visibles.length;

    const out: string[] = [];
    if (acotar && primerDia) {
      out.push(encabezadoDia(primerDia, visibles.length));
    }

    if (flags.fields) {
      out.push(
        renderTable(
          visibles as unknown as Array<Record<string, unknown>>,
          flags.fields,
        ),
      );
    } else {
      // El título se repetía hasta 14 veces y era la columna más ancha.
      // Agrupado, el nombre va una vez y las funciones quedan por horario.
      out.push(agruparPorPelicula(visibles, slugs, options.cine));
    }

    const spark = sparklineDelDia(visibles);
    if (spark) out.push(spark);

    // Comprar se hace en el sitio: el CLI deja el link con el cine ya elegido.
    // `?cine=` está verificado, `?fecha=` se ignora del lado de ellos.
    const primerPeli = visibles[0] ? slugs.get(visibles[0].movie.corporateId) : undefined;
    const destino = primerPeli
      ? linkPelicula(primerPeli, options.cine)
      : linkCartelera(options.cine);
    if (flags.open) {
      const r = await openUrl(destino);
      out.push(
        `\n${dim(r.opened ? `Abriendo ${linkCorto(destino)}` : `Abrilo vos: ${linkCorto(destino)}`)}`,
      );
    } else {
      out.push(`\n${dim(`Comprar: ${linkCorto(destino)}`)}  ${dim(italic("--open lo abre"))}`);
    }

    if (ocultas > 0) {
      const ultimo = funciones[funciones.length - 1]?.displayDate ?? "";
      out.push(
        dim(
          `\n${ocultas} funciones más hasta el ${formatearFechaCorta(ultimo)}. ` +
            `Ver con ${italic("--fecha YYYY-MM-DD")} o ${italic("--todas")}.`,
        ),
      );
    }

    process.stdout.write(`${out.join("\n")}\n`);
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

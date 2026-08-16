import { contarButacas, fetchBillboard, fetchSeats } from "../api-graphql.js";
import type { CinepolisShowtime } from "../api-graphql.js";
import {
  ApiError,
  fetchMovies,
  fetchShowtimesByMovie,
  fetchShowtimesByTheater,
  fetchTheaters,
} from "../api.js";
import { comando as cmd } from "../providers.js";
import type { Provider } from "../providers.js";
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
          ? `\n  ${dim(cmd(`funciones --cine ${cine} --peli ${slug}`))}`
          : "";
      const titulo = `${bold(nombre)}  ${dim("·")} ${meta}  ${dim(`· ${fs.length} funciones`)}${comando}`;

      // Si toda la película va en un solo formato o idioma, ya lo dice el
      // encabezado y repetirlo por fila es ruido.
      const variaFormato = formatos.length > 1;
      const variaIdioma = idiomas.length > 1;

      const filas = fs.map((f) => ({
        hora: bold(f.dateTime.slice(-5)),
        // El id de la función es el argumento de `butaca butacas`, y sin él en
        // la tabla el usuario solo puede correr el ejemplo del pie: para
        // cualquier otro horario no tiene de dónde sacarlo. Va con el nombre del
        // comando que lo consume, no como "sessionId" pelado.
        butacas: dim(f.sessionId),
        sala: dim(`sala ${f.theater.room}`),
        formato: variaFormato ? (f.format === "2D" ? dim(f.format) : blue(f.format)) : "",
        idioma: variaIdioma ? dim(f.language) : "",
        libres: `${f.seats.available}${dim(`/${f.seats.capacity}`)}`,
        "": barraOcupacion(f.seats.available, f.seats.capacity),
        " ": etiquetaOcupacion(f.seats.available, f.seats.capacity),
      }));

      const cols = ["hora", "butacas", "sala"];
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

/**
 * Convierte una función de Cinépolis al shape publicado.
 *
 * `seats` queda en cero: a diferencia de Cinemark, su cartelera no trae ninguna
 * ocupación (el campo `availability` que sí trae es un color hexadecimal de UI,
 * no un conteo). El número real exige una consulta de butacas por función, que
 * es lo que hace `completarButacas`.
 */
function cinepolisToFuncion(s: CinepolisShowtime): Funcion {
  return {
    sessionId: s.sessionId,
    movie: { corporateId: s.movieId, name: escapeText(s.movieId) },
    theater: { id: s.cinemaVistaId, room: escapeText(s.screen) },
    // Ya viene como hora local sin sufijo de zona; formatLocalDateTime espera
    // las partes, así que se reusa el mismo parser que Cinemark.
    dateTime: formatLocalDateTime(parseSessionDateTime(s.datetime)),
    displayDate: s.date,
    format: escapeText(s.format),
    language: escapeText(s.language),
    seats: { available: 0, capacity: 0, pct: 0 },
  };
}

/**
 * Completa la ocupación de cada función con una consulta de butacas.
 *
 * Es una llamada por función, así que solo se hace cuando el usuario pidió
 * filtrar por butacas libres o cuando ya se acotó el listado. Una función que
 * falle queda en cero en vez de tumbar el comando entero: el resto de la
 * cartelera sigue siendo útil.
 */
async function completarButacas(
  provider: Provider,
  funciones: Funcion[],
): Promise<Funcion[]> {
  return Promise.all(
    funciones.map(async (f) => {
      try {
        const map = await fetchSeats(provider, f.sessionId, f.theater.id);
        return { ...f, seats: contarButacas(map) };
      } catch {
        return f;
      }
    }),
  );
}

/**
 * Funciones de una cadena GraphQL.
 *
 * Vive aparte del camino REST por una diferencia real de la fuente, no por
 * estilo: Cinemark devuelve la ocupación dentro de cada función, Cinépolis
 * obliga a una consulta de butacas por función. Eso cambia cuándo se puede
 * filtrar por `--libres` y cuánto cuesta el comando.
 */
async function runFuncionesGraphql(
  provider: Provider,
  options: FuncionesOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  try {
    const board = await fetchBillboard(provider, options.cine);
    if (board.showtimes.length === 0) {
      return reportError(
        machineMode,
        new ApiError(
          "NOT_FOUND",
          `No hay funciones para el cine "${options.cine}"`,
          "Corré `butaca cines` para ver los slugs disponibles.",
        ),
      );
    }

    let funciones = board.showtimes
      .filter((s) => !options.peli || s.movieId === options.peli)
      .map(cinepolisToFuncion)
      .filter((f) => matchesFecha(f, options.fecha))
      .filter((f) => matchesFormato(f, options.formato))
      .filter((f) => matchesIdioma(f, options.idioma))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    if (options.peli && funciones.length === 0) {
      return reportError(
        machineMode,
        new ApiError(
          "NOT_FOUND",
          `No existe la película "${options.peli}" en el cine "${options.cine}"`,
          `Corré \`butaca cartelera --cine ${options.cine}\` para ver el slug correcto.`,
        ),
      );
    }

    // Una consulta de butacas por función, así que se cuenta sobre lo que
    // realmente se va a mostrar. El humano ve un día por defecto, y consultar la
    // programación entera de un cine serían ~200 pedidos para tirar el 95%.
    const acotarDia = !options.fecha && !flags.todas && !machineMode;
    const primerDiaPrevio = funciones[0]?.displayDate;
    const aConsultar =
      acotarDia && primerDiaPrevio
        ? funciones.filter((f) => f.displayDate === primerDiaPrevio)
        : funciones;

    // Cuando el usuario ya acotó (por fecha o por película) pidió estas
    // funciones y no otras, así que se consultan aunque pasen el tope: el tope
    // existe para que un pedido amplio no dispare doscientas llamadas, no para
    // recortar un pedido específico.
    const acotoElUsuario = options.fecha !== null || options.peli !== null;
    const necesitaButacas =
      options.libres !== null || acotoElUsuario || aConsultar.length <= BUTACAS_MAX_LOOKUPS;
    if (necesitaButacas) {
      const conButacas = await completarButacas(provider, aConsultar);
      const porId = new Map(conButacas.map((f) => [f.sessionId, f]));
      funciones = funciones
        .map((f) => porId.get(f.sessionId) ?? f)
        .filter((f) => (porId.has(f.sessionId) ? matchesLibres(f, options.libres) : true));
    }

    if (machineMode) {
      const jsonRows = applyFields(
        funciones as unknown as Array<Record<string, unknown>>,
        flags.fields,
      );
      printEnvelope(ok(jsonRows));
      return 0;
    }

    const acotar = !options.fecha && !flags.todas;
    const primerDia = funciones[0]?.displayDate;
    const visibles = acotar ? funciones.filter((f) => f.displayDate === primerDia) : funciones;

    const out: string[] = [];
    if (acotar && primerDia) {
      out.push(encabezadoDia(primerDia, visibles.length));
    }

    if (flags.fields) {
      out.push(renderTable(visibles as unknown as Array<Record<string, unknown>>, flags.fields));
    } else {
      // Los ids de película de Cinépolis ya son slugs legibles, así que el mapa
      // de slugs es la identidad y no hace falta resolverlo con otra llamada.
      const slugs = new Map(visibles.map((f) => [f.movie.corporateId, f.movie.corporateId]));
      out.push(agruparPorPelicula(visibles, slugs, options.cine));
    }

    if (!necesitaButacas) {
      // El conteo es el de lo que se hubiera consultado, no el total del mes:
      // decir "son 193 funciones" con 44 en pantalla contradice lo que el
      // usuario está mirando.
      out.push(
        `\n${dim(italic(`Butacas libres no consultadas: son ${aConsultar.length} funciones y cada una es un pedido aparte. Acotá con --fecha o --peli para verlas.`))}`,
      );
    }

    const sugerida = visibles.find((f) => f.seats.available > 0) ?? visibles[0];
    if (sugerida) {
      out.push(
        `\n${dim("Ver butacas:")} ${dim(cmd(`butacas ${sugerida.sessionId} --cine ${options.cine}`))}`,
      );
    }

    const destino = `${provider.siteBase}/cartelera/${encodeURIComponent(options.cine)}`;
    if (flags.open) {
      const r = await openUrl(destino);
      out.push(
        `\n${dim(r.opened ? `Abriendo ${linkCorto(destino)}` : `Abrilo vos: ${linkCorto(destino)}`)}`,
      );
    } else {
      out.push(`\n${dim(`Comprar: ${linkCorto(destino)}`)}  ${dim(italic("--open lo abre"))}`);
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

/**
 * Tope de consultas de butacas en una sola corrida.
 *
 * Cada función es un pedido HTTP a un servicio de terceros y la cartelera
 * completa de un cine llega a 242 funciones, así que hace falta un techo. El
 * valor sale de medir el día más cargado de cada cine (2026-08-16):
 *
 *   avellaneda 55 · recoleta 44 · mendoza 44 · pilar 40 · rosario 36
 *
 * Consultar esas 55 en paralelo tarda 4.5s. El tope cubre el peor día real de
 * la cadena con margen; un valor menor deja el caso más común del CLI
 * (`butaca <cine>`, que muestra un día) sin el dato que lo hace útil.
 */
export const BUTACAS_MAX_LOOKUPS = 70;

export async function runFunciones(
  provider: Provider,
  options: FuncionesOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  if (provider.kind === "graphql") {
    return runFuncionesGraphql(provider, options, flags, machineMode);
  }
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

    // El próximo paso desde acá es ver las butacas de una función concreta, y
    // ese comando necesita el sessionId, que no aparece en ninguna columna. Sin
    // esta línea el usuario queda mirando 23 horarios sin saber cómo seguir.
    // Se emite con una función real de la lista, no con un placeholder: un
    // ejemplo que no funciona pegado es peor que no dar ejemplo.
    const ahora = Date.now();
    const conButacas = visibles.filter((f) => f.seats.available > 0);
    // La primera de la lista suele ser una trasnoche ya pasada. Se prefiere la
    // próxima que todavía no empezó; si todas pasaron, vale cualquiera con
    // butacas, porque el ejemplo tiene que existir aunque no sea comprable.
    const sugerida =
      conButacas
        .map((f) => ({ f, t: Date.parse(`${f.displayDate}T${f.dateTime.slice(-5)}:00`) }))
        .filter((x) => Number.isFinite(x.t) && x.t >= ahora)
        .sort((a, b) => a.t - b.t)[0]?.f ??
      conButacas[0] ??
      visibles[0];
    if (sugerida) {
      out.push(
        `\n${dim("Ver butacas:")} ${dim(cmd(`butacas ${sugerida.sessionId} --cine ${options.cine}`))}  ${dim(italic(`(las ${sugerida.dateTime.slice(-5)}; el número de cualquier otra función está en la columna butacas)`))}`,
      );
    }

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

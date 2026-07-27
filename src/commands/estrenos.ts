import { ApiError, fetchMovies, fetchShowtimesByMovie, fetchTheaters } from "../api.js";
import { escapeText } from "../escape.js";
import {
  encabezadoDia,
  formatearFechaCorta,
  sparklineDelDia,
  toFuncion,
} from "./funciones.js";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
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
import type {
  EstadoEstreno,
  Estreno,
  EstrenoConVentas,
  Funcion,
  RawCarteleraMovie,
} from "../types.js";

export interface EstrenosOptions {
  cine: string | null;
  busqueda: string | null;
}

/** openingDate llega como "2026-07-29T00:00:00.000Z" pero es fecha local, sin hora. */
const OPENING_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T/;

function partesOpeningDate(iso: string): { y: number; m: number; d: number } | null {
  const match = OPENING_DATE_RE.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Los dos extremos de ocupación, que es lo que responde "a qué hora voy".
 * seats.pct es porcentaje de butacas LIBRES, así que el más alto es la sala más
 * vacía. Ordenarlo al revés invierte las dos columnas y cada una queda diciendo
 * lo contrario de su título.
 */
export function extremosDeOcupacion(
  funciones: Funcion[],
  cuantas = 3,
): { vacias: Funcion[]; llenas: Funcion[] } {
  const ordenadas = [...funciones].sort((a, b) => b.seats.pct - a.seats.pct);
  return {
    vacias: ordenadas.slice(0, cuantas),
    llenas: ordenadas.slice(-cuantas).reverse(),
  };
}

export function displayDateDeOpening(iso: string): string {
  const p = partesOpeningDate(iso);
  if (!p) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

function medianoche(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

function inicioDeHoy(): Date {
  const hoy = new Date();
  return medianoche(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
}

export function diasParaEstreno(openingDateIso: string): number {
  const p = partesOpeningDate(openingDateIso);
  if (!p) return 0;
  const fecha = medianoche(p.y, p.m, p.d);
  const hoy = inicioDeHoy();
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((fecha.getTime() - hoy.getTime()) / msPorDia);
}

export function etiquetaDias(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

export function toEstreno(raw: RawCarteleraMovie): Estreno {
  const status = (raw.status ?? "SHOWING_NOW") as EstadoEstreno;
  const openingDate = raw.openingDate ?? "";
  return {
    slug: raw.slug,
    title: escapeText(raw.title),
    runTime: raw.runTime,
    rating: escapeText(raw.rating),
    formats: raw.formats.map((f) => escapeText(f.shortName)),
    status,
    openingDate,
    diasParaEstreno: openingDate ? diasParaEstreno(openingDate) : 0,
  };
}

export function esPresale(estreno: Estreno): boolean {
  return estreno.status === "PRESALE";
}

export function esProximo(estreno: Estreno): boolean {
  return estreno.status === "COMING_SOON";
}

export function coincideBusqueda(estreno: Estreno, busqueda: string): boolean {
  const q = busqueda.toLowerCase();
  return estreno.slug.toLowerCase().includes(q) || estreno.title.toLowerCase().includes(q);
}

export function agruparPorFecha(estrenos: Estreno[]): Map<string, Estreno[]> {
  const grupos = new Map<string, Estreno[]>();
  for (const e of estrenos) {
    const key = displayDateDeOpening(e.openingDate);
    grupos.set(key, [...(grupos.get(key) ?? []), e]);
  }
  return grupos;
}

function formatearFechaEncabezado(displayDate: string): string {
  const corta = formatearFechaCorta(displayDate);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(displayDate);
  if (!match) return corta;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const fecha = new Date(y, m - 1, d);
  return `${DIAS[fecha.getDay()] ?? ""} ${corta}`;
}

function renderProximos(proximos: Estreno[], mostrarTodos: boolean, filtradoPorCine: boolean): string {
  if (proximos.length === 0) return "";

  const grupos = agruparPorFecha(proximos);
  const fechas = [...grupos.keys()].sort();
  const visibles = mostrarTodos ? fechas : fechas.slice(0, 6);

  let huboGrupoGrande = false;

  const lineas = visibles.map((fecha) => {
    const pelis = grupos.get(fecha) ?? [];
    const nombres = pelis.slice(0, 3);
    const resto = pelis.length - nombres.length;

    // Con 1 o 2 títulos por fecha entra el slug sin romper la línea. Con 3 o
    // más se satura, así que ahí se corta y se apunta a --fields al cierre.
    const mostrarSlug = pelis.length <= 2;
    if (!mostrarSlug) huboGrupoGrande = true;

    const titulos = nombres
      .map((p) => (mostrarSlug ? `${p.title} ${dim(`--peli ${p.slug}`)}` : p.title))
      .join(` ${dim("·")} `);
    const cola = resto > 0 ? ` ${dim(`· +${resto}`)}` : "";
    return `${bold(formatearFechaEncabezado(fecha))}    ${titulos}${cola}`;
  });

  const out = [`${bold(underline("Próximos estrenos"))}`, ...lineas];

  if (!mostrarTodos && fechas.length > visibles.length) {
    out.push(dim(`\n${proximos.length} títulos · ver todos con ${italic("--todos")}`));
  }

  if (huboGrupoGrande) {
    out.push(dim("Los slugs de estas fechas salen de `butaca estrenos --fields slug,title`."));
  }

  if (filtradoPorCine) {
    out.push(dim("Los próximos estrenos aún no tienen cine asignado."));
  }

  return out.join("\n");
}

async function ventasDePresale(
  estreno: Estreno,
  corporateId: string,
  theaterId: string,
): Promise<EstrenoConVentas["ventas"]> {
  const raw = await fetchShowtimesByMovie(corporateId, theaterId);
  const funciones = raw.map(toFuncion);
  const displayDate = displayDateDeOpening(estreno.openingDate);
  const delEstreno = funciones.filter((f) => f.displayDate === displayDate);

  if (delEstreno.length === 0) return null;

  const vendidos = delEstreno.map((f) =>
    f.seats.capacity > 0 ? (1 - f.seats.available / f.seats.capacity) * 100 : 0,
  );
  const vendidoPromedio = Math.round((vendidos.reduce((a, b) => a + b, 0) / vendidos.length) * 10) / 10;
  const maxVendido = Math.round(Math.max(...vendidos) * 10) / 10;

  const fechaSiguiente = fechaMasUnDia(displayDate);
  const delSiguiente = funciones.filter((f) => f.displayDate === fechaSiguiente);
  let diaSiguiente: number | null = null;
  if (delSiguiente.length > 0) {
    const vendidosSiguiente = delSiguiente.map((f) =>
      f.seats.capacity > 0 ? (1 - f.seats.available / f.seats.capacity) * 100 : 0,
    );
    diaSiguiente =
      Math.round((vendidosSiguiente.reduce((a, b) => a + b, 0) / vendidosSiguiente.length) * 10) / 10;
  }

  return {
    funciones: delEstreno.length,
    vendidoPromedio,
    maxVendido,
    diaSiguiente,
  };
}

function fechaMasUnDia(displayDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(displayDate);
  if (!match) return displayDate;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const siguiente = new Date(y, m - 1, d + 1);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${siguiente.getFullYear()}-${pad(siguiente.getMonth() + 1)}-${pad(siguiente.getDate())}`;
}

function renderTarjetaPresale(estreno: Estreno, ventas: EstrenoConVentas["ventas"]): string {
  const fecha = formatearFechaCorta(displayDateDeOpening(estreno.openingDate));
  const linea1 = `${bold(estreno.title)}  ${dim(`estrena ${fecha}`)} ${dim(`(${etiquetaDias(estreno.diasParaEstreno)})`)}`;

  const formatos = estreno.formats.map((f) => (f === "2D" ? dim(f) : blue(f))).join(dim(" · "));
  const linea2 = `  ${dim("·")} ${formatos}  ${dim(`--peli ${estreno.slug}`)}`;

  const lineas = [linea1, linea2];

  if (ventas) {
    const barra = barraOcupacionPct(ventas.vendidoPromedio);
    const etiqueta = etiquetaOcupacionPct(ventas.vendidoPromedio);
    lineas.push(`  ${barra} ${ventas.vendidoPromedio}% vendido en el estreno  ${etiqueta}`);

    if (ventas.diaSiguiente !== null) {
      const siguiente = fechaMasUnDia(displayDateDeOpening(estreno.openingDate));
      const fechaCorta = formatearFechaCorta(siguiente);
      lineas.push(
        dim(
          `  si pudieras esperar al ${fechaCorta.replace(" ", "/")}, promediaría ${ventas.diaSiguiente}% vendido`,
        ),
      );
    }
  }

  return lineas.join("\n");
}

function barraOcupacionPct(pct: number): string {
  const capacity = 1000;
  const available = Math.round(capacity * (1 - pct / 100));
  return barraOcupacion(available, capacity);
}

function etiquetaOcupacionPct(pct: number): string {
  const capacity = 1000;
  const available = Math.round(capacity * (1 - pct / 100));
  return etiquetaOcupacion(available, capacity);
}

async function runListado(
  estrenos: Estreno[],
  options: EstrenosOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  const presale = estrenos.filter(esPresale);
  const proximos = estrenos.filter(esProximo);

  if (machineMode) {
    const data = {
      presale: applyFields(presale as unknown as Array<Record<string, unknown>>, flags.fields),
      comingSoon: applyFields(proximos as unknown as Array<Record<string, unknown>>, flags.fields),
    };
    const nextSteps = presale[0] ? [`butaca estrenos ${presale[0].slug}`] : undefined;
    printEnvelope(ok(data, nextSteps));
    return 0;
  }

  let theaterId: string | null = null;
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

  const out: string[] = [];

  if (presale.length > 0) {
    out.push(bold(underline("En preventa")));
    for (const estreno of presale) {
      let ventas: EstrenoConVentas["ventas"] = null;
      if (theaterId) {
        const movies = await fetchMovies(theaterId);
        const movie = movies.find((m) => m.slug === estreno.slug);
        if (movie) {
          ventas = await ventasDePresale(estreno, movie.corporateId, theaterId);
        }
      }
      out.push(renderTarjetaPresale(estreno, ventas));
    }
  }

  const proximosTexto = renderProximos(proximos, flags.todos, options.cine !== null);
  if (proximosTexto) {
    if (out.length > 0) out.push("");
    out.push(proximosTexto);
  }

  if (out.length === 0) {
    out.push(dim("No hay estrenos en preventa ni próximos por ahora."));
  }

  process.stdout.write(`${out.join("\n")}\n`);
  return 0;
}

function renderDetalle(
  estreno: Estreno,
  theaterName: string | null,
  ventas: EstrenoConVentas["ventas"],
  funcionesDelEstreno: Funcion[],
  cine: string | null,
): string {
  const fecha = formatearFechaCorta(displayDateDeOpening(estreno.openingDate));
  const out: string[] = [
    `${bold(estreno.title)}  ${dim(`· ${estreno.rating}`)}`,
    dim(`estrena ${fecha} (${etiquetaDias(estreno.diasParaEstreno)})`),
  ];

  if (!theaterName) {
    out.push("");
    out.push(dim(`Pasá --cine <slug> para ver funciones y ventas. Ejemplo: --cine palermo.`));
    return out.join("\n");
  }

  out.push("");
  out.push(underline(theaterName));

  if (!ventas) {
    out.push(dim("Sin funciones cargadas todavía para el día del estreno."));
    return out.join("\n");
  }

  out.push(
    dim(`${ventas.funciones} funciones el día del estreno`) +
      `  ${barraOcupacionPct(ventas.vendidoPromedio)} ${ventas.vendidoPromedio}% vendido promedio`,
  );

  const { vacias, llenas } = extremosDeOcupacion(funcionesDelEstreno);

  const filaDe = (f: Funcion): Record<string, string> => ({
    hora: bold(f.dateTime.slice(-5)),
    formato: f.format === "2D" ? dim(f.format) : blue(f.format),
    idioma: dim(f.language),
    libres: `${f.seats.available}${dim(`/${f.seats.capacity}`)}`,
    "": barraOcupacion(f.seats.available, f.seats.capacity, 6),
  });

  out.push("");
  out.push(`${bold("Las más vacías todavía")}`);
  out.push(
    renderTable(vacias.map(filaDe), ["hora", "formato", "idioma", "libres", ""]),
  );
  out.push("");
  out.push(`${bold("Las que vuelan")}`);
  out.push(
    renderTable(llenas.map(filaDe), ["hora", "formato", "idioma", "libres", ""]),
  );

  const spark = sparklineDelDia(funcionesDelEstreno);
  if (spark) out.push(spark);

  if (ventas.diaSiguiente !== null) {
    const siguiente = fechaMasUnDia(displayDateDeOpening(estreno.openingDate));
    const fechaCorta = formatearFechaCorta(siguiente);
    out.push("");
    out.push(
      dim(
        `si pudieras esperar al ${fechaCorta.replace(" ", "/")}, promediaría ${ventas.diaSiguiente}% vendido`,
      ),
    );
  }

  out.push("");
  const displayDate = displayDateDeOpening(estreno.openingDate);
  out.push(
    dim(`butaca funciones --cine ${cine ?? "<slug>"} --peli ${estreno.slug} --fecha ${displayDate}`),
  );

  return out.join("\n");
}

async function runDetalle(
  estreno: Estreno,
  options: EstrenosOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  if (machineMode) {
    if (!options.cine) {
      const fields = applyFields(
        [{ ...estreno, ventas: null } as unknown as Record<string, unknown>],
        flags.fields,
      );
      printEnvelope(
        ok(fields[0] ?? null, [`butaca estrenos ${estreno.slug} --cine <slug>`]),
      );
      return 0;
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
    const theaterId = String(theater.id);
    const movies = await fetchMovies(theaterId);
    const movie = movies.find((m) => m.slug === estreno.slug);
    const ventas = movie ? await ventasDePresale(estreno, movie.corporateId, theaterId) : null;

    const conVentas: EstrenoConVentas = { ...estreno, ventas };
    const fields = applyFields(
      [conVentas as unknown as Record<string, unknown>],
      flags.fields,
    );
    const displayDate = displayDateDeOpening(estreno.openingDate);
    printEnvelope(
      ok(fields[0] ?? null, [
        `butaca funciones --cine ${options.cine} --peli ${estreno.slug} --fecha ${displayDate}`,
      ]),
    );
    return 0;
  }

  if (!options.cine) {
    process.stdout.write(`${renderDetalle(estreno, null, null, [], null)}\n`);
    return 0;
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
  const theaterId = String(theater.id);
  const movies = await fetchMovies(theaterId);
  const movie = movies.find((m) => m.slug === estreno.slug);

  if (!movie) {
    process.stdout.write(
      `${renderDetalle(estreno, escapeText(theater.name), null, [], options.cine)}\n`,
    );
    return 0;
  }

  const rawShowtimes = await fetchShowtimesByMovie(movie.corporateId, theaterId);
  const funciones = rawShowtimes.map(toFuncion);
  const displayDate = displayDateDeOpening(estreno.openingDate);
  const funcionesDelEstreno = funciones.filter((f) => f.displayDate === displayDate);
  const ventas = await ventasDePresale(estreno, movie.corporateId, theaterId);

  process.stdout.write(
    `${renderDetalle(estreno, escapeText(theater.name), ventas, funcionesDelEstreno, options.cine)}\n`,
  );
  return 0;
}

export async function runEstrenos(
  options: EstrenosOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  try {
    const raw = await fetchMovies();
    const estrenos = raw.map(toEstreno);

    if (!options.busqueda) {
      return await runListado(estrenos, options, flags, machineMode);
    }

    const encontrado = estrenos.find((e) => coincideBusqueda(e, options.busqueda as string));
    if (!encontrado) {
      return reportError(
        machineMode,
        new ApiError(
          "NOT_FOUND",
          `No hay ningún estreno que coincida con "${options.busqueda}"`,
          "Corré `butaca estrenos` para ver el listado completo.",
        ),
      );
    }

    return await runDetalle(encontrado, options, flags, machineMode);
  } catch (err) {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

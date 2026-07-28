import { shouldColor, shouldColorStderr } from "./platform/detect.js";

// Todo pasa por acá y por shouldColor(), así NO_COLOR y un pipe apagan el
// estilo en un solo lugar en vez de en cada call site.
const on = (code: string, text: string): string =>
  shouldColor() ? `\x1b[${code}m${text}\x1b[0m` : text;

/**
 * Variante para diagnósticos. Mismo color, pero decidido por stderr: con
 * `butaca ... | jq` stdout es un pipe y stderr sigue siendo la terminal, así que
 * el error tiene que conservar el rojo que le dice al humano qué pasó.
 */
const onErr = (code: string, text: string): string =>
  shouldColorStderr() ? `\x1b[${code}m${text}\x1b[0m` : text;

export const errRed = (t: string): string => onErr("38;5;203", t);
export const errAmber = (t: string): string => onErr("38;5;214", t);
export const errDim = (t: string): string => onErr("2", t);
export const errBold = (t: string): string => onErr("1", t);

export const bold = (t: string): string => on("1", t);
export const dim = (t: string): string => on("2", t);
export const italic = (t: string): string => on("3", t);
export const underline = (t: string): string => on("4", t);

export const red = (t: string): string => on("38;5;203", t);
export const amber = (t: string): string => on("38;5;214", t);
export const green = (t: string): string => on("38;5;114", t);
export const blue = (t: string): string => on("38;5;110", t);
export const gray = (t: string): string => on("38;5;245", t);
export const white = (t: string): string => on("38;5;255", t);
export const dimGray = (t: string): string => on("38;5;238", t);

/** 175 minutos se lee peor que 2h 55m cuando estás eligiendo una función. */
export function formatearDuracion(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return "";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export type Ocupacion = "vacía" | "media" | "llenándose" | "casi llena";

/**
 * Traduce butacas libres a cuán llena está la sala. El upstream expone lo
 * contrario (asientos disponibles), y leído rápido se interpreta al revés:
 * "100%" es una sala vacía, no una agotada.
 */
export function ocupacionDe(available: number, capacity: number): Ocupacion {
  if (capacity <= 0) return "vacía";
  const vendido = 1 - available / capacity;
  // Umbrales medidos contra 275 funciones reales de Palermo: la mediana vende
  // 5 por ciento y el máximo observado fue 71. Con cortes en 20/50/80 el
  // noventa por ciento de las filas cae en un solo balde y la columna no
  // distingue nada, que es justo lo que tiene que hacer.
  if (vendido >= 0.5) return "casi llena";
  if (vendido >= 0.25) return "llenándose";
  if (vendido >= 0.08) return "media";
  return "vacía";
}

const COLOR_OCUPACION: Record<Ocupacion, (t: string) => string> = {
  vacía: green,
  media: green,
  llenándose: amber,
  "casi llena": red,
};

/**
 * Barra de ocupación: bloques llenos son butacas vendidas.
 * Crece hacia la derecha a medida que la sala se llena.
 */
export function barraOcupacion(available: number, capacity: number, ancho = 10): string {
  const vendido = capacity > 0 ? 1 - available / capacity : 0;
  // Escala hasta el 100 por ciento. Una escala recortada al 50 satura: una sala
  // al 54 por ciento vendido y otra al 78 dibujaban la misma barra llena, así
  // que la barra dejaba de distinguir justo entre las funciones donde importa.
  // Los cortes de ocupacionDe siguen en 8/25/50 y ahora los marca la etiqueta,
  // que es la que traduce el número a palabras; la barra muestra la magnitud.
  const llenos = Math.min(ancho, Math.round(vendido * ancho));
  const estado = ocupacionDe(available, capacity);
  const pintar = COLOR_OCUPACION[estado];
  return pintar("█".repeat(llenos)) + dim("░".repeat(ancho - llenos));
}

export function etiquetaOcupacion(available: number, capacity: number): string {
  const estado = ocupacionDe(available, capacity);
  return COLOR_OCUPACION[estado](estado);
}

/** Longitud visible, ignorando los escapes ANSI, para alinear columnas. */
export function anchoVisible(text: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: hay que medir sin ANSI
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

export function padVisible(text: string, ancho: number): string {
  const faltan = ancho - anchoVisible(text);
  return faltan > 0 ? text + " ".repeat(faltan) : text;
}

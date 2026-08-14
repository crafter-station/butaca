const BASE = "https://www.cinemark.com.ar";

/**
 * Links al sitio, sólo los que se verificaron manejando el sitio con browser.
 *
 * Lo que anda:
 * - /cartelera/{cine} carga la cartelera de ese complejo.
 * - /pelicula/{peli}?cine={cine} deja el cine preseleccionado. Verificado con
 *   control: sin el query el checkbox queda en 0, con ?cine=palermo o
 *   ?cine=quilmes queda en 1 y el botón nombra el cine correcto.
 *
 * Lo que NO anda, y por eso no se emite:
 * - ?fecha=YYYY-MM-DD se ignora. Dos muestras (31/07 y 02/08) dejaron activo
 *   el 29/07, siempre el primer día disponible.
 * - /pelicula/{peli}/compra-entradas/{X} está en el bundle pero ninguna
 *   variante de X resuelve server-side. No hay deep link a una función.
 */
export function linkCartelera(cineSlug: string): string {
  return `${BASE}/cartelera/${cineSlug}`;
}

export function linkPelicula(peliSlug: string, cineSlug?: string | null): string {
  const base = `${BASE}/pelicula/${peliSlug}`;
  return cineSlug ? `${base}?cine=${cineSlug}` : base;
}

export function linkCorto(url: string): string {
  return url.replace(/^https:\/\/www\./, "");
}

export { openUrl } from "./platform/open-url.js";

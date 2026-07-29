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

/** Para mostrar: el https:// no aporta y ocupa ancho. */
/**
 * Página de checkout con la orden ya cargada. Verificado 2026-07-28 recorriendo
 * el flujo autenticado en el navegador: el sitio navega acá tras "Comprar
 * entradas", y la página muestra película, sala y horario de la orden abierta.
 *
 * `/checkout`, que era el fallback inventado, **redirige al home** con
 * `?shouldAuthenticate=true`.
 *
 * El slug es decorativo: la orden vive en la sesión del servidor, así que
 * cualquier slug muestra la misma orden. Se pasa el de la película reservada
 * igual, porque es lo que el sitio pone y lo que hace legible el link.
 */
export function linkCheckout(peliSlug: string): string {
  return `${BASE}/pelicula/${peliSlug}/compra-entradas/mejoratuexperiencia`;
}

export function linkCorto(url: string): string {
  return url.replace(/^https:\/\/www\./, "");
}

export { openUrl } from "./platform/open-url.js";

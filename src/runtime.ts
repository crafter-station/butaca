/**
 * Detección de runtime.
 *
 * Existe por una sola razón medida: el edge de Cinépolis rechaza a los clientes
 * que no se parecen a un navegador, y Bun es el único runtime distribuible que
 * pasa. Medido 2026-08-16 con la misma query, mismos headers, misma IP y en los
 * mismos minutos; la columna de Cinemark es el control que prueba que el cliente
 * funciona:
 *
 *   cliente                       Cinépolis   Cinemark
 *   curl (OpenSSL)                403         200
 *   Node fetch (undici/OpenSSL)   403         200
 *   binario nativo scriptc        403         200
 *   Chrome headless               403          -
 *   Bun fetch (BoringSSL)         200         200
 *   Chrome headed                 200          -
 *
 * No es la IP (el 403 llega con `cf-ray: ...-EZE`, o sea salida argentina), ni
 * el método, ni el payload, ni la api key: un GET pelado también da 403.
 * Tampoco es solo el fingerprint TLS, porque Chrome headless usa BoringSSL igual
 * que Bun y lo rechaza. Sea cual sea la señal completa, lo que está medido es
 * qué runtime pasa, y eso es lo que este módulo consulta.
 */

/**
 * `true` cuando corremos bajo Bun.
 *
 * Se lee en cada llamada en vez de cachearse en un módulo: los tests necesitan
 * simular ambos runtimes, y una constante evaluada al importar no se puede
 * revertir.
 */
export function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

/** Nombre del runtime activo, para mensajes de error. */
export function runtimeName(): string {
  if (isBun()) return "Bun";
  const versions = (globalThis as { process?: { versions?: Record<string, string> } }).process
    ?.versions;
  if (versions?.node) return `Node ${versions.node}`;
  return "este runtime";
}

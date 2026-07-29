import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atomicWriteJson } from "./atomic-write.js";

/**
 * Ver el mapa de asientos exige abrir una orden en Cinemark: `order-get-map`
 * sin `transIdTemp` responde 500, y con el id de una orden vieja también. O sea
 * la escritura es el precio real de la consulta, no una elección nuestra.
 *
 * Lo que sí es nuestro es cuántas veces se paga. Sin caché, tres corridas de
 * `butaca butacas` sobre la misma función dejaban tres transacciones abiertas.
 * En tres días de desarrollo el audit log registró 196 aperturas para 3 holds
 * confirmados.
 *
 * Verificado que una orden sirve para releer el mapa al menos 30 segundos
 * después de abrirla. La ventana se toma corta a propósito: el mapa cambia
 * cuando otros compran, y devolver butacas vendidas como libres es peor que
 * abrir una orden de más.
 */
const TTL_MS = 60_000;

interface OrdenCacheada {
  transIdTemp: number;
  abiertaEn: number;
}

type CacheFile = Record<string, OrdenCacheada>;

function cachePath(): string {
  return join(homedir(), ".butaca", "orders.json");
}

function claveDe(cinemaId: string, sessionId: string): string {
  return `${cinemaId}:${sessionId}`;
}

function leer(): CacheFile {
  const p = cachePath();
  if (!existsSync(p)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as CacheFile) : {};
  } catch {
    // Un caché corrupto no es motivo para fallar una consulta: se descarta.
    return {};
  }
}

/**
 * Devuelve el transIdTemp de una orden abierta hace poco para esta función, o
 * null si no hay ninguna vigente. `ahora` se inyecta para poder testear el
 * vencimiento sin esperar un minuto.
 */
export function ordenVigente(cinemaId: string, sessionId: string, ahora = Date.now()): number | null {
  const entry = leer()[claveDe(cinemaId, sessionId)];
  if (!entry) return null;
  if (ahora - entry.abiertaEn > TTL_MS) return null;
  return entry.transIdTemp;
}

export function guardarOrden(
  cinemaId: string,
  sessionId: string,
  transIdTemp: number,
  ahora = Date.now(),
): void {
  const p = cachePath();
  mkdirSync(dirname(p), { recursive: true });
  const cache = leer();
  // Las entradas vencidas se barren acá: el archivo no crece con una entrada
  // por función consultada en toda la vida del CLI.
  for (const [k, v] of Object.entries(cache)) {
    if (ahora - v.abiertaEn > TTL_MS) delete cache[k];
  }
  cache[claveDe(cinemaId, sessionId)] = { transIdTemp, abiertaEn: ahora };
  atomicWriteJson(p, cache, { mode: 0o600 });
}

/** Para cuando el upstream rechaza una orden cacheada: se olvida y se reabre. */
export function olvidarOrden(cinemaId: string, sessionId: string): void {
  const p = cachePath();
  if (!existsSync(p)) return;
  const cache = leer();
  delete cache[claveDe(cinemaId, sessionId)];
  atomicWriteJson(p, cache, { mode: 0o600 });
}

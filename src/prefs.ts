import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteJson } from "./atomic-write.js";
import { prefsPath } from "./config.js";
import { DEFAULT_PROVIDER_ID, findProvider } from "./providers.js";

/**
 * Preferencias del usuario, separadas de `config.json` a propósito: ese archivo
 * guarda la sesión y se borra entero con `auth logout`. El cine y la cadena
 * favoritos no son credenciales y no tienen por qué perderse al desloguearse.
 */
export interface Prefs {
  /** Slug del cine por defecto, el que se usa si no se pasa --cine. */
  cine?: string;
  /** Id de cadena por defecto. */
  cadena?: string;
}

export function loadPrefs(): Prefs {
  const p = prefsPath();
  if (!existsSync(p)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Prefs) : {};
  } catch {
    // Un archivo de preferencias corrupto no debería romper una consulta: se
    // ignora y el CLI vuelve a los defaults.
    return {};
  }
}

export function savePrefs(prefs: Prefs): void {
  const p = prefsPath();
  mkdirSync(dirname(p), { recursive: true });
  atomicWriteJson(p, prefs, { mode: 0o600 });
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Prefs {
  const prefs = { ...loadPrefs(), [key]: value };
  savePrefs(prefs);
  return prefs;
}

export function unsetPref(key: keyof Prefs): Prefs {
  const prefs = loadPrefs();
  delete prefs[key];
  savePrefs(prefs);
  return prefs;
}

/**
 * Cadena efectiva, en orden de precedencia: flag explícito, variable de entorno,
 * preferencia guardada, default. El flag gana siempre para que un script pueda
 * ignorar la configuración de quien lo corre.
 */
export function cadenaEfectiva(flag?: string | null): string {
  const guardada = loadPrefs().cadena;
  const candidata = flag ?? process.env.BUTACA_CADENA ?? guardada ?? DEFAULT_PROVIDER_ID;
  // Una preferencia que apunta a una cadena que ya no existe no debería dejar
  // el CLI inutilizable: se ignora y se cae al default.
  if (!flag && !findProvider(candidata)) return DEFAULT_PROVIDER_ID;
  return candidata;
}

/**
 * Cine efectivo. Devuelve null si no hay ninguno, para que el comando decida.
 *
 * El cine guardado pertenece a la cadena en la que se guardó: los slugs no se
 * comparten entre cadenas ("palermo" es de Cinemark,
 * "cinepolis-recoleta-buenos-aires" es de Cinépolis). Si la cadena activa no es
 * aquella, la preferencia se ignora en vez de aplicarse como filtro: filtrar por
 * un cine que no existe en la cadena consultada devuelve vacío en silencio, que
 * se lee como "no hay cartelera" y es peor que no filtrar.
 *
 * Un flag o una variable de entorno explícitos siempre ganan: si el usuario lo
 * escribió, no hay nada que adivinar.
 */
export function cineEfectivo(flag?: string | null, cadenaActiva?: string): string | null {
  if (flag) return flag;
  if (process.env.BUTACA_CINE) return process.env.BUTACA_CINE;

  const prefs = loadPrefs();
  if (!prefs.cine) return null;
  const cadenaDelCine = prefs.cadena ?? DEFAULT_PROVIDER_ID;
  if (cadenaActiva && cadenaDelCine !== cadenaActiva) return null;
  return prefs.cine;
}

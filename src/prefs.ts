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

/** Cine efectivo. Devuelve null si no hay ninguno, para que el comando decida. */
export function cineEfectivo(flag?: string | null): string | null {
  return flag ?? process.env.BUTACA_CINE ?? loadPrefs().cine ?? null;
}

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson } from "./atomic-write.js";

export interface Session {
  cookie: string;
  /**
   * El BFF vive en otro dominio (`bff.` contra `www.`), así que la cookie de
   * NextAuth no le llega. Lo que acepta es el header `member-session-id`, y ese
   * id sale de `GET /api/auth/session` después de loguearse.
   */
  memberSessionId: string;
  /**
   * order-tickets lo exige a nivel superior del body. Se cachea acá al hacer
   * login (`user.memberId` de la misma respuesta de NextAuth que trae
   * memberSessionId) para no tener que pedirlo a `/get-member` en cada
   * comando.
   */
  memberId: string;
  expiresAt: string;
}

export interface ButacaConfig {
  email: string;
  session: Session;
}

/**
 * Resuelto en cada llamada, no en el import: BUTACA_HOME permite a los tests
 * apuntar a un directorio descartable sin tocar el ~/.butaca real de quien
 * corre la suite.
 */
export function butacaHome(): string {
  return process.env.BUTACA_HOME ?? join(homedir(), ".butaca");
}

/** Preferencias, aparte de config.json: no son credenciales y sobreviven al logout. */
export function prefsPath(): string {
  return join(butacaHome(), "prefs.json");
}

export function configPath(): string {
  return join(butacaHome(), "config.json");
}

export function auditDir(): string {
  return join(butacaHome(), "audit");
}

/**
 * `config.json` solo guarda email + cookie + expiresAt, nunca la contraseña.
 * Un archivo corrupto o ausente no es un error de esta función: el que llama
 * decide si eso significa AUTH_REQUIRED.
 */
export function loadConfig(): ButacaConfig | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ButacaConfig>;
    if (
      !parsed.email ||
      !parsed.session?.cookie ||
      !parsed.session?.memberId ||
      !parsed.session?.expiresAt
    ) {
      return null;
    }
    return { email: parsed.email, session: parsed.session };
  } catch {
    return null;
  }
}

/** Permisos 0600: la cookie de sesión vive acá, aunque la contraseña no. */
export function saveConfig(config: ButacaConfig): void {
  atomicWriteJson(configPath(), config, { mode: 0o600 });
}

export function clearConfig(): void {
  atomicWriteJson(configPath(), {}, { mode: 0o600 });
}

export function isSessionExpired(session: Session): boolean {
  return new Date(session.expiresAt).getTime() < Date.now();
}

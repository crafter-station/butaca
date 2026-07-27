import { spawnSync } from "node:child_process";
import { ApiError } from "./api.js";
import { clearConfig, isSessionExpired, loadConfig, saveConfig } from "./config.js";
import type { ButacaConfig, Session } from "./config.js";

const AUTH_BASE = "https://www.cinemark.com.ar";
const TIMEOUT_MS = 15000;
const KEYCHAIN_SERVICE = "butaca";

export interface Credentials {
  email: string;
  password: string;
}

/**
 * `security` recibe cada argumento por separado, nunca interpolado en una
 * cadena de shell: así una contraseña con comillas o backticks no puede
 * escapar del campo que le corresponde.
 */
export function saveCredentialToKeychain(email: string, password: string): void {
  const result = spawnSync(
    "security",
    ["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", email, "-w", password, "-U"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `No se pudo guardar la contraseña en el keychain: ${result.stderr?.trim() || "error desconocido"}`,
      "Verificá que `security` esté disponible (macOS) y que tengas permiso de keychain.",
    );
  }
}

export function readCredentialFromKeychain(email: string): string | null {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", email, "-w"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function deleteCredentialFromKeychain(email: string): void {
  spawnSync("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", email], {
    encoding: "utf8",
  });
}

/**
 * Resuelve credenciales sin nunca pedir input por TTY: keychain primero (si
 * hay un email guardado en config), después el entorno. Si ninguna existe,
 * el que llama decide AUTH_REQUIRED en vez de colgarse.
 */
export function resolveCredentials(explicitEmail?: string): Credentials | null {
  const envEmail = process.env.BUTACA_EMAIL;
  const envPassword = process.env.BUTACA_PASSWORD;

  const email = explicitEmail ?? envEmail ?? loadConfig()?.email;
  if (!email) return null;

  const fromKeychain = readCredentialFromKeychain(email);
  if (fromKeychain) return { email, password: fromKeychain };

  if (envEmail === email && envPassword) return { email, password: envPassword };

  return null;
}

interface CsrfResponse {
  csrfToken: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; bodyText: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const bodyText = await response.text();
    return { response, bodyText };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        "NETWORK_ERROR",
        `Se agotó el tiempo de espera (${TIMEOUT_MS / 1000}s) esperando a Cinemark`,
        "Probá de nuevo en unos segundos.",
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError("NETWORK_ERROR", `No se pudo conectar: ${message}`, "Revisá tu conexión a internet.");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Cinemark emite `__Secure-next-auth.session-token` sobre HTTPS, no el nombre
 * pelado. Capturar el nombre completo en vez de reconstruirlo cubre las dos
 * variantes y cualquier prefijo que NextAuth agregue después.
 */
export function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = /((?:__Secure-|__Host-)?next-auth\.session-token)=([^;]+)/.exec(
    setCookieHeader,
  );
  return match?.[1] && match[2] ? `${match[1]}=${match[2]}` : null;
}

/**
 * Secuencia verificada en recon/auth-surface.md: CSRF primero, siempre, y
 * recién después el POST de callback. NextAuth rechaza el login sin el token
 * de la primera llamada.
 */
export async function login(email: string, password: string): Promise<Session> {
  const csrfResult = await fetchWithTimeout(`${AUTH_BASE}/api/auth/csrf`, { method: "GET" });
  if (!csrfResult.response.ok) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `No se pudo obtener el token CSRF (${csrfResult.response.status})`,
      "Puede ser un problema temporal del sitio de Cinemark.",
    );
  }

  let csrf: CsrfResponse;
  try {
    csrf = JSON.parse(csrfResult.bodyText) as CsrfResponse;
  } catch {
    throw new ApiError(
      "UPSTREAM_ERROR",
      "La respuesta de CSRF no se pudo interpretar como JSON",
      "Puede ser un cambio en el sitio de Cinemark.",
    );
  }

  const csrfCookie = extractCsrfCookie(csrfResult.response.headers.get("set-cookie"));

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: AUTH_BASE,
    json: "true",
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (csrfCookie) headers.cookie = csrfCookie;

  const loginResult = await fetchWithTimeout(`${AUTH_BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers,
    body: body.toString(),
    redirect: "manual",
  });

  if (loginResult.response.status === 401) {
    throw new ApiError(
      "AUTH_FAILED",
      "Cinemark rechazó el email o la contraseña",
      "Verificá las credenciales y probá de nuevo con `butaca auth login`.",
    );
  }

  const sessionCookie = extractSessionCookie(loginResult.response.headers.get("set-cookie"));
  if (!sessionCookie) {
    throw new ApiError(
      "AUTH_FAILED",
      "El login no devolvió una cookie de sesión",
      "Cinemark puede haber cambiado el flujo de NextAuth. Reportá este error si persiste.",
    );
  }

  // La cookie sola no sirve contra el BFF: vive en otro dominio. Lo que acepta
  // es `member-session-id`, y ese id sale de la sesión de NextAuth, no del
  // login. El `expires` de acá es el real (unas 24hs), bastante más corto que
  // el de la cookie (30 días), y es el que decide cuándo hay que re-loguearse.
  // `memberId` sale de la misma respuesta: se cachea acá para no pedirlo a
  // `/get-member` en cada comando que abra una orden.
  const { memberSessionId, memberId, expiresAt } = await fetchMemberSession(sessionCookie);
  return { cookie: sessionCookie, memberSessionId, memberId, expiresAt };
}

export function extractCookieExpiry(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = /next-auth\.session-token=[^;]+;[^\n]*?Expires=([^;]+)/i.exec(setCookieHeader);
  if (!match?.[1]) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function extractCsrfCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = /((?:__Secure-|__Host-)?next-auth\.csrf-token)=([^;]+)/.exec(
    setCookieHeader,
  );
  return match?.[1] && match[2] ? `${match[1]}=${match[2]}` : null;
}

interface NextAuthSession {
  user?: { memberSessionId?: string; memberId?: string | number; expires?: string };
  expires?: string;
}

async function fetchMemberSession(
  sessionCookie: string,
): Promise<{ memberSessionId: string; memberId: string; expiresAt: string }> {
  const result = await fetchWithTimeout(`${AUTH_BASE}/api/auth/session`, {
    method: "GET",
    headers: { cookie: sessionCookie },
  });

  let parsed: NextAuthSession;
  try {
    parsed = JSON.parse(result.bodyText) as NextAuthSession;
  } catch {
    throw new ApiError(
      "AUTH_FAILED",
      "La sesión de NextAuth no se pudo interpretar como JSON",
      "Puede ser un cambio en el sitio de Cinemark. Reportá este error si persiste.",
    );
  }

  const memberSessionId = parsed.user?.memberSessionId;
  if (!memberSessionId) {
    throw new ApiError(
      "AUTH_FAILED",
      "El login funcionó pero la sesión no trajo un memberSessionId",
      "Sin ese id el CLI no puede hablar con la API de compra. Reportá este error.",
    );
  }

  const memberId = parsed.user?.memberId;
  if (memberId === undefined || memberId === null || memberId === "") {
    throw new ApiError(
      "AUTH_FAILED",
      "El login funcionó pero la sesión no trajo un memberId",
      "Sin ese id order-tickets rechaza la orden. Reportá este error si persiste.",
    );
  }

  const expiresAt =
    parsed.user?.expires ??
    parsed.expires ??
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return { memberSessionId, memberId: String(memberId), expiresAt };
}

export function currentSession(): { config: ButacaConfig; session: Session } | null {
  const config = loadConfig();
  if (!config) return null;
  if (isSessionExpired(config.session)) return null;
  return { config, session: config.session };
}

export function persistSession(email: string, session: Session): void {
  saveConfig({ email, session });
}

export function logout(email: string | null): void {
  clearConfig();
  if (email) deleteCredentialFromKeychain(email);
}

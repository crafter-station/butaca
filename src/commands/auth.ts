import { createInterface } from "node:readline/promises";
import { promptPassword } from "../prompt.js";
import { stdin, stdout } from "node:process";
import { ApiError } from "../api.js";
import {
  currentSession,
  login,
  logout as clearSession,
  persistSession,
  resolveCredentials,
  saveCredentialToKeychain,
} from "../auth.js";
import { loadConfig } from "../config.js";
import { ok, printEnvelope, reportError } from "../format.js";
import type { Flags } from "../format.js";
import { bold, dim, green, red } from "../style.js";

export interface AuthLoginOptions {
  email: string | null;
  password: string | null;
}

/**
 * Sin TTY y sin credenciales resueltas (keychain o entorno), falla con
 * AUTH_REQUIRED en vez de colgarse esperando un `readline.question` que
 * nunca va a llegar.
 */
export async function runAuthLogin(
  opts: AuthLoginOptions,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  try {
    let email = opts.email;
    let password = opts.password;

    if (!email || !password) {
      const resolved = resolveCredentials(email ?? undefined);
      if (resolved) {
        email = resolved.email;
        password = resolved.password;
      }
    }

    if (!email || !password) {
      if (!stdin.isTTY || machineMode) {
        throw new ApiError(
          "AUTH_REQUIRED",
          "No hay credenciales disponibles y no hay una terminal para pedirlas",
          "Corré `butaca auth login` en una terminal interactiva, o definí BUTACA_EMAIL y BUTACA_PASSWORD.",
        );
      }
      if (!email) {
        const rl = createInterface({ input: stdin, output: stdout });
        try {
          email = (await rl.question("Email: ")).trim();
        } finally {
          rl.close();
        }
      }
      // La contraseña por separado y enmascarada: readline hace eco de cada
      // tecla, y eso la deja visible en la terminal y en cualquier grabación.
      if (!password) {
        password = (await promptPassword("Contraseña: ")) ?? "";
      }
    }

    if (!email || !password) {
      throw new ApiError(
        "AUTH_REQUIRED",
        "Falta email o contraseña",
        "Pasá ambos, o definí BUTACA_EMAIL y BUTACA_PASSWORD.",
      );
    }

    const session = await login(email, password);
    saveCredentialToKeychain(email, password);
    persistSession(email, session);

    if (machineMode) {
      printEnvelope(ok({ email, expiresAt: session.expiresAt }));
    } else {
      process.stdout.write(`${green("✓")} Sesión iniciada como ${bold(email)}.\n`);
      process.stdout.write(`${dim(`Vence: ${session.expiresAt}`)}\n`);
    }
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError ? err : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

export function runAuthStatus(machineMode: boolean): number {
  const session = currentSession();
  if (!session) {
    const config = loadConfig();
    const hint = config
      ? "La sesión venció. Corré `butaca auth login`."
      : "No hay sesión. Corré `butaca auth login`.";
    const code = config ? "AUTH_EXPIRED" : "AUTH_REQUIRED";
    return reportError(machineMode, new ApiError(code, "No hay sesión activa", hint));
  }

  if (machineMode) {
    printEnvelope(ok({ email: session.config.email, expiresAt: session.session.expiresAt }));
    return 0;
  }

  process.stdout.write(`${green("✓")} Sesión activa como ${bold(session.config.email)}.\n`);
  process.stdout.write(`${dim(`Vence: ${session.session.expiresAt}`)}\n`);
  return 0;
}

export function runAuthLogout(machineMode: boolean): number {
  const config = loadConfig();
  clearSession(config?.email ?? null);

  if (machineMode) {
    printEnvelope(ok({ loggedOut: true }));
    return 0;
  }

  process.stdout.write(`${red("✓")} Sesión y credenciales borradas.\n`);
  return 0;
}

import { ApiError } from "../api.js";
import { ok, printEnvelope, reportError } from "../format.js";
import { prefsPath } from "../config.js";
import { loadPrefs, setPref, unsetPref } from "../prefs.js";
import { findProvider, listProviders } from "../providers.js";
import { bold, dim, green } from "../style.js";
import type { Prefs } from "../prefs.js";

const CLAVES = ["cine", "cadena"] as const;
type Clave = (typeof CLAVES)[number];

function esClave(v: string): v is Clave {
  return (CLAVES as readonly string[]).includes(v);
}

/**
 * `config set cine palermo` evita repetir `--cine` en cada comando, que era la
 * fricción diaria más obvia del CLI. El flag sigue ganando sobre lo guardado,
 * así que un script no queda a merced de la configuración de quien lo corre.
 */
export function runConfig(accion: string | null, clave: string | null, valor: string | null, machineMode: boolean): number {
  if (accion === null || accion === "get" || accion === "list") {
    const prefs = loadPrefs();
    if (machineMode) {
      printEnvelope(ok({ ...prefs, path: prefsPath() }));
      return 0;
    }
    const filas = CLAVES.map((k) => `  ${bold(k.padEnd(8))}${prefs[k] ?? dim("(sin definir)")}`);
    process.stdout.write(`${filas.join("\n")}\n\n${dim(prefsPath())}\n`);
    return 0;
  }

  if (accion !== "set" && accion !== "unset") {
    return reportError(
      machineMode,
      new ApiError("BAD_INPUT", `config no conoce la acción "${accion}"`, "Usá: butaca config set|unset|get"),
    );
  }

  if (!clave || !esClave(clave)) {
    return reportError(
      machineMode,
      new ApiError("BAD_INPUT", `config no conoce la clave "${clave ?? ""}"`, `Claves: ${CLAVES.join(", ")}`),
    );
  }

  if (accion === "unset") {
    const prefs = unsetPref(clave);
    if (machineMode) printEnvelope(ok(prefs as Prefs));
    else process.stdout.write(`${green("✓")} ${clave} borrada\n`);
    return 0;
  }

  if (!valor) {
    return reportError(
      machineMode,
      new ApiError("BAD_INPUT", `config set ${clave} necesita un valor`, `Ejemplo: butaca config set ${clave} palermo`),
    );
  }

  // Una cadena inexistente se rechaza al guardarla, no al usarla: guardar un
  // valor inválido deja el CLI roto en el próximo comando, lejos de la causa.
  if (clave === "cadena" && !findProvider(valor)) {
    return reportError(
      machineMode,
      new ApiError(
        "BAD_INPUT",
        `No conozco la cadena "${valor}"`,
        `Disponibles: ${listProviders().map((p) => p.id).join(", ")}. Vé la lista con \`butaca cadenas\`.`,
      ),
    );
  }

  const prefs = setPref(clave, valor);
  if (machineMode) {
    printEnvelope(ok(prefs as Prefs));
  } else {
    process.stdout.write(`${green("✓")} ${clave} = ${bold(valor)}\n`);
  }
  return 0;
}

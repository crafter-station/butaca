#!/usr/bin/env node
import { ApiError } from "./api.js";
import { ArgParseError, isKnownCommand, knownCommands, parseArgs } from "./args.js";
import type { ParsedArgs } from "./args.js";
import { runCartelera } from "./commands/cartelera.js";
import { runCines } from "./commands/cines.js";
import { runFunciones } from "./commands/funciones.js";
import { runSchema } from "./commands/schema.js";
import { fetchTheaters } from "./api.js";
import { printBanner } from "./foundation/banner.js";
import { ok, printEnvelope, resolveMachineMode, reportError } from "./format.js";
import type { Flags } from "./format.js";

const VERSION = "0.1.0";

const HELP_TEXT = `butaca, cartelera y funciones de Cinemark Argentina

Uso:
  butaca cines
  butaca cartelera [--cine <slug>]
  butaca funciones --cine <slug> [--peli <slug>] [--fecha YYYY-MM-DD]
                    [--formato 2D|3D|XD|DBOX|4D|PREMIER] [--idioma SUB|CASTELLANO]
                    [--libres <n>]
  butaca <cine-slug>                 atajo de "butaca funciones --cine <slug>"
  butaca schema [comando]

Opciones globales:
  --json           fuerza salida JSON aunque haya TTY
  --fields <a,b>   sólo estos campos en la salida
  --no-cache       no-op salvo en funciones, donde es el comportamiento por defecto
  --help, -h       esta ayuda
  --version, -v    versión

Ejemplos:
  butaca cines
  butaca cartelera --cine palermo
  butaca funciones --cine palermo --peli toy-story-5 --libres 20
  butaca palermo
`;

function toFlags(args: ParsedArgs): Flags {
  return {
    json: args.json,
    noCache: args.noCache,
    help: args.help,
    version: args.version,
    fields: args.fields,
  };
}

function validateFecha(fecha: string | null): string | null {
  if (fecha === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new ArgParseError("--fecha necesita el formato YYYY-MM-DD");
  }
  return fecha;
}

async function resolveShorthand(token: string): Promise<boolean> {
  const theaters = await fetchTheaters();
  return theaters.some((t) => t.slug === token);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const message = err instanceof ArgParseError ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const flags = toFlags(args);
  const machineMode = resolveMachineMode(flags);

  if (args.version) {
    if (machineMode) {
      printEnvelope(ok({ version: VERSION }));
    } else {
      process.stdout.write(`butaca ${VERSION}\n`);
    }
    return 0;
  }

  if (args.help || args.command === null) {
    if (!machineMode) {
      printBanner({
        name: "butaca",
        tagline: "Cartelera y butacas de Cinemark Argentina",
        version: VERSION,
        gradient: ["#E4322B", "#7A1410"],
      });
    }
    // --help pedido explícitamente es la salida del comando y va a stdout.
    // Sin comando es un error de uso: va a stderr para no ensuciar un pipe.
    const bareInvoke = args.command === null && !args.help;
    if (bareInvoke) {
      process.stderr.write(HELP_TEXT);
      return 1;
    }
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const command = args.command;

  if (!isKnownCommand(command)) {
    const isShorthand = await resolveShorthand(command).catch(() => false);
    if (isShorthand) {
      try {
        const fecha = validateFecha(args.fecha);
        return await runFunciones(
          {
            cine: command,
            peli: args.peli,
            fecha,
            formato: args.formato,
            idioma: args.idioma,
            libres: args.libres,
          },
          flags,
          machineMode,
        );
      } catch (err) {
        const message = err instanceof ArgParseError ? err.message : String(err);
        return reportError(
          machineMode,
          new ApiError("BAD_INPUT", message, "Revisá los argumentos pasados."),
        );
      }
    }
    process.stderr.write(
      `Error: comando desconocido "${command}"\n` +
        `Comandos válidos: ${knownCommands().join(", ")}, o un slug de cine.\n`,
    );
    return 1;
  }

  switch (command) {
    case "cines":
      return runCines(flags, machineMode);

    case "cartelera":
      return runCartelera({ cine: args.cine }, flags, machineMode);

    case "funciones": {
      if (!args.cine) {
        return reportError(
          machineMode,
          new ApiError(
            "BAD_INPUT",
            "funciones necesita --cine <slug>",
            "Corré `butaca cines` para ver los slugs disponibles.",
          ),
        );
      }
      try {
        const fecha = validateFecha(args.fecha);
        return await runFunciones(
          {
            cine: args.cine,
            peli: args.peli,
            fecha,
            formato: args.formato,
            idioma: args.idioma,
            libres: args.libres,
          },
          flags,
          machineMode,
        );
      } catch (err) {
        const message = err instanceof ArgParseError ? err.message : String(err);
        return reportError(
          machineMode,
          new ApiError("BAD_INPUT", message, "Revisá los argumentos pasados."),
        );
      }
    }

    case "schema":
      return runSchema(args.positional[0] ?? null, machineMode);

    default:
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error inesperado: ${message}\n`);
    process.exitCode = 2;
  });

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  json: boolean;
  noCache: boolean;
  help: boolean;
  version: boolean;
  fields: string[] | null;
  cine: string | null;
  peli: string | null;
  fecha: string | null;
  formato: string | null;
  idioma: string | null;
  libres: number | null;
}

const KNOWN_COMMANDS = ["cines", "cartelera", "funciones", "schema"];

export class ArgParseError extends Error {}

function takesValue(flag: string): boolean {
  return [
    "--cine",
    "--peli",
    "--fecha",
    "--formato",
    "--idioma",
    "--libres",
    "--fields",
  ].includes(flag);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    positional: [],
    json: false,
    noCache: false,
    help: false,
    version: false,
    fields: null,
    cine: null,
    peli: null,
    fecha: null,
    formato: null,
    idioma: null,
    libres: null,
  };

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) {
      i += 1;
      continue;
    }

    if (token === "--json") {
      result.json = true;
      i += 1;
      continue;
    }
    if (token === "--no-cache") {
      result.noCache = true;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      result.help = true;
      i += 1;
      continue;
    }
    if (token === "--version" || token === "-v") {
      result.version = true;
      i += 1;
      continue;
    }

    if (token.startsWith("--") && takesValue(token)) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new ArgParseError(`La opción ${token} necesita un valor`);
      }
      switch (token) {
        case "--cine":
          result.cine = value;
          break;
        case "--peli":
          result.peli = value;
          break;
        case "--fecha":
          result.fecha = value;
          break;
        case "--formato":
          result.formato = value;
          break;
        case "--idioma":
          result.idioma = value;
          break;
        case "--fields":
          result.fields = value.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
          break;
        case "--libres": {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed < 0) {
            throw new ArgParseError("--libres necesita un número entero mayor o igual a 0");
          }
          result.libres = parsed;
          break;
        }
        default:
          break;
      }
      i += 2;
      continue;
    }

    if (token.startsWith("--")) {
      throw new ArgParseError(`Opción desconocida: ${token}`);
    }

    if (result.command === null) {
      result.command = token;
    } else {
      result.positional.push(token);
    }
    i += 1;
  }

  return result;
}

export function isKnownCommand(command: string): boolean {
  return KNOWN_COMMANDS.includes(command);
}

export function knownCommands(): readonly string[] {
  return KNOWN_COMMANDS;
}

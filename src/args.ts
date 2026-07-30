import { ApiError } from "./api.js";

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  json: boolean;
  noCache: boolean;
  todas: boolean;
  todos: boolean;
  open: boolean;
  numeros: boolean;
  help: boolean;
  version: boolean;
  dryRun: boolean;
  yes: boolean;
  fields: string[] | null;
  cine: string | null;
  peli: string | null;
  fecha: string | null;
  formato: string | null;
  idioma: string | null;
  libres: number | null;
  asientos: string[] | null;
  asignada: boolean;
  orden: number | null;
  email: string | null;
  password: string | null;
}

const KNOWN_COMMANDS = [
  "cines",
  "cartelera",
  "funciones",
  "estrenos",
  "schema",
  "auth",
  "butacas",
  "reservar",
  "cadenas",
  "config",
];

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
    "--asientos",
    "--orden",
    "--email",
    "--password",
  ].includes(flag);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    positional: [],
    json: false,
    noCache: false,
    todas: false,
    todos: false,
    open: false,
    numeros: false,
    help: false,
    version: false,
    dryRun: false,
    yes: false,
    fields: null,
    cine: null,
    peli: null,
    fecha: null,
    formato: null,
    idioma: null,
    libres: null,
    asientos: null,
    asignada: false,
    orden: null,
    email: null,
    password: null,
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
    if (token === "--todas") {
      result.todas = true;
      i += 1;
      continue;
    }
    if (token === "--numeros") {
      result.numeros = true;
      i += 1;
      continue;
    }
    if (token === "--open") {
      result.open = true;
      i += 1;
      continue;
    }
    if (token === "--todos") {
      result.todos = true;
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
    if (token === "--dry-run") {
      result.dryRun = true;
      i += 1;
      continue;
    }
    if (token === "--yes") {
      result.yes = true;
      i += 1;
      continue;
    }
    if (token === "--asignada") {
      result.asignada = true;
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
        case "--orden": {
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) {
            throw new ApiError("BAD_INPUT", `--orden espera el transIdTemp que devuelve butacas, recibió "${value}"`, "Sale de `butaca butacas ... --json` en data.transIdTemp.");
          }
          result.orden = n;
          break;
        }
        case "--asientos":
          result.asientos = value.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
          break;
        case "--email":
          result.email = value;
          break;
        case "--password":
          result.password = value;
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

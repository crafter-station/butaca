#!/usr/bin/env node
import { ApiError, setNoCache } from "./api.js";
import { ArgParseError, isKnownCommand, knownCommands, parseArgs } from "./args.js";
import { runCadenas } from "./commands/cadenas.js";
import { runConfig } from "./commands/config.js";
import { cadenaEfectiva, cineEfectivo } from "./prefs.js";
import { resolveProvider, setInvocacion } from "./providers.js";
import type { Provider } from "./providers.js";
import type { ParsedArgs } from "./args.js";
import { runAuthLogin, runAuthLogout, runAuthStatus } from "./commands/auth.js";
import { runButacas } from "./commands/butacas.js";
import { runCartelera } from "./commands/cartelera.js";
import { runCines } from "./commands/cines.js";
import { runEstrenos } from "./commands/estrenos.js";
import { resolveRelativeDate, runElegir } from "./commands/elegir.js";
import { runFunciones } from "./commands/funciones.js";
import { runReservar } from "./commands/reservar.js";
import { runRecomendar } from "./commands/recomendar.js";
import { runSchema } from "./commands/schema.js";
import { fetchTheaters } from "./api.js";
import { fetchCities } from "./api-graphql.js";
import { printBanner } from "./foundation/banner.js";
import { ok, printEnvelope, resolveMachineMode, reportError, setSource } from "./format.js";
import type { Flags } from "./format.js";
import { blue, bold, dim, errBold, errDim, errRed, italic, padVisible, underline } from "./style.js";

const VERSION = "0.3.3";

/** Comando en bold, flags en azul, placeholders en cursiva tenue. */
function uso(comando: string, resto = "", nota = ""): string {
  const flags = resto
    .replace(/(--[a-z-]+)/g, (m) => blue(m))
    .replace(/(<[a-z-]+>|YYYY-MM-DD|\bn\b)/g, (m) => italic(dim(m)));
  const linea = `  ${bold(comando)}${flags ? ` ${flags}` : ""}`;
  return nota ? `${padVisible(linea, 54)}${dim(nota)}` : linea;
}

function opcion(flag: string, desc: string): string {
  return `  ${padVisible(blue(flag), 18)}${dim(desc)}`;
}

const helpText = (): string => `${dim("Cartelera, funciones y disponibilidad de butacas de Cinemark Argentina.")}

${bold(underline("Uso"))}
${uso("butaca cines", "", "los 24 complejos")}
${uso("butaca cartelera", "[--cine <slug>]", "qué se está dando")}
${uso("butaca funciones", "--cine <slug> [--peli <slug>]", "horarios y butacas libres")}
${uso("", "[--fecha YYYY-MM-DD] [--libres <n>]")}
${uso("", "[--formato 2D|3D|XD|DBOX|4D|PREMIER]")}
${uso("", "[--idioma SUB|CASTELLANO] [--todas]")}
${uso("butaca estrenos", "[--cine <slug>] [--todos]", "preventa y próximos")}
${uso("butaca estrenos <peli>", "[--cine <slug>]", "un estreno, con ventas")}
${uso("butaca estrenos --peli <slug>", "", "idem, con el flag del resto")}
${uso("butaca recomendar <película>", "", "mejor función y asientos juntos")}
${uso("", "--cine <slug> --fecha mañana [--personas n]")}
${uso("", "[--formato 2D] [--idioma SUB]")}
${uso("butaca elegir <película>", "...", "recomienda y hace hold")}
${uso("butaca <cine-slug>", "", 'atajo de "funciones --cine"')}
${uso("butaca schema", "[comando]", "shapes JSON, para agentes")}
${uso("butaca cadenas", "", "qué cadenas de cine soporta")}
${uso("butaca config set", "cine <slug>", "tu cine por defecto, deja de repetir --cine")}

${bold(underline("Cuenta (requiere sesión)"))}
${uso("butaca auth login", "[--email <e>]", "guarda credenciales, abre sesión")}
${uso("butaca auth status", "", "¿hay sesión? ¿de quién? ¿vence cuándo?")}
${uso("butaca auth logout", "", "borra sesión y credenciales")}
${uso("butaca butacas", "<sessionId> --cine <slug>", "dibuja el mapa de asientos")}
${uso("", "[--dry-run]", "no abre orden, explica qué haría")}

${dim("  reservar existe y toma inventario real, pero el pago no se puede")}
${dim("  completar desde acá: Cinemark guarda el carrito en el navegador, no")}
${dim("  en la cuenta. Elegí en el sitio. Detalle: butaca reservar --help")}

${bold(underline("Opciones"))}
${opcion("--json", "fuerza salida JSON aunque haya TTY")}
${opcion("--todas", "en funciones, todos los días y no sólo el primero")}
${opcion("--todos", "en estrenos, todas las fechas de próximos estrenos")}
${opcion("--fields <a,b>", "sólo estos campos en la salida")}
${opcion("--no-cache", "saltea el caché de 60s del CDN en todos los pedidos")}
${opcion("--open", "abre el link de compra en el navegador")}
${opcion("--numeros", "en butacas, muestra el número de cada asiento")}
${opcion("--dry-run", "en butacas/reservar/elegir/recomendar, no hace el write final")}
${opcion("--yes", "en reservar/elegir/recomendar, saltea la confirmación")}
${opcion("--preflight", "en elegir/recomendar, valida precio sin abrir una orden")}
${opcion("--mejor-asiento", "en elegir/recomendar, explicita el ranking central")}
${opcion("--personas <n>", "alias de --cantidad para recomendar")}
${opcion("--help, -h", "esta ayuda")}
${opcion("--version, -v", "versión")}

${bold(underline("Ejemplos"))}
  ${dim("$")} ${bold("butaca")} palermo${padVisible("", 22)}${dim("qué dan hoy en Palermo")}
  ${dim("$")} ${bold("butaca")} funciones ${blue("--cine")} palermo ${blue("--libres")} 100
  ${dim("$")} ${bold("butaca")} cines ${blue("--json")} | jq ${italic("'.data[].slug'")}

${dim(`Cartelera, horarios y butacas libres, sin cuenta. Ver el mapa y reservar
sí requiere tu cuenta: \`butaca auth login\`. El pago se hace en el sitio;
butaca no lo automatiza.
Docs: ${underline("github.com/crafter-station/butaca")}`)}
`;

function toFlags(args: ParsedArgs): Flags {
  return {
    json: args.json,
    noCache: args.noCache,
    todas: args.todas,
    todos: args.todos,
    open: args.open,
    numeros: args.numeros,
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

async function resolveShorthand(provider: Provider, token: string): Promise<boolean> {
  // El atajo `butaca <cine>` tiene que reconocer los slugs de la cadena activa,
  // no siempre los de Cinemark.
  if (provider.kind === "graphql") {
    const cities = await fetchCities(provider);
    return cities.some((c) => c.cinemas.some((x) => x.id === token));
  }
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
    const machineMode = argv.includes("--json") || !process.stdout.isTTY;
    return reportError(
      machineMode,
      new ApiError("BAD_INPUT", message, "Revisá los argumentos pasados."),
    );
  }

  const flags = toFlags(args);
  const machineMode = resolveMachineMode(flags);
  setNoCache(flags.noCache);

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
      process.stderr.write(helpText());
      return 1;
    }
    process.stdout.write(helpText());
    return 0;
  }

  const command = args.command;

  // La cadena se resuelve una sola vez, antes de cualquier pedido. Acá es donde
  // se rechaza una cadena sin recon o un runtime que su servidor no acepta: el
  // usuario ve el motivo en vez de un error de red a mitad de camino.
  let provider: Provider;
  try {
    // Sin --cadena, la cadena salió de la preferencia guardada: el mensaje de
    // error tiene que decir cómo revertirla, no cómo pasar un flag.
    provider = resolveProvider(cadenaEfectiva(args.cadena), args.cadena === null);
    // El envelope publica de dónde salieron los datos; sin esto toda respuesta
    // decía el host de Cinemark, incluidas las de otra cadena.
    setSource(new URL(provider.apiBase).host);
    // Los comandos que el CLI imprime tienen que poder copiarse y andar.
    setInvocacion(provider);
  } catch (err) {
    return reportError(
      machineMode,
      new ApiError(
        "BAD_INPUT",
        err instanceof Error ? err.message : String(err),
        "Corré `butaca cadenas` para ver las disponibles.",
      ),
    );
  }

  if (!isKnownCommand(command)) {
    const isShorthand = await resolveShorthand(provider, command).catch(() => false);
    if (isShorthand) {
      try {
        const fecha = validateFecha(args.fecha);
        return await runFunciones(
          provider,
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
      `${errRed("Error")} comando desconocido ${errBold(`"${command}"`)}\n` +
        `  ${errDim(`Comandos válidos: ${knownCommands().join(", ")}, o un slug de cine.`)}\n`,
    );
    return 1;
  }

  // El flag gana, después la variable de entorno, después lo guardado en
  // `butaca config set cine`. Sin esto había que repetir --cine en cada llamada,
  // que es la fricción diaria más obvia del CLI. La cadena activa entra para que
  // un cine guardado de otra cadena no se aplique como filtro y devuelva vacío.
  const cine = cineEfectivo(args.cine, provider.id);

  switch (command) {
    case "cadenas":
      return runCadenas(machineMode);

    case "config":
      return runConfig(args.positional[0] ?? null, args.positional[1] ?? null, args.positional[2] ?? null, machineMode);

    case "cines":
      return runCines(provider, flags, machineMode);

    case "cartelera":
      return runCartelera(provider, { cine: cine }, flags, machineMode);

    case "funciones": {
      if (!cine) {
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
          provider,
          {
            cine: cine,
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

    case "estrenos":
      // --peli es sinónimo del posicional: la salida de este mismo comando
      // imprime `--peli <slug>` en cada tarjeta, así que tiene que funcionar
      // pegado tal cual. El posicional gana si vienen los dos.
      return runEstrenos(
        { cine: cine, busqueda: args.positional[0] ?? args.peli },
        flags,
        machineMode,
      );

    case "elegir": {
      try {
        return await runElegir(
          {
            busqueda: args.positional.join(" ") || args.peli || "",
            cine,
            fecha: resolveRelativeDate(args.fecha),
            formato: args.formato,
            idioma: args.idioma,
            cantidad: args.cantidad,
            dryRun: args.dryRun,
            preflight: args.preflight,
            yes: args.yes,
            hold: true,
          },
          flags,
          machineMode,
        );
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError("BAD_INPUT", String(error), "Revisá los argumentos pasados.");
        return reportError(machineMode, apiError);
      }
    }

    case "recomendar": {
      try {
        return await runRecomendar(
          {
            busqueda: args.positional.join(" ") || args.peli || "",
            cine,
            fecha: resolveRelativeDate(args.fecha),
            formato: args.formato,
            idioma: args.idioma,
            cantidad: args.cantidad,
            dryRun: args.dryRun,
            preflight: args.preflight,
            yes: args.yes,
          },
          flags,
          machineMode,
        );
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError("BAD_INPUT", String(error), "Revisá los argumentos pasados.");
        return reportError(machineMode, apiError);
      }
    }

    case "schema":
      return runSchema(args.positional[0] ?? null, machineMode);

    case "auth": {
      const sub = args.positional[0];
      switch (sub) {
        case "login":
          return runAuthLogin({ email: args.email, password: args.password }, flags, machineMode);
        case "status":
          return runAuthStatus(machineMode);
        case "logout":
          return runAuthLogout(machineMode);
        default:
          return reportError(
            machineMode,
            new ApiError(
              "BAD_INPUT",
              `Subcomando de auth desconocido: "${sub ?? ""}"`,
              "Comandos válidos: auth login, auth status, auth logout.",
            ),
          );
      }
    }

    case "butacas": {
      const sessionId = args.positional[0];
      if (!sessionId) {
        return reportError(
          machineMode,
          new ApiError("BAD_INPUT", "butacas necesita un sessionId", "Ejemplo: butaca butacas 159037 --cine palermo"),
        );
      }
      return runButacas(provider, { sessionId, cine: cine, dryRun: args.dryRun }, flags, machineMode);
    }

    case "reservar": {
      const sessionId = args.positional[0];
      if (!sessionId) {
        return reportError(
          machineMode,
          new ApiError(
            "BAD_INPUT",
            "reservar necesita un sessionId",
            "Ejemplo: butaca reservar 159037 --cine palermo --asientos 7-12",
          ),
        );
      }
      return runReservar(
        {
          sessionId,
          cine: cine,
          asientos: args.asientos ?? [],
          asignada: args.asignada,
          orden: args.orden,
          dryRun: args.dryRun,
          yes: args.yes,
        },
        flags,
        machineMode,
      );
    }

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
    process.stderr.write(`${errRed("Error inesperado")} ${message}\n`);
    process.exitCode = 2;
  });

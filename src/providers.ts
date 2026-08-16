/**
 * Registro de cadenas. La superficie de cada una se descubre con recon y se
 * declara acá; el resto del CLI no debería nombrar una cadena nunca.
 *
 * El header `country` NO sirve para esto: el BFF de Cinemark Argentina responde
 * 200 a `country: PE`, `CL` y `BR`, y devuelve siempre los mismos 24 cines
 * argentinos (verificado 2026-07-29). Es decorativo, así que cada cadena
 * necesita su propia entrada con su host.
 */

import { isBun, runtimeName } from "./runtime.js";

export interface Provider {
  /** Slug estable, el que el usuario pasa a --cadena y guarda en config. */
  id: string;
  name: string;
  country: string;
  /** Etiqueta corta para listados: "Argentina", "Perú". */
  countryName: string;
  /**
   * Forma de la API. Decide el transporte: `rest` va por `api.ts`, `graphql`
   * por `api-graphql.ts`. No es un detalle de implementación — cambia qué
   * módulo atiende cada comando.
   */
  kind: "rest" | "graphql";
  /** Base del BFF, sin barra final. */
  apiBase: string;
  /** Origen del sitio, para links y para el flujo de auth. */
  siteBase: string;
  /** Valor del header `country` que el upstream espera. */
  countryHeader: string;
  /** Token de canal de venta, necesario para abrir órdenes. */
  salesChannelToken?: string;
  /**
   * Clave de cliente embebida en el bundle público del sitio. Distinta en
   * propósito de `salesChannelToken`: esa abre órdenes, esta autoriza *toda*
   * lectura (sin ella el gateway responde 401).
   */
  apiKey?: string;
  /**
   * `true` cuando leer el mapa de butacas obliga a abrir una orden en el sistema
   * del tercero. Es lo que decide si `butacas` es read-only (CONTRACT.md) o
   * write-soft con trust ladder (CONTRACT-AUTH.md), así que vive en el registro
   * y no en el comando.
   */
  seatsRequireOrder: boolean;
  /**
   * Runtime exigido por el upstream, cuando su edge rechaza a los demás.
   * `undefined` = anda en cualquiera. Ver `runtime.ts` para la medición.
   */
  requiresRuntime?: "bun";
  /**
   * `verified` = mapeado contra la API real y con tests.
   * `planned` = la cadena existe, su superficie todavía no se pudo mapear.
   */
  status: "verified" | "planned";
  /** Por qué no está verificado, si aplica. Se muestra al usuario. */
  nota?: string;
}

const CINEMARK_AR: Provider = {
  id: "cinemark-ar",
  name: "Cinemark Hoyts",
  country: "AR",
  countryName: "Argentina",
  kind: "rest",
  apiBase: "https://bff.cinemark.com.ar/api",
  siteBase: "https://www.cinemark.com.ar",
  countryHeader: "AR",
  // Sale del bundle del sitio, no de un doc: verificado en uso real contra
  // order-tickets y get-prices, que fallan con 500 sin él.
  salesChannelToken: "d792f0f7def937524c47b6e5036b70085302d9df18a7dfc48478ce3d2de4bef9",
  // Leer el mapa de butacas exige abrir una orden, así que `butacas` acá es
  // write-soft y vive bajo CONTRACT-AUTH.md.
  seatsRequireOrder: true,
  status: "verified",
};

const CINEPOLIS_AR: Provider = {
  id: "cinepolis-ar",
  name: "Cinépolis",
  country: "AR",
  countryName: "Argentina",
  kind: "graphql",
  apiBase: "https://api-g.cinepolis.com",
  siteBase: "https://cinepolis.com/ar",
  // El gateway acepta el header `country-id`, pero es decorativo: verificado
  // 200 con datos correctos sin mandarlo. Se manda igual porque es lo que manda
  // el sitio.
  countryHeader: "AR",
  // Pública y embebida en el bundle del sitio. Obligatoria: sin ella el gateway
  // responde 401 {"message":"Unauthorized access."}.
  apiKey: "lQM6Mkvri1iHksKKCfpAiwGXq0YUZA7Nn6XAXRPr4i13LwXo",
  // El hallazgo que separa a esta cadena de Cinemark: el mapa de butacas se lee
  // con una query anónima sobre sessionId, sin abrir orden y sin cuenta.
  // Verificado en 7 funciones de 2 cines, uno de ellos nunca visitado en la web.
  seatsRequireOrder: false,
  requiresRuntime: "bun",
  status: "verified",
};

const CINEPLANET_PE: Provider = {
  id: "cineplanet-pe",
  name: "Cineplanet",
  country: "PE",
  countryName: "Perú",
  // Sin verificar: son los hosts que el sitio usaría, no endpoints probados.
  // No se llaman hasta que el recon los confirme.
  kind: "rest",
  apiBase: "",
  siteBase: "https://www.cineplanet.com.pe",
  countryHeader: "PE",
  seatsRequireOrder: true,
  status: "planned",
  nota: "Su CDN responde 403 a todo pedido desde fuera de Perú (verificado con curl y navegador). Falta correr el recon desde una conexión peruana.",
};

const PROVIDERS: Provider[] = [CINEMARK_AR, CINEPOLIS_AR, CINEPLANET_PE];

export const DEFAULT_PROVIDER_ID = CINEMARK_AR.id;

export function listProviders(): Provider[] {
  return [...PROVIDERS];
}

export function findProvider(id: string): Provider | null {
  return PROVIDERS.find((p) => p.id === id.toLowerCase()) ?? null;
}

/**
 * Resuelve la cadena a usar y falla con un mensaje accionable si no se puede.
 * Una cadena `planned` se rechaza acá y no en medio de un fetch: el usuario
 * merece saber que falta el recon, no ver un error de red.
 *
 * El chequeo de runtime vive acá por lo mismo. Bajo Node, Cinépolis devolvería
 * un 403 de Cloudflare que se lee como "la API está caída" y manda al usuario a
 * revisar su conexión. Fallar antes del request convierte eso en una
 * instrucción.
 */
export function resolveProvider(id: string, esCadenaGuardada = false): Provider {
  const p = findProvider(id);
  if (!p) {
    const ids = PROVIDERS.map((x) => x.id).join(", ");
    throw new Error(`No conozco la cadena "${id}". Disponibles: ${ids}.`);
  }
  if (p.status === "planned") {
    throw new Error(`${p.name} (${p.countryName}) todavía no está soportada. ${p.nota ?? ""}`.trim());
  }
  if (p.requiresRuntime === "bun" && !isBun()) {
    throw new Error(mensajeRuntimeFaltante(p, runtimeName(), esCadenaGuardada));
  }
  return p;
}

/**
 * Invocación con la que se imprimen los comandos sugeridos.
 *
 * Un comando que el CLI imprime tiene una sola función: que se copie y ande. El
 * usuario lo pega en otra terminal, donde `butaca` es el binario instalado, y
 * ese binario tiene shebang de Node. Así que la invocación impresa depende de lo
 * que la **cadena exige**, no de bajo qué runtime estamos corriendo ahora.
 *
 * Es la distinción que rompió 0.3.4: se quitó el prefijo razonando que "bajo Bun
 * sobra". No sobra. Bajo Bun el comando sale bien acá y falla cuando se pega en
 * una terminal donde `butaca` vuelve a ser Node, que es el único lugar donde el
 * usuario lo va a usar.
 *
 * Dos piezas:
 *  - prefijo: `bun --bun x butaca` cuando la cadena declara `requiresRuntime`.
 *    `bun x` no alcanza, respeta el shebang y cae en Node otra vez.
 *  - sufijo `--cadena`: sin él el comando corre contra la cadena por defecto y
 *    devuelve otra cosa, o un NOT_FOUND si el slug pertenece a esta.
 */
let prefijoComando = "butaca";
let sufijoCadena = "";

export function setInvocacion(p: Provider): void {
  prefijoComando = p.requiresRuntime === "bun" ? "bun --bun x butaca" : "butaca";
  sufijoCadena = p.id === DEFAULT_PROVIDER_ID ? "" : ` --cadena ${p.id}`;
}

/** Arma un comando listo para copiar: runtime correcto y cadena explícita. */
export function comando(resto: string): string {
  return `${prefijoComando} ${resto}${sufijoCadena}`;
}

/**
 * Texto del bloqueo por runtime. Vive aparte de `resolveProvider` para que el
 * test pueda verificar el mensaje real: la suite corre bajo Bun, que es
 * justamente el runtime que pasa, así que la rama del `throw` nunca se ejecuta
 * acá y un test que reescribiera el texto a mano quedaría verde para siempre.
 */
export function mensajeRuntimeFaltante(
  p: Provider,
  runtimeActual: string,
  esCadenaGuardada = false,
): string {
  // Si la cadena viene de la preferencia guardada y no de un flag, el usuario
  // no la pidió en este comando: cada invocación suya, incluso `butaca cines`,
  // choca con esto hasta que la cambie. Decirle "usá --cadena" no lo saca del
  // estado; decirle cómo revertir la preferencia sí.
  const salida = esCadenaGuardada
    ? `Volvé a la cadena anterior con: butaca config set cadena ${DEFAULT_PROVIDER_ID}`
    : `Para seguir sin instalar nada: butaca --cadena ${DEFAULT_PROVIDER_ID}`;
  return (
    `${p.name} necesita Bun y estás en ${runtimeActual}. ` +
    `Su servidor rechaza a cualquier otro cliente antes de responder, así que no es algo que el CLI pueda sortear. ` +
    // `bun x butaca` NO alcanza: respeta el shebang del paquete (#!/usr/bin/env
    // node) y termina corriendo bajo Node otra vez, o sea de vuelta en este
    // mismo error. El flag `--bun` es el que fuerza el runtime.
    `Instalá Bun con: curl -fsSL https://bun.sh/install | bash — después corré el mismo comando con "bun --bun x butaca". ` +
    salida
  );
}

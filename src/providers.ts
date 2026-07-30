/**
 * Registro de cadenas. La superficie de cada una se descubre con recon y se
 * declara acá; el resto del CLI no debería nombrar una cadena nunca.
 *
 * El header `country` NO sirve para esto: el BFF de Cinemark Argentina responde
 * 200 a `country: PE`, `CL` y `BR`, y devuelve siempre los mismos 24 cines
 * argentinos (verificado 2026-07-29). Es decorativo, así que cada cadena
 * necesita su propia entrada con su host.
 */
export interface Provider {
  /** Slug estable, el que el usuario pasa a --cadena y guarda en config. */
  id: string;
  name: string;
  country: string;
  /** Etiqueta corta para listados: "Argentina", "Perú". */
  countryName: string;
  /** Base del BFF, sin barra final. */
  apiBase: string;
  /** Origen del sitio, para links y para el flujo de auth. */
  siteBase: string;
  /** Valor del header `country` que el upstream espera. */
  countryHeader: string;
  /** Token de canal de venta, necesario para abrir órdenes. */
  salesChannelToken?: string;
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
  apiBase: "https://bff.cinemark.com.ar/api",
  siteBase: "https://www.cinemark.com.ar",
  countryHeader: "AR",
  // Sale del bundle del sitio, no de un doc: verificado en uso real contra
  // order-tickets y get-prices, que fallan con 500 sin él.
  salesChannelToken: "d792f0f7def937524c47b6e5036b70085302d9df18a7dfc48478ce3d2de4bef9",
  status: "verified",
};

const CINEPLANET_PE: Provider = {
  id: "cineplanet-pe",
  name: "Cineplanet",
  country: "PE",
  countryName: "Perú",
  // Sin verificar: son los hosts que el sitio usaría, no endpoints probados.
  // No se llaman hasta que el recon los confirme.
  apiBase: "",
  siteBase: "https://www.cineplanet.com.pe",
  countryHeader: "PE",
  status: "planned",
  nota: "Su CDN responde 403 a todo pedido desde fuera de Perú (verificado con curl y navegador). Falta correr el recon desde una conexión peruana.",
};

const PROVIDERS: Provider[] = [CINEMARK_AR, CINEPLANET_PE];

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
 */
export function resolveProvider(id: string): Provider {
  const p = findProvider(id);
  if (!p) {
    const ids = PROVIDERS.map((x) => x.id).join(", ");
    throw new Error(`No conozco la cadena "${id}". Disponibles: ${ids}.`);
  }
  if (p.status === "planned") {
    throw new Error(`${p.name} (${p.countryName}) todavía no está soportada. ${p.nota ?? ""}`.trim());
  }
  return p;
}

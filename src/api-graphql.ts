/**
 * Transporte GraphQL, hoy solo para Cinépolis.
 *
 * Vive aparte de `api.ts` porque no comparte nada con él salvo `ApiError`:
 * Cinemark es REST con GET y query params, Cinépolis es POST a un gateway donde
 * el endpoint depende de la operación. Un `request()` que sirviera a los dos
 * sería un switch disfrazado de abstracción.
 *
 * Las queries de acá se copiaron del tráfico real del sitio (HAR del recon del
 * 2026-08-16), no se escribieron de memoria contra un esquema. La introspección
 * está deshabilitada en el gateway, así que el HAR es la única fuente.
 */

import { ApiError } from "./api.js";
import type { Provider } from "./providers.js";

const TIMEOUT_MS = 15000;

/**
 * Rutas por operación. El gateway no expone un endpoint único: cada dominio
 * tiene el suyo, y dos operaciones distintas pueden compartir ruta (`Seats` y
 * `Tickets` viven las dos en `/v1/ticket/graphql`), así que la ruta no alcanza
 * para identificar una operación.
 */
const ENDPOINTS = {
  locations: "/shared-services/locations/graphql",
  billboards: "/v1/billboards/graphql",
  movies: "/v2/billboards/graphql",
  ticket: "/v1/ticket/graphql",
} as const;

/**
 * Una respuesta GraphQL puede traer `errors` con HTTP 200 y `data: null`.
 * Durante el recon eso se leyó como "este cine no tiene funciones" en los 10
 * cines a la vez, cuando en realidad faltaba una sub-selección en la query. Por
 * eso `errors` se chequea siempre, antes que el status.
 */
interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string }>;
}

async function query<T>(
  provider: Provider,
  endpoint: keyof typeof ENDPOINTS,
  operationName: string,
  variables: Record<string, unknown>,
  document: string,
): Promise<T> {
  const url = `${provider.apiBase}${ENDPOINTS[endpoint]}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Obligatorio: sin este header el gateway responde 401.
        "x-apikey": provider.apiKey ?? "",
        "country-id": provider.countryHeader,
        language: "es",
      },
      body: JSON.stringify({ operationName, variables, query: document }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        "NETWORK_ERROR",
        `Se agotó el tiempo de espera (${TIMEOUT_MS / 1000}s) esperando a ${provider.name}`,
        "Probá de nuevo en unos segundos. Si sigue fallando, la API puede estar caída.",
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      "NETWORK_ERROR",
      `No se pudo conectar a la API de ${provider.name}: ${message}`,
      "Revisá tu conexión a internet.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const bodyText = await response.text();

  if (response.status === 401) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `${provider.name} rechazó la clave de aplicación`,
      "La clave pública del sitio pudo haber rotado. Reportá este error: el CLI necesita actualizarla.",
    );
  }

  // El 403 acá es el edge, no la aplicación: rechaza al cliente antes de mirar
  // la request. El guard de runtime debería haberlo evitado, así que si llegamos
  // hasta acá es que la señal cambió y el mensaje tiene que decirlo.
  if (response.status === 403) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `${provider.name} rechazó la conexión desde este cliente`,
      "Su servidor filtra clientes que no parecen un navegador. Si estás en Bun, esto es nuevo: reportalo.",
    );
  }

  if (response.status === 429) {
    throw new ApiError(
      "RATE_LIMITED",
      `${provider.name} rechazó la solicitud por exceso de pedidos`,
      "Esperá unos segundos antes de reintentar.",
    );
  }

  let parsed: GraphQLResponse<T>;
  try {
    parsed = JSON.parse(bodyText) as GraphQLResponse<T>;
  } catch {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `${provider.name} devolvió una respuesta que no se pudo interpretar como JSON`,
      "Puede ser un cambio en la API. Reportá este error si persiste.",
    );
  }

  if (parsed.errors && parsed.errors.length > 0) {
    const detalle = parsed.errors
      .map((e) => e.message)
      .filter((m): m is string => typeof m === "string" && m.length > 0)
      .join("; ");
    throw new ApiError(
      "UPSTREAM_ERROR",
      `${provider.name} rechazó la consulta ${operationName}${detalle ? `: ${detalle}` : ""}`,
      "Puede ser un cambio en su esquema. Reportá este error si persiste.",
    );
  }

  if (parsed.data === null || parsed.data === undefined) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `${provider.name} respondió sin datos a ${operationName}`,
      "Puede ser un cambio en su esquema. Reportá este error si persiste.",
    );
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Cines
// ---------------------------------------------------------------------------

/**
 * Cinépolis identifica cada cine dos veces y los dos ids se usan en lugares
 * distintos: el slug (`id`) va en `Billboard.cinemaId`, el `vistaId` numérico va
 * en `Seats.cinemaVistaId`. No son intercambiables.
 */
export interface CinepolisCinema {
  id: string;
  vistaId: string;
  name: string;
  cityId: string;
  /**
   * Números de verdad. El upstream los manda como string (`"-34.677"`), así que
   * se convierten al leerlos: el contrato publicado declara `number` y dejarlos
   * pasar emitía JSON con las coordenadas entrecomilladas.
   */
  lat: number;
  lng: number;
}

interface RawCitiesResponse {
  cities: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        timezone: string;
        cinemas: Array<{
          id: string;
          vistaId: string;
          name: string;
          cityId: string;
          lat: string | number | null;
          lng: string | number | null;
        }> | null;
      };
    }>;
  };
}

const CITIES_QUERY = `query Cities($countryId: String!) {
  cities(country_id: $countryId) {
    edges {
      node {
        id
        name
        timezone
        cinemas { id vistaId name cityId lat lng }
      }
    }
  }
}`;

export interface CinepolisCity {
  id: string;
  name: string;
  timezone: string;
  cinemas: CinepolisCinema[];
}

export async function fetchCities(provider: Provider): Promise<CinepolisCity[]> {
  const data = await query<RawCitiesResponse>(
    provider,
    "locations",
    "Cities",
    { countryId: provider.country },
    CITIES_QUERY,
  );
  return data.cities.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    timezone: e.node.timezone,
    cinemas: (e.node.cinemas ?? []).map((c) => ({
      id: c.id,
      vistaId: c.vistaId,
      name: c.name,
      cityId: c.cityId,
      lat: Number(c.lat ?? 0),
      lng: Number(c.lng ?? 0),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Cartelera
// ---------------------------------------------------------------------------

export interface CinepolisMovie {
  id: string;
  name: string;
  /**
   * Minutos. El upstream lo manda como texto con unidad (`"95 min"`), así que se
   * parsea al leerlo. `"0 min"` es un valor real: hay películas sin duración
   * publicada, y ahí queda 0 en vez de inventar un número.
   */
  length: number;
  rating: string;
  formats: string[];
  genre: string;
}

/** Extrae los minutos de un `"95 min"`. Devuelve 0 si no hay número. */
function parseMinutos(valor: string | number | null): number {
  if (typeof valor === "number") return valor;
  if (!valor) return 0;
  const m = /(\d+)/.exec(valor);
  return m?.[1] ? Number(m[1]) : 0;
}

interface RawMoviesResponse {
  movies: {
    totalCount: number;
    edges: Array<{
      node: {
        id: string;
        name: string;
        length: string | number | null;
        rating: string | null;
        formats: string[] | null;
        genre: string | null;
      };
    }>;
  };
}

const MOVIES_QUERY = `query Movies($countryId: String!, $category: String, $cinemas: String, $limit: Int) {
  movies(countryId: $countryId category: $category cinemas: $cinemas limit: $limit) {
    totalCount
    edges { node { id name length rating formats genre } }
  }
}`;

export async function fetchMovies(
  provider: Provider,
  cinemaId?: string,
): Promise<CinepolisMovie[]> {
  const data = await query<RawMoviesResponse>(
    provider,
    "movies",
    "Movies",
    {
      countryId: provider.country,
      category: "now-playing",
      cinemas: cinemaId ?? "",
      limit: 100,
    },
    MOVIES_QUERY,
  );
  return data.movies.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    length: parseMinutos(e.node.length),
    rating: e.node.rating ?? "",
    formats: e.node.formats ?? [],
    genre: e.node.genre ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Funciones
// ---------------------------------------------------------------------------

export interface CinepolisShowtime {
  sessionId: string;
  movieId: string;
  cinemaVistaId: string;
  /**
   * Hora local de Argentina, sin sufijo de zona (`2026-08-16T23:15:00`).
   * Nunca parsear como UTC: son tres horas de diferencia.
   */
  datetime: string;
  date: string;
  screen: string;
  format: string;
  language: string;
  isAllocatedSeating: boolean;
}

interface RawBillboardResponse {
  billboardByCinema: {
    dates: string[] | null;
    schedules: Array<{
      movieId: string;
      dates: Array<{
        date: string;
        languages: Array<{
          language: string | null;
          showtimes: Array<{
            sessionId: string;
            datetime: string;
            screen: string | null;
            cinemaVistaId: string;
            isAllocatedSeating: boolean | null;
            format: { name: string | null } | null;
          }> | null;
        }> | null;
      }> | null;
    }> | null;
  } | null;
}

/**
 * La sub-selección completa importa: recortar `dates { ... }` hace que el
 * resolver devuelva HTTP 200 con `errors: ["'dates'"]` y cero funciones, que se
 * lee como "este cine no tiene cartelera".
 */
const BILLBOARD_QUERY = `query Billboard($countryId: String!, $cinemaId: String!, $timezone: String!, $isOffSelectorDays: Boolean!) {
  billboardByCinema(countryId: $countryId cinemaId: $cinemaId timezone: $timezone isOffSelectorDays: $isOffSelectorDays) {
    dates
    schedules {
      cinemaId
      cityId
      movieId
      dates {
        date
        languages {
          language
          displayLanguage
          showtimes {
            sessionId
            datetime
            screen
            movieVistaId
            cinemaVistaId
            availability
            isAllocatedSeating
            format { name }
            experience { name }
          }
        }
      }
    }
  }
}`;

export interface CinepolisBillboard {
  dates: string[];
  showtimes: CinepolisShowtime[];
}

export async function fetchBillboard(
  provider: Provider,
  cinemaId: string,
  timezone = "America/Argentina/Buenos_Aires",
): Promise<CinepolisBillboard> {
  const data = await query<RawBillboardResponse>(
    provider,
    "billboards",
    "Billboard",
    { cinemaId, countryId: provider.country, timezone, isOffSelectorDays: true },
    BILLBOARD_QUERY,
  );

  const board = data.billboardByCinema;
  if (!board) {
    return { dates: [], showtimes: [] };
  }

  const showtimes: CinepolisShowtime[] = [];
  for (const schedule of board.schedules ?? []) {
    for (const day of schedule.dates ?? []) {
      for (const lang of day.languages ?? []) {
        for (const s of lang.showtimes ?? []) {
          showtimes.push({
            sessionId: s.sessionId,
            movieId: schedule.movieId,
            cinemaVistaId: s.cinemaVistaId,
            datetime: s.datetime,
            date: day.date,
            screen: s.screen ?? "",
            format: s.format?.name ?? "",
            language: lang.language ?? "",
            isAllocatedSeating: s.isAllocatedSeating ?? false,
          });
        }
      }
    }
  }

  return { dates: board.dates ?? [], showtimes };
}

// ---------------------------------------------------------------------------
// Butacas
// ---------------------------------------------------------------------------

/**
 * Estados observados en el recon. `Companion` es el asiento de acompañante de
 * una silla de ruedas y solo apareció en algunos cines, así que la lista no se
 * trata como cerrada: cualquier estado desconocido cuenta como no disponible.
 */
export type SeatStatus = "Empty" | "Sold" | "Special" | "Companion" | string;

export interface CinepolisSeat {
  id: string;
  status: SeatStatus;
  seatStyle: string;
  row: string;
  columnIndex: number;
  rowIndex: number;
  areaNumber: number;
}

export interface CinepolisSeatMap {
  /** Tope de butacas por orden que declara el upstream. */
  maxQuantity: number;
  seats: CinepolisSeat[];
}

interface RawSeatsResponse {
  seats: {
    maxQuantity: number | null;
    seatLayoutData: {
      areas: Array<{
        rowCount: number;
        columnCount: number;
        rows: Array<{
          physicalName: string | null;
          seats: Array<{
            id: string;
            status: string;
            seatStyle: string | null;
            position: { columnIndex: number; rowIndex: number; areaNumber: number } | null;
          }> | null;
        }> | null;
      }> | null;
    } | null;
  } | null;
}

const SEATS_QUERY = `query Seats($countryId: String!, $sessionId: String!, $cinemaVistaId: String!, $experience: String) {
  seats(countryId: $countryId sessionId: $sessionId cinemaVistaId: $cinemaVistaId experience: $experience) {
    maxQuantity
    seatLayoutData {
      areas {
        rowCount
        columnCount
        rows {
          physicalName
          seats {
            id
            status
            seatStyle
            position { columnIndex rowIndex areaNumber }
          }
        }
      }
    }
  }
}`;

/**
 * Lee el mapa de butacas de una función.
 *
 * A diferencia de Cinemark, esto no abre una orden ni toma inventario: es una
 * query anónima sobre `sessionId`. Verificado en 7 funciones de 2 cines,
 * incluido uno nunca visitado desde la web, así que no depende de estado previo.
 */
export async function fetchSeats(
  provider: Provider,
  sessionId: string,
  cinemaVistaId: string,
  experience = "TRADICIONAL",
): Promise<CinepolisSeatMap> {
  const data = await query<RawSeatsResponse>(
    provider,
    "ticket",
    "Seats",
    { countryId: provider.country, sessionId, cinemaVistaId, experience },
    SEATS_QUERY,
  );

  const seats: CinepolisSeat[] = [];
  for (const area of data.seats?.seatLayoutData?.areas ?? []) {
    for (const row of area.rows ?? []) {
      for (const s of row.seats ?? []) {
        seats.push({
          id: s.id,
          status: s.status,
          seatStyle: s.seatStyle ?? "",
          row: row.physicalName ?? "",
          columnIndex: s.position?.columnIndex ?? 0,
          rowIndex: s.position?.rowIndex ?? 0,
          areaNumber: s.position?.areaNumber ?? 0,
        });
      }
    }
  }

  return { maxQuantity: data.seats?.maxQuantity ?? 0, seats };
}

/**
 * Cuenta butacas libres sobre el layout.
 *
 * Se cuenta acá y no se toma del upstream por dos razones medidas: el campo
 * `availability` de una función es un color hexadecimal de UI (`#FFBE06`), no un
 * estado ni un número, y `areaCategories[].capacity` devolvió 1 en todas las
 * pruebas. Es la misma regla que ya rige para Cinemark, donde `occupation.status`
 * decía HIGH incluso en una sala al 98%.
 */
export function contarButacas(map: CinepolisSeatMap): {
  available: number;
  capacity: number;
  pct: number;
} {
  const capacity = map.seats.length;
  const available = map.seats.filter((s) => s.status === "Empty").length;
  const pct = capacity > 0 ? Math.round((available / capacity) * 100) : 0;
  return { available, capacity, pct };
}

import type {
  ErrorCode,
  RawCarteleraMovie,
  RawFormat,
  RawItemResponse,
  RawListResponse,
  RawShowtime,
  RawTheater,
  SideEffect,
} from "./types.js";

const BASE_URL = "https://bff.cinemark.com.ar/api";
const TIMEOUT_MS = 15000;
const SOURCE = "bff.cinemark.com.ar";

export class ApiError extends Error {
  code: ErrorCode;
  hint: string;
  retryable: boolean | undefined;
  sideEffect: SideEffect | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    hint: string,
    metadata: { retryable?: boolean; sideEffect?: SideEffect } = {},
  ) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.retryable = metadata.retryable;
    this.sideEffect = metadata.sideEffect;
    this.name = "ApiError";
  }
}

function isWaitingRoom(response: Response, bodyText: string): boolean {
  const setCookie = response.headers.get("set-cookie") ?? "";
  if (setCookie.includes("__cfwaitingroom")) {
    return true;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") && bodyText.includes("waitingroom")) {
    return true;
  }
  return false;
}

function looksLikeHtml(bodyText: string): boolean {
  return bodyText.trimStart().startsWith("<");
}

// El CDN de Cinemark cachea 60s. showtimes ya manda su propio cache-buster
// porque los asientos cambian rápido; --no-cache lo extiende al resto, que
// normalmente no lo necesita.
let bustCache = false;
export function setNoCache(on: boolean): void {
  bustCache = on;
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  if (bustCache && !url.searchParams.has("_t")) {
    url.searchParams.set("_t", String(Date.now()));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { country: "AR" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        "NETWORK_ERROR",
        `Se agotó el tiempo de espera (${TIMEOUT_MS / 1000}s) esperando a Cinemark`,
        "Probá de nuevo en unos segundos. Si sigue fallando, la API puede estar caída.",
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      "NETWORK_ERROR",
      `No se pudo conectar a la API de Cinemark: ${message}`,
      "Revisá tu conexión a internet.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const bodyText = await response.text();

  if (isWaitingRoom(response, bodyText)) {
    throw new ApiError(
      "QUEUED",
      "Cinemark activó la sala de espera de Cloudflare",
      "Hay mucha demanda ahora mismo. Esperá un momento y volvé a intentar.",
    );
  }

  if (response.status === 429) {
    throw new ApiError(
      "RATE_LIMITED",
      "Cinemark rechazó la solicitud por exceso de pedidos",
      "Esperá unos segundos antes de reintentar.",
    );
  }

  if (looksLikeHtml(bodyText)) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      "Cinemark devolvió HTML en vez de JSON",
      "La API puede estar en mantenimiento. Probá de nuevo más tarde.",
    );
  }

  if (response.status === 404) {
    throw new ApiError(
      "NOT_FOUND",
      "El recurso pedido no existe en Cinemark",
      "Revisá el slug o id que pasaste.",
    );
  }

  if (!response.ok) {
    let message = `Cinemark respondió ${response.status}`;
    try {
      const parsed = JSON.parse(bodyText) as { message?: string };
      if (typeof parsed.message === "string" && parsed.message.length > 0) {
        message = parsed.message;
      }
    } catch {
      // el cuerpo no era JSON, nos quedamos con el mensaje genérico
    }
    throw new ApiError(
      "UPSTREAM_ERROR",
      message,
      "Puede ser un problema temporal de la API de Cinemark.",
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new ApiError(
      "UPSTREAM_ERROR",
      "Cinemark devolvió una respuesta que no se pudo interpretar como JSON",
      "Puede ser un cambio en la API. Reportá este error si persiste.",
    );
  }
}

export async function fetchTheaters(): Promise<RawTheater[]> {
  const body = await request<RawListResponse<RawTheater>>("/cinema/theaters", {
    limit: "100",
  });
  return body.data;
}

export async function fetchMovies(theaterId?: string): Promise<RawCarteleraMovie[]> {
  const params = theaterId ? { theater: theaterId } : undefined;
  const body = await request<RawListResponse<RawCarteleraMovie>>("/cinema/movies", params);
  return body.data;
}

export async function fetchMovieBySlug(slug: string): Promise<RawCarteleraMovie> {
  const body = await request<RawItemResponse<RawCarteleraMovie>>(
    `/cinema/movies/slug/${encodeURIComponent(slug)}`,
  );
  return body.data;
}

export async function fetchShowtimesByTheater(theaterIds: string): Promise<RawShowtime[]> {
  const body = await request<RawListResponse<RawShowtime>>("/cinema/showtimes", {
    theater: theaterIds,
    _t: String(Date.now()),
  });
  return body.data;
}

export async function fetchShowtimesByMovie(
  movieCorporateId: string,
  theaterIds: string,
): Promise<RawShowtime[]> {
  const body = await request<RawListResponse<RawShowtime>>("/cinema/showtimes", {
    movieCorporateId,
    theater: theaterIds,
    _t: String(Date.now()),
  });
  return body.data;
}

export async function fetchFormats(): Promise<RawFormat[]> {
  const body = await request<RawListResponse<RawFormat>>("/cinema/formats");
  return body.data;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const source = SOURCE;

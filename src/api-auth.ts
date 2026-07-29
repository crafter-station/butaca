import { ApiError } from "./api.js";

const BASE_URL = "https://bff.cinemark.com.ar/api";
const TIMEOUT_MS = 15000;

/**
 * Hardcodeado porque sale del env blob del sitio (`CNK_PUBLIC_ENVS`), no de
 * ningún endpoint que el CLI pueda consultar. Verificado contra la API real.
 */
export const SALES_CHANNEL_TOKEN_TICKET_CANDY =
  "d792f0f7def937524c47b6e5036b70085302d9df18a7dfc48478ce3d2de4bef9";

/** El objeto entero de buyOptions se reenvía tal cual vino de get-prices. */
export interface PriceBuyOption {
  recogId: number;
  promoId: number;
  cssClass: string;
  value: number;
  valueWithoutTax: number;
  service: number;
  buttonQty: number;
  maxQty: number;
  type: number;
  level: number;
  balances: unknown[];
}

export interface PriceTicket {
  quantity: number;
  hoCode: string;
  title: string;
  cssClass: string;
  description: string;
  ticketsQty: number;
  onlyBuy: boolean;
  onlyBook: boolean;
  buyOptions: PriceBuyOption[];
  colorCode: string;
  imageUrl: string;
}

export interface PriceCategory {
  categoryId: number;
  title: string;
  cssClass: string;
  showTitle: boolean;
  tickets: PriceTicket[];
}

export interface TicketListEntry {
  areaCategoryCode: string;
  hOCode: string;
  recogId: number;
  promoId: number;
  voucher: string;
  quantity: number;
  price: number;
  ticketsQty: number;
  buyOptions: PriceBuyOption[];
}

export interface OpenOrderResult {
  transIdTemp: number;
}

export interface RawSeatMapResponse {
  Code: number;
  Message: string;
  Data: {
    physicalScreenLeft?: string;
    physicalScreenWidth?: string;
    screenBoundaryPositionLeft?: string;
    totalNumberOfAreas: number;
    areas: RawSeatArea[];
    seatDescriptions?: unknown;
  };
}

export interface RawSeatArea {
  areaNumber: string;
  areaCategory: string;
  areaLayoutRows: number;
  areaLayoutColumns: number;
  totalNumberOfRows: number;
  rows: RawSeatRow[];
}

export interface RawSeatRow {
  seatGridRowId: string;
  rowPhysicalId: string;
  seats: RawSeat[];
}

export interface RawSeat {
  gridSeatNumber: number;
  seatNumber: string;
  seatStatus: number;
}

export interface HoldSeatEntry {
  areaCatCode: string;
  areaNumber: string;
  gridSeatRowId: string;
  gridSeatNumber: string;
}

export interface HoldSeatsPayload {
  numberOfSeats: number;
  seats: HoldSeatEntry[];
  cinemaId: number;
  transIdTemp: number;
}

export interface HoldSeatsResult {
  Code: number;
  Message: string;
  Data?: {
    checkoutUrl?: string;
    expiresAt?: string;
    [key: string]: unknown;
  };
}

/**
 * Cinemark suspende la venta online por ventanas y el único indicador es el
 * texto del error: no hay flag en su config ni código propio. Se distingue para
 * poder decirle al usuario que no es culpa del CLI y que no reintente en loop.
 */
export function esVentaSuspendida(message: string): boolean {
  return /suspendid|mantenimiento/i.test(message);
}

function memberSessionExpired(bodyText: string): boolean {
  return bodyText.includes("member_session_not_found");
}

async function request<T>(
  path: string,
  memberSessionId: string,
  init: { method: "GET" | "POST"; params?: Record<string, string>; body?: unknown } = {
    method: "GET",
  },
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (init.params) {
    for (const [key, value] of Object.entries(init.params)) {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  let bodyText: string;
  try {
    const requestInit: RequestInit = {
      method: init.method,
      headers: {
        country: "AR",
        // El BFF está en otro dominio que www, así que la cookie de NextAuth no
        // le llega. Lo que acepta es este header, con el id que devuelve
        // GET /api/auth/session.
        "member-session-id": memberSessionId,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      signal: controller.signal,
    };
    if (init.body) requestInit.body = JSON.stringify(init.body);
    response = await fetch(url.toString(), requestInit);
    bodyText = await response.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        "NETWORK_ERROR",
        `Se agotó el tiempo de espera (${TIMEOUT_MS / 1000}s) esperando a Cinemark`,
        "Probá de nuevo en unos segundos.",
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError("NETWORK_ERROR", `No se pudo conectar: ${message}`, "Revisá tu conexión a internet.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && memberSessionExpired(bodyText)) {
    throw new ApiError(
      "AUTH_EXPIRED",
      "La sesión de Cinemark venció",
      "Corré `butaca auth login`.",
    );
  }

  if (response.status === 401) {
    throw new ApiError(
      "AUTH_EXPIRED",
      "Cinemark rechazó la sesión",
      "Corré `butaca auth login`.",
    );
  }

  if (!response.ok) {
    let message = `Cinemark respondió ${response.status}`;
    try {
      const parsed = JSON.parse(bodyText) as { Message?: string; message?: string };
      message = parsed.Message ?? parsed.message ?? message;
    } catch {
      // el cuerpo no era JSON, nos quedamos con el mensaje genérico
    }
    // Cinemark suspende la venta online por ventanas, sin flag previo en su
    // config: leer y get-prices siguen respondiendo 200 mientras order-tickets
    // rechaza todo. El mensaje del upstream es el único indicador, así que vale
    // distinguirlo de un error genérico y decirle al usuario que no reintente.
    if (esVentaSuspendida(message)) {
      throw new ApiError(
        "ORDER_FAILED",
        message,
        "Cinemark cortó la venta online, no es un problema del CLI. Consultar cartelera y funciones sigue andando; probá comprar más tarde.",
      );
    }
    throw new ApiError("UPSTREAM_ERROR", message, "Puede ser un problema temporal de la API de Cinemark.");
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

export function pricesQueryParams(
  cinemaId: string,
  sessionId: string,
): Record<string, string> {
  return {
    cinemaId,
    sessionId,
    feature: "0",
    salesChannelToken: SALES_CHANNEL_TOKEN_TICKET_CANDY,
  };
}

export function extractTransIdTemp(body: {
  data?: { transIdTemp?: number };
  Data?: { transIdTemp?: number };
}): number | null {
  const id = body.data?.transIdTemp ?? body.Data?.transIdTemp;
  return typeof id === "number" ? id : null;
}

export async function fetchPrices(
  cinemaId: string,
  sessionId: string,
  memberSessionId: string,
): Promise<PriceCategory[]> {
  // `salesChannelToken` es obligatorio acá, igual que en order-tickets: sin él
  // el upstream responde 500 "The request is invalid". Medido de a un parámetro:
  // sin token da 500 aunque mandes feature; con token da 200.
  const body = await request<{ data: PriceCategory[] }>("/get-prices", memberSessionId, {
    method: "GET",
    params: pricesQueryParams(cinemaId, sessionId),
  });
  return body.data;
}

export interface OpenOrderParams {
  sessionId: string;
  cinemaId: string;
  memberId: string;
  ticketList: TicketListEntry[];
}

/**
 * order-tickets es el paso que "escribe": abre una transacción en el sistema
 * de Cinemark y recién ahí devuelve el transIdTemp que habilita pedir el mapa.
 * Sin `cinemaId`, `salesChannelToken` y `memberId` a nivel superior, Cinemark
 * devuelve 500 error_order_new "Uno o más campos son requeridos.".
 */
export async function openOrder(
  params: OpenOrderParams,
  memberSessionId: string,
): Promise<OpenOrderResult> {
  // El BFF mezcla convenciones: get-prices y order-tickets responden `data`,
  // order-get-map responde `Data`. Aceptamos las dos en vez de apostar.
  const body = await request<{
    data?: { transIdTemp: number };
    Data?: { transIdTemp: number };
  }>("/order-tickets", memberSessionId, {
    method: "POST",
    body: {
      sessionId: Number(params.sessionId),
      cinemaId: Number(params.cinemaId),
      salesChannelToken: SALES_CHANNEL_TOKEN_TICKET_CANDY,
      memberId: Number(params.memberId),
      ticketList: params.ticketList,
    },
  });
  const transIdTemp = extractTransIdTemp(body);
  if (transIdTemp === null) {
    throw new ApiError(
      "ORDER_FAILED",
      "Cinemark aceptó la orden pero no devolvió un transIdTemp",
      "Sin ese id no se puede pedir el mapa de butacas. Reportá este error.",
    );
  }
  return { transIdTemp };
}

export async function fetchSeatMap(
  cinemaId: string,
  transIdTemp: number,
  sessionId: string,
  memberSessionId: string,
): Promise<RawSeatMapResponse> {
  return request<RawSeatMapResponse>("/order-get-map", memberSessionId, {
    method: "GET",
    params: { cinemaId, transIdTemp: String(transIdTemp), sessionId },
  });
}

/** El hold real: bloquea butacas para otros compradores mientras dure la orden. */
export async function holdSeats(payload: HoldSeatsPayload, memberSessionId: string): Promise<HoldSeatsResult> {
  return request<HoldSeatsResult>("/order-set-seats", memberSessionId, {
    method: "POST",
    body: payload,
  });
}

export type ErrorCode =
  | "UPSTREAM_ERROR"
  | "NOT_FOUND"
  | "BAD_INPUT"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "QUEUED"
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "AUTH_FAILED"
  | "PRICES_UNAVAILABLE"
  | "SEATS_UNAVAILABLE"
  | "ORDER_FAILED";

export type SideEffect = "none" | "order_opened" | "seat_held";

export interface EnvelopeMeta {
  source: string;
  fetchedAt: string;
  cached: boolean;
  nextSteps?: string[];
}

export interface EnvelopeOk<T> {
  ok: true;
  data: T;
  meta: EnvelopeMeta;
}

export interface EnvelopeError {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    hint: string;
    retryable?: boolean;
    sideEffect?: SideEffect;
  };
}

export type Envelope<T> = EnvelopeOk<T> | EnvelopeError;

export interface Theater {
  id: number;
  slug: string;
  name: string;
  address: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
}

export interface CarteleraFormat {
  name: string;
  shortName: string;
}

export interface CarteleraMovie {
  id: string;
  corporateId: string;
  slug: string;
  title: string;
  runTime: number;
  rating: string;
  formats: string[];
  premiere: boolean;
}

export interface FuncionSeats {
  available: number;
  capacity: number;
  pct: number;
}

export interface Funcion {
  sessionId: string;
  movie: {
    corporateId: string;
    name: string;
  };
  theater: {
    id: string;
    room: string;
  };
  dateTime: string;
  displayDate: string;
  format: string;
  language: string;
  seats: FuncionSeats;
}

export interface RawTheater {
  id: number;
  name: string;
  slug: string;
  address: string;
  city: string;
  latitude: string;
  longitude: string;
  location: {
    id: string;
    name: string;
  };
}

export interface RawFormatRef {
  name: string;
  shortName: string;
}

export interface RawCarteleraMovie {
  id: string;
  corporateId: string;
  slug: string;
  title: string;
  runTime: number;
  rating: string;
  formats: RawFormatRef[];
  premiere: boolean;
  status?: string;
  openingDate?: string;
}

export type EstadoEstreno = "PRESALE" | "COMING_SOON" | "SHOWING_NOW";

export interface Estreno {
  slug: string;
  title: string;
  runTime: number;
  rating: string;
  formats: string[];
  status: EstadoEstreno;
  openingDate: string;
  diasParaEstreno: number;
}

export interface EstrenoConVentas extends Estreno {
  ventas: {
    funciones: number;
    vendidoPromedio: number;
    maxVendido: number;
    diaSiguiente: number | null;
  } | null;
}

export interface RawShowtime {
  movieId: string;
  movieName: string;
  corporateId: string;
  language: {
    id: string;
    name: string;
    shortName: string;
  };
  formats: RawFormatRef[];
  theaterId: string;
  theaterRoom: string;
  sessionId: string;
  sessionFormat: string;
  sessionDateTime: string;
  sessionDisplayDate: string;
  isLateNightSession: boolean;
  occupation: {
    availableSeats: number;
    capacity: number;
    status: string;
  };
  premiere: boolean;
}

export interface RawFormat {
  id: number;
  name: string;
  shortName: string;
}

export interface RawListResponse<T> {
  data: T[];
}

export interface RawItemResponse<T> {
  data: T;
}

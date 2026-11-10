import { ApiError } from "./api.js";
import { renderSeatMap, type SeatMap, seatStatusInfo } from "./seat-map.js";

export const CP_SITE = "https://www.cineplanet.com.pe";
export interface CpCinema {
  ID: string;
  name: string;
  address: string;
  city: string;
  secondAddress: string;
  latitude: string;
  longitude: string;
  formattedCinemaName: string;
}
export interface CpMovie {
  id: string;
  title: string;
  movieDetailsUrl: string;
  runTime: number;
  ratingDescription: string;
  formats: string[];
  isNewRelease: boolean;
  isComingSoon: boolean;
  isPreSale: boolean;
  cinemas: {
    cinemaId: string;
    dates: { date: string; sessions: string[] }[];
  }[];
}
export interface CpSession {
  id: string;
  sessionId: string;
  showtime: string;
  screenName: string;
  formats: string[];
  languages: string[];
}
export interface CpLayout {
  ResponseCode: string;
  SeatLayoutData: {
    Areas: {
      Number: number;
      AreaCategoryCode: string;
      Rows: {
        PhysicalName: string;
        Seats: {
          Id: string;
          Status: number;
          Position: { RowIndex: number; ColumnIndex: number };
        }[];
      }[];
    }[];
  };
}

export class CineplanetClient {
  private cookie = "";
  private initializing: Promise<void> | undefined;
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly noCache = false,
  ) {}

  private async initialize(): Promise<void> {
    const response = await this.request(`${CP_SITE}/`, {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw this.httpError(response.status);
    this.cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .filter((value) => /^(channel-token|chtoe)=/.test(value))
      .join("; ");
    if (!this.cookie.includes("channel-token=")) {
      throw new ApiError(
        "UPSTREAM_ERROR",
        "Cineplanet no inició la sesión pública.",
        "Reintenta más tarde; no se necesita tu cuenta.",
      );
    }
  }

  private httpError(status: number): ApiError {
    return new ApiError(
      status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR",
      `Cineplanet respondió HTTP ${status}.`,
      "Reintenta más tarde o consulta cineplanet.com.pe.",
      { retryable: true, sideEffect: "none" },
    );
  }

  async get<T>(path: string, retry = true): Promise<T> {
    if (
      !/^(cache\/(cinemascache|moviescache|sessioncache)|(seatplan|sessionavailable)\/cinema\/\d+\/session\/\d+)$/.test(
        path,
      )
    ) {
      throw new ApiError(
        "BAD_INPUT",
        "Consulta de Cineplanet no permitida.",
        "Esta integración es de solo lectura.",
      );
    }
    try {
      if (!this.cookie) {
        this.initializing ??= this.initialize();
        await this.initializing;
      }
      const response = await this.request(`${CP_SITE}/api/v1-web/${path}`, {
        headers: {
          Cookie: this.cookie,
          Accept: "application/json",
          ...(this.noCache ? { "Cache-Control": "no-cache" } : {}),
        },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if ((response.status === 401 || response.status === 403) && retry) {
        this.cookie = "";
        this.initializing = undefined;
        return await this.get<T>(path, false);
      }
      if (!response.ok) throw this.httpError(response.status);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "NETWORK_ERROR",
        "No se pudo leer la respuesta de Cineplanet.",
        "Reintenta la consulta más tarde.",
        { retryable: true, sideEffect: "none" },
      );
    }
  }

  async catalog() {
    const [cinemas, movies, sessions] = await Promise.all([
      this.get<{ cinemas: CpCinema[] }>("cache/cinemascache"),
      this.get<{ movies: CpMovie[] }>("cache/moviescache"),
      this.get<{ sessions: CpSession[] }>("cache/sessioncache"),
    ]);
    if (
      ![cinemas.cinemas, movies.movies, sessions.sessions].every(Array.isArray)
    ) {
      throw new ApiError(
        "UPSTREAM_ERROR",
        "El catálogo de Cineplanet cambió de formato.",
        "Actualiza la integración antes de usar estos datos.",
      );
    }
    return {
      cinemas: cinemas.cinemas,
      movies: movies.movies,
      sessions: sessions.sessions,
    };
  }

  async availability(cinema: string, session: string) {
    const data = await this.get<{
      "available-seats": number;
      seatsTotal: number;
    }>(`sessionavailable/cinema/${cinema}/session/${session}`);
    const available = data["available-seats"];
    const capacity = data.seatsTotal;
    if (
      Number.isInteger(available) &&
      Number.isInteger(capacity) &&
      capacity >= 0 &&
      available > capacity
    ) {
      const map = await this.seats(cinema, session);
      return {
        available: map.summary.available,
        capacity: map.summary.total,
        pct: map.summary.total
          ? Math.round((map.summary.available / map.summary.total) * 1000) / 10
          : 0,
      };
    }
    if (
      !Number.isInteger(available) ||
      !Number.isInteger(capacity) ||
      available < 0 ||
      capacity < available
    ) {
      throw new ApiError(
        "UPSTREAM_ERROR",
        "Cineplanet no devolvió disponibilidad válida.",
        "Reintenta; no se estimarán asientos libres.",
      );
    }
    return {
      available,
      capacity,
      pct: capacity ? Math.round((available / capacity) * 1000) / 10 : 0,
    };
  }

  async seats(cinema: string, session: string) {
    return normalizeCpSeats(
      await this.get<CpLayout>(`seatplan/cinema/${cinema}/session/${session}`),
    );
  }
}

export function normalizeCpSeats(raw: CpLayout): SeatMap {
  if (
    String(raw.ResponseCode) !== "0" ||
    !Array.isArray(raw.SeatLayoutData?.Areas)
  ) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      "Cineplanet no devolvió un mapa válido.",
      "Consulta otra función o reintenta más tarde.",
    );
  }
  const all = raw.SeatLayoutData.Areas.flatMap((a) =>
    a.Rows.flatMap((r) => r.Seats),
  );
  if (
    !all.length ||
    all.some(
      (s) =>
        !Number.isInteger(s.Position?.RowIndex) ||
        !Number.isInteger(s.Position?.ColumnIndex) ||
        s.Position.RowIndex < 0 ||
        s.Position.ColumnIndex < 0,
    )
  ) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      "El mapa no contiene posiciones válidas.",
      "Consulta el mapa en Cineplanet.",
    );
  }
  const rows = Math.max(...all.map((s) => s.Position.RowIndex)) + 1;
  const columns = Math.max(...all.map((s) => s.Position.ColumnIndex)) + 1;
  const areas = raw.SeatLayoutData.Areas.map((area) => ({
    code: area.AreaCategoryCode,
    number: String(area.Number),
    seats: area.Rows.flatMap((row) =>
      row.Seats.map((seat) => {
        const statusId =
          seat.Status === 0
            ? 0
            : seat.Status === 3
              ? 4
              : seat.Status === 1
                ? 1
                : 8;
        return {
          row: row.PhysicalName,
          number: seat.Id,
          gridRow: String(rows - seat.Position.RowIndex),
          gridNumber: String(columns - seat.Position.ColumnIndex),
          statusId,
          status: seatStatusInfo(statusId).name,
        };
      }),
    ),
  }));
  const seats = areas.flatMap((a) => a.seats);
  return {
    areas,
    screen: { rows, columns },
    summary: {
      total: seats.length,
      available: seats.filter((s) => s.statusId === 0).length,
      accessible: seats.filter((s) => s.statusId === 4).length,
      broken: 0,
    },
  };
}

export function limaDate(value: string | null, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (!value || value === "hoy") return today;
  if (value === "mañana" || value === "manana")
    return new Date(Date.parse(`${today}T12:00:00-05:00`) + 86400000)
      .toISOString()
      .slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new ApiError(
      "BAD_INPUT",
      "Fecha inválida.",
      "Usa hoy, mañana o YYYY-MM-DD.",
    );
  }
  return value;
}

export function renderCpSeats(map: SeatMap, numerada = false): string {
  return renderSeatMap(
    {
      ...map,
      areas: map.areas.map((area) => ({
        ...area,
        seats: area.seats.map((seat) => ({
          ...seat,
          gridRow: String(map.screen.rows + 1 - Number(seat.gridRow)),
          gridNumber: String(map.screen.columns + 1 - Number(seat.gridNumber)),
        })),
      })),
    },
    { numerada },
  );
}

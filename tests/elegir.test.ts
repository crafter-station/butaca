import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api.js";
import { resolveMovie, resolveRelativeDate, selectShowtime } from "../src/commands/elegir.js";
import { sugerirGrupoButacas } from "../src/seat-map.js";
import type { RawCarteleraMovie, RawShowtime } from "../src/types.js";
import moviesFixture from "./fixtures/movies.json" with { type: "json" };
import showtimesFixture from "./fixtures/showtimes.json" with { type: "json" };

describe("resolveMovie", () => {
  const movies = moviesFixture.data as unknown as RawCarteleraMovie[];

  it("acepta búsqueda parcial y sin acentos", () => {
    expect(resolveMovie(movies, "odisea").title).toBe("LA ODISEA");
  });

  it("spiderman coincide con Spider-Man aunque omita el separador", () => {
    const spider = {
      ...movies[0],
      title: "SPIDER-MAN: UN NUEVO DÍA",
      slug: "spider-man-un-nuevo-dia",
    } as RawCarteleraMovie;
    expect(resolveMovie([spider], "spiderman").slug).toBe("spider-man-un-nuevo-dia");
  });

  it("rechaza títulos ambiguos con candidatos", () => {
    const duplicated = [movies[0], movies[0]].filter((item): item is RawCarteleraMovie =>
      Boolean(item),
    );
    const query = duplicated[0]?.title ?? "";
    expect(() => resolveMovie(duplicated, query)).toThrow(ApiError);
    try {
      resolveMovie(duplicated, query);
    } catch (error) {
      expect((error as ApiError).code).toBe("BAD_INPUT");
      expect((error as ApiError).sideEffect).toBe("none");
    }
  });
});

describe("resolveRelativeDate", () => {
  it("resuelve mañana en Buenos Aires", () => {
    expect(resolveRelativeDate("mañana", new Date("2026-08-14T15:00:00Z"))).toBe("2026-08-15");
  });
});

describe("selectShowtime", () => {
  const showtimes = showtimesFixture.data as unknown as RawShowtime[];

  it("elige determinísticamente la función con más disponibilidad", () => {
    const selected = selectShowtime(showtimes, {
      fecha: "2026-07-27",
      formato: "2D",
      idioma: "CAST",
      cantidad: 1,
    });
    expect(selected.sessionId).toBe("161248");
  });

  it("prefiere una función del día antes que una trasnoche con más disponibilidad", () => {
    const regular = showtimes[0];
    if (!regular) throw new Error("fixture sin función");
    const late = {
      ...regular,
      sessionId: "late",
      isLateNightSession: true,
      occupation: { ...regular.occupation, availableSeats: regular.occupation.capacity },
    };
    const selected = selectShowtime([late, regular], {
      fecha: regular.sessionDisplayDate,
      formato: regular.sessionFormat,
      idioma: regular.language.shortName,
      cantidad: 1,
    });
    expect(selected.sessionId).toBe(regular.sessionId);
  });

  it("falla sin side effect cuando no queda inventario suficiente", () => {
    try {
      selectShowtime(showtimes, {
        fecha: "2026-07-27",
        formato: "2D",
        idioma: "CAST",
        cantidad: 10_000,
      });
      throw new Error("debió fallar");
    } catch (error) {
      expect((error as ApiError).code).toBe("NOT_FOUND");
      expect((error as ApiError).sideEffect).toBe("none");
    }
  });
});

describe("sugerirGrupoButacas", () => {
  it("elige un grupo contiguo y descarta una butaca ocupada", () => {
    const seatMap = {
      screen: { rows: 10, columns: 10 },
      summary: { total: 4, available: 3, accessible: 0, broken: 0 },
      areas: [
        {
          code: "1",
          number: "1",
          seats: [
            {
              row: "7",
              number: "4",
              gridRow: "7",
              gridNumber: "4",
              status: "DISPONIBLE",
              statusId: 0,
            },
            {
              row: "7",
              number: "5",
              gridRow: "7",
              gridNumber: "5",
              status: "NO_DISPONIBLE",
              statusId: 1,
            },
            {
              row: "7",
              number: "6",
              gridRow: "7",
              gridNumber: "6",
              status: "DISPONIBLE",
              statusId: 0,
            },
            {
              row: "7",
              number: "7",
              gridRow: "7",
              gridNumber: "7",
              status: "DISPONIBLE",
              statusId: 0,
            },
          ],
        },
      ],
    } as Parameters<typeof sugerirGrupoButacas>[0];
    expect(sugerirGrupoButacas(seatMap, 2).map((seat) => seat.label)).toEqual(["7-6", "7-7"]);
  });
});

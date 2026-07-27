import { describe, expect, it } from "bun:test";
import {
  matchesFecha,
  matchesFormato,
  matchesIdioma,
  matchesLibres,
  sortKey,
  toFuncion,
} from "../src/commands/funciones.js";
import fixtures from "./fixtures/showtimes.json" with { type: "json" };
import type { Funcion, RawShowtime } from "../src/types.js";

describe("sortKey (orden cronológico)", () => {
  // Regresión: ordenar por dateTime (DD/MM/YYYY) ponía agosto antes que julio,
  // así que `butaca funciones --cine palermo` abría con funciones de otro mes.
  const funcion = (displayDate: string, dateTime: string) =>
    ({ displayDate, dateTime }) as Funcion;

  it("ordena julio antes que agosto pese al día del mes", () => {
    const agosto = funcion("2026-08-01", "01/08/2026 11:30");
    const julio = funcion("2026-07-27", "27/07/2026 11:30");
    expect([agosto, julio].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))).toEqual([
      julio,
      agosto,
    ]);
  });

  it("ordena por hora dentro del mismo día", () => {
    const tarde = funcion("2026-07-27", "27/07/2026 22:00");
    const manana = funcion("2026-07-27", "27/07/2026 11:30");
    expect([tarde, manana].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))).toEqual([
      manana,
      tarde,
    ]);
  });
});

describe("toFuncion (contrato funciones)", () => {
  const raw = fixtures.data as unknown as RawShowtime[];

  it("mapea el shape exacto del contrato", () => {
    const funcion = toFuncion(raw[0] as RawShowtime);
    expect(Object.keys(funcion).sort()).toEqual(
      ["sessionId", "movie", "theater", "dateTime", "displayDate", "format", "language", "seats"].sort(),
    );
    expect(Object.keys(funcion.movie).sort()).toEqual(["corporateId", "name"].sort());
    expect(Object.keys(funcion.theater).sort()).toEqual(["id", "room"].sort());
    expect(Object.keys(funcion.seats).sort()).toEqual(["available", "capacity", "pct"].sort());
  });

  it("parsea sessionDateTime como hora local de Buenos Aires, no UTC", () => {
    const laOdisea = raw.find((r) => r.sessionId === "161235");
    if (!laOdisea) throw new Error("fixture sin sesion 161235");
    expect(laOdisea.sessionDateTime).toBe("2026-07-27T11:30:00.000Z");

    const funcion = toFuncion(laOdisea);
    expect(funcion.dateTime).toBe("27/07/2026 11:30");
    expect(funcion.dateTime).not.toContain("08:30");
    expect(funcion.dateTime).not.toContain("14:30");
  });

  it("calcula seats.pct como available/capacity, no usa occupation.status", () => {
    const laOdisea = raw.find((r) => r.sessionId === "161235");
    if (!laOdisea) throw new Error("fixture sin sesion 161235");
    expect(laOdisea.occupation.status).toBe("HIGH");

    const funcion = toFuncion(laOdisea);
    expect(funcion.seats.available).toBe(247);
    expect(funcion.seats.capacity).toBe(250);
    expect(funcion.seats.pct).toBe(98.8);
  });

  it("da pct correcto para una sala llena", () => {
    const toyStoryFull = raw.find((r) => r.sessionId === "161248");
    if (!toyStoryFull) throw new Error("fixture sin sesion 161248");
    expect(toyStoryFull.occupation.availableSeats).toBe(143);
    expect(toyStoryFull.occupation.capacity).toBe(143);

    const funcion = toFuncion(toyStoryFull);
    expect(funcion.seats.pct).toBe(100);
  });

  it("cross-referencia por corporateId, no por movieId", () => {
    const funcion = toFuncion(raw[0] as RawShowtime);
    expect(funcion.movie.corporateId).toBe((raw[0] as RawShowtime).corporateId);
    expect(funcion.movie.corporateId).not.toBe((raw[0] as RawShowtime).movieId);
  });
});

describe("filtros de funciones", () => {
  const raw = fixtures.data as unknown as RawShowtime[];
  const funciones = raw.map(toFuncion);

  it("matchesFecha filtra por displayDate exacto", () => {
    for (const f of funciones) {
      expect(matchesFecha(f, "2026-07-27")).toBe(true);
      expect(matchesFecha(f, "2026-01-01")).toBe(false);
    }
    expect(matchesFecha(funciones[0] as (typeof funciones)[number], null)).toBe(true);
  });

  it("matchesFormato es case-insensitive", () => {
    const f = funciones[0] as (typeof funciones)[number];
    expect(matchesFormato(f, "2D")).toBe(true);
    expect(matchesFormato(f, "2d")).toBe(true);
    expect(matchesFormato(f, "3D")).toBe(false);
  });

  it("matchesIdioma es case-insensitive", () => {
    const laOdisea = funciones.find((f) => f.movie.name === "LA ODISEA");
    if (!laOdisea) throw new Error("no hay LA ODISEA en fixture");
    expect(matchesIdioma(laOdisea, "SUB")).toBe(true);
    expect(matchesIdioma(laOdisea, "sub")).toBe(true);
    expect(matchesIdioma(laOdisea, "CAST")).toBe(false);
  });

  it("matchesLibres exige available >= n", () => {
    const f = funciones.find((fn) => fn.seats.available === 132);
    if (!f) throw new Error("no hay funcion con 132 libres en fixture");
    expect(matchesLibres(f, 132)).toBe(true);
    expect(matchesLibres(f, 133)).toBe(false);
    expect(matchesLibres(f, 100)).toBe(true);
  });

  it("libres null no filtra nada", () => {
    for (const f of funciones) {
      expect(matchesLibres(f, null)).toBe(true);
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  extremosDeOcupacion,
  agruparPorFecha,
  coincideBusqueda,
  diasParaEstreno,
  displayDateDeOpening,
  esPresale,
  esProximo,
  etiquetaDias,
  toEstreno,
} from "../src/commands/estrenos.js";
import fixtures from "./fixtures/estrenos.json" with { type: "json" };
import type { Estreno, Funcion, RawCarteleraMovie } from "../src/types.js";

const raw = fixtures.data as unknown as RawCarteleraMovie[];

function diasEntreHoyY(y: number, m: number, d: number): number {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const fecha = new Date(y, m - 1, d);
  return Math.round((fecha.getTime() - inicioHoy.getTime()) / (24 * 60 * 60 * 1000));
}

describe("toEstreno (clasificacion por status)", () => {
  it("mapea PRESALE, COMING_SOON y SHOWING_NOW", () => {
    const spiderMan = raw.find((m) => m.slug === "spider-man-un-nuevo-dia");
    const franz = raw.find((m) => m.slug === "franz");
    const toyStory = raw.find((m) => m.slug === "toy-story-5");
    if (!spiderMan || !franz || !toyStory) throw new Error("fixture incompleto");

    expect(toEstreno(spiderMan).status).toBe("PRESALE");
    expect(toEstreno(franz).status).toBe("COMING_SOON");
    expect(toEstreno(toyStory).status).toBe("SHOWING_NOW");
  });

  it("esPresale y esProximo filtran por status", () => {
    const estrenos = raw.map(toEstreno);
    const presale = estrenos.filter(esPresale);
    const proximos = estrenos.filter(esProximo);

    expect(presale.every((e) => e.status === "PRESALE")).toBe(true);
    expect(proximos.every((e) => e.status === "COMING_SOON")).toBe(true);
    expect(presale.length).toBe(2);
    expect(proximos.length).toBe(4);
  });

  it("escapa el titulo de terceros", () => {
    const spiderMan = raw.find((m) => m.slug === "spider-man-un-nuevo-dia");
    if (!spiderMan) throw new Error("fixture sin spider-man");
    expect(toEstreno(spiderMan).title).toBe("SPIDER-MAN: UN NUEVO DÍA");
  });
});

describe("diasParaEstreno (borde de hoy)", () => {
  it("da 0 para una fecha de hoy", () => {
    const hoy = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    const iso = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}T00:00:00.000Z`;
    expect(diasParaEstreno(iso)).toBe(0);
  });

  it("da 1 para mañana", () => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const pad = (n: number): string => String(n).padStart(2, "0");
    const iso = `${manana.getFullYear()}-${pad(manana.getMonth() + 1)}-${pad(manana.getDate())}T00:00:00.000Z`;
    expect(diasParaEstreno(iso)).toBe(1);
  });

  it("coincide con el conteo manual para una fecha futura arbitraria", () => {
    const dias = diasEntreHoyY(2026, 8, 6);
    expect(diasParaEstreno("2026-08-06T00:00:00.000Z")).toBe(dias);
  });

  it("etiquetaDias traduce 0/1/N a hoy, mañana, en N días", () => {
    expect(etiquetaDias(0)).toBe("hoy");
    expect(etiquetaDias(-2)).toBe("hoy");
    expect(etiquetaDias(1)).toBe("mañana");
    expect(etiquetaDias(5)).toBe("en 5 días");
  });
});

describe("timezone: openingDate no se corre de dia al parsearse", () => {
  it("displayDateDeOpening conserva el dia exacto del ISO pese al sufijo Z", () => {
    expect(displayDateDeOpening("2026-07-29T00:00:00.000Z")).toBe("2026-07-29");
    expect(displayDateDeOpening("2026-07-29T00:00:00.000Z")).not.toBe("2026-07-28");
    expect(displayDateDeOpening("2026-08-06T00:00:00.000Z")).toBe("2026-08-06");
  });

  it("toEstreno preserva openingDate crudo para downstream parsing", () => {
    const spiderMan = raw.find((m) => m.slug === "spider-man-un-nuevo-dia");
    if (!spiderMan) throw new Error("fixture sin spider-man");
    expect(toEstreno(spiderMan).openingDate).toBe("2026-07-29T00:00:00.000Z");
  });
});

describe("coincideBusqueda (match parcial case-insensitive)", () => {
  const estrenos = raw.map(toEstreno);

  it("spider encuentra spider-man-un-nuevo-dia por slug", () => {
    const match = estrenos.find((e) => coincideBusqueda(e, "spider"));
    expect(match?.slug).toBe("spider-man-un-nuevo-dia");
  });

  it("es case-insensitive y matchea por title tambien", () => {
    expect(estrenos.some((e) => coincideBusqueda(e, "SPIDER"))).toBe(true);
    expect(estrenos.some((e) => coincideBusqueda(e, "nuevo día"))).toBe(true);
  });

  it("un termino inexistente no encuentra nada", () => {
    const match = estrenos.find((e) => coincideBusqueda(e, "esto-no-existe-nunca"));
    expect(match).toBeUndefined();
  });
});

describe("agruparPorFecha (COMING_SOON)", () => {
  it("agrupa por displayDate derivado de openingDate", () => {
    const proximos = raw.map(toEstreno).filter(esProximo);
    const grupos = agruparPorFecha(proximos);

    expect(grupos.has("2026-08-06")).toBe(true);
    expect(grupos.get("2026-08-06")?.length).toBe(4);
  });

  it("cada grupo mantiene los slugs originales", () => {
    const proximos = raw.map(toEstreno).filter(esProximo);
    const grupos = agruparPorFecha(proximos);
    const slugs = (grupos.get("2026-08-06") ?? []).map((e) => e.slug).sort();
    expect(slugs).toEqual(
      ["el-dia-d-bajo-presion", "engendro", "franz", "la-invitacion"].sort(),
    );
  });
});

describe("shape JSON del envelope", () => {
  it("presale y comingSoon separan por status", () => {
    const estrenos = raw.map(toEstreno);
    const presale: Estreno[] = estrenos.filter(esPresale);
    const comingSoon: Estreno[] = estrenos.filter(esProximo);
    const data = { presale, comingSoon };

    expect(Object.keys(data).sort()).toEqual(["comingSoon", "presale"].sort());
    expect(data.presale.every((e) => e.status === "PRESALE")).toBe(true);
    expect(data.comingSoon.every((e) => e.status === "COMING_SOON")).toBe(true);
  });
});

describe("extremosDeOcupacion", () => {
  // Regresión: seats.pct es el porcentaje de butacas LIBRES, así que el más
  // alto es la sala más VACÍA. Ordenar ascendente invertía las dos columnas y
  // "las más vacías todavía" listaba las que estaban por agotarse.
  const f = (hora: string, available: number, capacity: number): Funcion =>
    ({
      sessionId: hora,
      movie: { corporateId: "1", name: "PELI" },
      theater: { id: "733", room: "4" },
      dateTime: `29/07/2026 ${hora}`,
      displayDate: "2026-07-29",
      format: "2D",
      language: "SUB",
      seats: {
        available,
        capacity,
        pct: Math.round((available / capacity) * 1000) / 10,
      },
    }) as Funcion;

  const casi_llena = f("18:50", 41, 143);
  const media = f("15:40", 108, 143);
  const vacia = f("12:00", 184, 195);

  it("vacias arranca por la de mas butacas libres", () => {
    const { vacias } = extremosDeOcupacion([casi_llena, media, vacia], 1);
    expect(vacias[0]?.sessionId).toBe("12:00");
  });

  it("llenas arranca por la de menos butacas libres", () => {
    const { llenas } = extremosDeOcupacion([casi_llena, media, vacia], 1);
    expect(llenas[0]?.sessionId).toBe("18:50");
  });

  it("las dos columnas nunca dicen lo mismo cuando hay variacion", () => {
    const { vacias, llenas } = extremosDeOcupacion([casi_llena, media, vacia], 1);
    expect(vacias[0]?.sessionId).not.toBe(llenas[0]?.sessionId);
  });
});

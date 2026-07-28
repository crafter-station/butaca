import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api.js";
import { buildTicketList, resolveSeats, toHoldSeatEntries, etiquetasPedidas } from "../src/commands/reservar.js";
import { parseSeatMap, renderSeatMap } from "../src/seat-map.js";
import type { PriceCategory, RawSeatMapResponse } from "../src/api-auth.js";
import fixture from "./fixtures/seat-map.json" with { type: "json" };
import pricesFixture from "./fixtures/get-prices.json" with { type: "json" };

describe("resolveSeats: traducción etiqueta -> coordenada de grilla", () => {
  const raw = fixture as unknown as RawSeatMapResponse;
  const seatMap = parseSeatMap(raw);

  it("traduce F1 (etiqueta) a su gridRow/gridNumber", () => {
    const resolved = resolveSeats(["A1"], seatMap.areas);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.seat.gridRow).toBe("2");
    expect(resolved[0]?.seat.gridNumber).toBe("6");
  });

  it("resuelve varias etiquetas disponibles a la vez", () => {
    const resolved = resolveSeats(["A1", "B4", "B5"], seatMap.areas);
    expect(resolved.map((r) => r.label)).toEqual(["A1", "B4", "B5"]);
  });

  it("falla claro si la etiqueta no existe en el mapa", () => {
    expect(() => resolveSeats(["Z99"], seatMap.areas)).toThrow(ApiError);
    try {
      resolveSeats(["Z99"], seatMap.areas);
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("SEATS_UNAVAILABLE");
      expect((err as ApiError).message).toContain("Z99");
    }
  });

  it("falla claro si el asiento existe pero no está disponible", () => {
    // A2 está en estado NO_DISPONIBLE en el fixture
    expect(() => resolveSeats(["A2"], seatMap.areas)).toThrow(ApiError);
    try {
      resolveSeats(["A2"], seatMap.areas);
    } catch (err) {
      expect((err as ApiError).code).toBe("SEATS_UNAVAILABLE");
      expect((err as ApiError).message).toContain("A2");
      expect((err as ApiError).message).toContain("NO_DISPONIBLE");
    }
  });

  it("acepta OBESIDAD y SILLA_DE_RUEDAS como disponibles", () => {
    const resolved = resolveSeats(["A3", "A4"], seatMap.areas);
    expect(resolved).toHaveLength(2);
  });

  it("falla claro con una etiqueta mal formada", () => {
    try {
      resolveSeats(["12F"], seatMap.areas);
      throw new Error("no debería llegar acá");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("SEATS_UNAVAILABLE");
      expect((err as ApiError).message).toContain("12F");
    }
  });

  it("junta todos los problemas de una sola pasada, no corta en el primero", () => {
    try {
      resolveSeats(["Z99", "A2", "bad"], seatMap.areas);
      throw new Error("no debería llegar acá");
    } catch (err) {
      const message = (err as ApiError).message;
      expect(message).toContain("Z99");
      expect(message).toContain("A2");
      expect(message).toContain("bad");
    }
  });
});

describe("toHoldSeatEntries: order-set-seats recibe la coordenada original, no la espejada", () => {
  const raw = fixture as unknown as RawSeatMapResponse;
  const seatMap = parseSeatMap(raw);

  it("A1 tiene gridSeatNumber 6 en el mapa (fixture espejado) y así se manda al hold", () => {
    // A1 es la primera butaca dibujada (columna 0, la más a la izquierda),
    // pero su gridSeatNumber crudo del upstream es 6, no 1: el espejo solo
    // vive en `buildGrid`/`renderSeatMap`, nunca en el shape que sale de
    // `parseSeatMap` ni en lo que se le manda a la API de reserva.
    const resolved = resolveSeats(["A1"], seatMap.areas);
    const entries = toHoldSeatEntries(resolved, "0000000001", "1");

    expect(entries).toEqual([
      { areaCatCode: "0000000001", areaNumber: "1", gridSeatRowId: "2", gridSeatNumber: "6" },
    ]);
  });

  it("la coordenada mandada al hold coincide con seat.gridNumber, no con la posición dibujada", () => {
    const resolved = resolveSeats(["A1", "B4", "B5"], seatMap.areas);
    const entries = toHoldSeatEntries(resolved, "0000000001", "1");

    for (const { seat } of resolved) {
      const entry = entries.find(
        (e) => e.gridSeatRowId === seat.gridRow && e.gridSeatNumber === seat.gridNumber,
      );
      expect(entry).toBeDefined();
    }

    // Verificación cruzada con el dibujo: la posición dibujada de A1 (columna
    // 0, o sea la primera de la fila) es distinta de su gridSeatNumber crudo
    // (6). Si `toHoldSeatEntries` alguna vez tomara la posición dibujada en
    // vez de `seat.gridNumber`, este test lo detectaría.
    const drawing = renderSeatMap(seatMap, { color: false });
    const lineaA = drawing.split("\n").find((l) => l.trimStart().startsWith("A "));
    if (!lineaA) throw new Error("no se encontró la fila A dibujada");
    const primeraGlifoA = lineaA.trim().split(/\s+/)[1];
    expect(primeraGlifoA).toBe("·"); // A1, DISPONIBLE, dibujado primero
    expect(entries[0]?.gridSeatNumber).toBe("6"); // pero su coordenada real es 6, no 1
  });
});

describe("buildTicketList (copia de reservar.ts): mismo shape real de get-prices", () => {
  const categories = pricesFixture.data as unknown as PriceCategory[];

  it("toma el primer ticket de la primera categoría con su buyOption entero", () => {
    const ticketList = buildTicketList(categories);
    const expectedBuyOption = categories[0]?.tickets[0]?.buyOptions[0];
    if (!expectedBuyOption) throw new Error("fixture sin buyOption");
    expect(ticketList[0]?.hOCode).toBe("1697");
    expect(ticketList[0]?.price).toBe(2000000);
    expect(ticketList[0]?.buyOptions).toEqual([expectedBuyOption]);
  });

  it("falla con ORDER_FAILED si get-prices no trae categorías", () => {
    expect(() => buildTicketList([])).toThrow(ApiError);
  });
});

describe("etiquetasPedidas: --asignada", () => {
  const mapa = {
    areas: [
      {
        code: "0000000001",
        number: "1",
        seats: [
          { row: "14", number: "8", gridRow: "2", gridNumber: "1", status: "AUTO_ASIGNADA", statusId: 5 },
          { row: "2", number: "30", gridRow: "3", gridNumber: "2", status: "DISPONIBLE", statusId: 0 },
        ],
      },
    ],
    summary: { total: 2, available: 1, accessible: 0, broken: 0 },
    screen: { rows: 2, columns: 2 },
  } as unknown as Parameters<typeof etiquetasPedidas>[1];

  it("resuelve la preasignada de la orden en curso", () => {
    expect(etiquetasPedidas({ asientos: [], asignada: true }, mapa)).toEqual(["14-8"]);
  });

  it("sin el flag devuelve lo que pidió el usuario", () => {
    expect(etiquetasPedidas({ asientos: ["2-30"], asignada: false }, mapa)).toEqual(["2-30"]);
  });

  it("falla con hint si la orden no trajo preasignada", () => {
    const sinAuto = { ...mapa, areas: [{ ...mapa.areas[0], seats: [mapa.areas[0].seats[1]] }] } as typeof mapa;
    expect(() => etiquetasPedidas({ asientos: [], asignada: true }, sinAuto)).toThrow(/no preasignó/);
  });

  // La preasignada no es reservable pidiéndola por número: el que ve el usuario
  // pertenece a la orden que dibujó el mapa. Dentro de la orden que abre
  // `reservar` sí lo es, y --asignada es el único camino que la resuelve desde
  // adentro, así que es el único que la deja pasar.
  it("solo con permitirAsignada pasa el estado 5", () => {
    const areas = mapa.areas;
    expect(() => resolveSeats(["14-8"], areas)).toThrow(/no está disponible/);
    expect(resolveSeats(["14-8"], areas, true).map((r) => r.label)).toEqual(["14-8"]);
  });
});

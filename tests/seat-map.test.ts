import { describe, expect, it } from "bun:test";
import {
  findSeatByLabel,
  isAvailableStatus,
  parseSeatLabel,
  parseSeatMap,
  renderSeatMap,
} from "../src/seat-map.js";
import type { RawSeatMapResponse } from "../src/api-auth.js";
import fixture from "./fixtures/seat-map.json" with { type: "json" };

describe("parseSeatMap", () => {
  const raw = fixture as unknown as RawSeatMapResponse;

  it("mapea las dos representaciones: etiqueta y coordenada de grilla", () => {
    const seatMap = parseSeatMap(raw);
    const area = seatMap.areas[0];
    if (!area) throw new Error("fixture sin área");

    const seatA1 = area.seats.find((s) => s.row === "A" && s.number === "1");
    expect(seatA1).toEqual({
      row: "A",
      number: "1",
      gridRow: "2",
      gridNumber: "6",
      status: "DISPONIBLE",
      statusId: 0,
    });
  });

  it("cubre los ocho estados del contrato", () => {
    const seatMap = parseSeatMap(raw);
    const area = seatMap.areas[0];
    if (!area) throw new Error("fixture sin área");
    const statuses: string[] = area.seats.map((s) => s.status).sort();

    expect(statuses).toEqual(
      [
        "DISPONIBLE",
        "DISPONIBLE",
        "DISPONIBLE",
        "NO_DISPONIBLE",
        "OBESIDAD",
        "SILLA_DE_RUEDAS",
        "AUTO_ASIGNADA",
        "ROTA",
        "RESERVADA_Y_ROTA",
        "BLOQUEADA",
      ].sort(),
    );
  });

  it("computa el summary: total, available, accessible, broken", () => {
    const seatMap = parseSeatMap(raw);
    expect(seatMap.summary).toEqual({
      total: 10,
      available: 3,
      accessible: 2,
      broken: 2,
    });
  });

  it("3 y 4 (OBESIDAD, SILLA_DE_RUEDAS) no cuentan como available", () => {
    const seatMap = parseSeatMap(raw);
    const area = seatMap.areas[0];
    if (!area) throw new Error("fixture sin área");
    const accesibles = area.seats.filter((s) => s.status === "OBESIDAD" || s.status === "SILLA_DE_RUEDAS");
    expect(accesibles).toHaveLength(2);
    expect(seatMap.summary.available).toBe(3);
  });

  it("expone screen.rows/columns desde areaLayoutRows/Columns", () => {
    const seatMap = parseSeatMap(raw);
    expect(seatMap.screen).toEqual({ rows: 2, columns: 6 });
  });
});

describe("isAvailableStatus", () => {
  it("DISPONIBLE, OBESIDAD y SILLA_DE_RUEDAS son reservables", () => {
    expect(isAvailableStatus(0)).toBe(true);
    expect(isAvailableStatus(3)).toBe(true);
    expect(isAvailableStatus(4)).toBe(true);
  });

  it("el resto no es reservable", () => {
    for (const id of [1, 5, 6, 7, 8]) {
      expect(isAvailableStatus(id)).toBe(false);
    }
  });
});

describe("renderSeatMap: dibujo por coordenada de grilla", () => {
  const raw = fixture as unknown as RawSeatMapResponse;

  it("deja el pasillo (columna 3, ausente en la grilla) como hueco real", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    const lines = drawing.split("\n");

    const lineaA = lines.find((l) => l.trimStart().startsWith("A "));
    if (!lineaA) throw new Error("no se encontró la fila A dibujada");

    // Fila A: DISPONIBLE, NO_DISPONIBLE, <hueco>, OBESIDAD, SILLA_DE_RUEDAS, AUTO_ASIGNADA
    const glifos = lineaA.trim().split(/\s+/).slice(1);
    expect(glifos).toEqual(["·", "x", "O", "W", "a"]);
  });

  it("no colapsa el pasillo con la butaca siguiente", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    // Con hueco real, la fila A mide más que 5 glifos pegados: hay un espacio
    // extra donde falta la columna 3 de la grilla.
    const lineaA = drawing.split("\n").find((l) => l.trimStart().startsWith("A "));
    if (!lineaA) throw new Error("no se encontró la fila A");
    expect(lineaA).toContain("  ");
  });

  it("incluye el encabezado PANTALLA y la leyenda", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    expect(drawing).toContain("P A N T A L L A");
    expect(drawing).toContain("libre");
    expect(drawing).toContain("ocupada");
  });

  it("sin color, sigue siendo legible solo con glifos", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: verificamos ausencia de ANSI
    expect(drawing).not.toMatch(/\x1b\[/);
  });

  it("dibuja en el orden de la etiqueta impresa, no en el de gridSeatNumber crudo (regresión del espejo)", () => {
    // Verificado contra la sala 7 real de Palermo: gridSeatNumber crece hacia
    // la izquierda de seatNumber (grid 1 = butaca 13, grid 6 = butaca 3). El
    // fixture reproduce esa misma dirección: seatNumber 1..5 en fila A trae
    // gridSeatNumber 6,5,3,2,1. Si alguien vuelve a dibujar con
    // `gridSeatNumber - 1` sin invertir, el orden de los glifos sale al revés
    // (DISPONIBLE termina último en vez de primero) y este test falla.
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    const lineaA = drawing.split("\n").find((l) => l.trimStart().startsWith("A "));
    if (!lineaA) throw new Error("no se encontró la fila A dibujada");

    const glifos = lineaA.trim().split(/\s+/).slice(1);
    // seatNumber 1 (DISPONIBLE, gridSeatNumber 6) tiene que quedar primero:
    // sin invertir el índice de columna, quedaría último.
    expect(glifos[0]).toBe("·");
    expect(glifos.at(-1)).toBe("a");
  });
});

describe("parseSeatLabel", () => {
  it("separa letras de números", () => {
    expect(parseSeatLabel("F12")).toEqual({ row: "F", number: "12" });
    expect(parseSeatLabel("a1")).toEqual({ row: "A", number: "1" });
  });

  it("devuelve null para formatos inválidos", () => {
    expect(parseSeatLabel("12F")).toBeNull();
    expect(parseSeatLabel("")).toBeNull();
    expect(parseSeatLabel("F")).toBeNull();
  });
});

describe("findSeatByLabel: traducción etiqueta -> coordenada", () => {
  const raw = fixture as unknown as RawSeatMapResponse;

  it("encuentra el asiento y expone su coordenada de grilla", () => {
    const seatMap = parseSeatMap(raw);
    const seat = findSeatByLabel(seatMap, "A", "1");
    expect(seat).toEqual({
      row: "A",
      number: "1",
      gridRow: "2",
      gridNumber: "6",
      status: "DISPONIBLE",
      statusId: 0,
    });
  });

  it("devuelve null si la etiqueta no existe en el mapa", () => {
    const seatMap = parseSeatMap(raw);
    expect(findSeatByLabel(seatMap, "Z", "99")).toBeNull();
  });
});

describe("renderSeatMap: orientación vertical (regresión)", () => {
  const raw = fixture as unknown as RawSeatMapResponse;

  // Verificado contra la sala 7 real: seatGridRowId va al revés que
  // rowPhysicalId (grid 14 = fila 1, la pegada a la pantalla). Dibujar en el
  // orden del array pone el fondo de la sala arriba, al revés de lo que ve el
  // usuario en el sitio. Los 163 tests que había no cubrían el eje vertical.
  it("la fila más cercana a la pantalla se dibuja primero", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    const filas = drawing
      .split("\n")
      .filter((l) => /^\s*[A-Z0-9]+\s+[·xOWa/#]/.test(l))
      .map((l) => l.trim().split(/\s+/)[0]);

    expect(filas[0]).toBe("A");
    expect(filas.at(-1)).toBe("B");
  });

  it("cada butaca ocupa dos caracteres, para que salga cuadrada", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false });
    const lineaA = drawing.split("\n").find((l) => l.trimStart().startsWith("A "));
    if (!lineaA) throw new Error("no se encontró la fila A");
    // Cada celda con butaca son 2 chars de glifo; sin el ensanche eran 1.
    expect(lineaA).toMatch(/·\s/);
    expect(lineaA.length).toBeGreaterThan(10);
  });
});

describe("parseSeatLabel: filas numéricas (regresión)", () => {
  // Cinemark usa filas NUMÉRICAS (rowPhysicalId "1".."14"), no letras. El parser
  // original solo aceptaba letra+número, así que `reservar` no podía reservar
  // nada en estas salas: la butaca "fila 7 asiento 12" no tenía forma de
  // escribirse. Pegar fila y número daría "712", ambiguo con fila 71 asiento 2.
  it("acepta fila-asiento con filas numéricas", () => {
    expect(parseSeatLabel("7-12")).toEqual({ row: "7", number: "12" });
    expect(parseSeatLabel("2-4")).toEqual({ row: "2", number: "4" });
  });

  it("sigue aceptando el formato con letra, para otras salas", () => {
    expect(parseSeatLabel("F12")).toEqual({ row: "F", number: "12" });
    expect(parseSeatLabel("f12")).toEqual({ row: "F", number: "12" });
  });

  it("rechaza el formato ambiguo sin separador", () => {
    expect(parseSeatLabel("712")).toBeNull();
    expect(parseSeatLabel("12")).toBeNull();
  });
});

describe("renderSeatMap --numeros", () => {
  const raw = fixture as unknown as RawSeatMapResponse;

  it("muestra el número de cada butaca en lugar del bloque", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false, numerada: true });
    const lineaA = drawing.split("\n").find((l) => l.trimStart().startsWith("A "));
    if (!lineaA) throw new Error("no se encontró la fila A");
    expect(lineaA).toContain("1");
    expect(lineaA).not.toContain("◼");
  });

  // El color codifica el estado y el número la identidad: en el modo numerado se
  // ceden los glifos, no el estado, porque el color no ocupa ancho. Con
  // FORCE_COLOR el estilo se enciende aunque no haya TTY (los tests corren sin
  // uno), y ahí se puede verificar que el color esté presente.
  it("con color forzado, el estado sigue codificado en el color del número", () => {
    const previo = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = "1";
    try {
      const seatMap = parseSeatMap(raw);
      const drawing = renderSeatMap(seatMap, { numerada: true });
      expect(drawing).toContain("38;5;");
    } finally {
      if (previo === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = previo;
    }
  });

  it("sin color, quedan los números y sigue siendo legible", () => {
    const seatMap = parseSeatMap(raw);
    const drawing = renderSeatMap(seatMap, { color: false, numerada: true });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: verificamos ausencia de ANSI
    expect(drawing).not.toMatch(/\x1b\[/);
  });
});

describe("leyenda del estado 5 (regresión)", () => {
  // Decía "la que te asignaron", que implica que es tuya y reservable. Es lo
  // contrario: la preasigna la orden que se abre para leer el mapa, y esa orden
  // muere en cuanto corrés `reservar`. Con la etiqueta vieja el usuario veía el
  // ámbar en 12-16 y el comando sugerido en 2-30, sin nada que lo explicara, y
  // al pegar 12-16 recibía NO_DISPONIBLE.
  it("no promete que la butaca ámbar sea del usuario", () => {
    const seatMap = parseSeatMap(fixture as unknown as RawSeatMapResponse);
    const drawing = renderSeatMap(seatMap, { color: false });
    expect(drawing).not.toContain("te asignaron");
    // Nombra el flag que la toma: es el único camino que la reserva, porque el
    // número que se ve pertenece a la orden que dibujó este mapa.
    expect(drawing).toContain("--asignada");
  });
});

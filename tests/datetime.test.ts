import { describe, expect, it } from "bun:test";
import { formatLocalDateTime, formatLocalTime, parseSessionDateTime } from "../src/datetime.js";

describe("parseSessionDateTime", () => {
  it("extrae los componentes locales sin reinterpretar el offset Z", () => {
    const parts = parseSessionDateTime("2026-07-27T11:30:00.000Z");
    expect(parts).toEqual({
      year: 2026,
      month: 7,
      day: 27,
      hour: 11,
      minute: 30,
      second: 0,
    });
  });

  it("no se corre 3 horas como haría new Date() con la Z", () => {
    const raw = "2026-07-27T11:30:00.000Z";
    const asUtcDate = new Date(raw);
    const localHourFromDate = asUtcDate.getUTCHours();
    const parts = parseSessionDateTime(raw);

    expect(parts.hour).toBe(11);
    expect(localHourFromDate).toBe(11);

    const argentinaOffsetHours = 3;
    const wrongInterpretation =
      (localHourFromDate - argentinaOffsetHours + 24) % 24;
    expect(parts.hour).not.toBe(wrongInterpretation);
  });

  it("soporta datetime sin milisegundos", () => {
    const parts = parseSessionDateTime("2026-01-05T09:00:00Z");
    expect(parts.hour).toBe(9);
    expect(parts.month).toBe(1);
  });

  it("tira error con formato inesperado", () => {
    expect(() => parseSessionDateTime("no es una fecha")).toThrow();
  });
});

describe("formatLocalDateTime", () => {
  it("formatea dd/mm/yyyy hh:mm", () => {
    const parts = parseSessionDateTime("2026-07-27T11:30:00.000Z");
    expect(formatLocalDateTime(parts)).toBe("27/07/2026 11:30");
  });

  it("rellena con ceros minutos y horas de un dígito", () => {
    const parts = parseSessionDateTime("2026-01-05T09:05:00.000Z");
    expect(formatLocalDateTime(parts)).toBe("05/01/2026 09:05");
  });
});

describe("formatLocalTime", () => {
  it("formatea solo hh:mm", () => {
    const parts = parseSessionDateTime("2026-07-27T23:45:00.000Z");
    expect(formatLocalTime(parts)).toBe("23:45");
  });
});

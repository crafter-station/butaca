import { describe, expect, it } from "bun:test";
import { escapeText } from "../src/escape.js";

describe("escapeText", () => {
  it("deja pasar texto normal con tildes y eñes", () => {
    expect(escapeText("LA ODISEA")).toBe("LA ODISEA");
    expect(escapeText("Peña")).toBe("Peña");
  });

  it("colapsa saltos de linea en espacio", () => {
    expect(escapeText("linea1\nlinea2")).toBe("linea1 linea2");
    expect(escapeText("linea1\r\nlinea2")).toBe("linea1 linea2");
  });

  it("elimina secuencias de escape ANSI", () => {
    const esc = String.fromCharCode(27);
    const withColor = `${esc}[31mALERTA${esc}[0m`;
    expect(escapeText(withColor)).toBe("ALERTA");
  });

  it("elimina caracteres de control invisibles", () => {
    const withNull = `titulo${String.fromCharCode(0)}oculto`;
    expect(escapeText(withNull)).toBe("titulooculto");
  });

  it("recorta espacios en los extremos", () => {
    expect(escapeText("  titulo  ")).toBe("titulo");
  });
});

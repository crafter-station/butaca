import { describe, expect, it } from "bun:test";
import { anchoVisible, barraOcupacion, bold, ocupacionDe, padVisible } from "../src/style.js";

// Los tests corren sin TTY, donde shouldColor() da false y las funciones de
// estilo devuelven el texto crudo. Para probar el alineado con ANSI presente
// hace falta inyectar los escapes a mano.
const ANSI = "\x1b[1mhola\x1b[0m";

describe("anchoVisible", () => {
  it("ignora los escapes ANSI", () => {
    expect(anchoVisible(ANSI)).toBe(4);
  });

  it("cuenta normal sin escapes", () => {
    expect(anchoVisible("hola")).toBe(4);
  });
});

describe("padVisible", () => {
  it("rellena segun el ancho visible, no el largo del string", () => {
    const out = padVisible(ANSI, 6);
    expect(anchoVisible(out)).toBe(6);
    expect(out.endsWith("  ")).toBe(true);
  });

  it("no recorta cuando el texto ya es mas ancho", () => {
    expect(padVisible("hola", 2)).toBe("hola");
  });
});

describe("bold sin TTY", () => {
  it("devuelve el texto crudo cuando el color esta apagado", () => {
    expect(bold("hola")).toBe("hola");
  });
});

describe("ocupacionDe", () => {
  // Umbrales calibrados contra 275 funciones reales: mediana 5 por ciento
  // vendido, maximo observado 71. Con cortes en 20/50/80 el balde "casi llena"
  // quedaba vacio y 230 de 275 filas caian todas en "vacia".
  it("sala intacta es vacia", () => {
    expect(ocupacionDe(250, 250)).toBe("vacía");
  });

  it("5 por ciento vendido sigue siendo vacia", () => {
    expect(ocupacionDe(237, 250)).toBe("vacía");
  });

  it("un cuarto vendido es llenandose", () => {
    expect(ocupacionDe(187, 250)).toBe("llenándose");
  });

  it("mitad vendida es casi llena", () => {
    expect(ocupacionDe(125, 250)).toBe("casi llena");
  });

  it("capacidad cero no divide por cero", () => {
    expect(ocupacionDe(0, 0)).toBe("vacía");
  });
});

describe("barraOcupacion", () => {
  it("sala intacta no dibuja bloques llenos", () => {
    expect(barraOcupacion(250, 250, 10)).not.toContain("█");
  });

  it("satura en el ancho pedido y no lo excede", () => {
    // 90 por ciento vendido esta arriba del tope de escala (50 por ciento).
    expect(anchoVisible(barraOcupacion(25, 250, 10))).toBe(10);
  });

  it("la barra llena coincide con la etiqueta casi llena", () => {
    const barra = barraOcupacion(125, 250, 10);
    expect(ocupacionDe(125, 250)).toBe("casi llena");
    expect(barra.split("█").length - 1).toBe(10);
  });

  it("respeta el ancho pedido siempre", () => {
    for (const libres of [0, 60, 125, 200, 250]) {
      expect(anchoVisible(barraOcupacion(libres, 250, 10))).toBe(10);
    }
  });
});

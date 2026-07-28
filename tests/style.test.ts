import { describe, expect, it } from "bun:test";
import { anchoVisible, barraOcupacion, bold, errAmber, errRed, ocupacionDe, padVisible } from "../src/style.js";

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
    // 90 por ciento vendido: la barra mide el ancho pedido igual.
    expect(anchoVisible(barraOcupacion(25, 250, 10))).toBe(10);
  });

  // Regresión: la escala llegaba solo hasta el 50 por ciento vendido, así que
  // toda función arriba de ese corte dibujaba la barra llena. Dos funciones
  // reales de la misma película, una al 54 por ciento y otra al 78, se veían
  // idénticas, o sea la barra dejaba de distinguir justo en el rango donde el
  // dato importa para elegir. La etiqueta sigue marcando el corte en palabras.
  it("distingue magnitudes por encima del 50 por ciento vendido", () => {
    const llenos = (b: string) => b.split("█").length - 1;
    const media = barraOcupacion(114, 250, 10); // 54 por ciento vendido
    const alta = barraOcupacion(31, 143, 10); // 78 por ciento vendido

    expect(ocupacionDe(114, 250)).toBe("casi llena");
    expect(ocupacionDe(31, 143)).toBe("casi llena");
    expect(llenos(media)).toBeLessThan(llenos(alta));
  });

  it("solo se llena entera cuando no queda ninguna butaca", () => {
    expect(barraOcupacion(0, 250, 10).split("█").length - 1).toBe(10);
    expect(barraOcupacion(125, 250, 10).split("█").length - 1).toBe(5);
  });

  it("respeta el ancho pedido siempre", () => {
    for (const libres of [0, 60, 125, 200, 250]) {
      expect(anchoVisible(barraOcupacion(libres, 250, 10))).toBe(10);
    }
  });
});

describe("color de diagnósticos (regresión)", () => {
  // Los errores van a stderr y shouldColor() miraba stdout, así que
  // `butaca ... | jq` dejaba los errores en gris plano justo cuando el humano
  // los está leyendo en su terminal. Los helpers err* deciden por stderr.
  const conEntorno = (env: Record<string, string | undefined>, fn: () => void) => {
    const previo = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    try {
      fn();
    } finally {
      process.env = previo;
    }
  };

  it("FORCE_COLOR enciende el rojo de error", () => {
    conEntorno({ FORCE_COLOR: "1", NO_COLOR: undefined }, () => {
      expect(errRed("Error")).toContain("38;5;203");
    });
  });

  it("NO_COLOR lo apaga aunque haya TTY", () => {
    conEntorno({ NO_COLOR: "1", FORCE_COLOR: undefined }, () => {
      expect(errRed("Error")).toBe("Error");
      expect(errAmber("Aviso")).toBe("Aviso");
    });
  });

  it("NO_COLOR gana sobre FORCE_COLOR", () => {
    conEntorno({ NO_COLOR: "1", FORCE_COLOR: "1" }, () => {
      expect(errRed("Error")).toBe("Error");
    });
  });
});

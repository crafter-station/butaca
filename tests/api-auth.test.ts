import { describe, expect, it } from "bun:test";
import { esVentaSuspendida, extractTransIdTemp, pricesQueryParams } from "../src/api-auth.js";

// Los dos bugs del segundo uso real. Ninguno de los 159 tests que había los
// cubría porque son de integración con el upstream, no de shape de datos.
describe("pricesQueryParams", () => {
  // Sin salesChannelToken el upstream responde 500 "The request is invalid".
  // Medido de a un parámetro: cinemaId+sessionId da 500, con feature sigue 500,
  // recién con el token da 200.
  it("incluye salesChannelToken, que el upstream exige", () => {
    const params = pricesQueryParams("733", "159037");
    expect(params.salesChannelToken).toBeTruthy();
    expect(params.cinemaId).toBe("733");
    expect(params.sessionId).toBe("159037");
  });
});

describe("extractTransIdTemp", () => {
  // El BFF mezcla convenciones: get-prices y order-tickets responden `data`,
  // order-get-map responde `Data`. El código leía solo `Data` y se rompía.
  it("acepta la respuesta con data minúscula", () => {
    expect(extractTransIdTemp({ data: { transIdTemp: 20012806088 } })).toBe(20012806088);
  });

  it("acepta la respuesta con Data mayúscula", () => {
    expect(extractTransIdTemp({ Data: { transIdTemp: 42 } })).toBe(42);
  });

  it("devuelve null si no viene en ninguna de las dos", () => {
    expect(extractTransIdTemp({})).toBeNull();
    expect(extractTransIdTemp({ data: {} })).toBeNull();
  });
});

describe("esVentaSuspendida", () => {
  // Cinemark corta la venta online por ventanas: order-tickets rechaza todo
  // mientras la lectura y get-prices siguen en 200. No hay flag en su config ni
  // código de error propio, así que el texto es el único indicador.
  it("reconoce el mensaje real del upstream", () => {
    expect(
      esVentaSuspendida(
        "Estimado Cliente: Le informamos que nuestro sistema de venta de entradas online se encuentra momentáneamente suspendido.",
      ),
    ).toBe(true);
  });

  it("no confunde un error cualquiera con una suspensión", () => {
    expect(esVentaSuspendida("The request is invalid.")).toBe(false);
    expect(esVentaSuspendida("Uno o más campos son requeridos.")).toBe(false);
  });
});

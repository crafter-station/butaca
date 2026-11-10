import { describe, expect, it } from "bun:test";
import { findProvider, listProviders, resolveProvider } from "../src/providers.js";

describe("providers", () => {
  it("cinemark-ar está verificada y trae los datos que el cliente necesita", () => {
    const p = resolveProvider("cinemark-ar");
    expect(p.status).toBe("verified");
    expect(p.apiBase).toStartWith("https://");
    expect(p.salesChannelToken).toBeTruthy();
  });

  it("Cineplanet Perú permite mapas sin abrir órdenes", () => {
    const provider = resolveProvider("cineplanet-pe");
    expect(provider.status).toBe("verified");
    expect(provider.seatsRequireOrder).toBe(false);
    expect(provider.apiBase).toBe("https://www.cineplanet.com.pe/api/v1-web");
  });

  it("una cadena desconocida lista las disponibles", () => {
    expect(() => resolveProvider("cinepolis-mx")).toThrow(/cinemark-ar/);
  });

  it("listProviders incluye las planned, para que se vean en el listado", () => {
    const ids = listProviders().map((p) => p.id);
    expect(ids).toContain("cinemark-ar");
    expect(ids).toContain("cineplanet-pe");
  });

  it("findProvider no distingue mayúsculas", () => {
    expect(findProvider("CINEMARK-AR")?.id).toBe("cinemark-ar");
  });
});

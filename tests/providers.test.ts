import { describe, expect, it } from "bun:test";
import { findProvider, listProviders, resolveProvider } from "../src/providers.js";

describe("providers", () => {
  it("cinemark-ar está verificada y trae los datos que el cliente necesita", () => {
    const p = resolveProvider("cinemark-ar");
    expect(p.status).toBe("verified");
    expect(p.apiBase).toStartWith("https://");
    expect(p.salesChannelToken).toBeTruthy();
  });

  // Una cadena declarada pero sin recon se rechaza al resolverla, no en medio de
  // un fetch: el usuario merece saber que falta el mapeo, no ver un error de red.
  it("una cadena planned falla con el motivo, no con un error de red", () => {
    expect(() => resolveProvider("cineplanet-pe")).toThrow(/todavía no está soportada/);
    expect(() => resolveProvider("cineplanet-pe")).toThrow(/403/);
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

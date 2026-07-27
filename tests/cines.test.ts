import { describe, expect, it } from "bun:test";
import { toTheater } from "../src/commands/cines.js";
import fixtures from "./fixtures/theaters.json" with { type: "json" };
import type { RawTheater } from "../src/types.js";

describe("toTheater (contrato cines)", () => {
  const raw = fixtures.data as unknown as RawTheater[];

  it("mapea el shape exacto del contrato", () => {
    const palermo = raw.find((t) => t.slug === "palermo");
    if (!palermo) throw new Error("fixture sin palermo");
    const theater = toTheater(palermo);

    expect(Object.keys(theater).sort()).toEqual(
      ["id", "slug", "name", "address", "city", "region", "lat", "lng"].sort(),
    );
    expect(theater).toEqual({
      id: 733,
      slug: "palermo",
      name: "Palermo",
      address: "Beruti 3399, Palermo CABA",
      city: "CABA",
      region: "Ciudad de Buenos Aires",
      lat: -34.5863,
      lng: -58.4101,
    });
  });

  it("convierte lat/lng de string a number", () => {
    const theater = toTheater(raw[0] as RawTheater);
    expect(typeof theater.lat).toBe("number");
    expect(typeof theater.lng).toBe("number");
  });

  it("usa location.name como region", () => {
    for (const t of raw) {
      const theater = toTheater(t);
      expect(theater.region).toBe(t.location.name);
    }
  });
});

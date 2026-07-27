import { describe, expect, it } from "bun:test";
import { toCarteleraMovie } from "../src/commands/cartelera.js";
import fixtures from "./fixtures/movies.json" with { type: "json" };
import type { RawCarteleraMovie } from "../src/types.js";

describe("toCarteleraMovie (contrato cartelera)", () => {
  const raw = fixtures.data as unknown as RawCarteleraMovie[];

  it("mapea el shape exacto del contrato", () => {
    const toyStory = raw.find((m) => m.slug === "toy-story-5");
    if (!toyStory) throw new Error("fixture sin toy-story-5");
    const movie = toCarteleraMovie(toyStory);

    expect(Object.keys(movie).sort()).toEqual(
      ["id", "corporateId", "slug", "title", "runTime", "rating", "formats", "premiere"].sort(),
    );
    expect(movie.corporateId).toBe("109144");
    expect(movie.slug).toBe("toy-story-5");
    expect(movie.formats).toEqual(["3D", "4D", "DBOX", "2D", "PRE"]);
  });

  it("aplana formats a un array de strings (shortName)", () => {
    for (const m of raw) {
      const movie = toCarteleraMovie(m);
      expect(Array.isArray(movie.formats)).toBe(true);
      for (const f of movie.formats) {
        expect(typeof f).toBe("string");
      }
    }
  });

  it("preserva corporateId para cross-referenciar con funciones", () => {
    const laOdisea = raw.find((m) => m.slug === "la-odisea");
    if (!laOdisea) throw new Error("fixture sin la-odisea");
    expect(toCarteleraMovie(laOdisea).corporateId).toBe("110137");
  });
});

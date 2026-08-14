import { describe, expect, it } from "bun:test";
import { linkCartelera, linkCorto, linkPelicula } from "../src/links.js";

// Los links salen de conducir el sitio con browser, no de adivinar rutas.
// ?cine= se verificó con control: sin el query el checkbox del cine queda en 0,
// con ?cine=palermo o ?cine=quilmes queda en 1 y el botón nombra ese cine.
describe("links verificados", () => {
  it("cartelera lleva el slug del cine en la ruta", () => {
    expect(linkCartelera("palermo")).toBe("https://www.cinemark.com.ar/cartelera/palermo");
  });

  it("pelicula sin cine no arrastra query", () => {
    expect(linkPelicula("la-odisea")).toBe("https://www.cinemark.com.ar/pelicula/la-odisea");
  });

  it("pelicula con cine preselecciona por query", () => {
    expect(linkPelicula("la-odisea", "palermo")).toBe(
      "https://www.cinemark.com.ar/pelicula/la-odisea?cine=palermo",
    );
  });

  // ?fecha= se probó dos veces (31/07 y 02/08) y el sitio dejó activo el primer
  // día disponible en ambos casos, así que no se emite.
  it("nunca emite ?fecha=, que el sitio ignora", () => {
    expect(linkPelicula("la-odisea", "palermo")).not.toContain("fecha");
  });

  it("linkCorto saca el prefijo que no aporta", () => {
    expect(linkCorto("https://www.cinemark.com.ar/cartelera/palermo")).toBe(
      "cinemark.com.ar/cartelera/palermo",
    );
  });
});

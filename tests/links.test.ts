import { describe, expect, it } from "bun:test";
import { linkCartelera, linkCheckout, linkCorto, linkPelicula } from "../src/links.js";

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

describe("linkCheckout (regresión)", () => {
  // El fallback anterior era "https://www.cinemark.com.ar/checkout", inventado
  // porque order-set-seats no devuelve ninguna URL (verificado sobre la
  // respuesta cruda: 39 campos, ninguno un link). Esa ruta redirige al home con
  // ?shouldAuthenticate=true, así que el usuario terminaba en la portada
  // después de reservar. La real se obtuvo recorriendo el flujo autenticado.
  it("apunta a la ruta de compra de la película", () => {
    expect(linkCheckout("spider-man-un-nuevo-dia")).toBe(
      "https://www.cinemark.com.ar/pelicula/spider-man-un-nuevo-dia/compra-entradas/mejoratuexperiencia",
    );
  });

  it("nunca vuelve al /checkout que redirige al home", () => {
    expect(linkCheckout("la-odisea")).not.toContain("/checkout");
  });
});

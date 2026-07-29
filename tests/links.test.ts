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

describe("linkCheckout: existe pero NO continúa una orden", () => {
  // Historia de dos correcciones sobre el mismo link. Primero era
  // "/checkout" escrito a mano, que redirige al home. Después la ruta real del
  // sitio, que carga la página pero **no puede continuar una orden abierta por
  // el CLI**: el carrito vive en `CNK_TICKET_PURCHASE_ST` (sessionStorage) más
  // `CNK_TICKET_PURCHASE_LS_<guid>` (localStorage), y nada de eso viaja en la
  // URL ni en una cookie, así que un tab nuevo abre con `tickets: []` y queda
  // en skeleton para siempre.
  //
  // Por eso `reservar` ya no emite esta URL: manda a la página de la película,
  // anunciada como "elegí de nuevo ahí para pagar". El helper queda porque la
  // ruta es un hallazgo verificado del recon, y este test fija que su uso es
  // informativo.
  it("construye la ruta que el sitio usa tras Comprar entradas", () => {
    expect(linkCheckout("spider-man-un-nuevo-dia")).toBe(
      "https://www.cinemark.com.ar/pelicula/spider-man-un-nuevo-dia/compra-entradas/mejoratuexperiencia",
    );
  });

  it("nunca vuelve al /checkout que redirige al home", () => {
    expect(linkCheckout("la-odisea")).not.toContain("/checkout");
  });
});

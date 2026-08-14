import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api.js";
import { reservarSugerido, buildTicketList } from "../src/commands/butacas.js";
import type { PriceCategory } from "../src/api-auth.js";
import fixture from "./fixtures/get-prices.json" with { type: "json" };

describe("buildTicketList: parsea el shape real de get-prices (categorías -> tickets -> buyOptions)", () => {
  const categories = fixture.data as unknown as PriceCategory[];

  it("toma el primer ticket de la primera categoría con su buyOption entero", () => {
    const ticketList = buildTicketList(categories);
    expect(ticketList).toHaveLength(1);
    expect(ticketList[0]).toEqual({
      areaCategoryCode: "",
      hOCode: "1697",
      recogId: 0,
      promoId: 0,
      voucher: "",
      quantity: 1,
      price: 2000000,
      ticketsQty: 1,
      buyOptions: [
        {
          recogId: 0,
          promoId: 0,
          cssClass: "ticket-price-reg",
          value: 2000000,
          valueWithoutTax: 1526700,
          service: 105000,
          buttonQty: 1,
          maxQty: 6,
          type: 3,
          level: 0,
          balances: [],
        },
      ],
    });
  });

  it("usa hoCode (h minúscula) del ticket, no un hOCode inventado", () => {
    const ticketList = buildTicketList(categories);
    // El shape de respuesta trae `hoCode`; el body de order-tickets pide
    // `hOCode`. La conversión de convención pasa acá, una sola vez.
    expect(ticketList[0]?.hOCode).toBe("1697");
  });

  it("propaga la cantidad pedida a order-tickets", () => {
    expect(buildTicketList(categories, 2)[0]?.quantity).toBe(2);
  });

  it("falla con PRICES_UNAVAILABLE si get-prices no trae categorías", () => {
    expect(() => buildTicketList([])).toThrow(ApiError);
    try {
      buildTicketList([]);
    } catch (err) {
      expect((err as ApiError).code).toBe("PRICES_UNAVAILABLE");
      expect((err as ApiError).retryable).toBe(false);
      expect((err as ApiError).sideEffect).toBe("none");
    }
  });

  it("falla con PRICES_UNAVAILABLE si la categoría no trae tickets", () => {
    const empty: PriceCategory[] = [
      { categoryId: 1, title: "GENERAL", cssClass: "standard", showTitle: true, tickets: [] },
    ];
    expect(() => buildTicketList(empty)).toThrow(ApiError);
  });
});

describe("reservarSugerido: no sugiere la butaca preasignada (regresión)", () => {
  // La preasignada (statusId 5) pertenece a la orden que la creó y muere con
  // ella: `reservar` abre una orden nueva, recibe otra preasignada, y la
  // anterior vuelve al mapa como NO_DISPONIBLE. Sugerirla producía un comando
  // que fallaba al pegarlo. Verificado con tres llamadas seguidas a la misma
  // función: 13-4, 13-6, 13-8, cada una con su propio transIdTemp.
  it("elige una libre aunque haya una preasignada disponible", () => {
    const mapa = {
      areas: [
        {
          code: "0000000001",
          number: "1",
          seats: [
            { row: "13", number: "4", gridRow: "2", gridNumber: "1", status: "AUTO_ASIGNADA", statusId: 5 },
            { row: "5", number: "7", gridRow: "3", gridNumber: "2", status: "DISPONIBLE", statusId: 0 },
          ],
        },
      ],
      summary: { total: 2, available: 1, accessible: 0, broken: 0 },
    } as unknown as Parameters<typeof reservarSugerido>[2];

    const sugerido = reservarSugerido("159147", "palermo", mapa);
    expect(sugerido).toContain("5-7");
    expect(sugerido).not.toContain("13-4");
  });
});

import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api.js";
import { buildTicketList } from "../src/commands/butacas.js";
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

  it("falla con ORDER_FAILED si get-prices no trae categorías", () => {
    expect(() => buildTicketList([])).toThrow(ApiError);
    try {
      buildTicketList([]);
    } catch (err) {
      expect((err as ApiError).code).toBe("ORDER_FAILED");
    }
  });

  it("falla con ORDER_FAILED si la categoría no trae tickets", () => {
    const empty: PriceCategory[] = [
      { categoryId: 1, title: "GENERAL", cssClass: "standard", showTitle: true, tickets: [] },
    ];
    expect(() => buildTicketList(empty)).toThrow(ApiError);
  });
});

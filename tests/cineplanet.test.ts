import { describe, expect, it } from "bun:test";
import {
  CineplanetClient,
  type CpLayout,
  limaDate,
  normalizeCpSeats,
  renderCpSeats,
} from "../src/api-cineplanet.js";
import { sugerirGrupoButacas } from "../src/seat-map.js";

describe("Cineplanet Perú", () => {
  it("inicia una sesión pública una vez y solo usa HEAD y GET", async () => {
    const calls: { url: string; method: string; cookie: string | null }[] = [];
    const request = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        cookie: new Headers(init?.headers).get("Cookie"),
      });
      if (init?.method === "HEAD")
        return new Response(null, {
          headers: {
            "Set-Cookie": "channel-token=public-test; Path=/; Secure",
          },
        });
      return Response.json({ cinemas: [], movies: [], sessions: [] });
    }) as typeof fetch;
    const client = new CineplanetClient(request);
    await client.catalog();
    expect(calls.filter((c) => c.method === "HEAD")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(3);
    expect(
      calls.slice(1).every((c) => c.cookie === "channel-token=public-test"),
    ).toBe(true);
    await expect(client.get("add-tickets")).rejects.toThrow("no permitida");
    expect(calls).toHaveLength(4);
  });

  it("renueva una sesión vencida una sola vez", async () => {
    let heads = 0;
    let gets = 0;
    const request = (async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        heads++;
        return new Response(null, {
          headers: { "Set-Cookie": `channel-token=test-${heads}; Path=/` },
        });
      }
      gets++;
      return new Response(null, { status: 403 });
    }) as typeof fetch;
    await expect(
      new CineplanetClient(request).get("cache/moviescache"),
    ).rejects.toThrow("403");
    expect(heads).toBe(2);
    expect(gets).toBe(2);
  });

  it("no confunde Lima con UTC ni acepta fechas imposibles", () => {
    const now = new Date("2026-11-10T02:00:00Z");
    expect(limaDate("hoy", now)).toBe("2026-11-09");
    expect(limaDate("mañana", now)).toBe("2026-11-10");
    expect(limaDate("mañana", new Date("2026-12-31T23:00:00Z"))).toBe(
      "2027-01-01",
    );
    expect(() => limaDate("2026-02-30", now)).toThrow("Fecha inválida");
  });

  it("preserva huecos y orienta filas desde la pantalla, sin recomendar ocupadas o accesibles", () => {
    const seat = (
      Id: string,
      Status: number,
      RowIndex: number,
      ColumnIndex: number,
    ) => ({ Id, Status, Position: { RowIndex, ColumnIndex } });
    const raw: CpLayout = {
      ResponseCode: "0",
      SeatLayoutData: {
        Areas: [
          {
            Number: 1,
            AreaCategoryCode: "regular",
            Rows: [
              {
                PhysicalName: "M",
                Seats: [
                  seat("1", 0, 0, 0),
                  seat("2", 0, 0, 2),
                  seat("3", 5, 0, 3),
                ],
              },
              {
                PhysicalName: "C",
                Seats: [
                  seat("0", 3, 10, 0),
                  seat("4", 1, 10, 1),
                  seat("5", 99, 10, 2),
                ],
              },
            ],
          },
        ],
      },
    };
    const map = normalizeCpSeats(raw);
    const seats = map.areas[0]?.seats ?? [];
    expect(seats.find((s) => s.row === "M")?.gridRow).toBe("11");
    expect(seats.find((s) => s.row === "C")?.gridRow).toBe("1");
    const rendered = renderCpSeats(map, true);
    expect(rendered.indexOf("C  ")).toBeLessThan(rendered.indexOf("M  "));
    const backRow =
      rendered.split("\n").find((line) => line.startsWith("M  ")) ?? "";
    expect(backRow.trim().split(/\s+/)).toEqual(["M", "3", "2", "1"]);
    expect(map.summary.available).toBe(2);
    expect(map.summary.accessible).toBe(1);
    expect(sugerirGrupoButacas(map, 2)).toEqual([]);
    expect(sugerirGrupoButacas(map, 1)[0]?.row).toBe("M");
  });

  it("rechaza disponibilidad inválida en lugar de inventar cero", async () => {
    const request = (async (_url: unknown, init?: RequestInit) =>
      init?.method === "HEAD"
        ? new Response(null, {
            headers: { "Set-Cookie": "channel-token=test; Path=/" },
          })
        : Response.json({
            "available-seats": -1,
            seatsTotal: 20,
          })) as typeof fetch;
    await expect(
      new CineplanetClient(request).availability("0000000007", "123"),
    ).rejects.toThrow("disponibilidad válida");
  });
  it("usa el mapa real cuando el contador excede la capacidad", async () => {
    const request = (async (url: unknown, init?: RequestInit) => {
      if (init?.method === "HEAD")
        return new Response(null, {
          headers: { "Set-Cookie": "channel-token=test; Path=/" },
        });
      if (String(url).includes("sessionavailable"))
        return Response.json({ "available-seats": 229, seatsTotal: 227 });
      return Response.json({
        ResponseCode: "0",
        SeatLayoutData: {
          Areas: [
            {
              Number: 1,
              AreaCategoryCode: "regular",
              Rows: [
                {
                  PhysicalName: "C",
                  Seats: [
                    {
                      Id: "1",
                      Status: 0,
                      Position: { RowIndex: 0, ColumnIndex: 0 },
                    },
                    {
                      Id: "2",
                      Status: 1,
                      Position: { RowIndex: 0, ColumnIndex: 1 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
    }) as typeof fetch;
    expect(
      await new CineplanetClient(request).availability("0000000007", "123"),
    ).toEqual({ available: 1, capacity: 2, pct: 50 });
  });
});

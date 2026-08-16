import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { buildButacasPayload, runButacas } from "../src/commands/butacas.js";
import { runReservar } from "../src/commands/reservar.js";
import { resolveProvider } from "../src/providers.js";
import type { Flags } from "../src/format.js";
import { readdir } from "node:fs/promises";
import { SCHEMAS } from "../src/commands/schema.js";
import { parseSeatMap } from "../src/seat-map.js";
import seatMapFixture from "./fixtures/seat-map.json" with { type: "json" };
import type { RawSeatMapResponse } from "../src/api-auth.js";

const FLAGS: Flags = {
  json: true,
  noCache: false,
  todas: false,
  todos: false,
  open: false, numeros: false,
  help: false,
  version: false,
  fields: null,
};

let captured: string[];
let originalWrite: typeof process.stdout.write;

beforeEach(() => {
  captured = [];
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    captured.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

function readEnvelope(): { ok: boolean; error?: { code: string; message: string; hint: string } } {
  return JSON.parse(captured.join(""));
}

describe("butaca butacas: shape JSON, sin red", () => {
  const CINEMARK = resolveProvider("cinemark-ar");
  const CINEPOLIS = resolveProvider("cinepolis-ar");

  it("sin --cine, BAD_INPUT antes de tocar la red", async () => {
    const code = await runButacas(
      CINEMARK,
      { sessionId: "159037", cine: null, dryRun: false },
      FLAGS,
      true,
    );
    expect(code).toBe(1);
    const envelope = readEnvelope();
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("BAD_INPUT");
    expect(envelope.error?.message).toContain("--cine");
  });

  it("sin --cine, incluso en --dry-run sigue pidiendo el cine", async () => {
    const code = await runButacas(
      CINEMARK,
      { sessionId: "159037", cine: null, dryRun: true },
      FLAGS,
      true,
    );
    expect(code).toBe(1);
    const envelope = readEnvelope();
    expect(envelope.error?.code).toBe("BAD_INPUT");
  });

  // La cadena que no abre orden toma otro camino entero, así que la misma
  // garantía hay que probarla ahí también: sin --cine no se toca la red.
  it("en una cadena sin orden, sin --cine también corta antes de la red", async () => {
    const code = await runButacas(
      CINEPOLIS,
      { sessionId: "131742", cine: null, dryRun: false },
      FLAGS,
      true,
    );
    expect(code).toBe(1);
    const envelope = readEnvelope();
    expect(envelope.error?.code).toBe("BAD_INPUT");
    expect(envelope.error?.message).toContain("--cine");
  });
});

describe("butaca reservar: shape JSON, sin red", () => {
  it("sin --asientos, BAD_INPUT antes de tocar la red", async () => {
    const code = await runReservar(
      { sessionId: "159037", cine: "palermo", asientos: [], asignada: false, orden: null, dryRun: false, yes: true },
      FLAGS,
      true,
    );
    expect(code).toBe(1);
    const envelope = readEnvelope();
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("BAD_INPUT");
    expect(envelope.error?.message).toContain("--asientos");
  });
});

describe("schema cubre todos los comandos (regresión)", () => {
  // `schema` existe para que un agente no tenga que parsear --help. Cuando
  // quedó atrás cubría 3 de 8 comandos: estrenos, butacas, reservar, auth y el
  // propio schema devolvían BAD_INPUT. Un contrato incompleto es peor que uno
  // ausente, porque el agente que pide el que falta concluye que el comando no
  // existe. Este test falla en cuanto se agrega un comando sin su shape.
  it("todo comando con archivo en src/commands tiene entrada en SCHEMAS", async () => {
    const dir = new URL("../src/commands/", import.meta.url);
    const archivos = await readdir(dir);
    const comandos = archivos
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();

    const cubiertos = Object.keys(SCHEMAS).sort();
    expect(cubiertos).toEqual(comandos);
  });

  it("el payload emitido por butacas tiene exactamente las claves declaradas", () => {
    const payload = buildButacasPayload({
      sessionId: "161965",
      cinemaId: "733",
      transIdTemp: 42,
      seatMap: parseSeatMap(seatMapFixture as unknown as RawSeatMapResponse),
      funcion: null,
      siteUrl: null,
    });
    const schema = SCHEMAS.butacas as { shape: Record<string, unknown> };
    expect(Object.keys(payload).sort()).toEqual(Object.keys(schema.shape).sort());
  });

  it("cada schema declara su versión y su shape", () => {
    for (const [nombre, valor] of Object.entries(SCHEMAS)) {
      const s = valor as { version?: string; shape?: unknown };
      expect(typeof s.version, `${nombre} sin version`).toBe("string");
      expect(s.shape, `${nombre} sin shape`).toBeDefined();
    }
  });

  it("recomendar publica el mismo shape base que elegir", () => {
    const elegir = SCHEMAS.elegir as { shape: Record<string, unknown> };
    const recomendar = SCHEMAS.recomendar as { shape: Record<string, unknown> };
    expect(recomendar.shape).toEqual(elegir.shape);
  });
});

describe("errores de argumentos del CLI", () => {
  it("mantiene el envelope JSON antes de resolver los flags", () => {
    const result = Bun.spawnSync([
      process.execPath,
      new URL("../src/cli.ts", import.meta.url).pathname,
      "recomendar",
      "spiderman",
      "--personas",
      "0",
      "--json",
    ]);
    const envelope = JSON.parse(result.stdout.toString());
    expect(result.exitCode).toBe(1);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("BAD_INPUT");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { runButacas } from "../src/commands/butacas.js";
import { runReservar } from "../src/commands/reservar.js";
import type { Flags } from "../src/format.js";

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
  it("sin --cine, BAD_INPUT antes de tocar la red", async () => {
    const code = await runButacas({ sessionId: "159037", cine: null, dryRun: false }, FLAGS, true);
    expect(code).toBe(1);
    const envelope = readEnvelope();
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("BAD_INPUT");
    expect(envelope.error?.message).toContain("--cine");
  });

  it("sin --cine, incluso en --dry-run sigue pidiendo el cine", async () => {
    const code = await runButacas({ sessionId: "159037", cine: null, dryRun: true }, FLAGS, true);
    expect(code).toBe(1);
    const envelope = readEnvelope();
    expect(envelope.error?.code).toBe("BAD_INPUT");
  });
});

describe("butaca reservar: shape JSON, sin red", () => {
  it("sin --asientos, BAD_INPUT antes de tocar la red", async () => {
    const code = await runReservar(
      { sessionId: "159037", cine: "palermo", asientos: [], dryRun: false, yes: true },
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

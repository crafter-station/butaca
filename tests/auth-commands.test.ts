import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuthLogout, runAuthStatus } from "../src/commands/auth.js";
import { saveConfig } from "../src/config.js";

let scratchDir: string;
let originalHome: string | undefined;
let captured: string[];
let originalWrite: typeof process.stdout.write;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "butaca-authcmd-"));
  originalHome = process.env.BUTACA_HOME;
  process.env.BUTACA_HOME = scratchDir;

  captured = [];
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    captured.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalWrite;
  if (originalHome === undefined) {
    delete process.env.BUTACA_HOME;
  } else {
    process.env.BUTACA_HOME = originalHome;
  }
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("butaca auth status: shape JSON", () => {
  it("sin sesión, devuelve AUTH_REQUIRED con exit 1", () => {
    const code = runAuthStatus(true);
    expect(code).toBe(1);
    const envelope = JSON.parse(captured.join(""));
    expect(envelope).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "No hay sesión activa",
        hint: "No hay sesión. Corré `butaca auth login`.",
      },
    });
  });

  it("con sesión activa, devuelve email y expiresAt", () => {
    saveConfig({
      email: "hunter@example.invalid",
      session: { cookie: "next-auth.session-token=abc", memberSessionId: "msid-de-prueba", memberId: "10000001", expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    const code = runAuthStatus(true);
    expect(code).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({
      email: "hunter@example.invalid",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("con sesión vencida, devuelve AUTH_EXPIRED distinto de AUTH_REQUIRED", () => {
    saveConfig({
      email: "hunter@example.invalid",
      session: { cookie: "next-auth.session-token=abc", memberSessionId: "msid-de-prueba", memberId: "10000001", expiresAt: "2000-01-01T00:00:00.000Z" },
    });

    const code = runAuthStatus(true);
    expect(code).toBe(1);
    const envelope = JSON.parse(captured.join(""));
    expect(envelope.error.code).toBe("AUTH_EXPIRED");
    expect(envelope.error.hint).toContain("butaca auth login");
  });
});

describe("butaca auth logout: shape JSON", () => {
  it("borra la sesión y confirma con loggedOut", () => {
    saveConfig({
      email: "hunter@example.invalid",
      session: { cookie: "next-auth.session-token=abc", memberSessionId: "msid-de-prueba", memberId: "10000001", expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    const code = runAuthLogout(true);
    expect(code).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({ loggedOut: true });

    captured = [];
    const statusAfter = runAuthStatus(true);
    expect(statusAfter).toBe(1);
  });
});

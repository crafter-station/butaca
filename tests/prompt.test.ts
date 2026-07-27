import { describe, expect, it } from "bun:test";
import { promptPassword } from "../src/prompt.js";

describe("promptPassword", () => {
  // El caso que importa para un CLI agent-first: sin TTY tiene que devolver
  // null y dejar que el caller falle con AUTH_REQUIRED, nunca quedarse
  // esperando input que no va a llegar.
  it("devuelve null sin TTY, en vez de colgarse", async () => {
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      expect(await promptPassword("Contraseña: ")).toBeNull();
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: original,
        configurable: true,
      });
    }
  });

  it("devuelve null si el stdin no soporta modo raw", async () => {
    const originalTty = process.stdin.isTTY;
    const originalRaw = process.stdin.setRawMode;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdin, "setRawMode", {
      value: undefined,
      configurable: true,
    });
    try {
      expect(await promptPassword("Contraseña: ")).toBeNull();
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalTty,
        configurable: true,
      });
      Object.defineProperty(process.stdin, "setRawMode", {
        value: originalRaw,
        configurable: true,
      });
    }
  });
});

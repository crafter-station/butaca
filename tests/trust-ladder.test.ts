import { describe, expect, it } from "bun:test";
import { needsInteractiveConfirmation } from "../src/commands/reservar.js";

describe("needsInteractiveConfirmation (trust ladder de reservar)", () => {
  it("con --yes nunca pide confirmación, aunque haya TTY", () => {
    expect(needsInteractiveConfirmation({ yes: true, machineMode: false, stdinIsTty: true })).toBe(false);
    expect(needsInteractiveConfirmation({ yes: true, machineMode: true, stdinIsTty: false })).toBe(false);
  });

  it("sin --yes y sin TTY, falla en vez de colgarse", () => {
    expect(needsInteractiveConfirmation({ yes: false, machineMode: false, stdinIsTty: false })).toBe(true);
  });

  it("sin --yes en modo máquina, falla aunque haya TTY", () => {
    expect(needsInteractiveConfirmation({ yes: false, machineMode: true, stdinIsTty: true })).toBe(true);
  });

  it("sin --yes pero con TTY interactivo real, sí puede preguntar", () => {
    expect(needsInteractiveConfirmation({ yes: false, machineMode: false, stdinIsTty: true })).toBe(false);
  });
});

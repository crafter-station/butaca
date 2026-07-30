import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cadenaEfectiva, cineEfectivo, loadPrefs, setPref, unsetPref } from "../src/prefs.js";

describe("prefs", () => {
  let home: string;
  let previo: string | undefined;

  beforeEach(() => {
    previo = process.env.BUTACA_HOME;
    home = mkdtempSync(join(tmpdir(), "butaca-prefs-"));
    process.env.BUTACA_HOME = home;
    delete process.env.BUTACA_CINE;
    delete process.env.BUTACA_CADENA;
  });

  afterEach(() => {
    if (previo === undefined) delete process.env.BUTACA_HOME;
    else process.env.BUTACA_HOME = previo;
    rmSync(home, { recursive: true, force: true });
  });

  it("sin archivo devuelve vacío, no rompe", () => {
    expect(loadPrefs()).toEqual({});
  });

  it("guarda y lee el cine", () => {
    setPref("cine", "palermo");
    expect(loadPrefs().cine).toBe("palermo");
  });

  it("unset borra solo esa clave", () => {
    setPref("cine", "palermo");
    setPref("cadena", "cinemark-ar");
    unsetPref("cine");
    expect(loadPrefs()).toEqual({ cadena: "cinemark-ar" });
  });

  // El flag tiene que ganar para que un script no quede a merced de la
  // configuración de quien lo corre.
  it("precedencia: flag > entorno > guardado > default", () => {
    setPref("cine", "guardado");
    expect(cineEfectivo("flag")).toBe("flag");

    process.env.BUTACA_CINE = "entorno";
    expect(cineEfectivo(null)).toBe("entorno");

    delete process.env.BUTACA_CINE;
    expect(cineEfectivo(null)).toBe("guardado");

    unsetPref("cine");
    expect(cineEfectivo(null)).toBeNull();
  });

  it("la cadena cae al default cuando no hay nada guardado", () => {
    expect(cadenaEfectiva(null)).toBe("cinemark-ar");
  });

  // Una preferencia que apunta a una cadena retirada dejaría el CLI inutilizable
  // en cada comando, lejos de la causa. Se ignora y se cae al default.
  it("una cadena guardada que ya no existe no rompe el CLI", () => {
    setPref("cadena", "cadena-que-se-retiro");
    expect(cadenaEfectiva(null)).toBe("cinemark-ar");
  });
});

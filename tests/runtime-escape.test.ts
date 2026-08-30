import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * El guard de runtime solo dispara bajo Node, y la suite corre bajo Bun. Un
 * test que importara `runConfig` directo pasaría por la rama feliz y quedaría
 * verde para siempre sin probar nada.
 *
 * Así que estos tests invocan el binario compilado con Node de verdad, con un
 * BUTACA_HOME descartable donde la cadena guardada exige Bun. Es exactamente
 * el estado en el que quedó Hunter en 0.4.0: cada comando, incluido el que el
 * mensaje de error recomendaba, moría en el mismo throw.
 */
const CLI = join(import.meta.dir, "..", "dist", "cli.js");

function conCadenaGuardada(cadena: string, args: string[]) {
  const home = mkdtempSync(join(tmpdir(), "butaca-escape-"));
  writeFileSync(join(home, "prefs.json"), JSON.stringify({ cine: "palermo", cadena }));
  try {
    // BUTACA_CADENA se borra en vez de vaciarse: `?? ` no trata "" como
    // ausente, así que un string vacío se leería como cadena explícita y
    // taparía justo la preferencia guardada que estos tests quieren ejercitar.
    const env: Record<string, string | undefined> = {
      ...process.env,
      BUTACA_HOME: home,
      NO_COLOR: "1",
    };
    delete env.BUTACA_CADENA;
    delete env.BUTACA_CINE;
    const r = spawnSync("node", [CLI, ...args], { env, encoding: "utf8" });
    return { ...r, home };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("salida del bloqueo por runtime", () => {
  if (!existsSync(CLI)) {
    it.skip("necesita dist/cli.js, corré bun run build", () => {});
    return;
  }

  it("config set cadena revierte la preferencia aunque la guardada exija Bun", () => {
    const r = conCadenaGuardada("cinepolis-ar", ["config", "set", "cadena", "cinemark-ar"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("cinemark-ar");
    expect(r.stderr).not.toContain("necesita Bun");
  });

  it("cadenas lista aunque la cadena guardada exija Bun", () => {
    const r = conCadenaGuardada("cinepolis-ar", ["cadenas"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("cinemark-ar");
  });

  it("config get lee las prefs aunque la cadena guardada exija Bun", () => {
    const r = conCadenaGuardada("cinepolis-ar", ["config"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("cinepolis-ar");
  });

  it("schema responde aunque la cadena guardada exija Bun", () => {
    const r = conCadenaGuardada("cinepolis-ar", ["schema"]);
    expect(r.status).toBe(0);
  });

  it("los comandos locales declaran source local, no el host de una cadena", () => {
    const r = conCadenaGuardada("cinemark-ar", ["config", "--json"]);
    expect(r.status).toBe(0);
    const envelope = JSON.parse(r.stdout) as { meta: { source: string } };
    expect(envelope.meta.source).toBe("local");
  });

  it("un comando que sí pega a la red sigue bloqueado, con el motivo", () => {
    const r = conCadenaGuardada("cinepolis-ar", ["cines"]);
    expect(r.status).not.toBe(0);
    const salida = r.stdout + r.stderr;
    expect(salida).toContain("necesita Bun");
    expect(salida).toContain("butaca config set cadena cinemark-ar");
  });
});

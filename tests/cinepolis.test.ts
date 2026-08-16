import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cineEfectivo, setPref } from "../src/prefs.js";
import { contarButacas } from "../src/api-graphql.js";
import { BUTACAS_MAX_LOOKUPS } from "../src/commands/funciones.js";
import type { CinepolisSeatMap } from "../src/api-graphql.js";
import {
  comando,
  findProvider,
  mensajeRuntimeFaltante,
  resolveProvider,
  setInvocacion,
} from "../src/providers.js";
import { isBun, runtimeName } from "../src/runtime.js";

describe("cinepolis-ar en el registro", () => {
  it("está verificada y declara la forma de su API", () => {
    const p = resolveProvider("cinepolis-ar");
    expect(p.status).toBe("verified");
    expect(p.kind).toBe("graphql");
    expect(p.apiBase).toBe("https://api-g.cinepolis.com");
  });

  // Sin la api key el gateway responde 401, así que su ausencia rompe todos los
  // comandos y no solo alguno.
  it("trae la api key que el gateway exige", () => {
    const p = resolveProvider("cinepolis-ar");
    expect(p.apiKey).toBeTruthy();
  });

  // Este flag es el que decide si `butacas` es read-only o write-soft, así que
  // un cambio silencioso movería un comando de CONTRACT.md a CONTRACT-AUTH.md.
  it("declara que leer butacas no abre una orden, a diferencia de Cinemark", () => {
    expect(resolveProvider("cinepolis-ar").seatsRequireOrder).toBe(false);
    expect(resolveProvider("cinemark-ar").seatsRequireOrder).toBe(true);
  });

  it("cinemark-ar sigue siendo REST y sin requisito de runtime", () => {
    const p = resolveProvider("cinemark-ar");
    expect(p.kind).toBe("rest");
    expect(p.requiresRuntime).toBeUndefined();
  });
});

describe("guard de runtime", () => {
  // La suite corre bajo Bun, que es justo el runtime que pasa. Verificamos la
  // rama que podemos observar acá y dejamos explícito por qué la otra no.
  it("bajo Bun resuelve sin bloquear", () => {
    expect(isBun()).toBe(true);
    expect(runtimeName()).toBe("Bun");
    expect(() => resolveProvider("cinepolis-ar")).not.toThrow();
  });

  it("declara el runtime que su edge exige", () => {
    expect(findProvider("cinepolis-ar")?.requiresRuntime).toBe("bun");
  });

  // El valor del mensaje está en que sea accionable: un 403 crudo manda al
  // usuario a revisar su conexión, que es exactamente lo que no falla. Se
  // verifica el texto que produce el código, no una copia escrita a mano: la
  // suite corre bajo Bun y la rama del throw nunca se ejecuta, así que una copia
  // quedaría verde aunque el mensaje real cambiara.
  it("el mensaje de bloqueo dice cómo instalar Bun y cómo seguir sin él", () => {
    const p = findProvider("cinepolis-ar");
    if (!p) throw new Error("cinepolis-ar debería estar en el registro");
    const msg = mensajeRuntimeFaltante(p, "Node 26.4.0");
    expect(msg).toContain("Cinépolis");
    expect(msg).toContain("Node 26.4.0");
    expect(msg).toContain("bun.sh/install");
    expect(msg).toContain("--cadena cinemark-ar");
  });

  // Encontrado corriendo el paquete ya publicado en npm: `bun x butaca`
  // respeta el shebang (#!/usr/bin/env node) y vuelve a ejecutar bajo Node, o
  // sea que aterriza en este mismo error. El mensaje que existe para desatascar
  // al usuario lo mandaba a un callejón. Solo `--bun` fuerza el runtime.
  it("sugiere la invocación que realmente usa Bun, no la que cae a Node", () => {
    const p = findProvider("cinepolis-ar");
    if (!p) throw new Error("cinepolis-ar debería estar en el registro");
    const msg = mensajeRuntimeFaltante(p, "Node 26.4.0");
    expect(msg).toContain("bun --bun x butaca");
    expect(msg).not.toMatch(/[^-]bun x butaca/);
  });
});

describe("comandos sugeridos", () => {
  // Un comando que el CLI imprime existe para copiarse y andar. Bajo una cadena
  // que exige otro runtime, `butaca funciones ...` pelado se copia y choca
  // contra el guard: el CLI enseñaba la invocación que él mismo rechaza.
  // Encontrado por Hunter copiando una fila de la tabla.
  it("no lleva prefijo de runtime: esa rama nunca se ejecutaría", () => {
    setInvocacion(resolveProvider("cinepolis-ar"));
    expect(comando("funciones --cine x")).toBe(
      "butaca funciones --cine x --cadena cinepolis-ar",
    );
  });

  // Sin --cadena el comando copiado corre contra la default y devuelve otra
  // cosa, o NOT_FOUND si el slug es de esta cadena.
  it("incluye la cadena cuando no es la default", () => {
    setInvocacion(resolveProvider("cinepolis-ar"));
    expect(comando("cines")).toContain("--cadena cinepolis-ar");
  });

  it("no ensucia los comandos de la cadena default", () => {
    setInvocacion(resolveProvider("cinemark-ar"));
    expect(comando("funciones --cine palermo")).toBe("butaca funciones --cine palermo");
  });
});

describe("mensaje del guard según de dónde salió la cadena", () => {
  const p = resolveProvider("cinepolis-ar");

  // Si la cadena está guardada en prefs, cada comando choca con el guard hasta
  // que se cambie: decir "usá --cadena" no saca al usuario del estado.
  it("con la cadena guardada, dice cómo revertir la preferencia", () => {
    const msg = mensajeRuntimeFaltante(p, "Node 26.4.0", true);
    expect(msg).toContain("butaca config set cadena cinemark-ar");
  });

  it("con la cadena pasada por flag, ofrece el flag de salida", () => {
    const msg = mensajeRuntimeFaltante(p, "Node 26.4.0", false);
    expect(msg).toContain("butaca --cadena cinemark-ar");
    expect(msg).not.toContain("config set");
  });
});

describe("preferencia de cine entre cadenas", () => {
  let home: string;
  let previo: string | undefined;

  beforeEach(() => {
    previo = process.env.BUTACA_HOME;
    home = mkdtempSync(join(tmpdir(), "butaca-cp-"));
    process.env.BUTACA_HOME = home;
    delete process.env.BUTACA_CINE;
    delete process.env.BUTACA_CADENA;
  });

  afterEach(() => {
    if (previo === undefined) delete process.env.BUTACA_HOME;
    else process.env.BUTACA_HOME = previo;
    rmSync(home, { recursive: true, force: true });
  });

  function escribirPrefs(prefs: { cine: string; cadena?: string }): void {
    setPref("cine", prefs.cine);
    if (prefs.cadena) setPref("cadena", prefs.cadena);
  }

  // Bug encontrado corriendo el CLI, no los tests: con `cine: "palermo"`
  // guardado (Cinemark) y --cadena cinepolis-ar, el slug se aplicaba como filtro
  // a una cadena que no lo tiene y la cartelera salía vacía con ok:true. Un
  // resultado vacío se lee como "no hay funciones", que es peor que no filtrar.
  it("ignora un cine guardado si pertenece a otra cadena", () => {
    escribirPrefs({ cine: "palermo", cadena: "cinemark-ar" });
    expect(cineEfectivo(null, "cinepolis-ar")).toBeNull();
  });

  it("lo usa cuando la cadena coincide", () => {
    escribirPrefs({ cine: "palermo", cadena: "cinemark-ar" });
    expect(cineEfectivo(null, "cinemark-ar")).toBe("palermo");
  });

  // Sin `cadena` guardada, la preferencia es de antes de que existieran varias
  // cadenas: pertenece a la default.
  it("una preferencia vieja sin cadena se asume de la cadena default", () => {
    escribirPrefs({ cine: "palermo" });
    expect(cineEfectivo(null, "cinemark-ar")).toBe("palermo");
    expect(cineEfectivo(null, "cinepolis-ar")).toBeNull();
  });

  it("un --cine explícito gana siempre, sin importar la cadena", () => {
    escribirPrefs({ cine: "palermo", cadena: "cinemark-ar" });
    expect(cineEfectivo("cinepolis-recoleta-buenos-aires", "cinepolis-ar")).toBe(
      "cinepolis-recoleta-buenos-aires",
    );
  });
});

describe("tope de consultas de butacas", () => {
  // El tope decide si el caso más común del CLI (`butaca <cine>`, que muestra un
  // día) trae butacas o muestra 0/0 en cada fila. Estaba en 40 y el día pico
  // medido de la cadena es 55, así que 3 de 5 cines quedaban sin el dato. El
  // número tiene que cubrir el peor día real, no una estimación.
  const PICO_MEDIDO_POR_DIA = 55; // avellaneda, 2026-08-16
  it("cubre el día más cargado observado en la cadena", () => {
    expect(BUTACAS_MAX_LOOKUPS).toBeGreaterThanOrEqual(PICO_MEDIDO_POR_DIA);
  });
});

describe("contarButacas", () => {
  const mk = (statuses: string[]): CinepolisSeatMap => ({
    maxQuantity: 10,
    seats: statuses.map((status, i) => ({
      id: `s${i}`,
      status,
      seatStyle: "",
      row: "A",
      columnIndex: i,
      rowIndex: 0,
      areaNumber: 0,
    })),
  });

  // El upstream no da un conteo confiable: `availability` de una función es un
  // color hex (#FFBE06) y areaCategories[].capacity devolvió 1 en todas las
  // pruebas. Se cuenta el layout, igual que ya se hace con Cinemark.
  it("cuenta solo Empty como disponible", () => {
    const c = contarButacas(mk(["Empty", "Empty", "Sold", "Special"]));
    expect(c.available).toBe(2);
    expect(c.capacity).toBe(4);
    expect(c.pct).toBe(50);
  });

  // Companion es el asiento de acompañante de una silla de ruedas: apareció en
  // Rosario y no en Recoleta, así que la lista de estados no está cerrada.
  it("un estado desconocido no cuenta como disponible", () => {
    const c = contarButacas(mk(["Empty", "Companion", "EstadoQueNoVimos"]));
    expect(c.available).toBe(1);
    expect(c.capacity).toBe(3);
  });

  it("una sala vacía de datos no divide por cero", () => {
    const c = contarButacas(mk([]));
    expect(c.capacity).toBe(0);
    expect(c.pct).toBe(0);
  });

  it("una sala llena da 0 por ciento", () => {
    expect(contarButacas(mk(["Sold", "Sold"])).pct).toBe(0);
  });
});

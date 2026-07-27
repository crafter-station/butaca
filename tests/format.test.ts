import { describe, expect, it } from "bun:test";
import { ApiError } from "../src/api.js";
import {
  applyFields,
  exitCodeFor,
  fail,
  ok,
  renderTable,
  reportError,
  resolveMachineMode,
} from "../src/format.js";

describe("envelope de exito", () => {
  it("trae ok true, data, y meta con source/fetchedAt/cached", () => {
    const envelope = ok([{ a: 1 }]);
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) throw new Error("unreachable");
    expect(envelope.data).toEqual([{ a: 1 }]);
    expect(envelope.meta.source).toBe("bff.cinemark.com.ar");
    expect(typeof envelope.meta.fetchedAt).toBe("string");
    expect(envelope.meta.cached).toBe(false);
  });

  it("incluye nextSteps solo si se pasan y no estan vacios", () => {
    const withSteps = ok([1], ["butaca cines"]);
    if (!withSteps.ok) throw new Error("unreachable");
    expect(withSteps.meta.nextSteps).toEqual(["butaca cines"]);

    const withoutSteps = ok([1]);
    if (!withoutSteps.ok) throw new Error("unreachable");
    expect(withoutSteps.meta.nextSteps).toBeUndefined();

    const withEmptySteps = ok([1], []);
    if (!withEmptySteps.ok) throw new Error("unreachable");
    expect(withEmptySteps.meta.nextSteps).toBeUndefined();
  });
});

describe("envelope de error", () => {
  it("trae ok false y error con code/message/hint", () => {
    const error = new ApiError("NOT_FOUND", "no existe", "revisa el slug");
    const envelope = fail(error);
    expect(envelope.ok).toBe(false);
    if (envelope.ok) throw new Error("unreachable");
    expect(envelope.error.code).toBe("NOT_FOUND");
    expect(envelope.error.message).toBe("no existe");
    expect(envelope.error.hint).toBe("revisa el slug");
  });
});

describe("exitCodeFor", () => {
  it("0 en exito", () => {
    expect(exitCodeFor(ok([1]))).toBe(0);
  });

  it("1 en BAD_INPUT y NOT_FOUND", () => {
    expect(exitCodeFor(fail(new ApiError("BAD_INPUT", "x", "y")))).toBe(1);
    expect(exitCodeFor(fail(new ApiError("NOT_FOUND", "x", "y")))).toBe(1);
  });

  it("2 en UPSTREAM_ERROR, NETWORK_ERROR, RATE_LIMITED, QUEUED", () => {
    expect(exitCodeFor(fail(new ApiError("UPSTREAM_ERROR", "x", "y")))).toBe(2);
    expect(exitCodeFor(fail(new ApiError("NETWORK_ERROR", "x", "y")))).toBe(2);
    expect(exitCodeFor(fail(new ApiError("RATE_LIMITED", "x", "y")))).toBe(2);
    expect(exitCodeFor(fail(new ApiError("QUEUED", "x", "y")))).toBe(2);
  });
});

describe("resolveMachineMode", () => {
  it("es true si flags.json es true, sin importar TTY", () => {
    expect(
      resolveMachineMode({
        json: true,
        noCache: false,
        todas: false,
        todos: false,
        open: false,
        numeros: false,
        help: false,
        version: false,
        fields: null,
      }),
    ).toBe(true);
  });
});

describe("applyFields", () => {
  it("sin fields devuelve las filas intactas", () => {
    const rows = [{ a: 1, b: 2 }];
    expect(applyFields(rows, null)).toEqual(rows);
  });

  it("con fields, solo deja esos campos", () => {
    const rows = [{ a: 1, b: 2, c: 3 }];
    expect(applyFields(rows, ["a", "c"])).toEqual([{ a: 1, c: 3 }]);
  });

  // Regresión: un campo inexistente devolvía objetos vacíos sin avisar, y los
  // nombres válidos difieren entre la salida JSON y la tabla humana.
  it("falla con BAD_INPUT ante un campo desconocido", () => {
    const rows = [{ sessionId: "1", dateTime: "27/07/2026 11:30" }];
    expect(() => applyFields(rows, ["hora"])).toThrow(ApiError);
  });

  it("el error nombra los campos disponibles", () => {
    const rows = [{ sessionId: "1", dateTime: "27/07/2026 11:30" }];
    try {
      applyFields(rows, ["pelicula"]);
      throw new Error("debería haber tirado");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).hint).toContain("sessionId");
    }
  });

  it("con cero filas no valida nada", () => {
    expect(applyFields([], ["cualquiera"])).toEqual([]);
  });
});

describe("renderTable", () => {
  it("mensaje explicito con cero filas", () => {
    expect(renderTable([], ["a"])).toBe("Sin resultados.");
  });

  it("alinea columnas por el ancho maximo", () => {
    const table = renderTable(
      [
        { slug: "palermo", name: "Palermo" },
        { slug: "abasto", name: "Abasto" },
      ],
      ["slug", "name"],
    );
    const lines = table.split("\n");
    expect(lines[0]).toContain("slug");
    expect(lines[0]).toContain("name");
    expect(lines.length).toBe(4);
  });
});

describe("reportError: a qué stream va", () => {
  // Regresión: en machineMode el envelope de error iba a stderr, así que
  // `butaca ... --json | jq` recibía stdout vacío y el agente perdía code y
  // hint. El envelope de error es salida estructurada, no diagnóstico.
  it("en modo máquina el envelope va a stdout", () => {
    const out: string[] = [];
    const err: string[] = [];
    const so = process.stdout.write;
    const se = process.stderr.write;
    process.stdout.write = (c: string) => (out.push(c), true);
    process.stderr.write = (c: string) => (err.push(c), true);
    try {
      reportError(true, new ApiError("NOT_FOUND", "no existe", "probá otro"));
    } finally {
      process.stdout.write = so;
      process.stderr.write = se;
    }
    expect(out.join("")).toContain('"NOT_FOUND"');
    expect(err.join("")).toBe("");
  });

  it("en modo humano el error va a stderr, para no ensuciar un pipe", () => {
    const out: string[] = [];
    const err: string[] = [];
    const so = process.stdout.write;
    const se = process.stderr.write;
    process.stdout.write = (c: string) => (out.push(c), true);
    process.stderr.write = (c: string) => (err.push(c), true);
    try {
      reportError(false, new ApiError("NOT_FOUND", "no existe", "probá otro"));
    } finally {
      process.stdout.write = so;
      process.stderr.write = se;
    }
    expect(err.join("")).toContain("no existe");
    expect(out.join("")).toBe("");
  });
});

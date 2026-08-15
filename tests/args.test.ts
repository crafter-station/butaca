import { describe, expect, it } from "bun:test";
import { ArgParseError, isKnownCommand, parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("parsea el comando simple", () => {
    const args = parseArgs(["cines"]);
    expect(args.command).toBe("cines");
    expect(args.json).toBe(false);
  });

  it("parsea --json global", () => {
    const args = parseArgs(["cines", "--json"]);
    expect(args.json).toBe(true);
  });

  it("parsea --cine con valor", () => {
    const args = parseArgs(["funciones", "--cine", "palermo"]);
    expect(args.cine).toBe("palermo");
  });

  it("parsea todos los filtros de funciones juntos", () => {
    const args = parseArgs([
      "funciones",
      "--cine",
      "palermo",
      "--peli",
      "toy-story-5",
      "--fecha",
      "2026-07-27",
      "--formato",
      "2D",
      "--idioma",
      "SUB",
      "--libres",
      "20",
    ]);
    expect(args.cine).toBe("palermo");
    expect(args.peli).toBe("toy-story-5");
    expect(args.fecha).toBe("2026-07-27");
    expect(args.formato).toBe("2D");
    expect(args.idioma).toBe("SUB");
    expect(args.libres).toBe(20);
  });

  it("parsea --fields separado por comas", () => {
    const args = parseArgs(["cines", "--fields", "slug,name,city"]);
    expect(args.fields).toEqual(["slug", "name", "city"]);
  });

  it("parsea el shorthand butaca <slug>", () => {
    const args = parseArgs(["palermo"]);
    expect(args.command).toBe("palermo");
  });

  it("acumula positionales extra para schema", () => {
    const args = parseArgs(["schema", "funciones"]);
    expect(args.command).toBe("schema");
    expect(args.positional).toEqual(["funciones"]);
  });

  it("tira ArgParseError si --cine no tiene valor", () => {
    expect(() => parseArgs(["funciones", "--cine"])).toThrow(ArgParseError);
  });

  it("tira ArgParseError con opción desconocida", () => {
    expect(() => parseArgs(["cines", "--no-existe"])).toThrow(ArgParseError);
  });

  it("tira ArgParseError si --libres no es entero valido", () => {
    expect(() => parseArgs(["funciones", "--cine", "palermo", "--libres", "abc"])).toThrow(
      ArgParseError,
    );
  });

  it("tira ArgParseError si --libres es negativo", () => {
    expect(() => parseArgs(["funciones", "--cine", "palermo", "--libres", "-1"])).toThrow(
      ArgParseError,
    );
  });

  it("parsea --help y --version", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("parsea --no-cache", () => {
    expect(parseArgs(["funciones", "--cine", "palermo", "--no-cache"]).noCache).toBe(true);
  });

  it("parsea el flujo elegir", () => {
    const args = parseArgs(["elegir", "spiderman", "--fecha", "mañana", "--cantidad", "2", "--mejor-asiento", "--preflight"]);
    expect(args.command).toBe("elegir");
    expect(args.positional).toEqual(["spiderman"]);
    expect(args.fecha).toBe("mañana");
    expect(args.cantidad).toBe(2);
    expect(args.mejorAsiento).toBe(true);
    expect(args.preflight).toBe(true);
  });

  it("parsea recomendar con cantidad de personas", () => {
    const args = parseArgs([
      "recomendar",
      "spiderman",
      "--cine",
      "palermo",
      "--personas",
      "2",
    ]);
    expect(args.command).toBe("recomendar");
    expect(args.cine).toBe("palermo");
    expect(args.cantidad).toBe(2);
  });
});

describe("isKnownCommand", () => {
  it("reconoce los cuatro comandos del contrato", () => {
    expect(isKnownCommand("cines")).toBe(true);
    expect(isKnownCommand("cartelera")).toBe(true);
    expect(isKnownCommand("funciones")).toBe(true);
    expect(isKnownCommand("schema")).toBe(true);
    expect(isKnownCommand("recomendar")).toBe(true);
  });

  it("no reconoce un slug de cine como comando", () => {
    expect(isKnownCommand("palermo")).toBe(false);
  });
});

describe("--orden (regresión)", () => {
  // Sin --orden, `reservar` abría una orden nueva y recibía OTRA preasignada,
  // así que la butaca ámbar que el usuario acababa de ver en el mapa era
  // irreservable: el mapa mostraba 13-12 y reservar tomaba 13-14. Con --orden
  // se reusa la transacción que abrió `butacas`, verificado con Code 0 sobre
  // esa misma butaca.
  it("parsea el transIdTemp", () => {
    expect(parseArgs(["reservar", "159147", "--orden", "20012811334"]).orden).toBe(20012811334);
  });

  it("es null cuando no se pasa", () => {
    expect(parseArgs(["reservar", "159147"]).orden).toBeNull();
  });

  it("rechaza un valor que no es un id de orden", () => {
    expect(() => parseArgs(["reservar", "159147", "--orden", "abc"])).toThrow(/transIdTemp/);
    expect(() => parseArgs(["reservar", "159147", "--orden", "0"])).toThrow(/transIdTemp/);
  });
});

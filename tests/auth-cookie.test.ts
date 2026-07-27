import { describe, expect, it } from "bun:test";
import {
  extractCookieExpiry,
  extractCsrfCookie,
  extractSessionCookie,
} from "../src/auth.js";

// Regresión del primer login real: Cinemark emite la cookie con prefijo
// __Secure- sobre HTTPS. El regex la encontraba pero reconstruía el nombre sin
// el prefijo, así que el login fallaba con "no devolvió una cookie de sesión"
// pese a que el POST había dado 200 y la cookie estaba ahí.
const REAL = [
  "__Secure-next-auth.session-token=eyJhbGciOi.abc; Path=/; Expires=Wed, 26 Aug 2026 18:02:04 GMT; HttpOnly; Secure; SameSite=Lax",
  "__cfwaitingroom=xyz; Domain=www.cinemark.com.ar; Path=/; HttpOnly; Secure",
].join(", ");

describe("extractSessionCookie", () => {
  it("preserva el prefijo __Secure- que manda Cinemark", () => {
    expect(extractSessionCookie(REAL)).toBe(
      "__Secure-next-auth.session-token=eyJhbGciOi.abc",
    );
  });

  it("acepta el nombre pelado, sin prefijo", () => {
    expect(extractSessionCookie("next-auth.session-token=abc123; Path=/")).toBe(
      "next-auth.session-token=abc123",
    );
  });

  it("acepta el prefijo __Host-", () => {
    expect(extractSessionCookie("__Host-next-auth.session-token=zzz; Path=/")).toBe(
      "__Host-next-auth.session-token=zzz",
    );
  });

  it("devuelve null si no hay cookie de sesión", () => {
    expect(extractSessionCookie("__cfwaitingroom=abc; Path=/")).toBeNull();
    expect(extractSessionCookie(null)).toBeNull();
  });
});

describe("extractCsrfCookie", () => {
  it("preserva el prefijo, igual que la de sesión", () => {
    expect(extractCsrfCookie("__Secure-next-auth.csrf-token=tok|hash; Path=/")).toBe(
      "__Secure-next-auth.csrf-token=tok|hash",
    );
  });
});

describe("extractCookieExpiry", () => {
  // Hardcodear 30 días hace que el CLI crea tener sesión válida después de que
  // el upstream la venció. El header trae la fecha real.
  it("lee el Expires real del header", () => {
    expect(extractCookieExpiry(REAL)).toBe("2026-08-26T18:02:04.000Z");
  });

  it("devuelve null si no hay Expires, para que el caller use su default", () => {
    expect(extractCookieExpiry("__Secure-next-auth.session-token=abc; Path=/")).toBeNull();
  });
});

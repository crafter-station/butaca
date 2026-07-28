import { ok, printEnvelope, reportError } from "../format.js";
import { ApiError } from "../api.js";

const SCHEMA_VERSION = "1.0.0";

export const SCHEMAS: Record<string, unknown> = {
  cines: {
    version: SCHEMA_VERSION,
    shape: {
      id: "number",
      slug: "string",
      name: "string",
      address: "string",
      city: "string",
      region: "string",
      lat: "number",
      lng: "number",
    },
  },
  cartelera: {
    version: SCHEMA_VERSION,
    shape: {
      id: "string",
      corporateId: "string",
      slug: "string",
      title: "string",
      runTime: "number",
      rating: "string",
      formats: "string[]",
      premiere: "boolean",
    },
  },
  funciones: {
    version: SCHEMA_VERSION,
    shape: {
      sessionId: "string",
      movie: { corporateId: "string", name: "string" },
      theater: { id: "string", room: "string" },
      dateTime: "string",
      displayDate: "string",
      format: "string",
      language: "string",
      seats: { available: "number", capacity: "number", pct: "number" },
    },
    notes: [
      "seats.pct se calcula acá como available/capacity, no viene del upstream",
      "dateTime está en hora local de Buenos Aires",
    ],
  },

  estrenos: {
    version: SCHEMA_VERSION,
    shape: {
      slug: "string",
      title: "string",
      runTime: "number",
      rating: "string",
      formats: "string[]",
      status: "PREVENTA | PROXIMO",
      openingDate: "string (YYYY-MM-DD)",
      diasParaEstreno: "number",
      ventas: "null | { funciones: number, vendidoPromedio: number, maxVendido: number, diaSiguiente: number | null }",
    },
    notes: "ventas solo viene cuando el estreno tiene funciones a la venta (status PREVENTA).",
  },
  butacas: {
    version: SCHEMA_VERSION,
    shape: {
      sessionId: "string",
      theater: { id: "string", room: "string" },
      transIdTemp: "number",
      screen: { rows: "number", columns: "number" },
      areas: [
        {
          code: "string",
          number: "string",
          seats: [
            {
              row: "string (etiqueta impresa)",
              number: "string (etiqueta impresa)",
              gridRow: "string (coordenada)",
              gridNumber: "string (coordenada)",
              status:
                "DISPONIBLE | NO_DISPONIBLE | OBESIDAD | SILLA_DE_RUEDAS | AUTO_ASIGNADA | ROTA | RESERVADA_Y_ROTA | BLOQUEADA",
              statusId: "number (0,1,3,4,5,6,7,8)",
            },
          ],
        },
      ],
      summary: { total: "number", available: "number", accessible: "number", broken: "number" },
    },
    notes:
      "Abre una orden real en Cinemark (POST /order-tickets). Con --dry-run devuelve { wouldOpenOrder, sessionId, cinemaId, steps } y no llama a nada. Se exponen las dos representaciones a propósito: el humano lee row/number, order-set-seats solo acepta gridRow/gridNumber. AUTO_ASIGNADA no es un atributo de la sala: cambia en cada orden y es la butaca que Cinemark preasigna a esa transacción.",
  },
  reservar: {
    version: SCHEMA_VERSION,
    shape: {
      transIdTemp: "number",
      seats: [{ row: "string", number: "string" }],
      held: "boolean",
      checkoutUrl: "string",
      expiresAt: "string (ISO, solo si el upstream lo informa)",
    },
    notes:
      "Toma inventario real. Requiere confirmación salvo --yes. Con --dry-run valida contra el mapa y no reserva, y no exige --yes. El pago no se automatiza: termina en checkoutUrl. --asignada toma la butaca que Cinemark preasigna a la orden que este comando abre: no se puede pedir por --asientos porque el número que muestra `butacas` pertenece a otra orden y ya no está disponible cuando `reservar` abre la suya.",
  },
  auth: {
    version: SCHEMA_VERSION,
    shape: {
      login: { email: "string", expiresAt: "string (ISO)" },
      status: { email: "string", expiresAt: "string (ISO)" },
      logout: { loggedOut: "boolean" },
    },
    notes:
      "La contraseña nunca toca el disco: va al keychain de macOS, o a BUTACA_PASSWORD si no hay keychain. Sin TTY y sin las variables de entorno, falla con AUTH_REQUIRED en vez de colgarse pidiendo input.",
  },
  schema: {
    version: SCHEMA_VERSION,
    shape: {
      "<comando>": { version: "string", shape: "object", notes: "string (opcional)" },
    },
    notes: "Sin argumento devuelve todos los comandos. Con uno, solo ese.",
  },
};

export function runSchema(commandName: string | null, machineMode: boolean): number {
  if (!commandName) {
    const envelope = ok(SCHEMAS);
    printEnvelope(envelope);
    return 0;
  }

  const schema = SCHEMAS[commandName];
  if (!schema) {
    const error = new ApiError(
      "BAD_INPUT",
      `No hay esquema para el comando "${commandName}"`,
      "Comandos válidos: cines, cartelera, funciones.",
    );
    return reportError(machineMode, error);
  }

  const envelope = ok(schema);
  printEnvelope(envelope);
  return 0;
}

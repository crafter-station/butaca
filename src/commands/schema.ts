import { ok, printEnvelope, reportError } from "../format.js";
import { ApiError } from "../api.js";

export const SCHEMA_VERSION = "1.2.0";

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
      movie: "null | { slug: string | null, name: string }",
      showtime:
        "null | { dateTime: string, displayDate: string, format: string, language: string }",
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
      sugeridas: [
        {
          row: "string",
          number: "string",
          label: "string (lista para --asientos)",
          distanciaPantalla: "number (0 a 1)",
          desviacionCentro: "number (0 a 1)",
          score: "number (0 a 1, mayor es mejor)",
        },
      ],
      siteUrl: "string | null",
    },
    notes:
      "Abre una orden real en Cinemark (POST /order-tickets). Con --dry-run devuelve { wouldOpenOrder, sessionId, cinemaId, steps } y no llama a nada. siteUrl vuelve a la película pero no preserva la orden, porque el carrito vive en el storage local del navegador. Se exponen las dos representaciones de butaca a propósito: el humano lee row/number, order-set-seats solo acepta gridRow/gridNumber.",
  },
  reservar: {
    version: SCHEMA_VERSION,
    shape: {
      transIdTemp: "number",
      seats: [{ row: "string", number: "string" }],
      seatHeld: "boolean",
      browserCheckoutAvailable: "false",
      sideEffect: "seat_held",
      siteUrl: "string",
      expiresAt: "string (ISO, solo si el upstream lo informa)",
    },
    notes:
      "Toma inventario real. Requiere confirmación salvo --yes. browserCheckoutAvailable siempre es false: siteUrl no continúa la orden, solo vuelve al sitio para elegir de nuevo. --asignada toma la butaca que Cinemark preasigna. Cada orden recibe la suya, así que para quedarse con la que se vio en el mapa hay que pasar además --orden <transIdTemp>.",
  },
  elegir: {
    version: SCHEMA_VERSION,
    shape: {
      movie: { slug: "string", title: "string" },
      theater: { id: "string", slug: "string", name: "string", room: "string" },
      showtime: "Funcion",
      quantity: "number",
      price: "null | { amount: number, currency: ARS, raw: number }",
      seats: "null | SeatSugerida[]",
      score: "number (solo después de abrir el mapa)",
      transIdTemp: "number (solo después de abrir la orden)",
      seatHeld: "boolean (después de recomendar o hacer hold)",
      browserCheckoutAvailable: "false",
      siteUrl: "string",
      sideEffect: "none | order_opened | seat_held",
      retryable: "boolean",
      expiresAt: "string (ISO, solo si el upstream lo informa)",
    },
    notes:
      "Selecciona una coincidencia de película y la función con más disponibilidad, priorizando las que no son trasnoche, antes de cualquier escritura. --dry-run usa datos públicos y no abre orden. --preflight valida sesión y precio sin abrir orden. El mapa requiere una orden y el hold requiere confirmación o --yes. siteUrl no preserva el carrito.",
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
  cadenas: {
    version: SCHEMA_VERSION,
    shape: {
      id: "string (el que se pasa a --cadena)",
      name: "string",
      country: "string (ISO 2)",
      countryName: "string",
      status: "verified | planned",
      nota: "string (solo en planned: por qué falta)",
      activa: "boolean (es la cadena en uso)",
    },
    notes:
      "Las cadenas planned se listan a propósito: el soporte está pensado y la nota dice qué falta. Usarlas falla con ese motivo, no con un error de red.",
  },
  config: {
    version: SCHEMA_VERSION,
    shape: {
      cine: "string (slug del cine por defecto)",
      cadena: "string (id de cadena por defecto)",
      path: "string (solo en get: dónde vive el archivo)",
    },
    notes:
      "butaca config set|unset|get. Precedencia al resolver: flag > BUTACA_CINE/BUTACA_CADENA > guardado > default. Vive en prefs.json, aparte de la sesión, así que auth logout no lo borra.",
  },
  schema: {
    version: SCHEMA_VERSION,
    shape: {
      "<comando>": { version: "string", shape: "object", notes: "string (opcional)" },
    },
    notes: "Sin argumento devuelve todos los comandos. Con uno, solo ese.",
  },
};

SCHEMAS.recomendar = {
  ...(SCHEMAS.elegir as Record<string, unknown>),
  notes:
    "Selecciona la función con más disponibilidad y recomienda el mejor grupo contiguo para --personas. --dry-run usa datos públicos. --preflight valida sesión y precio. Abrir el mapa requiere confirmación y crea una orden, pero recomendar no hace hold. Devuelve el comando reservar exacto en meta.nextSteps.",
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
      `Comandos válidos: ${Object.keys(SCHEMAS).join(", ")}.`,
    );
    return reportError(machineMode, error);
  }

  const envelope = ok(schema);
  printEnvelope(envelope);
  return 0;
}

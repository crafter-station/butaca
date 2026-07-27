import { ok, printEnvelope, reportError } from "../format.js";
import { ApiError } from "../api.js";

const SCHEMA_VERSION = "1.0.0";

const SCHEMAS: Record<string, unknown> = {
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

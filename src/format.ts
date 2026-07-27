import { ApiError, nowIso, source } from "./api.js";
import type { Envelope, EnvelopeMeta } from "./types.js";

export interface Flags {
  json: boolean;
  noCache: boolean;
  help: boolean;
  version: boolean;
  fields: string[] | null;
}

export function resolveMachineMode(flags: Flags): boolean {
  return flags.json || !process.stdout.isTTY;
}

export function ok<T>(data: T, nextSteps?: string[]): Envelope<T> {
  const meta: EnvelopeMeta = {
    source,
    fetchedAt: nowIso(),
    cached: false,
  };
  if (nextSteps && nextSteps.length > 0) {
    meta.nextSteps = nextSteps;
  }
  return { ok: true, data, meta };
}

export function fail(error: ApiError): Envelope<never> {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      hint: error.hint,
    },
  };
}

export function exitCodeFor(envelope: Envelope<unknown>): number {
  if (envelope.ok) return 0;
  if (envelope.error.code === "BAD_INPUT" || envelope.error.code === "NOT_FOUND") {
    return 1;
  }
  return 2;
}

export function printEnvelope(envelope: Envelope<unknown>): void {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

export function reportError(machineMode: boolean, error: ApiError): number {
  const envelope = fail(error);
  if (machineMode) {
    process.stderr.write(`${JSON.stringify(envelope, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${error.message}\n`);
    process.stderr.write(`  ${error.hint}\n`);
  }
  return exitCodeFor(envelope);
}

export function applyFields<T extends Record<string, unknown>>(
  rows: T[],
  fields: string[] | null,
): Array<Record<string, unknown>> {
  if (!fields || fields.length === 0) return rows;

  // Un campo inexistente devolvía objetos vacíos sin avisar. Los nombres válidos
  // difieren entre JSON y tabla, así que el error tiene que nombrarlos.
  const first = rows[0];
  if (first) {
    const validos = Object.keys(first);
    const invalidos = fields.filter((f) => !validos.includes(f));
    if (invalidos.length > 0) {
      throw new ApiError(
        "BAD_INPUT",
        `Campo desconocido: ${invalidos.join(", ")}`,
        `Campos disponibles: ${validos.join(", ")}`,
      );
    }
  }

  return rows.map((row) => {
    const picked: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in row) {
        picked[field] = row[field];
      }
    }
    return picked;
  });
}

export function renderTable(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (rows.length === 0) {
    return "Sin resultados.";
  }

  const headers = columns;
  const cellValues = rows.map((row) =>
    headers.map((header) => stringifyCell(row[header])),
  );

  const widths = headers.map((header, i) => {
    const lengths = [header.length, ...cellValues.map((cells) => cells[i]?.length ?? 0)];
    return Math.max(...lengths);
  });

  const headerLine = headers.map((header, i) => header.padEnd(widths[i] ?? 0)).join("  ");
  const separatorLine = widths.map((w) => "-".repeat(w)).join("  ");
  const bodyLines = cellValues.map((cells) =>
    cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  "),
  );

  return [headerLine, separatorLine, ...bodyLines].join("\n");
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

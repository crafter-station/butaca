import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { auditDir } from "./config.js";

export type AuditResult = "pending" | "ok" | "error";

export interface AuditRecord {
  id: string;
  kind: string;
  command: string;
  result: AuditResult;
  meta?: Record<string, unknown>;
}

type StoredRecord = AuditRecord & { ts: string };

function todayFilename(): string {
  return `${new Date().toISOString().slice(0, 10)}.jsonl`;
}

function append(record: StoredRecord): void {
  const dir = auditDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = `${dir}/${todayFilename()}`;
  appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

export function newAuditId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Se escribe ANTES de la llamada de red. Si el proceso muere a mitad de un
 * order-tickets o un order-set-seats, el registro PENDING queda como
 * evidencia de que se intentó, aunque nunca se sepa si el upstream lo aplicó.
 */
export function auditPending(record: Omit<AuditRecord, "result">): void {
  append({ ...record, result: "pending", ts: new Date().toISOString() });
}

/** Se escribe DESPUÉS, con el mismo id que el PENDING, para poder emparejarlos. */
export function auditResolve(
  id: string,
  kind: string,
  command: string,
  result: "ok" | "error",
  meta?: Record<string, unknown>,
): void {
  const record: StoredRecord = { id, kind, command, result, ts: new Date().toISOString() };
  if (meta) record.meta = meta;
  append(record);
}

export function tailAudit(n = 20): StoredRecord[] {
  const dir = auditDir();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().reverse();
  } catch {
    return [];
  }

  const results: StoredRecord[] = [];
  for (const file of files) {
    if (results.length >= n) break;
    try {
      const content = readFileSync(`${dir}/${file}`, "utf8");
      const lines = content.trim().split("\n").filter(Boolean).reverse();
      for (const line of lines) {
        if (results.length >= n) break;
        try {
          results.push(JSON.parse(line) as StoredRecord);
        } catch {
          // línea corrupta, se salta
        }
      }
    } catch {
      // archivo ilegible, se salta
    }
  }
  return results;
}

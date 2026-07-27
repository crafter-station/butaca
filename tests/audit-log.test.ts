import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditPending, auditResolve, newAuditId, tailAudit } from "../src/audit-log.js";

let scratchDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "butaca-audit-"));
  originalHome = process.env.BUTACA_HOME;
  process.env.BUTACA_HOME = scratchDir;
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.BUTACA_HOME;
  } else {
    process.env.BUTACA_HOME = originalHome;
  }
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("audit log: PENDING antes de la llamada de red", () => {
  it("escribe un registro PENDING antes del resultado final", () => {
    const id = newAuditId();
    auditPending({ id, kind: "order.hold", command: "butaca reservar 159037" });

    const afterPending = tailAudit(10);
    expect(afterPending).toHaveLength(1);
    expect(afterPending[0]?.result).toBe("pending");
    expect(afterPending[0]?.id).toBe(id);

    auditResolve(id, "order.hold", "butaca reservar 159037", "ok", { transIdTemp: 123 });

    const afterResolve = tailAudit(10);
    expect(afterResolve).toHaveLength(2);
    // tailAudit es newest-first: el resuelto queda primero
    expect(afterResolve[0]?.result).toBe("ok");
    expect(afterResolve[0]?.id).toBe(id);
    expect(afterResolve[1]?.result).toBe("pending");
    expect(afterResolve[1]?.id).toBe(id);
  });

  it("PENDING y el resultado final comparten el mismo id para poder emparejarlos", () => {
    const id = newAuditId();
    auditPending({ id, kind: "order.open", command: "butaca butacas 159037" });
    auditResolve(id, "order.open", "butaca butacas 159037", "error", { message: "timeout" });

    const records = tailAudit(10);
    const ids = new Set(records.map((r) => r.id));
    expect(ids.size).toBe(1);
    expect(records.every((r) => r.id === id)).toBe(true);
  });

  it("nunca sobreescribe: dos operaciones dejan cuatro líneas (2 pending + 2 resolve)", () => {
    const id1 = newAuditId();
    const id2 = newAuditId();
    auditPending({ id: id1, kind: "order.hold", command: "cmd1" });
    auditPending({ id: id2, kind: "order.hold", command: "cmd2" });
    auditResolve(id1, "order.hold", "cmd1", "ok");
    auditResolve(id2, "order.hold", "cmd2", "error");

    const records = tailAudit(10);
    expect(records).toHaveLength(4);
  });
});

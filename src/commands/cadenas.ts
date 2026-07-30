import { ok, printEnvelope } from "../format.js";
import { cadenaEfectiva } from "../prefs.js";
import { listProviders } from "../providers.js";
import { bold, dim, gray, green, padVisible } from "../style.js";

/**
 * Lista las cadenas del registro, incluidas las que todavía no se pueden usar.
 * Mostrar una cadena `planned` con su motivo es más útil que ocultarla: le dice
 * al usuario que el soporte está pensado y por qué falta, en vez de dejarlo
 * preguntándose si el CLI la olvidó.
 */
export function runCadenas(machineMode: boolean): number {
  const actual = cadenaEfectiva();
  const rows = listProviders().map((p) => ({
    id: p.id,
    name: p.name,
    country: p.country,
    countryName: p.countryName,
    status: p.status,
    ...(p.nota ? { nota: p.nota } : {}),
    activa: p.id === actual,
  }));

  if (machineMode) {
    printEnvelope(ok(rows));
    return 0;
  }

  const out: string[] = [];
  for (const r of rows) {
    const marca = r.activa ? green("*") : " ";
    const estado = r.status === "verified" ? green("lista") : gray("falta recon");
    out.push(`${marca} ${padVisible(bold(r.id), 22)}${padVisible(r.name, 20)}${padVisible(dim(r.countryName), 14)}${estado}`);
    if (r.nota) out.push(`  ${dim(r.nota)}`);
  }
  out.push("");
  out.push(dim(`Cambiar la que usás por defecto: ${bold("butaca config set cadena <id>")}`));

  process.stdout.write(`${out.join("\n")}\n`);
  return 0;
}

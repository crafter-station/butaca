import { ApiError, fetchTheaters } from "../api.js";
import { escapeText } from "../escape.js";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
import type { Flags } from "../format.js";
import type { RawTheater, Theater } from "../types.js";

export function toTheater(raw: RawTheater): Theater {
  return {
    id: raw.id,
    slug: raw.slug,
    name: escapeText(raw.name),
    address: escapeText(raw.address),
    city: escapeText(raw.city),
    region: escapeText(raw.location.name),
    lat: Number(raw.latitude),
    lng: Number(raw.longitude),
  };
}

export async function runCines(flags: Flags, machineMode: boolean): Promise<number> {
  try {
    const raw = await fetchTheaters();
    const theaters = raw.map(toTheater);
    const rows = applyFields(theaters as unknown as Array<Record<string, unknown>>, flags.fields);

    if (machineMode) {
      printEnvelope(ok(rows));
      return 0;
    }

    const columns = flags.fields ?? ["slug", "name", "city", "region", "address"];
    process.stdout.write(`${renderTable(rows, columns)}\n`);
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

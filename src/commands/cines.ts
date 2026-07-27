import { ApiError, fetchTheaters } from "../api.js";
import { escapeText } from "../escape.js";
import { applyFields, ok, printEnvelope, renderTable, reportError } from "../format.js";
import type { Flags } from "../format.js";
import { bold, dim, italic, underline } from "../style.js";
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

    if (flags.fields) {
      process.stdout.write(`${renderTable(rows, flags.fields)}\n`);
      return 0;
    }

    // Agrupado por región: "city" y "region" repetían el mismo valor en la
    // mitad de las filas, y el slug es lo único que el usuario vuelve a tipear.
    const porRegion = new Map<string, typeof theaters>();
    for (const t of theaters) {
      const key = t.region || t.city;
      porRegion.set(key, [...(porRegion.get(key) ?? []), t]);
    }

    const bloques = [...porRegion.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([region, cines]) => {
        // El slug se muestra aunque sea derivable del nombre: el humano tiene
        // que poder copiar el próximo comando sin salir de esta pantalla.
        const cuerpo = renderTable(
          cines.map((t) => ({
            cine: bold(t.name),
            direccion: dim(t.address),
            // Sin encabezados de columna por bloque, el valor tiene que decir
            // solo qué es: el comando completo se lee y se copia entero.
            comando: dim(`butaca ${t.slug}`),
          })),
          ["cine", "direccion", "comando"],
        )
          .split("\n")
          .slice(2)
          .map((l) => `  ${l}`)
          .join("\n");
        return `${underline(region)} ${dim(`· ${cines.length}`)}\n${cuerpo}`;
      });

    process.stdout.write(
      `${bloques.join("\n\n")}\n` +
        `\n${dim(`Copiá el comando de la derecha para ver las funciones de un cine.`)}\n`,
    );
    return 0;
  } catch (err) {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("UPSTREAM_ERROR", String(err), "Error inesperado, reportalo.");
    return reportError(machineMode, apiError);
  }
}

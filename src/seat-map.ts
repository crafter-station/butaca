import { ApiError } from "./api.js";
import { escapeText } from "./escape.js";
import {
  amber,
  anchoVisible,
  blue,
  bold,
  dim,
  dimGray,
  padVisible,
  red,
  white,
} from "./style.js";
import { shouldColor } from "./platform/detect.js";
import type { RawSeatMapResponse } from "./api-auth.js";

export type SeatStatusName =
  | "DISPONIBLE"
  | "NO_DISPONIBLE"
  | "OBESIDAD"
  | "SILLA_DE_RUEDAS"
  | "AUTO_ASIGNADA"
  | "ROTA"
  | "RESERVADA_Y_ROTA"
  | "BLOQUEADA";

interface SeatStatusInfo {
  name: SeatStatusName;
  glyph: string;
  colorize: (t: string) => string;
}

// Los ocho estados del contrato. El color hace el trabajo, no la forma: el sitio
// dibuja bloques y se lee la sala de un vistazo. 3 y 4 son accesibilidad, no
// ocupadas: pintarlas como vendidas miente, ofrecerlas como libres también.
// `◼` (BLACK MEDIUM SQUARE) y no `█` ni `▀`: el bloque entero llena la celda de
// arriba a abajo y las filas se tocan; el medio bloque se pega al techo. Este
// queda centrado vertical y horizontalmente, que es como lo dibujan las apps de
// cine. Además es east-asian-width N (narrow), así que ocupa un ancho
// predecible; `■` es Ambiguous y renderiza a uno o dos anchos según el emulador.
const BLOCK = "◼";

const SEAT_STATUS: Record<number, SeatStatusInfo> = {
  0: { name: "DISPONIBLE", glyph: BLOCK, colorize: white },
  1: { name: "NO_DISPONIBLE", glyph: BLOCK, colorize: red },
  3: { name: "OBESIDAD", glyph: BLOCK, colorize: blue },
  4: { name: "SILLA_DE_RUEDAS", glyph: BLOCK, colorize: blue },
  5: { name: "AUTO_ASIGNADA", glyph: BLOCK, colorize: amber },
  6: { name: "ROTA", glyph: BLOCK, colorize: dimGray },
  7: { name: "RESERVADA_Y_ROTA", glyph: BLOCK, colorize: dimGray },
  8: { name: "BLOQUEADA", glyph: BLOCK, colorize: dimGray },
};

// Sin color todos los bloques serían idénticos, así que ahí sí hace falta forma.
const SEAT_GLYPH_PLAIN: Record<number, string> = {
  0: "·",
  1: "x",
  3: "O",
  4: "W",
  5: "a",
  6: "/",
  7: "/",
  8: "#",
};

export function seatStatusInfo(statusId: number): SeatStatusInfo {
  const info = SEAT_STATUS[statusId];
  if (!info) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      `Estado de asiento desconocido: ${statusId}`,
      "Cinemark puede haber agregado un estado nuevo. Reportá este error si persiste.",
    );
  }
  return info;
}

export function isAvailableStatus(statusId: number): boolean {
  return statusId === 0 || statusId === 3 || statusId === 4;
}

export interface Seat {
  row: string;
  number: string;
  gridRow: string;
  gridNumber: string;
  status: SeatStatusName;
  statusId: number;
}

export interface SeatArea {
  code: string;
  number: string;
  seats: Seat[];
}

export interface SeatMapSummary {
  total: number;
  available: number;
  accessible: number;
  broken: number;
}

export interface SeatMap {
  areas: SeatArea[];
  summary: SeatMapSummary;
  screen: {
    rows: number;
    columns: number;
  };
}

export function parseSeatMap(raw: RawSeatMapResponse): SeatMap {
  const areas: SeatArea[] = [];
  let total = 0;
  let available = 0;
  let accessible = 0;
  let broken = 0;
  let maxRows = 0;
  let maxColumns = 0;

  for (const rawArea of raw.Data.areas) {
    maxRows = Math.max(maxRows, rawArea.areaLayoutRows);
    maxColumns = Math.max(maxColumns, rawArea.areaLayoutColumns);

    const seats: Seat[] = [];
    for (const rawRow of rawArea.rows) {
      for (const rawSeat of rawRow.seats) {
        const info = seatStatusInfo(rawSeat.seatStatus);
        seats.push({
          row: escapeText(rawRow.rowPhysicalId),
          number: escapeText(rawSeat.seatNumber),
          gridRow: rawRow.seatGridRowId,
          gridNumber: String(rawSeat.gridSeatNumber),
          status: info.name,
          statusId: rawSeat.seatStatus,
        });

        total += 1;
        if (rawSeat.seatStatus === 0) available += 1;
        if (rawSeat.seatStatus === 3 || rawSeat.seatStatus === 4) accessible += 1;
        if (rawSeat.seatStatus === 6 || rawSeat.seatStatus === 7) broken += 1;
      }
    }

    areas.push({
      code: rawArea.areaCategory,
      number: rawArea.areaNumber,
      seats,
    });
  }

  return {
    areas,
    summary: { total, available, accessible, broken },
    screen: { rows: maxRows, columns: maxColumns },
  };
}

/**
 * Busca un asiento por su etiqueta impresa (fila + número) y devuelve su
 * coordenada de grilla, que es lo único que acepta la API de reserva.
 */
export function findSeatByLabel(seatMap: SeatMap, row: string, number: string): Seat | null {
  for (const area of seatMap.areas) {
    const found = area.seats.find(
      (s) => s.row.toUpperCase() === row.toUpperCase() && s.number === number,
    );
    if (found) return found;
  }
  return null;
}

export interface ParsedSeatLabel {
  row: string;
  number: string;
}

/** "F12" -> { row: "F", number: "12" }. Letras al frente, dígitos al final. */
/**
 * Acepta `7-12` y `F12`.
 *
 * En Cinemark las filas son NÚMEROS, no letras (`rowPhysicalId` es "1".."14"),
 * así que pegar fila y asiento daría "12" para la fila 1 asiento 2, que es
 * ambiguo con la fila 12. El guion desambigua y es la forma canónica. El formato
 * con letra se sigue aceptando porque otras salas o cadenas sí usan letras.
 */
export function parseSeatLabel(raw: string): ParsedSeatLabel | null {
  const conGuion = /^([A-Za-z]*\d+|[A-Za-z]+)[-.](\d+)$/.exec(raw.trim());
  if (conGuion) {
    const [, row, number] = conGuion;
    if (!row || !number) return null;
    return { row: row.toUpperCase(), number };
  }

  const conLetra = /^([A-Za-z]+)(\d+)$/.exec(raw.trim());
  if (!conLetra) return null;
  const [, row, number] = conLetra;
  if (!row || !number) return null;
  return { row: row.toUpperCase(), number };
}

interface GridCell {
  seat: Seat | null;
}

/**
 * Arma una grilla rows x columns indexada por coordenada, con huecos
 * (pasillos reales) donde ninguna butaca ocupa esa celda. Dibujar por
 * etiqueta en vez de coordenada cierra esos huecos silenciosamente.
 *
 * El eje horizontal va espejado respecto de `gridSeatNumber`: verificado
 * contra el mapa real de la sala 7 de Palermo, donde el grid 1 es la butaca
 * 13 y el grid 6 es la butaca 3 (crece hacia la izquierda de la etiqueta
 * impresa). Dibujar de izquierda a derecha por `gridSeatNumber` sin invertir
 * produce una imagen especular de la sala. Este espejo es SOLO para dibujar:
 * `order-set-seats` (ver `toHoldSeatEntries` en `commands/reservar.ts`) sigue
 * recibiendo el `gridSeatNumber` original, porque reservar con el índice
 * invertido bloquearía la butaca equivocada.
 */
function buildGrid(area: SeatArea, rows: number, columns: number): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ seat: null })),
  );

  for (const seat of area.seats) {
    const r = Number(seat.gridRow) - 1;
    const c = columns - Number(seat.gridNumber);
    if (r >= 0 && r < rows && c >= 0 && c < columns) {
      const targetRow = grid[r];
      if (targetRow) targetRow[c] = { seat };
    }
  }

  return grid;
}

export interface RenderSeatMapOptions {
  color?: boolean;
  /** Muestra el número de cada butaca en lugar del bloque. */
  numerada?: boolean;
}

export function renderSeatMap(seatMap: SeatMap, options: RenderSeatMapOptions = {}): string {
  // Sin color, ocho bloques idénticos no distinguen nada, así que el default
  // consulta el entorno en vez de asumir que hay color.
  const useColor = options.color ?? shouldColor();
  const numerada = options.numerada ?? false;
  const lines: string[] = [];

  const screenLabel = "P A N T A L L A";
  // 3 chars por butaca (dos bloques + separador) para que la línea de pantalla
  // cubra el ancho real de la sala dibujada.
  const screenWidth = Math.max(seatMap.screen.columns * 3, anchoVisible(screenLabel));
  lines.push(padVisible("", 3) + centerText(bold(screenLabel), screenWidth, useColor));
  lines.push(padVisible("", 3) + "─".repeat(screenWidth));
  lines.push("");

  for (const area of seatMap.areas) {
    const grid = buildGrid(area, seatMap.screen.rows, seatMap.screen.columns);
    const libres = area.seats.filter((s) => s.statusId === 0).length;
    if (seatMap.areas.length > 1 || libres > 0) {
      lines.push(`   ${dim(`${libres} libres de ${area.seats.length}`)}`);
      lines.push("");
    }
    const rowLabels = new Map<number, string>();
    for (const seat of area.seats) {
      rowLabels.set(Number(seat.gridRow) - 1, seat.row);
    }

    // Las filas se recorren al revés: seatGridRowId 14 es la fila 1, la pegada a
    // la pantalla. Verificado contra la sala 7 real. Dibujar en el orden del
    // array pone el fondo de la sala arriba, que es al revés de lo que ve el
    // usuario en el sitio.
    for (let r = grid.length - 1; r >= 0; r--) {
      const row = grid[r];
      if (!row) continue;
      const hasAnySeat = row.some((cell) => cell.seat !== null);
      if (!hasAnySeat) continue;

      const label = rowLabels.get(r) ?? "";
      const cells = row.map((cell) => {
        // Dos caracteres por butaca: en una terminal la celda es el doble de
        // alta que de ancha, así que un solo bloque sale rectangular vertical.
        if (!cell.seat) return "   ";
        const info = seatStatusInfo(cell.seat.statusId);
        // El número va DENTRO de la butaca, no en un encabezado de columna:
        // cada fila tiene su propia numeración (la fila 2 va impares a un lado
        // del pasillo y pares al otro, la 14 va correlativa), así que una
        // cabecera global mentiría en casi todas las filas.
        if (numerada) {
          const n = cell.seat.number.padStart(2);
          return `${useColor ? info.colorize(n) : n} `;
        }
        const glyph = useColor
          ? info.colorize(info.glyph.repeat(2))
          : (SEAT_GLYPH_PLAIN[cell.seat.statusId] ?? "?").padEnd(2);
        return `${glyph} `;
      });
      lines.push(`${padVisible(dim(label), 3)}${cells.join("").trimEnd()}`);
    }
  }

  lines.push("");
    const presentes = [
    ...new Set(seatMap.areas.flatMap((a) => a.seats.map((s) => s.statusId))),
  ].sort((a, b) => a - b);
  lines.push(legendLine(useColor, presentes, numerada));
  lines.push("");
  // Las filas son números, así que "12" sería ambiguo entre fila 1 asiento 2 y
  // fila 12. El guion lo desambigua y es lo que espera --asientos.
  lines.push(
    numerada
      ? dim("El número de adentro es el asiento; el de la izquierda, la fila. Se pide fila-asiento.")
      : dim("Las butacas se nombran fila-asiento, por ejemplo 7-12.  --numeros las muestra en el mapa"),
  );

  return lines.join("\n");
}

function centerText(text: string, width: number, useColor: boolean): string {
  const visible = useColor ? anchoVisible(text) : text.length;
  const padding = Math.max(0, Math.floor((width - visible) / 2));
  return " ".repeat(padding) + text;
}

function legendLine(useColor: boolean, presentes: number[], numerada = false): string {
  // La leyenda usa el mismo glifo que el mapa: con color son bloques, sin color
  // son las letras, porque ocho bloques idénticos en gris no distinguen nada.
  // Solo los estados que existen en ESTA sala. Listar los ocho siempre sería
  // ruido (la mayoría no aparece nunca) y omitir los raros deja al usuario
  // mirando un color que la leyenda no explica, que fue justo lo que pasó con
  // AUTO_ASIGNADA: una sola butaca ámbar en toda la sala, sin entrada.
  const ETIQUETAS: Record<number, string> = {
    0: "libre",
    1: "ocupada",
    3: "accesible",
    4: "accesible",
    // NO decir "la que te asignaron": suena a que es tuya y reservable, y es lo
    // contrario. Cinemark preasigna una butaca a la orden que se abre para leer
    // el mapa, y esa orden muere en cuanto corrés `reservar`, que abre otra. Al
    // usuario le quedaba una pantalla irreconciliable: el ámbar decía una butaca
    // y el comando sugerido otra, sin nada que explicara la diferencia.
    5: "tomada por otra orden",
    6: "fuera de servicio",
    7: "fuera de servicio",
    8: "bloqueada",
  };
  const vistos = new Set<number>();
  const entries: Array<[number, string]> = [];
  for (const id of presentes) {
    const label = ETIQUETAS[id];
    if (!label || vistos.has(id)) continue;
    // 3 y 4 comparten etiqueta y color, igual que 6 y 7: una sola entrada.
    if (entries.some(([, l]) => l === label)) continue;
    vistos.add(id);
    entries.push([id, label]);
  }
  return entries
    .map(([statusId, label]) => {
      const info = seatStatusInfo(statusId);
      // La leyenda usa el mismo formato que el mapa: bloque o cuadrado relleno.
      const g = useColor ? info.colorize(info.glyph) : (SEAT_GLYPH_PLAIN[statusId] ?? "?");
      return `${g} ${dim(label)}`;
    })
    .join("   ");
}


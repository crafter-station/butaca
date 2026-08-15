import type { Flags } from "../format.js";
import { runElegir } from "./elegir.js";
import type { ElegirOptions } from "./elegir.js";

export function runRecomendar(
  options: Omit<ElegirOptions, "hold">,
  flags: Flags,
  machineMode: boolean,
): Promise<number> {
  return runElegir({ ...options, hold: false }, flags, machineMode);
}

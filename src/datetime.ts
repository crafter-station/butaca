const SESSION_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/;

export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// sessionDateTime carries a trailing Z but is Buenos Aires local time, not UTC.
// new Date(sessionDateTime) would shift it by -3h. We extract the string
// components directly and never let the runtime reinterpret the offset.
export function parseSessionDateTime(raw: string): LocalDateTimeParts {
  const match = SESSION_DATETIME_RE.exec(raw);
  if (!match) {
    throw new Error(`sessionDateTime con formato inesperado: ${raw}`);
  }
  const [, year, month, day, hour, minute, second] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

export function formatLocalDateTime(parts: LocalDateTimeParts): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatLocalTime(parts: LocalDateTimeParts): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_RE = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, "g");

function isControlChar(code: number): boolean {
  if (code <= 8) return true;
  if (code === 11 || code === 12) return true;
  if (code >= 14 && code <= 31) return true;
  if (code === 127) return true;
  return false;
}

function stripControlChars(value: string): string {
  let out = "";
  for (const char of value) {
    if (!isControlChar(char.charCodeAt(0))) {
      out += char;
    }
  }
  return out;
}

export function escapeText(value: string): string {
  return stripControlChars(value.replace(ANSI_ESCAPE_RE, ""))
    .replace(/\r\n|\r|\n/g, " ")
    .trim();
}

export function escapeJsonString(value: string): string {
  return escapeText(value);
}

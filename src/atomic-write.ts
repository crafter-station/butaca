import {
  closeSync,
  existsSync,
  fdatasyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";

export interface WriteOptions {
  mode?: number;
  encoding?: BufferEncoding;
}

/**
 * Escribe a un temporal, fsync, y rename. Un crash a mitad de escritura deja
 * el archivo viejo intacto en vez de un config.json truncado.
 */
export function atomicWrite(
  filePath: string,
  content: string | Buffer,
  options: WriteOptions = {},
): void {
  const { mode = 0o644, encoding = "utf8" } = options;
  const dir = dirname(filePath);
  const tmpPath = join(dir, `.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);

  mkdirSync(dir, { recursive: true });

  const data = typeof content === "string" ? Buffer.from(content, encoding) : content;
  const fd = openSync(tmpPath, "w", mode);
  try {
    writeSync(fd, data);
    fdatasyncSync(fd);
  } finally {
    closeSync(fd);
  }

  if (platform() === "win32" && existsSync(filePath)) {
    unlinkSync(filePath);
  }

  renameSync(tmpPath, filePath);
}

export function atomicWriteJson(filePath: string, value: unknown, options: WriteOptions = {}): void {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

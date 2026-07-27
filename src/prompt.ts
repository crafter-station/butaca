import { stdin, stdout } from "node:process";

/**
 * Lee una contraseña sin que aparezca en pantalla.
 *
 * `readline.question` hace eco de cada tecla, así que una contraseña tipeada
 * ahí queda visible en la terminal y en cualquier captura o grabación de la
 * sesión. Esto pone el TTY en modo raw, procesa las teclas a mano y solo
 * imprime un punto por caracter.
 *
 * Cligentic no tiene un bloque para esto: su `api-key-wizard` resuelve lo mismo
 * con `@clack/prompts`, que es una dependencia de runtime. Este CLI no tiene
 * ninguna y no vale agregar una por un prompt.
 *
 * Devuelve null si no hay TTY, para que el caller falle con un error
 * estructurado en vez de colgarse esperando input que nunca llega.
 */
export async function promptPassword(label: string): Promise<string | null> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return null;

  stdout.write(label);

  return new Promise<string>((resolve, reject) => {
    const chars: string[] = [];
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);

        // Enter o Ctrl-D: terminar.
        if (ch === "\r" || ch === "\n" || code === 4) {
          stdout.write("\n");
          cleanup();
          resolve(chars.join(""));
          return;
        }

        // Ctrl-C: salir sin dejar el TTY en modo raw.
        if (code === 3) {
          stdout.write("\n");
          cleanup();
          reject(new Error("cancelado"));
          return;
        }

        // Backspace o delete.
        if (code === 8 || code === 127) {
          if (chars.length > 0) {
            chars.pop();
            stdout.write("\b \b");
          }
          continue;
        }

        // Ignora el resto de los controles (flechas, escapes).
        if (code >= 32) {
          chars.push(ch);
          stdout.write("•");
        }
      }
    };

    stdin.on("data", onData);
  });
}

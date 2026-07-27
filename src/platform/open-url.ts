// cligentic block: open-url
//
// Opens a URL in the user's default browser, across macOS, Linux, Windows,
// WSL, SSH sessions, and headless CI environments.
//
// Design rules:
//   1. Respect BROWSER env var first (Unix convention).
//   2. Detect WSL and route through wslview / cmd.exe.
//   3. Detect headless (no DISPLAY on Linux, SSH without X forwarding).
//   4. Fall back to printing the URL and letting the user click it.
//   5. Never throw. Returns a verdict so callers can decide what to do.
//   6. Never block. Spawn detached so long-lived CLIs don't hang.
//
// Usage:
//   import { openUrl } from "./platform/open-url";
//
//   const result = await openUrl("https://cligentic.railly.dev");
//   if (!result.opened) {
//     console.log("Please open this URL manually:", result.url);
//   }

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { hasCommand, isCi, isHeadlessLinux, isWsl } from "./detect.js";

export type OpenUrlResult = {
  url: string;
  opened: boolean;
  via: "browser-env" | "darwin" | "wsl" | "linux" | "windows" | "manual";
  reason?: string;
};

export type OpenUrlOptions = {
  dryRun?: boolean;
  manualOnly?: boolean;
};

function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.unref();
}

export async function openUrl(
  url: string,
  options: OpenUrlOptions = {},
): Promise<OpenUrlResult> {
  const { dryRun = false, manualOnly = false } = options;

  if (manualOnly || isCi() || isHeadlessLinux()) {
    return {
      url,
      opened: false,
      via: "manual",
      reason: manualOnly
        ? "manualOnly flag set"
        : isCi()
          ? "CI environment detected"
          : "headless Linux (no DISPLAY / WAYLAND_DISPLAY)",
    };
  }

  const browserEnv = process.env.BROWSER;
  if (browserEnv && browserEnv !== "none") {
    if (dryRun) return { url, opened: true, via: "browser-env", reason: `would run: ${browserEnv} ${url}` };
    try {
      spawnDetached(browserEnv, [url]);
      return { url, opened: true, via: "browser-env" };
    } catch {
      // fall through
    }
  }

  const os = platform();

  if (os === "darwin") {
    if (dryRun) return { url, opened: true, via: "darwin", reason: `would run: open ${url}` };
    try {
      spawnDetached("open", [url]);
      return { url, opened: true, via: "darwin" };
    } catch (err) {
      return { url, opened: false, via: "manual", reason: `open failed: ${(err as Error).message}` };
    }
  }

  if (os === "win32") {
    if (dryRun) return { url, opened: true, via: "windows", reason: "would run: powershell Start-Process" };
    try {
      spawnDetached("powershell.exe", ["-NoProfile", "-Command", `Start-Process "${url}"`]);
      return { url, opened: true, via: "windows" };
    } catch (err) {
      return { url, opened: false, via: "manual", reason: `powershell failed: ${(err as Error).message}` };
    }
  }

  if (os === "linux" && isWsl()) {
    if (hasCommand("wslview")) {
      if (dryRun) return { url, opened: true, via: "wsl", reason: "would run: wslview" };
      try { spawnDetached("wslview", [url]); return { url, opened: true, via: "wsl" }; } catch { /* fall through */ }
    }
    if (hasCommand("cmd.exe")) {
      if (dryRun) return { url, opened: true, via: "wsl", reason: "would run: cmd.exe /c start" };
      try { spawnDetached("cmd.exe", ["/c", "start", "", url]); return { url, opened: true, via: "wsl" }; } catch (err) {
        return { url, opened: false, via: "manual", reason: `wsl cmd.exe failed: ${(err as Error).message}` };
      }
    }
    return { url, opened: false, via: "manual", reason: "WSL without wslview or cmd.exe" };
  }

  const candidates = ["xdg-open", "gio", "sensible-browser", "firefox", "google-chrome", "chromium"];
  for (const cmd of candidates) {
    if (hasCommand(cmd)) {
      if (dryRun) return { url, opened: true, via: "linux", reason: `would run: ${cmd} ${url}` };
      try {
        const args = cmd === "gio" ? ["open", url] : [url];
        spawnDetached(cmd, args);
        return { url, opened: true, via: "linux" };
      } catch { /* try next */ }
    }
  }

  return { url, opened: false, via: "manual", reason: "no known browser opener found on PATH" };
}

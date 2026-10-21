#!/usr/bin/env node
// playwright-mcp.mjs — cross-platform launcher for the project's Playwright MCP server (.mcp.json).
//
// Runs @playwright/mcp (pinned) from the repo root with tools/cognos-dev/playwright-mcp.json, so:
//   - the browser profile lives in .browser-profile/ (gitignored) and Cognos sign-ins persist;
//   - Chrome starts with the private/local-network-access checks disabled, so an https Cognos
//     page can load a bundle from `customvis start` on http://127.0.0.1:8585 without flipping
//     chrome://flags by hand;
//   - it works on Windows, where .mcp.json can't spawn `npx` directly.
// The config also passes an empty `--disable-blink-features=`: Playwright otherwise adds
// `--disable-blink-features=AutomationControlled`, which makes Chrome show an "unsupported
// command-line flag" warning bar (it skips its own when any --disable-blink-features is present).
// Extra args pass through, e.g. `--headless` or `--caps devtools`.
//
// Prefers the local install (`npm install --prefix tools/cognos-dev`, version pinned in
// tools/cognos-dev/package.json): it answers in well under a second. The npx fallback can exceed
// Claude Code's 30 s MCP connect timeout when many servers start at once.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const config = ["--config", "tools/cognos-dev/playwright-mcp.json", ...process.argv.slice(2)];
const localCli = join(here, "node_modules", "@playwright", "mcp", "cli.js");

let child;
if (existsSync(localCli)) {
  child = spawn(process.execPath, [localCli, ...config], { cwd: repoRoot, stdio: "inherit" });
} else {
  const args = ["-y", "@playwright/mcp@0.0.83", ...config];
  // Windows can only run npx.cmd through a shell, so hand it one quoted command string.
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  child = process.platform === "win32"
    ? spawn(["npx", ...args].map(quote).join(" "), { cwd: repoRoot, stdio: "inherit", shell: true })
    : spawn("npx", args, { cwd: repoRoot, stdio: "inherit" });
}
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));

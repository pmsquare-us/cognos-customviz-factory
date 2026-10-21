#!/usr/bin/env node
// playwright-mcp.mjs — cross-platform launcher for the project's Playwright MCP server (.mcp.json).
//
// Runs @playwright/mcp (pinned) from the repo root with tools/cognos-dev/playwright-mcp.json, so:
//   - the browser profile lives in .browser-profile/ (gitignored) and Cognos sign-ins persist;
//   - Chrome starts with the private/local-network-access checks disabled, so an https Cognos
//     page can load a bundle from `customvis start` on http://127.0.0.1:8585 without flipping
//     chrome://flags by hand;
//   - it works on Windows, where .mcp.json can't spawn `npx` directly.
// Extra args pass through, e.g. `--headless` or `--caps devtools`.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = ["-y", "@playwright/mcp@0.0.83", "--config", "tools/cognos-dev/playwright-mcp.json", ...process.argv.slice(2)];
// Windows can only run npx.cmd through a shell, so hand it one quoted command string.
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const child = process.platform === "win32"
  ? spawn(["npx", ...args].map(quote).join(" "), { cwd: repoRoot, stdio: "inherit", shell: true })
  : spawn("npx", args, { cwd: repoRoot, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));

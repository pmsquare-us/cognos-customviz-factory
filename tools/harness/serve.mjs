#!/usr/bin/env node
// serve.mjs — offline render harness for a built custom viz (no Cognos needed).
//
//   node tools/harness/serve.mjs <viz-folder> [--port 8686]
//
// Serves:
//   /                    harness page (?fixture=<name>|auto  ?w=&h=  ?grid=1  ?embed=1)
//   /viz/...             <viz-folder>/build/...   (run `customvis build` first)
//   /fixtures/index.json names of <viz-folder>/fixtures/*.json
//   /fixtures/<n>.json   a fixture: { mapping:{slot:caption}, rows:[{slot:value}], props:{}, selected:[rowIdx] }
//
// The page loads build/renderer/Main.js through RequireJS with d3 v5 from d3js.org (the same
// external Cognos uses), drives it through tools/harness/mock-host.js, and exposes
// window.__harness for automation. Responses are no-cache, so rebuild + reload picks up changes.
// No third-party dependencies — Node built-ins only.

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
let port = 8686;
let vizDir;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--port") port = Number(argv[++i]);
  else if (argv[i].startsWith("--")) fail(`unknown option: ${argv[i]}`);
  else vizDir = argv[i];
}
function fail(msg) {
  console.error(`harness: ${msg}`);
  process.exit(1);
}
if (!vizDir) fail("usage: node tools/harness/serve.mjs <viz-folder> [--port 8686]");
vizDir = resolve(vizDir);
if (!existsSync(join(vizDir, "vizdef.xml"))) fail(`${vizDir} has no vizdef.xml — not a custom viz folder`);

const harnessDir = dirname(fileURLToPath(import.meta.url));
const buildDir = join(vizDir, "build");
const fixturesDir = join(vizDir, "fixtures");
if (!existsSync(join(buildDir, "renderer", "Main.js"))) {
  console.warn(`harness: warning — ${join(buildDir, "renderer", "Main.js")} not found; run \`customvis build\` in the viz folder.`);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".css": "text/css",
};

// Resolve a URL path under root, refusing anything that escapes it.
function safeJoin(root, urlPath) {
  const p = resolve(root, "." + decodeURIComponent(urlPath));
  return p === root || p.startsWith(root + sep) ? p : null;
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function sendFile(res, file) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "not found");
  send(res, 200, readFileSync(file), TYPES[extname(file).toLowerCase()] || "application/octet-stream");
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (path === "/" || path === "/index.html") return sendFile(res, join(harnessDir, "harness.html"));
  if (path === "/favicon.ico") return send(res, 204, "");
  if (path.startsWith("/harness/")) return sendFile(res, safeJoin(harnessDir, path.slice("/harness".length)));
  if (path.startsWith("/viz/")) return sendFile(res, safeJoin(buildDir, path.slice("/viz".length)));
  if (path === "/fixtures/index.json") {
    const names = existsSync(fixturesDir)
      ? readdirSync(fixturesDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort()
      : [];
    return send(res, 200, JSON.stringify(names), TYPES[".json"]);
  }
  if (path.startsWith("/fixtures/")) return sendFile(res, safeJoin(fixturesDir, path.slice("/fixtures".length)));
  send(res, 404, "not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`harness: serving ${vizDir}`);
  console.log(`harness: http://127.0.0.1:${port}/   (grid: http://127.0.0.1:${port}/?grid=1)`);
});

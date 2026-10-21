#!/usr/bin/env node
// deploy-viz.mjs — upload (or update in place) a custom viz or schematic package to Cognos.
//
//   node tools/deploy-viz.mjs --env <client> <viz-folder | package.zip> [--yes] [--dry-run]
//
//   <viz-folder>   a customvis project: runs `customvis pack` there, then uploads <Name>.packed.zip
//   package.zip    an existing .packed.zip or .schematic.zip
//   --env <client> reads .env.<client> at the repo root (template: cognos.env.example)
//   --yes          confirm the FIRST upload of this package id to this environment (see below)
//   --dry-run      authenticate-free: print what would be uploaded where, then stop
//
// Auth (COGNOS_AUTH): "apikey" or "native" log in headlessly with PUT /api/v1/session and send the
// returned session key as `IBM-BA-Authorization: CAM <key>` (plus session cookies + XSRF header).
// "sso" can't log in headlessly — upload through the browser instead (tools/cognos-dev/README.md).
//
// Endpoints: CA 12.1's public REST API (api/v1) has no custom-visual endpoint, so the upload/update
// calls are the ones the Manage → Custom visuals page makes. They are captured once per CA version
// from a logged-in browser (README "Endpoint discovery") and set in the env file as
// "<METHOD> <path>" with {id} standing for the package id (or {storeId} for the visual's content
// store id, looked up from COGNOS_VIZ_LIST), e.g. COGNOS_VIZ_UPDATE="PUT /v1/…/{id}".
//
// Guardrail: an upload publishes code into the client's server, so the first upload of each
// package id to each environment needs --yes. Later uploads of the same id to that environment
// (updates in place) go through without it. Record: .cognos/deployed.json (gitignored).
// No third-party dependencies — Node built-ins only.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { randomBytes } from "node:crypto";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- arg parsing ----
const argv = process.argv.slice(2);
const opts = { yes: false, dryRun: false };
let target;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--env") opts.env = argv[++i];
  else if (a === "--yes") opts.yes = true;
  else if (a === "--dry-run") opts.dryRun = true;
  else if (a.startsWith("--")) fail(`unknown option: ${a}`);
  else target = a;
}
function fail(msg, code = 1) {
  console.error(`deploy-viz: ${msg}`);
  process.exit(code);
}
if (!opts.env || !target) fail("usage: node tools/deploy-viz.mjs --env <client> <viz-folder | package.zip> [--yes] [--dry-run]");

// ---- env file ----
const envPath = join(repoRoot, `.env.${opts.env}`);
if (!existsSync(envPath)) fail(`${envPath} not found — copy cognos.env.example to .env.${opts.env} and fill it in`);
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
}
const base = (env.COGNOS_URL || "").replace(/\/+$/, "");
if (!base) fail(`COGNOS_URL is empty in ${envPath}`);
const auth = (env.COGNOS_AUTH || "sso").toLowerCase();

// ---- package ----
function packFolder(dir) {
  console.log(`deploy-viz: customvis pack in ${dir}`);
  execSync("customvis pack", { cwd: dir, stdio: "inherit" });
  const zips = readdirSync(dir).filter((f) => f.endsWith(".packed.zip"))
    .map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!zips.length) fail(`customvis pack produced no *.packed.zip in ${dir}`);
  return zips[0];
}

// Read one file out of a zip (stored or deflated) via the central directory.
function readZipEntry(buf, name) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) fail("not a zip file");
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0, n = buf.readUInt16LE(eocd + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      return method === 0 ? data : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const targetPath = resolve(target);
if (!existsSync(targetPath)) fail(`${targetPath} not found`);
const zipPath = statSync(targetPath).isDirectory() ? packFolder(targetPath) : targetPath;
const zip = readFileSync(zipPath);
const metaRaw = readZipEntry(zip, "meta.json");
if (!metaRaw) fail(`${basename(zipPath)} has no meta.json at its root — not a Cognos viz/schematic package`);
const meta = JSON.parse(metaRaw.toString("utf8"));
if (!meta.id) fail("meta.json has no id");
const kind = meta.type === "schematic" ? "schematic" : "custom visual";

// ---- guardrail ----
const recordPath = join(repoRoot, ".cognos", "deployed.json");
const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : {};
const known = Boolean(record[opts.env] && record[opts.env][meta.id]);

console.log(`deploy-viz: ${kind} "${meta.name}" (${meta.id}) v${meta.version || "?"} → ${opts.env} (${base}), auth=${auth}`);
console.log(`deploy-viz: package ${zipPath} (${zip.length} bytes)`);

if (auth === "sso") {
  fail([
    "COGNOS_AUTH=sso can't log in headlessly. Upload through the browser instead:",
    "  Claude drives Manage → Customization → Custom visuals (or Schematics) in the Playwright browser,",
    `  using browser_file_upload with ${zipPath}. Steps: tools/cognos-dev/README.md "Upload via the browser".`,
    "  Or create an API key (Profile → My API keys) and set COGNOS_AUTH=apikey.",
  ].join("\n"), 2);
}

const parseEndpoint = (name) => {
  const v = env[name];
  if (!v) return null;
  const m = v.match(/^(GET|POST|PUT|PATCH)\s+(\S+)$/i);
  if (!m) fail(`${name} must look like "<METHOD> /path" — got "${v}"`);
  return { method: m[1].toUpperCase(), path: m[2].replace("{id}", encodeURIComponent(meta.id)) };
};
const upload = parseEndpoint("COGNOS_VIZ_UPLOAD");
const update = parseEndpoint("COGNOS_VIZ_UPDATE");
const list = parseEndpoint("COGNOS_VIZ_LIST");
if (!upload) {
  fail(`COGNOS_VIZ_UPLOAD is not set in ${envPath}. Capture it once from a logged-in browser — tools/cognos-dev/README.md "Endpoint discovery".`, 2);
}

if (opts.dryRun) {
  console.log(`deploy-viz: dry run — would ${update ? `${update.method} ${update.path} if it exists, else ` : ""}${upload.method} ${upload.path}`);
  if (!known) console.log(`deploy-viz: first upload of ${meta.id} to "${opts.env}" — a real run needs --yes`);
  process.exit(0);
}

if (!known && !opts.yes) {
  fail(`first upload of ${meta.id} to "${opts.env}" — this publishes code to that server. Re-run with --yes once confirmed.`, 3);
}

// ---- session ----
const cookies = new Map();
function keepCookies(res) {
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
let sessionKey = null;
function headers(extra = {}) {
  const h = { ...extra };
  if (sessionKey) h["IBM-BA-Authorization"] = `CAM ${sessionKey}`;
  if (cookies.size) h.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookies.has("XSRF-TOKEN")) h["X-XSRF-TOKEN"] = cookies.get("XSRF-TOKEN");
  return h;
}

const params = auth === "apikey"
  ? [{ name: "CAMAPILoginKey", value: env.COGNOS_API_KEY }]
  : [{ name: "CAMNamespace", value: env.COGNOS_NAMESPACE }, { name: "CAMUsername", value: env.COGNOS_USERNAME }, { name: "CAMPassword", value: env.COGNOS_PASSWORD }];
if (params.some((p) => !p.value)) fail(`missing credentials in ${envPath} for COGNOS_AUTH=${auth}`);

const login = await fetch(`${base}/api/v1/session`, {
  method: "PUT", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ parameters: params }),
});
keepCookies(login);
if (!login.ok) fail(`login failed: HTTP ${login.status} ${await login.text()}`);
sessionKey = (await login.json()).session_key || null;
// Cognos checks XSRF by double submit (X-XSRF-TOKEN header must equal the XSRF-TOKEN cookie), but
// an API-key session isn't issued that cookie — so mint one, as the browser UI does.
if (!cookies.has("XSRF-TOKEN")) cookies.set("XSRF-TOKEN", randomBytes(16).toString("hex"));
console.log("deploy-viz: logged in");

// ---- upload or update ----
async function send(ep) {
  let body, ctype;
  if ((env.COGNOS_VIZ_UPLOAD_FORMAT || "zip").toLowerCase() === "multipart") {
    body = new FormData();
    body.append(env.COGNOS_VIZ_UPLOAD_FIELD || "file", new Blob([zip], { type: "application/zip" }), basename(zipPath));
  } else {
    body = zip;
    ctype = "application/zip";
  }
  const res = await fetch(base + ep.path, { method: ep.method, headers: headers(ctype ? { "Content-Type": ctype } : {}), body });
  keepCookies(res);
  return res;
}

// The list (CA 12.1: GET /v1/visualizations/custom) returns [{ id, name, storeId, ... }]; an
// update path may address the visual by {storeId} instead of the package {id}.
let exists = known;
let storeId = null;
if (list) {
  const res = await fetch(base + list.path, { headers: headers() });
  if (res.ok) {
    const text = await res.text();
    exists = text.includes(meta.id);
    try {
      const entry = [].concat(JSON.parse(text)).find((v) => v && v.id === meta.id);
      if (entry && entry.storeId) storeId = entry.storeId;
    } catch {}
  }
}
if (update && update.path.includes("{storeId}")) {
  if (exists && !storeId) fail(`COGNOS_VIZ_UPDATE needs {storeId}, but the list response had none for ${meta.id}`);
  if (storeId) update.path = update.path.replace("{storeId}", encodeURIComponent(storeId));
}
const ep = exists && update ? update : upload;
console.log(`deploy-viz: ${ep.method} ${ep.path}${exists && update ? " (update in place)" : ""}`);
const res = await send(ep);
const text = await res.text();
if (!res.ok) fail(`upload failed: HTTP ${res.status} ${text.slice(0, 500)}`);
console.log(`deploy-viz: done — HTTP ${res.status}${text ? ` ${text.slice(0, 300)}` : ""}`);

await fetch(`${base}/api/v1/session`, { method: "DELETE", headers: headers() }).catch(() => {});

mkdirSync(dirname(recordPath), { recursive: true });
record[opts.env] = record[opts.env] || {};
record[opts.env][meta.id] = { name: meta.name, version: meta.version || null, lastDeployed: new Date().toISOString(), first: (record[opts.env][meta.id] || {}).first || new Date().toISOString() };
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");

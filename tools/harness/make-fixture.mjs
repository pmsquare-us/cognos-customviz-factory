#!/usr/bin/env node
// make-fixture.mjs — build harness fixtures from real Cognos query results, plus edge-case variants.
//
//   node tools/harness/make-fixture.mjs <viz-folder> --from <query.json> [--map slot=Column,...] [--name <n>]
//   node tools/harness/make-fixture.mjs <viz-folder> --stress [--base <fixture-name>] [--cat <slot>]
//
// --from   A cognos_query result saved as JSON ({ columns:[{name,type}], rows:[{Column:value}] }), or a
//          bare array of row objects. Query it at the grain the viz will get in a dashboard: group by
//          the columns bound to cat slots, total the measures. Real data brings what hand-written
//          fixtures miss: real totals and magnitudes, nulls, long names, real category counts.
//          --map binds slots to columns. Without it, cat slots take string columns and cont slots take
//          number columns, in vizdef order; the chosen mapping is printed. Optional slots are only
//          mapped when named in --map. Writes fixtures/<name>.json (default: "real-<first column>").
// --stress Writes fixtures/stress-*.json derived from a base fixture (default: the first real-* one,
//          else the first fixture, else synthetic rows from the vizdef):
//            nulls, many-categories (150), long-labels, negative-zero, extreme-magnitudes,
//            single-row, empty. --cat picks the categorical slot to stress (default: the first mapped
//          one); pick the one that drives the marks (e.g. "name" in a bar chart race, not "time").
// No third-party dependencies — Node built-ins only.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const opts = {};
let vizDir;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--from") opts.from = argv[++i];
  else if (a === "--map") opts.map = argv[++i];
  else if (a === "--name") opts.name = argv[++i];
  else if (a === "--stress") opts.stress = true;
  else if (a === "--base") opts.base = argv[++i];
  else if (a === "--cat") opts.cat = argv[++i];
  else if (a.startsWith("--")) fail(`unknown option: ${a}`);
  else vizDir = a;
}
function fail(msg) {
  console.error(`make-fixture: ${msg}`);
  process.exit(1);
}
if (!vizDir || (!opts.from && !opts.stress)) {
  fail("usage: make-fixture.mjs <viz-folder> --from <query.json> [--map slot=Column,...] [--name n] | --stress [--base n]");
}
vizDir = resolve(vizDir);
const vizdefPath = join(vizDir, "vizdef.xml");
if (!existsSync(vizdefPath)) fail(`${vizDir} has no vizdef.xml`);
const fixturesDir = join(vizDir, "fixtures");
mkdirSync(fixturesDir, { recursive: true });

// ---- vizdef: slots in <ref> order (same rule the renderer's cols[i] follows) ----
const xml = readFileSync(vizdefPath, "utf8");
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
const slots = new Map();
for (const m of xml.matchAll(/<slot\b[^>]*>/g)) {
  const t = m[0];
  slots.set(attr(t, "name"), { name: attr(t, "name"), caption: attr(t, "caption") || attr(t, "name"), type: attr(t, "type"), optional: attr(t, "optional") === "true" });
}
const refs = [...xml.matchAll(/<ref\b[^>]*slot="([^"]+)"/g)].map((m) => m[1]);
const ordered = (refs.length ? refs : [...slots.keys()]).map((n) => slots.get(n)).filter(Boolean);

const write = (name, fixture) => {
  const file = join(fixturesDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(fixture, null, 1) + "\n");
  console.log(`make-fixture: wrote ${file} (${fixture.rows.length} rows)`);
};

// ---- --from: real query result → fixture ----
if (opts.from) {
  const raw = JSON.parse(readFileSync(resolve(opts.from), "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) fail(`${opts.from}: expected a cognos_query result ({ rows: [...] }) or an array of rows`);
  const columns = !Array.isArray(raw) && raw.columns
    ? raw.columns.map((c) => ({ name: c.name, type: c.type }))
    : Object.keys(rows[0] || {}).map((name) => ({ name, type: rows.some((r) => typeof r[name] === "number") ? "number" : "string" }));
  if (raw.truncated) console.warn("make-fixture: warning — the query result was truncated; aggregate further or raise the limit");

  const mapping = {};
  if (opts.map) {
    for (const pair of opts.map.split(",")) {
      const [slot, ...col] = pair.split("=");
      const column = col.join("=").trim();
      if (!slots.has(slot.trim())) fail(`--map: "${slot}" is not a slot in vizdef.xml (slots: ${[...slots.keys()].join(", ")})`);
      if (!columns.some((c) => c.name === column)) fail(`--map: no column "${column}" in the query result (columns: ${columns.map((c) => c.name).join(", ")})`);
      mapping[slot.trim()] = column;
    }
  } else {
    const strings = columns.filter((c) => c.type !== "number").map((c) => c.name);
    const numbers = columns.filter((c) => c.type === "number").map((c) => c.name);
    for (const s of ordered.filter((s) => !s.optional)) {
      const pool = s.type === "cont" ? numbers : strings;
      if (!pool.length) fail(`no ${s.type === "cont" ? "number" : "string"} column left for required slot "${s.name}" — pass --map`);
      mapping[s.name] = pool.shift();
    }
  }
  const missing = ordered.filter((s) => !s.optional && !(s.name in mapping));
  if (missing.length) fail(`required slot(s) not mapped: ${missing.map((s) => s.name).join(", ")}`);
  console.log("make-fixture: mapping " + Object.entries(mapping).map(([s, c]) => `${s}=${c}`).join(", "));

  const fixture = {
    source: { from: basename(opts.from), rowCount: rows.length, truncated: Boolean(raw.truncated) },
    mapping: Object.fromEntries(Object.entries(mapping).map(([s, c]) => [s, c])),
    rows: rows.map((r) => Object.fromEntries(Object.entries(mapping).map(([s, c]) => {
      const v = r[c];
      return [s, slots.get(s).type === "cont" ? (v === null || v === undefined || v === "" ? null : Number(v)) : v === undefined ? null : v];
    }))),
  };
  const slug = (opts.name || `real-${Object.values(mapping)[0]}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  write(slug, fixture);
}

// ---- --stress: edge-case variants ----
if (opts.stress) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const existing = readdirSync(fixturesDir).filter((f) => f.endsWith(".json") && !f.startsWith("stress-")).map((f) => f.slice(0, -5)).sort();
  const baseName = opts.base || existing.find((n) => n.startsWith("real-")) || existing[0];
  let base;
  if (baseName) {
    base = JSON.parse(readFileSync(join(fixturesDir, `${baseName}.json`), "utf8"));
    console.log(`make-fixture: stress variants from "${baseName}"`);
  } else {
    const mapping = {};
    for (const s of ordered.filter((s) => !s.optional)) mapping[s.name] = s.caption;
    const rows = Array.from({ length: 6 }, (_, i) => Object.fromEntries(ordered.filter((s) => !s.optional)
      .map((s) => [s.name, s.type === "cont" ? Math.round(10 + rand() * 90) : `Item ${i + 1}`])));
    base = { mapping, rows };
    console.log("make-fixture: no fixtures yet — stress variants from synthetic rows");
  }
  const mapped = ordered.filter((s) => s.name in base.mapping);
  const cats = mapped.filter((s) => s.type !== "cont");
  const conts = mapped.filter((s) => s.type === "cont");
  if (opts.cat && !cats.some((s) => s.name === opts.cat)) fail(`--cat: "${opts.cat}" is not a mapped categorical slot (${cats.map((s) => s.name).join(", ")})`);
  const firstCat = opts.cat ? cats.find((s) => s.name === opts.cat) : cats[0];
  const variant = (rows, note) => ({ note, mapping: base.mapping, rows, ...(base.props ? { props: base.props } : {}) });
  const clone = () => base.rows.map((r) => ({ ...r }));

  // Nulls: every 3rd measure value missing, and one category value missing.
  const nulls = clone();
  nulls.forEach((r, i) => { if (i % 3 === 1) for (const c of conts) r[c.name] = null; });
  if (firstCat && nulls.length) nulls[nulls.length - 1][firstCat.name] = null;
  write("stress-nulls", variant(nulls, "every 3rd measure null; last row's first category null"));

  // Many categories: 150 members of the first categorical slot.
  if (firstCat) {
    const template = base.rows[0] || {};
    const many = Array.from({ length: 150 }, (_, i) => {
      const r = { ...template, [firstCat.name]: `Category ${String(i + 1).padStart(3, "0")}` };
      for (const c of conts) r[c.name] = Math.round(1000 * Math.pow(rand(), 2) * 100) / 100;
      return r;
    });
    write("stress-many-categories", variant(many, `150 members in "${firstCat.name}"`));

    const long = clone().map((r, i) => ({ ...r, [firstCat.name]: `${r[firstCat.name] ?? "Member"} — an unusually long category name that will not fit ${i + 1}` }));
    write("stress-long-labels", variant(long, "category names over 70 characters"));
  }

  // Negative and zero measures.
  const neg = clone();
  neg.forEach((r, i) => { for (const c of conts) r[c.name] = i % 3 === 0 ? 0 : i % 3 === 1 ? -Math.abs(Number(r[c.name]) || 50) : Math.abs(Number(r[c.name]) || 50); });
  write("stress-negative-zero", variant(neg, "measures cycle 0 / negative / positive"));

  // Extreme magnitudes in one series: 1e12 next to 0.001.
  const ext = clone();
  ext.forEach((r, i) => { for (const c of conts) r[c.name] = i % 2 === 0 ? 1e12 * (1 + i) : 0.001 * (1 + i); });
  write("stress-extreme-magnitudes", variant(ext, "1e12-scale values next to 0.001-scale values"));

  write("stress-single-row", variant(clone().slice(0, 1), "one data point"));
  write("stress-empty", variant([], "no rows (empty-state guard)"));
}

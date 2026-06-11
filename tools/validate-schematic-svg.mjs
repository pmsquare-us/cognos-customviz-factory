#!/usr/bin/env node
// validate-schematic-svg.mjs — lint a Cognos schematic SVG against the data-binding contract.
//
//   node tools/validate-schematic-svg.mjs <file.svg> [more.svg ...]
//     [--expect-keys <list.txt>]                              # reconcile against pasted data values
//     [--expect-keys-csv <data.csv> [--key-column <name|index>]]  # ...or a CSV category column
//
// With --expect-keys/--expect-keys-csv it diffs the SVG's data-cv-key set against the real data
// values: a region key with no data value is an ERROR (can never bind), a data value with no region
// is a warning, and case/whitespace near-misses are flagged as likely typos.
//
// Schematics have no compiler/build step, so annotation mistakes only surface (or silently
// fail) inside Cognos. This catches them up front. Contract is from
// docs/Cognos_CustomViz_Developer_Guide.md "Schematics" + docs/schematics-guide.md.
//
// Exit code: 0 = no errors (warnings allowed), 1 = at least one error or a bad invocation.
// No third-party dependencies — Node built-ins only.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Elements that may legitimately carry a data-cv-key / data-cv-view (guide line 1120/1139).
const MAPPABLE = new Set([
  "circle", "ellipse", "line", "path", "polygon", "polyline", "rect", "text", "svg", "g",
]);

// Tag scanner: yields each tag with its name, raw attribute string, and self-closing flag.
// Good enough for SVG (no CDATA-embedded "<"); we explicitly reject the constructs that would
// break this assumption (script/DOCTYPE) as part of the contract anyway.
const TAG_RE = /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function localName(tag) {
  const i = tag.indexOf(":");
  return (i === -1 ? tag : tag.slice(i + 1)).toLowerCase();
}

function parseAttrs(raw) {
  const out = [];
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw)) !== null) out.push([m[1], m[2] ?? m[3] ?? ""]);
  return out;
}

function countAttr(raw, name) {
  let n = 0;
  for (const [k] of parseAttrs(raw)) if (k.toLowerCase() === name) n++;
  return n;
}

function isExternalUri(v) {
  const s = v.trim();
  if (s === "" || s.startsWith("#") || s.startsWith("data:")) return false; // local / embedded
  return /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//"); // has a scheme or protocol-relative
}

function validate(file) {
  const errors = [];
  const warnings = [];
  const keys = [];
  const views = [];
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch (e) {
    return { errors: [`cannot read file: ${e.message}`], warnings, keys, views };
  }

  // Strip XML comments first so tag-like prose inside <!-- ... --> isn't parsed as markup.
  src = src.replace(/<!--[\s\S]*?-->/g, "");

  if (/<!DOCTYPE/i.test(src)) errors.push("DOCTYPE declaration is not allowed in schematic SVG.");

  let viewAncestorDepth = 0; // how many open ancestors carry data-cv-view (for nesting check)
  const stack = []; // each entry: { addsView: boolean }
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src)) !== null) {
    const closing = m[1] === "/";
    const name = localName(m[2]);
    const raw = m[3] || "";
    const selfClose = m[4] === "/";

    if (closing) {
      const frame = stack.pop();
      if (frame?.addsView) viewAncestorDepth--;
      continue;
    }

    const attrs = parseAttrs(raw);
    const get = (n) => attrs.find(([k]) => k.toLowerCase() === n)?.[1];
    const where = `<${name}${get("id") ? ` id="${get("id")}"` : ""}>`;

    // Forbidden elements.
    if (name === "script") errors.push(`${where}: <script> is not allowed.`);
    if (name === "a") errors.push(`${where}: <a> anchor tags are not allowed.`);
    if (name === "style") warnings.push(`${where}: <style>/CSS — prefer presentation attributes (Edge compatibility).`);

    // Forbidden attributes.
    for (const [k, v] of attrs) {
      const lk = k.toLowerCase();
      if (/^on[a-z]+$/.test(lk)) errors.push(`${where}: event handler "${k}" is not allowed.`);
      if ((lk === "href" || lk === "xlink:href") && isExternalUri(v))
        errors.push(`${where}: external URI reference ${k}="${v}" is not allowed.`);
      if (lk === "class") warnings.push(`${where}: class="${v}" — external CSS is unreliable in Edge; use presentation attributes.`);
    }

    // data-cv-key contract.
    const keyCount = countAttr(raw, "data-cv-key");
    if (keyCount > 1) errors.push(`${where}: multiple data-cv-key on one element (only one allowed).`);
    const key = get("data-cv-key");
    if (key !== undefined) {
      if (!MAPPABLE.has(name)) errors.push(`${where}: data-cv-key on unsupported element <${name}>. Allowed: ${[...MAPPABLE].join(", ")}.`);
      keys.push(key);
    }

    // data-cv-view contract.
    const viewCount = countAttr(raw, "data-cv-view");
    if (viewCount > 1) errors.push(`${where}: multiple data-cv-view on one element (only one allowed).`);
    const view = get("data-cv-view");
    const addsView = view !== undefined;
    if (addsView) {
      if (viewAncestorDepth > 0) errors.push(`${where}: nested data-cv-view ("${view}") — views cannot be nested.`);
      views.push(view);
    }

    // path must be closed.
    if (name === "path") {
      const d = (get("d") || "").trim();
      const closed = /[zZ]\s*$/.test(d);
      if (!closed) {
        const msg = `${where}: <path> d does not end with z/Z (paths must be closed).`;
        (key !== undefined ? errors : warnings).push(msg);
      }
    }

    if (!selfClose) {
      stack.push({ addsView });
      if (addsView) viewAncestorDepth++;
    }
  }

  return { errors, warnings, keys: [...new Set(keys)], views: [...new Set(views)] };
}

// ---- expected-key sources (reconcile SVG keys against the real data values) ----
// Minimal RFC4180-ish CSV parser (quotes, escaped "", embedded commas/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Distinct, trimmed, non-empty values from a CSV column (name or 0-based index; default 0).
function keysFromCsv(file, column) {
  const rows = parseCsv(readFileSync(file, "utf8")).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return [];
  let idx = 0;
  if (column !== undefined) {
    if (/^\d+$/.test(column)) idx = Number(column);
    else {
      idx = rows[0].findIndex((h) => h.trim().toLowerCase() === column.trim().toLowerCase());
      if (idx === -1) { console.error(`--key-column "${column}" not found in CSV header: ${rows[0].join(", ")}`); process.exit(1); }
    }
  }
  return [...new Set(rows.slice(1).map((r) => (r[idx] ?? "").trim()).filter(Boolean))];
}

// Plain list: newline- or comma-separated values (what a pasted column becomes when saved to a file).
function keysFromList(file) {
  return [...new Set(readFileSync(file, "utf8").split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean))];
}

function reconcile(expected, svgKeys) {
  const E = new Set(expected), S = new Set(svgKeys);
  const missingInSvg = expected.filter((k) => !S.has(k));   // data values with no region (warning)
  const extraInSvg = [...S].filter((k) => !E.has(k));        // regions bound to a non-data value (error)
  // Likely typos: an extra key that matches a missing one ignoring case/whitespace.
  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const nearMisses = [];
  for (const ex of extraInSvg) {
    const hit = missingInSvg.find((m) => norm(m) === norm(ex));
    if (hit) nearMisses.push([ex, hit]);
  }
  return { missingInSvg, extraInSvg, nearMisses };
}

// ---- arg parsing ----
const argv = process.argv.slice(2);
const files = [];
let expectList, expectCsv, keyColumn;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--expect-keys") expectList = argv[++i];
  else if (a === "--expect-keys-csv") expectCsv = argv[++i];
  else if (a === "--key-column") keyColumn = argv[++i];
  else if (a.startsWith("--")) { console.error(`unknown option: ${a}`); process.exit(1); }
  else files.push(a);
}
if (files.length === 0) {
  console.error(
    "usage: node tools/validate-schematic-svg.mjs <file.svg> [more.svg ...]\n" +
    "       [--expect-keys <list.txt>]            # newline/comma-separated data values\n" +
    "       [--expect-keys-csv <data.csv> [--key-column <name|index>]]"
  );
  process.exit(1);
}

let hadError = false;
const allKeys = [];
for (const file of files) {
  const { errors, warnings, keys, views } = validate(file);
  const label = basename(file);
  allKeys.push(...keys);
  console.log(`\n=== ${label} ===`);
  console.log(`  data-cv-key values (${keys.length}): ${keys.length ? keys.join(", ") : "(none)"}`);
  if (views.length) console.log(`  data-cv-view values (${views.length}): ${views.join(", ")}`);
  for (const w of warnings) console.log(`  [warn]  ${w}`);
  for (const e of errors) console.log(`  [ERROR] ${e}`);
  if (errors.length) {
    hadError = true;
    console.log(`  -> ${errors.length} error(s), ${warnings.length} warning(s) — FIX BEFORE PACKAGING.`);
  } else {
    console.log(`  -> OK (${warnings.length} warning(s)).`);
  }
}

// Optional: reconcile the union of SVG keys against the real data values.
if (expectList || expectCsv) {
  const expected = expectCsv ? keysFromCsv(expectCsv, keyColumn) : keysFromList(expectList);
  const svgKeys = [...new Set(allKeys)];
  const { missingInSvg, extraInSvg, nearMisses } = reconcile(expected, svgKeys);
  console.log(`\n=== key reconciliation (vs ${basename(expectCsv || expectList)}: ${expected.length} value(s)) ===`);
  for (const [ex, miss] of nearMisses)
    console.log(`  [ERROR] near-miss: SVG key "${ex}" looks like data value "${miss}" (case/whitespace) — make them identical.`);
  for (const k of extraInSvg.filter((k) => !nearMisses.some(([e]) => e === k)))
    console.log(`  [ERROR] SVG key "${k}" has no matching data value — that region can never bind.`);
  for (const k of missingInSvg.filter((k) => !nearMisses.some(([, m]) => m === k)))
    console.log(`  [warn]  data value "${k}" has no region in the SVG — it won't appear on the schematic.`);
  if (extraInSvg.length) hadError = true;
  if (!extraInSvg.length && !missingInSvg.length) console.log("  -> keys match exactly. ✓");
}

process.exit(hadError ? 1 : 0);

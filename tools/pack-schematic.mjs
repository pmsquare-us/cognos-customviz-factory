#!/usr/bin/env node
// pack-schematic.mjs — build an uploadable Cognos schematic package (.zip) from annotated SVG(s).
//
//   node tools/pack-schematic.mjs --name "My Schematic" [options] <file1.svg> [file2.svg ...]
//
// Options:
//   --name <str>          Display name (required).
//   --description <str>   Description (default "").
//   --icon <file>         Icon file (.svg/.png/.jpg). Default: the first SVG (matches IBM's export).
//   --id <str>            Package id. Default: com.ibm.vis.schematic.<random-uuid>.
//   --out <file>          Output zip path. Default: "<slug-of-name>.schematic.zip".
//
// Package format reverse-engineered from a real Cognos export (docs/CognosSchematicExample.zip):
//   zip root contains each SVG + meta.json (NO subfolders). meta.json:
//   { id, name, description, type:"schematic", icon:<filename>,
//     content:[ { key, caption, source:<filename>, keys:[] } ] }
//   NOTE: content[].keys is left [] — the verified IBM export uses [] even when the SVG has keys;
//   Cognos derives keys from the SVG at runtime. (See docs/schematics-guide.md.)
//
// Verify the contract first:  node tools/validate-schematic-svg.mjs <file.svg>
// No third-party dependencies — Node built-ins only.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { deflateRawSync } from "node:zlib";
import { randomUUID } from "node:crypto";

// ---- arg parsing ----
const argv = process.argv.slice(2);
const opts = { description: "" };
const svgs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--name") opts.name = argv[++i];
  else if (a === "--description") opts.description = argv[++i];
  else if (a === "--icon") opts.icon = argv[++i];
  else if (a === "--id") opts.id = argv[++i];
  else if (a === "--out") opts.out = argv[++i];
  else if (a.startsWith("--")) fail(`unknown option: ${a}`);
  else svgs.push(a);
}
function fail(msg) {
  console.error(`pack-schematic: ${msg}`);
  process.exit(1);
}
if (!opts.name) fail('missing --name "<display name>"');
if (svgs.length === 0) fail("provide at least one .svg file");

// ---- assemble entries ----
const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "schematic";
const outPath = opts.out || `${slug}.schematic.zip`;
const id = opts.id || `com.ibm.vis.schematic.${randomUUID()}`;

const files = []; // { name, data } at zip root
const content = [];
for (const svgPath of svgs) {
  let data;
  try {
    data = readFileSync(svgPath);
  } catch (e) {
    fail(`cannot read ${svgPath}: ${e.message}`);
  }
  const name = basename(svgPath);
  const stem = name.slice(0, name.length - extname(name).length);
  files.push({ name, data });
  content.push({ key: stem, caption: stem, source: name, keys: [] });
}

// Icon: explicit file, else reuse the first SVG (as IBM's export does).
let iconName;
if (opts.icon) {
  iconName = basename(opts.icon);
  if (!files.some((f) => f.name === iconName)) {
    try {
      files.push({ name: iconName, data: readFileSync(opts.icon) });
    } catch (e) {
      fail(`cannot read icon ${opts.icon}: ${e.message}`);
    }
  }
} else {
  iconName = files[0].name;
}

const meta = {
  id,
  name: opts.name,
  description: opts.description,
  type: "schematic",
  icon: iconName,
  content,
};
files.push({ name: "meta.json", data: Buffer.from(JSON.stringify(meta), "utf8") });

// ---- minimal ZIP writer (deflate, with CRC32) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// DOS date/time. Date is available in a normal Node process (unlike workflow scripts).
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

function buildZip(entries) {
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const comp = deflateRawSync(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // version needed
    lh.writeUInt16LE(0, 6);             // flags
    lh.writeUInt16LE(8, 8);             // method: deflate
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);  // compressed size
    lh.writeUInt32LE(data.length, 22);  // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);            // extra length
    locals.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);            // version made by
    ch.writeUInt16LE(20, 6);            // version needed
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);            // extra
    ch.writeUInt16LE(0, 32);            // comment
    ch.writeUInt16LE(0, 34);            // disk number
    ch.writeUInt16LE(0, 36);            // internal attrs
    ch.writeUInt32LE(0, 38);            // external attrs
    ch.writeUInt32LE(offset, 42);       // local header offset
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

writeFileSync(outPath, buildZip(files));
console.log(`Wrote ${outPath}`);
console.log(`  id:    ${id}`);
console.log(`  name:  ${opts.name}`);
console.log(`  icon:  ${iconName}`);
console.log(`  files: ${files.map((f) => f.name).join(", ")}`);
console.log(`\nUpload via: Manage > Customization > Custom visuals > Upload custom visual.`);

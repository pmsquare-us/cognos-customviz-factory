# Schematics Guide

Authoritative cheatsheet for generating Cognos **schematics** in this factory. (Quick-ref lives in
`gotchas.md`; the source of truth is `Cognos_CustomViz_Developer_Guide.md` → "Schematics".)

## What a schematic is — and how it differs from a code viz

A schematic maps data directly onto an **arbitrary graphic** (floor plan, seating chart, mechanical
drawing, schematic map). It is **just an annotated SVG packaged into a `.zip`** — there is:

- **No `vizdef.xml`, no `renderer/Main.ts`, no `RenderBase`, no `customvis` CLI, no TypeScript.**
- No build step. Annotation mistakes don't fail a compile — they silently misbehave in Cognos, so
  **validate before packaging** (`tools/validate-schematic-svg.mjs`).

Pan/zoom, thumbnails, filters, selections, view toggling, and region highlighting are all provided
**automatically by the host** ("Schematic preview") once the SVG is annotated and bundled. You do
not implement them.

## The annotation contract (the whole job)

**Bind elements to data with `data-cv-key`.** The key string must equal a **category value** in the
dataset the user binds in Cognos (plain string match).

```xml
<svg height="40" width="100" xmlns="http://www.w3.org/2000/svg">
  <g>
    <circle data-cv-key="A2" cx="10" cy="10" r="10" fill="#cd5c5c"/>
    <circle data-cv-key="A3" cx="30" cy="10" r="10" fill="#fa8072"/>
  </g>
</svg>
```

**Group elements into toggleable views with `data-cv-view`** (+ optional `title`, `desc`). Users
toggle views via the Views icon; if no `title`, the `data-cv-view` value is shown. All views on by default.

```xml
<g data-cv-view="view_0" title="Ward A" desc="…">
  <circle data-cv-key="A2" cx="10" cy="10" r="10"/>
</g>
```

**Mappable elements:** `circle, ellipse, line, path, polygon, polyline, rect, text, svg, g`.

## Rules & restrictions (the validator enforces these)

- One `data-cv-key` per element; **keys are flat** (no hierarchical/multi-part keys).
- At most one `data-cv-view` per element; an element lives in **one** view; **views cannot be nested**.
- Composite items OK: a `<g>` with `data-cv-view` (or `data-cv-key`) holding children — e.g. keyed
  regions plus decorative `<text>` labels with no keys.
- Every `<path>` must be **closed** (`d` ends with `z`/`Z`).
- **Presentation attributes only** (`fill`, `stroke`, …). Avoid `class`/`<style>`/external CSS (Edge).
- Supported SVG features: `use`, `defs`, `href` (local `#…`), embedded images (`data:` URIs).
- **Not allowed:** embedded JavaScript, `on*` handlers, animation events, `<a>` anchors, external URI
  references, `DOCTYPE` entities.

Validate any SVG against all of the above:

```
node tools/validate-schematic-svg.mjs <file.svg>   # exit 1 on any error; prints the data-cv-key list
```

**Reconcile keys against the real data** (run this whenever you have the values — it's the cheapest
way to catch a binding that won't work):

```
node tools/validate-schematic-svg.mjs <file.svg> --expect-keys <values.txt>        # pasted column
node tools/validate-schematic-svg.mjs <file.svg> --expect-keys-csv <data.csv> --key-column <name>
```

An SVG key with no matching data value is an ERROR (that region can never bind); a data value with no
region is a warning; case/whitespace near-misses are flagged as likely typos. Aim for
`keys match exactly. ✓`.

## Producing the SVG

Three intake paths (the `/generate-cognos-schematic` skill picks based on input):

1. **From a narrative description** — author clean SVG with supported elements + presentation
   attributes; close all paths; lay out regions to resemble the described graphic.
2. **From an example image** — `Read` the image, then reproduce it as a *schematic representation*
   (not a pixel trace). For complex raster art, the user can pre-trace to SVG (e.g. an external
   vectorizer) and feed that in as path 3.
3. **From an existing SVG** — annotate it. Strip anything disallowed (scripts, anchors, DOCTYPE,
   external refs); convert classes/`<style>` to presentation attributes.

In all cases: **the set of region keys is the contract.** `data-cv-key` is a literal string match
against the category values in the dataset bound in Cognos, so source the keys from the **real data**
whenever possible — have the user paste the category column or provide a CSV, and use its distinct
values as the canonical key set (zero mismatch risk). If the schematic instead defines canonical names
(e.g. fixed room IDs), those names become the keys and the user must conform their query to them.
Either way the match is **exact** (case + whitespace). Start from `templates/Schematic/template.svg`
or the closest `examples/` entry.

## Packaging (verified format)

The upload `.zip` (reverse-engineered from a real Cognos export) is **flat** — SVG file(s) + a
`meta.json` at the root, no subfolders:

```json
{
  "id": "com.ibm.vis.schematic.<uuid>",
  "name": "<display name>",
  "description": "",
  "type": "schematic",
  "icon": "<filename>",                 // may reuse the SVG itself
  "content": [
    { "key": "<stem>", "caption": "<stem>", "source": "<file.svg>", "keys": [] }
  ]
}
```

`content[].keys` stays `[]` — Cognos derives keys from the SVG at runtime (the verified export uses
`[]` even with keyed elements). Build it with:

```
node tools/pack-schematic.mjs --name "<Display Name>" [--description "…"] [--icon <file>] <file.svg> [more.svg …]
# -> <slug>.schematic.zip
```

**UI fallback** (if the auto-built zip is ever rejected, e.g. IBM changes the format): in a report
drag **Schematic preview** → **Edit package** (set Name/Description/Icon) → **Content** (upload the
SVGs) → **Download** the `.zip`.

## Deploy & preview

1. *Manage → Customization → Custom visuals → Upload custom visual* → select the `.zip` (requires the
   **Manage Visualizations** capability). Scripted alternative for a configured client environment:
   `node tools/deploy-viz.mjs --env <client> <slug>.schematic.zip` (see `tools/cognos-dev/README.md`).
2. In a report/dashboard, drag **Schematic preview**; bind a dataset whose category values match the
   `data-cv-key` set, plus a measure to color by.
3. Toggle **Highlight regions** to confirm every intended element is mapped (unmapped/non-mappable
   elements show at reduced opacity). Verify views toggle and pan/zoom/selection behave.

## Harvest

Copy the validated SVG + a short `spec.md` (key list + views) into `examples/`, and add a row to the
Schematics section of `examples/README.md` — examples are the few-shot material for the next build.

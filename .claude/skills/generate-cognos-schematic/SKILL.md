---
name: generate-cognos-schematic
description: >-
  Generate an IBM Cognos Analytics Schematic — a visualization that maps data onto an annotated
  SVG graphic (floor plan, seating chart, mechanical drawing, schematic map). Use when the user
  wants to create a schematic, map data to regions of an image/SVG, or annotate an SVG with
  data-cv-key/data-cv-view. Produces a clean annotated SVG and a ready-to-upload .zip package.
  This is NOT the code-viz path — schematics use no vizdef.xml, no RenderBase, no customvis CLI.
---

# Generate a Cognos Schematic

You are the orchestrator for this repo's **schematic** track. Schematics are annotated SVGs
packaged into a `.zip` — there is **no `vizdef.xml`, no `renderer/`, no `RenderBase`, no
`customvis` CLI, no build step**. (For code-based charts, use `/generate-cognos-viz` instead.)

Read `docs/schematics-guide.md` when you reach a stage that needs the contract — don't inline it.

## Reference map (read on demand)

- `docs/schematics-guide.md` — the contract, SVG-generation paths, rules, packaging, deploy. **Primary.**
- `docs/gotchas.md` — quick schematic rules + version/runtime notes.
- `templates/Schematic/template.svg` — minimal known-good annotated SVG to start from.
- `examples/` — finished schematics (e.g. `OfficeFloorPlan`); start from the closest one.
- `Cognos_CustomViz_Developer_Guide.md` → "Schematics" — authoritative source if a doc is insufficient.
- Tools: `tools/validate-schematic-svg.mjs` (lint), `tools/pack-schematic.mjs` (build the upload .zip).

## Stage 0 — Intake / spec (always do this first)

Restate a short spec; ask (AskUserQuestion) only what materially changes the build:
- **Input type:** narrative description / example image (you'll `Read` it) / existing SVG to annotate.
- **What the graphic represents** and rough layout.
- **Region keys — get the real data.** `data-cv-key` is a literal string match against the category
  values in the dataset the user binds in Cognos, so the key set *is* the contract. **Actively ask
  the user to provide those values** — paste the category column, point you at a CSV, or (schematic-
  defined) state the canonical region names. Two directions:
  - *Data-driven:* take the **distinct values of the category column** as the canonical key set →
    zero mismatch risk. Save pasted values to a file (e.g. `workbench/<name>.keys.txt`) or keep the CSV.
  - *Schematic-defined:* the region names become the keys; output the authoritative list so the user
    conforms their query to it.
  Match must be **exact** (case + whitespace). Don't invent keys when the user can supply real values.
- **Views:** should regions group into toggleable `data-cv-view`s? With what `title`s?
- **Package metadata:** display name, description, icon (defaults to the SVG itself).
- **Target CA version** (11.1.x / 12.x) — schematics are version-tolerant, but note it.

## Stage 1 — Produce the SVG

Per input type (see `docs/schematics-guide.md` "Producing the SVG"):
- **Description:** author SVG from scratch — supported elements only, presentation attributes, closed paths.
- **Image:** `Read` it, reproduce as a schematic representation (not a pixel trace).
- **Existing SVG:** ingest and clean it (strip scripts/anchors/DOCTYPE/external refs; classes/`<style>` → presentation attrs).

Start from `templates/Schematic/template.svg` or the closest `examples/` SVG. Work in `workbench/`.

## Stage 2 — Annotate & map

Add `data-cv-key` to each mappable region (key == intended dataset value). Group into
`data-cv-view` with `title`/`desc` as specified. Keep decorative elements (labels, walls) unkeyed.
One key and at most one (non-nested) view per element.

## Stage 3 — Validate & reconcile keys (gate before packaging)

```
node tools/validate-schematic-svg.mjs workbench/<name>.svg \
  [--expect-keys workbench/<name>.keys.txt | --expect-keys-csv <data.csv> --key-column <name>]
```
Fix every `[ERROR]` (exit 1). Resolve `[warn]`s (e.g. `class`/`<style>`) unless intentional.

**Always run with the data when you have it** (`--expect-keys` for pasted values, `--expect-keys-csv`
for a CSV column). The reconciliation diffs the SVG's keys against the real values:
- an SVG key with **no matching data value** is an ERROR (that region can never bind),
- a data value with **no region** is a warning,
- case/whitespace **near-misses** are flagged as likely typos — fix them to be byte-identical.

Aim for `keys match exactly. ✓`. If you only have region names (schematic-defined), confirm the
printed `data-cv-key` list matches the spec exactly instead.

## Stage 4 — Package

```
node tools/pack-schematic.mjs --name "<Display Name>" [--description "…"] [--icon <file>] workbench/<name>.svg
```
Produces `<slug>.schematic.zip` in the verified Cognos format. (UI fallback documented in the guide
if the format is ever rejected.)

## Stage 5 — Deploy & preview (guide the user)

Upload via *Manage → Customization → Custom visuals → Upload custom visual* (requires Manage
Visualizations). Then drag **Schematic preview** in a report, bind a dataset whose category values
match the keys + a measure, toggle **Highlight regions** to confirm all regions are mapped, and
verify views / pan-zoom / selection.

## Stage 6 — Harvest

Copy the validated SVG + a short `spec.md` (keys + views) into `examples/<Name>/`, and add a row to
the Schematics section of `examples/README.md`.

## Operating notes

- Confirm the spec (especially the key list) before drawing; validate before packaging; confirm before deploying.
- Presentation attributes only; close every `<path>`; keys are flat strings that must match data values.
- Prefer reusing the template/examples over inventing structure.

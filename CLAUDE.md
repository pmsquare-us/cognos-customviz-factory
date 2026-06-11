# CLAUDE.md

## Purpose

This repo is a **factory for IBM Cognos Analytics Custom Visualizations**. The goal is to
turn a **narrative description**, a **visual example**, or an existing **D3/other-format**
visualization into a working, deployable Cognos custom viz *quickly and repeatably* —
without re-deriving the toolchain, data contract, and rendering plumbing every time.

This is infrastructure, not a single viz: reference material + known-good templates + a
worked-example library + Claude Code skills that orchestrate the whole flow.

**Two tracks** (pick by output type):
- **Code visualizations** — `customvis` CLI + `RenderBase` + `vizdef.xml`. Skill: `/generate-cognos-viz`.
- **Schematics** — data mapped onto an annotated **SVG** (floor plan, seating chart, mechanical
  drawing, schematic map). **No CLI / RenderBase / vizdef** — just an annotated SVG packaged into a
  `.zip`. Skill: `/generate-cognos-schematic`. See `docs/schematics-guide.md`.

## How it's organized

```
docs/        Reference. Cognos_CustomViz_Developer_Guide.md is the source of truth.
             The other *.md files are condensed, generation-oriented cheatsheets
             (incl. schematics-guide.md for the schematic track).
templates/   Known-good baselines. customvis: BarChart / Basic / BasicJS. Schematic/: a
             reference annotated SVG. Start new work by copying from here, not from scratch.
examples/    Finished viz & schematics, harvested after each build. Few-shot references.
workbench/   Scratch area where new viz are scaffolded and built. Disposable.
tools/       Schematic helpers: validate-schematic-svg.mjs (lint), pack-schematic.mjs (build .zip).
.claude/skills/generate-cognos-viz/        /generate-cognos-viz orchestrator (code viz).
.claude/skills/generate-cognos-schematic/  /generate-cognos-schematic orchestrator (schematics).
```

## The generation playbook (follow these stages for every new viz)

0. **Intake/Spec** — input type (narrative vs D3 port); chart description; data shape
   (how many `cat` vs `cont` slots, which optional); interactivity (selection/highlight/
   tooltip); properties to expose; target CA version. Write a short spec first.
1. **Data contract → `vizdef.xml`** — the most important step. Slot order here defines
   every `cols[i]` / `value(i)` / `tuple(i)` index in `Main.ts`. See `docs/vizdef-reference.md`.
2. **Scaffold** — `customvis create <Name> -t BarChart` in `workbench/`, overwrite `vizdef.xml`.
3. **Implement `renderer/Main.ts`** — D3 port → `docs/d3-porting-guide.md`; fresh → `docs/patterns.md`.
4. **Build & preview** — `customvis start`, validate in Cognos (Dashboard *Custom → Test
   visualization* / Report *Advanced → Custom visual preview*), iterate with **Refresh**.
5. **Polish** — properties, legend, `nls/`, responsiveness, perf via `_info.reason`.
6. **Pack/Deploy & harvest** — `customvis pack` → upload via *Manage → Customization →
   Custom visuals*; copy the finished viz into `examples/`.

## The schematic playbook (annotated-SVG track — `/generate-cognos-schematic`)

No CLI/RenderBase/vizdef. Full detail in `docs/schematics-guide.md`; stages:
0. **Spec** — input type (description / example image / existing SVG); the **region key list**
   (`data-cv-key` values double as the dataset category values); views; package name/icon.
1. **Produce the SVG** — author from a description, reproduce from an image, or clean an existing SVG.
2. **Annotate** — `data-cv-key` per region; group into `data-cv-view` (+ `title`); presentation attrs; closed paths.
3. **Validate** — `node tools/validate-schematic-svg.mjs <svg>` (gate; exit 1 on errors).
4. **Package** — `node tools/pack-schematic.mjs --name "<Name>" <svg>` → `<slug>.schematic.zip`.
5. **Deploy & preview** — upload via *Manage → Custom visuals*; drag **Schematic preview**, bind
   data (category values must match keys), check **Highlight regions** / views / pan-zoom / selection.
6. **Harvest** — copy SVG + `spec.md` into `examples/`; add a row to `examples/README.md`.

## Toolchain (verified in this environment)

- `customvis` CLI **v1.7.7**, Node **v24.13.0**, npm **11.6.2**.
- Templates available: `BarChart`, `Basic`, `BasicJS`.
- Key commands: `customvis create|start|build|pack|info|list|upgrade`.
- Target **both CA 11.1.x (Node 16) and 12.x (Node 20)** — avoid version-specific APIs;
  version/runtime gotchas live in `docs/gotchas.md`.

## Core API mental model (full detail in docs/api-cheatsheet.md)

- Every viz extends **`RenderBase`**: `create(_node)` runs once; `update(_info)` runs on every
  data/size/property/decoration change.
- `UpdateInfo`: `.reason` (data/size/properties/decorations), `.data`, `.node`, `.props`, `.locale`.
- Data model: `DataSet.cols[i]` (a `Slot`: `.mapped`/`.tuples`/`.domain`) and `.rows` (each a
  `DataPoint`: `.value(i)`/`.tuple(i)`/`.caption(i)`/`.selected`/`.highlighted`).
- Color via palettes: `palette.getFillColor(dp)` / `getOutlineColor(dp)` (handle selection/highlight).
- Tooltips/selection/highlight are provided by the host once data is d3-bound (default `hitTest`).

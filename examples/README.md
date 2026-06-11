# Examples

Finished, known-good custom visualizations harvested after each build. Use the closest one
as a starting reference when generating a new viz (Stage 3 of the playbook).

## Code visualizations (`customvis` / RenderBase)

Each folder contains only **source** (no `node_modules`/`build`): `vizdef.xml`,
`renderer/Main.ts`, `package.json`, `nls/`, `static/`, `tsconfig.json`, `externals.d.ts`,
`icon.svg`. To work on one: copy it into `workbench/`, then `customvis build` / `customvis start`.

| Example | Slots | Demonstrates |
|---|---|---|
| **Lollipop** | `categories` (cat, color channel), `values` (cont) | Horizontal lollipop chart. Clean D3-port shape: static skeleton in `create()`, scales-from-data-model + keyed data joins in `update()`, palette-driven fills (selection/highlight for free), `length`/`boolean` properties, optional value labels. **Validated end-to-end (CLI v1.7.7): builds & packs clean, and renders correctly in Cognos** (dots/stems, tooltips, selection/highlight). |
| **BarChartRace** | `time` (cat), `name` (cat), `category` (cat, optional, color), `value` (cont) | Port of Observable's animated [Bar Chart Race](https://observablehq.com/@d3/bar-chart-race). Shows the **animation** pattern: the Observable async-generator becomes a token-guarded autoplay loop launched from `update()` (fire-and-forget so a `loop` never blocks the render cycle; a new `update()` bumps the token to interrupt). Reshapes long-format data with **plain JS** (the host's **D3 v5** lacks `d3.rollup`/`d3.groups`), replicates the keyframe/rank/prev-next interpolation, top axis, per-bar name+value labels, and the period "ticker". Best-effort tooltips via a custom `hitTest` mapping each bar to a `DataPoint`. Properties: Top N, frames/step, step duration, loop, labels. **Builds clean (CLI v1.7.7); in-Cognos render pending user test.** |
| **AnimatedLineChart** | `categories` (cat), `values` (cont), `series` (cat, optional, color) | Animated line chart with per-series reveal, smooth vs straight lines, optional markers/area fill, and palette-driven series colors. Demonstrates customvis animation, responsive axes, and series-driven data joins using the standard `renderer/Main.ts` layout. Standard source layout; in-Cognos render pending user test. |
| **SankeyChart** | `source` (cat), `target` (cat), `value` (cont) | Sankey flow diagram using `d3-sankey` with palette colors sourced from the `source` slot, configurable node width/padding, optional dark mode, and display toggles for node names/values/percent. Demonstrates customvis integration of a complex layout library and edge/node styling in Cognos-ready source form. Standard source layout; in-Cognos render pending user test. |

## Schematics (annotated SVG)

Annotated-SVG visualizations — no `customvis`/RenderBase. Each folder has the `.svg` plus a
`spec.md` (key list + views). To build: `node tools/validate-schematic-svg.mjs <svg>` then
`node tools/pack-schematic.mjs --name "<Name>" <svg>`. See `docs/schematics-guide.md`.

| Example | Keys / Views | Demonstrates |
|---|---|---|
| **OfficeFloorPlan** | 6 keys (`Reception`, `Open Plan`, `Meeting A/B`, `Kitchen`, `Server Room`); 3 views (Workspaces / Meeting Rooms / Facilities) | Office floor plan. `data-cv-key` on `rect`s and a **closed `<path>`** (L-shaped server room); three `data-cv-view` groups with `title`s; composite items (keyed regions + decorative `<text>` labels); presentation attributes only; decorative outer wall left unkeyed. **Validates clean & packs to the verified Cognos format; in-Cognos render pending user test.** |

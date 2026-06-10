# Examples

Finished, known-good custom visualizations harvested after each build. Use the closest one
as a starting reference when generating a new viz (Stage 3 of the playbook).

Each folder contains only **source** (no `node_modules`/`build`): `vizdef.xml`,
`renderer/Main.ts`, `package.json`, `nls/`, `static/`, `tsconfig.json`, `externals.d.ts`,
`icon.svg`. To work on one: copy it into `workbench/`, then `customvis build` / `customvis start`.

| Example | Slots | Demonstrates |
|---|---|---|
| **Lollipop** | `categories` (cat, color channel), `values` (cont) | Horizontal lollipop chart. Clean D3-port shape: static skeleton in `create()`, scales-from-data-model + keyed data joins in `update()`, palette-driven fills (selection/highlight for free), `length`/`boolean` properties, optional value labels. **Validated end-to-end (CLI v1.7.7): builds & packs clean, and renders correctly in Cognos** (dots/stems, tooltips, selection/highlight). |
| **BarChartRace** | `time` (cat), `name` (cat), `category` (cat, optional, color), `value` (cont) | Port of Observable's animated [Bar Chart Race](https://observablehq.com/@d3/bar-chart-race). Shows the **animation** pattern: the Observable async-generator becomes a token-guarded autoplay loop launched from `update()` (fire-and-forget so a `loop` never blocks the render cycle; a new `update()` bumps the token to interrupt). Reshapes long-format data with **plain JS** (the host's **D3 v5** lacks `d3.rollup`/`d3.groups`), replicates the keyframe/rank/prev-next interpolation, top axis, per-bar name+value labels, and the period "ticker". Best-effort tooltips via a custom `hitTest` mapping each bar to a `DataPoint`. Properties: Top N, frames/step, step duration, loop, labels. **Builds clean (CLI v1.7.7); in-Cognos render pending user test.** |

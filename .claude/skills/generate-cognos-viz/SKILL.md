---
name: generate-cognos-viz
description: >-
  Generate an IBM Cognos Analytics Custom Visualization from a narrative description or by
  porting existing D3/other-format viz code. Use when the user wants to create, scaffold, port,
  or build a Cognos custom viz, a vizdef.xml, or a RenderBase renderer. Drives the customvis CLI
  end-to-end (create → implement → build → preview → pack) and harvests the result into examples/.
---

# Generate a Cognos Custom Visualization

You are the orchestrator for this repo's viz factory. Follow the staged playbook below.
Do **not** inline the reference material — read the relevant `docs/*.md` file when you reach
the stage that needs it.

## Reference map (read on demand)

- `docs/api-cheatsheet.md` — RenderBase lifecycle, UpdateInfo, data model, palettes, legends.
- `docs/vizdef-reference.md` — full vizdef.xml schema + slot-design decision guide.
- `docs/patterns.md` — copy-paste recipes (scales, joins, palettes, optional slots, perf).
- `docs/d3-porting-guide.md` — D3 → RenderBase conversion checklist (use for ports).
- `docs/gotchas.md` — version/runtime/coding traps (read before building & deploying).
- `examples/` — finished viz; pick the closest as a starting reference.
- `templates/` — known-good `customvis create` baselines (BarChart / Basic / BasicJS).
- `tools/harness/README.md` — offline render harness + fixture format (Stage 4a).
- `tools/cognos-dev/README.md` — Playwright browser loop in Cognos, upload via UI, endpoint discovery (Stage 4b, 6).
- `Cognos_CustomViz_Developer_Guide.md` — authoritative source if a doc is insufficient.

## Stage 0 — Intake / spec (always do this first)

Ask only what you can't infer. Capture and restate as a short spec:
- **Input type:** narrative description, or port (paste/point to the D3/other source).
- **Chart description** + any visual example.
- **Data shape:** how many categorical (`cat`) vs continuous (`cont`) slots; which optional.
- **Interactivity:** selection / highlight / tooltip needed? (default: yes)
- **Properties to expose:** colors/palette, labels, axis options, etc.
- **Target CA version** (11.1.x vs 12.x) — flag version gotchas if it matters.
Use AskUserQuestion if any of these materially change the build; otherwise proceed with sensible
defaults and state them.

## Stage 1 — Data contract → vizdef.xml

Design slots **first** (read `docs/vizdef-reference.md`). Fix the `<ref>` order and mirror it as
`const CAT=0, VAL=1, ...` in the renderer. Add `channel="color"` + a `<palette>` where a legend is
wanted. Decide `<capabilities>` decorations.

## Stage 2 — Scaffold

In `workbench/`: `customvis create <Name> -t BarChart` (BarChart for most d3 charts; `Basic`/
`BasicJS` for non-d3 or plain JS). Then overwrite `vizdef.xml` with the Stage 1 contract.
Set a unique `meta.id` in `package.json` (e.g. `com.pmsquare.vis.<name>`).

## Stage 3 — Implement renderer/Main.ts

- **Port:** follow `docs/d3-porting-guide.md` step by step.
- **Narrative:** start from the closest `examples/` entry and assemble with `docs/patterns.md`.
Keep `create()` for one-time DOM, `update()` for data/size/property-driven rendering. Bind
`.data(data.rows, d=>d.key)` so tooltips/selection work via the default hitTest. Color via
`palette.getFillColor/getOutlineColor`.

## Stage 4 — Build & preview (you check your own output)

**4a. Offline loop first** (`tools/harness/README.md`). Write `fixtures/<name>.json` shaped to the
Stage 1 slots: one realistic fixture, plus one with each optional slot unmapped. Then:
`customvis build` → `node tools/harness/serve.mjs workbench/<Name>` (background) → in the Playwright
browser, open `http://127.0.0.1:8686/?fixture=<name>`, `browser_evaluate` `__harness.status` /
`__harness.errors`, then screenshot. Also check `?fixture=auto` (unmapped optional slots) and
`?grid=1` (small/medium/large). Click a mark to confirm selection dims the rest. Fix and rebuild
until there are zero errors and the screenshot matches the spec. Don't hand the user a viz you
haven't seen render.

**4b. In-Cognos loop** (`tools/cognos-dev/README.md`) for what the harness can't show: host
tooltips, cross-widget selection, legend, properties panel, real formatting. Run `customvis start`
in the background, open the client's **CV Dev Harness** dashboard (`COGNOS_HARNESS_DASHBOARD` in
`.env.<client>`), click **Refresh visualization**, then read `browser_console_messages` and
screenshot. On a client's first run the user signs in once in the Playwright window; you never
enter credentials. If the Playwright tools aren't loaded, tell the user to restart Claude Code in
the repo and approve the `playwright` MCP server.

## Stage 5 — Polish

Properties + `updateProperty` (`meta.legendShape`, `properties.setActive`), `updateLegend`
filtering, `nls/` localization, responsiveness, and the `_info.reason` performance gates.
Check `docs/gotchas.md`.

## Stage 6 — Pack / deploy & harvest

Bump `meta.version` in `package.json`, then deploy:
- `COGNOS_AUTH=apikey|native`: `node tools/deploy-viz.mjs --env <client> workbench/<Name>`
  (packs, then uploads or updates in place).
- `sso`, or endpoints not captured yet: upload through the Manage UI in the Playwright browser
  (`tools/cognos-dev/README.md` "Upload via the browser").

**Ask the user before the first upload of a package to a client environment**, because it
publishes code to their server. `deploy-viz.mjs` enforces this (`--yes`). Updates of a package
already deployed there go through without asking. **Copy the finished viz folder, including
`fixtures/`, into `examples/`** (and add a one-line note to its README) so it improves future
generation.

## Operating notes

- Confirm the spec before writing code; confirm before the first deploy to a client environment.
- `customvis` CLI is v1.7.7; templates pin D3 **v5** — write against v5 APIs.
- Prefer reusing patterns/examples over inventing new structure.

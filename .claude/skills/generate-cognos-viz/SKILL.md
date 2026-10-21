---
name: generate-cognos-viz
description: >-
  Generate an IBM Cognos Analytics Custom Visualization from a narrative description or by
  porting existing D3/other-format viz code. Use when the user wants to create, scaffold, port,
  or build a Cognos custom viz, a vizdef.xml, or a RenderBase renderer. Drives the customvis CLI
  end-to-end (create → implement → build → offline preview → pack) and harvests the result into
  examples/; optionally validates in and deploys to a named Cognos environment.
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
- `tools/harness/README.md` — offline render harness, fixture format, `make-fixture.mjs` (Stage 4a).
- `tools/cognos-dev/README.md` — Connected mode only: Playwright loop in Cognos, upload, endpoints (Stage 4b, 6).
- `Cognos_CustomViz_Developer_Guide.md` — authoritative source if a doc is insufficient.

## Stage 0 — Intake / spec (always do this first)

Ask only what you can't infer. Capture and restate as a short spec:
- **Input type:** narrative description, or port (paste/point to the D3/other source).
- **Chart description** + any visual example.
- **Data shape:** how many categorical (`cat`) vs continuous (`cont`) slots; which optional.
- **Interactivity:** selection / highlight / tooltip needed? (default: yes)
- **Properties to expose:** colors/palette, labels, axis options, etc.
- **Target CA version** (11.1.x vs 12.x) — flag version gotchas if it matters.
- **Cognos mode** (decides whether Stages 4b and 6-deploy run):
  - **Offline (default):** harness validation plus a packed `.zip` the user uploads themselves.
    No Cognos login, no client server touched.
  - **Connected:** pick this only when the user names a client environment *and*
    `.env.<client>` exists at the repo root. It adds the in-Cognos check (4b) and the deploy
    (6). Without an env file, stay offline and say how to connect (`cognos.env.example`,
    `tools/cognos-dev/README.md`). Never make the user set up Cognos just to get a viz.
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

**4a. Offline harness (always).** See `tools/harness/README.md`.

1. **Fixtures.** Build them in this order of preference:
   - **Real data** when a Cognos data source is reachable, which only needs the Cognos MCP
     connector, not Connected mode. Run `cognos_query` at the grain the viz will get (group by the
     columns for the cat slots, total the measures), save the result JSON, then run
     `node tools/harness/make-fixture.mjs workbench/<Name> --from <result.json> [--map slot=Column,...]`.
   - Otherwise, hand-write one realistic `fixtures/<name>.json`.
   - Then always run `node tools/harness/make-fixture.mjs workbench/<Name> --stress [--cat <slot>]`.
     This adds the nulls, 150-categories, long-labels, negative/zero, extreme-magnitudes,
     single-row and empty cases. `--cat` is the slot that drives the marks.
2. **Render.** `customvis build`, then `node tools/harness/serve.mjs workbench/<Name>` in the
   background. For each fixture, plus `?fixture=auto` (optional slots unmapped) and `?grid=1`
   (three sizes), open `http://127.0.0.1:8686/?fixture=<name>` in the Playwright browser.
3. **Check** each render:
   - `browser_evaluate` `__harness.status` / `__harness.errors`.
   - Take a screenshot.
   - Click a mark to confirm selection dims the rest.
   - Judge the stress cases by eye: a null shouldn't look like zero, negatives shouldn't vanish,
     labels shouldn't collide or clip.
4. Fix and rebuild until there are zero errors and the screenshots match the spec. Report what each
   stress case showed. Don't hand the user a viz you haven't seen render.

If the Playwright tools aren't loaded, tell the user to run `npm install --prefix tools/cognos-dev`
once, then `/mcp` → reconnect `playwright`. In the meantime, give them the harness URL to open.

**4b. In-Cognos check (Connected mode only).** See `tools/cognos-dev/README.md`. It covers what
the harness can't show: host tooltips and legend, the properties panel, real formatting,
cross-widget selection, and theme CSS.

1. Run `customvis start` in the background.
2. Open the client's **CV Dev Harness** dashboard (`COGNOS_HARNESS_DASHBOARD`), rebinding slots if
   the viz's slot list differs.
3. Click **Refresh visualization**, then read `browser_console_messages` and take a screenshot.

Do this once near the end, plus whenever the work touches properties, the legend, formatting,
interactions, or animation. On a client's first run the user signs in once in the Playwright
window; you never enter credentials. Offline mode skips 4b. Say so in the hand-off, listing what
wasn't checked in Cognos.

## Stage 5 — Polish

Properties + `updateProperty` (`meta.legendShape`, `properties.setActive`), `updateLegend`
filtering, `nls/` localization, responsiveness, and the `_info.reason` performance gates.
Check `docs/gotchas.md`.

## Stage 6 — Pack / deploy & harvest

Bump `meta.version` in `package.json`.

- **Offline mode:** run `customvis pack`. Hand the user the path to `<Name>.packed.zip` and the
  manual upload step: *Manage → Customization → Custom visuals → Upload custom visual*, or
  ⋯ → **Update** for an existing one.
- **Connected mode:** deploy.
  - `COGNOS_AUTH=apikey|native`: run `node tools/deploy-viz.mjs --env <client> workbench/<Name>`.
    It packs, then uploads or updates in place.
  - `sso`, or endpoints not captured for that CA version yet: upload through the Manage UI in the
    Playwright browser (`tools/cognos-dev/README.md` "Upload via the browser").
  - **Ask the user before the first upload of a package to a client environment**, because it
    publishes code to their server. `deploy-viz.mjs` enforces this with `--yes`. Updates of a
    package already deployed there go through without asking.

In either mode, **copy the finished viz folder, including `fixtures/`, into `examples/`** (and add
a one-line note to its README) so it improves future generation.

## Operating notes

- Confirm the spec before writing code; confirm before the first deploy to a client environment.
- Connected mode is opt-in per run. A configured `.env.<client>` alone doesn't switch it on;
  the user names the environment.
- `customvis` CLI is v1.7.7; templates pin D3 **v5** — write against v5 APIs.
- Prefer reusing patterns/examples over inventing new structure.

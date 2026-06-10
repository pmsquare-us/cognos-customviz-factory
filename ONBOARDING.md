# Onboarding: Cognos CustomViz Factory

Welcome! This repo lets you build **IBM Cognos Analytics Custom Visualizations** with Claude Code
doing the heavy lifting. You describe a chart (or paste D3 source to port) and the
`/generate-cognos-viz` skill drives the whole build — data contract, renderer, build, preview,
and packaging.

You don't need to learn the Cognos SDK internals to get started. You do need the tooling below.

## 1. Get set up (one time)

```bash
# Node.js — verified on v24.13.0 / npm 11.6.2
node --version

# The Cognos Custom Visualization SDK CLI (provides the `customvis` command)
npm install -g @businessanalytics/customvis
customvis --version          # expect 1.7.7

# Clone and open in Claude Code
git clone https://github.com/pmsquare-us/cognos-customviz-factory.git
cd cognos-customviz-factory
claude
```

You'll also need a **Cognos Analytics** environment with the *Manage Visualizations* capability
to preview and deploy what you build.

## 2. Build your first viz

In Claude Code, run:

```
/generate-cognos-viz
```

Then tell it what you want. Two ways in:

- **Narrative:** "Build a horizontal lollipop chart with a category slot and a value slot,
  colored by category, with optional value labels."
- **Port:** "Port this Observable/D3 chart" and paste the source or a link.

The skill asks only what it can't infer, then walks these stages so you don't have to:

| Stage | What happens |
|---|---|
| 0. Spec | Restates input type, chart, data shape, interactivity, properties, target CA version. |
| 1. Data contract | Designs `vizdef.xml` slots **first** — slot order fixes every data index in the renderer. |
| 2. Scaffold | `customvis create <Name> -t BarChart` in `workbench/`, overwrites `vizdef.xml`. |
| 3. Implement | Writes `renderer/Main.ts` from the closest example + patterns (or a D3-port checklist). |
| 4. Build & preview | `customvis build` / `customvis start`; you validate in Cognos and iterate with **Refresh**. |
| 5. Polish | Properties, legend, `nls/` localization, responsiveness, performance gates. |
| 6. Pack & harvest | `customvis pack` → upload in Cognos; finished viz is copied into `examples/`. |

## 3. Preview in Cognos

With `customvis start` running locally:
- **Dashboard:** Visualization → Custom → **Test visualization**
- **Report:** Insertable objects → Advanced → **Custom visual preview**

Then **Refresh visualization** after each rebuild.

## 4. Where things live

- `docs/` — reference; `Cognos_CustomViz_Developer_Guide.md` is the source of truth, the rest are cheatsheets.
- `templates/` — known-good scaffolding baselines.
- `examples/` — finished viz used as references (start from the closest one).
- `workbench/` — disposable build area.
- `CLAUDE.md` — Claude reads this automatically; it encodes the playbook and conventions.

## 5. Give back

When you finish a viz, **harvest it**: copy the source folder into `examples/` and add a row to
`examples/README.md`. The skill uses examples as few-shot references, so each one you add makes
the next person's build better.

## Good to know

- **The IBM SDK library isn't checked in.** It's *Licensed Materials – Property of IBM*, so
  this repo doesn't redistribute it. After copying a template/example into `workbench/`, run
  **`customvis upgrade`** in that folder (or scaffold fresh with `customvis create`) to fetch
  `customvis-lib.tgz` before building. The `/generate-cognos-viz` skill handles this for you.
- Templates pin **D3 v5** — write against v5 APIs (no `d3.rollup`/`d3.groups`; use plain JS).
- Target both CA 11.1.x (Node 16) and 12.x (Node 20) — avoid version-specific APIs. See `docs/gotchas.md`.
- Confirm the spec before code, and confirm before packing/deploying — the skill does this by default.

Stuck? Ask Claude Code in the repo — `CLAUDE.md` and the skill give it full context on the workflow.

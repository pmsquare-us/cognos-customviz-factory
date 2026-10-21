# Onboarding: Cognos CustomViz Factory

Welcome! This repo lets you build **IBM Cognos Analytics Custom Visualizations** with Claude Code
doing the heavy lifting. There are two tracks:

- **Code visualizations** — describe a chart (or paste D3 source to port) and `/generate-cognos-viz`
  drives the whole build: data contract, renderer, build, packaging, and checking its own renders
  before handing anything to you.
- **Schematics** — map data onto a graphic (floor plan, seating chart, …). `/generate-cognos-schematic`
  generates an annotated SVG and a ready-to-upload package. No SDK/CLI involved.

You don't need to learn the Cognos SDK internals to get started. You do need the tooling below.

## 1. Get set up (one time)

```bash
# Node.js — verified on v24.13.0 / npm 11.6.2
node --version

# The Cognos Custom Visualization SDK CLI (provides the `customvis` command).
# NOT on public npm — download customvis.tgz from your own Cognos Analytics server first:
#   https://<your-cognos-server>/bi/js/vida/customvis.tgz
#   (right-click > Save As > All Files; don't use Firefox — it mangles .tgz)
npm install -g customvis.tgz   # run from the download directory
customvis --version            # expect 1.7.7  (then you can delete customvis.tgz)

# Clone, install the browser tool Claude uses to check renders, and open in Claude Code
git clone https://github.com/pmsquare-us/cognos-customviz-factory.git
cd cognos-customviz-factory
npm install --prefix tools/cognos-dev   # pinned Playwright MCP (drives your installed Google Chrome)
claude                                  # approve the "playwright" MCP server when prompted
```

You need **Google Chrome** installed. To upload and use what you build, you need a **Cognos
Analytics** environment with the *Manage Visualizations* capability. Building and checking
renders don't need one.

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
| 0. Spec | Restates input type, chart, data shape, interactivity, properties, target CA version, and mode (Offline by default, or Connected to a client environment you name). |
| 1. Data contract | Designs `vizdef.xml` slots **first** — slot order fixes every data index in the renderer. |
| 2. Scaffold | `customvis create <Name> -t BarChart` in `workbench/`, overwrites `vizdef.xml`. |
| 3. Implement | Writes `renderer/Main.ts` from the closest example + patterns (or a D3-port checklist). |
| 4. Build & check | `customvis build`, then Claude renders it in the offline harness with real-data and edge-case fixtures, reads errors, and looks at screenshots. Connected mode adds a live check in Cognos. |
| 5. Polish | Properties, legend, `nls/` localization, responsiveness, performance gates. |
| 6. Pack & harvest | `customvis pack`. You upload the zip, or Claude deploys it in Connected mode. The finished viz is copied into `examples/`. |

At the end, Claude tells you what it checked and what it didn't, for example host-only behavior
when it didn't run in Cognos.

## 2b. Or build a schematic

To map data onto a graphic instead of a chart, run `/generate-cognos-schematic`. Describe the
graphic (or share an example image / existing SVG) and the **region keys** — the labels that will
match your dataset's category values. The skill generates a clean annotated SVG (`data-cv-key` per
region, optional toggleable `data-cv-view` groups), validates it, and packages a `.zip` you upload
via *Manage → Customization → Custom visuals*. No `customvis`/RenderBase — it's an annotated SVG.

The two helper scripts also work on their own:

```
node tools/validate-schematic-svg.mjs <file.svg>          # lint against the contract
node tools/pack-schematic.mjs --name "<Name>" <file.svg>  # build <slug>.schematic.zip
```

See `docs/schematics-guide.md` and `examples/OfficeFloorPlan/`.

## 3. Preview

**Offline (no Cognos):** after `customvis build`, run
`node tools/harness/serve.mjs workbench/<Name>` and open `http://127.0.0.1:8686/`. Pick a fixture,
change properties, click marks to select, and add `?grid=1` to see three sizes. Fixtures live in
`workbench/<Name>/fixtures/`. `node tools/harness/make-fixture.mjs` builds them from a Cognos query
result (`--from`) and generates edge cases (`--stress`). See `tools/harness/README.md`.

**In Cognos, by hand:** with `customvis start` running locally:
- **Dashboard:** Visualization → Custom → **Test visualization**
- **Report:** Insertable objects → Advanced → **Custom visual preview**

Then **Refresh visualization** after each rebuild. In your everyday Chrome you may need to set
the `Local Network Access Checks` / `Block insecure private network requests` flag to Disabled
first. The Playwright browser does this for you.

## 3b. Connect Claude to a Cognos environment (optional)

Once per client, Claude can do the in-Cognos check and the upload itself:

1. `cp cognos.env.example .env.<client>` and set `COGNOS_URL` and `COGNOS_AUTH`. For `apikey`,
   paste a key from *Profile and settings → My API keys* into the file yourself. The file is
   gitignored.
2. Name the environment when you ask for a build, for example "…and deploy it to acme".
3. On first use, Claude opens Cognos in its Chrome window and **you sign in** (it never types
   credentials). It then sets up a *CV Dev Harness* dashboard for live previews.
4. Claude asks before the first upload of each package to an environment. Later updates to the
   same package go through without asking.

The full runbook, including upload endpoints for other CA versions, is in `tools/cognos-dev/README.md`.

## 4. Where things live

- `docs/` — reference; `Cognos_CustomViz_Developer_Guide.md` is the source of truth, the rest are cheatsheets.
- `templates/` — known-good baselines (customvis scaffolds + a `Schematic/` reference SVG).
- `examples/` — finished viz & schematics used as references (start from the closest one), with
  their harness fixtures.
- `tools/` — schematic helpers (`validate-schematic-svg.mjs`, `pack-schematic.mjs`); `harness/`
  (offline preview + `make-fixture.mjs`); `cognos-dev/` (Playwright browser setup + Cognos
  runbook); `deploy-viz.mjs` (upload/update to a client environment).
- `cognos.env.example` — template for a per-client `.env.<client>` (Connected mode only).
- `workbench/` — disposable build area.
- `CLAUDE.md` — Claude reads this automatically; it encodes the playbook and conventions.

## 5. Give back

When you finish a viz, **harvest it**: copy the source folder (with `fixtures/`) into `examples/`
and add a row to `examples/README.md`. The skill uses examples as few-shot references, so each one you add makes
the next person's build better.

## Good to know

- **The IBM SDK library isn't checked in.** It's *Licensed Materials – Property of IBM*, so
  this repo doesn't redistribute it. After copying a template/example into `workbench/`, run
  **`customvis upgrade`** in that folder (or scaffold fresh with `customvis create`) to fetch
  `customvis-lib.tgz` before building. The `/generate-cognos-viz` skill handles this for you.
- Templates pin **D3 v5** — write against v5 APIs (no `d3.rollup`/`d3.groups`; use plain JS).
- Target both CA 11.1.x (Node 16) and 12.x (Node 20) — avoid version-specific APIs. See `docs/gotchas.md`.
- Strokes that must always show (lines, stems, borders) use `palette.getFillColor()`.
  `getOutlineColor()` is `null` until a point is highlighted or selected.
- Claude confirms the spec before writing code, and asks before the first upload to any client
  environment.
- If the Playwright tools don't connect, run `npm install --prefix tools/cognos-dev`, then
  `/mcp` → reconnect `playwright`.

Stuck? Ask Claude Code in the repo — `CLAUDE.md` and the skill give it full context on the workflow.

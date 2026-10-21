# Cognos CustomViz Factory

A **factory for building IBM Cognos Analytics Custom Visualizations** — fast and repeatably —
from a narrative description, a visual example, or an existing D3 (or other-format) chart.

This is **not** a single visualization. It's the toolchain, reference material, known-good
templates, a worked-example library, and Claude Code skills that tie them together so you
don't re-derive the data contract and rendering plumbing every time.

It covers **two tracks**:

- **Code visualizations** — `customvis` CLI + `RenderBase` + `vizdef.xml`. Skill: `/generate-cognos-viz`.
- **Schematics** — data mapped onto an annotated **SVG** (floor plan, seating chart, mechanical
  drawing, schematic map). No CLI/RenderBase — just an annotated SVG packaged into a `.zip`.
  Skill: `/generate-cognos-schematic`.

> **Built to be driven from [Claude Code](https://claude.com/claude-code).** The repo ships both
> skills (in `.claude/skills/`) that orchestrate the whole build. Clone the repo, open it in
> Claude Code, and they're already there — no extra setup.

## What you get

| Folder | What's in it |
|---|---|
| `docs/` | Reference. `Cognos_CustomViz_Developer_Guide.md` is the source of truth; the other `*.md` files are condensed cheatsheets (API, vizdef, patterns, D3 porting, gotchas, schematics). |
| `templates/` | Known-good baselines — `customvis create` ones (BarChart / Basic / BasicJS) and a `Schematic/` reference SVG. |
| `examples/` | Finished, validated viz & schematics used as few-shot references (Lollipop, BarChartRace, OfficeFloorPlan). |
| `tools/` | Schematic helpers (`validate-schematic-svg.mjs`, `pack-schematic.mjs`); `harness/` offline render harness; `cognos-dev/` browser loop in Cognos; `deploy-viz.mjs` upload/update. |
| `workbench/` | Disposable scratch area where new work is scaffolded and built. |
| `.claude/skills/` | The `/generate-cognos-viz` and `/generate-cognos-schematic` orchestrator skills. |
| `CLAUDE.md` | Instructions Claude reads automatically when working in this repo. |

## Prerequisites

- **Node.js** (this repo is verified on **v24.13.0**, npm **11.6.2**). Cognos targets:
  CA 11.1.x runs Node 16, CA 12.x runs Node 20 — write version-neutral code.
- **`customvis` CLI v1.7.7** — IBM's Cognos Custom Visualization SDK. It is **not published on
  public npm** (it's IBM commercial software); you download it from your own Cognos Analytics server:
  1. Download `customvis.tgz` from `https://<your-cognos-server>/bi/js/vida/customvis.tgz`
     (right-click → *Save As* → set type to *All Files*; don't use Firefox — it mangles `.tgz`).
  2. From the download directory: `npm install -g customvis.tgz`
  3. Verify with `customvis --version` (expect 1.7.7), then delete the downloaded `customvis.tgz`.

  (Templates pin **D3 v5** — write against v5 APIs.)
- **Claude Code** (recommended) — to drive the `/generate-cognos-viz` skill.
- A **Cognos Analytics** environment with the *Manage Visualizations* capability to preview/deploy.

## Quickstart (Claude Code)

```bash
git clone https://github.com/pmsquare-us/cognos-customviz-factory.git
cd cognos-customviz-factory
claude            # open the repo in Claude Code
```

Then just ask:

```
/generate-cognos-viz
```

…and describe the chart you want, or paste/point to the D3 source you're porting. The skill
walks the staged playbook for you: spec → `vizdef.xml` data contract → scaffold → implement
`renderer/Main.ts` → build & preview in Cognos → polish → pack → harvest into `examples/`.

## The playbook (what the skill automates)

0. **Intake/Spec** — input type, chart description, data shape (`cat`/`cont` slots), interactivity, properties, target CA version.
1. **Data contract → `vizdef.xml`** — the most important step; slot order defines every `cols[i]`/`value(i)` index. (`docs/vizdef-reference.md`)
2. **Scaffold** — `customvis create <Name> -t BarChart` in `workbench/`, overwrite `vizdef.xml`.
3. **Implement `renderer/Main.ts`** — D3 port (`docs/d3-porting-guide.md`) or fresh (`docs/patterns.md`).
4. **Build & preview** — `customvis build` / `customvis start`, validate in Cognos, iterate with **Refresh**.
5. **Polish** — properties, legend, `nls/` localization, responsiveness, perf via `_info.reason`.
6. **Pack/Deploy & harvest** — `customvis pack` → upload via *Manage → Customization → Custom visuals*; copy the finished viz into `examples/`.

## Schematics

To map data onto a graphic instead of a chart, ask:

```
/generate-cognos-schematic
```

…and describe the graphic (or share an example image / existing SVG) plus the region keys. The
skill generates a clean annotated SVG (`data-cv-key` per region, optional `data-cv-view` groups),
validates it, and packages a ready-to-upload `.zip`. Schematics use **no `customvis`/RenderBase** —
they're annotated SVGs. The two helper scripts work standalone too:

```
node tools/validate-schematic-svg.mjs <file.svg>          # lint against the data-binding contract
node tools/pack-schematic.mjs --name "<Name>" <file.svg>  # build <slug>.schematic.zip to upload
```

See `docs/schematics-guide.md` for the full contract, and `examples/OfficeFloorPlan/` for a worked example.

## Claude sees what it builds

Claude checks its own renders instead of handing you something to test:

- **Offline harness** (`tools/harness/`): renders the built bundle from fixture data in a plain
  page, with no Cognos needed. It exercises the real customvis-lib palette, selection, and data
  code, and checks several sizes and unmapped optional slots.
- **Browser in Cognos** (`.mcp.json` → Playwright MCP): a Chrome window Claude drives. It opens
  your Cognos, watches the viz render live from `customvis start`, reads the console, and uploads
  packages. The browser profile is saved in `.browser-profile/`, so you sign in once.
- **Deploy** (`tools/deploy-viz.mjs`): packs, then uploads or updates in place on a client
  environment. Claude asks you before the first upload of a package to any environment.

### First run per client

```bash
cp cognos.env.example .env.<client>   # set COGNOS_URL and COGNOS_AUTH (sso | apikey | native)
npm install --prefix tools/cognos-dev # once per machine: pinned Playwright MCP (fast startup)
claude                                # approve the "playwright" MCP server when prompted
```

Claude opens the Cognos URL in the Playwright window and you sign in. Then it builds a
*CV Dev Harness* dashboard for live previews. Needs Google Chrome installed. Details:
`tools/cognos-dev/README.md`.

## Building manually (without the skill)

The repo is fully usable by hand: read `docs/`, copy a `templates/` or `examples/` folder into
`workbench/`, then `customvis build` / `customvis start` / `customvis pack`. The skill just
removes the manual orchestration and brings the right reference to each stage.

> **Note — the IBM SDK library is not shipped in this repo.** Each viz `package.json` references
> `@businessanalytics/customvis-lib` via a local `customvis-lib.tgz`, which is *Licensed Materials –
> Property of IBM* and not redistributed here. After copying a template/example into `workbench/`,
> run **`customvis upgrade`** in that folder (or scaffold fresh with `customvis create`) to fetch
> the library before `npm install` / `customvis build`.

## Contributing back

When you finish a viz, **harvest it**: copy the source-only folder into `examples/` and add a
one-line row to `examples/README.md`. Every harvested example improves future generation for
the whole team.

## License

This project is **source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md)** —
*not* an OSI open-source license. In short:

- ✅ **Free for any noncommercial use** — learning, evaluation, research, personal/hobby projects,
  and use by charities, schools, and government bodies.
- 💼 **Commercial use requires a separate license from PMsquare LLC.** If you want to use this to build
  visualizations for a business — yours or a client's — **get in touch:**
  [pmsquare.com](https://www.pmsquare.com) / contact@pmsquare.com.

© 2026 PMsquare LLC. The IBM Cognos `customvis` SDK and `customvis-lib` are separate, IBM-licensed
materials and are **not** covered by this license — obtain them from IBM via the `customvis` CLI.

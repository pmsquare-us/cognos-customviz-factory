# Cognos CustomViz Factory

A **factory for building IBM Cognos Analytics Custom Visualizations** — fast and repeatably —
from a narrative description, a visual example, or an existing D3 (or other-format) chart.

This is **not** a single visualization. It's the toolchain, reference material, known-good
templates, a worked-example library, and a Claude Code skill that ties them together so you
don't re-derive the data contract and rendering plumbing every time.

> **Built to be driven from [Claude Code](https://claude.com/claude-code).** The repo ships a
> `/generate-cognos-viz` skill (in `.claude/skills/`) that orchestrates the whole build. Clone
> the repo, open it in Claude Code, and the skill is already there — no extra setup.

## What you get

| Folder | What's in it |
|---|---|
| `docs/` | Reference. `Cognos_CustomViz_Developer_Guide.md` is the source of truth; the other `*.md` files are condensed, generation-oriented cheatsheets (API, vizdef, patterns, D3 porting, gotchas). |
| `templates/` | Known-good `customvis create` baselines (BarChart / Basic / BasicJS). Start new viz from here. |
| `examples/` | Finished, validated viz used as few-shot references (Lollipop, BarChartRace). |
| `workbench/` | Disposable scratch area where new viz are scaffolded and built. |
| `.claude/skills/generate-cognos-viz/` | The `/generate-cognos-viz` orchestrator skill. |
| `CLAUDE.md` | Instructions Claude reads automatically when working in this repo. |

## Prerequisites

- **Node.js** (this repo is verified on **v24.13.0**, npm **11.6.2**). Cognos targets:
  CA 11.1.x runs Node 16, CA 12.x runs Node 20 — write version-neutral code.
- **`customvis` CLI v1.7.7** — the IBM Cognos Custom Visualization SDK:
  ```
  npm install -g @businessanalytics/customvis    # provides the `customvis` command
  ```
  Verify with `customvis --version`. (Templates pin **D3 v5** — write against v5 APIs.)
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

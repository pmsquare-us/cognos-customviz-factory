# Gotchas & Version Notes

## Toolchain / versions

- **CA version targets:** guide is written for **12.1.x**; the linked API docs are **11.1.x**.
  Target **both** by sticking to the stable `RenderBase` surface and avoiding version-specific APIs.
- **Node:** CA 12.0.0–12.0.3 → Node 16; CA 12.0.4+ → Node 20. This machine runs **Node v24.13.0**
  with **customvis CLI v1.7.7** — works for local authoring/build, but the *deployment target's*
  supported runtime is what matters for the uploaded bundle. Don't rely on Node-24-only language features.
- **`customvis upgrade`** aligns the project's `customvis-lib.tgz` to the latest. Run it if a
  template's lib is older than your CA server expects.
- **D3 is an external, pinned to v5.** The generated `rollup.config.js` does:
  `if (!pkgJson.dependencies.d3) paths["d3"] = "https://d3js.org/d3.v5.min.js"`. So unless you
  add a real `d3` dependency to `package.json`, `import * as d3 from "d3"` is **not bundled** —
  the host AMD-loads **d3.v5.min.js** (resolves to 5.16.0) at runtime. Confirm in the built
  bundle header: `define(['require','https://d3js.org/d3.v5.min.js'], ...)`.
  - **Available in 5.16:** `selection.join`, `transition.end()` (both 5.8+), `schemeTableau10`,
    `scaleBand/Linear/Ordinal`, `axisTop`, `pairs`, `range`, `format`, `interpolateNumber`, `easeLinear`.
  - **NOT available (d3-array v2 / D3 v6+):** `d3.rollup`, `d3.rollups`, `d3.group`, `d3.groups`,
    `d3.index`, `d3.flatGroup`. Reshape/group with **plain JS `Map`** instead (see `BarChartRace`).
  - v6/v7 event-handler signatures (`(event, d)`) also differ from v5 (`(d, i, nodes)` + `d3.event`).
  - **Escape hatch:** to use a newer d3, add `"d3": "^7"` to `dependencies` (and matching `@types/d3`);
    rollup then bundles it instead of externalizing — at the cost of a larger bundle and a heavier
    download. Prefer the host's v5 unless you genuinely need a v6+ API.
- **Babel does not type-check.** `customvis build` transpiles via `@babel/preset-typescript`
  (types stripped, no `tsc`) then bundles with rollup. A clean build means it *compiled*, **not**
  that it's type-correct or runtime-correct. Verify logic yourself; grep the built
  `build/renderer/Main.js` for the API calls (they appear as `d3__namespace.<fn>`) to confirm
  you didn't use an unavailable function.

## Local development

- **Browser:** Chrome recommended; Firefox/Edge work; **Safari is NOT supported** for local dev.
  Do **not** use Firefox to download `customvis.tgz` (it mangles the file).
- **Chrome insecure-private-network:** Chrome may block the HTTPS Cognos page → HTTP localhost
  server. Set flag `Block insecure private network requests` = **Disabled** while testing, then re-enable.
- **Default port** 8585; override with `customvis start -p <port>`.
- `customvis start` serves the build dir at `127.0.0.1`; Cognos sandbox widgets connect to it.
  Use **Test visualization** (dashboard, Custom tab) or **Custom visual preview** (report, Advanced),
  then **Refresh visualization** after each change.

## Coding traps

- **Property locking:** during render, `properties.get()` returns the *locked* value; host-set
  changes appear next cycle. Use `properties.peek()` for an unlocked synchronous read.
- **`meta.legendShape` / `setActive` belong in `updateProperty`**, not `update` — `update` is too
  late; the legend has already rendered.
- **Optional slots** start unmapped: `tuples = []`, `domain = (0,0)`. Always branch on `.mapped`.
- **Slot index = `<ref>` order.** Reordering refs silently re-maps every `value(i)`/`tuple(i)`.
- **`meta.id` in package.json must be globally unique** (e.g. `com.pmsquare.vis.<name>`) or
  uploaded viz collide in Cognos.
- **Default `hitTest`** only works when elements are d3-bound to `data.rows`. Wrapping DataPoint in
  another object breaks tooltips/selection until you override `hitTest`.
- **dataLimit / slotLimits:** large datasets are capped; set `meta.dataLimit` (-1 unlimited) and
  `meta.slotLimits.set(name, n)` deliberately, and reduce labels/ticks at small sizes.

## Schematics (SVG-data-binding viz)

- Map with `data-cv-key`; group with `data-cv-view` (one view per element, no nesting).
- Supported elements: `circle, ellipse, line, path, polygon, polyline, rect, text, svg, g`.
- Paths must be **closed** (`z`/`Z`). Keys can't be hierarchical/multi-part.
- **Not supported:** embedded JS, animation events, external URI refs, `<a>` tags, DOCTYPE entities.
- Use **presentation attributes**, not external CSS (Edge compatibility).

## Security / deployment

- Uploading requires **Manage Visualizations**; developing requires **Develop Visualizations**.
  Be judicious — uploaders can deliver malicious code. (Assign sparingly.)
- Deploy: `customvis pack` → `<Name>.packed.zip` → *Manage → Customization → Custom visuals →
  Upload custom visual*. Update/Download/Properties(permissions)/Delete from the same screen.

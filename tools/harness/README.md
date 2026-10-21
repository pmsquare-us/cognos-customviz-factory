# Offline render harness

Renders a **built** custom viz in a plain browser page, with no Cognos involved. It uses fixture data
and a mock of the host (`mock-host.js`). Use it for most iterations (layout, scales, labels,
properties, empty/optional-slot cases, responsiveness), and save the in-Cognos loop
(`tools/cognos-dev/README.md`) for host-only behavior.

```bash
cd workbench/<Name> && customvis build          # the harness serves build/
node tools/harness/serve.mjs workbench/<Name>     # → http://127.0.0.1:8686/
```

| URL | Shows |
|---|---|
| `/` | First fixture, 800×500, with a fixture picker and a properties panel generated from `vizdef.xml`. |
| `/?fixture=<name>` | A specific `fixtures/<name>.json`. |
| `/?fixture=auto` | Synthetic data from the vizdef. Every required slot is mapped and every **optional slot is left unmapped**. |
| `/?w=320&h=200` | A specific surface size. The surface is also drag-resizable. |
| `/?grid=1` | The same fixture at 320×220, 640×400, and 1024×600 side by side. |

Click a mark to select it (ctrl/cmd adds to the selection, empty space clears), and hover for the
tooltip the host would show. Both go through the viz's real `hitTest`, so they confirm marks are
bound to `data.rows`.

## Fixtures

`<viz-folder>/fixtures/<name>.json`. They're harvested into `examples/` along with the viz.

### Building fixtures: `make-fixture.mjs`

```bash
# Real data: save a cognos_query result as JSON, then convert it (slots auto-map by type, or --map)
node tools/harness/make-fixture.mjs workbench/<Name> --from result.json [--map categories="Product line",values=Revenue]

# Edge cases derived from a base fixture (default: first real-* one)
node tools/harness/make-fixture.mjs workbench/<Name> --stress [--base <fixture>] [--cat <slot>]
```

- **Real data** (`--from`): query at the grain a dashboard would send. Group by the columns bound
  to cat slots and total the measures. This needs only the Cognos MCP connector, not a Connected
  dev setup. The totals then match what Cognos draws: verified against the CV Dev Harness widget
  on CA 12.1.
- **Stress** (`--stress`): writes `stress-*.json` with these cases:
  - `nulls`: null measures, plus one null category member
  - `many-categories`: 150 members of `--cat`, which defaults to the first cat slot
  - `long-labels`: names over 70 characters
  - `negative-zero`
  - `extreme-magnitudes`: 1e12 next to 0.001
  - `single-row`
  - `empty`

  Pick `--cat` as the slot that drives the marks, for example `name` rather than `time` in a bar
  chart race. Judge these by eye as well as by `__harness.errors`. A null drawn like a zero, or a
  negative clipped off-canvas, throws no error.

On a null category, the host still gives the data point a member, with an empty key and caption.
Only measures arrive as `null` (`value(i) → null`). The mock follows that.

```json
{
  "mapping":  { "categories": "Product line", "values": "Revenue" },
  "rows":     [ { "categories": "Camping Equipment", "values": 1589732 } ],
  "props":    { "dotSize": "12px", "labels": true },
  "selected": [ 0 ]
}
```

- `mapping`: slot name → column caption. A slot left out here is **unmapped** (`.mapped === false`).
- `rows`: one object per data point, keyed by slot name. `cat` values become tuples (in
  first-seen order), and `cont` values must be numbers.
- `props`: overrides of vizdef defaults, written the way vizdef writes values (`"12px"`, `"#c00"`,
  `"bold 14px Arial"`, `true`).
- `selected`: row indexes to start selected.

## Automation (Playwright MCP)

`window.__harness` on the page:

```js
__harness.status            // "loading" | "ready" | "error"
__harness.errors            // error strings, also logged to the console as "[harness] …"
__harness.renders           // completed render count
await __harness.setProp("labels", false)
await __harness.select([0, 2])           // [] clears
await __harness.resize(320, 200)
__harness.legend()          // the legend encodings the viz reports to the host
```

A typical check: `browser_navigate` → `browser_evaluate` (`status`, `errors`) →
`browser_take_screenshot` → `browser_console_messages`.

## Fidelity

`mock-host.js` implements the host calls that customvis-lib's `RenderBase` actually makes.
`RenderBase` is bundled into `Main.js`, so the viz runs the same lib code it runs in Cognos.
Palette colors, selection dimming (`rgba(…,0.4)`), outline rules, `.mapped`, `domain`, `tuples`,
and `caption()` therefore behave the same. Four things differ:

- Default palette colors and number formatting (`toLocaleString`) are stand-ins.
- Host chrome isn't there: no real legend, properties panel, or cross-widget selection.
- Data points are keyed by their category values, as the host does, but the host's internal ids differ.
- d3 v5 loads from `d3js.org` (the same external Cognos uses), so the page needs internet.

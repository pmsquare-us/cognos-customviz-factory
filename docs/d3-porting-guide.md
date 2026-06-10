# Porting D3 (or other JS) into a Cognos Custom Viz

Goal: take a standalone D3 example and re-home it inside the `RenderBase` lifecycle, driven
by Cognos data instead of a hard-coded array.

## Mental shift

| Standalone D3 | Cognos custom viz |
|---|---|
| Script runs top-to-bottom once | Split into `create()` (once) + `update()` (every change) |
| `d3.select("body")` / `("svg")` | `d3.select( _node )` — the host-managed root |
| `d3.csv(...)` / inline array | `_info.data.rows` (and `cols[i]` for scales) |
| `width`/`height` constants | `_info.node.clientWidth/clientHeight` (resizes!) |
| Hard-coded colors | `palette.getFillColor(dp)` / `getOutlineColor(dp)` |
| Manual `.on("mouseover", tooltip)` | Delete it — host gives tooltips via `hitTest` |
| `<script src="d3.v3">` | `import * as d3 from "d3"` (bundled — **D3 v5**, see gotchas) |

## Checklist

1. **Find the data shape.** What does each datum need? Map each field to a slot:
   numeric→`cont`, category/label→`cat`. Write `vizdef.xml` first (see `vizdef-reference.md`)
   and define `const A=0, B=1, ...` matching `<ref>` order.
2. **Split the code.** One-time DOM creation (append `svg`, static `<g>` layers, defs/gradients)
   → `create()`. Everything that depends on data/size → `update()`.
3. **Re-root.** Replace every `d3.select("body"|"svg"|"#id")` with selections under `_node`.
   In `create` append the svg; in `update` re-select it: `d3.select(node).select("svg")`.
4. **Rebind data.** Replace the example's dataset with `_info.data.rows`, keyed by `d.key`.
   Replace `d.fieldName` with `d.value(IDX)` / `d.tuple(IDX).key|caption`.
5. **Rebuild scales** from `cols[i].domain.asArray()` (cont) and `cols[i].tuples` (cat), using
   `node.clientWidth/Height` for ranges so it reflows on resize.
6. **Colors → palette.** Swap fixed fills for `palette.getFillColor(d)` / `getOutlineColor(d)`
   so selection-dimming and highlight outlines work for free. Add a `color` channel + palette in vizdef.
7. **Delete custom interactivity.** Remove manual tooltip/click handlers. Bind `.data(data.rows)`
   so the default `hitTest` works; only override `hitTest` if you wrap DataPoint in another object.
8. **Use `.join()`** for enter/update/exit (terser than `.enter().append()`); v5.8+ supports it.
9. **Static assets** (images/sprites) go in `static/` and are referenced via `this.toUrl("../static/x.svg")`.
10. **Build & iterate:** `customvis build` (compile check) → `customvis start` → Cognos *Test
    visualization* → **Refresh**.

## Before / after sketch

```typescript
// BEFORE (standalone)
const svg = d3.select("body").append("svg").attr("width",960).attr("height",500);
d3.json("data.json", data => {
  svg.selectAll("circle").data(data).enter().append("circle")
     .attr("cx", d=>d.x).attr("cy", d=>d.y).attr("fill","steelblue")
     .on("mouseover", showTooltip);
});

// AFTER (RenderBase)
protected create( _node: HTMLElement ): Element {
  d3.select( _node ).append("svg").attr("width","100%").attr("height","100%");
  return _node;
}
protected update( _info: UpdateInfo ): void {
  const node = _info.node as HTMLElement;
  if ( !_info.data ) { d3.select(node).select("svg").selectAll("*").remove(); return; }
  const data = _info.data;
  const palette = _info.props.get("colors") as CatPalette;
  const x = d3.scaleLinear().domain(data.cols[X].domain.asArray()).range([0,node.clientWidth]);
  const y = d3.scaleLinear().domain(data.cols[Y].domain.asArray()).range([node.clientHeight,0]);
  d3.select(node).select("svg").selectAll("circle")
    .data( data.rows, (d:DataPoint)=>d.key ).join("circle")
    .attr("cx", d=>x(d.value(X))).attr("cy", d=>y(d.value(Y)))
    .attr("fill", d=>palette.getFillColor(d));   // tooltip/selection now automatic
}
```

## Common porting bugs

- **Blank chart**: scales built from `[0,0]` because the slot is unmapped/optional — guard with `.mapped`.
- **No tooltips**: you didn't `.data(data.rows)`-bind, or you wrapped DataPoint — fix the bind or override `hitTest`.
- **D3 API mismatch**: the host loads **D3 v5** (external `d3.v5.min.js`), not whatever the example used. `d3.scaleBand`, `.join`, `transition.end()`, `symbol`, `schemeTableau10` exist; **`d3.rollup`/`d3.groups`/`d3.group` do NOT** (d3-array v2 / v6+) — reshape with plain JS `Map`. v6+ event signatures `(event, d)` differ from v5 `(d, i, nodes)` + `d3.event`. See `gotchas.md` for the external-d3 mechanism and the escape hatch.
- **Animation that never ends**: don't `return` a looping/endless promise from `update()` (the host waits on it). Launch the loop fire-and-forget and guard it with a run-token that a later `update()` bumps to interrupt (see `examples/BarChartRace`).
- **Edge rendering**: prefer presentation attributes over external CSS (see gotchas).
- **No resize**: you used fixed px instead of `clientWidth/Height`.

# customvis-lib API Cheatsheet

Condensed, generation-oriented reference for `@businessanalytics/customvis-lib`.
Full prose is in `Cognos_CustomViz_Developer_Guide.md`; class list mirrors the
[11.1.x API docs](https://ibm.github.io/ca_customvis/docs/11.1.x/) (24 classes, 4 enums).

## RenderBase — every viz extends this

```typescript
import { RenderBase, UpdateInfo } from "@businessanalytics/customvis-lib";
export default class extends RenderBase { /* ... */ }
```

| Member | Signature | When / why |
|---|---|---|
| `create` | `create(_node: HTMLElement): Element \| void \| Promise<...>` | Runs **once**. Build DOM/SVG skeleton. Return the root element (or omit → `_node` is root). Async via Promise. |
| `update` | `update(_info: UpdateInfo): void \| Promise<void>` | Runs on **every** data/size/property/decoration change. Return Promise to make host wait (animations). Throw / reject = render failure. |
| `updateProperty` | `updateProperty(_name, _value): void` | Called the instant a property changes **and** once per property at init. Use for `meta.legendShape` and `properties.setActive(...)` — runs *before* legend renders. |
| `hitTest` | `hitTest(_elem, _client, _viewport): DataPoint \| Tuple \| null` | Maps a coordinate/element to data. **Not needed** if you d3-bind `.data(data.rows)` — default works. Override only when wrapping DataPoint in another object. |
| `updateLegend` | `updateLegend(_data: DataSet): Encoding[]` | Override to filter/reorder/relabel auto legend. Call `super.updateLegend(_data)` first. |
| `properties` | `Properties` | Read/write property values + active state. |
| `meta` | `MetaInfo` | `legendShape`, `slotLimits.set(name, n)`, `dataLimit` (-1 = unlimited). Set in `create`/`updateProperty`. |
| `nls` | `nls(_name): string` | Localized string lookup. |
| `toUrl` | `toUrl(relativePath): string` | Resolve a bundled static asset (e.g. `this.toUrl("../static/logo.svg")`). |

## UpdateInfo

```typescript
_info.reason      // { data, size, properties, decorations } — booleans; gate expensive work
_info.data        // DataSet | null  (null = nothing mapped → render empty state)
_info.node        // HTMLElement to render into
_info.props        // Properties (alias of this.properties for this cycle)
_info.locale      // data locale for custom formatting
```

Performance pattern — only redo what changed:
```typescript
if ( _info.reason.data ) this.processed = expensiveProcess( _info.data );
if ( _info.reason.properties ) this.applyProps( _info.props );
// decorations fire on every mouse move — keep that path cheap
```

## Data model

```
DataSet
  .cols[i]  -> Slot          (one per <slot> in dataset order — index = your slot constant)
  .rows[]   -> DataPoint      (one per data point)
  DataSet.filterRows(rows, colIndex, key)  // static: rows matching a tuple key (grouping)
```

**Slot** (`data.cols[i]`):
- `.mapped` — boolean; is this slot bound to a column? (always check optional slots)
- `.tuples` — categorical entries: `[{ key, caption }, ...]`. Empty `[]` for cont/unmapped.
- `.domain` — continuous range: `.asArray()` → `[min,max]`, also `.min` / `.max`. `(0,0)` for cat/unmapped.

**DataPoint** (`row` in `data.rows`):
- `.value(i)` — numeric value of continuous slot `i`
- `.tuple(i)` — `{ key, caption }` of categorical slot `i`
- `.caption(i)` — display caption
- `.key` — stable identity (use as the d3 data-join key)
- `.selected` / `.highlighted` — decoration booleans

Typical wiring:
```typescript
const cats   = data.cols[CAT].tuples.map( t => t.key );
const [lo,hi] = data.cols[VAL].domain.asArray();
const x = d3.scaleBand().domain(cats).range([0,w]);
const y = d3.scaleLinear().domain([0,data.cols[VAL].domain.max]).range([h,0]);
sel.selectAll("rect").data(data.rows, (d:DataPoint)=>d.key).join("rect")
   .attr("x", d=>x(d.tuple(CAT).key)).attr("height", d=>h-y(d.value(VAL)));
```

## Properties

```typescript
this.properties.get("name")          // current (locked during render)
this.properties.peek("name")          // synchronous unlocked read
this.properties.getDirty()            // changed-since-last-render
this.properties.setActive("name", b)  // enable/disable in the UI (call from updateProperty)
```

## Palettes (color from data, selection-aware)

```typescript
// Categorical
const pal = _info.props.get("colors") as CatPalette;
pal.getColor(tuple)        // raw Color
pal.getFillColor(dp)       // dims deselected — USE THIS for fills
pal.getOutlineColor(dp)    // emphasis outline: null unless dp is highlighted/selected
                           // → use for an extra highlight stroke only. A stroke that must
                           //   always draw (stems, lines, borders) uses getFillColor(dp).

// Continuous: ContPalette -> ColorStops -> getColor(value)
const cpal = _info.props.get("color") as ContPalette;
cpal.getFillColor(dp); cpal.getOutlineColor(dp);
```
A `color`-channel slot needs a matching `<palette>` or no legend renders.

## Legends

Auto-generated from slot `channel="color|size"` + a palette. Modify via `updateLegend`:
```typescript
import { Encoding, CatEncoding, ContEncoding, DataSet } from "@businessanalytics/customvis-lib";
protected updateLegend(_data: DataSet): Encoding[] {
  return super.updateLegend(_data).filter(e => /* keep? */ true);
}
```

## Class index (from the API docs)

- **Rendering:** `RenderBase`, `UpdateInfo`, `RenderReason`, `MetaInfo`, `Point`
- **Data:** `DataSet`, `Slot`, `DataPoint`, `Tuple`, `Segment`, `Domain`
- **Properties & Palettes:** `Properties`, `CatPalette`, `ContPalette`, `ColorStop`, `ColorStops`, `Color`, `Font`, `Length`
- **Legends:** `Encoding`, `CatEncoding`, `ContEncoding`, `CatEncodingEntry`
- **Enums:** `FontStyle`, `FontWeight`, `FormatType`, `LengthUnit`

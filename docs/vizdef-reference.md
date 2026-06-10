# vizdef.xml Reference & Slot-Design Guide

`vizdef.xml` is the **data contract** of a custom viz. Author it in Stage 1 — slot order
here is the index you use everywhere in `Main.ts` (`cols[i]`, `value(i)`, `tuple(i)`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<visualizationDefinition version="3.1"
    xmlns="http://www.ibm.com/xmlns/prod/ba/vipr/vizBundle/vizdef.3">
  <slots> ... </slots>
  <dataSets> ... </dataSets>
  <properties> ... </properties>
  <capabilities> ... </capabilities>
</visualizationDefinition>
```

## `<slots>`

```xml
<slot name="categories" caption="Categories" type="cat" optional="false" />
<slot name="values"     caption="Values"     type="cont" optional="false" />
<slot name="series"     caption="Color"      type="cat" optional="true" channel="color" />
```

| Attr | Values | Notes |
|---|---|---|
| `name` | identifier | Required. Internal reference. |
| `type` | `cat` \| `cont` | `cat` = tuples (discrete); `cont` = numeric domain `[min,max]`. |
| `caption` | text or `$nls.key` | UI label. |
| `optional` | `true` \| `false` | If `true`, code MUST handle `cols[i].mapped === false`. |
| `channel` | `color`, `size`, or `color,size` | Enables auto legend; needs a matching palette for `color`. |

## `<dataSets>` (exactly one)

```xml
<dataSets>
  <dataSet name="data" sortsByDatapoint="false">
    <ref slot="categories" /><ref slot="values" /><ref slot="series" />
  </dataSet>
</dataSets>
```
List **every** slot. `<ref>` order = the integer index in `data.cols[]`.
`sortsByDatapoint="true"` only when you need data-point order over tuple order.

## `<properties>`

Grouped under `<group name="..." caption="...">`. The host already labels the `general`
group, so leave its caption off when it's the standard panel.

| Type | Example | Notes |
|---|---|---|
| `string` | `<string name="title" defaultValue="" allowNull="true" />` | |
| `number` | `<number name="ticks" minValue="0" maxValue="20" allowNull="true" />` | `minValue`/`maxValue` only here. |
| `boolean` | `<boolean name="labels" defaultValue="true" />` | |
| `enum` | see below | Fixed choice list. |
| `color` | `<color name="bg" defaultValue="white" />` | Named CSS colors ok. |
| `font` | `<font name="titleFont" defaultValue="bold 16px Arial" />` | |
| `length` | `<length name="imageSize" defaultValue="64px" />` | CSS length (px/em/%...). |
| `palette` | see below | Color-from-data. |

```xml
<enum name="shape" caption="Shape" defaultValue="circle">
  <possibleValue caption="Circle">circle</possibleValue>
  <possibleValue caption="Square">square</possibleValue>
</enum>

<palette name="colors" caption="Colors" slot="series" type="cat" />
<palette name="heat"   caption="Range"  slot="values" type="cont"
         defaultValue="red 0%;green 50%;blue 100%" />
```
- Palette `slot` links it to a slot (drives the legend). Use `getSlotForPalette` override when the slot isn't known at design time.
- `allowNull="true"` (no defaultValue) is the idiom for "automatic" settings (e.g. auto axis max).

## `<capabilities>` — selection & highlighting

```xml
<capabilities>
  <decorations>
    <decoration name="selected"     type="boolean" target="datapoint" />
    <decoration name="hasSelection" type="boolean" target="dataset" />
    <decoration name="highlighted"  type="boolean" target="datapoint" />
  </decorations>
</capabilities>
```
Omit the whole block to opt out of selection/highlight. `target` ∈ `datapoint|tuple|dataset`.

## Localization

Reference strings with `$nls.key`; define in `nls/Resources.js` (RequireJS i18n):
```javascript
define({ "root": { "prop_shape": "Shape" }, "nl": true, "de": true });
```
Language files: `nls/<lang>/Resources.js` with the flat key→string map.

## Slot-design decision guide

1. **One slot per visual encoding.** Position axis = `cont`; grouping/series/labels = `cat`;
   size/color encodings = `cont` (or `cat` for discrete color) **with a `channel`**.
2. **Optional vs required.** Required for anything the chart can't draw without. Mark the
   rest `optional` and branch on `.mapped`.
3. **Add `channel="color"` + a palette** whenever you want an auto legend + selection-aware fills.
4. **Order matters** — fix the `<ref>` order early and mirror it as `const CAT=0, VAL=1, ...`
   at the top of `Main.ts`. Changing order later means re-indexing all data calls.
5. **package.json `meta.id`** must be globally unique (e.g. `com.pmsquare.vis.<name>`) — two
   uploaded viz with the same id collide in Cognos.

# IBM Cognos Analytics 12.1.x — Custom Visualizations Developer Guide

---

## Table of Contents
1. [Introduction](#introduction)
2. [Step-by-Step Guide](#step-by-step-guide)
3. [CLI Tools and Commands](#cli-tools-and-commands)
4. [Customvis Library](#customvis-library)
5. [Visualization Definition (vizdef.xml)](#visualization-definition)
6. [Tutorial](#tutorial)
7. [Managing Custom Visuals](#managing-custom-visuals)
8. [Performance](#performance)
9. [Schematics](#schematics)

---

## Introduction

IBM Cognos Analytics allows developers to create and test custom visualizations locally before making them available to other users.

**Required capabilities:**
- **Manage Visualizations** — controls access rights to extensible visualizations for individual users, groups, and roles
- **Develop Visualizations** — allows users to develop extensible visualizations

> **CAUTION:** Be judicious when assigning Develop Visualizations access. Users permitted to upload files may be able to deliver malicious code.

---

## Step-by-Step Guide

### Setting Up the Development Environment

**Prerequisites:**
- Microsoft Windows PowerShell or CMD (Windows) or Terminal (macOS)
- NodeJS version 16 for Cognos Analytics 12.0.0–12.0.3; NodeJS version 20 for 12.0.4+
- npm registry (public or private)

**Install Node.js:**
1. Download installer from https://nodejs.org/en/download/
2. Run installer with default settings
3. Restart computer
4. Validate: `node --version`

**Install the Cognos custom visualizations CLI tools:**
1. Download from `[CAserverroot]/bi/js/vida/customvis.tgz`  
   Example: `https://CognosAnalytics.mycompany.com/bi/js/vida/customvis.tgz`
   > Note: Some browsers treat .tgz as text. Right-click > Save As, set type to All Files. Do not use Firefox.
2. Navigate to the download directory
3. Run:
   ```
   npm install -g customvis.tgz
   ```
   On UNIX/macOS, prefix with `sudo` if permission denied.
4. Validate: `customvis --help`
5. Delete the `customvis.tgz` file

**Uninstall:**
```
npm uninstall -g @businessanalytics/customvis
```

---

### Creating a Custom Visualization

```powershell
customvis create CustomVisualization
cd CustomVisualization
```

The `/renderer` directory contains the bundle sources. `Main.ts` is the entry point.

---

### Using a D3 Sample

Reference: Collision Detection at https://bl.ocks.org/mbostock/3231298/

**Steps:**
1. Open `renderer/Main.ts`
2. Import D3 (check version in the example's script tag):
   ```typescript
   import * as d3 from "https://d3js.org/d3.v3.min.js";
   ```
3. Replace `_node.textContent = "Basic VizBundle";` with the example's script tag content
4. Replace `d3.select("body").append("svg")` with `d3.select(_node).append("svg")`
5. Run `customvis start`

---

### Validating in a Dashboard

```
customvis start
```

- Browser: Chrome recommended (Firefox and Edge also supported; **Safari NOT supported** for local dev)
- Chrome may block HTTPS→HTTP connections. Set `Block insecure private network requests` flag to **Disabled** while testing, then re-enable.

**Steps:**
1. Create a dashboard in Cognos Analytics
2. Click **Visualization** tab > **Custom** tab
3. Under **Developers widgets**, double-click **Test visualization**
4. Click **Refresh visualization** to see changes

---

### Validating in a Report

1. Create a report in Page preview mode
2. Under **Insertable objects**, click the **Toolbox** icon
3. Expand **Advanced** > double-click **Custom visual preview**
4. Click **Refresh visualization** to see changes
5. Run as HTML: **Play** > **Run HTML**

---

### Packaging and Deploying

**Package:**
```
customvis pack
```
Produces `{directoryName}.packed.zip` (e.g., `CustomVisualization.packed.zip`)

**Upload (requires Manage Visualizations capability):**
1. Home page > **Manage** > **Customization** > **Custom visuals** > **Upload custom visual**
2. Select the `.packed.zip` file > **Open**

**Use in Dashboard:** Visualization tab > Custom  
**Use in Report:** Create a visualization > Custom section

---

### How Local Custom Visualizations Work

`customvis start` launches a local server hosting files from the build directory at `127.0.0.1`. Cognos Analytics Reporting & Dashboard includes sandbox widgets that connect to this local server and run the files as a visualization.

---

## CLI Tools and Commands

| Command | Alias | Description |
|---|---|---|
| `customvis --help` | `customvis` | Print help |
| `customvis create <name>` | `customvis c` | Create a new visualization |
| `customvis list` | `customvis l` | List available templates |
| `customvis start` | `customvis s` | Build and start local server |
| `customvis pack` | `customvis p` | Package into .zip for deployment |
| `customvis build` | `customvis b` | Build/compile without starting server |
| `customvis clean` | `customvis cl` | Remove generated files |
| `customvis upgrade` | `customvis up` | Upgrade customvis-lib to latest |
| `customvis info` | `customvis i` | Show CLI and visualization info |
| `customvis --version` | `customvis -V` | Show CLI version |

**Create options:**
- `-t, --template <template>` — Use a specific template (default: Basic)
- `-f, --force` — Force folder creation (deletes existing folder with same name)

**Start options:**
- `-p, --port` — Specify port (default: 8585)

---

## Customvis Library

The `customvis-lib` library provides:
- Managed rendering cycle
- Unified data model
- Automatic or custom hit testing
- Automatic legends
- Properties support
- Palettes support
- Visualization customization

**Core class:** `RenderBase` — base class for every custom visualization

**Installation:** Library is copied to the root directory when you run `customvis create`.

---

### Rendering

Two required phases:
- **create** — runs exactly once at initialization
- **update** — runs each time size, data, or properties change

Both are optional; `RenderBase` provides default implementations.

#### create()

```typescript
protected create( _node: HTMLElement ): Element | void | Promise<Element | void>

// Example:
protected create( _node: HTMLElement ): void
{
    d3.select( _node ).append( "svg" )
        .attr( "width", "100%" )
        .attr( "height", "100%" );
    // No return = _node becomes the root
}
```

Supports async initialization via returned `Promise`.

#### update()

```typescript
protected update( _info: UpdateInfo ): void | Promise<void>

// Basic example:
protected update( _info: UpdateInfo ): void
{
    _info.node.textContent = "Hello World: " + Date.now().toString();
}
```

Return `void` = rendering complete at end of function.  
Return `Promise<void>` = host waits for promise to resolve (use for animations).  
Return rejected promise or `throw new Error("msg")` = signal render failure.

#### UpdateInfo Object

| Field | Description |
|---|---|
| `reason.data` | Data changed since last update |
| `reason.size` | Size changed since last update |
| `reason.properties` | Properties changed since last update |
| `reason.decorations` | Selected/highlighted state changed |
| `data` | Current data (null if no data) |
| `node` | HTML element for rendering |
| `properties` | Current properties |
| `locale` | Data locale for custom formatting |

**Optimized update example:**
```typescript
protected update( _info: UpdateInfo ): void
{
    const reason = _info.reason;
    if ( !_info.data )
        return renderEmpty( _info.node );
    if ( reason.data )
        this.data = processData( _info.data );
    // Render based on this.data...
}
```

---

### Data Model

Data is organized in rows (data points) and columns (slots).

#### Slots

Defined in `vizdef.xml`. Two types:
- **cat** (categorical) — holds tuples (e.g., `['summer', 'winter', 'spring', 'autumn']`)
- **cont** (continuous) — holds a value domain `[min, max]`

```xml
<slots>
    <slot name="categories" type="cat" optional="true" />
    <slot name="values" type="cont" optional="false" />
</slots>
```

- `optional="true"` — slot can be unmapped; visualization must handle this
- Unmapped slot: `tuples = []`, `domain = [0, 0]`

#### Dataset

```xml
<dataSets>
    <dataSet name="data" sortsByDatapoint="false">
        <ref slot="categories" />
        <ref slot="values" />
    </dataSet>
</dataSets>
```

`sortsByDatapoint="true"` — sorts by data point order instead of tuple order (only use when needed for custom sorting issues).

#### Tuples and Domains

```typescript
protected update( _info: UpdateInfo ): void
{
    const data = _info.data;
    const keys = data.cols[ 0 ].tuples.map( _t => _t.key );
    const scaleX = d3.scaleBand().range( [ 0, width ] ).domain( keys );

    const domain = data.cols[ 1 ].domain.asArray();
    const scaleY = d3.scaleLinear().range( [ 0, height ] ).domain( domain );

    d3.select( "svg" ).selectAll( "rect" )
        .data( _info.data.rows )
        .join( "rect" )
        .attr( "x", d => scaleX( d.tuple( 0 ).key ) )
        .attr( "width", scaleX.bandwidth() )
        .attr( "height", d => scaleY( d.value( 1 ) ) );
}
```

- Continuous slot: `tuples = []`
- Categorical slot: `domain = (0, 0)`

#### Data Points

Each row = one data point. Use `d.tuple(colIndex)`, `d.value(colIndex)`, `d.caption(colIndex)`.

#### Decorations

Two types: `selected` (boolean), `highlighted` (boolean).

```typescript
// Using decoration directly:
.attr( "color", d => d.selected ? "red" : "steelblue" );

// Using palette (preferred):
.attr( "color", d => palette.getFillColor( d ) );
```

#### Handling Null Data

```typescript
protected update( _info: UpdateInfo ): void
{
    if ( _info.data === null )
        return this.clearVisualization( _info );
    // Render...
}
```

---

### Interactivity

Features: tooltips, selections, highlights — all provided by the host application via `hitTest`.

#### Hit Testing

```typescript
// Custom hitTest:
protected hitTest( _elem: Element | null, _client: Point, _viewport: Point ): DataPoint | null
{
    if ( !_elem || !_elem.hasOwnProperty( "mydata" ) )
        return null;
    return _elem.mydata.dp;
}
```

**If using d3 data binding, the default RenderBase hitTest works automatically** — no override needed:
```typescript
d3.select( "svg" ).selectAll( "rect" )
    .data( _info.data.rows )  // bind data
    .join( "rect" )
    // RenderBase handles hitTest via d3 binding
```

For d3 visualizations that wrap DataPoint in another object:
```typescript
protected hitTest( _elem: Element | null ): DataPoint | null
{
    const elem = d3.select<Element, any>( _elem );
    const data = elem.empty() ? null : elem.datum();
    return data && data.dp;
}
```

#### Tooltips

Provided automatically once `hitTest` is implemented. No custom mouse handlers needed.

#### Selection and Highlighting

```typescript
d3.select( "svg" ).selectAll( "rect" )
    .data( _info.data.rows )
    .join( "rect" )
    .attr( "fill", d => palette.getFillColor( d ) )    // handles selection dimming
    .attr( "stroke", d => palette.getOutlineColor( d ) ); // handles highlight outline
```

---

### Legends

Rendered outside the custom visualization by the host. Generated automatically from `vizdef.xml` slot channel attributes.

**Types:**
- **Categorical legend** — list of swatches per tuple, with title
- **Continuous legend** — color range or size range

#### Enabling Legends

```xml
<slots>
    <slot name="categories" type="cat" />
    <slot name="series" type="cat" channel="color" />      <!-- color swatches -->
    <slot name="values" type="cont" channel="size,color" /> <!-- size + color range -->
</slots>

<properties>
    <palette name="series_colors" slot="series" />   <!-- categorical palette -->
    <palette name="values_colors" slot="values" />   <!-- continuous palette -->
</properties>
```

> Note: A palette must be defined for each slot with a `color` channel, or no legend renders for that slot.

#### Modifying Legends

Override `updateLegend`:

```typescript
import { Encoding, CatEncoding, ContEncoding } from "@businessanalytics/customvis-lib";

// Example: only show legend for mapped slot
protected updateLegend( _data: DataSet ) : Encoding[]
{
    const filterSlot = _data.cols[ HEAT ].mapped ? "heat" : "categories";
    return super.updateLegend( _data ).filter( _e => _e.slot === filterSlot );
}

// Example: reverse order, uppercase title
public updateLegend( _data: DataSet ) : Encoding[]
{
    const legend = super.updateLegend( _data );
    legend.forEach( _e => {
        if ( _e instanceof CatEncoding ) {
            _e.caption = _e.caption.toUpperCase();
            _e.entries.reverse();
        }
    });
    return legend;
}
```

---

### Properties

Defined in `vizdef.xml`. Accessed via `this.properties` or `UpdateInfo.props`.

#### Property Locking

During rendering, properties are locked — new values set by the host are available only on the next render cycle. Use `properties.peek` for synchronous (unlocked) access.

#### Getting Property Values

```typescript
var ticks = this.properties.get( "numTicks" );   // number
var title = this.properties.get( "title" );       // string
var color = this.properties.get( "backgroundColor" ); // string
```

#### Dirty Properties

Properties become dirty when changed. Use `properties.getDirty()` to check. Useful for optimizing renders.

#### Active/Inactive Properties

```typescript
protected updateProperty( _name: string, _value: any ): void
{
    if ( _name === "stacked" )
        this.properties.setActive( "stackedPercent", _value );
}
```

`updateProperty` is also called at initialization for each property.

#### Property Groups

Two built-in groups: `visualization` and `text`. If both present, auto-generated legend properties are added to them. If either is absent, a new `legend` group is created.

---

### Palettes

Special property type for deriving colors from tuples or values.

#### Categorical Palettes

```xml
<properties>
    <palette name="colors" type="cat" slot="series" />
</properties>
```

```typescript
const palette = _info.props.get( "colors" ) as CatPalette;
const seriesTuples = _info.cols[ 2 ].tuples;
const colors = seriesTuples.map( _tuple => palette.getColor( _tuple ) );

// Or with selection handling:
.attr( "fill", t => palette.getFillColor( t ) )   // dims deselected items
```

**`getColor` vs `getFillColor`:** `getFillColor` adjusts color based on selection state (deselected items become lighter).

#### Continuous Palettes

```xml
<properties>
    <palette name="colors" type="cont" slot="values" />
</properties>
```

Two-step process:
1. Get `ColorStops` by providing a slot instance
2. Call `getColor(numericValue)` on `ColorStops`

```typescript
const palette = _info.props.get( "color" ) as ContPalette;
svg.selectAll( "circle" )
    .data( data.rows )
    .join( "circle" )
    .attr( "stroke", d => palette.getOutlineColor( d ) )
    .attr( "fill", d => palette.getFillColor( d ) );
```

#### Palettes Without Slot Binding

Override `getSlotForPalette` when you don't know at design time which slot a palette should be linked to:

```typescript
protected getSlotForPalette( _data: DataSet, _palette: string ): string
{
    if ( palette === "catColors" )
        return _data.cols[ SERIES ].mapped ? "series" : "categories";
    return null;
}
```

---

### Customizing Your Visualization (MetaInfo)

```typescript
protected create( _node: HTMLElement ): void
{
    this.meta.legendShape = "circle";        // shape for categorical legend swatches
    this.meta.slotLimits.set( "categories", 250 ); // max tuples for a slot
    this.meta.dataLimit = 1000;              // max data points (-1 = unlimited)
}
```

**legendShape values:** `circle`, `rectangle`, `square`, `triangle`, `cross`, `donut`, `line`, `diamond`, `star`, `triangle-down`, `triangle-up`, `triangle-left`, `triangle-right`, `null` (host default), `"none"` (no shape)

---

### RenderBase Reference

#### Syntax Summary

| Member | Signature | Description |
|---|---|---|
| `create()` | `create(_node): Element \| void \| Promise<...>` | Called once at initialization |
| `update()` | `update(_info: UpdateInfo): void \| Promise<void>` | Called on each redraw |
| `properties` | `properties: Properties` | Access/set property values and active state |
| `updateProperty()` | `updateProperty(_name, _value): void` | Called immediately when a property changes |
| `hitTest()` | `hitTest(_elem, _client, _viewport): DataPoint \| Tuple \| null` | Returns data element at coordinate |
| `meta` | `meta: MetaInfo` | Customize legendShape, slotLimits, dataLimit |
| `nls()` | `nls(_name): string` | Returns translated string |

#### Localization (nls)

```typescript
protected update( _info: UpdateInfo ): void
{
    if ( _info.data === null ) {
        _info.node.textContent = this.nls( "no_data" );
        return;
    }
}
```

Directory structure:
```
./nls/Resources.js       (root/default language)
./nls/de/Resources.js    (German)
./nls/nl/Resources.js    (Dutch)
```

---

## Visualization Definition

Every custom visualization requires `vizdef.xml` in the root directory. Created automatically by `customvis create`.

### Slots

```xml
<slots>
    <slot name="categories" caption="Categories" type="cat" optional="false" />
    <slot name="values" caption="Values" type="cont" optional="false" />
    <slot name="series" caption="Color" type="cat" optional="true" channel="color" />
</slots>
```

**Attributes:**
- `name` — internal reference name (required)
- `type` — `cat` or `cont` (required)
- `caption` — UI label; can be a literal string or `$nls.key` reference
- `optional` — whether the visualization can render without data in this slot
- `channel` — `color` and/or `size`; enables legend generation for the slot

### DataSets

```xml
<dataSets>
    <dataSet name="data">
        <ref slot="categories" />
        <ref slot="series" />
        <ref slot="values" />
    </dataSet>
</dataSets>
```

Only one dataset is supported. All defined slots must be listed.

### Properties

```xml
<properties>
    <group name="general">
        <boolean name="labels.visible" defaultValue="true" />
        <number name="ticks.count" minValue="0" allowNull="true" />
        <string name="title.text" allowNull="true" />
        <font name="title.font" defaultValue="10px arial" />
    </group>
</properties>
```

**Property attributes:**
- `name` — internal reference (required)
- `caption` — UI label or `$nls.key`
- `defaultValue` — initial value (if omitted and `allowNull="true"`, defaults to null)
- `allowNull` — permits null values (often used for "automatic" settings)
- `minValue` / `maxValue` — for `number` properties only
- `slot` — for `palette` properties only; links palette to a slot
- `type` — for `palette` properties only: `cat` or `cont`

**Property types:**

| Type | Description |
|---|---|
| `string` | Text value |
| `number` | Numeric value; supports `minValue`/`maxValue` |
| `boolean` | Boolean value |
| `enum` | Fixed list of values via `<possibleValue>` elements |
| `color` | CSS color value (named colors supported) |
| `font` | CSS font definition |
| `palette` | Color palette reference |

**Examples:**
```xml
<font name="axis.title" defaultValue="bold 16px Arial" />

<enum name="shape" caption="Shape">
    <possibleValue caption="Circle">circle</possibleValue>
    <possibleValue caption="Square">square</possibleValue>
</enum>

<palette name="color" type="cat" defaultValue="red;green;blue" />
<palette name="range" type="cont" defaultValue="red 0%;green 50%;blue 100%" />
```

### Capabilities (Selection and Highlighting)

```xml
<capabilities>
    <decorations>
        <decoration name="selected" type="boolean" target="datapoint" />
        <decoration name="hasSelection" type="boolean" target="dataset" />
        <decoration name="highlighted" type="boolean" target="datapoint" />
    </decorations>
</capabilities>
```

Omit this section if you don't want built-in highlight/selection support.

`target` can be `datapoint`, `tuple`, or `dataset` (comma-separated).

### Localization in vizdef.xml

Use `$nls.key` prefix to reference localized strings:
```xml
<boolean name="labels.visible" caption="$nls.labels.visible" defaultValue="true" />
```

Root `nls/Resources.js` format (RequireJS i18n plugin):
```javascript
define({
    "root": {
        "labels.visible": "Show Labels",
        "labels.font": "Label Font"
    },
    "nl": true,
    "de": true
});
```

Language-specific file (e.g., `nls/nl/Resources.js`):
```javascript
define({
    "labels.visible": "Toon Labels",
    "labels.font": "Label Lettertype"
});
```

---

## Tutorial

### Complete Scatter Visualization — Tutorial Summary

**End result:** A scatter chart with 3 data slots, customizable palette, tooltips, selection, highlighting, and a legend.

---

### Part 1: Creating a Custom Visualization

#### Step 1: Create and start

```powershell
customvis create MyScatter
cd MyScatter
customvis start
```

**Key files created:**
- `package.json` — visualization name and icon
- `vizdef.xml` — slots, data, properties
- `externals.d.ts` — external library references
- `customvis-lib.tgz` — SDK/API library
- `renderer/Main.ts` — main implementation

#### Step 2: Edit vizdef.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<visualizationDefinition version="3.1"
    xmlns="http://www.ibm.com/xmlns/prod/ba/vipr/vizBundle/vizdef.3">

    <slots>
        <slot name="categories" type="cat" optional="false" channel="color" />
        <slot name="xpos" type="cont" optional="false" />
        <slot name="ypos" type="cont" optional="false" />
    </slots>

    <dataSets>
        <dataSet>
            <ref slot="categories" />
            <ref slot="xpos" />
            <ref slot="ypos" />
        </dataSet>
    </dataSets>

    <properties>
        <palette name="color" slot="categories" />
    </properties>

    <capabilities>
        <decorations>
            <decoration name="selected" type="boolean" target="datapoint" />
            <decoration name="hasSelection" type="boolean" target="dataset" />
            <decoration name="highlighted" type="boolean" target="datapoint" />
        </decorations>
    </capabilities>

</visualizationDefinition>
```

#### Step 3: Main.ts

```typescript
import { RenderBase, UpdateInfo } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

const CAT = 0, XPOS = 1, YPOS = 2; // slot indices

export default class extends RenderBase
{
    protected create( _node: HTMLElement ): Element
    {
        const svg = d3.select( _node ).append( "svg" )
            .attr( "width", "100%" )
            .attr( "height", "100%" );
        const chart = svg.append( "g" ).attr( "class", "chart" );
        chart.append( "g" ).attr( "class", "xaxis data" );
        chart.append( "g" ).attr( "class", "yaxis data" );
        chart.append( "g" ).attr( "class", "elem data" );
        return svg.node();
    }

    protected update( _info: UpdateInfo ): void
    {
        const data = _info.data;
        const props = _info.props;
        const svg = d3.select( _info.node );

        if ( !data ) {
            svg.selectAll( ".data>*" ).remove();
            return;
        }

        const margin = 20;
        const xHeight = 20;

        // Y-axis
        const yHeight = _info.node.clientHeight - 2 * margin - xHeight;
        const yDomain = data.cols[ YPOS ].domain.asArray();
        const yScale = d3.scaleLinear().range( [ yHeight, 0 ] ).domain( yDomain ).nice();
        const yAxis = svg.select<SVGGElement>( ".yaxis" ).call( d3.axisLeft( yScale ) );
        const yWidth = yAxis.node().getBBox().width;

        // X-axis
        const xWidth = _info.node.clientWidth - yWidth - 2 * margin;
        const xDomain = data.cols[ XPOS ].domain.asArray();
        const xScale = d3.scaleLinear().range( [ 0, xWidth ] ).domain( xDomain ).nice();
        const xAxis = svg.select( ".xaxis" ).call( d3.axisBottom( xScale ) );
        xAxis.attr( "transform", `translate(0,${yHeight})` );

        svg.select( ".chart" ).attr( "transform", `translate(${yWidth+margin},${margin})` );

        const palette = props.get( "color" );
        const shape = d3.symbol().size( 256 ).type( d3.symbolCircle );

        svg.select( ".elem" )
            .selectAll( "path" )
            .data( data.rows, ( row: any ) => row.key )
            .join( "path" )
            .attr( "d", shape )
            .attr( "transform", row => `translate(${xScale(row.value(XPOS))},${yScale(row.value(YPOS))})` )
            .attr( "stroke-width", 3 )
            .attr( "stroke", row => palette.getOutlineColor( row ) )
            .attr( "fill", row => palette.getFillColor( row ) );
    }
}
```

> Note: Tooltips, selections, filtering, and interactive legend are provided automatically by RenderBase and the host environment.

---

### Part 2: Adding Properties

#### New vizdef.xml properties section

```xml
<properties>
    <group name="general">
        <palette name="color" slot="categories" />
        <enum name="pointShape" defaultValue="circle">
            <possibleValue>circle</possibleValue>
            <possibleValue>square</possibleValue>
        </enum>
        <string name="background" defaultValue="" />
        <boolean name="showBackground" defaultValue="true" />
    </group>
    <group name="axis">
        <number name="xmax" allowNull="true" />
        <number name="ymax" allowNull="true" />
    </group>
</properties>
```

#### Using new properties in update()

**pointShape:**
```typescript
const palette = props.get( "color" );
const shape = d3.symbol().size( 256 );
if ( props.get( "pointShape" ) === "square" )
    shape.type( d3.symbolSquare );
else
    shape.type( d3.symbolCircle );
```

**ymax (apply same pattern for xmax):**
```typescript
const yDomain = data.cols[ YPOS ].domain.asArray();
const yMax = props.get( "ymax" );
if ( yMax !== null )
    yDomain[ 1 ] = yMax;
const yScale = d3.scaleLinear().range( [ yHeight, 0 ] ).domain( yDomain );
if ( yMax === null )
    yScale.nice();
```

**Background:**
```typescript
let urlImage = null;
if ( props.get( "showBackground" ) ) {
    const image = props.get( "background" );
    if ( image !== "" )
        urlImage = `url(${image})`;
}
_info.node.parentElement.style.backgroundImage = urlImage;
```

---

### Part 3: Customize Legend and Properties

#### Legend shape — updateProperty

```typescript
protected updateProperty( _name: string, _value: any )
{
    switch( _name )
    {
        case "pointShape":
            this.meta.legendShape = _value; // sync legend shape to scatter symbol
            break;
        case "showBackground":
            this.properties.setActive( "background", _value ); // disable when hidden
            break;
    }
}
```

> `updateProperty` is called before legend renders — updating `meta.legendShape` here ensures the legend reflects the current shape. Updating it in `update()` would be too late.

#### Property captions in vizdef.xml

```xml
<properties>
    <group name="general">
        <palette name="color" caption="Colors" slot="categories" />
        <enum name="pointShape" caption="Shape" defaultValue="circle">
            <possibleValue caption="Circle">circle</possibleValue>
            <possibleValue caption="Square">square</possibleValue>
        </enum>
        <string name="background" caption="Background" defaultValue="" />
        <boolean name="showBackground" caption="Show Background" defaultValue="true" />
    </group>
    <group name="axis" caption="Axis">
        <number name="xmax" caption="X-axis max" allowNull="true" />
        <number name="ymax" caption="Y-axis max" allowNull="true" />
    </group>
</properties>
```

> The `general` group has no caption because the host application already provides one.

---

### Part 4: Advanced Features

#### Optional Slots

```xml
<slots>
    <!-- ... existing slots ... -->
    <slot name="color" type="cont" optional="true" channel="color" />
</slots>
<dataSets>
    <dataSet>
        <!-- ... existing refs ... -->
        <ref slot="color" />
    </dataSet>
</dataSets>

<properties>
    <group name="general">
        <palette name="color_cat" slot="categories" />
        <palette name="color_cont" slot="color" />
        <!-- ... other properties ... -->
```

```typescript
const CAT = 0, XPOS = 1, YPOS = 2, COLOR = 3;

// In update():
const hasColor = data.cols[ COLOR ].mapped;
const palette = props.get( hasColor ? "color_cont" : "color_cat" );
```

#### Customizing the Legend (hide categorical when color slot is mapped)

```typescript
import { Encoding, DataSet } from "@businessanalytics/customvis-lib";

protected updateLegend( _data: DataSet ): Encoding[]
{
    const encodings = super.updateLegend( _data );
    const hasColor = _data.cols[ COLOR ].mapped;
    return encodings.filter( _encoding => {
        if ( hasColor && _encoding.type === "cat" )
            return false;
        return true;
    });
}
```

#### Localization

Directory structure:
```
MyScatter/
  nls/
    Resources.js         <- root/English
    nl/
      Resources.js       <- Dutch
  renderer/
    Main.ts
  vizdef.xml
```

`nls/Resources.js`:
```javascript
define({
    "root": {
        "prop_color_cat":      "Point Color",
        "prop_color_cont":     "Color Range",
        "prop_shape":          "Shape",
        "prop_shape_circle":   "Circle",
        "prop_shape_square":   "Square",
        "prop_background":     "Background",
        "prop_show_background":"Show Background",
        "prop_xmax":           "X-axis max",
        "prop_ymax":           "Y-axis max",
        "prop_axis":           "Axis"
    },
    "nl": true
});
```

`nls/nl/Resources.js`:
```javascript
define({
    "prop_color_cat":      "Puntkleur",
    "prop_color_cont":     "Kleurbereik",
    // ...
});
```

Update vizdef.xml to use `$nls.` references:
```xml
<palette name="color_cat" caption="$nls.prop_color_cat" slot="categories" />
<enum name="pointShape" caption="$nls.prop_shape" defaultValue="circle">
    <possibleValue caption="$nls.prop_shape_circle">circle</possibleValue>
    <possibleValue caption="$nls.prop_shape_square">square</possibleValue>
</enum>
<group name="axis" caption="$nls.prop_axis">
```

---

## Managing Custom Visuals

**Path:** Home > **Manage** > **Customization** > **Custom visuals**

Click the **More** icon next to any custom visual:

| Option | Description |
|---|---|
| Delete | Remove the custom visual |
| Download | Download the .zip file (e.g., for support) |
| Update | Upload a new version |
| Properties | Set access permissions (users, groups, roles) |

---

## Performance

### Render Performance

Use `UpdateInfo.reason` to avoid unnecessary re-rendering:

```typescript
protected update( _info: UpdateInfo ): void
{
    const reason = _info.reason;
    // Only re-process data if data actually changed
    if ( reason.data )
        this.processedData = expensiveProcess( _info.data );
    // Only change bg color if properties changed
    if ( reason.properties )
        this.updateBackground( _info.props );
}
```

**Key points:**
- Highlights/selections can trigger `update` on every mouse move (`reason.decorations`)
- Consider a dedicated high-performance render path for decorations only
- DOM updates and layout recalculation are expensive — minimize them

### Responsiveness

Reduce at small sizes:
- Axis labels
- Titles
- Text labels

---

## Schematics

Schematics are SVG files with special attributes that link SVG elements to Cognos Analytics data.

### SVG Data Mapping

Add `data-cv-key` attribute to SVG elements to link them to dataset values:

```xml
<svg height="40" width="100" xmlns="http://www.w3.org/2000/svg">
    <g>
        <circle data-cv-key="A2" cx="10" cy="10" fill="#cd5c5c" r="10"/>
        <circle data-cv-key="A3" cx="30" cy="10" fill="#fa8072" r="10"/>
    </g>
</svg>
```

Mapping is supported on: `circle`, `ellipse`, `line`, `path`, `polygon`, `polyline`, `rect`, `text`, `svg`, `g`

### Views

Group SVG elements into views using `data-cv-view`:

```xml
<g data-cv-view="view_0" desc="Ward A" title="Ward A">
    <circle data-cv-key="A2" cx="10" cy="10" r="10"/>
</g>
<g data-cv-view="view_1" desc="Ward B" title="Ward B">
    <circle data-cv-key="B3" cx="70" cy="30" r="10"/>
</g>
```

Users can toggle views on/off via the Views icon. If no `title` is set, the `data-cv-view` value is used. All views are selected by default.

### SVG Rules and Restrictions

**Supported elements:** `circle`, `ellipse`, `line`, `path`, `polygon`, `polyline`, `rect`, `text`, `svg`, `g`

**View rules:**
- Only one `data-cv-view` per element
- An element can exist in only one view
- Hierarchical views (nested `data-cv-view`) are NOT supported
- Composite items (group with `data-cv-view`, children with `data-cv-key`) ARE supported

**Key rules:**
- Only one `data-cv-key` per element
- Hierarchical/multi-part keys are NOT supported
- Composite items (group with `data-cv-key`, children without) ARE supported
- Paths must be closed (end with `z` or `Z`)

**Supported SVG features:** `use`, `defs`, `href`, embedded images  
**NOT supported:** Embedded JavaScript, animation events, external URI references, `<a>` anchor tags, DOCTYPE entities

**Styling note:** Use Presentation Attributes for compatibility with Microsoft Edge. Avoid external CSS.

### Highlight Regions

Toggle **Highlight regions** to show which SVG elements have `data-cv-key` mappings (colored with the "Missing value color" property). Non-mappable elements are shown with reduced opacity.

### Distributing a Schematic

1. In a report, drag **Schematic preview** onto the workspace
2. Author the schematic
3. Click the **Download** icon (downloads a `.zip`)
4. Home > **Manage** > **Customization** > **Custom visuals** > **Upload custom visual**
5. Select the `.zip` file

### Editing a Schematic Package

1. Drag **Schematic preview** onto the workspace
2. Click the **Edit package** icon
3. **Package tab:** Edit Name, Description, Icon (.jpg/.png/.svg, max 500MB)
4. **Content tab:** Upload SVGs, rename/replace/delete individual SVGs

# Patterns — copy-paste recipes

Recurring building blocks for `renderer/Main.ts`. Pair with `api-cheatsheet.md`.

## Skeleton

```typescript
import { RenderBase, UpdateInfo, CatPalette, DataSet, DataPoint } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

const CAT = 0, VAL = 1, SERIES = 2;   // mirror vizdef <ref> order EXACTLY
const margin = { left: 5, top: 5, right: 5, bottom: 5 };

export default class extends RenderBase {
  protected create( _node: HTMLElement ): Element {
    d3.select( _node ).append( "svg" ).attr( "width", "100%" ).attr( "height", "100%" );
    return _node;
  }
  protected update( _info: UpdateInfo ): void {
    const node = _info.node as HTMLElement;
    if ( !_info.data ) { d3.select( node ).select( "svg" ).selectAll( "*" ).remove(); return; }
    // ... render ...
  }
}
```

## Null / empty-data guard (always first in update)

```typescript
if ( !_info.data ) { d3.select( _info.node ).selectAll( ".data > *" ).remove(); return; }
```

## Scales from the data model

```typescript
const cats = data.cols[CAT].tuples.map( t => t.key );
const x = d3.scaleBand().domain( cats ).range( [0, w] ).padding( 0.1 );
const [lo, hi] = data.cols[VAL].domain.asArray();           // or .domain.max
const y = d3.scaleLinear().domain( [Math.min(0,lo), hi] ).range( [h, 0] ).nice();
```

## Data join (enables default hitTest → free tooltips/selection)

```typescript
d3.select( node ).select( "svg" ).selectAll( "rect" )
  .data( data.rows, ( d: DataPoint ) => d.key )   // key by d.key for stable joins
  .join( "rect" )
  .attr( "fill",   d => palette.getFillColor( d ) )      // selection dimming
  .attr( "stroke", d => palette.getOutlineColor( d ) );  // highlight outline
```

## Grouped/stacked: filter rows per category

```typescript
const groups = d3.select(node).select("svg").selectAll(".group")
  .data( cats, (k:string)=>k ).join( e => e.append("g").attr("class","group") )
  .attr( "transform", c => `translate(0,${catScale(c)})` )
  .selectAll(".elem")
  .data( c => DataSet.filterRows( rows, CAT, c ), (d:DataPoint)=>d.key )
  .join( e => e.append("g").attr("class","elem").call(g=>g.append("rect")) );
```

## Categorical palette

```typescript
const palette = _info.props.get( "colors" ) as CatPalette;   // <palette type="cat" slot="series">
.attr( "fill", d => palette.getFillColor( d ) )
```

## Continuous palette

```typescript
import { ContPalette } from "@businessanalytics/customvis-lib";
const palette = _info.props.get( "heat" ) as ContPalette;     // <palette type="cont" slot="values">
.attr( "fill", d => palette.getFillColor( d ) )
```

## Optional slot

```typescript
const hasSeries = data.cols[SERIES].mapped;
const height = hasSeries ? colorScale.bandwidth() : catScale.bandwidth();
```

## Palette without fixed slot

```typescript
protected getSlotForPalette( _data: DataSet, _palette: string ): string {
  if ( _palette === "colors" ) return _data.cols[SERIES].mapped ? "series" : "categories";
  return null;
}
```

## Properties: enable/disable + legend shape (in updateProperty, NOT update)

```typescript
protected updateProperty( _name: string, _value: any ): void {
  switch ( _name ) {
    case "pointShape":    this.meta.legendShape = _value; break;          // before legend renders
    case "showBackground": this.properties.setActive( "background", _value ); break;
  }
}
```

## Filter the auto legend

```typescript
import { Encoding, DataSet } from "@businessanalytics/customvis-lib";
protected updateLegend( _data: DataSet ): Encoding[] {
  const hasColor = _data.cols[SERIES].mapped;
  return super.updateLegend( _data ).filter( e => !(hasColor && e.type === "cat") );
}
```

## Static asset (bundled image)

```typescript
const logo = this.toUrl( "../static/logo.svg" );   // files under static/
node.style.backgroundImage = `url(${logo})`;
```

## "automatic" numeric property (allowNull)

```typescript
const ymax = _info.props.get( "ymax" );             // <number allowNull="true">
const dom  = data.cols[VAL].domain.asArray();
if ( ymax !== null ) dom[1] = ymax;
const y = d3.scaleLinear().domain( dom ).range( [h,0] );
if ( ymax === null ) y.nice();
```

## Performance: decorations-only fast path

```typescript
protected update( _info: UpdateInfo ): void {
  const r = _info.reason;
  if ( r.data ) this.layout = this.computeLayout( _info.data );   // expensive — only on data change
  if ( r.decorations ) { this.recolorOnly( _info ); return; }      // mouse-move path stays cheap
  this.draw( _info );
}
```

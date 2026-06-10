import { RenderBase, UpdateInfo, CatPalette, DataPoint } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

// Slot indices MUST match <ref> order in vizdef.xml.
const CATEGORIES = 0, VALUES = 1;
const margin = { left: 8, top: 8, right: 40, bottom: 8 };

// A horizontal "lollipop" chart: one row per category, a stem from the value baseline
// to a circle whose position encodes the value. Demonstrates the standard port shape:
//  - create() builds the static SVG skeleton once
//  - update() rebuilds scales from the data model and joins to data.rows
//  - colors come from the palette so selection/highlight work for free
export default class extends RenderBase
{
    protected create( _node: HTMLElement ): Element
    {
        const svg = d3.select( _node ).append( "svg" )
            .attr( "width", "100%" )
            .attr( "height", "100%" );
        svg.append( "g" ).attr( "class", "stems data" );
        svg.append( "g" ).attr( "class", "dots  data" );
        svg.append( "g" ).attr( "class", "labels data" );
        return _node;
    }

    protected update( _info: UpdateInfo ): void
    {
        const node = _info.node as HTMLElement;
        const svg = d3.select( node ).select( "svg" );

        // Empty-state guard.
        if ( !_info.data || _info.data.rows.length === 0 )
        {
            svg.selectAll( ".data > *" ).remove();
            return;
        }

        const data = _info.data;
        const rows = data.rows;
        const palette = _info.props.get( "colors" ) as CatPalette;
        const dotRadius = ( parseFloat( _info.props.get( "dotSize" ) as string ) || 8 ) / 2;
        const showLabels = _info.props.get( "labels" ) as boolean;

        // Scales derived from the data model.
        const cats = data.cols[ CATEGORIES ].tuples.map( _t => _t.key );
        const maxValue = data.cols[ VALUES ].domain.max;

        const y = d3.scaleBand()
            .domain( cats )
            .range( [ margin.top, node.clientHeight - margin.bottom ] )
            .padding( 0.3 );
        const x = d3.scaleLinear()
            .domain( [ 0, maxValue ] )
            .range( [ margin.left, node.clientWidth - margin.right ] )
            .nice();

        const cy = ( row: DataPoint ): number => y( row.tuple( CATEGORIES ).key )! + y.bandwidth() / 2;

        // Stems: baseline -> value.
        svg.select( ".stems" ).selectAll( "line" )
            .data( rows, ( d: DataPoint ) => d.key )
            .join( "line" )
            .attr( "x1", x( 0 ) )
            .attr( "x2", d => x( d.value( VALUES ) ) )
            .attr( "y1", cy )
            .attr( "y2", cy )
            .attr( "stroke", d => palette.getOutlineColor( d ) )
            .attr( "stroke-width", 2 );

        // Dots at the value.
        svg.select( ".dots" ).selectAll( "circle" )
            .data( rows, ( d: DataPoint ) => d.key )
            .join( "circle" )
            .attr( "cx", d => x( d.value( VALUES ) ) )
            .attr( "cy", cy )
            .attr( "r", dotRadius )
            .attr( "fill", d => palette.getFillColor( d ) )
            .attr( "stroke", d => palette.getOutlineColor( d ) )
            .attr( "stroke-width", 1.5 );

        // Optional value labels.
        svg.select( ".labels" ).selectAll( "text" )
            .data( showLabels ? rows : [], ( d: DataPoint ) => d.key )
            .join( "text" )
            .attr( "x", d => x( d.value( VALUES ) ) + dotRadius + 4 )
            .attr( "y", cy )
            .attr( "alignment-baseline", "middle" )
            .attr( "font-size", "12px" )
            .text( d => d.caption( VALUES ) );
    }
}

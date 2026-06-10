import { RenderBase, UpdateInfo, CatPalette, DataSet, DataPoint } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

const CATEGORIES = 0, VALUES = 1, COLORS = 2;            // data column indices
const margin = { left: 5, top: 5, right: 5, bottom: 5 }; // chart margins

export default class extends RenderBase
{
    // Create is called during initialization
    protected create( _node: HTMLElement ): Element
    {
        // Ensure a repeating background image.
        _node.style.backgroundRepeat = "repeat";

        // Create a svg node
        d3.select( _node ).append( "svg" )
            .attr( "width", "100%" )
            .attr( "height", "100%" )

        // return the root node so it can be used in `update`.
        return _node;
    }

    // Update is called during new data, property change, resizing, etc.
    protected update( _info: UpdateInfo ): void
    {
        const logo = this.toUrl( "../static/bee.svg" );     // resolved url of our static image
        const node = _info.node as HTMLElement;
        const rows = _info.data ? _info.data.rows : [];
        const cats = _info.data ? _info.data.cols[ CATEGORIES ].tuples.map( _t => _t.key ) : [];
        const colors = _info.data ? _info.data.cols[ COLORS ].tuples.map( _t => _t.key ) : [];
        const maxValue = _info.data ? _info.data.cols[ VALUES ].domain.max : 0;
        const hasColors = colors.length > 0;

        const valScale = d3.scaleLinear().range( [ margin.left, node.clientWidth - margin.right ] ).domain( [ 0, maxValue ] );
        const catScale = d3.scaleBand().range( [ margin.top, node.clientHeight - margin.bottom ] ).domain( cats ).padding( 0.1 );
        const colorScale = d3.scaleBand().range( [ 0, catScale.bandwidth() ] ).domain( colors ).paddingInner( 0.1 );
        const palette = _info.props.get( "colors" ) as CatPalette;

        node.style.backgroundImage = _info.props.get( "image" ) ? `url(${logo})` : "none";
        node.style.backgroundSize = _info.props.get( "imageSize" );

        const elements = d3.select( node ).select( "svg" )
            .selectAll( ".group" ) // create a 'group' for each category
            .data( cats , ( key: string ) => key )
            .join( enter => enter.append( "g" ).attr( "class", "group" ) )
                .attr( "transform", cat => `translate(0,${catScale( cat )})` )
                .selectAll( ".elem" ) // create an 'elem' for each color in each group
                .data( cat => DataSet.filterRows( rows, CATEGORIES, cat ), ( d: DataPoint ) => d.key )
                .join( enter => enter.append( "g" ).attr( "class", "elem" )
                    .call( g => g.append( "rect" ) ) // an 'elem' contains a 'rect' and a 'text'
                    .call( g => g.append( "text" ) ) );

        elements.select( "rect" ) // create / update all rectangles (bars)
            .attr( "stroke-width", 2 )
            .attr( "x", valScale( 0 ) )
            .attr( "y", row => hasColors ? colorScale( row.tuple( COLORS ).key ) : 0 )
            .attr( "width", row => valScale( row.value( VALUES ) ) - valScale( 0 ) )
            .attr( "height", hasColors ? colorScale.bandwidth() : catScale.bandwidth() )
            .attr( "fill", row => palette.getFillColor( row ) )
            .attr( "stroke", row => palette.getOutlineColor( row ) );

        elements.select( "text" ) // create / update all text labels
            .attr( "visibility", _info.props.get( "labels" ) ? "visible" : "hidden" )
            .attr( "alignment-baseline", "middle" )
            .attr( "font-size", "12px" )
            .attr( "x", valScale( 0 ) + 2 )
            .attr( "y", row => hasColors ? colorScale( row.tuple( COLORS ).key ) : 0 )
            .attr( "dy", hasColors ? colorScale.bandwidth() / 2 : catScale.bandwidth() / 2 )
            .text( d => d.tuple( CATEGORIES ).caption + ( hasColors ? ` - ${d.tuple( COLORS ).caption}` : "" ) );
    }
}

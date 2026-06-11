import { RenderBase, UpdateInfo, CatPalette, DataSet, DataPoint } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

const CAT = 0, VAL = 1, SERIES = 2;
const MARGIN = { top: 24, right: 32, bottom: 48, left: 64 };

function getSize( node: HTMLElement ): [ number, number ] {
    let w = node.clientWidth;
    let h = node.clientHeight;
    if ( !w || !h ) {
        const r = node.getBoundingClientRect();
        w = r.width  || 600;
        h = r.height || 400;
    }
    return [ w, h ];
}

// Drives the clip-rect reveal independently of D3's update cycle.
// Returns a cancel function.
function revealRect(
    rectEl: SVGRectElement,
    targetWidth: number,
    durationMs: number,
    delayMs: number,
    onDone?: () => void
): () => void {
    let rafId = 0;
    let cancelled = false;

    const run = () => {
        const startTime = performance.now();
        const tick = ( now: number ) => {
            if ( cancelled ) return;
            const elapsed = now - startTime;
            const t = Math.min( elapsed / durationMs, 1 );
            rectEl.setAttribute( "width", String( targetWidth * t ) );
            if ( t < 1 ) {
                rafId = requestAnimationFrame( tick );
            } else if ( onDone ) {
                onDone();
            }
        };
        rafId = requestAnimationFrame( tick );
    };

    rectEl.setAttribute( "width", "0" );
    const timerId = setTimeout( run, delayMs );

    return () => {
        cancelled = true;
        clearTimeout( timerId );
        cancelAnimationFrame( rafId );
    };
}

export default class extends RenderBase {
    private _lastDataId = "";
    private _lastIw = -1;
    private _lastIh = -1;
    // Cancel functions for any in-flight reveal animations, keyed by series index
    private _cancelReveal: Map<number, () => void> = new Map();

    protected create( _node: HTMLElement ): Element {
        const svg = d3.select( _node )
            .append( "svg" )
            .attr( "width", "100%" )
            .attr( "height", "100%" );

        const defs = svg.append( "defs" );
        defs.append( "clipPath" )
            .attr( "id", "alc-plot-clip" )
            .append( "rect" )
            .attr( "class", "alc-plot-rect" );

        svg.append( "g" ).attr( "class", "x-axis" );
        svg.append( "g" ).attr( "class", "y-axis" );
        svg.append( "g" ).attr( "class", "areas"   ).attr( "clip-path", "url(#alc-plot-clip)" );
        svg.append( "g" ).attr( "class", "lines"   ).attr( "clip-path", "url(#alc-plot-clip)" );
        svg.append( "g" ).attr( "class", "markers" ).attr( "clip-path", "url(#alc-plot-clip)" );
        svg.append( "g" ).attr( "class", "overlay" );

        return _node;
    }

    protected update( _info: UpdateInfo ): void {
        const node  = _info.node as HTMLElement;
        const data  = _info.data;
        const props = _info.props;
        const svg   = d3.select( node ).select<SVGSVGElement>( "svg" );

        if ( !data ) {
            svg.selectAll( ".lines *, .areas *, .markers *, .x-axis *, .y-axis *" ).remove();
            return;
        }

        const [ w, h ] = getSize( node );
        const m  = MARGIN;
        const iw = Math.max( w - m.left - m.right,  50 );
        const ih = Math.max( h - m.top  - m.bottom, 50 );

        svg.select<SVGRectElement>( ".alc-plot-rect" )
            .attr( "width",  iw )
            .attr( "height", ih );

        const palette     = props.get( "colors" )       as CatPalette;
        const smooth      = props.get( "smooth" )       as boolean;
        const showMarkers = props.get( "showMarkers" )  as boolean;
        const showArea    = props.get( "showArea" )     as boolean;
        const lineWidth   = props.get( "lineWidth" )    as number;
        const animDur     = props.get( "animDuration" ) as number;
        const animStagger = props.get( "animStagger" )  as number;

        const hasSeries = data.cols[ SERIES ].mapped;
        const seriesKeys: string[] = hasSeries
            ? data.cols[ SERIES ].tuples.map( t => t.key )
            : [ "__single__" ];
        const catKeys = data.cols[ CAT ].tuples.map( t => t.key );

        const dataId    = `${data.rows.length}:${catKeys.length}:${seriesKeys.length}`;
        const isNewData = dataId !== this._lastDataId;
        if ( isNewData ) this._lastDataId = dataId;

        // Compare actual pixel dimensions — reason.size fires on initial load too,
        // so we must not use it alone to decide whether to reset clip rects.
        const sizeChanged = iw !== this._lastIw || ih !== this._lastIh;
        this._lastIw = iw;
        this._lastIh = ih;

        // Build lookup: seriesKey → catKey → DataPoint
        const lookup = new Map<string, Map<string, DataPoint>>();
        for ( const row of data.rows ) {
            const sk = hasSeries ? row.tuple( SERIES ).key : "__single__";
            const ck = row.tuple( CAT ).key;
            if ( !lookup.has( sk ) ) lookup.set( sk, new Map() );
            lookup.get( sk )!.set( ck, row );
        }

        // --- Axes ---
        const catCaptions = new Map( data.cols[ CAT ].tuples.map( t => [ t.key, t.caption ] ) );
        const xAxis = d3.axisBottom<string>( d3.scalePoint<string>() ) // placeholder, set below
            .tickSizeOuter( 0 )
            .tickFormat( k => catCaptions.get( k ) || k );
        const x = d3.scalePoint<string>()
            .domain( catKeys )
            .range( [ 0, iw ] )
            .padding( 0.05 );
        const [ yLo, yHi ] = data.cols[ VAL ].domain.asArray();
        const y = d3.scaleLinear()
            .domain( [ Math.min( 0, yLo ), yHi ] )
            .range( [ ih, 0 ] )
            .nice();

        const xAxisFinal = d3.axisBottom( x ).tickSizeOuter( 0 )
            .tickFormat( k => catCaptions.get( k as string ) || ( k as string ) );
        const yAxis = d3.axisLeft( y ).ticks( 6 ).tickSizeOuter( 0 );

        const xAxisG = svg.select<SVGGElement>( ".x-axis" )
            .attr( "transform", `translate(${m.left},${m.top + ih})` );
        const yAxisG = svg.select<SVGGElement>( ".y-axis" )
            .attr( "transform", `translate(${m.left},${m.top})` );

        if ( isNewData ) {
            xAxisG.attr( "opacity", 0 ).call( xAxisFinal )
                .transition().duration( animDur / 2 ).attr( "opacity", 1 );
            yAxisG.attr( "opacity", 0 ).call( yAxis )
                .transition().duration( animDur / 2 ).attr( "opacity", 1 );
        } else {
            xAxisG.call( xAxisFinal );
            yAxisG.call( yAxis );
        }

        if ( catKeys.length > 8 ) {
            xAxisG.selectAll<SVGTextElement, unknown>( "text" )
                .attr( "transform", "rotate(-35)" )
                .attr( "text-anchor", "end" )
                .attr( "dx", "-0.4em" )
                .attr( "dy",  "0.6em" );
        }

        svg.selectAll( ".x-axis path, .y-axis path, .x-axis line, .y-axis line" )
            .attr( "stroke", "#ccc" );
        svg.selectAll( ".x-axis text, .y-axis text" )
            .attr( "font-size", "11px" ).attr( "fill", "#555" );
        yAxisG.selectAll<SVGLineElement, unknown>( ".tick line" )
            .attr( "x2", iw ).attr( "stroke", "#eee" );

        const curve = smooth ? d3.curveCatmullRom.alpha( 0.5 ) : d3.curveLinear;
        const lineGen = d3.line<DataPoint>()
            .defined( d => !isNaN( d.value( VAL ) ) )
            .x( d => x( d.tuple( CAT ).key ) as number )
            .y( d => y( d.value( VAL ) ) )
            .curve( curve );
        const areaGen = d3.area<DataPoint>()
            .defined( d => !isNaN( d.value( VAL ) ) )
            .x(  d => x( d.tuple( CAT ).key ) as number )
            .y0( ih )
            .y1( d => y( d.value( VAL ) ) )
            .curve( curve );

        const defs     = svg.select<SVGDefsElement>( "defs" );
        const linesG   = svg.select<SVGGElement>( ".lines"   ).attr( "transform", `translate(${m.left},${m.top})` );
        const areasG   = svg.select<SVGGElement>( ".areas"   ).attr( "transform", `translate(${m.left},${m.top})` );
        const markersG = svg.select<SVGGElement>( ".markers" ).attr( "transform", `translate(${m.left},${m.top})` );

        seriesKeys.forEach( ( sk, si ) => {
            const seriesRows = catKeys
                .map( ck => lookup.get( sk )?.get( ck ) )
                .filter( ( d ): d is DataPoint => d != null );

            const firstRow  = seriesRows[ 0 ];
            const fillColor = firstRow ? palette.getFillColor( firstRow ) : "#3b82f6";

            // --- Per-series reveal clipPath ---
            const clipId  = `alc-reveal-${si}`;
            const clipSel = defs.select<SVGClipPathElement>( `#${clipId}` );
            let clipRectEl: SVGRectElement;

            if ( clipSel.empty() ) {
                const cp = defs.append( "clipPath" ).attr( "id", clipId );
                clipRectEl = cp.append( "rect" )
                    .attr( "y", -10 )
                    .attr( "height", ih + 20 )
                    .attr( "width", 0 )
                    .node() as SVGRectElement;
            } else {
                clipRectEl = clipSel.select<SVGRectElement>( "rect" )
                    .attr( "height", ih + 20 )
                    .node() as SVGRectElement;
            }

            if ( isNewData ) {
                // Cancel any in-flight animation for this series, start fresh
                const prev = this._cancelReveal.get( si );
                if ( prev ) { prev(); this._cancelReveal.delete( si ); }
                const cancel = revealRect( clipRectEl, iw, animDur, si * animStagger,
                    () => this._cancelReveal.delete( si ) );
                this._cancelReveal.set( si, cancel );

            } else if ( sizeChanged && !this._cancelReveal.has( si ) ) {
                // Genuine container resize AND no animation in flight — update clip width
                clipRectEl.setAttribute( "width", String( iw ) );
            }
            // Properties / decorations / reason.size-without-actual-resize: leave clip alone.

            // --- Area ---
            const areaId = `alc-area-${si}`;
            let areaPath = areasG.select<SVGPathElement>( `#${areaId}` );
            if ( areaPath.empty() ) {
                areaPath = areasG.append( "path" ).attr( "id", areaId )
                    .attr( "clip-path", `url(#${clipId})` );
            }
            areaPath.datum( seriesRows )
                .attr( "fill", fillColor )
                .attr( "opacity", showArea ? 0.12 : 0 )
                .attr( "d", areaGen as any );

            // --- Line ---
            const lineId = `alc-line-${si}`;
            let linePath = linesG.select<SVGPathElement>( `#${lineId}` );
            if ( linePath.empty() ) {
                linePath = linesG.append( "path" ).attr( "id", lineId )
                    .attr( "clip-path", `url(#${clipId})` );
            }
            linePath.datum( seriesRows )
                .attr( "fill", "none" )
                .attr( "stroke", fillColor )
                .attr( "stroke-width", lineWidth )
                .attr( "stroke-linecap", "round" )
                .attr( "stroke-linejoin", "round" )
                .attr( "opacity", 1 )
                .attr( "d", lineGen as any );

            // --- Markers ---
            const markerId = `alc-markers-${si}`;
            let markerG = markersG.select<SVGGElement>( `#${markerId}` );
            if ( markerG.empty() ) {
                markerG = markersG.append( "g" ).attr( "id", markerId )
                    .attr( "clip-path", `url(#${clipId})` );
            }
            markerG.selectAll<SVGCircleElement, DataPoint>( "circle" )
                .data( showMarkers ? seriesRows : [], ( d: DataPoint ) => d.key )
                .join( "circle" )
                .attr( "cx", d => x( d.tuple( CAT ).key ) as number )
                .attr( "cy", d => y( d.value( VAL ) ) )
                .attr( "r",  lineWidth * 2.5 )
                .attr( "fill",   d => palette.getFillColor( d ) )
                .attr( "stroke", d => palette.getOutlineColor( d ) )
                .attr( "stroke-width", 1.5 );
        } );

        // Remove stale series elements
        [ { g: linesG, pfx: "alc-line-" }, { g: areasG, pfx: "alc-area-" }, { g: markersG, pfx: "alc-markers-" } ]
            .forEach( ( { g, pfx } ) => {
                g.selectAll<Element, unknown>( "*" ).filter( function() {
                    const idx = parseInt( ( this as Element ).id.replace( pfx, "" ), 10 );
                    return idx >= seriesKeys.length;
                } ).remove();
            } );
        for ( let i = seriesKeys.length; i < seriesKeys.length + 8; i++ ) {
            defs.select( `#alc-reveal-${i}` ).remove();
            const prev = this._cancelReveal.get( i );
            if ( prev ) { prev(); this._cancelReveal.delete( i ); }
        }

        // --- Tooltip & crosshair ---
        let tip = d3.select( node ).select<HTMLDivElement>( ".alc-tooltip" );
        if ( tip.empty() ) {
            tip = d3.select( node ).append( "div" ).attr( "class", "alc-tooltip" )
                .style( "position", "absolute" )
                .style( "pointer-events", "none" )
                .style( "display", "none" )
                .style( "background", "rgba(30,30,30,0.9)" )
                .style( "color", "#f0f0f0" )
                .style( "border-radius", "6px" )
                .style( "padding", "8px 12px" )
                .style( "font-size", "12px" )
                .style( "line-height", "1.7" )
                .style( "box-shadow", "0 2px 8px rgba(0,0,0,0.4)" )
                .style( "z-index", "9999" );
        }

        const overlayG = svg.select<SVGGElement>( ".overlay" )
            .attr( "transform", `translate(${m.left},${m.top})` );
        overlayG.selectAll( "*" ).remove();

        overlayG.append( "rect" )
            .attr( "width",  iw )
            .attr( "height", ih )
            .attr( "fill", "transparent" )
            .on( "mousemove", function() {
                const [ mx ] = d3.mouse( this as SVGRectElement );
                let minDist = Infinity;
                let closestCat = catKeys[ 0 ];
                catKeys.forEach( ck => {
                    const dist = Math.abs( ( x( ck ) as number ) - mx );
                    if ( dist < minDist ) { minDist = dist; closestCat = ck; }
                } );
                const catCaption = catCaptions.get( closestCat ) || closestCat;
                let html = `<strong>${catCaption}</strong>`;
                seriesKeys.forEach( sk => {
                    const row = lookup.get( sk )?.get( closestCat );
                    if ( !row ) return;
                    const label = hasSeries
                        ? ( data.cols[ SERIES ].tuples.find( t => t.key === sk )?.caption || sk )
                        : ( data.cols[ VAL ].caption || "Value" );
                    const color = palette.getFillColor( row );
                    html += `<br/><span style="color:${color}">&#9679;</span> ${label}: <strong>${d3.format( ",.3~f" )( row.value( VAL ) )}</strong>`;
                } );
                const cx      = x( closestCat ) as number;
                const tipLeft = cx + 12 < iw - 180 ? cx + m.left + 12 : cx + m.left - 188;
                tip.style( "display", "block" )
                   .style( "left", tipLeft + "px" )
                   .style( "top",  ( m.top + 4 ) + "px" )
                   .html( html );
                overlayG.select( ".crosshair" ).remove();
                overlayG.insert( "line", ":first-child" )
                    .attr( "class", "crosshair" )
                    .attr( "x1", cx ).attr( "x2", cx )
                    .attr( "y1", 0  ).attr( "y2", ih )
                    .attr( "stroke", "#aaa" )
                    .attr( "stroke-width", 1 )
                    .attr( "stroke-dasharray", "4,3" )
                    .attr( "pointer-events", "none" );
            } )
            .on( "mouseout", () => {
                tip.style( "display", "none" );
                overlayG.select( ".crosshair" ).remove();
            } );
    }
}

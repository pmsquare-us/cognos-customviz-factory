import { RenderBase, UpdateInfo, CatPalette, DataSet, DataPoint } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

// Slot indices — must match <ref> order in vizdef.xml
const CAT = 0, SERIES = 1, VAL = 2;

const MARGIN     = { top: 20, right: 100, bottom: 60, left: 60 };
const BADGE_PX   = 4;   // horizontal padding inside badge (each side)
const BADGE_PY   = 3;   // vertical padding inside badge (each side)
const BADGE_RX   = 3;   // corner radius
const LEADER0    = 10;  // initial leader length from bar edge (px)
const LEAD_INC   = 14;  // leader extension per retry pass
const MAX_EXT    = 4;   // max extension passes before fallback

// ─── collision geometry ───────────────────────────────────────────────────────

interface Box { x1: number; y1: number; x2: number; y2: number; }

// h is the full box height (font + top/bottom badge padding).
function makeBox( leftX: number, centerY: number, w: number, h: number ): Box
{
    return { x1: leftX, y1: centerY - h / 2, x2: leftX + w, y2: centerY + h / 2 };
}

function collides( a: Box, b: Box ): boolean
{
    const pad = 2;
    return a.x1 < b.x2 + pad && a.x2 > b.x1 - pad &&
           a.y1 < b.y2 + pad && a.y2 > b.y1 - pad;
}

// ─── badge renderer ───────────────────────────────────────────────────────────

// Appends a rounded-rect badge + text into `parent` (a d3 selection of a <g>).
// cx/cy is the badge centre. Returns { badgeW, badgeH } so callers can register
// the collision box without re-computing dimensions.
function renderBadge(
    parent: any,
    cx: number, cy: number,
    text: string,
    fontSize: number,
    textColor: string,
    bgColor: string,
    borderColor: string
): { badgeW: number; badgeH: number }
{
    const charW  = fontSize * 0.62;
    const textW  = text.length * charW;
    const badgeW = textW + 2 * BADGE_PX;
    const badgeH = fontSize + 2 * BADGE_PY;

    parent.append( "rect" )
        .attr( "x",            cx - badgeW / 2 )
        .attr( "y",            cy - badgeH / 2 )
        .attr( "width",        badgeW )
        .attr( "height",       badgeH )
        .attr( "rx",           BADGE_RX )
        .attr( "fill",         bgColor )
        .attr( "stroke",       borderColor )
        .attr( "stroke-width", "1" );

    parent.append( "text" )
        .attr( "x",                 cx )
        .attr( "y",                 cy )
        .attr( "text-anchor",        "middle" )
        .attr( "dominant-baseline", "middle" )
        .attr( "font-size",         `${ fontSize }px` )
        .attr( "font-family",       "sans-serif" )
        .attr( "fill",              textColor )
        .attr( "pointer-events",    "none" )
        .text( text );

    return { badgeW, badgeH };
}

// ─── callout placement ────────────────────────────────────────────────────────

interface CalloutPos {
    lx1: number; ly1: number;   // leader origin (bar edge at segment midpoint)
    lx2: number; ly2: number;   // leader tip (badge edge)
    cx: number;  cy: number;    // badge centre
}

// labelH = badgeH from renderBadge — used for Y-search step and bounds clamping.
// badgeW = full badge width — used for collision boxes and side positioning.
function placeCallout(
    barX: number, bw: number, segMidY: number,
    badgeW: number, labelH: number,
    placed: Box[], iW: number, iH: number
): CalloutPos
{
    const rightRoom = iW + MARGIN.right - ( barX + bw );
    const leftRoom  = barX + MARGIN.left;
    const sides: Array<"right" | "left"> = leftRoom > rightRoom
        ? [ "left", "right" ]
        : [ "right", "left" ];

    for ( let ext = 0; ext <= MAX_EXT; ext++ )
    {
        const leaderLen = LEADER0 + ext * LEAD_INC;

        for ( const side of sides )
        {
            // anchorX = leader tip = badge edge closest to the bar.
            // cx = badge centre.
            let anchorX: number, cx: number;
            if ( side === "right" )
            {
                anchorX = barX + bw + leaderLen;
                cx      = anchorX + badgeW / 2 + 2;
            }
            else
            {
                anchorX = barX - leaderLen;
                cx      = anchorX - badgeW / 2 - 2;
            }

            // Badge must sit within SVG bounds (coords are relative to main group).
            if ( cx + badgeW / 2 > iW + MARGIN.right - 4 ) continue;
            if ( cx - badgeW / 2 < -MARGIN.left      + 4 ) continue;

            const maxTries = 10 + ext * 2;
            for ( let yi = 0; yi < maxTries; yi++ )
            {
                const step = Math.ceil( yi / 2 ) * labelH;
                const dy   = yi === 0 ? 0 : yi % 2 === 1 ? step : -step;
                const py   = segMidY + dy;

                if ( py < labelH / 2 || py > iH - labelH / 2 ) continue;

                const box = makeBox( cx - badgeW / 2, py, badgeW, labelH );
                if ( !placed.some( b => collides( box, b ) ) )
                {
                    placed.push( box );
                    return {
                        lx1: side === "right" ? barX + bw : barX,
                        ly1: segMidY,
                        lx2: anchorX,
                        ly2: py,
                        cx, cy: py
                    };
                }
            }
        }
    }

    // Fallback — place without collision check.
    const side    = leftRoom > rightRoom ? "left" : "right";
    const anchorX = side === "right" ? barX + bw + LEADER0 : barX - LEADER0;
    const cx      = side === "right" ? anchorX + badgeW / 2 + 2 : anchorX - badgeW / 2 - 2;
    placed.push( makeBox( cx - badgeW / 2, segMidY, badgeW, labelH ) );
    return {
        lx1: side === "right" ? barX + bw : barX,
        ly1: segMidY,
        lx2: anchorX,
        ly2: segMidY,
        cx, cy: segMidY
    };
}

// ─── data model ───────────────────────────────────────────────────────────────

interface StackedDatum {
    dp: DataPoint;
    y0: number;
    y1: number;
}

// ─── renderer ─────────────────────────────────────────────────────────────────

export default class extends RenderBase
{
    protected create( _node: HTMLElement ): Element
    {
        const svg = d3.select( _node ).append( "svg" ).attr( "width", "100%" ).attr( "height", "100%" );
        const g = svg.append( "g" ).attr( "class", "main" );
        g.append( "g" ).attr( "class", "y-axis" );
        g.append( "g" ).attr( "class", "x-axis" );
        g.append( "g" ).attr( "class", "bars" );
        g.append( "g" ).attr( "class", "labels" );
        return _node;
    }

    protected hitTest( _elem: Element | null ): DataPoint | null
    {
        if ( !_elem ) return null;
        const d = ( d3.select( _elem ) as any ).datum() as StackedDatum;
        return d && d.dp ? d.dp : null;
    }

    protected getSlotForPalette( _data: DataSet, _palette: string ): string
    {
        if ( _palette === "colors" )
            return _data.cols[ SERIES ].mapped ? "series" : "categories";
        return null;
    }

    protected update( _info: UpdateInfo ): void
    {
        const node = _info.node as HTMLElement;
        const svg  = d3.select( node ).select( "svg" );
        const data = _info.data;

        if ( !data || data.rows.length === 0 )
        {
            svg.select( ".bars"   ).selectAll( "*" ).remove();
            svg.select( ".labels" ).selectAll( "*" ).remove();
            return;
        }

        const palette = _info.props.get( "colors" ) as CatPalette;

        // Decorations-only fast path — just recolor on mouse-move.
        if ( _info.reason.decorations && !_info.reason.data && !_info.reason.size && !_info.reason.properties )
        {
            svg.select( ".bars" ).selectAll<SVGRectElement, StackedDatum>( "rect.seg" )
                .attr( "fill",   d => palette.getFillColor( d.dp ) )
                .attr( "stroke", d => palette.getOutlineColor( d.dp ) );
            return;
        }

        // ── label style props ──────────────────────────────────────────────────
        const showLabels  = _info.props.get( "showLabels"     ) as boolean;
        const minH        = Math.max( 4, _info.props.get( "labelMinHeight" ) as number );
        const fontSize    = Math.max( 7, Math.min( 24, _info.props.get( "fontSize"    ) as number ) );
        const insideColor = String( _info.props.get( "insideColor"  ) );
        const calloutColor= String( _info.props.get( "calloutColor" ) );
        const badgeFill   = String( _info.props.get( "badgeFill"    ) );
        const badgeBorder = String( _info.props.get( "badgeBorder"  ) );

        // Derived geometry — must match renderBadge's own calculation.
        const charW  = fontSize * 0.62;
        const labelH = fontSize + 2 * BADGE_PY;   // badge height used for collision boxes

        // ── data slots ────────────────────────────────────────────────────────
        const hasSeries = data.cols[ SERIES ].mapped;
        const catTuples = data.cols[ CAT ].tuples;
        const serTuples = hasSeries ? data.cols[ SERIES ].tuples : [];
        const rows      = data.rows;

        const w  = Math.max( 1, node.clientWidth );
        const h  = Math.max( 1, node.clientHeight );
        const iW = Math.max( 1, w - MARGIN.left - MARGIN.right );
        const iH = Math.max( 1, h - MARGIN.top  - MARGIN.bottom );

        // ── stacked data ──────────────────────────────────────────────────────
        const seriesIndex = ( dp: DataPoint ) => {
            if ( !hasSeries ) return 0;
            const t = dp.tuple( SERIES );
            return t ? serTuples.findIndex( s => s.key === t.key ) : 0;
        };

        const stackData = new Map<string, StackedDatum[]>();
        for ( const ct of catTuples )
        {
            const catRows = rows.filter( dp => dp.tuple( CAT ).key === ct.key );
            catRows.sort( ( a, b ) => seriesIndex( a ) - seriesIndex( b ) );
            let cum = 0;
            stackData.set( ct.key, catRows.map( dp => {
                const v: number = Math.max( 0, dp.value( VAL ) || 0 );
                const sd: StackedDatum = { dp, y0: cum, y1: cum + v };
                cum += v;
                return sd;
            } ) );
        }

        let yMax = 0;
        for ( const items of stackData.values() )
            if ( items.length ) yMax = Math.max( yMax, items[ items.length - 1 ].y1 );
        if ( yMax <= 0 ) yMax = 1;

        // ── scales ────────────────────────────────────────────────────────────
        const catCap = new Map( catTuples.map( t => [ t.key, t.caption ] ) );
        const x = d3.scaleBand().domain( catTuples.map( t => t.key ) ).range( [ 0, iW ] ).padding( 0.25 );
        const y = d3.scaleLinear().domain( [ 0, yMax ] ).range( [ iH, 0 ] ).nice();

        svg.select( "g.main" ).attr( "transform", `translate(${ MARGIN.left },${ MARGIN.top })` );

        ( svg.select<SVGGElement>( ".x-axis" ) as any )
            .attr( "transform", `translate(0,${ iH })` )
            .call( d3.axisBottom( x ).tickFormat( ( k: any ) => catCap.get( k ) || k ) );

        ( svg.select<SVGGElement>( ".y-axis" ) as any )
            .call( d3.axisLeft( y ).ticks( 5 ) );

        // ── bars ──────────────────────────────────────────────────────────────
        const allStacked: StackedDatum[] = [];
        for ( const ct of catTuples )
            allStacked.push( ...( stackData.get( ct.key ) || [] ) );

        svg.select<SVGGElement>( ".bars" )
            .selectAll<SVGRectElement, StackedDatum>( "rect.seg" )
            .data( allStacked, d => d.dp.key )
            .join( "rect" )
            .attr( "class",        "seg" )
            .attr( "x",            d => x( d.dp.tuple( CAT ).key )! )
            .attr( "width",        x.bandwidth() )
            .attr( "y",            d => y( d.y1 ) )
            .attr( "height",       d => Math.max( 0, y( d.y0 ) - y( d.y1 ) ) )
            .attr( "fill",         d => palette.getFillColor( d.dp ) )
            .attr( "stroke",       d => palette.getOutlineColor( d.dp ) )
            .attr( "stroke-width", "0.5" );

        // ── labels ────────────────────────────────────────────────────────────
        const labelsG = svg.select( ".labels" );
        labelsG.selectAll( "*" ).remove();

        if ( !showLabels ) return;

        const fmt = d3.format( "," );

        // placedBoxes accumulates BOTH inside and callout badges so they all
        // act as mutual obstacles regardless of which bar they belong to.
        const placedBoxes: Box[] = [];

        interface CalloutItem {
            bx: number; bw: number; segMidY: number; text: string;
        }
        const calloutQueue: CalloutItem[] = [];

        // Pass 1 — inside labels (fixed position; register box before callouts run).
        for ( const ct of catTuples )
        {
            const items = stackData.get( ct.key ) || [];
            const bx    = x( ct.key )!;
            const bw    = x.bandwidth();

            for ( const sd of items )
            {
                if ( sd.y1 <= sd.y0 ) continue;
                const top   = y( sd.y1 );
                const pxH   = Math.max( 0, y( sd.y0 ) - top );
                const midPx = top + pxH / 2;
                const text  = sd.dp.caption( VAL ) || fmt( sd.dp.value( VAL ) );

                if ( pxH >= minH )
                {
                    const g = labelsG.append( "g" ).attr( "pointer-events", "none" );
                    const { badgeW, badgeH } = renderBadge(
                        g, bx + bw / 2, midPx, text,
                        fontSize, insideColor, badgeFill, badgeBorder
                    );
                    placedBoxes.push( makeBox( bx + bw / 2 - badgeW / 2, midPx, badgeW, badgeH ) );
                }
                else
                {
                    calloutQueue.push( { bx, bw, segMidY: midPx, text } );
                }
            }
        }

        // Pass 2 — callout labels: global placement with full collision awareness.
        calloutQueue.sort( ( a, b ) =>
            a.bx !== b.bx ? a.bx - b.bx : a.segMidY - b.segMidY );

        for ( const c of calloutQueue )
        {
            const badgeW = c.text.length * charW + 2 * BADGE_PX;
            const pos    = placeCallout(
                c.bx, c.bw, c.segMidY, badgeW, labelH, placedBoxes, iW, iH
            );

            const g = labelsG.append( "g" ).attr( "pointer-events", "none" );

            // Leader line from the bar edge to the badge edge.
            g.append( "line" )
                .attr( "x1", pos.lx1 ).attr( "y1", pos.ly1 )
                .attr( "x2", pos.lx2 ).attr( "y2", pos.ly2 )
                .attr( "stroke",       badgeBorder )
                .attr( "stroke-width", "1" );

            renderBadge(
                g, pos.cx, pos.cy, c.text,
                fontSize, calloutColor, badgeFill, badgeBorder
            );
        }
    }
}

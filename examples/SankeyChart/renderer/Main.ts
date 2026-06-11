import { RenderBase, UpdateInfo, CatPalette } from "@businessanalytics/customvis-lib";
import * as d3 from "d3";

const SOURCE = 0, TARGET = 1, VALUE = 2;
const MARGIN = { top: 20, right: 160, bottom: 20, left: 160 };

interface SNode {
    id: string;
    caption: string;
    color: string;
    totalIn: number;
    totalOut: number;
    value: number;
    depth: number;
    x0: number; x1: number;
    y0: number; y1: number;
    sourceLinks: SLink[];
    targetLinks: SLink[];
}

interface SLink {
    source: SNode;
    target: SNode;
    value: number;
    width: number;   // pixel height of the ribbon
    sy0: number;     // center-y at source exit
    ty0: number;     // center-y at target entry
}

// ---- Layout ----------------------------------------------------------------

function computeLayout(
    nodes: SNode[], links: SLink[],
    iw: number, ih: number, nodeW: number, nodePad: number
): void {

    // Node value = max of total in vs total out (sources: out only, sinks: in only)
    nodes.forEach( n => {
        const out = n.sourceLinks.reduce( ( s, l ) => s + l.value, 0 );
        const inp = n.targetLinks.reduce( ( s, l ) => s + l.value, 0 );
        n.value = Math.max( out, inp );
    } );

    // Depth = longest path from any pure source (node with no incoming links).
    // Each node sits at its NATURAL depth — terminal nodes are NOT right-aligned,
    // so a flow that ends early (e.g. COGS just after Revenue) stays in its column.
    nodes.forEach( n => { n.depth = 0; } );
    let changed = true;
    let guard = 0;
    while ( changed && guard++ < nodes.length + 2 ) {
        changed = false;
        links.forEach( lk => {
            if ( lk.target.depth < lk.source.depth + 1 ) {
                lk.target.depth = lk.source.depth + 1;
                changed = true;
            }
        } );
    }
    const maxDepth = Math.max( 0, ...nodes.map( n => n.depth ) );

    // x positions
    const colW = maxDepth > 0 ? ( iw - nodeW ) / maxDepth : 0;
    nodes.forEach( n => {
        n.x0 = Math.round( n.depth * colW );
        n.x1 = n.x0 + nodeW;
    } );

    // Group nodes by column
    const columns: SNode[][] = [];
    nodes.forEach( n => {
        ( columns[ n.depth ] || ( columns[ n.depth ] = [] ) ).push( n );
    } );

    // Consistent value->pixel scale (ky): smallest scale that fits the tallest column
    let ky = Infinity;
    columns.forEach( col => {
        const totalVal = col.reduce( ( s, n ) => s + n.value, 0 );
        const avail    = ih - nodePad * ( col.length - 1 );
        if ( totalVal > 0 ) ky = Math.min( ky, avail / totalVal );
    } );
    if ( !isFinite( ky ) || ky <= 0 ) ky = 1;

    links.forEach( lk => { lk.width = lk.value * ky; } );

    // Initial vertical stack per column (centered)
    columns.forEach( col => {
        const totalH = col.reduce( ( s, n ) => s + n.value * ky, 0 ) + nodePad * ( col.length - 1 );
        let y = ( ih - totalH ) / 2;
        col.forEach( n => {
            n.y0 = y;
            n.y1 = y + n.value * ky;
            y = n.y1 + nodePad;
        } );
    } );

    const center = ( n: SNode ) => ( n.y0 + n.y1 ) / 2;
    const weightedSourceCenter = ( n: SNode ) => {
        const w = n.targetLinks.reduce( ( s, l ) => s + l.value, 0 );
        if ( w === 0 ) return center( n );
        return n.targetLinks.reduce( ( s, l ) => s + center( l.source ) * l.value, 0 ) / w;
    };
    const weightedTargetCenter = ( n: SNode ) => {
        const w = n.sourceLinks.reduce( ( s, l ) => s + l.value, 0 );
        if ( w === 0 ) return center( n );
        return n.sourceLinks.reduce( ( s, l ) => s + center( l.target ) * l.value, 0 ) / w;
    };

    const resolveCollisions = ( col: SNode[] ) => {
        col.sort( ( a, b ) => center( a ) - center( b ) );
        // Push down from top
        let y = 0;
        col.forEach( n => {
            const dy = y - n.y0;
            if ( dy > 0 ) { n.y0 += dy; n.y1 += dy; }
            y = n.y1 + nodePad;
        } );
        // Push back up if we overflowed the bottom
        y = ih;
        for ( let i = col.length - 1; i >= 0; i-- ) {
            const n = col[ i ];
            const dy = n.y1 - y;
            if ( dy > 0 ) { n.y0 -= dy; n.y1 -= dy; }
            y = n.y0 - nodePad;
        }
    };

    // Relaxation: alternate left->right and right->left a few passes
    for ( let iter = 0; iter < 8; iter++ ) {
        const alpha = Math.pow( 0.99, iter );
        // left -> right (align to sources)
        for ( let d = 1; d <= maxDepth; d++ ) {
            ( columns[ d ] || [] ).forEach( n => {
                const target = weightedSourceCenter( n );
                const dy = ( target - center( n ) ) * alpha;
                n.y0 += dy; n.y1 += dy;
            } );
            resolveCollisions( columns[ d ] || [] );
        }
        // right -> left (align to targets)
        for ( let d = maxDepth - 1; d >= 0; d-- ) {
            ( columns[ d ] || [] ).forEach( n => {
                const target = weightedTargetCenter( n );
                const dy = ( target - center( n ) ) * alpha;
                n.y0 += dy; n.y1 += dy;
            } );
            resolveCollisions( columns[ d ] || [] );
        }
    }

    // Order links within each node by the partner's center, then stack ribbons
    nodes.forEach( n => {
        n.sourceLinks.sort( ( a, b ) => center( a.target ) - center( b.target ) );
        n.targetLinks.sort( ( a, b ) => center( a.source ) - center( b.source ) );
    } );
    nodes.forEach( n => {
        let y = n.y0;
        n.sourceLinks.forEach( lk => { lk.sy0 = y + lk.width / 2; y += lk.width; } );
        y = n.y0;
        n.targetLinks.forEach( lk => { lk.ty0 = y + lk.width / 2; y += lk.width; } );
    } );
}

// Filled ribbon path between two nodes
function ribbonPath( lk: SLink ): string {
    const sx  = lk.source.x1;
    const tx  = lk.target.x0;
    const mx  = ( sx + tx ) / 2;
    const hw  = lk.width / 2;
    const sy  = lk.sy0;
    const ty  = lk.ty0;
    return `M${sx},${sy - hw}` +
           `C${mx},${sy - hw} ${mx},${ty - hw} ${tx},${ty - hw}` +
           `L${tx},${ty + hw}` +
           `C${mx},${ty + hw} ${mx},${sy + hw} ${sx},${sy + hw}Z`;
}

// ---- RenderBase ------------------------------------------------------------

export default class extends RenderBase {
    private _svg:     d3.Selection<SVGSVGElement,  unknown, null, undefined> | null = null;
    private _tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined> | null = null;
    private _activeNode: string | null = null;

    protected create( _node: HTMLElement ): Element {
        this._svg = d3.select( _node ).append( "svg" )
            .attr( "width", "100%" ).attr( "height", "100%" );
        this._svg.append( "g" ).attr( "class", "sk-links" );
        this._svg.append( "g" ).attr( "class", "sk-nodes" );

        this._tooltip = d3.select( _node ).append( "div" )
            .style( "position", "absolute" )
            .style( "pointer-events", "none" )
            .style( "display", "none" )
            .style( "background", "rgba(30,30,30,0.92)" )
            .style( "color", "#f0f0f0" )
            .style( "border", "1px solid #555" )
            .style( "border-radius", "6px" )
            .style( "padding", "8px 12px" )
            .style( "font-size", "12px" )
            .style( "line-height", "1.6" )
            .style( "max-width", "220px" )
            .style( "box-shadow", "0 2px 8px rgba(0,0,0,0.5)" )
            .style( "z-index", "9999" );

        return _node;
    }

    protected update( _info: UpdateInfo ): void {
        const container = _info.node as HTMLElement;
        const data      = _info.data;
        const props     = _info.props;
        const svg       = this._svg!;
        const tooltip   = this._tooltip!;

        const darkMode    = props.get( "darkMode" )    as boolean;
        const showName    = props.get( "showName" )    as boolean;
        const showValue   = props.get( "showValue" )   as boolean;
        const showPercent = props.get( "showPercent" ) as boolean;
        const nodeWidth   = props.get( "nodeWidth" )   as number;
        const nodePad     = props.get( "nodePadding" ) as number;
        const flowOpacity = ( props.get( "flowOpacity" ) as number ) / 100;
        const palette     = props.get( "colors" ) as CatPalette;

        const bgColor   = darkMode ? "#111111" : "#ffffff";
        const textColor = darkMode ? "#e5e7eb" : "#1f2937";
        container.style.background = bgColor;

        const w = container.clientWidth  || 800;
        const h = container.clientHeight || 600;
        svg.attr( "viewBox", `0 0 ${w} ${h}` );

        if ( !data || data.rows.length === 0 ) {
            svg.select( ".sk-links" ).selectAll( "*" ).remove();
            svg.select( ".sk-nodes" ).selectAll( "*" ).remove();
            return;
        }

        // --- Build graph from Cognos rows ---
        const nodeMap = new Map<string, SNode>();
        const rawLinks: Array<{ sourceId: string; targetId: string; value: number }> = [];

        // Track first-row-per-source for palette color
        const sourceColorMap = new Map<string, string>();

        data.rows.forEach( row => {
            const srcTup = row.tuple( SOURCE );
            const tgtTup = row.tuple( TARGET );
            const val    = row.value( VALUE );
            if ( !srcTup || !tgtTup || !val || val <= 0 ) return;

            // Key nodes by caption, NOT tuple.key: the Source and Target slots are
            // different Cognos columns, so the same label (e.g. "Revenue") gets a
            // different tuple.key in each slot. Keying by caption merges them into
            // one node so flows chain through intermediate stages correctly.
            const sk = srcTup.caption, tk = tgtTup.caption;

            if ( !nodeMap.has( sk ) ) {
                nodeMap.set( sk, {
                    id: sk, caption: srcTup.caption, color: "",
                    totalIn: 0, totalOut: 0, value: 0, depth: 0,
                    x0: 0, x1: 0, y0: 0, y1: 0,
                    sourceLinks: [], targetLinks: [],
                } );
            }
            if ( !nodeMap.has( tk ) ) {
                nodeMap.set( tk, {
                    id: tk, caption: tgtTup.caption, color: "",
                    totalIn: 0, totalOut: 0, value: 0, depth: 0,
                    x0: 0, x1: 0, y0: 0, y1: 0,
                    sourceLinks: [], targetLinks: [],
                } );
            }

            if ( !sourceColorMap.has( sk ) ) {
                sourceColorMap.set( sk, palette.getFillColor( row ) );
            }

            nodeMap.get( sk )!.totalOut += val;
            nodeMap.get( tk )!.totalIn  += val;
            rawLinks.push( { sourceId: sk, targetId: tk, value: val } );
        } );

        // Assign colors: source nodes get their palette color; downstream nodes
        // inherit the color of their largest incoming flow's source.
        const colorByInflow = new Map<string, string>();
        rawLinks.forEach( rl => {
            if ( !colorByInflow.has( rl.targetId ) ) {
                colorByInflow.set( rl.targetId,
                    sourceColorMap.get( rl.sourceId ) || colorByInflow.get( rl.sourceId ) || "#6b7280" );
            }
        } );
        nodeMap.forEach( ( n, id ) => {
            n.color = sourceColorMap.get( id ) || colorByInflow.get( id ) || "#6b7280";
        } );

        // Wire up SLink objects
        const nodes: SNode[] = Array.from( nodeMap.values() );
        const links: SLink[] = rawLinks.map( rl => {
            const lk: SLink = {
                source: nodeMap.get( rl.sourceId )!,
                target: nodeMap.get( rl.targetId )!,
                value:  rl.value,
                width: 0, sy0: 0, ty0: 0,
            };
            lk.source.sourceLinks.push( lk );
            lk.target.targetLinks.push( lk );
            return lk;
        } );

        // --- Layout ---
        const iw = Math.max( w - MARGIN.left - MARGIN.right, 100 );
        const ih = Math.max( h - MARGIN.top  - MARGIN.bottom, 100 );
        computeLayout( nodes, links, iw, ih, nodeWidth, nodePad );

        const totalFlow = d3.sum( nodes.filter( n => n.targetLinks.length === 0 ), n => n.value );

        const gOff = `translate(${MARGIN.left},${MARGIN.top})`;

        const isActive    = ( id: string ) => !this._activeNode || id === this._activeNode;
        const isLinkActive = ( lk: SLink ) =>
            !this._activeNode ||
            lk.source.id === this._activeNode ||
            lk.target.id === this._activeNode;

        // --- Links ---
        const linksG = svg.select<SVGGElement>( ".sk-links" ).attr( "transform", gOff );
        const self = this;

        linksG.selectAll<SVGPathElement, SLink>( "path" )
            .data( links, lk => `${lk.source.id}->${lk.target.id}` )
            .join( "path" )
            .attr( "d", ribbonPath )
            .attr( "fill", lk => lk.source.color )
            .attr( "fill-opacity", lk => isLinkActive( lk ) ? flowOpacity : flowOpacity * 0.15 )
            .attr( "stroke", "none" )
            .on( "mouseover", function( lk: SLink ) {
                const rect = container.getBoundingClientRect();
                const mx = ( d3.event as MouseEvent ).clientX - rect.left + 12;
                const my = ( d3.event as MouseEvent ).clientY - rect.top  - 8;
                tooltip.style( "display", "block" )
                    .style( "left", mx + "px" ).style( "top", my + "px" )
                    .html( `<strong>${lk.source.caption} → ${lk.target.caption}</strong><br/>` +
                           `Value: ${d3.format( ",.0f" )( lk.value )}` );
            } )
            .on( "mouseout", () => tooltip.style( "display", "none" ) );

        // --- Nodes ---
        const nodesG = svg.select<SVGGElement>( ".sk-nodes" ).attr( "transform", gOff );

        const nodeGs = nodesG.selectAll<SVGGElement, SNode>( "g.sk-node" )
            .data( nodes, n => n.id )
            .join( enter => {
                const g = enter.append( "g" ).attr( "class", "sk-node" ).style( "cursor", "pointer" );
                g.append( "rect" );
                g.append( "text" );
                return g;
            } );

        nodeGs.attr( "transform", n => `translate(${n.x0},${n.y0})` );

        nodeGs.select( "rect" )
            .attr( "width",   n => n.x1 - n.x0 )
            .attr( "height",  n => Math.max( 1, n.y1 - n.y0 ) )
            .attr( "fill",    n => n.color )
            .attr( "opacity", n => isActive( n.id ) ? 1 : 0.15 )
            .attr( "rx", 2 );

        const isLeft = ( n: SNode ) => n.x0 < iw / 2;

        nodeGs.select( "text" )
            .attr( "font-size", 12 )
            .attr( "font-family", "Arial, sans-serif" )
            .attr( "fill", textColor )
            .attr( "opacity", n => isActive( n.id ) ? 1 : 0.2 )
            .attr( "dy", "0.35em" )
            .attr( "y", n => ( n.y1 - n.y0 ) / 2 )
            .attr( "x", n => isLeft( n ) ? -8 : nodeWidth + 8 )
            .attr( "text-anchor", n => isLeft( n ) ? "end" : "start" )
            .attr( "stroke", bgColor )
            .attr( "stroke-width", 3 )
            .attr( "stroke-linejoin", "round" )
            .attr( "paint-order", "stroke" )
            .text( n => {
                const parts: string[] = [];
                if ( showName )    parts.push( n.caption );
                if ( showValue )   parts.push( d3.format( ",.0f" )( n.value ) );
                if ( showPercent && totalFlow > 0 ) {
                    parts.push( d3.format( ".1%" )( n.value / totalFlow ) );
                }
                return parts.join( "  |  " );
            } );

        nodeGs
            .on( "click", function( n: SNode ) {
                self._activeNode = self._activeNode === n.id ? null : n.id;
                nodesG.selectAll<SVGGElement, SNode>( "g.sk-node" ).select( "rect" )
                    .attr( "opacity", d => isActive( d.id ) ? 1 : 0.15 );
                nodesG.selectAll<SVGGElement, SNode>( "g.sk-node" ).select( "text" )
                    .attr( "opacity", d => isActive( d.id ) ? 1 : 0.2 );
                linksG.selectAll<SVGPathElement, SLink>( "path" )
                    .attr( "fill-opacity", lk => isLinkActive( lk ) ? flowOpacity : flowOpacity * 0.15 );
            } )
            .on( "mouseover", function( n: SNode ) {
                const rect  = container.getBoundingClientRect();
                const elRect = ( this as SVGGElement ).getBoundingClientRect();
                tooltip.style( "display", "block" )
                    .style( "left", ( elRect.left - rect.left + nodeWidth + 8 ) + "px" )
                    .style( "top",  ( elRect.top  - rect.top ) + "px" )
                    .html(
                        `<strong>${n.caption}</strong>` +
                        ( n.totalIn  > 0 ? `<br/>In:  ${d3.format( ",.0f" )( n.totalIn )}`  : "" ) +
                        ( n.totalOut > 0 ? `<br/>Out: ${d3.format( ",.0f" )( n.totalOut )}` : "" )
                    );
            } )
            .on( "mouseout", () => tooltip.style( "display", "none" ) );
    }
}

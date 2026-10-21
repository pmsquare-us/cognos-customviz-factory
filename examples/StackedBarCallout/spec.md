# StackedBarCallout — spec

Vertical stacked bar chart where every segment value is always visible regardless of slab height.

## Slots

| Index | Name | Type | Required | Notes |
|---|---|---|---|---|
| 0 | `categories` | cat | yes | X axis / bar groups |
| 1 | `series` | cat + color channel | optional | Stack segments; drives legend + palette. Falls back to category coloring when unmapped. |
| 2 | `values` | cont | yes | Segment height / measure |

## Key features

**Always-on labels** — tall segments (≥ `labelMinHeight` px) get an inside badge label centered in the segment. Thin segments get a floating callout badge outside the bar, connected by a leader line.

**Global collision avoidance** — all labels (inside + callout, across all bars) share a single bounding-box registry. Callout placement searches left/right, expands Y outward from the natural segment midpoint, and extends the leader line up to 4 passes before falling back. Left-side placement is preferred when the bar is in the right half of the chart (more room on the left).

**Configurable label styling** — font size, inside text color, callout text color, badge fill, badge border all exposed as Cognos properties.

## Properties

| Name | Type | Default | Notes |
|---|---|---|---|
| `colors` | palette (cat) | — | Segment colors; slot = series |
| `showLabels` | boolean | true | Show/hide all labels |
| `labelMinHeight` | number | 16 px | Threshold below which a segment gets a callout instead of an inside label |
| `fontSize` | number | 11 px | Font size for all labels; also scales collision-box geometry |
| `insideColor` | color | #222222 | Inside badge text color |
| `calloutColor` | color | #222222 | Callout badge text color |
| `badgeFill` | color | white | Badge background for both label types |
| `badgeBorder` | color | #555555 | Badge border + callout leader line color |

## Architecture notes

- `StackedDatum` wraps `DataPoint` to carry `y0`/`y1` stacking offsets. `hitTest` unwraps it so the host can still deliver tooltips, selection, and highlight.
- `getSlotForPalette` falls back the `colors` palette to the `categories` slot when `series` is unmapped.
- Decorations-only fast path (`_info.reason.decorations && !data && !size && !properties`) recolors segments without re-running layout, keeping hover/select performance smooth.
- `renderBadge()` is a pure SVG helper — appends `<rect>` + `<text>` and returns `{ badgeW, badgeH }` for collision registration. Called identically for inside and callout labels.
- `charW = fontSize * 0.62` and `labelH = fontSize + 2 * BADGE_PY` keep collision geometry in sync with actual rendered text size when the user changes font size.

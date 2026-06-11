# Baseball Field — Schematic

Spray-chart of a baseball field. Data is mapped onto fielding-position regions; bind a count
measure to shade each region (heatmap) and filter by play outcome / batted-ball type.

## Region keys (`data-cv-key`)

These are the canonical category values — a bound dataset's position column must match **exactly**
(case + whitespace): standard position **abbreviations**.

```
P  C  1B  2B  3B  SS  LF  CF  RF
```

## Views (`data-cv-view`)

- `infield` — title "Infield" — P, C, 1B, 2B, 3B, SS
- `outfield` — title "Outfield" — LF, CF, RF

## Layout notes

Fair territory radiates from home plate (300,470). The outfield arc (r 205–410) splits into
LF/CF/RF thirds; the infield band (r 52–205) splits into five angular wedges — 3B, SS, **P
(up-the-middle)**, 2B, 1B — with the catcher as a pie at home (r 0–52). The pitcher is a wedge
(not a circle) so the infield tiles with no overlap; the mound is a thin decorative ring outline
so the P zone's gradient still shows through. Foul lines, baselines, bases, and mound ring are
unkeyed decoration drawn on top.

## Binding in Cognos

- **Category:** Position → drives region mapping
- **Measure:** Count of events → drives the color gradient
- **Filters:** Outcome (Hit / Out / Error), BattedBallType (Ground Ball / Line Drive / Fly Ball /
  Pop Up), BatterHand (R / L)
- **Tooltip extras:** avg ExitVelocity, avg Distance

## Test data

`baseball-test-data.csv` — 176 event-level rows. Columns: Position, Outcome, BattedBallType,
BatterHand, ExitVelocity, Distance. Regenerate with `workbench/BaseballField/gen-baseball-data.mjs`
(seeded/deterministic). Volume skews to CF/LF/SS and away from P/C; grounders cluster in the
infield, fly balls/line drives in the outfield, for a believable hot-zone pattern.

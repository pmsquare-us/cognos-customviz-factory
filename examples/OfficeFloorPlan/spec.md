# OfficeFloorPlan — schematic example

A worked Cognos **schematic** (annotated SVG, not a code visualization). An office floor plan
where each room is a region bound to data by name, grouped into three toggleable views.

## Data contract

Bind a dataset whose **category** column contains these exact values (they match `data-cv-key`):

| `data-cv-key` | View (`data-cv-view` / title) | SVG element |
|---|---|---|
| `Reception`   | `workspaces` / Workspaces       | `rect` |
| `Open Plan`   | `workspaces` / Workspaces       | `rect` |
| `Meeting A`   | `meeting_rooms` / Meeting Rooms | `rect` |
| `Meeting B`   | `meeting_rooms` / Meeting Rooms | `rect` |
| `Kitchen`     | `facilities` / Facilities       | `rect` |
| `Server Room` | `facilities` / Facilities       | `path` (closed, L-shaped) |

Add a measure (e.g., occupancy, temperature, headcount) and Cognos colors each region by value.
The decorative outer wall carries no `data-cv-key`, so it stays unbound.

## What it demonstrates

- `data-cv-key` on `rect` and on a **closed `<path>`** (the L-shaped Server Room ends with `Z`).
- Three `data-cv-view` groups with human-readable `title`s, toggleable via the Views icon.
- Composite items: each view `<g>` holds keyed regions plus decorative `<text>` labels (no keys).
- Presentation attributes only (no `class`/`<style>`).

## Build & deploy

```
node tools/validate-schematic-svg.mjs examples/OfficeFloorPlan/OfficeFloorPlan.svg
node tools/pack-schematic.mjs --name "Office Floor Plan" examples/OfficeFloorPlan/OfficeFloorPlan.svg
```

Upload the resulting `.zip` via *Manage → Customization → Custom visuals → Upload custom visual*,
then drag **Schematic preview** in a report and bind data. Use **Highlight regions** to confirm
all six rooms are mapped.

**Status:** validates clean and packs to the verified Cognos package format (CLI-free).
In-Cognos render pending user test.

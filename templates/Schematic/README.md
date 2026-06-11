# Schematic template

A minimal, known-good annotated SVG to start a new Cognos **schematic** from. Schematics are
*not* code visualizations — there is no `vizdef.xml`, `renderer/`, or `customvis` CLI. A
schematic is just an SVG whose elements are annotated to bind to data, packaged into a `.zip`.

See `docs/schematics-guide.md` for the full contract and workflow, or run
`/generate-cognos-schematic`.

## What `template.svg` demonstrates

- **`data-cv-key`** on each region (`A1`, `A2`, `B1`, `B2`). These strings must match the
  category values in the dataset you bind in Cognos.
- **`data-cv-view`** + **`title`** grouping regions into two toggleable views (`Wing A`, `Wing B`).
- **Presentation attributes** only (`fill`, `stroke`, …) — no `class`/`<style>` (Edge compatibility).
- Decorative `<text>` labels carried inside the view groups without their own keys (composite items).

## Start a new schematic from it

1. Copy `template.svg` into `workbench/` and reshape/redraw the geometry for your graphic
   (or generate a fresh SVG from a description/example image via the skill).
2. Rename each `data-cv-key` to the category value it represents; add/remove `data-cv-view`
   groups as needed.
3. Validate:  `node tools/validate-schematic-svg.mjs workbench/<your>.svg`
4. Package:   `node tools/pack-schematic.mjs --name "<Display Name>" workbench/<your>.svg`
5. Upload the resulting `.zip` via *Manage → Customization → Custom visuals → Upload custom visual*,
   then bind data in a report/dashboard (drag **Schematic preview**).

## Rules to keep it valid

- One `data-cv-key` and at most one `data-cv-view` per element; views cannot be nested.
- Every `<path>` must be closed (`z`/`Z`).
- Mappable elements: `circle, ellipse, line, path, polygon, polyline, rect, text, svg, g`.
- Not allowed: embedded JavaScript, `on*` handlers, `<a>` tags, external URI references, `DOCTYPE`.

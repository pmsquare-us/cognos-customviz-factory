# Cognos dev loop — browser debugging & deploy

Claude drives a real Chrome (Playwright MCP, configured in the repo's `.mcp.json`) to sign in to a
client's Cognos, watch a viz render live from `customvis start`, read its console, and upload
finished packages. This file is the runbook for that loop. The offline loop (no Cognos) lives in
`tools/harness/`. Use it first, because it's faster.

| File | Role |
|---|---|
| `playwright-mcp.mjs` | Launcher `.mcp.json` runs: pinned `@playwright/mcp` from the repo root, cross-platform. |
| `playwright-mcp.json` | Browser config: installed Chrome, headed, persistent profile in `.browser-profile/`, private/local-network-access checks off. |
| `../deploy-viz.mjs` | Headless upload/update for `apikey`/`native` auth. |
| `../../cognos.env.example` | Per-client settings template, copied to `.env.<client>`. |

Why Playwright and not the desktop app's built-in browser: Cognos's *Test visualization* widget
loads the bundle from `http://127.0.0.1:8585`, so the browser must run on the same machine as
`customvis start`. The launch flags also remove the manual `chrome://flags` step that Chrome
otherwise needs before an https Cognos page may call a localhost server.

## First run per client

1. `cp cognos.env.example .env.<client>` and set `COGNOS_URL` (up to `/bi`) and `COGNOS_AUTH`.
2. Once per machine: `npm install --prefix tools/cognos-dev`, which installs the pinned
   `@playwright/mcp`. Without it, the launcher falls back to `npx`, which can miss Claude Code's
   30 s MCP connect timeout. Then restart Claude Code in the repo (or `/mcp` → reconnect) and
   approve the `playwright` MCP server.
3. Claude opens `COGNOS_URL` in the Playwright window. **You sign in** (SSO or namespace login).
   Claude never types credentials. The session persists in `.browser-profile/`, so later sessions
   start signed in until the Cognos session expires.
4. Claude creates the **CV Dev Harness** dashboard (below) and writes its URL to
   `COGNOS_HARNESS_DASHBOARD`.
5. If `COGNOS_AUTH` is `apikey`/`native` and the endpoints aren't set yet, run **Endpoint
   discovery** once.

Profiles are per machine, and one profile can hold several clients' sign-ins. Each client server
is its own origin.

## CV Dev Harness dashboard (one per client)

A personal dashboard in My Folders that holds a *Test visualization* widget bound to sample data.
Claude creates it through the UI:

Steps, as done on CA 12.1 (pm2 sandbox, 2026-10):

1. Run `customvis start` in the viz folder first. The widget reads the slot list from it.
2. Upload `tools/cognos-dev/CV Dev Harness data.csv`, the generic sample: 3 categoricals
   (Product line, Region, Year) × 2 measures, 45 rows. Use *New → Upload files*, or the Cognos
   MCP `cognos_upload_file`.
3. In My content, right-click the CSV → **Create dashboard** → keep the blank template → **Create**.
   The CSV is already the source. (`?perspective=dashboard&isNew=true` does not create one.)
4. Open the Visualizations panel (left rail) → **Custom** tab → *Developer widgets* → click
   **Test visualization**, which adds it to the canvas. The Fields panel then lists the slots of
   the viz being served.
5. Drag columns onto the slots (`browser_drag` from the source tree to the slot drop zone).
6. Enlarge the widget by dragging its bottom-right handle. `browser_run_code_unsafe` with
   `page.mouse` down/move/up works, and the default size is too small to read.
7. Save (toolbar save icon) → **My content** tab → name **CV Dev Harness** → Save. Record the URL
   in `COGNOS_HARNESS_DASHBOARD` in this form:
   `<COGNOS_URL>/?perspective=dashboard&id=<storeId>&objRef=<storeId>&boardId=<storeId>&isAuthoringMode=false`.
   Plain `?objRef=<storeId>` and `?perspective=dashboard&id=<storeId>` both bounce to home.

The slot bindings belong to the widget, so a viz with a different slot list needs rebinding in
edit mode through the Fields panel.

Notes:
- `fetch` calls from the page to `/v1/...` need
  `X-XSRF-TOKEN: <XSRF-TOKEN cookie>`, or they return 403.
- The Test visualization widget shows "This is a preview…" over the viz. That's expected.

## Iteration loop (in Cognos)

1. `customvis start` in the viz folder, run in the background (port 8585, rebuilds on save).
2. `browser_navigate` → `COGNOS_HARNESS_DASHBOARD`.
3. Click the widget's **Refresh visualization** toolbar button after each rebuild.
4. Read results:
   - `browser_console_messages`: errors, plus the viz's own `console.log` lines. Prefix
     debug logs with the viz name to filter them.
   - `browser_take_screenshot`: the rendered widget.
   - `browser_snapshot` for the accessibility tree when clicking a specific mark.
5. Check what the offline harness can't: host tooltips, selection/highlight across widgets,
   the legend, the properties panel (`updateProperty` / `setActive`), and real formatting/locale.

If the widget shows *"Unable to connect"*, `customvis start` isn't running, or Chrome still
blocked the localhost call. Confirm the Playwright browser was launched by this repo's config.

**Selectors drift between CA versions.** When a step above stops matching the UI, fix it here
(the text, not code). Note the CA version next to anything version-specific.

## Upload via the browser (SSO, or before endpoints are known)

1. *Manage* → *Customization* → **Custom visuals** tab (schematics: **Schematics** tab, where the
   version has one).
2. New visual: **Upload custom visual** → `browser_file_upload` with the `.packed.zip` /
   `.schematic.zip` path. Existing visual: its row's ⋯ menu → **Update** → same file. Update keeps
   permissions and dashboard references, and a new upload with the same id is rejected.
3. Confirm the row shows the new version (bump `meta.version` in `package.json` to make that visible).

First upload of a package to a client environment: ask the user before clicking Upload, because
it publishes code to their server. Updates of a package already there don't need asking.

## Endpoint discovery (once per CA version)

CA's public REST API (`/api/v1`, OpenAPI at `<COGNOS_URL>/api/api-docs/`) has no custom-visual
endpoint. Checked on CA 12.1, it offers `extensions` and `themes` but not visuals. The Manage page
calls an internal endpoint instead, so capture it:

1. Do one **Upload via the browser** (above) with `browser_network_requests` open around the click.
2. Find the upload request (zip body or multipart form). Record its method and path relative to
   `COGNOS_URL` as `COGNOS_VIZ_UPLOAD`. Do the same for **Update** → `COGNOS_VIZ_UPDATE` (replace
   the package id in the path with `{id}`), and for the list fetch when the tab opens →
   `COGNOS_VIZ_LIST`.
3. If the body was a form, set `COGNOS_VIZ_UPLOAD_FORMAT=multipart` and the field name.
4. Test: `node tools/deploy-viz.mjs --env <client> <viz> --dry-run`, then a real run.
5. Write the captured values (no credentials) into the table below for other clients on that version.

| CA version | COGNOS_VIZ_UPLOAD | COGNOS_VIZ_UPDATE | COGNOS_VIZ_LIST | format |
|---|---|---|---|---|
| 12.1 (pm2 sandbox, 2026-10) | `POST /v1/visualizations?maskResponses=true&updateAction=FAIL` | `PUT /v1/visualizations/id/{id}` | `GET /v1/visualizations/custom?ps=65536` | zip |

CA 12.1 notes:
- Both writes take the raw package as `Content-Type: application/zip`, for custom visuals and
  schematics alike.
- The list returns `[{ id, name, type, storeId, modificationTime, … }]`.
  `GET /v1/visualizations/<id>/content/meta.json` reads one visual's meta.
- An update keeps the visual's `storeId`, so permissions and dashboard references survive.
- Verified headless with an API key: Lollipop 1.0 was updated to 1.1 in place.
- **XSRF:** `/v1` writes need an `X-XSRF-TOKEN` header equal to an `XSRF-TOKEN` cookie (double
  submit). An API-key session isn't issued that cookie, and without it writes return 403, so
  `deploy-viz.mjs` mints one.
- If another version's update path takes the content store id, write it as `{storeId}`.
  `deploy-viz.mjs` fills it in from the list.

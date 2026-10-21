// mock-host.js — a minimal stand-in for the Cognos (VIPR) host, so a built custom viz bundle
// (build/renderer/Main.js) can render offline from fixture data.
//
// The host contract was read from customvis-lib's RenderBase (the lib is bundled into Main.js;
// only d3 v5 is an external). RenderBase implements VIPR IRenderingService and calls back into
// host objects for: properties (Map of {type,value,peek,active,dirty,setActive}), palettes
// (getTupleColor/getColor/getColorStops), and the data set (getSlots/dataPoints/decorations).
// This file implements just those calls — nothing IBM-authored is copied here.
//
// Page API for automation (Playwright `evaluate`):
//   window.__harness.status        "loading" | "ready" | "error"
//   window.__harness.errors        array of error strings (also logged as "[harness] ...")
//   window.__harness.renders       completed render count
//   window.__harness.setProp(n, v) set a property (vizdef value syntax, e.g. "12px", "#ff0000", true)
//   window.__harness.select(rows)  select data points by row index ([] clears)
//   window.__harness.resize(w, h)  resize the viz surface
//   window.__harness.rerender()    full re-render (data + properties + size)

(function () {
  "use strict";

  const qs = new URLSearchParams(location.search);
  const state = (window.__harness = { status: "loading", errors: [], renders: 0 });
  const $ = (sel) => document.querySelector(sel);
  const log = (...a) => console.log("[harness]", ...a);

  function record(err) {
    const msg = (err && (err.stack || err.message)) || String(err);
    state.errors.push(msg);
    state.status = "error";
    console.error("[harness] " + msg);
    setStatus("error", msg.split("\n")[0]);
  }
  window.addEventListener("error", (e) => record(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => record(e.reason));

  function setStatus(kind, text) {
    const el = $("#status");
    if (!el) return;
    el.dataset.status = kind;
    el.textContent = text;
  }

  // ---- colors ----

  class MockColor {
    constructor(r, g, b, a) {
      this.r = r; this.g = g; this.b = b; this.a = a === undefined ? 1 : a;
    }
    toString() {
      return this.a === 1 ? `rgb(${this.r},${this.g},${this.b})` : `rgba(${this.r},${this.g},${this.b},${this.a})`;
    }
  }
  // Resolve any CSS color (hex, rgb(), named) through the browser.
  function parseColor(str) {
    const el = document.createElement("div");
    el.style.color = str;
    document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/[\d.]+/g) || [0, 0, 0];
    el.remove();
    return new MockColor(+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]);
  }
  const CAT_COLORS = ["#4178be", "#5aa700", "#8c6dc6", "#e8541f", "#00a6a0", "#c72f81",
    "#efc100", "#734098", "#3c6df0", "#ff7832", "#9b8a75", "#6e7c85"];
  const catColor = (i) => parseColor(CAT_COLORS[((i % CAT_COLORS.length) + CAT_COLORS.length) % CAT_COLORS.length]);

  // ---- vizdef parsing ----

  function parseVizdef(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const slots = new Map();
    doc.querySelectorAll("slots > slot").forEach((s) => {
      slots.set(s.getAttribute("name"), {
        name: s.getAttribute("name"),
        caption: s.getAttribute("caption") || s.getAttribute("name"),
        type: s.getAttribute("type"),
        optional: s.getAttribute("optional") === "true",
        channels: (s.getAttribute("channel") || "").split(",").map((c) => c.trim()).filter(Boolean),
      });
    });
    const refs = [...doc.querySelectorAll("dataSets > dataSet > ref")].map((r) => r.getAttribute("slot"));
    const props = [];
    doc.querySelectorAll("properties *[name]").forEach((p) => {
      if (p.tagName === "group") return;
      props.push({
        name: p.getAttribute("name"),
        caption: p.getAttribute("caption") || p.getAttribute("name"),
        type: p.tagName,
        defaultValue: p.getAttribute("defaultValue"),
        slot: p.getAttribute("slot"),
        paletteType: p.getAttribute("type"),
        possibleValues: [...p.querySelectorAll("possibleValue")].map((v) => v.textContent.trim()),
      });
    });
    return { slots, refs: refs.length ? refs : [...slots.keys()], props };
  }

  // Convert a vizdef-style value ("12px", "#f00", "bold 16px Arial", "true") to the host's value shape.
  function toHostValue(type, raw) {
    if (raw === null || raw === undefined) return null;
    switch (type) {
      case "boolean": return raw === true || raw === "true";
      case "number": return raw === "" ? null : Number(raw);
      case "length": {
        if (typeof raw === "object") return raw;
        const m = String(raw).match(/^\s*(-?[\d.]+)\s*(px|em|%|cm|mm|in|pc|pt)?\s*$/);
        return m ? { value: Number(m[1]), unit: m[2] || "px" } : null;
      }
      case "color": {
        const c = typeof raw === "object" ? raw : parseColor(raw);
        return { r: c.r, g: c.g, b: c.b, a: c.a };
      }
      case "font": {
        if (typeof raw === "object") return raw;
        const s = String(raw);
        const size = s.match(/(-?[\d.]+)(px|em|%|pt)/);
        const weight = /\bbold\b/.test(s) ? 700 : (s.match(/\b([1-9]00)\b/) || [])[1];
        const family = s.replace(/\b(bold|italic|normal|[1-9]00)\b/g, "").replace(size ? size[0] : "", "").trim();
        return {
          family: family ? family.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")) : null,
          size: size ? { value: Number(size[1]), unit: size[2] } : null,
          style: /\bitalic\b/.test(s) ? "italic" : "normal",
          weight: weight ? Number(weight) : 400,
        };
      }
      default: return String(raw);
    }
  }

  // ---- properties ----

  function makeCatPalette(p) {
    return {
      type: "palette", paletteType: "cat", name: p.name, slot: p.slot || null, dirty: false, active: true,
      value: null, peek: null, setActive(b) { this.active = b; },
      getTupleColor: (tuple) => catColor(tuple && tuple.index !== undefined ? tuple.index : 0),
      getColor: () => catColor(0),
    };
  }

  function makeContPalette(p) {
    // defaultValue "red 0%;green 50%;blue 100%" → stops; fall back to a light→dark blue ramp.
    const spec = (p.defaultValue || "#c6dbef 0%;#08306b 100%").split(";").map((s) => s.trim()).filter(Boolean)
      .map((s) => { const m = s.match(/^(.*?)\s+(-?[\d.]+)%$/); return m ? { color: parseColor(m[1]), at: m[2] / 100 } : { color: parseColor(s), at: 0 }; });
    return {
      type: "palette", paletteType: "cont", name: p.name, slot: p.slot || null, dirty: false, active: true,
      value: null, peek: null, setActive(b) { this.active = b; },
      getColorStops(dataItem) {
        const d = dataItem ? dataItem.getDomain() : { min: 0, max: 1 };
        const span = d.max - d.min || 1;
        const stops = spec.map((s) => ({ color: s.color, at: s.at, value: d.min + s.at * span }));
        return {
          stops, aligned: stops, interpolate: true,
          getColor(v) {
            const t = Math.max(0, Math.min(1, (Number(v) - d.min) / span));
            let i = 0;
            while (i < stops.length - 2 && t > stops[i + 1].at) i++;
            const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
            const f = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
            const mix = (x, y) => Math.round(x + (y - x) * f);
            return new MockColor(mix(a.color.r, b.color.r), mix(a.color.g, b.color.g), mix(a.color.b, b.color.b), 1);
          },
        };
      },
    };
  }

  function makeProperties(def, overrides) {
    const map = new Map();
    for (const p of def.props) {
      if (p.type === "palette") {
        map.set(p.name, p.paletteType === "cont" ? makeContPalette(p) : makeCatPalette(p));
        continue;
      }
      const raw = p.name in overrides ? overrides[p.name] : p.defaultValue;
      const v = toHostValue(p.type, raw);
      map.set(p.name, { type: p.type, name: p.name, value: v, peek: v, active: true, dirty: false, setActive(b) { this.active = b; } });
    }
    return map;
  }

  // ---- data ----

  function decorated(obj) {
    obj.decorations = {};
    obj.getDecoration = function (n, dflt) { return n in this.decorations ? this.decorations[n] : dflt; };
    obj.hasDecoration = function (n) { return n in this.decorations; };
    return obj;
  }

  function buildDataSet(def, fx) {
    const mapping = fx.mapping || {};
    const rows = fx.rows || [];
    const ds = decorated({ dataPoints: [] });
    const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : String(v));

    const slots = def.refs.map((name) => {
      const sd = def.slots.get(name) || { name, caption: name, type: "cat", channels: [] };
      const mapped = name in mapping;
      const caption = mapped ? mapping[name] || sd.caption : sd.caption;
      const slot = {
        name, mapped, channels: sd.channels, dataItems: [],
        isMapped() { return this.mapped; },
        getDataItem(i) { return this.dataItems[i] || null; },
      };
      if (!mapped) return slot;
      const segment = decorated({ getUniqueName: () => name, getCaption: () => caption });
      if (sd.type === "cont") {
        const vals = rows.map((r) => Number(r[name])).filter((v) => !isNaN(v));
        const domain = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
        domain.getMin = () => domain.min; domain.getMax = () => domain.max;
        domain.isEmpty = () => vals.length === 0; domain.isExplicit = () => false;
        const item = {
          type: "cont", valueType: "numeric", getRSType: () => "cont", getCaption: () => caption,
          getDomain: () => domain, getItemClass: () => segment, getDataSet: () => ds,
          getFormatter: () => ({ format: fmt }), asCat: () => null, asCont() { return this; },
        };
        slot.dataItems.push(item);
      } else {
        const item = {
          type: "cat", getRSType: () => "cat", getCaption: () => caption, getDataSet: () => ds,
          getFormatter: () => null, asCat() { return this; }, asCont: () => null,
          getItemClassSet: () => ({ getItemClasses: () => [segment] }),
          getTuples() { return this.tuples; },
        };
        const seen = new Map();
        for (const r of rows) {
          const k = r[name] === undefined || r[name] === null ? "" : String(r[name]);
          if (!seen.has(k)) {
            const index = seen.size;
            seen.set(k, decorated({ index, getKey: () => k, getCaption: () => k, getUniqueName: () => k, getItems: () => [], getDataItem: () => item }));
          }
        }
        item.tuples = [...seen.values()];
        item._byKey = seen;
        slot.dataItems.push(item);
      }
      return slot;
    });

    rows.forEach((r, rowIndex) => {
      const vals = new Map();
      const keyParts = [];
      for (const slot of slots) {
        if (!slot.mapped) continue;
        const item = slot.dataItems[0];
        const raw = r[slot.name];
        if (item.type === "cat") {
          // The host always gives a data point a member for every mapped cat slot; a null
          // category arrives as a member with an empty key/caption, not as a missing value.
          const t = item._byKey.get(raw === undefined || raw === null ? "" : String(raw));
          keyParts.push(t.getKey());
          vals.set(slot, { asCat: () => ({ index: t.index }), asCont: () => null, getCaption: () => t.getCaption() });
        } else {
          if (raw === undefined || raw === null) continue; // null measure: value(i) → null, as in Cognos
          const n = Number(raw);
          vals.set(slot, { asCat: () => null, asCont: () => ({ valueType: "numeric", value: n }), getCaption: () => fmt(n) });
        }
      }
      const key = keyParts.length ? keyParts.join("|") : String(rowIndex);
      ds.dataPoints.push(decorated({
        rowIndex, getKey: () => key, get: (slot) => vals.get(slot) || null, getDataSet: () => ds, _vals: vals,
      }));
    });

    ds.getSlots = () => slots;
    ds.getSlot = (n) => slots.find((s) => s.name === n) || null;
    ds.hasDecorationOnDataPoints = (n) => ds.dataPoints.some((dp) => dp.getDecoration(n, false));
    return ds;
  }

  // Deterministic sample data from the vizdef when no fixture exists: every required slot mapped,
  // optional slots left unmapped (the case renderers most often forget to handle).
  function autoFixture(def) {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const required = def.refs.map((n) => def.slots.get(n)).filter((s) => s && !s.optional);
    const cats = required.filter((s) => s.type === "cat");
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];
    const sizes = cats.map((_, i) => (i === 0 ? 6 : 3));
    const combos = [[]];
    cats.forEach((c, i) => {
      const next = [];
      for (const combo of combos) for (let j = 0; j < sizes[i]; j++) next.push([...combo, `${names[j]}${i ? " " + (i + 1) : ""}`]);
      combos.splice(0, combos.length, ...next.slice(0, 120));
    });
    const rows = combos.map((combo) => {
      const r = {};
      cats.forEach((c, i) => (r[c.name] = combo[i]));
      required.filter((s) => s.type === "cont").forEach((s) => (r[s.name] = Math.round(10 + rand() * 90)));
      return r;
    });
    const mapping = {};
    required.forEach((s) => (mapping[s.name] = s.caption));
    return { mapping, rows };
  }

  // ---- render loop ----

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.text();
  }

  async function main() {
    const surface = $("#surface");
    const w = Number(qs.get("w")) || 800, h = Number(qs.get("h")) || 500;
    surface.style.width = w + "px";
    surface.style.height = h + "px";

    let vizdefText;
    try {
      vizdefText = await fetchText("/viz/vizdef.xml");
    } catch (e) {
      throw new Error("No build found — run `customvis build` in the viz folder first. (" + e.message + ")");
    }
    const def = parseVizdef(vizdefText);
    const fixtures = JSON.parse(await fetchText("/fixtures/index.json"));
    const fixtureName = qs.get("fixture") || fixtures[0] || "auto";
    const fx = fixtureName === "auto" ? autoFixture(def) : JSON.parse(await fetchText(`/fixtures/${fixtureName}.json`));
    buildToolbar(def, fixtures, fixtureName, fx);

    const nlsStrings = await new Promise((resolve) => requirejs(["nls/root/Resources"], resolve, () => resolve({})));
    const Main = await new Promise((resolve, reject) => requirejs(["renderer/Main"], resolve, reject));
    const Ctor = Main && Main.default ? Main.default : Main;
    const renderer = new Ctor();
    const props = makeProperties(def, fx.props || {});
    const ds = buildDataSet(def, fx);
    (fx.selected || []).forEach((i) => ds.dataPoints[i] && (ds.dataPoints[i].decorations.selected = true));
    syncSelection(ds);
    log(`viz loaded · fixture "${fixtureName}" · ${ds.dataPoints.length} rows · ${w}×${h}`);

    let busy = Promise.resolve();
    const render = (reason) => (busy = busy.then(() => new Promise((resolve) => {
      renderer.render({}, reason, {
        complete() { state.renders++; state.status = state.errors.length ? "error" : "ready"; if (!state.errors.length) setStatus("ready", `rendered ×${state.renders}`); resolve(); },
        error(e) { record(e); resolve(); },
      });
    })));

    await new Promise((resolve, reject) => renderer.init(
      { surface, properties: props, dataContext: ds, nls: { get: (k) => nlsStrings[k] }, locale: "en-us" },
      { complete: resolve, fail: reject },
    ));
    renderer.setData({ dataSets: [ds] });
    await render({ data: true, decorations: true, properties: true, size: true });

    // Selection: click selects (ctrl/cmd adds), empty space clears — same feel as the dashboard.
    surface.addEventListener("click", (ev) => {
      const r = surface.getBoundingClientRect();
      const hits = renderer.getItemsAtPoint({ x: ev.clientX, y: ev.clientY }, { x: ev.clientX - r.left, y: ev.clientY - r.top }, 2) || [];
      const dps = hits.filter((hsrc) => ds.dataPoints.includes(hsrc));
      const additive = ev.ctrlKey || ev.metaKey;
      if (!additive) ds.dataPoints.forEach((dp) => delete dp.decorations.selected);
      for (const dp of dps) {
        if (additive && dp.getDecoration("selected", false)) delete dp.decorations.selected;
        else dp.decorations.selected = true;
      }
      syncSelection(ds);
      render({ decorations: true });
    });

    // Tooltip: what the host would show for the hit data point.
    const tip = $("#tooltip");
    surface.addEventListener("mousemove", (ev) => {
      const r = surface.getBoundingClientRect();
      const hits = renderer.getItemsAtPoint({ x: ev.clientX, y: ev.clientY }, { x: ev.clientX - r.left, y: ev.clientY - r.top }, 2) || [];
      const dp = hits.find((hsrc) => ds.dataPoints.includes(hsrc));
      if (!dp) { tip.hidden = true; return; }
      tip.innerHTML = "";
      for (const [slot, v] of dp._vals) {
        const row = document.createElement("div");
        row.textContent = `${slot.dataItems[0].getCaption()}: ${v.getCaption()}`;
        tip.appendChild(row);
      }
      tip.style.left = ev.clientX + 12 + "px";
      tip.style.top = ev.clientY + 12 + "px";
      tip.hidden = false;
    });
    surface.addEventListener("mouseleave", () => (tip.hidden = true));

    state.setProp = (name, raw) => {
      const p = props.get(name);
      if (!p) throw new Error(`unknown property "${name}"`);
      p.value = p.peek = toHostValue(p.type, raw);
      p.dirty = true;
      renderer.setProperty(name, p.value);
      return render({ properties: true }).then(() => { p.dirty = false; });
    };
    state.select = (rowIndexes) => {
      ds.dataPoints.forEach((dp) => delete dp.decorations.selected);
      rowIndexes.forEach((i) => ds.dataPoints[i] && (ds.dataPoints[i].decorations.selected = true));
      syncSelection(ds);
      return render({ decorations: true });
    };
    state.resize = (nw, nh) => {
      surface.style.width = nw + "px";
      surface.style.height = nh + "px";
      return render({ size: true });
    };
    state.rerender = () => render({ data: true, decorations: true, properties: true, size: true });
    state.legend = () => renderer.getEncodings().map((e) => ({
      type: e.getRSType(), channel: e.getChannel(), slot: e.getSlot(), caption: e.getCaption(),
      entries: e.getEntries ? e.getEntries().map((x) => x.getCaption()) : undefined,
    }));
    buildPropPanel(def, props, state.setProp);
  }

  function syncSelection(ds) {
    const any = ds.dataPoints.some((dp) => dp.getDecoration("selected", false));
    ds.decorations.hasSelection = any;
    // Tuples are selected when every data point that carries them is selected.
    for (const slot of ds.getSlots()) {
      const item = slot.mapped && slot.dataItems[0];
      if (!item || item.type !== "cat") continue;
      for (const t of item.tuples) {
        const dps = ds.dataPoints.filter((dp) => { const v = dp.get(slot); return v && v.asCat().index === t.index; });
        if (any && dps.length && dps.every((dp) => dp.getDecoration("selected", false))) t.decorations.selected = true;
        else delete t.decorations.selected;
      }
    }
  }

  // ---- chrome (hidden with ?embed=1) ----

  function buildToolbar(def, fixtures, current, fx) {
    const bar = $("#fixture");
    if (!bar) return;
    for (const name of [...fixtures, "auto"]) {
      const o = document.createElement("option");
      o.value = o.textContent = name;
      o.selected = name === current;
      bar.appendChild(o);
    }
    bar.addEventListener("change", () => { qs.set("fixture", bar.value); location.search = qs.toString(); });
    $("#rows").textContent = `${(fx.rows || []).length} rows · slots: ${def.refs.map((n) => (n in (fx.mapping || {}) ? n : `(${n})`)).join(", ")}`;
  }

  function buildPropPanel(def, props, setProp) {
    const panel = $("#props");
    if (!panel) return;
    for (const p of def.props) {
      if (p.type === "palette") continue;
      const label = document.createElement("label");
      label.textContent = p.caption + " ";
      let input;
      const cur = props.get(p.name).value;
      if (p.type === "boolean") {
        input = document.createElement("input"); input.type = "checkbox"; input.checked = !!cur;
        input.addEventListener("change", () => setProp(p.name, input.checked));
      } else if (p.type === "enum") {
        input = document.createElement("select");
        for (const v of p.possibleValues) { const o = document.createElement("option"); o.value = o.textContent = v; o.selected = v === cur; input.appendChild(o); }
        input.addEventListener("change", () => setProp(p.name, input.value));
      } else {
        input = document.createElement("input");
        input.size = 10;
        input.value = p.type === "length" && cur ? `${cur.value}${cur.unit}` : p.type === "color" || p.type === "font" ? p.defaultValue || "" : cur === null ? "" : cur;
        input.addEventListener("change", () => setProp(p.name, input.value));
      }
      label.appendChild(input);
      panel.appendChild(label);
    }
  }

  main().catch(record);
})();

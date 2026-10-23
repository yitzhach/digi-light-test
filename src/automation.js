// automation.js — `window.digilight`: the app driven by a script or an AI agent.
//
// Everything a person does through the panel, as awaitable calls: open a photo or a
// project, Analyze and apply a look, read or set any setting by name, render the preview
// or a full-size export as a data URL or Blob, save the project. Each change is one undo
// step and is checked exactly as an imported project is (studio.js validate), so an agent
// cannot put the app in a state the panel could not reach.
//
// Bridges: URL parameters (?image=, ?project=, ?sample=, ?set=, ?look=, ?analyze) run once
// on open; with ?bridge the page also answers postMessage calls from the page that framed
// or opened it ({digilight: id, method, args} → {digilight: id, result} | {digilight: id,
// error}). tools/digilight-cli.cjs drives the same API headless. See docs/automation.md.
import { ADJUSTMENTS } from './adjust.js';
import { OVERLAYS } from './overlays.js';
import { imageMetrics, pictureStats } from './measure.js';
import { drawResampled } from './resample.js';
import { changeMap } from './changemap.js';

export const API_VERSION = 1;
const clone = (v) => structuredClone(v);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const MIME = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
// Per-light fields and their ranges, as studio.js validate checks them.
const LIGHT_FIELDS = [['x', 'Across (painting widths, 0 left … 1 right)'], ['y', 'Up (0 bottom … 1 top)'], ['z', 'Height out from the wall'],
  ['power', 'Power'], ['kelvin', 'Colour temperature (K), with useKelvin 1'], ['cone', 'Beam cone'], ['softness', 'Softness'], ['falloff', 'Falloff'],
  ['aimX', 'Aim across'], ['aimY', 'Aim up'], ['size', 'Lamp size'], ['lift', 'Shadow lift (−1 … 1)'], ['enabled', 'On (true/false)'], ['useKelvin', 'Use colour temperature'], ['hex', 'Colour (#rrggbb)'],
  ['kind', 'Kind: light, shade (a soft shadow: less light where it falls) or negative (a lamp in reverse)'], ['dark', 'Darkness of a shade (0–1)'],
  ['shape', 'Shape of a shade: pool, window, blinds or leaves'], ['patternSize', 'Shape size (0.25–4)'], ['patternRot', 'Shape turn (0–360°)']];
const GRAZE_FIELDS = [['enabled', 'Visible', 'grazeVis'], ['angle', 'Direction (0° from the right, 90° top)', null, 0, 359.9], ['elevation', 'Angle to wall', 'grazeElevation'],
  ['opacity', 'Opacity', 'grazeOpacity'], ['detail', 'Detail', 'grazeDetail'], ['fine', 'Fine', 'grazeFine'], ['reach', 'Shadow length', 'grazeReach'],
  ['clean', 'Clean shadows', 'grazeClean'], ['soft', 'Softness', 'grazeSoft'], ['lift', 'Shadow lift', 'grazeLift'], ['fill', 'Room light', null, 0, null], ['grey', 'Grey surface', null, 0, 1],
  ['sun', 'Sun: one direction everywhere, even, Angle to wall up to 60° (true/false)']];

/** Reads `path` ("exposure", "graze.opacity", "lights.0.power", "adjust.relief.form") in `obj`. */
export function getPath(obj, path) {
  let o = obj;
  for (const k of String(path).split('.')) { if (o == null || typeof o !== 'object' || !(k in o)) return undefined; o = o[k]; }
  return o;
}
/** Sets `path` in `obj` in place; the parent must exist (unknown names are an error). */
export function setPath(obj, path, value) {
  const ks = String(path).split('.'), last = ks.pop();
  let o = obj;
  for (const k of ks) { if (o == null || typeof o !== 'object' || !(k in o)) throw new Error(`Unknown setting "${path}".`); o = o[k]; }
  if (o == null || typeof o !== 'object' || (Array.isArray(o) && !(last in o))) throw new Error(`Unknown setting "${path}".`);
  if (!ks.length && !(last in o)) throw new Error(`Unknown setting "${path}". digilight.describe() lists them.`);
  o[last] = value;
}
// "a=1;b.c=0.5" or JSON {"a":1} (the ?set= parameter and the CLI's --set).
export function parseSets(text) {
  const t = String(text || '').trim();
  if (!t) return {};
  if (t.startsWith('{')) return JSON.parse(t);
  const out = {};
  for (const part of t.split(/[;&]/)) {
    const i = part.indexOf('='); if (i < 1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    out[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && Number.isFinite(+v) ? +v : v;
  }
  return out;
}

export function initAutomation({ state, api, snapshot, restore, checkpoint, validate, history, auto, project, openProject, presets, guard, lamp, $ }) {
  // One call at a time: each waits for the one before (a render during an Analyze would see its trial looks).
  let queue = Promise.resolve();
  const serial = (fn) => (...args) => { const run = queue.then(() => fn(...args)); queue = run.catch(() => {}); return run; };
  const idle = async () => { await frame(); await frame(); };
  const needPhoto = () => { if (!api.source()) throw new Error('No photo open. Call digilight.load(...) first.'); };

  function asImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      const url = src instanceof Blob ? URL.createObjectURL(src) : String(src);
      im.onload = () => { if (src instanceof Blob) URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => reject(new Error('The image could not be opened (is the URL reachable, and does it allow cross-origin use?).'));
      im.src = url;
    });
  }
  async function load(src) {
    if (src && typeof src === 'object' && !(src instanceof Blob) && src.sample) {
      const pick = $('samplePick');
      if (![...pick.options].some((o) => o.value === src.sample)) throw new Error(`Unknown sample "${src.sample}".`);
      const w = api.canvas.width, h = api.canvas.height, was = api.source();
      pick.value = src.sample; pick.dispatchEvent(new Event('change'));
      for (let t = 0; t < 600 && api.source() === was; t++) await new Promise((r) => setTimeout(r, 50));
      if (api.source() === was && api.canvas.width === w && api.canvas.height === h) throw new Error('The sample did not open.');
    } else {
      if (src == null || src === '') throw new Error('load() needs an image URL, data URL, Blob or {sample}.');
      await api.openSource(await asImage(src));
    }
    await idle(); api.renderNow();
    return info();
  }
  function info() {
    const s = api.source();
    return { version: API_VERSION, photo: s ? { width: s.naturalWidth || s.width, height: s.naturalHeight || s.height } : null,
      preview: { width: api.canvas.width, height: api.canvas.height }, sample: api.sample?.() || null, mode: state.mode,
      measuredRelief: !!api.measured?.get?.()?.on, undo: history.index > 0, redo: history.index < history.entries.length - 1 };
  }

  // Settings: the same object a project saves.
  const settings = () => clone(snapshot());
  function apply(next) {
    const checked = validate({ format: 'digilight', version: 1, image: 'data:image/png;base64,', settings: next });
    restore(checked); checkpoint();
    guarded();
  }
  // Every change here is guarded (guard.js) unless setGuard(false): whites and darks brought
  // back under the limits in the same undo step. lastGuard() says what it did.
  const guarded = () => guard?.afterOneTap() ?? null;
  function set(pathOrObj, value) {
    const changes = typeof pathOrObj === 'string' ? { [pathOrObj]: value } : pathOrObj;
    if (!changes || typeof changes !== 'object') throw new Error('set() takes (path, value) or {path: value, ...}.');
    const s = settings();
    for (const [p, v] of Object.entries(changes)) setPath(s, p, v);
    try { apply(s); } catch (e) { throw new Error(`${e.message.replace(/\.$/, '')}: nothing changed (asked ${JSON.stringify(changes)}; digilight.describe() lists the ranges).`); }
    return Object.fromEntries(Object.keys(changes).map((p) => [p, getPath(snapshot(), p)]));
  }
  // + Light / + Shadow: a new light (kind 'light') or Shadow light ('shade', 'negative'), with any fields changed.
  function addLight(kind = 'light', props = {}) {
    if (!['light', 'shade', 'negative'].includes(kind)) throw new Error('kind is light, shade or negative.');
    const s = settings();
    if (s.lights.length >= 8) throw new Error('There are 8 lights already, the most there can be.');
    const l = { ...api.makeLight(kind), ...props };
    delete l.rgb;
    s.lights.push(l); s.selected = s.lights.length - 1;
    try { apply(s); } catch (e) { throw new Error(`${e.message.replace(/\.$/, '')}: no light added.`); }
    return { index: s.lights.length - 1, light: clone(snapshot().lights[s.lights.length - 1]) };
  }
  function removeLight(index) {
    const s = settings();
    if (!(index >= 0 && index < s.lights.length)) throw new Error(`No light ${index}; there are ${s.lights.length} (from 0).`);
    if (s.lights.length <= 1) throw new Error('The last light cannot be removed; turn it off with lights.0.enabled = false.');
    s.lights.splice(index, 1); s.selected = Math.min(s.selected, s.lights.length - 1);
    apply(s);
    return { lights: s.lights.length };
  }
  // What can be set: name, label, range (where the panel has one) and current value.
  function describe() {
    const now = snapshot(), out = [];
    const range = (id) => { const el = id && $(id); return el && el.type === 'range' ? { min: +el.min, max: +el.max, step: +el.step } : {}; };
    const label = (id) => { const el = id && $(id); return (document.querySelector(`label[for="${id}"]`) || el?.closest('.row')?.querySelector('label'))?.textContent.trim() || null; };
    const idOf = { azimuthDeg: 'azimuth', integrateTaps: 'taps' };
    for (const [k, v] of Object.entries(now)) {
      if (typeof v !== 'number') continue;
      const id = idOf[k] || k;
      out.push({ path: k, label: label(id), ...range(id), value: v });
    }
    for (const [k, l, id, min, max] of GRAZE_FIELDS) out.push({ path: `graze.${k}`, label: l, ...range(id), ...(min != null ? { min } : {}), ...(max != null ? { max } : {}), value: now.graze?.[k] ?? null });
    now.lights.forEach((L, i) => { for (const [k, l] of LIGHT_FIELDS) out.push({ path: `lights.${i}.${k}`, label: `Light ${i + 1} · ${l}`, value: L[k] ?? (k === 'kind' ? 'light' : null) }); });
    for (const A of ADJUSTMENTS) {
      out.push({ path: `adjust.${A.key}.on`, label: `${A.name} · on`, value: now.adjust?.[A.key]?.on });
      for (const [k, l, min, max, step] of A.fields) out.push({ path: `adjust.${A.key}.${k}`, label: `${A.name} · ${l}`, min, max, step, value: now.adjust?.[A.key]?.[k] });
    }
    for (const O of OVERLAYS) {
      out.push({ path: `overlays.${O.key}.on`, label: `${O.name} · on`, value: now.overlays?.[O.key]?.on });
      for (const [k, l, min, max, step] of O.fields) out.push({ path: `overlays.${O.key}.${k}`, label: `${O.name} · ${l}`, min, max, step, value: now.overlays?.[O.key]?.[k] });
    }
    return out;
  }

  // Analyze and looks (auto.js).
  function summary() {
    const A = auto.analysis;
    if (!A) return null;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    return { tone: { p05: r3(A.p05), p50: r3(A.p50), p95: r3(A.p95), saturation: r3(A.sat), clipHigh: r3(A.clip.hi), clipLow: r3(A.clip.lo) },
      light: A.litFrom === 'set' ? { litFromDeg: A.litDeg } : { even: true, brighterTowardDeg: Math.round(A.pool.deg), poolStrength: r3(A.pool.strength) },
      strokes: { contrast: r3(A.photoScore), directionDeg: A.strokes ? Math.round(A.strokes.strokeDeg) : null, coherence: A.strokes ? r3(A.strokes.coherence) : null },
      rakeDeg: Math.round(A.rake), depthMm: A.depth, depthWhy: A.depthWhy, measuredRelief: A.measured, ms: A.ms, looks: looks() };
  }
  // A built-in look has a fixed id (auto.js BUILT_IN) and a recipe version; prefer the id in jobs.
  const looks = () => (auto.analysis?.items || []).map((it, index) => ({ index, ...(it.id ? { id: it.id, version: it.version } : {}), name: it.name, kind: it.kind, note: it.note, exposure: it.settings.exposure }));
  async function analyze() {
    needPhoto();
    if (state.mode !== 'single') throw new Error('Analyze works on a single photograph.');
    await auto.analyze();
    if (!auto.analysis) throw new Error($('autoReadout')?.textContent || 'Analyze failed.');
    return summary();
  }
  // The analysis for a cache (tools/digilight-headless.cjs), tagged with what it was made
  // from: the settings Analyze started from and the preview size. setAnalysis refuses one
  // made from anything else (it would be another photo's or another setup's looks).
  const analysisKey = (from = settings()) => JSON.stringify([from, api.canvas.width, api.canvas.height, info().measuredRelief]);
  function getAnalysis() {
    const saved = auto.save();
    if (!saved) throw new Error('No analysis yet: call analyze() first.');
    return { format: 'digilight-analysis', version: API_VERSION, key: analysisKey(saved.base), analysis: saved };
  }
  async function setAnalysis(c) {
    needPhoto();
    c = typeof c === 'string' ? JSON.parse(c) : c;
    if (c?.format !== 'digilight-analysis' || c.version !== API_VERSION || !Array.isArray(c.analysis?.items)) throw new Error('Not a DigiLight analysis.');
    if (c.key !== analysisKey()) throw new Error('This analysis was made for another photo or other settings.');
    await auto.load(c.analysis);
    return summary();
  }
  async function applyLook(which, opts = {}) {
    if (!auto.analysis) await analyze();
    const list = auto.analysis.items;
    const w = String(which).toLowerCase();
    const i = typeof which === 'number' ? which : list.findIndex((it) => it.id === which) >= 0 ? list.findIndex((it) => it.id === which) : list.findIndex((it) => it.name.toLowerCase() === w);
    if (!(i >= 0 && i < list.length)) throw new Error(`No look "${which}". Looks: ${list.map((it) => it.id ? `${it.name} (${it.id})` : it.name).join(', ')}.`);
    const s = opts.strength ?? 1;
    if (!(s >= 0 && s <= 1)) throw new Error('strength is 0–1.');
    auto.pick(i);   // guards the look itself
    let g = guard?.enabled ? guard.last : null;
    if (s !== 1) { auto.setStrength(s); checkpoint(); g = guarded(); }
    await idle();
    return { look: list[i].name, ...(list[i].id ? { id: list[i].id, version: list[i].version } : {}), strength: s, ...(g?.fixed ? { guard: g.note } : {}) };
  }
  // Fixed presets: lighting scenes, graze (raking) presets, matched looks. No Analyze needed.
  function applyPreset(kind, name) {
    const table = presets[kind];
    if (!table) throw new Error(`Preset kind is one of: ${Object.keys(presets).join(', ')}.`);
    if (!table.names.includes(name)) throw new Error(`No ${kind} preset "${name}". Presets: ${table.names.join(', ')}.`);
    table.apply(name); checkpoint();
    const g = guarded();
    return { kind, name, ...(g?.fixed ? { guard: g.note } : {}) };
  }

  // Output.
  function encode(canvas, opts = {}) {
    const type = MIME[String(opts.format || 'png').toLowerCase()];
    if (!type) throw new Error('format is png, jpeg or webp.');
    const q = opts.quality ?? 0.92;
    if (opts.as === 'blob') return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image.'))), type, q));
    return canvas.toDataURL(type, q);
  }
  // A picture's fingerprint: SHA-256 of its RGBA pixels as drawn, before PNG / JPEG encoding,
  // so a re-render can be checked against it whatever the file format (`verify` in the CLI).
  // null where the browser has no SubtleCrypto (plain http away from localhost).
  async function pixelsOf(canvas) {
    const w = canvas.width, h = canvas.height;
    if (!globalThis.crypto?.subtle) return { width: w, height: h, sha256: null };
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return { width: w, height: h, sha256: Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('') };
  }
  // The photo's own fingerprint (its pixels as the browser decoded them, full size), cached.
  let photoPixels = null;
  async function photoFingerprint() {
    const s = api.source();
    if (photoPixels?.src === s) return photoPixels.value;
    const c = document.createElement('canvas'); c.width = s.naturalWidth || s.width; c.height = s.naturalHeight || s.height;
    c.getContext('2d').drawImage(s, 0, 0);
    photoPixels = { src: s, value: await pixelsOf(c) };
    return photoPixels.value;
  }
  // metrics: true → {image, metrics, pixels}: the render's numbers against the photo at the same
  // size and crop (measure.js imageMetrics), measured on the pixels before encoding, and its
  // fingerprint (pixelsOf); hash: true → {image, pixels}; change: true (or {map, range}) adds
  // change: {image, stats}, the change map against the same photo pixels (changemap.js).
  let photoCache = null;   // the last photo drawn: {src, key, px, stats}
  const pixelsAt = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  // The photo drawn the way the picture's own pixels started: the preview's copy for a preview,
  // else cut from the full photo as export.js cuts its tiles (resample.js when scaled).
  // Resampled any other way it differs by a level or so, which counts as clipping.
  function photoAt(w, h, whole, rect) {
    const s = api.source(), fw = s.naturalWidth || s.width;
    const key = [w, h, whole[0], whole[1], rect ? [rect.x, rect.y, rect.w, rect.h] : ''].join('|');
    const pv = api.previewSource?.(), usePv = !rect && pv && pv.width === w && pv.height === h && whole[0] === w;
    if (!photoCache || photoCache.src !== (usePv ? pv : s) || photoCache.key !== key) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), kx = fw / whole[0], ky = (s.naturalHeight || s.height) / whole[1], r = rect || { x: 0, y: 0, w, h };
      if (usePv) g.drawImage(pv, 0, 0);
      else if (kx !== 1 || ky !== 1) drawResampled(g, s, whole[0], whole[1], r.x, r.y, w, h);
      else g.drawImage(s, r.x, r.y, r.w, r.h, 0, 0, w, h);
      photoCache = { src: usePv ? pv : s, key, px: pixelsAt(c), stats: null };
    }
    return photoCache;
  }
  function measure(canvas, whole, rect) {
    const t0 = performance.now(), w = canvas.width, h = canvas.height;
    const p = photoAt(w, h, whole, rect);
    p.stats ||= pictureStats(p.px, w, h);
    const m = imageMetrics(pixelsAt(canvas), w, h, p.stats);
    return { ...m, crop: rect || null, ms: Math.round(performance.now() - t0) };
  }
  // The change map (changemap.js) of a picture against the photo at the same size and crop:
  // {image (PNG, or a Blob with as: 'blob'), stats}. opts: true, or {map: 'light' | 'colour', range}.
  async function change(canvas, whole, rect, opts, as) {
    const w = canvas.width, h = canvas.height, o = opts === true ? {} : opts;
    const { pixels, stats } = changeMap(pixelsAt(canvas), photoAt(w, h, whole, rect).px, w, h, { map: o.map ?? 'light', range: o.range ?? 2 });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
    return { image: await encode(c, { format: 'png', as }), stats: { ...stats, crop: rect || null } };
  }
  // What render / export / exportMany return for one canvas, with the options asked for.
  async function output(c, whole, rect, opts, enc = opts) {
    if (!opts.metrics && !opts.hash && !opts.change) return encode(c, enc);
    return {
      image: await encode(c, enc),
      metrics: opts.metrics ? measure(c, whole, rect) : undefined,
      pixels: await pixelsOf(c),
      ...(opts.change ? { change: await change(c, whole, rect, opts.change, enc.as) } : {}),
    };
  }
  async function render(opts = {}) {
    needPhoto();
    await idle();
    api.renderNow();
    const c = document.createElement('canvas'); c.width = api.canvas.width; c.height = api.canvas.height;
    c.getContext('2d').drawImage(api.canvas, 0, 0);
    return output(c, [c.width, c.height], undefined, opts);
  }
  async function exportImage(opts = {}) {
    needPhoto();
    if (state.mode !== 'single') throw new Error('Export works on a single photograph here.');
    await idle();
    const rect = opts.crop ? cropRect(opts.crop, opts.width) : undefined;
    const out = opts.width ? await api.renderAt(opts.width, rect) : await api.exportFull(rect);
    const c = out?.canvas || out;
    const s = api.source(), fw = s.naturalWidth || s.width, fh = s.naturalHeight || s.height;
    const W = opts.width ? Math.max(1, Math.min(fw, Math.round(opts.width))) : fw;
    return output(c, [W, opts.width ? Math.max(1, Math.round(fh * W / fw)) : fh], rect, opts);
  }
  // Several pictures at once, for rounds of looks: items [{settings, width?, crop?, format?,
  // quality?}], each made as export() would make it from those settings (taken as they are:
  // dress and guard them first). Items that need the same relief (the same surface settings,
  // size and crop) are rendered in one tiled pass, MANY_CHUNK at a time, so the relief is built
  // once per pass, not once per picture. Returns, in order, what export() returns for each
  // (`metrics: true` → {image, metrics}). The settings in force before are put back.
  const MANY_CHUNK = 8;
  async function exportMany(items, opts = {}) {
    needPhoto();
    if (state.mode !== 'single') throw new Error('Export works on a single photograph here.');
    if (!Array.isArray(items) || !items.length || items.some((it) => !it?.settings)) throw new Error('exportMany takes a list of {settings, width?, crop?, format?, quality?}.');
    await idle();
    const s = api.source(), fw = s.naturalWidth || s.width, fh = s.naturalHeight || s.height;
    const before = snapshot(), groups = new Map(), out = new Array(items.length);
    try {
      for (const [i, it] of items.entries()) {
        restore(validate({ format: 'digilight', version: 1, image: 'data:image/png;base64,', settings: it.settings }));
        const W = it.width ? Math.max(1, Math.min(fw, Math.round(it.width))) : fw;
        const rect = it.crop ? cropRect(it.crop, it.width) : null;
        const { key, state: st } = api.captureState(W);
        const gk = JSON.stringify([key, W, rect]);
        if (!groups.has(gk)) groups.set(gk, { W, rect, members: [] });
        groups.get(gk).members.push({ i, st });
      }
      for (const g of groups.values()) {
        const whole = [g.W, g.W === fw ? fh : Math.max(1, Math.round(fh * g.W / fw))];
        for (let c = 0; c < g.members.length; c += MANY_CHUNK) {
          const part = g.members.slice(c, c + MANY_CHUNK);
          const canvases = await api.exportStates(part.map((m) => m.st), { width: g.W === fw ? undefined : g.W, rect: g.rect || undefined });
          for (const [k, m] of part.entries()) {
            const it = items[m.i], enc = { format: it.format || opts.format, quality: it.quality ?? opts.quality, as: opts.as };
            out[m.i] = await output(canvases[k], whole, g.rect || undefined, { ...opts, change: it.change ?? opts.change }, enc);
          }
        }
      }
    } finally {
      restore(before);
    }
    return out;
  }
  // crop: {x, y, w, h} in the exported image's pixels (full size, or width px wide), or
  // "x,y,w,h"; values of 1 or less are fractions of its width / height. Kept inside it.
  function cropRect(crop, width) {
    const s = api.source(), fw = s.naturalWidth || s.width, fh = s.naturalHeight || s.height;
    const W = width ? Math.max(1, Math.min(fw, Math.round(width))) : fw, H = width ? Math.max(1, Math.round(fh * W / fw)) : fh;
    const v = typeof crop === 'string' ? crop.split(',').map(Number) : [crop.x, crop.y, crop.w, crop.h];
    if (v.length !== 4 || !v.every(Number.isFinite) || v.some((n) => n < 0)) throw new Error('crop is {x, y, w, h} (or "x,y,w,h") in pixels, or fractions of 1.');
    const [x, y, w, h] = v.map((n, i) => Math.round(v.every((m) => m <= 1) ? n * (i % 2 ? H : W) : n));
    const x0 = Math.min(x, W - 1), y0 = Math.min(y, H - 1);
    const r = { x: x0, y: y0, w: Math.min(w, W - x0), h: Math.min(h, H - y0) };
    if (r.w < 1 || r.h < 1) throw new Error('crop is empty.');
    return r;
  }
  // What a picture was made from, to keep beside it (the CLI and the MCP server write it as a
  // .json next to each export): the settings (setSettings() takes them back), the look applied
  // and whether it was changed since, the photo's size, what drew it, when. `extra` is merged
  // in: the guard's note and the metrics, which only the caller knows belong to this picture.
  async function record(extra = {}) {
    needPhoto();
    const photoPx = await photoFingerprint();
    const s = api.source(), a = auto.active, it = a && auto.analysis?.items?.[a.index];
    const look = it ? { name: it.name, kind: it.kind, ...(it.id ? { id: it.id, version: it.version } : {}), strength: +($('autoStrength')?.value ?? 1),
      changedSince: JSON.stringify(snapshot()) !== a.applied } : null;
    return { format: 'digilight-record', version: 1, api: API_VERSION, at: new Date().toISOString(),
      renderer: api.renderer?.() || null, photo: { width: s.naturalWidth || s.width, height: s.naturalHeight || s.height, sample: api.sample?.() || null, pixelsSha256: photoPx.sha256 },
      look, ...clone(extra), settings: settings() };
  }
  // Relief measured from lamp or sun photos (Measure relief · lamp photos; lampphotos.js):
  // photos [{src (URL, data URL or Blob), lamp: {left, above, out} (cm from the painting's
  // left and top edges, and out from its face)} or {src, sun: {azimuthDeg, elevationDeg}}],
  // each cropped like the painting photo, or handheld: a photo shaped unlike it is lined up on it
  // (lineup.js), as is one with lineUp: true (a photo's own, or for all; false: never). widthCm
  // sets the painting's width; deepestMm (the artist's deepest relief) sets the depth from it.
  // Returns what was measured (per shot `lineUp`: the homography and how well it held, when lined
  // up); the picture then uses the measured relief (one undo step).
  async function measureRelief({ photos, widthCm, deepestMm, glints = true, fit = true, driftSigma, beamSigma, lineUp } = {}) {
    needPhoto();
    if (state.mode !== 'single') throw new Error('Measured relief works on a single photograph.');
    if (!Array.isArray(photos) || !photos.length || photos.some((p) => !p?.src || (!p.sun && !p.lamp))) throw new Error('measureRelief takes photos: [{src, lamp: {left, above, out}} or {src, sun: {azimuthDeg, elevationDeg}}].');
    for (const p of photos) {
      if (p.sun && !(Number.isFinite(+p.sun.azimuthDeg) && +p.sun.elevationDeg >= 1 && +p.sun.elevationDeg <= 89)) throw new Error('sun is {azimuthDeg (0 right, 90 above, 180 left), elevationDeg (1–89, to the painting\'s face)}.');
      if (!p.sun && !['left', 'above', 'out'].every((k) => Number.isFinite(+p.lamp[k]))) throw new Error('lamp is {left, above, out} in cm.');
    }
    if (deepestMm != null && !(deepestMm > 0)) throw new Error('deepestMm must be over 0.');
    if (widthCm != null) apply({ ...settings(), paintingWidthCm: +widthCm });
    const blobs = await Promise.all(photos.map(async (p) => (p.src instanceof Blob ? p.src : (await fetch(String(p.src))).blob())));
    lamp.rows.length = 0;
    await lamp.addFiles(blobs.map((b, i) => new File([b], photos[i].name || `photo ${i + 1}`, { type: b.type || 'image/jpeg' })));
    if (lamp.rows.length !== photos.length) throw new Error('A photo could not be opened.');
    photos.forEach((p, i) => {
      lamp.rows[i].lamp = p.sun ? { sun: { azimuthDeg: +p.sun.azimuthDeg, elevationDeg: +p.sun.elevationDeg } } : { left: +p.lamp.left, above: +p.lamp.above, out: Math.max(0.2, +p.lamp.out) };
      const hand = p.lineUp ?? lineUp;
      if (hand != null) lamp.rows[i].lineUp = !!hand;
    });
    lamp.renderRows();
    const r = await lamp.measure({ glints, fit, deepest: deepestMm ?? null, driftSigma, beamSigma });
    if (!r) throw new Error($('lampStatus').textContent || 'The relief could not be measured.');
    await idle();
    return { depthMm: r.depthMm, rangeMm: r.rangeMm, deepestMm: r.deepestMm, textureDepthMm: state.textureDepthMm, sun: r.sun, check: r.check,
      shots: r.shots.map((x) => ({ align: x.align && { map: x.align.map, rms: x.align.rms, used: x.align.used, of: x.align.of }, room: x.room, usable: x.usable, glint: x.glint, lineUp: x.lineUp })),
      fit: r.fit ? { depth: r.fit.depth, reached: r.fit.reached } : null, ...info() };
  }

  async function getProject(opts = {}) {
    needPhoto();
    const p = await project();
    if (opts.name) p.name = String(opts.name).slice(0, 120);
    return p;
  }
  async function setProject(p) {
    await openProject(typeof p === 'string' ? JSON.parse(p) : p);
    await idle(); api.renderNow();
    return info();
  }
  function step(which) {
    const btn = $(which);
    if (btn.disabled) return false;
    btn.click(); return true;
  }

  const digilight = {
    version: API_VERSION,
    ready: async () => { await queue; await idle(); return info(); },
    info, settings, describe,
    get: (path) => (path == null ? settings() : clone(getPath(snapshot(), path) ?? null)),
    load: serial(load), set: serial(async (p, v) => set(p, v)), setSettings: serial(async (s) => { apply({ ...settings(), ...s }); return settings(); }),
    analyze: serial(analyze), looks, applyLook: serial(applyLook),
    getAnalysis: serial(async () => getAnalysis()), setAnalysis: serial(setAnalysis),
    presets: () => Object.fromEntries(Object.entries(presets).map(([k, t]) => [k, [...t.names]])), applyPreset: serial(async (k, n) => applyPreset(k, n)),
    addLight: serial(async (k, p) => addLight(k, p)), removeLight: serial(async (i) => removeLight(i)),
    undo: serial(async () => step('undo')), redo: serial(async () => step('redo')),
    render: serial(render), export: serial(exportImage), exportMany: serial(exportMany),
    // The guard: guard({fix}) checks (and with fix, the default, repairs as its own undo
    // step) the picture as it stands; setGuard(false) stops changes being guarded.
    guard: serial(async (o = {}) => { needPhoto(); return guard.run({ ...o, fix: o.fix !== false, amend: false }); }),
    lastGuard: () => guard.last, setGuard: (on) => { guard.enabled = !!on; return guard.enabled; },
    record: serial(async (extra) => record(extra)),
    measureRelief: serial(measureRelief),
    getProject: serial(getProject), setProject: serial(setProject),
  };
  window.digilight = digilight;
  bridge(digilight);
  fromURL(digilight);
  return digilight;
}

// postMessage: only with ?bridge, and only from the page that framed or opened this one.
function bridge(dl) {
  if (!new URLSearchParams(location.search).has('bridge')) return;
  const peers = () => [window.parent !== window ? window.parent : null, window.opener].filter(Boolean);
  if (!peers().length) return;
  window.addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || m.digilight == null || !peers().includes(e.source)) return;
    const reply = (x) => e.source.postMessage({ digilight: m.digilight, ...x }, e.origin === 'null' ? '*' : e.origin);
    const fn = dl[m.method];
    if (typeof fn !== 'function') return reply({ error: `Unknown method "${m.method}".` });
    try { reply({ result: await fn(...(Array.isArray(m.args) ? m.args : [])) }); } catch (err) { reply({ error: err.message || String(err) }); }
  });
  const note = document.createElement('div'); note.id = 'bridgeNote'; note.textContent = 'Automation bridge on: the page that opened this one can control it.';
  note.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:12px system-ui;padding:4px 8px;border-radius:6px;background:#333c;color:#fff;pointer-events:none';
  document.body.append(note);
  for (const p of peers()) p.postMessage({ digilight: 'ready', version: API_VERSION }, '*');
}

// URL parameters, run once on open: ?image=URL | ?project=URL | ?sample=id, then ?set=…,
// then ?analyze / ?look=Name[&strength=0.8].
async function fromURL(dl) {
  const q = new URLSearchParams(location.search);
  if (!['image', 'project', 'sample', 'set', 'look', 'analyze'].some((k) => q.has(k))) return;
  const status = (t) => { const h = document.getElementById('hint'); if (h) { h.classList.remove('gone'); h.textContent = t; } };
  try {
    if (q.get('project')) { const r = await fetch(q.get('project')); if (!r.ok) throw new Error(`project: HTTP ${r.status}`); await dl.setProject(await r.json()); }
    else if (q.get('image')) await dl.load(q.get('image'));
    else if (q.get('sample')) await dl.load({ sample: q.get('sample') });
    if (q.get('set')) await dl.set(parseSets(q.get('set')));
    if (q.get('look')) await dl.applyLook(q.get('look'), { strength: q.has('strength') ? +q.get('strength') : 1 });
    else if (q.has('analyze')) await dl.analyze();
  } catch (e) { status('Automation: ' + e.message); }
}

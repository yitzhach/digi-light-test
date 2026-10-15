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

export const API_VERSION = 1;
const clone = (v) => structuredClone(v);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const MIME = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
// Per-light fields and their ranges, as studio.js validate checks them.
const LIGHT_FIELDS = [['x', 'Across (painting widths, 0 left … 1 right)'], ['y', 'Up (0 bottom … 1 top)'], ['z', 'Height out from the wall'],
  ['power', 'Power'], ['kelvin', 'Colour temperature (K), with useKelvin 1'], ['cone', 'Beam cone'], ['softness', 'Softness'], ['falloff', 'Falloff'],
  ['aimX', 'Aim across'], ['aimY', 'Aim up'], ['size', 'Lamp size'], ['lift', 'Shadow lift (−1 … 1)'], ['enabled', 'On (true/false)'], ['useKelvin', 'Use colour temperature'], ['hex', 'Colour (#rrggbb)']];
const GRAZE_FIELDS = [['enabled', 'Visible', 'grazeVis'], ['angle', 'Direction (0° from the right, 90° top)', null, 0, 359.9], ['elevation', 'Angle to wall', 'grazeElevation'],
  ['opacity', 'Opacity', 'grazeOpacity'], ['detail', 'Detail', 'grazeDetail'], ['fine', 'Fine', 'grazeFine'], ['reach', 'Shadow length', 'grazeReach'],
  ['clean', 'Clean shadows', 'grazeClean'], ['soft', 'Softness', 'grazeSoft'], ['lift', 'Shadow lift', 'grazeLift'], ['fill', 'Room light', null, 0, null], ['grey', 'Grey surface', null, 0, 1]];

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

export function initAutomation({ state, api, snapshot, restore, checkpoint, validate, history, auto, project, openProject, presets, $ }) {
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
  }
  function set(pathOrObj, value) {
    const changes = typeof pathOrObj === 'string' ? { [pathOrObj]: value } : pathOrObj;
    if (!changes || typeof changes !== 'object') throw new Error('set() takes (path, value) or {path: value, ...}.');
    const s = settings();
    for (const [p, v] of Object.entries(changes)) setPath(s, p, v);
    try { apply(s); } catch (e) { throw new Error(`${e.message.replace(/\.$/, '')}: nothing changed (asked ${JSON.stringify(changes)}; digilight.describe() lists the ranges).`); }
    return Object.fromEntries(Object.keys(changes).map((p) => [p, getPath(snapshot(), p)]));
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
    now.lights.forEach((L, i) => { for (const [k, l] of LIGHT_FIELDS) out.push({ path: `lights.${i}.${k}`, label: `Light ${i + 1} · ${l}`, value: L[k] }); });
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
  const looks = () => (auto.analysis?.items || []).map((it, index) => ({ index, name: it.name, kind: it.kind, note: it.note, exposure: it.settings.exposure }));
  async function analyze() {
    needPhoto();
    if (state.mode !== 'single') throw new Error('Analyze works on a single photograph.');
    await auto.analyze();
    if (!auto.analysis) throw new Error($('autoReadout')?.textContent || 'Analyze failed.');
    return summary();
  }
  async function applyLook(which, opts = {}) {
    if (!auto.analysis) await analyze();
    const list = auto.analysis.items;
    const i = typeof which === 'number' ? which : list.findIndex((it) => it.name.toLowerCase() === String(which).toLowerCase());
    if (!(i >= 0 && i < list.length)) throw new Error(`No look "${which}". Looks: ${list.map((it) => it.name).join(', ')}.`);
    auto.pick(i);
    const s = opts.strength ?? 1;
    if (!(s >= 0 && s <= 1)) throw new Error('strength is 0–1.');
    if (s !== 1) { auto.setStrength(s); checkpoint(); }
    await idle();
    return { look: list[i].name, strength: s };
  }
  // Fixed presets: lighting scenes, graze (raking) presets, matched looks. No Analyze needed.
  function applyPreset(kind, name) {
    const table = presets[kind];
    if (!table) throw new Error(`Preset kind is one of: ${Object.keys(presets).join(', ')}.`);
    if (!table.names.includes(name)) throw new Error(`No ${kind} preset "${name}". Presets: ${table.names.join(', ')}.`);
    table.apply(name); checkpoint();
    return { kind, name };
  }

  // Output.
  function encode(canvas, opts = {}) {
    const type = MIME[String(opts.format || 'png').toLowerCase()];
    if (!type) throw new Error('format is png, jpeg or webp.');
    const q = opts.quality ?? 0.92;
    if (opts.as === 'blob') return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image.'))), type, q));
    return canvas.toDataURL(type, q);
  }
  async function render(opts = {}) {
    needPhoto();
    await idle();
    api.renderNow();
    const c = document.createElement('canvas'); c.width = api.canvas.width; c.height = api.canvas.height;
    c.getContext('2d').drawImage(api.canvas, 0, 0);
    return encode(c, opts);
  }
  async function exportImage(opts = {}) {
    needPhoto();
    if (state.mode !== 'single') throw new Error('Export works on a single photograph here.');
    await idle();
    const out = opts.width ? await api.renderAt(opts.width) : await api.exportFull();
    return encode(out?.canvas || out, opts);
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
    presets: () => Object.fromEntries(Object.entries(presets).map(([k, t]) => [k, [...t.names]])), applyPreset: serial(async (k, n) => applyPreset(k, n)),
    undo: serial(async () => step('undo')), redo: serial(async () => step('redo')),
    render: serial(render), export: serial(exportImage),
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

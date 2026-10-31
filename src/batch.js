// Batch preview: render 2-10 looks of the painting as small WebP previews, review them
// in a full-screen viewer (swipe, pinch zoom that stays on the same spot, hold for the
// original, 1-5 stars, a note), then export only the chosen ones at full resolution.
// Save ratings downloads the stars and notes as JSON, to hand to Claude for the next round.
// Looks come from Auto (the looks Analyze made for this photo), the built-in lighting or graze
// presets, the user's saved presets, or steps of one setting (the way the automated test rounds
// vary one thing at a time). Pin as A: Hold flips to that look instead of the photo.
import { makeZip } from './testbundle.js';

const MIN = 2, MAX = 10;
// Sharp previews are drawn from the full photo, long side capped here (memory on phones).
const SHARP_MAX = 3000;
const pad = (n) => String(n).padStart(2, '0');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9+-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const fmtNum = (v, d) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('-', '−');
const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`;

export function initBatch({ state, api, after, snapshot, restore, setBatching, useLighting, lighting, grazePresets, userPresets, presetSettings, checkpoint, FILL_MAX, GRAZE_AMBIENT, saveLook, listProjects, auto, guard }) {
  const $ = (id) => document.getElementById(id);
  // One setting stepped from..to: [key, label, min, max, step, read, write, show]
  const SWEEPS = [
    ['depth', 'Texture depth', 0.1, 10, 0.05, (s) => s.textureDepthMm, (s, v) => { s.physical = 1; s.textureDepthMm = v; }, (v) => `${fmtNum(v, 2)} mm`],
    ['fill', 'Room light (graze)', 0, FILL_MAX, 0.01, (s) => s.graze.fill ?? GRAZE_AMBIENT, (s, v) => { s.graze.enabled = true; s.graze.fill = v; }, (v) => fmtNum(v, 2)],
    ['glift', 'Shadow lift (graze)', -1, 1, 0.05, (s) => s.graze.lift ?? 0, (s, v) => { s.graze.enabled = true; s.graze.lift = v; }, pct],
    ['lift', 'Shadow lift (all lights)', -1, 1, 0.05, (s) => s.lights[0]?.lift ?? 0, (s, v) => { for (const l of s.lights) l.lift = v; }, pct],
    ['elev', 'Graze angle to wall', 1, 20, 0.5, (s) => s.graze.elevation, (s, v) => { s.graze.enabled = true; s.graze.elevation = v; delete s.graze.lamp; }, (v) => `${fmtNum(v, 1)}°`],
    ['gop', 'Graze opacity', 0, 1, 0.05, (s) => s.graze.opacity, (s, v) => { s.graze.enabled = true; s.graze.opacity = v; }, (v) => `${Math.round(v * 100)}%`],
    ['exp', 'Exposure', -3, 3, 0.05, (s) => s.exposure, (s, v) => { s.exposure = v; }, (v) => `${v > 0 ? '+' : ''}${fmtNum(v, 2)} stops`],
    ['wb', 'Keep greys neutral', 0, 1, 0.05, (s) => s.neutralWB ?? 0, (s, v) => { s.neutralWB = v; }, (v) => `${Math.round(v * 100)}%`],
    ['vib', 'Vibrance', -1, 1, 0.05, (s) => s.vibrance ?? 0, (s, v) => { s.vibrance = v; }, pct],
    ['room', 'Room light colour', 1800, 10000, 50, (s) => s.roomKelvin ?? 6500, (s, v) => { s.roomKelvin = Math.round(v / 50) * 50; }, (v) => `${Math.round(v / 50) * 50} K`],
    ['sdef', 'Stroke definition', 0, 1, 0.05, (s) => s.strokeDef ?? 0, (s, v) => { s.strokeDef = v; }, (v) => `${Math.round(v * 100)}%`],
    ['ssize', 'Stroke size', 0.002, 0.04, 0.001, (s) => s.strokeSize ?? 0.01, (s, v) => { s.strokeSize = v; }, (v) => `${fmtNum(v * 100, 1)}% of width`],
  ];
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'batchSection';
  box.innerHTML = `<summary>Batch preview · compare looks</summary><div class="grp">
    <p class="note">Render several looks as small previews, rate them side by side, then export only the ones you like at full resolution.</p>
    <label class="selectRow">Looks from<select id="batchSource">
      <option value="sweep">Steps of one setting</option><option value="auto">Auto looks (after Analyze)</option><option value="lighting">Lighting presets</option>
      <option value="graze">Graze presets</option><option value="mine">My saved presets</option></select></label>
    <div id="batchSweep">
      <label class="selectRow">Setting<select id="batchKey">${SWEEPS.map(([k, label]) => `<option value="${k}">${label}</option>`).join('')}</select></label>
      <div class="batchRange"><label>From <input id="batchFrom" type="number" inputmode="decimal"></label><label>To <input id="batchTo" type="number" inputmode="decimal"></label>
      <label>Looks <select id="batchCount">${Array.from({ length: MAX - MIN + 1 }, (_, i) => `<option${i + MIN === 5 ? ' selected' : ''}>${i + MIN}</option>`).join('')}</select></label></div>
    </div>
    <div id="batchPick" class="batchPick" hidden></div>
    <label class="selectRow">Detail<select id="batchDetail"><option value="sharp" selected>Sharp zoom (from the full photo, slower)</option><option value="fast">Screen size (fast)</option></select></label>
    <label class="checkRow"><input id="batchCurrent" type="checkbox" checked> Include the current look as #1</label>
    <div class="views"><button id="batchRun">Render previews</button><button id="batchOpen" disabled>Review</button></div>
    <p class="note" id="batchStatus">Sharp previews are drawn from the full photo (up to ${SHARP_MAX} px), so zooming in stays crisp down to the photo's own pixels. Screen size is quicker but blurs when zoomed.</p></div>`;
  after.after(box);

  const sweepOf = () => SWEEPS.find((s) => s[0] === $('batchKey').value);
  function sweepDefaults() {
    const [, , min, max, step, read] = sweepOf(), v = read(state);
    const lo = Math.max(min, v - (max - min) * 0.15), hi = Math.min(max, v + (max - min) * 0.15);
    const k = $('batchKey').value;
    const [from, to] = k === 'depth' ? [Math.max(min, v * 0.6), Math.min(max, v * 2)] : [lo, hi];
    for (const [id, x] of [['batchFrom', from], ['batchTo', to]]) { const el = $(id); el.min = min; el.max = max; el.step = step; el.value = +(Math.round(x / step) * step).toFixed(3); }
  }
  async function pickList() {
    const src = $('batchSource').value, el = $('batchPick');
    $('batchSweep').hidden = src !== 'sweep'; el.hidden = src === 'sweep';
    if (src === 'sweep') { sweepDefaults(); return; }
    let names = [];
    if (src === 'auto') {
      // The first ones on (the favourites come first among the built-in looks), room left for the current look.
      const room = MAX - ($('batchCurrent').checked ? 1 : 0);
      names = (auto?.()?.analysis?.items || []).map((it, i) => [String(i), it.kind === 'built-in' ? it.name : `★ ${it.name}`, i < room]);
      if (!names.length) { el.replaceChildren(); el.innerHTML = '<p class="note">No Auto looks yet: Analyze first (Auto, at the top).</p>'; return; }
    } else if (src === 'lighting') names = Object.keys(lighting).map((n) => [n, n, ['Gallery track', 'Museum spotlight', 'Raking light', 'Soft window', 'Warm spotlight', 'Dramatic chiaroscuro'].includes(n)]);
    else if (src === 'graze') names = Object.keys(grazePresets).map((n) => [n, n, true]);
    else { try { names = (await userPresets()).map((p, i) => [p.id, p.name, i < 6]); } catch { names = []; } }
    el.replaceChildren();
    if (!names.length) { el.innerHTML = '<p class="note">No saved presets yet. Save one under My reusable presets.</p>'; return; }
    for (const [value, label, on] of names) {
      const row = document.createElement('label'); row.className = 'checkRow';
      row.innerHTML = '<input type="checkbox">'; row.querySelector('input').value = value; row.querySelector('input').checked = on; row.append(' ' + label);
      el.append(row);
    }
  }
  $('batchSource').onchange = pickList; $('batchKey').onchange = sweepDefaults;
  box.addEventListener('toggle', () => { if (box.open) pickList(); });

  // Each look: { name, apply(state) } applied on top of the base settings.
  async function looks() {
    const src = $('batchSource').value, out = [];
    if ($('batchCurrent').checked) out.push({ name: 'Current look', apply: () => {} });
    const room = MAX - out.length;
    if (src === 'sweep') {
      const [, label, min, max, , , write, show] = sweepOf();
      const n = +$('batchCount').value, a = Math.min(max, Math.max(min, +$('batchFrom').value)), b = Math.min(max, Math.max(min, +$('batchTo').value));
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Enter a From and To value.');
      for (let i = 0; i < Math.min(n, room); i++) { const v = n === 1 ? a : a + (b - a) * i / (n - 1); out.push({ name: `${label} ${show(v)}`, apply: (s) => write(s, v) }); }
    } else {
      const picked = [...$('batchPick').querySelectorAll('input:checked')].map((i) => i.value).slice(0, room);
      if (src === 'auto') {
        // As a tap gives it (auto.js targetFor, then the guard), on the settings the batch started from.
        const A = auto?.()?.analysis;
        for (const v of picked) { const i = +v, it = A?.items[i]; if (it) out.push({ name: it.name, apply: () => restore(auto().targetFor(i, snapshot())), guard: true }); }
      } else if (src === 'lighting') for (const n of picked) out.push({ name: n, apply: () => useLighting(n) });
      else if (src === 'graze') for (const n of picked) out.push({ name: `Graze: ${n}`, apply: (s) => { Object.assign(s.graze, grazePresets[n], { enabled: true }); } });
      else {
        const all = await userPresets();
        for (const id of picked) { const p = all.find((x) => x.id === id); if (p) out.push({ name: p.name, apply: (s) => Object.assign(s, presetSettings(p)) }); }
      }
    }
    if (out.length < MIN) throw new Error(`Choose at least ${MIN} looks (up to ${MAX}).`);
    return out;
  }

  // The preview canvas, copied in the same task as its draw (the WebGL buffer is not kept).
  function grab(viewMode = 0) {
    const keep = { viewMode: state.viewMode, compareSplit: state.compareSplit };
    state.viewMode = viewMode; state.compareSplit = -1;
    try {
      api.renderNow();
      const c = document.createElement('canvas'); c.width = api.canvas.width; c.height = api.canvas.height;
      c.getContext('2d').drawImage(api.canvas, 0, 0);
      return c;
    } finally { Object.assign(state, keep); }
  }
  // WebP where the browser can encode it (older Safari cannot), JPEG otherwise.
  const encode = (c, type = 'image/webp', q = 0.85) => new Promise((ok, no) => c.toBlob((b) => b ? ok(b) : no(new Error('Could not encode the preview.')), type, q))
    .then((b) => b.type === type || type !== 'image/webp' ? b : encode(c, 'image/jpeg', 0.85));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

  let batch = null, running = false;
  const clone = (x) => structuredClone(x);
  // Run's progress goes to the batch section and, when Auto asked for the run, to Auto's note.
  let echo = null;
  const status = (m) => { $('batchStatus').textContent = m; echo?.(m); };
  // given: {looks, from} from elsewhere (a round, automation.js), in place of this section's choice.
  async function run(given) {
    if (running || state.exporting || !api.source()) return false;
    let list;
    try { list = given?.looks || await looks(); } catch (e) { status(e.message); return false; }
    running = true; setBatching(true); $('batchRun').disabled = true;
    const base = snapshot(), items = [], src = api.source();
    const SW = src.width || src.naturalWidth, SH = src.height || src.naturalHeight;
    // Sharp: the full photo's width (long side at most SHARP_MAX); nothing gained if that is no bigger than the preview.
    let outW = Math.round(SW * Math.min(1, SHARP_MAX / Math.max(SW, SH)));
    const sharp = $('batchDetail').value === 'sharp' && outW > api.canvas.width * 1.05;
    if (!sharp) outW = api.canvas.width;
    const outH = sharp ? Math.max(1, Math.round(SH * outW / SW)) : api.canvas.height;
    try {
      let orig;
      if (sharp) { orig = document.createElement('canvas'); orig.width = outW; orig.height = outH; orig.getContext('2d').drawImage(src, 0, 0, outW, outH); } else orig = grab(4);
      const original = await encode(orig);
      for (const [i, look] of list.entries()) {
        status(`Rendering ${i + 1} of ${list.length}: ${look.name}…`);
        restore(clone(base)); await look.apply(state); api.dirty();
        if (look.guard) guard?.()?.preview();
        const settings = snapshot();
        await frame();
        const blob = await encode(sharp ? await api.renderAt(outW) : grab(0));
        items.push({ num: i + 1, name: look.name, settings, blob, url: URL.createObjectURL(blob), stars: 0, note: '', pick: false });
      }
      if (batch) for (const it of [...batch.items, batch.original]) URL.revokeObjectURL(it.url);
      batch = { items, base, original: { blob: original, url: URL.createObjectURL(original) }, w: outW, h: outH, type: items[0].blob.type,
        made: new Date(), looksFrom: given?.from || describe(), detail: sharp ? 'sharp' : 'screen' };
      const kb = items.reduce((s, it) => s + it.blob.size, 0) / 1024;
      status(`${items.length} previews at ${outW}×${outH}, ${Math.round(kb)} KB in all (${batch.type === 'image/webp' ? 'WebP' : 'JPEG'}). Rate them, then export the ones you like.`);
      $('batchOpen').disabled = false;
    } catch (e) { status('Batch failed: ' + e.message); if (given) throw e; }
    finally {
      restore(clone(base)); api.dirty(); api.render();
      setBatching(false); running = false; $('batchRun').disabled = false;
    }
    if (batch) viewer.open(0);
    return !!batch;
  }
  $('batchRun').onclick = () => run();
  // Auto's "Compare full screen": its looks, rendered and opened in the viewer.
  async function openAuto(say) {
    if (running) return;
    $('batchSource').value = 'auto'; await pickList();
    echo = say; try { await run(); } finally { echo = null; }
  }
  $('batchOpen').onclick = () => batch && viewer.open(0);

  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // What the looks were made from, in words, for the ratings file.
  function describe() {
    const src = $('batchSource').value;
    if (src !== 'sweep') return { from: $('batchSource').selectedOptions[0].textContent };
    const [, label] = sweepOf();
    return { from: 'Steps of one setting', setting: label, fromValue: +$('batchFrom').value, toValue: +$('batchTo').value, count: +$('batchCount').value };
  }
  // Settings that differ from the base look; objects (graze, lamp) one level down.
  function changed(base, s) {
    const out = {}, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const k of Object.keys(s)) {
      if (same(base[k], s[k])) continue;
      const a = base[k], b = s[k];
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(b)) {
        out[k] = {}; for (const j of Object.keys(b)) if (!same(a[j], b[j])) out[k][j] = b[j];
      } else out[k] = b;
    }
    return out;
  }
  // Everything Claude needs to read a round: the painting, the stars, the notes, and each look's settings.
  function ratings() {
    const src = api.source(), m = api.measured?.get?.();
    return {
      format: 'digilight-ratings', version: 1, saved: new Date().toISOString(), made: batch.made.toISOString(), site: location.host,
      painting: $('projectName')?.value.trim() || 'Untitled painting', sample: api.sample?.() || null,
      photo: { w: src?.width || src?.naturalWidth || 0, h: src?.height || src?.naturalHeight || 0 },
      relief: m?.on ? 'measured' : 'one-photo', previews: { w: batch.w, h: batch.h, detail: batch.detail },
      looksFrom: batch.looksFrom,
      looks: batch.items.map(({ num, name, stars, note, pick, settings }) => ({ num, name, stars, note: note || '', selected: pick, changed: changed(batch.base, settings) })),
      base: batch.base,
      settings: Object.fromEntries(batch.items.map((it) => [pad(it.num), it.settings])),
    };
  }
  const ratingsName = () => {
    const d = new Date(), t = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `digilight-ratings-${slug($('projectName')?.value.trim() || 'painting') || 'painting'}-${t}.json`;
  };
  function saveRatings(say) {
    const name = ratingsName();
    download(new Blob([JSON.stringify(ratings(), null, 1)], { type: 'application/json' }), name);
    const n = batch.items.filter((it) => it.stars || it.note).length;
    say(`Saved ${name} (${n} of ${batch.items.length} looks rated or noted). Attach that file in your Claude chat.`);
  }
  async function exportPicked(say) {
    const picked = batch.items.filter((it) => it.pick);
    if (!picked.length) { say('Tick “Export full size” on the looks you want first.'); return; }
    if (running || state.exporting) return;
    running = true; setBatching(true);
    const keep = snapshot(), type = $('exportFmt')?.value || 'image/jpeg', ext = type === 'image/png' ? 'png' : 'jpg', files = [];
    try {
      for (const [i, it] of picked.entries()) {
        say(`Rendering ${it.name} at full size (${i + 1} of ${picked.length})…`);
        restore(clone(it.settings)); api.dirty();
        const canvas = await api.exportFull();
        const blob = await encode(canvas, type, 0.95);
        files.push({ name: `${pad(it.num)}-${slug(it.name)}-${canvas.width}x${canvas.height}.${ext}`, blob });
      }
      // Each exported look is also kept as a project variation, so it can be reopened and built on.
      let saved = 0;
      if (saveLook) {
        for (const it of picked) { restore(clone(it.settings)); try { it.projectId = await saveLook(it.name, it.projectId); saved++; } catch { /* storage unavailable: the files still download */ } }
        try { await listProjects(); } catch { /* list refresh is cosmetic */ }
      }
      if (files.length === 1) download(files[0].blob, files[0].name);
      else {
        const zip = makeZip(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))));
        download(zip, `digilight-batch-${files.length}-full.zip`);
      }
      say(`Exported ${files.length} at full size.${saved ? ` Saved ${saved === 1 ? 'it' : 'them'} in Projects & variations (Saved list) to reopen and build on.` : ''}`);
    } catch (e) { say('Export failed: ' + e.message); }
    finally { restore(clone(keep)); api.dirty(); api.render(); setBatching(false); running = false; }
  }
  async function zipPreviews(say) {
    const ext = batch.type === 'image/webp' ? 'webp' : 'jpg';
    const files = [{ name: `00-original.${ext}`, blob: batch.original.blob }, ...batch.items.map((it) => ({ name: `${pad(it.num)}-${slug(it.name)}.${ext}`, blob: it.blob }))];
    const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
    data.push({ name: 'ratings.json', data: new TextEncoder().encode(JSON.stringify(ratings(), null, 1)) });  // same as Save ratings
    download(makeZip(data), `digilight-batch-${batch.items.length}-previews.zip`);
    say('Previews downloaded, with your ratings in ratings.json.');
  }
  function applyLook(it) {
    restore(clone(it.settings)); api.dirty(); api.render(); checkpoint();
    $('batchStatus').textContent = `Applied “${it.name}”. Undo goes back.`;
  }

  const viewer = makeViewer({ get batch() { return batch; }, exportPicked, zipPreviews, applyLook, saveRatings });
  window.__batch = { run, get batch() { return batch; }, viewer, exportPicked, zipPreviews, applyLook, looks, ratings, saveRatings };
  return { pickList, openAuto, run, MAX };
}

// ---- the review viewer: a fixed full-screen overlay
function makeViewer(ctx) {
  const el = document.createElement('div'); el.id = 'batchViewer'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Batch preview');
  el.innerHTML = `<div class="bvBar"><span class="bvCount" id="bvCount"></span><span class="bvName" id="bvName"></span><button id="bvClose" aria-label="Close">✕</button></div>
    <div class="bvStage" id="bvStage"><img id="bvImg" alt="" draggable="false"><span class="bvTag" id="bvTag"></span><span class="bvTag bvZoom" id="bvZoom">fit</span>
      <div class="bvZoomCtl"><button id="bvOut" aria-label="Zoom out">−</button><button id="bvFit">Fit</button><button id="bvIn" aria-label="Zoom in">+</button></div></div>
    <div class="bvRate"><div class="bvStars" id="bvStars" role="group" aria-label="Stars">${[1, 2, 3, 4, 5].map((k) => `<button data-k="${k}" aria-label="${k} star${k > 1 ? 's' : ''}">★</button>`).join('')}</div>
      <label class="bvPick"><input type="checkbox" id="bvPick"> Export full size</label></div>
    <input id="bvNote" class="bvNote" type="text" placeholder="Note on this look (what's right or wrong)" aria-label="Note on this look" autocomplete="off">
    <div class="bvNav"><button id="bvPrev">‹ Prev</button><button id="bvHold" class="bvHold">Hold: original</button><button id="bvPin" aria-pressed="false">Pin as A</button><button id="bvNext">Next ›</button></div>
    <div class="bvDots" id="bvDots"></div>
    <div class="bvActions"><button id="bvApply">Use this look</button><button id="bvExport" class="primary">Export picked</button><button id="bvRatings">Save ratings (.json)</button><button id="bvZip">Download previews</button></div>
    <p class="bvStatus" id="bvStatus">Swipe or Prev / Next. Pinch or double-tap to zoom; Prev / Next keep the same spot. Pin as A, then Hold on another look to flip between the two (keys: P pins, hold Space).</p>`;
  document.body.append(el);
  const $ = (id) => el.querySelector('#' + id), stage = $('bvStage'), img = $('bvImg');
  let cur = 0, holding = false, z = 1, tx = 0, ty = 0, fitW = 0, fitH = 0;
  let pinned = null, pinnedIn = null;   // the look pinned as A (an index), and the batch it belongs to
  const items = () => ctx.batch?.items || [];
  const say = (m) => { $('bvStatus').textContent = m; };

  function layout() {
    const b = ctx.batch; if (!b) return;
    const w = stage.clientWidth, h = stage.clientHeight, k = Math.min(w / b.w, h / b.h);
    fitW = b.w * k; fitH = b.h * k; img.style.width = fitW + 'px'; img.style.height = fitH + 'px'; apply();
  }
  function apply() {
    const w = stage.clientWidth, h = stage.clientHeight, mx = Math.max(0, (fitW * z - w) / 2), my = Math.max(0, (fitH * z - h) / 2);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
    img.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${z})`;
    $('bvZoom').textContent = z <= 1.001 ? 'fit' : `${z.toFixed(1)}×`;
  }
  function zoomAt(z2, px, py) { z2 = Math.max(1, Math.min(16, z2)); const ix = (px - tx) / z, iy = (py - ty) / z; z = z2; tx = px - ix * z; ty = py - iy * z; apply(); }
  const at = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  const pts = new Map(); let pinch = null, drag = null, swipe = null, lastTap = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, at(e));
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tx, ty }; drag = swipe = null; }
    else if (pts.size === 1) { const p = at(e); if (z > 1.001) drag = { p, tx, ty }; else swipe = { p }; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, at(e));
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const ix = (pinch.mid[0] - pinch.tx) / pinch.z, iy = (pinch.mid[1] - pinch.ty) / pinch.z;
      z = Math.max(1, Math.min(16, pinch.z * d / pinch.d)); tx = mid[0] - ix * z; ty = mid[1] - iy * z; apply();
    } else if (drag) { const p = pts.get(e.pointerId); tx = drag.tx + p[0] - drag.p[0]; ty = drag.ty + p[1] - drag.p[1]; apply(); }
  });
  function up(e) {
    if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId); pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) { pinch = null; const [q] = [...pts.values()]; drag = q && z > 1.001 ? { p: q, tx, ty } : null; } return; }
    const start = swipe?.p || drag?.p;
    if (swipe && e.type === 'pointerup') { const dx = p[0] - swipe.p[0], dy = p[1] - swipe.p[1]; if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1)); }
    if (start && e.type === 'pointerup' && Math.hypot(p[0] - start[0], p[1] - start[1]) < 10) {
      if (e.timeStamp - lastTap < 320) { lastTap = 0; if (z > 1.001) { z = 1; tx = ty = 0; apply(); } else zoomAt(4, p[0], p[1]); } else lastTap = e.timeStamp;
    }
    drag = swipe = null;
  }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = at(e); zoomAt(z * Math.exp(-e.deltaY * 0.002), px, py); }, { passive: false });
  $('bvIn').onclick = () => zoomAt(z * 1.6, 0, 0); $('bvOut').onclick = () => zoomAt(z / 1.6, 0, 0); $('bvFit').onclick = () => { z = 1; tx = ty = 0; apply(); };
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);

  // What Hold shows: the look pinned as A, unless it is the one on screen; else the photo.
  const pinA = () => (pinnedIn === ctx.batch && pinned != null && pinned !== cur ? items()[pinned] : null);
  function show() {
    const it = items()[cur]; if (!it) return;
    const a = pinA();
    img.src = !holding ? it.url : a ? a.url : ctx.batch.original.url;
    $('bvTag').textContent = !holding ? `LOOK ${pad(it.num)}${pinned === cur && pinnedIn === ctx.batch ? ' · A' : ''}` : a ? `A · LOOK ${pad(a.num)}` : 'ORIGINAL PHOTO';
  }
  function paint() {
    const list = items(), it = list[cur];
    $('bvCount').textContent = `${pad(it.num)} / ${list.length}`; $('bvName').textContent = it.name;
    el.querySelectorAll('#bvStars button').forEach((b) => b.classList.toggle('lit', +b.dataset.k <= it.stars));
    $('bvPick').checked = it.pick;
    if ($('bvNote').value !== (it.note || '')) $('bvNote').value = it.note || '';
    $('bvPrev').disabled = cur === 0; $('bvNext').disabled = cur === list.length - 1;
    const isA = pinnedIn === ctx.batch && pinned === cur, a = pinA();
    $('bvPin').textContent = isA ? 'Unpin A' : 'Pin as A'; $('bvPin').setAttribute('aria-pressed', String(isA));
    $('bvHold').textContent = a ? `Hold: A·${pad(a.num)}` : 'Hold: original';
    const dots = $('bvDots'); dots.replaceChildren();
    for (const [i, x] of list.entries()) {
      const d = document.createElement('button'); d.className = 'bvDot' + (i === cur ? ' on' : '') + (x.pick ? ' picked' : '');
      d.textContent = (pinnedIn === ctx.batch && pinned === i ? 'A·' : '') + pad(x.num) + (x.stars ? `★${x.stars}` : ''); d.title = x.name; d.onclick = () => go(i); dots.append(d);
    }
    const n = list.filter((x) => x.pick).length;
    $('bvExport').textContent = `Export picked (${n})`; $('bvExport').disabled = !n;
    show();
  }
  function go(i) { const list = items(); cur = Math.max(0, Math.min(list.length - 1, i)); paint(); }
  el.querySelectorAll('#bvStars button').forEach((b) => b.onclick = () => {
    const it = items()[cur], k = +b.dataset.k; it.stars = it.stars === k ? 0 : k;
    // Four stars and up are picked for export unless the box was set by hand.
    if (!it.pickSet) it.pick = it.stars >= 4;
    paint();
  });
  $('bvNote').addEventListener('input', () => { items()[cur].note = $('bvNote').value; });
  $('bvNote').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('bvNote').blur(); });
  $('bvPick').onchange = () => { const it = items()[cur]; it.pick = $('bvPick').checked; it.pickSet = true; paint(); };
  $('bvPrev').onclick = () => go(cur - 1); $('bvNext').onclick = () => go(cur + 1);
  function pin() { if (pinnedIn === ctx.batch && pinned === cur) pinned = null; else { pinned = cur; pinnedIn = ctx.batch; } paint(); }
  $('bvPin').onclick = pin;
  const holdOn = (on) => { if (holding === on) return; holding = on; $('bvHold').classList.toggle('on', on); show(); };
  const hold = $('bvHold');
  hold.addEventListener('pointerdown', (e) => { e.preventDefault(); holdOn(true); });
  for (const k of ['pointerup', 'pointercancel', 'pointerleave']) hold.addEventListener(k, () => holdOn(false));
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  $('bvClose').onclick = () => close();
  $('bvApply').onclick = () => { ctx.applyLook(items()[cur]); close(); };
  $('bvExport').onclick = () => ctx.exportPicked(say);
  $('bvZip').onclick = () => ctx.zipPreviews(say);
  $('bvRatings').onclick = () => ctx.saveRatings(say);
  el.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=number],input[type=text]')) return;
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'p' || e.key === 'P') pin();
    else if (e.key === ' ') { if (!e.repeat) holdOn(true); }
    else if (e.key >= '0' && e.key <= '5') { const it = items()[cur]; it.stars = +e.key; if (!it.pickSet) it.pick = it.stars >= 4; paint(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  el.addEventListener('keyup', (e) => { if (e.key === ' ') { holdOn(false); e.preventDefault(); } });
  function open(i) { el.hidden = false; document.body.classList.add('batchOpen'); z = 1; tx = ty = 0; go(i); requestAnimationFrame(layout); el.tabIndex = -1; el.focus(); }
  function close() { el.hidden = true; document.body.classList.remove('batchOpen'); }
  return { open, close, go, pin, get index() { return cur; }, get pinned() { return pinnedIn === ctx.batch ? pinned : null; }, get zoom() { return { z, tx, ty }; } };
}

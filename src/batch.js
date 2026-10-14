// Batch preview: render 2-10 looks of the painting as small WebP previews, review them
// in a full-screen viewer (swipe, pinch zoom that stays on the same spot, hold for the
// original, 1-5 stars), then export only the chosen ones at full resolution.
// Looks come from the built-in lighting or graze presets, the user's saved presets, or
// steps of one setting (the way the automated test rounds vary one thing at a time).
import { makeZip } from './testbundle.js';

const MIN = 2, MAX = 10;
const pad = (n) => String(n).padStart(2, '0');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9+-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const fmtNum = (v, d) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('-', '−');
const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`;

export function initBatch({ state, api, after, snapshot, restore, setBatching, useLighting, lighting, grazePresets, userPresets, presetSettings, checkpoint, FILL_MAX, GRAZE_AMBIENT }) {
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
  ];
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'batchSection';
  box.innerHTML = `<summary>Batch preview · compare looks</summary><div class="grp">
    <p class="note">Render several looks as small previews, rate them side by side, then export only the ones you like at full resolution.</p>
    <label class="selectRow">Looks from<select id="batchSource">
      <option value="sweep">Steps of one setting</option><option value="lighting">Lighting presets</option>
      <option value="graze">Graze presets</option><option value="mine">My saved presets</option></select></label>
    <div id="batchSweep">
      <label class="selectRow">Setting<select id="batchKey">${SWEEPS.map(([k, label]) => `<option value="${k}">${label}</option>`).join('')}</select></label>
      <div class="batchRange"><label>From <input id="batchFrom" type="number" inputmode="decimal"></label><label>To <input id="batchTo" type="number" inputmode="decimal"></label>
      <label>Looks <select id="batchCount">${Array.from({ length: MAX - MIN + 1 }, (_, i) => `<option${i + MIN === 5 ? ' selected' : ''}>${i + MIN}</option>`).join('')}</select></label></div>
    </div>
    <div id="batchPick" class="batchPick" hidden></div>
    <label class="checkRow"><input id="batchCurrent" type="checkbox" checked> Include the current look as #1</label>
    <div class="views"><button id="batchRun">Render previews</button><button id="batchOpen" disabled>Review</button></div>
    <p class="note" id="batchStatus">Previews are WebP at the preview's size, so they render fast and stay small.</p></div>`;
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
    if (src === 'lighting') names = Object.keys(lighting).map((n) => [n, n, ['Gallery track', 'Museum spotlight', 'Raking light', 'Soft window', 'Warm spotlight', 'Dramatic chiaroscuro'].includes(n)]);
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
      if (src === 'lighting') for (const n of picked) out.push({ name: n, apply: () => useLighting(n) });
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
  async function run() {
    if (running || state.exporting || !api.source()) return;
    let list;
    try { list = await looks(); } catch (e) { $('batchStatus').textContent = e.message; return; }
    running = true; setBatching(true); $('batchRun').disabled = true;
    const base = snapshot(), items = [];
    try {
      const original = await encode(grab(4));
      for (const [i, look] of list.entries()) {
        $('batchStatus').textContent = `Rendering ${i + 1} of ${list.length}: ${look.name}…`;
        restore(clone(base)); look.apply(state); api.dirty();
        const settings = snapshot();
        await frame();
        const blob = await encode(grab(0));
        items.push({ num: i + 1, name: look.name, settings, blob, url: URL.createObjectURL(blob), stars: 0, pick: false });
      }
      if (batch) for (const it of [...batch.items, batch.original]) URL.revokeObjectURL(it.url);
      batch = { items, base, original: { blob: original, url: URL.createObjectURL(original) }, w: api.canvas.width, h: api.canvas.height, type: items[0].blob.type };
      const kb = items.reduce((s, it) => s + it.blob.size, 0) / 1024;
      $('batchStatus').textContent = `${items.length} previews, ${Math.round(kb)} KB in all (${batch.type === 'image/webp' ? 'WebP' : 'JPEG'}). Rate them, then export the ones you like.`;
      $('batchOpen').disabled = false;
    } catch (e) { $('batchStatus').textContent = 'Batch failed: ' + e.message; }
    finally {
      restore(clone(base)); api.dirty(); api.render();
      setBatching(false); running = false; $('batchRun').disabled = false;
    }
    if (batch) viewer.open(0);
  }
  $('batchRun').onclick = run;
  $('batchOpen').onclick = () => batch && viewer.open(0);

  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const ratings = () => batch.items.map(({ num, name, stars, pick, settings }) => ({ num, name, stars, selected: pick, settings }));
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
      if (files.length === 1) download(files[0].blob, files[0].name);
      else {
        const zip = makeZip(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))));
        download(zip, `digilight-batch-${files.length}-full.zip`);
      }
      say(`Exported ${files.length} at full size.`);
    } catch (e) { say('Export failed: ' + e.message); }
    finally { restore(clone(keep)); api.dirty(); api.render(); setBatching(false); running = false; }
  }
  async function zipPreviews(say) {
    const ext = batch.type === 'image/webp' ? 'webp' : 'jpg';
    const files = [{ name: `00-original.${ext}`, blob: batch.original.blob }, ...batch.items.map((it) => ({ name: `${pad(it.num)}-${slug(it.name)}.${ext}`, blob: it.blob }))];
    const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
    data.push({ name: 'ratings.json', data: new TextEncoder().encode(JSON.stringify(ratings(), null, 1)) });
    download(makeZip(data), `digilight-batch-${batch.items.length}-previews.zip`);
    say('Previews downloaded, with your ratings in ratings.json.');
  }
  function applyLook(it) {
    restore(clone(it.settings)); api.dirty(); api.render(); checkpoint();
    $('batchStatus').textContent = `Applied “${it.name}”. Undo goes back.`;
  }

  const viewer = makeViewer({ get batch() { return batch; }, exportPicked, zipPreviews, applyLook });
  window.__batch = { run, get batch() { return batch; }, viewer, exportPicked, zipPreviews, applyLook, looks };
  return { pickList };
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
    <div class="bvNav"><button id="bvPrev">‹ Prev</button><button id="bvHold" class="bvHold">Hold: original</button><button id="bvNext">Next ›</button></div>
    <div class="bvDots" id="bvDots"></div>
    <div class="bvActions"><button id="bvApply">Use this look</button><button id="bvExport" class="primary">Export picked</button><button id="bvZip">Download previews</button></div>
    <p class="bvStatus" id="bvStatus">Swipe or Prev / Next. Pinch or double-tap to zoom; Prev / Next keep the same spot.</p>`;
  document.body.append(el);
  const $ = (id) => el.querySelector('#' + id), stage = $('bvStage'), img = $('bvImg');
  let cur = 0, holding = false, z = 1, tx = 0, ty = 0, fitW = 0, fitH = 0;
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

  function show() {
    const it = items()[cur]; if (!it) return;
    img.src = holding ? ctx.batch.original.url : it.url;
    $('bvTag').textContent = holding ? 'ORIGINAL PHOTO' : `LOOK ${pad(it.num)}`;
  }
  function paint() {
    const list = items(), it = list[cur];
    $('bvCount').textContent = `${pad(it.num)} / ${list.length}`; $('bvName').textContent = it.name;
    el.querySelectorAll('#bvStars button').forEach((b) => b.classList.toggle('lit', +b.dataset.k <= it.stars));
    $('bvPick').checked = it.pick;
    $('bvPrev').disabled = cur === 0; $('bvNext').disabled = cur === list.length - 1;
    const dots = $('bvDots'); dots.replaceChildren();
    for (const [i, x] of list.entries()) {
      const d = document.createElement('button'); d.className = 'bvDot' + (i === cur ? ' on' : '') + (x.pick ? ' picked' : '');
      d.textContent = pad(x.num) + (x.stars ? `★${x.stars}` : ''); d.title = x.name; d.onclick = () => go(i); dots.append(d);
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
  $('bvPick').onchange = () => { const it = items()[cur]; it.pick = $('bvPick').checked; it.pickSet = true; paint(); };
  $('bvPrev').onclick = () => go(cur - 1); $('bvNext').onclick = () => go(cur + 1);
  const hold = $('bvHold');
  hold.addEventListener('pointerdown', (e) => { e.preventDefault(); holding = true; hold.classList.add('on'); show(); });
  for (const k of ['pointerup', 'pointercancel', 'pointerleave']) hold.addEventListener(k, () => { if (holding) { holding = false; hold.classList.remove('on'); show(); } });
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  $('bvClose').onclick = () => close();
  $('bvApply').onclick = () => { ctx.applyLook(items()[cur]); close(); };
  $('bvExport').onclick = () => ctx.exportPicked(say);
  $('bvZip').onclick = () => ctx.zipPreviews(say);
  el.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=number],input[type=text]')) return;
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
    else if (e.key === 'Escape') close();
    else if (e.key >= '0' && e.key <= '5') { const it = items()[cur]; it.stars = +e.key; if (!it.pickSet) it.pick = it.stars >= 4; paint(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  function open(i) { el.hidden = false; document.body.classList.add('batchOpen'); z = 1; tx = ty = 0; go(i); requestAnimationFrame(layout); el.tabIndex = -1; el.focus(); }
  function close() { el.hidden = true; document.body.classList.remove('batchOpen'); }
  return { open, close, go, get index() { return cur; }, get zoom() { return { z, tx, ty }; } };
}

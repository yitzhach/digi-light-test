// calibrate.js — Calibrate · match your raking photo.
//
// For a photo lit by one lamp close to the wall. The user enters where the lamp
// was, measured from the painting's edges; the graze light becomes that lamp (a
// point, so its angle and brightness change across the painting as the real one's
// did), and the relief is read with the light from that direction. A match score
// compares the graze render with the photo, and Auto-fit nudges the lamp, texture
// depth and room light, one at a time, keeping whatever raises the score, until
// nothing does (a hill climb).
//
// One photo is a weak check: the relief is estimated from the same photo it is
// compared with, and texture depth and the lamp's distance from the wall trade off
// (both set how long shadows are). So Auto-fit stays near the measured lamp, and
// the score says how consistent the settings are, not that they are true. A second
// shot from the same tripod position, evenly lit, would make it a real check.

import { lampAngles, LAMP_OUT_MIN, FILL_MAX, GRAZE_AMBIENT, SIDE_SHARE } from './presets.js';

const CM = { in: 2.54, cm: 1 };
const MATCH_W = 320;          // the score is measured on a copy this wide
const FIT_EVALS = 80;         // Auto-fit's budget of renders

// Box blur, separable, in place on a copy; r in pixels.
function blur(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))]; t[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, y + k)) * w + x]; o[y * w + x] = s / n;
  }
  return o;
}
// Share of the photo's variation in one band that the render reproduces: 1 is a
// perfect match, 0 no better than a flat grey.
function corr(p, r) {
  let mp = 0, mr = 0; const n = p.length;
  for (let i = 0; i < n; i++) { mp += p[i]; mr += r[i]; }
  mp /= n; mr /= n; let pp = 0, rr = 0, pr = 0;
  for (let i = 0; i < n; i++) { const a = p[i] - mp, b = r[i] - mr; pp += a * a; rr += b * b; pr += a * b; }
  return pp > 0 && rr > 0 ? pr / Math.sqrt(pp * rr) : 0;
}
function explained(p, r) {
  let mp = 0, md = 0; const n = p.length;
  for (let i = 0; i < n; i++) { mp += p[i]; md += p[i] - r[i]; }
  mp /= n; md /= n;
  let vp = 0, vd = 0;
  for (let i = 0; i < n; i++) { vp += (p[i] - mp) ** 2; vd += (p[i] - r[i] - md) ** 2; }
  return vp > 0 ? 1 - vd / vp : 0;
}
/** How well the render's relief reproduces the photo's. `p` is the photo, `r` the
 *  graze render and `flat` the same render with the relief turned off (brightness
 *  images, w x h). Both are taken over `flat`: the colour the app reads from the
 *  photo and the lamp's falloff cancel, leaving only what the relief adds. A flat
 *  render then scores 0, however much it looks like the photo, which is what stops
 *  a fit from simply switching the relief off. Scored on the broad band: relief
 *  and shadows wider than a few pixels of a MATCH_W copy, and the lamp's falloff. */
export function matchScore(p, r, flat, w, h) {
  const norm = a => { let m = 0; for (const v of a) m += v; m = a.length / Math.max(1e-6, m); return a.map(v => v * m); };
  const a = norm(p.map((v, i) => v / Math.max(0.02, flat[i]))), b = norm(r.map((v, i) => v / Math.max(0.02, flat[i])));
  const a2 = blur(a, w, h, 2), b2 = blur(b, w, h, 2);
  const af = a.map((v, i) => v - a2[i]), bf = b.map((v, i) => v - b2[i]);
  const fine = explained(af, bf), broad = explained(a2, b2);
  // Only the broad band is scored. The fine band says nothing: the colour the app
  // reads from a single photo keeps its fine shading, so none is left over for the
  // relief to match (measured on a real raking photo: correlation about 0 at any
  // setting), while the broad band peaked at the measured lamp and depth.
  return { fine, broad, score: broad, corrFine: corr(af, bf), corrBroad: corr(a2, b2) };
}

export function initCalibrate({ state, api, after, setGraze, renderGraze, syncQuick, checkpoint, usePhotoAzimuth, splitView }) {
  const $ = id => document.getElementById(id);
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'calibrateSection';
  const row = (id, label) => `<div class="row calRow"><label for="${id}">${label}</label><input id="${id}" type="range"><input id="${id}N" type="number" aria-label="${label}"></div>`;
  box.innerHTML = `<summary>Calibrate · match your raking photo</summary><div class="grp">
    <p class="note">For a photo lit by one lamp close to the wall. Measure from the painting's edges: the app works out the light's angles across the painting.</p>
    <label class="selectRow">Units<select id="calUnits"><option value="in">inches</option><option value="cm">cm</option></select></label>
    ${row('calWidth', 'Painting width')}
    ${row('calAbove', 'Lamp above top edge')}
    ${row('calLeft', 'Lamp from left edge')}
    ${row('calOut', 'Lamp out from wall')}
    <p class="note" id="calGeometry"></p>
    <button id="calUse">Light it like the photo</button>
    ${row('calDepth', 'Texture depth (mm)')}
    ${row('calFill', 'Room light')}
    <div class="calScore"><button id="calMeasure">Match score</button><output id="calScore">–</output><button id="calSplit">Split with photo</button></div>
    <div class="calFitWhat"><span>Auto-fit may change</span>
      <label><input type="checkbox" id="calFitPos" checked> lamp position</label>
      <label><input type="checkbox" id="calFitOut"> lamp distance from wall</label>
      <label><input type="checkbox" id="calFitDepth" checked> texture depth</label>
      <label><input type="checkbox" id="calFitFill" checked> room light</label></div>
    <div class="calScore"><button id="calFit">Auto-fit</button><button id="calStop" disabled>Stop</button><output id="calFitStatus"></output></div>
    <p class="note">Auto-fit tries small changes to the ticked settings and keeps each one that raises the match: the lamp within about half a painting width of your measurements, its distance from the wall from half to twice yours, texture depth from a quarter to four times yours. Depth and the lamp's distance from the wall both set how long the shadows are, so one photo cannot tell them apart: fit one and keep the other as measured. With one photo the relief is read from the same picture, so a high score means the settings agree with it, not that they are exact. Undo goes back to before the fit.</p>
  </div>`;
  after.after(box);

  let units = 'in';
  try { units = localStorage.getItem('digilight-units') || 'in'; } catch {}
  $('calUnits').value = units;
  const aspect = () => { const c = api.canvas; return c.height / Math.max(1, c.width); };
  // The lamp the sliders show before one is in use: centred, over the top edge.
  const draftLamp = () => ({ left: state.paintingWidthCm / 2, above: state.paintingWidthCm / 2, out: state.paintingWidthCm / 10 });
  let draft = null;
  const lamp = () => state.graze.lamp || draft || (draft = draftLamp());

  // Lengths in cm in state; shown in the chosen units.
  const LEN = {
    calWidth: { get: () => state.paintingWidthCm, set: v => { state.paintingWidthCm = Math.min(300, Math.max(10, v)); api.dirty(); }, min: 10, max: 300 },
    calAbove: { get: () => lamp().above, set: v => setLamp({ above: v }), min: -150, max: 300 },
    calLeft: { get: () => lamp().left, set: v => setLamp({ left: v }), min: -150, max: 450 },
    calOut: { get: () => lamp().out, set: v => setLamp({ out: Math.max(LAMP_OUT_MIN, v) }), min: LAMP_OUT_MIN, max: 120 },
  };
  function setLamp(change) {
    const next = { ...lamp(), ...change };
    if (state.graze.lamp) applyLamp(next); else draft = next;
  }
  // The graze light becomes the lamp; its dial and Angle to wall show the lamp as
  // seen from the painting's centre, and the relief is read from that direction.
  function applyLamp(l) {
    const c = lampAngles(l, state.paintingWidthCm, aspect());
    setGraze({ lamp: l, angle: (Math.round(c.angle * 2) / 2) % 360, elevation: Math.min(20, Math.max(1, Math.round(c.elevation * 2) / 2)) });
    if (state.photoDiffuse < 0.5 && Math.round(c.angle) !== state.azimuthDeg) { state.azimuthDeg = Math.round(c.angle); api.dirty(); }
  }

  function geometryNote() {
    const a = aspect(), w = state.paintingWidthCm, l = lamp(), u = CM[units], f = v => (v / u).toFixed(1);
    const at = (x, y) => lampAngles(l, w, a, x, y);
    const c = at(0.5, 0.5), top = at(0.5, 1), bottom = at(0.5, 0);
    // Light on the wall from a point goes as the sine of its angle over distance squared.
    const lit = ([x, y]) => { const p = at(x, y); return Math.sin(p.elevation * Math.PI / 180) / p.dist ** 2; };
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(lit);
    $('calGeometry').textContent = `Painting ${f(w)} × ${f(w * a)} ${units}. Light comes from ${Math.round(c.angle)}° at the centre. ` +
      `Angle to the wall: ${top.elevation.toFixed(1)}° at the top, ${c.elevation.toFixed(1)}° in the middle, ${bottom.elevation.toFixed(1)}° at the bottom. ` +
      `The brightest corner gets ${(Math.max(...corners) / Math.min(...corners)).toFixed(1)}× the light of the dimmest.` +
      (state.graze.lamp ? '' : ' Not in use yet: press Light it like the photo.');
  }

  function sync() {
    const u = CM[units], step = units === 'in' ? 0.25 : 0.5;
    for (const [id, d] of Object.entries(LEN)) {
      const v = d.get() / u;
      Object.assign($(id), { min: d.min / u, max: d.max / u, step }); $(id).value = v;
      Object.assign($(id + 'N'), { min: (d.min / u).toFixed(2), max: (d.max / u).toFixed(2), step }); $(id + 'N').value = +v.toFixed(2);
    }
    const mm = state.textureDepthMm;
    Object.assign($('calDepth'), { min: 0, max: 10, step: 0.05 }); $('calDepth').value = mm;
    Object.assign($('calDepthN'), { min: 0, max: 10, step: 0.05 }); $('calDepthN').value = +mm.toFixed(2);
    $('calDepthN').title = `${(mm / 25.4).toFixed(3)} in (mm)`;
    const fill = state.graze.fill ?? GRAZE_AMBIENT;
    Object.assign($('calFill'), { min: 0, max: FILL_MAX, step: 0.01 }); $('calFill').value = fill;
    Object.assign($('calFillN'), { min: 0, max: FILL_MAX, step: 0.01 }); $('calFillN').value = +fill.toFixed(2);
    $('calUse').classList.toggle('on', !!state.graze.lamp);
    $('calUse').textContent = state.graze.lamp ? 'Lit like the photo ✓' : 'Light it like the photo';
    geometryNote();
  }

  function edited(id, v) {
    if (!Number.isFinite(v)) return;
    if (LEN[id]) LEN[id].set(v * CM[units]);
    else if (id === 'calDepth') { state.textureDepthMm = Math.min(10, Math.max(0, v)); api.dirty(); syncQuick(); }
    else if (id === 'calFill') setGraze({ fill: Math.min(FILL_MAX, Math.max(0, v)) });
    sync(); api.render();
  }
  for (const id of [...Object.keys(LEN), 'calDepth', 'calFill']) {
    $(id).oninput = e => edited(id, +e.target.value);
    $(id + 'N').onchange = e => edited(id, +e.target.value);
    $(id).onchange = () => checkpoint();
    $(id + 'N').addEventListener('change', () => checkpoint());
  }
  $('calUnits').onchange = e => { units = e.target.value; try { localStorage.setItem('digilight-units', units); } catch {} sync(); };
  $('calUse').onclick = () => {
    const l = lamp();
    usePhotoAzimuth(lampAngles(l, state.paintingWidthCm, aspect()).angle, SIDE_SHARE);
    setGraze({ opacity: 1, fill: state.graze.fill ?? GRAZE_AMBIENT });
    applyLamp(l); draft = null;
    sync(); renderGraze(); api.render(); checkpoint();
  };
  $('calSplit').onclick = () => splitView();

  // ---------------------------------------------------------------- match score
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });
  let photoLuma = null, photoKey = null, flatCache = {};
  // Brightness as the eye sees it (sRGB-encoded luma), over its own mean so the
  // photo's exposure and the render's cancel. Not log light: there the render's
  // near-black graze shadows would outweigh everything else.
  function luma(src, w, h) {
    work.width = w; work.height = h; wctx.drawImage(src, 0, 0, w, h);
    const d = wctx.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += out[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    const k = out.length / Math.max(1e-6, sum);
    for (let i = 0; i < out.length; i++) out[i] *= k;
    return out;
  }
  /** Renders the graze light alone (as at 100% opacity, without layers or the
   *  Before/Split view), with and without relief, and scores it against the photo
   *  (matchScore); the view is restored. */
  function measure() {
    const src = api.source(); if (!src) return null;
    const w = MATCH_W, h = Math.max(8, Math.round(MATCH_W * aspect()));
    const key = `${src.width}x${src.height}:${w}x${h}`;
    if (photoKey !== key || photoLuma?.src !== src) { photoLuma = luma(src, w, h); photoLuma.src = src; photoKey = key; }
    const saved = { viewMode: state.viewMode, compareSplit: state.compareSplit, layers: state.layers, enabled: state.graze.enabled, opacity: state.graze.opacity };
    Object.assign(state, { viewMode: 0, compareSplit: -1, layers: [] });
    Object.assign(state.graze, { enabled: true, opacity: 1 });
    try {
      api.renderNow(); const r = luma(api.canvas, w, h);
      // The flat render depends only on the lamp and the room light.
      const flatKey = JSON.stringify([key, state.graze.lamp, state.graze.fill, state.exposure]);
      if (flatKey !== flatCache.key) {
        const amount = state.reliefAmount; state.reliefAmount = 0;
        try { api.renderNow(); flatCache = { key: flatKey, luma: luma(api.canvas, w, h) }; } finally { state.reliefAmount = amount; }
      }
      return matchScore(photoLuma, r, flatCache.luma, w, h);
    } finally {
      Object.assign(state, { viewMode: saved.viewMode, compareSplit: saved.compareSplit, layers: saved.layers });
      Object.assign(state.graze, { enabled: saved.enabled, opacity: saved.opacity });
      api.render();
    }
  }
  const pct = m => `${Math.round(Math.max(0, m.score) * 1000) / 10}%`;
  function showScore(m) {
    $('calScore').textContent = m ? pct(m) : '–';
  }
  $('calMeasure').onclick = () => { if (!state.graze.lamp) $('calUse').click(); showScore(measure()); };

  // ---------------------------------------------------------------- Auto-fit
  let stop = false, fitting = false;
  async function autoFit(maxEvals = FIT_EVALS, use) {
    if (fitting) return null;
    if (!state.graze.lamp) $('calUse').click();
    fitting = true; stop = false; $('calFit').disabled = true; $('calStop').disabled = false;
    const W = state.paintingWidthCm, m0 = { ...state.graze.lamp }, d0 = state.textureDepthMm;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    // `use` (tests) overrides the ticked boxes: { calFitPos: true, ... }
    const on = id => use ? !!use[id] : $(id).checked;
    const P = [
      { use: on('calFitPos'), get: () => state.graze.lamp.left, set: v => applyLamp({ ...state.graze.lamp, left: v }), step: 0.08 * W, lo: m0.left - 0.5 * W, hi: m0.left + 0.5 * W },
      { use: on('calFitPos'), get: () => state.graze.lamp.above, set: v => applyLamp({ ...state.graze.lamp, above: v }), step: 0.08 * W, lo: m0.above - 0.5 * W, hi: m0.above + 0.5 * W },
      { use: on('calFitOut'), get: () => state.graze.lamp.out, set: v => applyLamp({ ...state.graze.lamp, out: v }), step: 0.25 * m0.out, lo: Math.max(LAMP_OUT_MIN, m0.out / 2), hi: m0.out * 2 },
      { use: on('calFitDepth'), get: () => state.textureDepthMm, set: v => { state.textureDepthMm = v; api.dirty(); }, step: Math.max(0.1, 0.25 * d0), lo: Math.max(0.05, d0 / 4), hi: Math.min(10, Math.max(1, d0 * 4)) },
      { use: on('calFitFill'), get: () => state.graze.fill ?? GRAZE_AMBIENT, set: v => { state.graze.fill = v; }, step: 0.05, lo: 0, hi: FILL_MAX },
    ].filter(p => p.use);
    let best = measure(), evals = 1, rounds = 0;
    const start = best;
    const progress = () => { $('calFitStatus').textContent = `${evals}/${maxEvals} · ${pct(best)}`; showScore(best); };
    progress();
    try {
      while (evals < maxEvals && !stop && rounds < 5) {
        let improved = false;
        for (const p of P) {
          for (const dir of [1, -1]) {
            if (evals >= maxEvals || stop) break;
            const was = p.get(), v = clamp(was + dir * p.step, p.lo, p.hi);
            if (Math.abs(v - was) < 1e-6) continue;
            p.set(v); const m = measure(); evals++;
            if (m && m.score > best.score + 1e-4) { best = m; improved = true; progress(); break; }
            p.set(was);
            progress();
            await new Promise(r => requestAnimationFrame(r));
          }
        }
        if (!improved) { for (const p of P) p.step /= 2; rounds++; }
      }
    } finally {
      fitting = false; $('calFit').disabled = false; $('calStop').disabled = true;
      api.dirty(); syncQuick(); sync(); renderGraze(); api.render(); checkpoint();
      $('calFitStatus').textContent = `Done: ${pct(start)} → ${pct(best)} in ${evals} tries${stop ? ' (stopped)' : ''}.`;
      showScore(best);
    }
    return { start, best, evals };
  }
  $('calFit').onclick = () => autoFit();
  $('calStop').onclick = () => { stop = true; };

  sync();
  return { sync, measure, autoFit, forgetDraft: () => { draft = null; } };
}

// lampui.js — Measure relief · lamp photos (the section under Calibrate).
//
// The painting photo is the evenly lit shot; the user adds two or three shots from
// the same tripod with one lamp near the wall, says where the lamp was for each
// (from the painting's edges, in Calibrate's units), and Measure relief replaces
// the single-photo estimate with relief measured from them (lampphotos.js). The
// measurement is saved in projects (reliefsave.js); the photos are not.

import { measureRelief, align } from './lampphotos.js';
import { textureScore, fitDepth as fitDepthTo, BIG_MM } from './texscore.js';
import { clippingOf, CLIP_HI, CLIP_LO } from './photocheck.js';

const CM = { in: 2.54, cm: 1 };

export function initLampPhotos({ state, api, after, cal, checkpoint, syncQuick, snapshot, restore, setBatching }) {
  const $ = (id) => document.getElementById(id);
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'lampSection';
  box.innerHTML = `<summary>Measure relief · lamp photos</summary><div class="grp">
    <p class="note">An evenly lit photo hides most of the relief. To measure it, take two or three more photos from the same tripod, with the room light as it was, each with one lamp close to the wall, moved between shots so it lights the painting from different sides: say above the top-left corner, above the top-right, and one from below or level with the middle. With every lamp above, faces turned down stay dark in all of them and the relief reads shallower than it is. Crop them exactly like your painting photo, which should be the evenly lit one. Measure each lamp from the painting's top and left edges and out from its painted face (not the wall). Painting width and units are Calibrate's. Saved projects keep the measured relief, not the photos. Glare from varnish reads as steep slopes: glints are found and left out, and a polarising filter on the lamp with a crossed one on the lens removes most of it before it happens.</p>
    <div id="lampRows"></div>
    <div class="calScore"><button id="lampAdd">Add lamp photos…</button><input type="file" id="lampFile" accept="image/*" multiple hidden><button id="lampSample" hidden>Add the sample's lamp photos</button></div>
    <div class="calScore"><button id="lampMeasure" disabled>Measure relief</button><output id="lampStatus"></output></div>
    <label class="lampUse"><input type="checkbox" id="lampUse" disabled> Use measured relief</label>
    <p class="note" id="lampResult"></p>
    <div class="calScore"><button id="lampFit" disabled title="Render each lamp photo's light at several depths and keep the one whose stroke contrast matches the photos">Fit depth to photos</button><output id="lampFitStatus"></output></div>
    <p class="note" id="lampFitResult">Fit depth sets Texture depth so the render under each lamp has as much stroke contrast as the lamp photo: brightness over a ${BIG_MM} mm blur of itself, then its spread (the RL-Sq score from raking-light roughness work). It works with measured or one-photo relief. Set the graze light's Room light first: more room light means less contrast, so a deeper fit.</p>
  </div>`;
  after.after(box);

  const rows = [];        // {name, img, w, h, lamp: {left, above, out} in cm, map}
  let comparing = -1, busy = false;
  const units = () => cal.units();
  const fmt = (cm) => +(cm / CM[units()]).toFixed(2);
  const W = () => state.paintingWidthCm;
  // A first guess for each new photo: over the top-left corner, the middle, the top-right.
  const guess = (i) => ({ left: [0, 0.5, 1][i % 3] * W(), above: 0.4 * W(), out: 0.4 * W() });

  function renderRows() {
    const host = $('lampRows'); host.innerHTML = '';
    rows.forEach((r, i) => {
      const el = document.createElement('div'); el.className = 'lampRow';
      el.innerHTML = `<canvas class="lampThumb" width="64" height="${Math.max(8, Math.round(64 * r.h / r.w))}"></canvas>
        <div class="lampFields">
          <div class="lampName"><span title="${r.name.replace(/"/g, '&quot;')}">${i + 1}. ${r.name.replace(/</g, '&lt;')}</span>
            <button data-act="light" title="Graze light becomes this lamp">Light like this</button>
            <button data-act="compare" class="${comparing === i ? 'on' : ''}" title="Before / Split show this photo">Compare</button>
            <button data-act="del" aria-label="Remove lamp photo ${i + 1}">✕</button></div>
          ${r.clip?.warn ? `<p class="note warn lampClip">${r.clip.warn}</p>` : ''}
          <label>Above top edge<input type="number" step="0.25" data-k="above" value="${fmt(r.lamp.above)}"></label>
          <label>From left edge<input type="number" step="0.25" data-k="left" value="${fmt(r.lamp.left)}"></label>
          <label>Out from painting<input type="number" step="0.25" min="0.1" data-k="out" value="${fmt(r.lamp.out)}"></label>
        </div>`;
      const tc = el.querySelector('canvas'), tx = tc.getContext('2d');
      tx.imageSmoothingQuality = 'high'; tx.drawImage(r.img, 0, 0, tc.width, tc.height);
      el.querySelectorAll('input').forEach((inp) => {
        inp.onchange = () => {
          const v = +inp.value * CM[units()]; if (!Number.isFinite(v)) return;
          r.lamp[inp.dataset.k] = inp.dataset.k === 'out' ? Math.max(0.2, v) : v;
        };
      });
      el.querySelector('[data-act=del]').onclick = () => {
        if (comparing === i) stopCompare();
        else if (comparing > i) comparing--;
        rows.splice(i, 1); renderRows();
      };
      el.querySelector('[data-act=light]').onclick = () => lightLike(i);
      el.querySelector('[data-act=compare]').onclick = () => (comparing === i ? stopCompare() : compare(i));
      host.append(el);
    });
    $('lampMeasure').disabled = busy || !rows.length;
    $('lampFit').disabled = busy || !rows.length || !api.source();
    $('lampSample').hidden = api.sample() !== 'dsc8382' || rows.some((r) => r.name.startsWith('DSC_83'));
    const m = api.measured.get();
    $('lampUse').disabled = !m; $('lampUse').checked = !!m?.on;
  }

  async function addFiles(files) {
    for (const f of files) {
      try {
        const img = await createImageBitmap(f);
        rows.push({ name: f.name, img, w: img.width, h: img.height, lamp: guess(rows.length), map: null, clip: clippingOf(img) });
      } catch { $('lampStatus').textContent = `Could not open ${f.name}.`; }
    }
    renderRows();
  }
  $('lampAdd').onclick = () => $('lampFile').click();
  $('lampFile').onchange = async (e) => { await addFiles([...e.target.files]); e.target.value = ''; };

  // The DSC_8382 sample's lamp shots, cropped to the panel like it (19 in wide, 2.5 in
  // deep). Heights above the top edge and distances out are the user's, less the
  // panel's depth; distances from the left edge were read off the panel's shadows on
  // the wall beside it (the lines of the shadows' top edges meet below the lamp).
  const SAMPLE_LAMPS = [['DSC_8379', 9.39, 9, 6.5], ['DSC_8380', -2.8, 9.75, 5.75], ['DSC_8381', 22.41, 9.5, 6]];
  $('lampSample').onclick = async () => {
    $('lampSample').disabled = true;
    try {
      for (const [name, left, above, out] of SAMPLE_LAMPS) {
        const img = await createImageBitmap(await (await fetch(`samples/dsc8382/${name}.jpg`)).blob());
        rows.push({ name: `${name}.jpg`, img, w: img.width, h: img.height, lamp: { left: left * 2.54, above: above * 2.54, out: out * 2.54 }, map: null, clip: clippingOf(img) });
      }
      if (Math.abs(state.paintingWidthCm - 48.26) > 0.01) { state.paintingWidthCm = 48.26; api.dirty(); syncQuick(); cal.sync(); api.render(); checkpoint(); }
      $('lampStatus').textContent = 'Sample lamp photos added; painting width set to 19 in.';
    } catch { $('lampStatus').textContent = 'Could not load the sample lamp photos.'; }
    finally { $('lampSample').disabled = false; renderRows(); }
  };

  // Every photo drawn at the preview's size, as RGBA bytes.
  const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
  function pixels(img, w, h) {
    work.width = w; work.height = h; wctx.drawImage(img, 0, 0, w, h);
    return wctx.getImageData(0, 0, w, h).data;
  }

  async function measure({ glints = true } = {}) {
    const w = api.canvas.width, h = api.canvas.height, src = api.source();
    if (!src || !rows.length || busy) return null;
    const aspect = h / w;
    const off = rows.find((r) => Math.abs(r.h / r.w - aspect) > 0.02 * aspect);
    if (off) { $('lampStatus').textContent = `${off.name} is not cropped like the painting photo (shape differs). Crop all photos alike.`; return null; }
    busy = true; renderRows(); $('lampResult').textContent = '';
    try {
      const res = await measureRelief({
        even: pixels(src, w, h), w, h, widthCm: W(),
        shots: rows.map((r) => ({ rgba: pixels(r.img, w, h), lamp: { ...r.lamp } })), glints,
        onProgress: (m) => { $('lampStatus').textContent = m; },
      });
      res.shots.forEach((s, i) => { rows[i].map = s.align.map; });
      api.measured.set(res.height, w, h, { depthMm: res.depthMm, check: res.check, shots: res.shots });
      // Measured heights are in true units, so the depth is measured too.
      state.physical = 1;
      state.textureDepthMm = Math.min(10, Math.max(0.05, +res.depthMm.toFixed(2)));
      api.dirty(); syncQuick(); cal.sync(); api.render(); checkpoint();
      $('lampStatus').textContent = 'Done.';
      $('lampResult').innerHTML = report(res);
      if (comparing >= 0) compare(comparing);
      return res;
    } finally { busy = false; renderRows(); }
  }
  $('lampMeasure').onclick = () => measure();
  $('lampUse').onchange = (e) => { api.measured.use(e.target.checked); };

  function report(res) {
    const u = units(), wTxt = `${(W() / CM[u]).toFixed(u === 'in' ? 1 : 0)} ${u}`;
    const lines = [`<b>Measured relief ${res.depthMm.toFixed(2)} mm deep</b> (2–98% spread) on a ${wTxt} wide painting; Texture depth is set to it.`];
    const al = res.shots.map((s, i) => {
      const [ax, bx, cx, ay, by, cy] = s.align.map, w = res.w, h = res.h;
      const dx = ax * w / 2 + bx * h / 2 + cx, dy = ay * w / 2 + by * h / 2 + cy, zoom = (ax + by) / 2 * 100;
      return `${i + 1}: ${Math.hypot(dx, dy).toFixed(1)} px${Math.abs(zoom) >= 0.05 ? `, zoom ${zoom > 0 ? '+' : ''}${zoom.toFixed(2)}%` : ''}${s.align.used < s.align.of / 2 ? ' (uncertain)' : ''}`;
    });
    lines.push(`Lined up to the painting photo: ${al.join(' · ')}. Room light: ${res.shots.map((s) => Math.round(s.room * 100) + '%').join(', ')} of each lamp photo's brightness.`);
    if (res.shots.some((s) => s.glint != null)) lines.push(`Glints left out: ${res.shots.map((s) => (s.glint * 100).toFixed(2) + '%').join(', ')} of each lamp photo.`);
    if (res.check) {
      const lo = Math.min(...res.check), verdict = lo >= 0.6 ? 'good' : lo >= 0.35 ? 'usable' : 'poor: check the lamp positions and that the photos line up';
      lines.push(`Check: each lamp photo predicted from the others at r = ${res.check.map((c) => c.toFixed(2)).join(', ')} (${verdict}).`);
    } else if (res.shots.length === 2) lines.push('Add a third lamp photo and the measurement can check itself.');
    else lines.push('One lamp photo measures the slopes along its light only; add one lit from another side.');
    return lines.join('<br>');
  }

  // Graze light as this lamp. With measured relief in use, without the smoothing that
  // hides a one-photo estimate's grain: there is no grain to hide, and the render is
  // meant to be set against the photo.
  function lightLike(i) {
    const raw = api.measured.get()?.on ? { detail: 0, clean: 0, fine: 1, soft: 0 } : {};
    cal.useLamp(rows[i].lamp, raw);
  }

  // The lamp photo at the preview's size, lined up as the measurement found it.
  function lined(r, w = api.canvas.width, h = api.canvas.height) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (r.map) {
      // map: photo pixel (X, Y) shows shot pixel (X + ax X + bx Y + cx, Y + ay X + by Y + cy);
      // the canvas transform takes shot pixels to photo pixels, so it is the inverse.
      const [ax, bx, cx, ay, by, cy] = r.map, a = 1 + ax, b = bx, d = ay, e = 1 + by, det = a * e - b * d;
      const ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
      x.setTransform(ia, id, ib, ie, -(ia * cx + ib * cy), -(id * cx + ie * cy));
    }
    x.drawImage(r.img, 0, 0, w, h);
    return c;
  }
  // Before / Split show the lamp photo, lined up.
  function compare(i) {
    const c = lined(rows[i]);
    comparing = i; api.measured.compare(c);
    $('wrap').dataset.before = `LAMP ${i + 1}`;
    lightLike(i);
    if (state.compareSplit < 0) $('splitView').click();
    renderRows();
  }
  function stopCompare() {
    comparing = -1; api.measured.compare(null); delete $('wrap').dataset.before;
    if (state.compareSplit >= 0) $('splitView').click();
    renderRows();
  }

  // ---------------------------------------------------------------- Fit depth
  // Texture depth from the contrast match (texscore.js): each lamp's photo is scored
  // once; for a trial depth the graze light becomes each lamp in turn (as Light like
  // this), the render is scored, and the mean log ratio render / photo is driven to 0.
  // The settings come back afterwards except Texture depth, in one undo step.
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  function renderPixels() {
    const keep = { viewMode: state.viewMode, compareSplit: state.compareSplit, layers: state.layers };
    Object.assign(state, { viewMode: 0, compareSplit: -1, layers: [] });
    try { api.renderNow(); return pixels(api.canvas, api.canvas.width, api.canvas.height); } finally { Object.assign(state, keep); }
  }
  /** Score of the current render and of lamp photo i, both on the preview. */
  const mmPerPx = () => W() * 10 / api.canvas.width;
  // Clipped pixels (blown or crushed in the photo, or outside it once lined up) carry no
  // shading: left out of both scores.
  function scorePhoto(i) {
    const w = api.canvas.width, h = api.canvas.height, r = rows[i];
    if (!r.map) r.map = align(pixels(api.source(), w, h), pixels(r.img, w, h), w, h).map;
    const px = pixels(lined(r, w, h), w, h), mask = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) {
      const a = px[k * 4], b = px[k * 4 + 1], c = px[k * 4 + 2];
      mask[k] = px[k * 4 + 3] < 255 || a >= CLIP_HI || b >= CLIP_HI || c >= CLIP_HI || (a <= CLIP_LO && b <= CLIP_LO && c <= CLIP_LO) ? 1 : 0;
    }
    return { score: textureScore(px, w, h, mmPerPx(), { mask }).score, mask };
  }
  let fitStop = false;
  async function fitDepth({ lamps, lo = 0.25, hi = 10 } = {}) {
    if (busy || !rows.length || !api.source()) return null;
    const use = (lamps ?? rows.map((_, i) => i)).filter((i) => rows[i]);
    busy = true; fitStop = false; renderRows();
    const snap = snapshot(), d0 = state.textureDepthMm, w = api.canvas.width, h = api.canvas.height;
    const per = use.map(() => []);
    let res, photo;
    setBatching(true);
    try {
      $('lampFitStatus').textContent = 'Scoring the lamp photos…'; await frame();
      const scored = use.map((i) => scorePhoto(i)), masks = scored.map((p) => p.mask);
      photo = scored.map((p) => p.score);
      let tries = 0;
      res = await fitDepthTo(async (d) => {
        state.physical = 1; state.textureDepthMm = d; api.dirty();
        let lg = 0;
        for (const [k, i] of use.entries()) {
          lightLike(i);
          const sc = textureScore(renderPixels(), w, h, mmPerPx(), { mask: masks[k] }).score, ratio = sc / Math.max(1e-6, photo[k]);
          per[k].push([d, ratio, sc]); lg += Math.log(Math.max(1e-6, ratio));
        }
        tries++; $('lampFitStatus').textContent = `Try ${tries}: ${d.toFixed(2)} mm → ${Math.round(Math.exp(lg / use.length) * 100)}% of the photos' contrast`;
        await frame();
        return Math.exp(lg / use.length);
      }, { lo, hi, stop: () => fitStop });
    } finally {
      restore(snap); setBatching(false); busy = false; api.dirty();
    }
    // Each lamp's own crossing, read off its samples (straight lines on log depth).
    // Null when its samples never reach 1 (or are past it at the first).
    const cross = (s) => {
      const t = [...s].sort((a, b) => a[0] - b[0]);
      for (let j = 1; j < t.length; j++) if ((t[j - 1][1] < 1) !== (t[j][1] < 1)) {
        const f = (1 - t[j - 1][1]) / (t[j][1] - t[j - 1][1]);
        return Math.exp(Math.log(t[j - 1][0]) + f * (Math.log(t[j][0]) - Math.log(t[j - 1][0])));
      }
      return null;
    };
    const lampTxt = (l) => {
      if (l.depth) return `${l.depth.toFixed(2)} mm`;
      const t = [...l.samples].sort((a, b) => a[0] - b[0]);
      return t[0][1] >= 1 ? `under ${t[0][0].toFixed(2)} mm` : `over ${t.at(-1)[0].toFixed(2)} mm`;
    };
    const depth = Math.min(10, Math.max(0.05, +res.depth.toFixed(2)));
    const out = { ...res, depth, from: d0, photo, lamps: use.map((i, k) => ({ lamp: i + 1, photo: photo[k], depth: cross(per[k]), samples: per[k] })), stopped: fitStop };
    if (!fitStop) {
      state.physical = 1; state.textureDepthMm = depth;
      api.dirty(); syncQuick(); cal.sync(); api.render(); checkpoint();
    } else api.render();
    const m = api.measured.get(), spread = m?.on && m.info?.depthMm;
    $('lampFitStatus').textContent = fitStop ? 'Stopped.' : 'Done.';
    $('lampFitResult').innerHTML = fitStop ? '' :
      (res.reached === 'yes' ? `<b>Texture depth ${depth.toFixed(2)} mm</b>: the renders match the lamp photos' stroke contrast` :
        res.reached === 'low' ? `<b>Texture depth ${depth.toFixed(2)} mm</b> (the shallowest tried): even that has more stroke contrast than the photos (${Math.round(res.ratio * 100)}%)` :
          `<b>Texture depth ${depth.toFixed(2)} mm</b> (the deepest tried): even that has only ${Math.round(res.ratio * 100)}% of the photos' stroke contrast; lower Room light or check the lamp positions`) +
      ` (${m?.on ? 'measured' : 'one-photo'} relief${spread ? `, measured spread ${spread.toFixed(2)} mm` : ''}; was ${d0.toFixed(2)} mm). ` +
      `Each lamp alone: ${out.lamps.map((l) => `${l.lamp}: ${lampTxt(l)}`).join(' · ')}. ` +
      `Photo contrast: ${photo.map((p) => (p * 100).toFixed(1) + '%').join(', ')}. Undo goes back.` +
      (m?.on ? '' : ' With one-photo relief much of the render\'s contrast is grain read from the colour, not strokes (on DSC_8382 it hardly tracks the real relief), so trust this depth less than one fitted on measured relief.');
    renderRows();
    return out;
  }
  $('lampFit').onclick = () => fitDepth();

  document.addEventListener('digilight:units', renderRows);
  document.addEventListener('digilight:source', renderRows);
  document.addEventListener('digilight:measured', () => {
    const m = api.measured.get();
    if (!m) { $('lampResult').textContent = ''; if (comparing >= 0) { comparing = -1; delete $('wrap').dataset.before; } }
    else if (!$('lampResult').textContent && m.info?.depthMm != null) $('lampResult').textContent = `Measured relief from the project, ${m.info.depthMm.toFixed(2)} mm deep.${rows.length ? '' : ' Add the lamp photos again to compare or re-measure.'}`;
    renderRows();
  });
  renderRows();
  return { rows, addFiles, measure, compare, stopCompare, lightLike, fitDepth, scorePhoto, stopFit: () => { fitStop = true; } };
}

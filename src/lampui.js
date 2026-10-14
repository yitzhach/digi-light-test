// lampui.js — Measure relief · lamp photos (the section under Calibrate).
//
// The painting photo is the evenly lit shot; the user adds two or three shots from
// the same tripod with one lamp near the wall, says where the lamp was for each
// (from the painting's edges, in Calibrate's units), and Measure relief replaces
// the single-photo estimate with relief measured from them (lampphotos.js). Kept
// for this session only: the photos are not saved in projects or undo.

import { measureRelief } from './lampphotos.js';

const CM = { in: 2.54, cm: 1 };

export function initLampPhotos({ state, api, after, cal, checkpoint, syncQuick }) {
  const $ = (id) => document.getElementById(id);
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'lampSection';
  box.innerHTML = `<summary>Measure relief · lamp photos</summary><div class="grp">
    <p class="note">An evenly lit photo hides most of the relief. To measure it, take two or three more photos from the same tripod, with the room light as it was, each with one lamp close to the wall, moved between shots so it lights the painting from different sides: say above the top-left corner, above the top-right, and one from below or level with the middle. With every lamp above, faces turned down stay dark in all of them and the relief reads shallower than it is. Crop them exactly like your painting photo, which should be the evenly lit one. Measure each lamp from the painting's top and left edges and out from its painted face (not the wall). Painting width and units are Calibrate's. The photos and the measurement last for this session; projects do not save them yet.</p>
    <div id="lampRows"></div>
    <div class="calScore"><button id="lampAdd">Add lamp photos…</button><input type="file" id="lampFile" accept="image/*" multiple hidden><button id="lampSample" hidden>Add the sample's lamp photos</button></div>
    <div class="calScore"><button id="lampMeasure" disabled>Measure relief</button><output id="lampStatus"></output></div>
    <label class="lampUse"><input type="checkbox" id="lampUse" disabled> Use measured relief</label>
    <p class="note" id="lampResult"></p>
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
    $('lampSample').hidden = api.sample() !== 'dsc8382' || rows.some((r) => r.name.startsWith('DSC_83'));
    const m = api.measured.get();
    $('lampUse').disabled = !m; $('lampUse').checked = !!m?.on;
  }

  async function addFiles(files) {
    for (const f of files) {
      try {
        const img = await createImageBitmap(f);
        rows.push({ name: f.name, img, w: img.width, h: img.height, lamp: guess(rows.length), map: null });
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
        rows.push({ name: `${name}.jpg`, img, w: img.width, h: img.height, lamp: { left: left * 2.54, above: above * 2.54, out: out * 2.54 }, map: null });
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

  async function measure() {
    const w = api.canvas.width, h = api.canvas.height, src = api.source();
    if (!src || !rows.length || busy) return null;
    const aspect = h / w;
    const off = rows.find((r) => Math.abs(r.h / r.w - aspect) > 0.02 * aspect);
    if (off) { $('lampStatus').textContent = `${off.name} is not cropped like the painting photo (shape differs). Crop all photos alike.`; return null; }
    busy = true; renderRows(); $('lampResult').textContent = '';
    try {
      const res = await measureRelief({
        even: pixels(src, w, h), w, h, widthCm: W(),
        shots: rows.map((r) => ({ rgba: pixels(r.img, w, h), lamp: { ...r.lamp } })),
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

  // Before / Split show the lamp photo, lined up as the measurement found it.
  function compare(i) {
    const r = rows[i], w = api.canvas.width, h = api.canvas.height;
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

  document.addEventListener('digilight:units', renderRows);
  document.addEventListener('digilight:source', renderRows);
  document.addEventListener('digilight:measured', () => {
    const m = api.measured.get();
    if (!m) { $('lampResult').textContent = ''; if (comparing >= 0) { comparing = -1; delete $('wrap').dataset.before; } }
    renderRows();
  });
  renderRows();
  return { rows, addFiles, measure, compare, stopCompare, lightLike };
}

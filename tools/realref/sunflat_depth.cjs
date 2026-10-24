// sunflat_depth.cjs — on tests/sunflat.cjs's stand-in (truth known), renders under the sun at
// several depths, for tools/realref/score.py: does light-and-shade r fall with depth even when the
// depth is right? (docs/real-light-test.md "10-24, later": yes; the low sun's shadows, not a wrong depth.)
//
//   DIGILIGHT_BROWSER=... node tools/realref/sunflat_depth.cjs OUTDIR [DEPTH_MM=3]   (~2 min)
//   cd OUTDIR && python3 REPO/tools/realref/score.py orig.png sun.png truth_x0.5.png truth_x2.png meas_x0.5.png meas_x1.png meas_x2.png meas_hp.png
//
// sun.png: the truth rendered under the lintel's sun (40°, 10.3°) at DEPTH, the "photo"; truth_xK: the
// truth at K x DEPTH; meas_xK: the relief measured back from sun.png (with the truth's lowest to highest)
// at K x its Texture depth; meas_hp: the same at x1 with its broadest relief (60 px blur) taken out.
// Prints how the measured relief follows the truth in score.py's bands (r, size).
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const { launch, dataURL, fromDataURL } = require(path.join(REPO, 'tools', 'digilight-headless.cjs'));
const PHOTO = path.join(REPO, 'testdata', 'photos', 'lintel-flat-crop.jpg');
const SUN = { azimuthDeg: 40, elevationDeg: 10.3 }, WIDTH_CM = 52.07;
const [out, depthArg] = process.argv.slice(2); const DEPTH = +depthArg || 3;
const GRAZE = { 'graze.enabled': true, 'graze.opacity': 1, 'graze.sun': true, 'graze.angle': SUN.azimuthDeg, 'graze.elevation': SUN.elevationDeg,
  'graze.fill': 0.025, 'graze.detail': 0, 'graze.fine': 1, 'graze.lift': 0 };

(async () => {
  const s = await launch(); const { call, page } = s;
  fs.mkdirSync(out, { recursive: true });
  const save = async (name) => { const r = await call('export', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), fromDataURL(r)); return r; };
  try {
    await call('load', dataURL(PHOTO));
    await call('setGuard', false);
    await call('set', { paintingWidthCm: WIDTH_CM });
    await call('set', { originalTop: 1 }); await save('orig'); await call('set', { originalTop: 0 });
    const truth = await page.evaluate(async () => {
      const { encodeRelief } = await import('/src/reliefsave.js');
      const { boxBlur } = await import('/src/lampphotos.js');
      const c = __bench.canvas, w = c.width, h = c.height, n = w * h;
      let seed = 11; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const unit = (a) => { let q = 0; for (const v of a) q += v * v; q = Math.sqrt(q / a.length); return a.map((v) => v / q); };
      const white = () => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rand() - 0.5; return a; };
      const drip = (() => {
        let t = white(); const tmp = new Float32Array(n);
        for (let p = 0; p < 3; p++) {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let q = 0; for (let k = -2; k <= 2; k++) q += t[y * w + Math.min(w - 1, Math.max(0, x + k))]; tmp[y * w + x] = q / 5; }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let q = 0; for (let k = -14; k <= 14; k++) q += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; t[y * w + x] = q / 29; }
        }
        return unit(t);
      })();
      const fine = unit(boxBlur(white(), w, h, 1, 2)), stroke = unit(boxBlur(white(), w, h, 3)), mid = unit(boxBlur(white(), w, h, 10)), broad = unit(boxBlur(white(), w, h, 60));
      const height = new Float32Array(n);
      for (let i = 0; i < n; i++) height[i] = 0.1 * fine[i] + 0.35 * drip[i] + 0.35 * stroke[i] + 0.3 * mid[i] + 0.35 * broad[i];
      const m = Math.round(0.02 * w), v = []; let lo = Infinity, hi = -Infinity;
      for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) { const z = height[y * w + x]; v.push(z); lo = Math.min(lo, z); hi = Math.max(hi, z); }
      v.sort((a, b) => a - b);
      const spread = v[Math.floor(0.98 * (v.length - 1))] - v[Math.floor(0.02 * (v.length - 1))];
      window.__truth = height; window.__enc = encodeRelief;
      return { w, h, range: (hi - lo) / spread, relief: encodeRelief({ height, w, h, on: true, depthMm: null }) };
    });
    const setRelief = async (relief) => { const p = await call('getProject'); await call('setProject', { ...p, relief }); };
    await setRelief(truth.relief);
    const rangeMm = DEPTH * truth.range;
    await call('set', { textureDepthMm: DEPTH, ...GRAZE });
    const sunPhoto = await save('sun');
    for (const k of [0.5, 2]) { await call('set', { textureDepthMm: DEPTH * k }); await save('truth_x' + k); }
    await call('set', { 'graze.enabled': false, 'graze.sun': false });
    const photos = [{ src: sunPhoto, sun: SUN }];
    const artist = await call('measureRelief', { photos, deepestMm: rangeMm });
    const A = artist.textureDepthMm;
    console.log(JSON.stringify({ DEPTH, rangeMm, artistTexture: A, measured: { spread: artist.depthMm, range: artist.rangeMm } }));
    for (const k of [0.5, 1, 2]) { await call('set', { textureDepthMm: A * k, ...GRAZE }); await save('meas_x' + k); }
    // Variants of the measured relief, at the artist's depth: broad removed; band errors.
    const variants = await page.evaluate(async () => {
      const { boxBlur } = await import('/src/lampphotos.js');
      const m = __bench.measured(), w = m.w, h = m.h, M = m.height, T = window.__truth;
      const sp = (a) => { const k = Math.round(0.02 * w), v = []; for (let y = k; y < h - k; y++) for (let x = k; x < w - k; x++) v.push(a[y * w + x]); v.sort((p, q) => p - q); return v[Math.floor(0.98 * (v.length - 1))] - v[Math.floor(0.02 * (v.length - 1))]; };
      const R = [1, 6, 24, 80];
      const bands = (a) => { const bl = [a, ...R.map((r) => boxBlur(a, w, h, r))]; return [0, 1, 2, 3, 4].map((i) => i < 4 ? bl[i].map((v, j) => v - bl[i + 1][j]) : bl[4]); };
      const dot = (A, B) => { let t = 0; for (let i = 0; i < A.length; i++) t += A[i] * B[i]; return t; };
      const bM = bands(M), bT = bands(T);
      // Each band's r with the truth and its size over the truth's, both at the same 2-98% spread.
      const stats = bM.map((b, i) => ({ r: dot(b, bT[i]) / Math.sqrt(dot(b, b) * dot(bT[i], bT[i])), sizeRatio: Math.sqrt(dot(b, b) / dot(bT[i], bT[i])) * sp(T) / sp(M) }));
      const hp = new Float32Array(w * h), b80 = boxBlur(M, w, h, 60); for (let i = 0; i < hp.length; i++) hp[i] = M[i] - b80[i];
      return { stats, hp: window.__enc({ height: hp, w, h, on: true, depthMm: null }), spM: sp(M), spHp: sp(hp) };
    });
    console.log(JSON.stringify({ bandsMeasuredVsTruth: variants.stats.map((s) => [+s.r.toFixed(2), +s.sizeRatio.toFixed(2)]) }));
    await setRelief(variants.hp);
    // The same stroke-scale size as meas_x1: Texture depth scaled by the spreads.
    await call('set', { textureDepthMm: A * variants.spHp / variants.spM, ...GRAZE }); await save('meas_hp');
    if (s.errors.length) console.error(s.errors.join('\n'));
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

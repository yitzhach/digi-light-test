// sunflat.cjs — the depth of a relief measured from one sun photo, where the truth is known.
//   cd tools && npm install && cd .. && DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/sunflat.cjs   (~4 min)
// The stand-in: the lintel panel's flat photo (testdata/photos) as the paint, a known relief of
// many small steep features over a few mm (like plaster: drips, strokes, a little broad form)
// loaded as measured relief at a known Texture depth, and the app's own render of it under a
// low sun (graze.sun, 40°, 10.3°, as on the real lintel) as the sun photo, times the slow
// unevenness an indoor flat photo has against an outdoor one (±25%, a tilt and broad blotches).
// That photo is measured back (measureRelief) with the artist's deepest relief (the truth's
// lowest to highest) and without (Fit depth). One sun photo measures no broad forms, so the
// yardstick is the depth at which the measured relief's stroke-scale slopes along the sun are as
// steep as the truth's. Before 10-24 (shadows read as flat ground, a drift cut that kept errors as
// broad forms, which set the range) the depth from the artist's range was 0.32 of it: the strokes
// three times too shallow, as on the real lintel; Fit depth made up for it (0.86) and the two
// were 2.7 times apart. Since: the artist's 1.06, Fit depth 0.72 (the measurement's own noise
// adds contrast, so a fit to the photo's contrast comes out a little shallow), 0.68 apart.
// Checks: the measured relief follows the truth at stroke scale, the depth from the artist's
// range within 25% of the yardstick, Fit depth within 0.6-1.25 of it.
const assert = require('node:assert/strict');
const path = require('path');
const { launch, dataURL } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));
const PHOTO = path.join(__dirname, '..', 'testdata', 'photos', 'lintel-flat-crop.jpg');
const SUN = { azimuthDeg: 40, elevationDeg: 10.3 }, WIDTH_CM = 52.07, DEPTH = 1.5;

(async () => {
  const s = await launch();
  const { call, page } = s;
  try {
    await call('load', dataURL(PHOTO));
    await call('setGuard', false);
    await call('set', { paintingWidthCm: WIDTH_CM, albedoSuppress: 0 });
    // The known relief, at the preview's size, put in as measured relief through a project.
    const truth = await page.evaluate(async () => {
      const { encodeRelief } = await import('/src/reliefsave.js');
      const { boxBlur } = await import('/src/lampphotos.js');
      const c = __bench.canvas, w = c.width, h = c.height, n = w * h;
      let seed = 11; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const unit = (a) => { let q = 0; for (const v of a) q += v * v; q = Math.sqrt(q / a.length); return a.map((v) => v / q); };
      const white = () => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rand() - 0.5; return a; };
      // Drips: noise stretched downwards (2 px across, 14 px along).
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
      // Spread (2-98%) and full range, away from the edges, as lampphotos.js measures them.
      const m = Math.round(0.02 * w), v = []; let lo = Infinity, hi = -Infinity;
      for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) { const z = height[y * w + x]; v.push(z); lo = Math.min(lo, z); hi = Math.max(hi, z); }
      v.sort((a, b) => a - b);
      const spread = v[Math.floor(0.98 * (v.length - 1))] - v[Math.floor(0.02 * (v.length - 1))];
      window.__truth = height;
      return { w, h, range: (hi - lo) / spread, relief: encodeRelief({ height, w, h, on: true, depthMm: null }) };
    });
    const project = await call('getProject');
    await call('setProject', { ...project, relief: truth.relief });
    const rangeMm = DEPTH * truth.range;
    await call('set', { textureDepthMm: DEPTH, 'graze.enabled': true, 'graze.opacity': 1, 'graze.sun': true, 'graze.angle': SUN.azimuthDeg, 'graze.elevation': SUN.elevationDeg,
      'graze.fill': 0.025, 'graze.detail': 0, 'graze.fine': 1, 'graze.lift': 0 });
    const sunPhoto = await call('render', { format: 'png' });
    // Slow unevenness between the flat photo and the sun photo, in linear light.
    const uneven = await page.evaluate(async (url) => {
      const { boxBlur } = await import('/src/lampphotos.js');
      const im = new Image(); await new Promise((r) => { im.onload = r; im.src = url; });
      const w = im.width, h = im.height, c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, w, h);
      let seed = 5; const a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
      const b = boxBlur(a, w, h, Math.round(0.12 * w)); let q = 0; for (const v of b) q += v * v; q = Math.sqrt(q / b.length);
      const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const toS = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
      for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
        const i = y * w + X, k = Math.exp(0.25 * (0.6 * b[i] / q + 0.8 * (X / w - 0.5) - 0.5 * (y / h - 0.5)));
        for (let ch = 0; ch < 3; ch++) d.data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(toS(Math.min(1, toLin(d.data[i * 4 + ch]) * k)))));
      }
      x.putImageData(d, 0, 0);
      return c.toDataURL('image/png');
    }, sunPhoto);
    await call('set', { 'graze.enabled': false, 'graze.sun': false });
    const photos = [{ src: uneven, sun: SUN }];
    const artist = await call('measureRelief', { photos, deepestMm: rangeMm });
    // The measured relief against the truth at stroke scale (band 1-6 px): how well it follows it
    // (r), and the depth at which its slopes along the sun, the ones a render under that sun shows,
    // are as steep as the truth's (truthDepth; regression of measured on true, so noise in the
    // measurement does not lower it). One sun photo measures no broad forms, so this, not the depth
    // the truth was made at, is what a depth for the measured relief should come to.
    const stroke = await page.evaluate(async ({ az, depth }) => {
      const { boxBlur } = await import('/src/lampphotos.js');
      const m = __bench.measured(), w = m.w, h = m.h, T = window.__truth, d = [Math.cos(az * Math.PI / 180), -Math.sin(az * Math.PI / 180)];
      const band = (a) => { const p = boxBlur(a, w, h, 1, 2), q = boxBlur(a, w, h, 6, 2); return p.map((v, i) => v - q[i]); };
      const along = (a) => { const g = new Float32Array(w * h); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; g[i] = 0.5 * (d[0] * (a[i + 1] - a[i - 1]) + d[1] * (a[i + w] - a[i - w])); } return g; };
      const spread = (a) => { const k = Math.round(0.02 * w), v = []; for (let y = k; y < h - k; y++) for (let x = k; x < w - k; x++) v.push(a[y * w + x]); v.sort((p, q) => p - q); return v[Math.floor(0.98 * (v.length - 1))] - v[Math.floor(0.02 * (v.length - 1))]; };
      const dot = (A, B) => { let t = 0; for (let i = 0; i < A.length; i++) t += A[i] * B[i]; return t; };
      const A = band(m.height), B = band(T), gA = band(along(m.height)), gB = band(along(T));
      return { r: dot(A, B) / Math.sqrt(dot(A, A) * dot(B, B)), truthDepth: depth * (spread(m.height) / spread(T)) / (dot(gA, gB) / dot(gB, gB)) };
    }, { az: SUN.azimuthDeg, depth: DEPTH });
    const fitted = await call('measureRelief', { photos });
    const a = artist.textureDepthMm, f = fitted.fit && fitted.fit.reached === 'yes' ? fitted.fit.depth : NaN, t = stroke.truthDepth;
    console.log(`made at ${DEPTH} mm (full range ${rangeMm.toFixed(2)} mm); the measured relief follows it at r ${stroke.r.toFixed(2)} (stroke scale) and is as steep as it at ${t.toFixed(2)} mm. ` +
      `Fit depth ${f} mm (x${(f / t).toFixed(2)}), from the artist's range ${a} mm (x${(a / t).toFixed(2)}), measured at the true sun angle ${artist.depthMm.toFixed(2)} mm (x${(artist.depthMm / t).toFixed(2)}; range ${artist.rangeMm.toFixed(2)} mm)`);
    assert.ok(stroke.r > 0.8, `stroke-scale height r ${stroke.r}`);
    assert.ok(Math.abs(Math.log(a / t)) < Math.log(1.25), `depth from the artist's range ${a} mm against ${t.toFixed(2)}`);
    assert.ok(f / t > 0.6 && f / t < 1.25, `Fit depth ${f} mm against ${t.toFixed(2)}`);
    assert.deepEqual(s.errors, []);
    console.log('PASS one sun photo of a known relief: the strokes come back at their depth from the artist\'s range; Fit depth near it');
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

// graze-lab.cjs — measure graze-light artifacts against known relief.
//
// Renders the Graze light on synthetic paintings whose true height field is known
// (src/synth.js), twice per setting: once from the relief the app estimates from
// the photo, once with that estimate swapped for the true heights (via the
// GBuffer afterHeight seam). The gap between the two is the artificial texture
// the estimate adds. Not part of the deployed site.
//
// Usage: serve the repo root, then
//   node tools/graze-lab.cjs [--port 8766] [--out DIR] [--elev 1,2.5,5,10]
//        [--angle 155] [--graze '{"...":...}'] [--state '{"...":...}']
// Writes DIR/<case>.png contact sheets (top row estimate, bottom row truth, one
// column per elevation) and DIR/metrics.json; prints the metrics.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 8766);
const OUT = arg('out', fs.mkdtempSync(path.join(require('os').tmpdir(), 'graze-lab-')));
const ELEV = arg('elev', '1,2.5,5,10').split(',').map(Number);
const ANGLE = +arg('angle', 155);
const GRAZE = JSON.parse(arg('graze', '{}'));
const STATE = JSON.parse(arg('state', '{}'));
fs.mkdirSync(OUT, { recursive: true });

// Two adversaries: an evenly lit plaster-like surface whose achromatic grain reads
// as relief, and a one-light repro of an oil with chromatic mottle and some grain.
const CASES = [
  { name: 'plaster-even', synth: { lighting: 'diffuse', pigmentDetail: 0.35, grain: 0.35, seed: 11 }, photo: { photoDiffuse: 0.6 } },
  { name: 'oil-onelight', synth: { lighting: 'single', pigmentDetail: 0.35, grain: 0.1, seed: 7 }, photo: { photoDiffuse: 0, azimuthDeg: 141 } },
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.DIGILIGHT_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}`);
  await page.waitForFunction(() => window.__bench && window.__studio);
  const results = {};
  for (const c of CASES) {
    const png = await page.evaluate(async (opt) => {
      const { synthesizePainting } = await import('/src/synth.js');
      const s = synthesizePainting({ width: 900, height: 1200, ...opt });
      window.__truth = s.height;
      const cv = document.createElement('canvas'); cv.width = s.width; cv.height = s.rows;
      cv.getContext('2d').putImageData(s.image, 0, 0);
      return cv.toDataURL().split(',')[1];
    }, c.synth);
    await page.locator('#file').setInputFiles({ name: c.name + '.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => __bench.canvas.width === 900);
    await page.waitForTimeout(300);
    const r = await page.evaluate(async ({ photo, elev, angle, graze, extra }) => {
      const b = __bench, s = b.state, gl = b.glctx.gl;
      Object.assign(s, photo, extra); b.dirty();
      const W = b.canvas.width, H = b.canvas.height;
      const truth = new Float32Array(W * H * 4);
      for (let i = 0; i < W * H; i++) { truth[i * 4] = __truth[i]; truth[i * 4 + 1] = __truth[i]; truth[i * 4 + 3] = 1; }
      const useTruth = (on) => {
        b.gbuf.afterHeight = on ? (T, w, h) => {
          if (w !== W || h !== H) return;
          gl.bindTexture(gl.TEXTURE_2D, T.height.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, truth);
        } : null;
        b.dirty();
      };
      const grab = () => {
        b.render();
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(b.canvas, 0, 0);
        return { c, d: x.getImageData(0, 0, W, H).data };
      };
      const luma = (d) => { const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; return L; };
      const blur = (L, r) => {   // separable box blur, radius r
        const t = new Float32Array(W * H), o = new Float32Array(W * H);
        for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += L[y * W + Math.min(W - 1, Math.max(0, x))];
          for (let x = 0; x < W; x++) { t[y * W + x] = acc / (2 * r + 1); acc += L[y * W + Math.min(W - 1, x + r + 1)] - L[y * W + Math.max(0, x - r)]; } }
        for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += t[Math.min(H - 1, Math.max(0, y)) * W + x];
          for (let y = 0; y < H; y++) { o[y * W + x] = acc / (2 * r + 1); acc += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
        return o;
      };
      const B = 24;
      const corr = (a, c) => { let sa = 0, sc = 0, saa = 0, scc = 0, sac = 0, n = 0;
        for (let y = B; y < H - B; y++) for (let x = B; x < W - B; x++) { const i = y * W + x; sa += a[i]; sc += c[i]; saa += a[i] * a[i]; scc += c[i] * c[i]; sac += a[i] * c[i]; n++; }
        const ma = sa / n, mc = sc / n; return (sac / n - ma * mc) / Math.sqrt(Math.max(1e-12, (saa / n - ma * ma) * (scc / n - mc * mc))); };
      const stat = (L) => { const lo = blur(L, 2); let hf = 0, dark = 0, mean = 0, n = 0;
        for (let y = B; y < H - B; y++) for (let x = B; x < W - B; x++) { const i = y * W + x; hf += Math.abs(L[i] - lo[i]); dark += L[i] < 0.06 ? 1 : 0; mean += L[i]; n++; }
        return { hf: hf / n, dark: dark / n, mean: mean / n }; };
      const sheet = document.createElement('canvas'); const CW = 300;
      sheet.width = CW * elev.length; sheet.height = CW * 2;
      const sx = sheet.getContext('2d');
      const out = [];
      for (let k = 0; k < elev.length; k++) {
        Object.assign(s.graze, { enabled: true, angle, elevation: elev[k], opacity: 1 }, graze);
        useTruth(false); const e = grab(); useTruth(true); const t = grab(); useTruth(false);
        const Le = luma(e.d), Lt = luma(t.d), se = stat(Le), st = stat(Lt);
        out.push({ elevation: elev[k], corr: +corr(Le, Lt).toFixed(3), corrBroad: +corr(blur(Le, 4), blur(Lt, 4)).toFixed(3),
          hfRatio: +(se.hf / st.hf).toFixed(2), darkEst: +se.dark.toFixed(3), darkTruth: +st.dark.toFixed(3),
          meanEst: +se.mean.toFixed(3), meanTruth: +st.mean.toFixed(3) });
        const cx = Math.round(W * 0.35), cy = Math.round(H * 0.4);
        sx.drawImage(e.c, cx, cy, CW, CW, k * CW, 0, CW, CW);
        sx.drawImage(t.c, cx, cy, CW, CW, k * CW, CW, CW, CW);
      }
      b.dirty(); b.render();
      return { rows: out, sheet: sheet.toDataURL().split(',')[1] };
    }, { photo: c.photo, elev: ELEV, angle: ANGLE, graze: GRAZE, extra: STATE });
    fs.writeFileSync(path.join(OUT, c.name + '.png'), Buffer.from(r.sheet, 'base64'));
    results[c.name] = r.rows;
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify({ out: OUT, errors, results }, null, 1));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

// graze-lab.cjs — measure graze-light artifacts against known relief.
//
// Renders the Graze light on synthetic paintings whose true height field is known
// (src/synth.js): from the relief the app estimates from the photo, and from the
// true heights swapped in through the GBuffer afterHeight seam. Two references:
// the truth rendered with the SAME graze settings (corr, corrBroad, hfRatio), and
// the truth rendered with a fixed full-detail graze (--ref, default Detail 0 and
// Fine 1; metrics suffixed F). The second matters because smoothing the graze also
// smooths the same-settings truth, which would make the comparison look easier
// than it is. Not part of the deployed site.
//
// Usage: serve the repo root, then
//   node tools/graze-lab.cjs [--port 8766] [--out DIR] [--elev 1,2.5,5,10]
//        [--angle 155] [--graze '{"...":...}'] [--state '{"...":...}']
//        [--ref '{"detail":0,"fine":1}'] [--cache DIR]
// Writes DIR/<case>.png contact sheets (rows: estimate, truth with the same
// settings, truth with the reference settings; one column per elevation) and
// DIR/metrics.json; prints the metrics. Reference renders are cached as PNGs in
// --cache (default DIR/refcache); only share a cache between runs of the same code.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 8766);
const OUT = arg('out', fs.mkdtempSync(path.join(require('os').tmpdir(), 'graze-lab-')));
const CACHE = arg('cache', path.join(OUT, 'refcache'));
const ELEV = arg('elev', '1,2.5,5,10').split(',').map(Number);
const ANGLE = +arg('angle', 155);
const GRAZE = JSON.parse(arg('graze', '{}'));
const REF = JSON.parse(arg('ref', '{"detail":0,"fine":1}'));
const STATE = JSON.parse(arg('state', '{}'));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

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
    const refs = ELEV.map((e) => { const f = path.join(CACHE, `${c.name}-${ANGLE}-${e}.png`); return fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : null; });
    const t0 = Date.now();
    const r = await page.evaluate(async ({ photo, elev, angle, graze, ref, refs, extra }) => {
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
        const t = performance.now();
        b.render();
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(b.canvas, 0, 0);
        return { c, d: x.getImageData(0, 0, W, H).data, ms: performance.now() - t };
      };
      const fromPng = async (b64) => {
        const im = new Image(); await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        return { c, d: x.getImageData(0, 0, W, H).data };
      };
      const luma = (d) => { const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; return L; };
      const blur = (L, r) => {
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
      sheet.width = CW * elev.length; sheet.height = CW * 3;
      const sx = sheet.getContext('2d');
      // Start every render from the app's own graze defaults, so settings not named
      // in --graze or --ref keep the values a user would get.
      const g0 = { ...s.graze };
      const out = [], newRefs = [];
      for (let k = 0; k < elev.length; k++) {
        const base = { enabled: true, angle, elevation: elev[k], opacity: 1 };
        let f;
        if (refs[k]) { f = await fromPng(refs[k]); newRefs.push(null); }
        else { s.graze = Object.assign({}, g0, base, ref); useTruth(true); f = grab(); useTruth(false); newRefs.push(f.c.toDataURL().split(',')[1]); }
        s.graze = Object.assign({}, g0, base, graze);
        useTruth(false); const e = grab(); useTruth(true); const t = grab(); useTruth(false);
        const Le = luma(e.d), Lt = luma(t.d), Lf = luma(f.d), se = stat(Le), st = stat(Lt), sf = stat(Lf);
        const bE = blur(Le, 4);
        out.push({ elevation: elev[k], corr: +corr(Le, Lt).toFixed(3), corrBroad: +corr(bE, blur(Lt, 4)).toFixed(3),
          hfRatio: +(se.hf / st.hf).toFixed(2),
          corrF: +corr(Le, Lf).toFixed(3), corrBroadF: +corr(bE, blur(Lf, 4)).toFixed(3), hfRatioF: +(se.hf / sf.hf).toFixed(2),
          truthSelfF: +corr(Lt, Lf).toFixed(3), truthSelfBroadF: +corr(blur(Lt, 4), blur(Lf, 4)).toFixed(3), truthHfF: +(st.hf / sf.hf).toFixed(2),
          darkEst: +se.dark.toFixed(3), darkTruth: +st.dark.toFixed(3),
          meanEst: +se.mean.toFixed(3), meanTruth: +st.mean.toFixed(3), meanTruthF: +sf.mean.toFixed(3), ms: Math.round(e.ms) });
        const cx = Math.round(W * 0.35), cy = Math.round(H * 0.4);
        sx.drawImage(e.c, cx, cy, CW, CW, k * CW, 0, CW, CW);
        sx.drawImage(t.c, cx, cy, CW, CW, k * CW, CW, CW, CW);
        sx.drawImage(f.c, cx, cy, CW, CW, k * CW, 2 * CW, CW, CW);
      }
      s.graze = g0; b.dirty(); b.render();
      return { rows: out, sheet: sheet.toDataURL().split(',')[1], newRefs };
    }, { photo: c.photo, elev: ELEV, angle: ANGLE, graze: GRAZE, ref: REF, refs, extra: STATE });
    r.newRefs.forEach((b64, k) => { if (b64) fs.writeFileSync(path.join(CACHE, `${c.name}-${ANGLE}-${ELEV[k]}.png`), Buffer.from(b64, 'base64')); });
    fs.writeFileSync(path.join(OUT, c.name + '.png'), Buffer.from(r.sheet, 'base64'));
    results[c.name] = r.rows;
    console.error(c.name, 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ graze: GRAZE, state: STATE, results }, null, 1));
  const line = (r) => `${String(r.elevation).padStart(4)}deg  ${r.corr.toFixed(3)}/${r.corrBroad.toFixed(3)}/${r.hfRatio.toFixed(2)}  vsFull ${r.corrF.toFixed(3)}/${r.corrBroadF.toFixed(3)}/${r.hfRatioF.toFixed(2)}  truthVsFull ${r.truthSelfF.toFixed(3)}/${r.truthSelfBroadF.toFixed(3)}/${r.truthHfF.toFixed(2)}  mean ${r.meanEst}/${r.meanTruth}/${r.meanTruthF} dark ${r.darkEst}/${r.darkTruth} ${r.ms}ms`;
  for (const [k, rows] of Object.entries(results)) { console.log(k); rows.forEach((r) => console.log('  ' + line(r))); }
  if (errors.length) console.log('ERRORS', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

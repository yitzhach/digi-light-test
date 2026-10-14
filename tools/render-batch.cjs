// render-batch.cjs — render a numbered batch of look variants for the user to judge.
//
// One base scene (a sample, optionally with its lamp photos and measured relief, or a
// saved .digilight.json project), then each variant as a patch on top of it: state
// keys, graze keys, per-light keys, measured or one-photo relief, and optionally
// "Light like this" for lamp photo N. Each variant starts again from the base.
// Not part of the deployed site.
//
// Usage: serve the repo root, then
//   node tools/render-batch.cjs --spec batch.json [--out DIR] [--port 8766]
// spec:
//   { "base": { "sample": "dsc8382" } | { "project": "path/to/project.digilight.json" },
//     "lampPhotos": true,        // dsc8382 only: add the sample's lamp shots
//     "measure": true,           // run Measure relief (needs lampPhotos); the base keeps the
//                                // measured spread as depth unless "autoFit": true (the app's
//                                // own Measure relief then fits the depth, as the button does)
//     "fitDepth": { "lamps": [0, 1, 2], "fill": 0.25, "relief": "measured" },  // Fit depth to
//                                // photos (needs lampPhotos); fill = graze room light and relief
//                                // = measured | onephoto during the fit; a variant's
//                                // "state": { "textureDepthMm": "fit" } uses the fitted depth
//     "common": { "state": {}, "graze": {}, "lights": [{}] },   // applied to every variant
//     "variants": [ { "name": "lift +50%", "relief": "measured" | "onephoto",
//                     "lightLike": 0, "state": {}, "graze": {}, "lights": [{ "lift": 0.5 }] } ] }
// Writes DIR/NN-name.png (the relit preview), DIR/original.png, DIR/lamp-N.png (each
// lamp photo lined up to the painting, when measured), DIR/sheet.png (numbered contact
// sheet) and DIR/results.json (settings and, where a variant uses Light like this,
// metrics against that lamp photo: shadow depth p10/p50, local p10 of y over its 51 px
// box mean, log-luma RMS after a median gain match, and the RL-Sq style texture
// contrast score of src/texscore.js, render / photo as textureMatch; photo values
// alongside).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 8766);
const SPEC = JSON.parse(fs.readFileSync(arg('spec'), 'utf8'));
const OUT = arg('out', fs.mkdtempSync(path.join(require('os').tmpdir(), 'render-batch-')));
fs.mkdirSync(OUT, { recursive: true });
const save = (name, url) => fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9+-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.DIGILIGHT_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1350, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?synth`);
  await page.waitForFunction(() => window.__bench && window.__studio);

  // ---- base scene
  const synthW = await page.evaluate(() => __bench.canvas.width);
  if (SPEC.base?.sample) {
    await page.selectOption('#samplePick', SPEC.base.sample);
  } else if (SPEC.base?.project) {
    await page.locator('#projectFile').setInputFiles(path.resolve(SPEC.base.project));
  } else throw new Error('spec.base needs sample or project');
  await page.waitForFunction((w) => __bench.canvas.width !== w, synthW);
  await page.waitForTimeout(800);
  let measured = null;
  if (SPEC.lampPhotos) {
    await page.evaluate(() => document.querySelector('#lampSample').click());
    await page.waitForFunction(() => __studio.lamp.rows.length >= 1);
    await page.waitForTimeout(500);
    if (SPEC.measure) {
      measured = await page.evaluate(async (fit) => { const r = await __studio.lamp.measure({ fit }); return r && { depthMm: r.depthMm, fitMm: r.fit?.depth, check: r.check }; }, !!SPEC.autoFit);
      console.log('measured relief', JSON.stringify(measured));
      const n = await page.evaluate(() => __studio.lamp.rows.length);
      for (let i = 0; i < n; i++) save(`lamp-${i + 1}.png`, await page.evaluate((i) => {
        const r = __studio.lamp.rows[i], w = __bench.canvas.width, h = __bench.canvas.height;
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        const [ax, bx, cx, ay, by, cy] = r.map, a = 1 + ax, b = bx, d = ay, e = 1 + by, det = a * e - b * d;
        const ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
        x.setTransform(ia, id, ib, ie, -(ia * cx + ib * cy), -(id * cx + ie * cy)); x.drawImage(r.img, 0, 0, w, h);
        return c.toDataURL('image/png');
      }, i));
    }
  }
  save('original.png', await page.evaluate(() => { const s = __bench.state, v = s.viewMode; s.viewMode = 4; __bench.render(); const u = __bench.canvas.toDataURL('image/png'); s.viewMode = v; __bench.render(); return u; }));
  const base = await page.evaluate(() => JSON.stringify(__studio.snapshot()));
  // After the base, which keeps its own depth: variants ask for the fit with "fit".
  let fit = null;
  if (SPEC.fitDepth) {
    const f = SPEC.fitDepth === true ? {} : SPEC.fitDepth;
    fit = await page.evaluate(async (f) => {
      const s = __bench.state, keep = s.graze.fill, use = document.querySelector('#lampUse');
      if (f.fill != null) s.graze.fill = f.fill;
      if (f.relief && use && !use.disabled && use.checked !== (f.relief === 'measured')) use.click();
      const r = await __studio.lamp.fitDepth({ lamps: f.lamps });
      s.graze.fill = keep;
      return r && { relief: __bench.measured()?.on ? 'measured' : 'one-photo', depth: r.depth, reached: r.reached, ratio: r.ratio, from: r.from, fill: f.fill ?? keep, samples: r.samples, lamps: r.lamps };
    }, f);
    console.log('fit depth', JSON.stringify({ relief: fit.relief, depth: fit.depth, reached: fit.reached, fill: fit.fill, lamps: fit.lamps.map((l) => [l.lamp, l.depth && +l.depth.toFixed(2), +l.photo.toFixed(4)]) }));
  }

  // ---- variants
  const results = [];
  for (const [k, v] of SPEC.variants.entries()) {
    const num = String(k + 1).padStart(2, '0'), name = v.name || `variant ${k + 1}`;
    const out = await page.evaluate(async ({ base, v, common, fitDepth }) => {
      __studio.restore(JSON.parse(base));
      const use = document.querySelector('#lampUse');
      if (use && !use.disabled) { const on = (v.relief ?? common.relief ?? 'measured') === 'measured'; if (use.checked !== on) use.click(); }
      if (v.lightLike != null) __studio.lamp.lightLike(v.lightLike);
      const s = __bench.state;
      for (const p of [common, v]) {
        Object.assign(s, p.state || {});
        if (s.textureDepthMm === 'fit') { s.textureDepthMm = fitDepth; s.physical = 1; }
        if (p.graze) Object.assign(s.graze, p.graze);
        (p.lights || []).forEach((l, i) => { if (l && s.lights[i]) Object.assign(s.lights[i], l); });
      }
      s.compareSplit = -1; s.viewMode = 0;
      document.dispatchEvent(new Event('digilight:settings'));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      __bench.render();
      return { url: __bench.canvas.toDataURL('image/png'), settings: { graze: s.graze, lights: s.lights.map(({ rgb, ...l }) => l), exposure: s.exposure, ambient: s.ambient, textureDepthMm: s.textureDepthMm }, measuredOn: !!__bench.measured()?.on };
    }, { base, v, common: SPEC.common || {}, fitDepth: fit?.depth });
    const file = `${num}-${slug(name)}.png`;
    save(file, out.url);
    results.push({ num: k + 1, name, file, relief: out.measuredOn ? 'measured' : 'one-photo', lightLike: v.lightLike ?? null, settings: out.settings });
    console.log(`${num} ${name}`);
  }

  // ---- metrics against the lamp photo, and the contact sheet (both in the page)
  const imgs = Object.fromEntries(['original.png', ...results.map((r) => r.file), ...fs.readdirSync(OUT).filter((f) => /^lamp-\d+\.png$/.test(f))]
    .map((f) => [f, 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64')]));
  const done = await page.evaluate(async ({ imgs, results }) => {
    const { textureScore } = await import('/src/texscore.js');
    const tex = (img) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return textureScore(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, __bench.state.paintingWidthCm * 10 / c.width).score;
    };
    const load = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
    const lumaOf = (img) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
      const m = 12, w = c.width - 2 * m, h = c.height - 2 * m, y = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = ((j + m) * c.width + i + m) * 4; y[j * w + i] = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255; }
      return { y, w, h };
    };
    const pct = (a, q) => { const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q / 100 * s.length))]; };
    const boxMean = ({ y, w, h }, r) => {
      const I = new Float64Array((w + 1) * (h + 1));
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) I[(j + 1) * (w + 1) + i + 1] = y[j * w + i] + I[j * (w + 1) + i + 1] + I[(j + 1) * (w + 1) + i] - I[j * (w + 1) + i];
      const o = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x0 = Math.max(0, i - r), x1 = Math.min(w, i + r + 1), y0 = Math.max(0, j - r), y1 = Math.min(h, j + r + 1);
        o[j * w + i] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      }
      return o;
    };
    const stats = (L) => { const b = boxMean(L, 25), loc = L.y.map((v, i) => v / Math.max(b[i], 1e-3)); return { depth: pct(L.y, 10) / pct(L.y, 50), local: pct(loc, 10), median: pct(L.y, 50) }; };
    const cache = {};
    const photo = async (f) => (cache[f] ||= (() => { const L = lumaOf(f.img); return { L, s: stats(L), tex: tex(f.img) }; })());
    for (const r of results) {
      if (r.lightLike == null || !imgs[`lamp-${r.lightLike + 1}.png`]) continue;
      const P = await photo({ img: await load(imgs[`lamp-${r.lightLike + 1}.png`]), toString: () => `lamp-${r.lightLike + 1}` });
      const rimg = await load(imgs[r.file]), R = lumaOf(rimg), sr = stats(R), g = P.s.median / Math.max(sr.median, 1e-4), rt = tex(rimg);
      let e = 0; for (let i = 0; i < R.y.length; i++) { const t = Math.log(Math.max(R.y[i] * g, 1e-3)) - Math.log(Math.max(P.L.y[i], 1e-3)); e += t * t; }
      r.vsLampPhoto = { depth: +sr.depth.toFixed(3), photoDepth: +P.s.depth.toFixed(3), local: +sr.local.toFixed(3), photoLocal: +P.s.local.toFixed(3), logRMS: +Math.sqrt(e / R.y.length).toFixed(3),
        texture: +rt.toFixed(4), photoTexture: +P.tex.toFixed(4), textureMatch: +(rt / P.tex).toFixed(3) };
    }
    // Contact sheet: original (and lamp photos) first, then the numbered variants.
    const tiles = [['original.png', 'Original'], ...Object.keys(imgs).filter((f) => f.startsWith('lamp-')).sort().map((f) => [f, f.replace('.png', '').replace('lamp-', 'Lamp photo ')]),
      ...results.map((r) => [r.file, `${r.num}. ${r.name}`])];
    const first = await load(imgs['original.png']), tw = 420, th = Math.round(tw * first.height / first.width), cols = 4, pad = 8, lab = 26;
    const sheet = document.createElement('canvas'); sheet.width = cols * (tw + pad) + pad; sheet.height = Math.ceil(tiles.length / cols) * (th + lab + pad) + pad;
    const x = sheet.getContext('2d'); x.fillStyle = '#14161a'; x.fillRect(0, 0, sheet.width, sheet.height); x.font = '15px sans-serif'; x.fillStyle = '#e8eaee';
    for (const [n, [f, label]] of tiles.entries()) {
      const cx = pad + (n % cols) * (tw + pad), cy = pad + Math.floor(n / cols) * (th + lab + pad);
      x.drawImage(await load(imgs[f]), cx, cy + lab, tw, th); x.fillText(label.slice(0, 48), cx + 2, cy + 18);
    }
    return { results, sheet: sheet.toDataURL('image/png') };
  }, { imgs, results });
  save('sheet.png', done.sheet);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ spec: SPEC, measured, fit, results: done.results, errors }, null, 1));
  for (const r of done.results) if (r.vsLampPhoto) console.log(`${String(r.num).padStart(2, '0')} vs lamp ${r.lightLike + 1}:`, JSON.stringify(r.vsLampPhoto));
  if (errors.length) console.log('errors', errors);
  console.log('wrote', OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

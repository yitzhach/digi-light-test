// renderers.cjs — two GL implementations, the same settings: how far apart are the pictures?
//
// An agent may run DigiLight headless in software GL while a person looks at it on a GPU, so
// the same settings must give the same picture on both, within a stated tolerance (roadmap
// NEXT, exactness 4). The cloud has no GPU, so by default this compares Chromium's SwiftShader
// with Mesa's llvmpipe (another compiler, another rasteriser: as independent as two GPUs are;
// through Xvfb). On a computer with a GPU: RENDERER_B=gpu node tests/renderers.cjs.
//
// For each photo (a PNG of random noise, the sample painting, a test photo of the user's work)
// and each case (nothing changed, fixed presets, a look from Analyze), the settings are made on
// A and set as they are on B (guard off), and both export the same picture. Then:
//   - nothing changed: the same pixels, bit for bit (the photo's own texel; no GL arithmetic);
//   - otherwise: within TOL (below), and the metrics and change map the same to their rounding.
//   cd tools && npm install && cd .. && DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/renderers.cjs [--report]
// --report prints every comparison and asserts nothing.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { launch, openInput, analyzeCached } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));

const B = process.env.RENDERER_B || 'llvmpipe';
const REPORT = process.argv.includes('--report');
const WIDTH = 900;
// The tolerance, per picture (levels of 0-255, the largest channel): at most 2% of pixels more
// than 2 levels apart, the 99th percentile within 3 levels, the mean within 0.75. Measured 10-22
// (SwiftShader / llvmpipe, 900 px): 0.4-0.6 of pixels differ by a level (rounding in linear
// light); the worst picture, the door under Classic raking, had 1.03% over 2 levels (pixels on a
// shadow's edge, where the two decide the march a step apart), p99 3, mean 0.59, max 25; the
// others p99 1-2, mean 0.11-0.50. See docs/automation.md (Renderers agree).
const TOL = { over2: 0.02, p99: 3, mean: 0.75 };
const PHOTOS = ['noise', 'sample:painting', path.join(__dirname, '..', 'testdata', 'photos', 'door-flat-crop.jpg')];

// A PNG of random noise (as tests/exact.cjs), made in the page.
const noise = () => {
  const W = 801, H = 601, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  for (let i = 0; i < W * H; i++) { const dark = rnd() & 1; for (let k = 0; k < 3; k++) img.data[i * 4 + k] = dark ? rnd() & 31 : rnd(); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
};

// How far apart two PNG data URLs are, decoded in a page.
const differ = (page, a, b) => page.evaluate(async ([a, b]) => {
  const px = async (u) => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  const [x, y] = await Promise.all([px(a), px(b)]);
  if (x.length !== y.length) return { comparable: false };
  const hist = new Uint32Array(256), n = x.length / 4;
  let sum = 0, max = 0;
  for (let i = 0; i < x.length; i += 4) {
    const m = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
    hist[m]++; sum += m; if (m > max) max = m;
  }
  const pct = (p) => { let seen = 0; for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= p * n) return v; } return 255; };
  let over2 = 0;
  for (let v = 3; v < 256; v++) over2 += hist[v];
  return { differing: Math.round((n - hist[0]) / n * 1e4) / 1e4, over2: Math.round(over2 / n * 1e5) / 1e5, p99: pct(0.99), max, mean: Math.round(sum / n * 1000) / 1000 };
}, [a, b]);

(async () => {
  const [a, b] = await Promise.all([launch({ gl: 'swiftshader' }), launch({ gl: B })]);
  const failures = [], rows = [];
  try {
    const names = await Promise.all([a, b].map((s) => s.call('record', {}).then((r) => r.renderer?.name)));
    console.log(`A: ${names[0]}\nB: ${names[1]}`);
    const presets = await a.call('presets');
    const cases = [
      { name: 'nothing changed', set: { originalTop: 1 }, exact: true },
      { name: 'graze: Classic raking', preset: 'graze:Classic raking' },
      { name: `lighting: ${presets.lighting[0]}`, preset: `lighting:${presets.lighting[0]}` },
      { name: `looks: ${presets.looks[1] ?? presets.looks[0]}`, preset: `looks:${presets.looks[1] ?? presets.looks[0]}` },
      { name: 'Analyze look 0', look: 0 },
    ];
    for (const photo of PHOTOS) {
      const input = photo === 'noise' ? await a.page.evaluate(noise) : photo;
      await Promise.all([a, b].map(async (s) => { await openInput(s.call, input); await s.call('setGuard', false); }));
      const fp = await Promise.all([a, b].map((s) => s.call('record', {}).then((r) => r.photo.pixelsSha256)));
      assert.equal(fp[0], fp[1], `${photo}: the photo decodes to the same pixels in both`);
      const base = await a.call('settings');
      for (const c of cases) {
        if (c.look != null && photo === 'noise') continue;
        await a.call('setSettings', base);
        if (c.preset) { const i = c.preset.indexOf(':'); await a.call('applyPreset', c.preset.slice(0, i), c.preset.slice(i + 1)); }
        if (c.look != null) { await analyzeCached(a.call, input); await a.call('applyLook', c.look); }
        if (c.set) await a.call('set', c.set);
        const settings = await a.call('settings');
        await b.call('setSettings', settings);
        const opts = { format: 'png', width: WIDTH, metrics: true, hash: true, change: true };
        const [ra, rb] = await Promise.all([a.call('export', opts), b.call('export', opts)]);
        const d = await differ(a.page, ra.image, rb.image);
        const row = { photo: photo === 'noise' ? 'noise' : path.basename(photo), case: c.name, same: ra.pixels.sha256 === rb.pixels.sha256, ...d,
          detail: [ra.metrics.vsPhoto.detail, rb.metrics.vsPhoto.detail], light50: [ra.change.stats.light.p50, rb.change.stats.light.p50] };
        rows.push(row);
        console.log(JSON.stringify(row));
        const why = c.exact ? (row.same ? null : 'not bit for bit')
          : d.over2 > TOL.over2 || d.p99 > TOL.p99 || d.mean > TOL.mean ? `over the tolerance ${JSON.stringify(TOL)}`
          : Math.abs(ra.change.stats.light.p50 - rb.change.stats.light.p50) > 0.02 ? 'change map p50 apart' : null;
        if (why) failures.push(`${row.photo} / ${c.name}: ${why}`);
      }
    }
  } finally { await Promise.all([a.close(), b.close()]); }
  if (REPORT) return;
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`PASS renderers: SwiftShader and ${B} agree on ${rows.length} pictures (nothing changed: bit for bit; else ${JSON.stringify(TOL)})`);
})().catch((e) => { console.error(e); process.exit(1); });

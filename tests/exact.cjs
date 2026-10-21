// exact.cjs — the app's pictures are calculated from the photo, never regenerated:
//  1. with nothing changed (Original on top 100%), a full-size export is the photo bit for bit;
//  2. the same settings give the same pixels, every time.
// The photo is random noise at an odd size, the hardest case: every pixel sits beside unrelated
// ones, so any filtering, shift or rounding on the way through linear light shows. (The user,
// 10-21: "mathematically pixel for pixel accurate images", not a look-alike. Before the fix,
// 109 dark pixels of the red panel came back one level up: the texture filter leaked a sliver of a
// bright neighbour in, even at 1:1.) Lossless PNG in and out: a JPEG's decoder differs by a
// level or two between browsers and other software, which is not the app's to fix.
//   cd tools && npm install && cd .. && DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/exact.cjs
const assert = require('node:assert/strict');
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));

(async () => {
  const s = await launch();
  try {
    const r = await s.page.evaluate(async () => {
      const W = 1201, H = 899, d = window.digilight;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), img = g.createImageData(W, H);
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 255;
      for (let i = 0; i < W * H; i++) {
        // Half the pixels anywhere, half in the darks, where linear light is least forgiving.
        const dark = rnd() & 1;
        for (let k = 0; k < 3; k++) img.data[i * 4 + k] = dark ? rnd() & 31 : rnd();
        img.data[i * 4 + 3] = 255;
      }
      // Pure black next to pure white, the case that broke.
      for (let x = 0; x < W; x++) for (let y = 0; y < 8; y++) { const v = (x + y) & 1 ? 255 : 0; img.data.set([v, v, v, 255], (y * W + x) * 4); }
      g.putImageData(img, 0, 0);
      const photo = g.getImageData(0, 0, W, H).data;
      const pixels = async (url) => {
        const im = new Image(); im.src = url; await im.decode();
        const k = document.createElement('canvas'); k.width = im.width; k.height = im.height;
        const x = k.getContext('2d'); x.drawImage(im, 0, 0);
        return { w: im.width, h: im.height, px: x.getImageData(0, 0, im.width, im.height).data };
      };
      const asURL = async (v) => (typeof v === 'string' ? v : await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(v); }));
      const differ = (a, b) => { let n = 0, max = 0; for (let i = 0; i < a.length; i += 4) { const m = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (m) n++; if (m > max) max = m; } return { n, max }; };
      await d.load(c.toDataURL('image/png'));
      d.setGuard(false);
      await d.set({ originalTop: 1 });
      const same = await pixels(await asURL(await d.export({ format: 'png' })));
      await d.set({ originalTop: 0, exposure: 0.4, 'graze.enabled': true });
      const a = await pixels(await asURL(await d.export({ format: 'png' })));
      const b = await pixels(await asURL(await d.export({ format: 'png' })));
      return { size: [same.w, same.h], identity: differ(same.px, photo), repeat: differ(a.px, b.px), relit: differ(a.px, photo) };
    });
    assert.deepEqual(r.size, [1201, 899]);
    assert.equal(r.identity.n, 0, 'nothing changed: the export is the photo, bit for bit ' + JSON.stringify(r.identity));
    console.log('PASS identity: Original on top 100% exports the photo bit for bit (1201 x 899 noise, PNG)');
    assert.equal(r.repeat.n, 0, 'the same settings give the same pixels ' + JSON.stringify(r.repeat));
    assert.ok(r.relit.n > 0, 'and a relit picture does change them');
    console.log('PASS repeatable: the same relit settings exported twice, identical pixels', JSON.stringify(r.relit));
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

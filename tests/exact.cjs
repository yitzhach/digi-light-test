// exact.cjs — the app's pictures are calculated from the photo, never regenerated:
//  1. with nothing changed (Original on top 100%), a full-size export is the photo bit for bit;
//  2. the same settings give the same pixels, every time;
//  3. resized, the photo is resampled by resample.js: exact block means, and a resized identity
//     export is that resample bit for bit;
//  4. a JPEG is decoded once (one decoder path), and exports as decoded with nothing changed;
//  5. the change map (changemap.js) of the identity export is no change at all (plain grey), of
//     the preview with nothing changed too, and of a relit picture the same from export and
//     exportMany.
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
      // 5. The change map with nothing changed: none, and the map plain grey.
      const sameCh = (await d.export({ format: 'png', change: true })).change;
      const sameMap = await pixels(sameCh.image);
      let notGrey = 0;
      for (let i = 0; i < sameMap.px.length; i += 4) if (sameMap.px[i] !== 128 || sameMap.px[i + 1] !== 128 || sameMap.px[i + 2] !== 128) notGrey++;
      const previewCh = (await d.render({ change: true })).change.stats;
      await d.set({ originalTop: 0, exposure: 0.4, 'graze.enabled': true });
      const a = await pixels(await asURL(await d.export({ format: 'png' })));
      const b = await pixels(await asURL(await d.export({ format: 'png' })));
      const relitCh = (await d.export({ format: 'png', change: { map: 'colour' } })).change.stats;
      const manyCh = (await d.exportMany([{ settings: d.settings(), change: { map: 'colour' } }]))[0].change.stats;
      // 3. Resized, the photo goes through resample.js (the browser's own high-quality downscale
      // was not the same from one session to the next): exact means, any region the same pixels
      // as the whole, and a resized identity export is exactly that resample.
      const { resampleRegion, resampleRegionAsync, resampleWorkerOn } = await import('/src/resample.js');
      const c2 = document.createElement('canvas'); c2.width = 1200; c2.height = 898;
      c2.getContext('2d').putImageData(g.getImageData(0, 0, 1200, 898), 0, 0);
      const half = resampleRegion(c2, 600, 449, 0, 0, 600, 449).data;
      let boxOff = 0;
      for (let y = 0; y < 449; y++) for (let x = 0; x < 600; x++) for (let k = 0; k < 3; k++) {
        const at = (dx, dy) => photo[((2 * y + dy) * W + 2 * x + dx) * 4 + k];
        if (half[(y * 600 + x) * 4 + k] !== Math.round((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4)) boxOff++;
      }
      const RW = 517, RH = Math.round(H * RW / W), whole = resampleRegion(c, RW, RH, 0, 0, RW, RH).data;
      const part = resampleRegion(c, RW, RH, 100, 50, 200, 150).data;
      let tile = 0;
      for (let y = 0; y < 150; y++) for (let x = 0; x < 200; x++) for (let k = 0; k < 4; k++) if (part[(y * 200 + x) * 4 + k] !== whole[((y + 50) * RW + x + 100) * 4 + k]) tile++;
      // The worker (the sharp zoom's fresh tiles) gives the same pixels, and has run in one.
      const wpart = (await resampleRegionAsync(c, RW, RH, 100, 50, 200, 150)).data;
      let worker = 0;
      for (let i = 0; i < part.length; i++) if (wpart[i] !== part[i]) worker++;
      const workerUsed = resampleWorkerOn();
      await d.set({ originalTop: 1, exposure: 0, 'graze.enabled': false });
      const small = await pixels(await asURL(await d.export({ format: 'png', width: RW })));
      // 4. A JPEG: the app decodes it once (app.js pinPixels, a CPU canvas; a GPU-backed one
      // converts from YUV itself, a level apart on a quarter of the values), so the identity
      // export is that decode bit for bit.
      const jpeg = c.toDataURL('image/jpeg', 0.9);
      await d.load(jpeg);
      await d.set({ originalTop: 1 });
      const jpegOut = await pixels(await asURL(await d.export({ format: 'png' })));
      const im = new Image(); im.src = jpeg; await im.decode();
      const jc = document.createElement('canvas'); jc.width = W; jc.height = H;
      const jx = jc.getContext('2d', { willReadFrequently: true }); jx.drawImage(im, 0, 0);
      return { size: [same.w, same.h], identity: differ(same.px, photo), repeat: differ(a.px, b.px), relit: differ(a.px, photo),
        boxOff, tile, worker, workerUsed, smallSize: [small.w, small.h], resized: differ(small.px, whole), jpeg: differ(jpegOut.px, jx.getImageData(0, 0, W, H).data),
        sameCh: sameCh.stats, mapSize: [sameMap.w, sameMap.h], notGrey, previewCh, relitCh, manyCh };
    });
    assert.deepEqual(r.size, [1201, 899]);
    assert.equal(r.identity.n, 0, 'nothing changed: the export is the photo, bit for bit ' + JSON.stringify(r.identity));
    console.log('PASS identity: Original on top 100% exports the photo bit for bit (1201 x 899 noise, PNG)');
    assert.equal(r.repeat.n, 0, 'the same settings give the same pixels ' + JSON.stringify(r.repeat));
    assert.ok(r.relit.n > 0, 'and a relit picture does change them');
    console.log('PASS repeatable: the same relit settings exported twice, identical pixels', JSON.stringify(r.relit));
    assert.equal(r.boxOff, 0, 'a near half-size resample is the mean of each 2 x 2 block');
    assert.equal(r.tile, 0, 'a region of a resample is the same pixels as the whole there');
    assert.ok(r.workerUsed && r.worker === 0, 'the worker resamples the same pixels ' + JSON.stringify([r.workerUsed, r.worker]));
    assert.deepEqual(r.smallSize, [517, 387]);
    assert.equal(r.resized.n, 0, 'a resized identity export is the resample, bit for bit ' + JSON.stringify(r.resized));
    console.log('PASS resized: area-average resample (block means, regions = whole), and the export at 517 px is it bit for bit');
    assert.equal(r.jpeg.n, 0, 'a JPEG with nothing changed exports as decoded, bit for bit ' + JSON.stringify(r.jpeg));
    console.log('PASS JPEG identity: the photo decoded once, exported bit for bit');
    assert.deepEqual(r.mapSize, [1201, 899]);
    assert.equal(r.sameCh.same, 1, 'the identity export\'s change map: no change ' + JSON.stringify(r.sameCh));
    assert.deepEqual([r.sameCh.light.min, r.sameCh.light.max, r.sameCh.colour.max], [0, 0, 0]);
    assert.equal(r.notGrey, 0, 'and its light map is plain grey');
    assert.equal(r.previewCh.same, 1, 'the preview with nothing changed: no change ' + JSON.stringify(r.previewCh));
    assert.ok(r.relitCh.same < 0.5 && r.relitCh.light.brighter > 0.3, 'a relit picture changes ' + JSON.stringify(r.relitCh));
    assert.deepEqual({ ...r.manyCh, crop: null }, { ...r.relitCh, crop: null }, 'exportMany gives export\'s change map');
    console.log('PASS change map: none on the identity export (grey map) and the preview; relit', JSON.stringify(r.relitCh));
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

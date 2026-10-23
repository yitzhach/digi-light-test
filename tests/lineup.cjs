// lineup.cjs — a handheld sunlit photo lined up on the painting photo in the app (lineup.js).
//   cd tools && npm install && cd .. && DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/lineup.cjs   (~6 min)
// The user's door and lintel panel (testdata/photos): each raw sun photo, as taken (another spot,
// trees and sky round the panel), goes to measureRelief as it is; being shaped unlike the flat
// crop, it is lined up first. Checks: the homography found (features, then patches over the
// painting) against tools/realref/register.py's
// (manifest.json sunToFlat, which made the -lined photos), after the lamp-photo alignment that
// follows it, in preview pixels; and the relief measured from it against the relief measured from
// the -lined photo.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { launch, dataURL } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));
const DIR = path.join(__dirname, '..', 'testdata', 'photos');
const M = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pieces;
const PIECES = [
  { name: 'door', widthCm: 60, sun: { azimuthDeg: 135, elevationDeg: 30 } },
  { name: 'lintel', widthCm: 52.07, sun: { azimuthDeg: 40, elevationDeg: 10.3 } },
];

(async () => {
  const s = await launch();
  const { call, page } = s;
  try {
    for (const p of PIECES) {
      const m = M[p.name];
      await call('load', dataURL(path.join(DIR, m.flat)));
      await call('setGuard', false);
      const t0 = Date.now();
      const hand = await call('measureRelief', { photos: [{ src: dataURL(path.join(DIR, m.sun)), sun: p.sun }], widthCm: p.widthCm, fit: false });
      const ms = Date.now() - t0;
      const handHeight = await page.evaluate(() => Array.from(__bench.measured().height));
      const L = hand.shots[0].lineUp, A = hand.shots[0].align.map, info = await call('info');
      assert.ok(L && L.H, 'lined up ' + JSON.stringify(hand.shots[0]));
      // The panel says so, and Compare shows the photo lined up.
      const ui = await page.evaluate(() => { const L = __studio.lamp; L.compare(0); const c = !!document.querySelector('[data-act=compare].on'); L.stopCompare(); return { row: document.querySelector('#lampRows').textContent, hand: document.querySelector('[data-act=hand]').checked, report: document.querySelector('#lampResult').textContent, c }; });
      assert.ok(ui.hand && /Lined up: \d+ of \d+ matching points agree/.test(ui.row) && /Handheld photos lined up/.test(ui.report) && ui.c, JSON.stringify(ui));
      const [pw, ph, fw, fh] = [info.preview.width, info.preview.height, info.photo.width, info.photo.height];
      // Grid over the painting: preview pixel -> (alignment) -> lined-up photo -> H -> raw sun photo -> register.py -> flat crop.
      const ap = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
      const R = m.sunToFlat.flat(), err = [];
      for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) {
        const fx = 0.04 * fw + 0.92 * fw * i / 10, fy = 0.04 * fh + 0.92 * fh * j / 10, x = (fx + 0.5) * pw / fw - 0.5, y = (fy + 0.5) * ph / fh - 0.5;
        const [u, v] = ap(L.H, x + A[0] * x + A[1] * y + A[2], y + A[3] * x + A[4] * y + A[5]), [bx, by] = ap(R, u, v);
        err.push(Math.hypot(bx - fx, by - fy) * pw / fw);
      }
      err.sort((a, b) => a - b);
      // The same sun photo lined up by register.py, measured as it is.
      const ref = await call('measureRelief', { photos: [{ src: dataURL(path.join(DIR, m.sunLined)), sun: p.sun }], fit: false, lineUp: false });
      const r = await page.evaluate((a) => { const b = __bench.measured().height; let ab = 0, aa = 0, bb = 0, ma = 0, mb = 0; for (let i = 0; i < b.length; i++) { ma += a[i]; mb += b[i]; } ma /= b.length; mb /= b.length; for (let i = 0; i < b.length; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; } return ab / Math.sqrt(aa * bb); }, handHeight);
      console.log(`${p.name}: lined up in ${(ms / 1000).toFixed(0)} s with the measurement, ${L.inliers} of ${L.matches} matching points agree, ${L.patches} patches within ${L.errorPx.toFixed(2)} px, ${Math.round(L.covered * 100)}% covered; ` +
        `off register.py by median ${err[err.length >> 1].toFixed(2)}, max ${err.at(-1).toFixed(2)} preview px; relief r ${r.toFixed(3)} against the -lined photo's, depth ${hand.depthMm.toFixed(2)} against ${ref.depthMm.toFixed(2)} mm`);
      assert.ok(ref.shots[0].lineUp == null, 'the -lined photo is not lined up again');
      assert.ok(L.inliers >= 40 && L.patches >= 30 && L.errorPx < 1 && L.covered > 0.95, JSON.stringify(L));
      assert.ok(err[err.length >> 1] < 1.2 && err.at(-1) < 3, `off register.py ${err[err.length >> 1]} / ${err.at(-1)}`);
      assert.ok(r > 0.9 && Math.abs(hand.depthMm / ref.depthMm - 1) < 0.08, `relief r ${r}, depth ${hand.depthMm} / ${ref.depthMm}`);
    }
    assert.deepEqual(s.errors, []);
    console.log('PASS handheld sun photos lined up in the app: door and lintel, as register.py does');
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

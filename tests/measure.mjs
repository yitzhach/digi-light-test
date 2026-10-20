// measure.mjs — src/measure.js (DOM-free) against slow, obvious versions of the same maths.
//   node tests/measure.mjs        (a second or two; no browser)
// The fast paths (running-sum box filters, quickselect percentiles) must give exactly what a
// full sort and a naive window average give, since the review pages and tools/looks/stats.py
// compare the same numbers.
import assert from 'node:assert/strict';
import { pictureStats, imageMetrics } from '../src/measure.js';

const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 1e4) / 1e4;
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function image(w, h, levels) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) a[i * 4 + c] = Math.floor(rand() * levels) * Math.floor(255 / Math.max(1, levels - 1));
    a[i * 4 + 3] = 255;
  }
  return a;
}
const lumaOf = (a, n) => Float64Array.from({ length: n }, (_, i) => 0.2126 * a[i * 4] + 0.7152 * a[i * 4 + 1] + 0.0722 * a[i * 4 + 2]);
function pctRef(v, p) {
  const s = Float64Array.from(v).sort(), k = (s.length - 1) * p / 100, f = Math.floor(k), c = Math.min(s.length - 1, f + 1);
  return s[f] + (s[c] - s[f]) * (k - f);
}
function boxRef(y, w, h, r) {
  const o = new Float64Array(w * h), cl = (v, m) => Math.min(m - 1, Math.max(0, v));
  for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) s += y[cl(yy + dy, h) * w + cl(x + dx, w)];
    o[yy * w + x] = s / ((2 * r + 1) ** 2);
  }
  return o;
}

let n = 0;
for (let t = 0; t < 60; t++) {
  const w = 1 + Math.floor(rand() * 48), h = 1 + Math.floor(rand() * 48), a = image(w, h, [2, 5, 256][t % 3]);
  const st = pictureStats(a, w, h).stats, y = lumaOf(a, w * h);
  for (const [k, p] of [['p05', 5], ['p50', 50], ['p95', 95]]) assert.equal(st[k], r2(pctRef(y, p)), `${k} on ${w}x${h}`);
  const b1 = boxRef(y, w, h, 1), b6 = boxRef(y, w, h, 6), b13 = boxRef(y, w, h, 13);
  let f = 0, m = 0, br = 0, sum = 0;
  for (let i = 0; i < w * h; i++) { f += Math.abs(y[i] - b1[i]); m += Math.abs(b1[i] - b6[i]); br += Math.abs(b6[i] - b13[i]); sum += y[i]; }
  const den = Math.max(1, sum / (w * h)) * w * h;
  assert.deepEqual([st.fine, st.mid, st.broad], [r4(f / den), r4(m / den), r4(br / den)], `detail on ${w}x${h}`);
  n++;
}
console.log(`PASS pictureStats: percentiles and fine / mid / broad detail exact on ${n} random images`);

{
  const w = 64, h = 48, a = image(w, h, 256), m = imageMetrics(a, w, h, a);
  const v = m.vsPhoto;
  assert.ok(v.newBlown === 0 && v.newCrushed === 0 && v.darksLift === 0 && Object.values(v.stops).every((x) => x === 0) && v.thirds.every((x) => x === 0)
    && Object.values(v.detail).every((x) => x === 1) && m.warnings.length === 0, JSON.stringify(m));
  const bright = Uint8ClampedArray.from(a, (x, i) => (i % 4 === 3 ? 255 : Math.min(255, x + 60)));
  const mb = imageMetrics(bright, w, h, a);
  assert.ok(mb.vsPhoto.newBlown > 0.003 && mb.warnings.some((s) => /whites/.test(s)), JSON.stringify(mb.vsPhoto));
  console.log('PASS imageMetrics: a picture against itself is exactly no change; brighter warns about whites');
}

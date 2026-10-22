// changemap.mjs — src/changemap.js (DOM-free) on pictures whose change is known.
//   node tests/changemap.mjs        (a second; no browser)
// The same picture is no change; the photo times one light is that many stops and no colour
// change, however strong; a tint is colour change and shows on the colour map; the light
// percentiles match a full sort to the histogram's 0.01 stop.
import assert from 'node:assert/strict';
import { changeMap, COLOUR_TOL } from '../src/changemap.js';

let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const LIN = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const SRGB = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
function photo(w, h, lo = 0, hi = 255) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { for (let c = 0; c < 3; c++) a[i * 4 + c] = lo + Math.floor(rand() * (hi - lo + 1)); a[i * 4 + 3] = 255; }
  return a;
}
// The photo times a light (per pixel: gain(i), linear), back to bytes.
function lit(p, gain, tint = [1, 1, 1]) {
  const a = new Uint8ClampedArray(p.length);
  for (let i = 0; i < p.length; i += 4) {
    const k = gain(i / 4);
    for (let c = 0; c < 3; c++) a[i + c] = SRGB(Math.min(1, LIN(p[i + c]) * k * tint[c]));
    a[i + 3] = 255;
  }
  return a;
}

const w = 64, h = 48, n = w * h;
let tests = 0;

// 1. The photo itself: no change at all, and the light map is plain grey.
{
  const p = photo(w, h), { pixels, stats } = changeMap(p, p, w, h);
  assert.equal(stats.same, 1);
  assert.deepEqual([stats.light.min, stats.light.max, stats.light.brighter, stats.light.darker], [0, 0, 0, 0]);
  assert.equal(stats.colour.max, 0);
  for (let i = 0; i < n; i++) assert.deepEqual([...pixels.slice(i * 4, i * 4 + 4)], [128, 128, 128, 255]);
  tests++;
}

// 2. One light, +1 stop, on paint that stays under white: 1 stop everywhere (to rounding), no colour change.
{
  const p = photo(w, h, 30, 150), r = lit(p, () => 2), { pixels, stats } = changeMap(r, p, w, h);
  assert.ok(Math.abs(stats.light.p50 - 1) <= 0.03, `p50 ${stats.light.p50}`);
  assert.ok(stats.light.p01 > 0.9 && stats.light.p99 < 1.1, JSON.stringify(stats.light));
  assert.equal(stats.light.brighter, 1);
  assert.ok(stats.colour.p99 <= 2 && stats.colour.max <= COLOUR_TOL, JSON.stringify(stats.colour));   // rounding to bytes
  assert.equal(stats.colour.off, 0);
  // Half way to full orange at range 2.
  assert.ok(Math.abs(pixels[0] - 191) <= 3 && Math.abs(pixels[2] - 79) <= 3, `${pixels.slice(0, 3)}`);
  tests++;
}

// 3. Light that varies, from −3 to +2 stops across the picture: the stops come back, and
//    the percentiles match a full sort of the reference values.
{
  const p = photo(w, h, 40, 120), stopsAt = (i) => -3 + 5 * (i % w) / (w - 1);
  const r = lit(p, (i) => 2 ** stopsAt(i)), { stats } = changeMap(r, p, w, h, { map: false });
  const LINb = (v) => LIN(v), E = 0.0015, ref = [];
  for (let i = 0; i < n; i++) {
    const y = (a) => 0.2126 * LINb(a[i * 4]) + 0.7152 * LINb(a[i * 4 + 1]) + 0.0722 * LINb(a[i * 4 + 2]);
    ref.push(Math.log2((y(r) + E) / (y(p) + E)));
  }
  ref.sort((a, b) => a - b);
  for (const q of [1, 5, 50, 95, 99]) assert.ok(Math.abs(stats.light[`p${String(q).padStart(2, '0')}`] - ref[Math.floor((n - 1) * q / 100)]) <= 0.006, `p${q}`);
  assert.ok(Math.abs(stats.light.min - ref[0]) < 0.006 && Math.abs(stats.light.max - ref[n - 1]) < 0.006);
  assert.ok(stats.light.max > 1.8 && stats.light.min < -2.5, JSON.stringify(stats.light));   // E flattens the darkest a little
  assert.ok(stats.colour.p99 <= 2, JSON.stringify(stats.colour));
  assert.equal(stats.map, null);
  tests++;
}

// 4. A warm tint (red up, blue down) at the same brightness: colour change, shown on the colour map.
{
  const p = photo(w, h, 60, 160), r = lit(p, () => 1, [1.3, 1, 0.75]), { pixels, stats } = changeMap(r, p, w, h, { map: 'colour' });
  assert.ok(stats.colour.p50 > COLOUR_TOL && stats.colour.off > 0.9, JSON.stringify(stats.colour));
  assert.ok(Math.abs(stats.light.p50) < 0.15, `light p50 ${stats.light.p50}`);
  let bright = 0;
  for (let i = 0; i < n; i++) if (pixels[i * 4] > 80 && pixels[i * 4] === pixels[i * 4 + 2]) bright++;
  assert.ok(bright > 0.9 * n);
  tests++;
}

// 5. Darker: −1 stop is blue half way; bad input is refused.
{
  const p = photo(w, h, 80, 200), r = lit(p, () => 0.5), { pixels, stats } = changeMap(r, p, w, h);
  assert.equal(stats.light.darker, 1);
  assert.ok(pixels[2] > pixels[0] + 50, `${pixels.slice(0, 3)}`);
  assert.throws(() => changeMap(r, p, w + 1, h));
  assert.throws(() => changeMap(r, p, w, h, { map: 'hue' }));
  assert.throws(() => changeMap(r, p, w, h, { range: 0 }));
  tests++;
}

console.log(`changemap: ${tests} checks passed`);

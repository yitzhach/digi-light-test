// sunrelief.mjs — relief measured from a sunlit photo (src/lampphotos.js, sun shots), on a
// painting whose relief is known.   node tests/sunrelief.mjs   (about half a minute; no browser)
//
// The painting: broad mounds and stroke-sized ridges on blotchy paint. Its even photo is the
// paint alone; its sun photo is the paint under a distant light (one direction everywhere, a
// little sky light) plus noise, drawn with the measurement's own shading model (Lambert, the
// light's direction from sunPixels). Checks: one sun photo gives the relief along the sun's
// direction (high correlation with the truth's slopes there); two, the painting turned 90°
// between them, give the relief itself; the measured full range matches the truth at the right
// sun angle (the depth an artist would give); and the sun's direction convention is the
// picture's (0° right, 90° above). The defaults (the lamps' beam window, SUN_BEAM_SIGMA) keep
// relief up to stroke scale; with a broad window, which an even flat photo would allow, the
// broad forms and the full depth come back too (on real photos it did worse: lampphotos.js).
import assert from 'node:assert/strict';
import { measureRelief, sunPixels, boxBlur, SUN_DRIFT_SIGMA, SUN_BEAM_SIGMA } from '../src/lampphotos.js';

const W = 320, H = 240, N = W * H, WIDTH_CM = 40;
let seed = 3;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// Heights in pixels: three mounds (broad) and ridges (stroke scale).
const height = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let v = 0;
  for (const [cx, cy, r, a] of [[90, 80, 40, 6], [220, 150, 55, -5], [250, 60, 25, 4]]) v += a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
  v += 1.2 * Math.sin(x / 5 + 2 * Math.sin(y / 23)) * Math.cos(y / 9);
  height[y * W + x] = v;
}
const paint = new Float32Array(N * 3);
{
  const n = new Float32Array(N); for (let i = 0; i < N; i++) n[i] = rand();
  const b = boxBlur(n, W, H, 6);
  for (let i = 0; i < N; i++) { const t = (b[i] - 0.5) * 8; paint[i * 3] = 0.45 + 0.25 * t; paint[i * 3 + 1] = 0.4 + 0.1 * t; paint[i * 3 + 2] = 0.3 - 0.15 * t; }
}
const toSRGB = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
function photo(light) {
  const a = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const k = light(i);
    for (let c = 0; c < 3; c++) a[i * 4 + c] = toSRGB(Math.max(0, paint[i * 3 + c] * k * (1 + 0.01 * (rand() - 0.5))));
    a[i * 4 + 3] = 255;
  }
  return a;
}
const grad = (h) => {
  const hx = new Float32Array(N), hy = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    hx[i] = (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) / 2;
    hy[i] = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) / 2;
  }
  return { hx, hy };
};
const { hx, hy } = grad(height);
// The painting in sun from `sun`, with SKY of the sunlit flat paint's light from the sky.
const SKY = 0.1;
function sunPhoto(sun) {
  const p = sunPixels(sun, W, H);
  return photo((i) => {
    const x = i % W, y = (i - x) / W, ux = (p.x - x - 0.5) / p.z, uy = (p.y - y - 0.5) / p.z;
    return 0.55 * (SKY + Math.max(0, 1 - hx[i] * ux - hy[i] * uy) / Math.sqrt(1 + hx[i] ** 2 + hy[i] ** 2));
  });
}
const even = photo(() => 0.5);

const corr = (a, b, mask) => {
  let sa = 0, sb = 0, n = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) { sa += a[i]; sb += b[i]; n++; }
  sa /= n; sb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) { const x = a[i] - sa, y = b[i] - sb; ab += x * y; aa += x * x; bb += y * y; }
  return ab / Math.sqrt(aa * bb);
};
const inner = new Uint8Array(N);
for (let y = 10; y < H - 10; y++) for (let x = 10; x < W - 10; x++) inner[y * W + x] = 1;
// The truth as a measurement can know it: broader than the sun's drift cut is not measured.
const drift = boxBlur(height, W, H, SUN_DRIFT_SIGMA * W), truth = height.map((v, i) => v - drift[i]);
let lo = Infinity, hi = -Infinity;
for (let i = 0; i < N; i++) if (inner[i]) { lo = Math.min(lo, truth[i]); hi = Math.max(hi, truth[i]); }
const truthRangeMm = (hi - lo) * WIDTH_CM * 10 / W;

let checks = 0;
// 1. The sun's direction is the picture's: 135° is the upper left (x left, y up).
{
  const p = sunPixels({ azimuthDeg: 135, elevationDeg: 30 }, W, H);
  assert.ok(p.x < -1e6 && p.y < -1e6 && p.z > 0);
  const ux = (p.x - W / 2) / p.z, uy = (p.y - H / 2) / p.z, cot = 1 / Math.tan(Math.PI / 6);
  assert.ok(Math.abs(Math.hypot(ux, uy) - cot) < 1e-6 && Math.abs(ux + uy * -1) < 1e-6 && ux < 0, `${ux} ${uy}`);
  checks++;
}

// 2. One sun photo from the upper left, 25° up: the relief along the sun's direction.
const sunA = { azimuthDeg: 135, elevationDeg: 12 }, sunB = { azimuthDeg: 45, elevationDeg: 12 };
const one = await measureRelief({ even, w: W, h: H, widthCm: WIDTH_CM, glints: false, shots: [{ rgba: sunPhoto(sunA), lamp: { sun: sunA } }] });
{
  const g = grad(one.height), d = [Math.cos(3 * Math.PI / 4), -Math.sin(3 * Math.PI / 4)];
  const along = (G) => G.hx.map((v, i) => v * d[0] + G.hy[i] * d[1]);
  const c = corr(along(g), along(grad(truth)), inner);
  assert.ok(c > 0.85, `slopes along the sun: r = ${c.toFixed(3)}`);
  console.log(`PASS one sun photo: slopes along the sun r = ${c.toFixed(3)}, height r = ${corr(one.height, truth, inner).toFixed(3)}, range ${one.rangeMm.toFixed(2)} mm (truth ${truthRangeMm.toFixed(2)})`);
  checks++;
}

// 3. Two, the painting turned 90° between them: the relief itself, and its depth at the true sun angle.
const BROAD = 0.25;
const twoShots = (o = {}) => measureRelief({ even, w: W, h: H, widthCm: WIDTH_CM, glints: false, ...o,
  shots: [{ rgba: sunPhoto(sunA), lamp: { sun: sunA } }, { rgba: sunPhoto(sunB), lamp: { sun: sunB } }] });
const two = await twoShots({ beamSigma: BROAD });
{
  const c = corr(two.height, truth, inner);
  assert.ok(c > 0.85, `height r = ${c.toFixed(3)}`);
  const k = two.rangeMm / truthRangeMm;
  assert.ok(k > 0.75 && k < 1.25, `range ${two.rangeMm.toFixed(2)} mm against ${truthRangeMm.toFixed(2)}`);
  console.log(`PASS two sun photos (turned 90°), broad beam window: height r = ${c.toFixed(3)}, full range ${two.rangeMm.toFixed(2)} mm against ${truthRangeMm.toFixed(2)} (x${k.toFixed(2)}), spread ${two.depthMm.toFixed(2)} mm`);
  checks++;
}

// 3b. The same with the defaults: the relief up to stroke scale (finer than the beam window).
{
  const r = await twoShots(), keep = (a) => { const b = boxBlur(a, W, H, SUN_BEAM_SIGMA * W); return a.map((v, i) => v - b[i]); };
  const c = corr(keep(r.height), keep(truth), inner);
  assert.ok(c > 0.9, `stroke-scale height r = ${c.toFixed(3)}`);
  console.log(`PASS two sun photos, default beam window: stroke-scale height r = ${c.toFixed(3)} (whole height r = ${corr(r.height, truth, inner).toFixed(3)})`);
  checks++;
}

// 4. A wrong sun angle scales the depth (the ambiguity the artist's number settles): steeper sun, deeper relief read.
{
  const steep = { ...sunA, elevationDeg: 24 };
  const r = await measureRelief({ even, w: W, h: H, widthCm: WIDTH_CM, glints: false, shots: [{ rgba: sunPhoto(sunA), lamp: { sun: steep } }] });
  const k = r.rangeMm / one.rangeMm, want = Math.tan(24 * Math.PI / 180) / Math.tan(12 * Math.PI / 180);
  assert.ok(Math.abs(k / want - 1) < 0.25, `x${k.toFixed(2)} against tan ratio ${want.toFixed(2)}`);
  console.log(`PASS the sun angle scales the depth: 24° given for a 12° sun reads x${k.toFixed(2)} (tan ratio ${want.toFixed(2)})`);
  checks++;
}
console.log(`sunrelief: ${checks} checks passed`);

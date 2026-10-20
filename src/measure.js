// measure.js — descriptive measurements of a loaded photograph.
//
// DESCRIPTIVE, and the distinction is load-bearing. Five statistics that claimed
// to predict whether relief recovery would succeed have been built, calibrated
// against bench cases with known recovery, and deleted because they could not
// separate the good from the bad (README findings 10; HANDOFF §4.4, §4.7). Nothing
// here predicts recovery. Everything here is a property of the pixels that can be
// checked directly against tools/spectrum.mjs.
//
// The one shipped so far answers a question the UI could not otherwise answer:
// *is the Chroma reject control doing anything at all?* On the owner's cast cement
// the fine-scale chroma signal measures 0.019 of the luma signal — the mechanism
// that separates pigment from relief is arbitrating with a signal fifty times
// weaker than the thing it judges, and the slider is inert. Without this readout
// there is no way to know that from inside the tool, and dragging an inert control
// feels exactly like tuning.
//
// DOM-free so the Node harness can score the same function the browser runs.

/** Separable Gaussian on a single plane. Reflect-free clamp at the edges. */
function blur(src, w, h, sigma) {
  const rad = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(rad * 2 + 1);
  let ks = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); k[i + rad] = v; ks += v; }
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -rad; i <= rad; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + rad];
    t[y * w + x] = s / ks;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -rad; i <= rad; i++) s += t[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + rad];
    o[y * w + x] = s / ks;
  }
  return o;
}

const sd = (a) => {
  let s1 = 0, s2 = 0;
  for (const v of a) { s1 += v; s2 += v * v; }
  const m = s1 / a.length;
  return Math.sqrt(Math.max(s2 / a.length - m * m, 1e-14));
};

const LIN = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/**
 * Fine-scale chroma signal against fine-scale luma signal, on one RGBA block.
 *
 * Chroma reject works by noticing that a pigment change moves hue while shading
 * does not (src/gbuffer.js). Where this ratio is near zero the two are
 * indistinguishable in one photograph, and no setting of the control changes that
 * — it is a property of the material, not a tuning problem.
 */
function ratioOfBlock(rgba, w, h, sigma) {
  const n = w * h;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) { r[i] = LIN[rgba[p]]; g[i] = LIN[rgba[p + 1]]; b[i] = LIN[rgba[p + 2]]; }

  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.2126 * r[i] + 0.7152 * g[i] + 0.0722 * b[i];
  const Lb = blur(L, w, h, sigma);
  const hp = new Float32Array(n);
  for (let i = 0; i < n; i++) hp[i] = Math.log(Math.max(L[i], 1e-4)) - Math.log(Math.max(Lb[i], 1e-4));

  // Chromaticity r/(r+g+b) and b/(r+g+b): shading is one scalar on all three
  // channels, so dividing by the sum removes it and leaves only pigment.
  const c1 = new Float32Array(n), c2 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(r[i] + g[i] + b[i], 1e-6);
    c1[i] = r[i] / s; c2[i] = b[i] / s;
  }
  const b1 = blur(c1, w, h, sigma), b2 = blur(c2, w, h, sigma);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = Math.hypot(c1[i] - b1[i], c2[i] - b2[i]);

  const luma = sd(hp), chroma = sd(ch);
  return { luma, chroma };
}

/**
 * Sample several blocks across an image and return the mean chroma:luma ratio.
 *
 * Blocks rather than the whole frame because the cost is linear in pixels and this
 * runs on load; spread across the frame rather than one central sample because a
 * painting is not uniform.
 *
 * @param rgba  RGBA bytes of the WORKING image — the one actually being processed,
 *   so the number describes what the shader will see rather than the original file.
 */
export function chromaSignal(rgba, w, h, { sigma = 3, block = 320, blocks = 4 } = {}) {
  const bw = Math.min(block, w), bh = Math.min(block, h);
  const spots = [[0.28, 0.28], [0.72, 0.33], [0.32, 0.7], [0.7, 0.72]].slice(0, blocks);
  let luma = 0, chroma = 0, n = 0;
  for (const [fx, fy] of spots) {
    const x0 = Math.max(0, Math.min(w - bw, Math.round(fx * w - bw / 2)));
    const y0 = Math.max(0, Math.min(h - bh, Math.round(fy * h - bh / 2)));
    const sub = new Uint8ClampedArray(bw * bh * 4);
    for (let y = 0; y < bh; y++) {
      const s = ((y0 + y) * w + x0) * 4;
      sub.set(rgba.subarray(s, s + bw * 4), y * bw * 4);
    }
    const r = ratioOfBlock(sub, bw, bh, sigma);
    luma += r.luma; chroma += r.chroma; n++;
  }
  luma /= n; chroma /= n;
  const ratio = chroma / Math.max(luma, 1e-9);
  return {
    ratio, luma, chroma,
    // Thresholds are descriptive bands, not a pass/fail on the photograph.
    verdict: ratio < 0.05 ? 'inert' : ratio < 0.15 ? 'weak' : 'usable',
  };
}

// ------------------------------------------------------------ render metrics
//
// One set of numbers for every render, the same ones tools/looks/stats.py gives the
// review page (same clip rule, percentiles, box filters), so the app, an AI agent
// and a reviewer judge the same thing. Still descriptive: they say what the pixels
// are, and the limits below (docs/roadmap.md §5) only flag what the user has said
// they never want: blown whites, crushed darks, lost texture.

export const CLIP_HI = 250, CLIP_LO = 5;   // any channel >= 250 is blown; all <= 5 crushed (photocheck.js)
export const LIMITS = { newBlown: 0.003, newCrushed: 0.0015, darksLift: [0, 8], detailDrop: 0.85 };

/** Mean over a (2r+1)-square window, edges clamped (stats.py box, Pillow's BoxBlur). Running
 *  sums: along each row, then down the columns a row at a time (cache-friendly). */
function box(src, w, h, r) {
  const n = 2 * r + 1, t = new Float64Array(w * h), o = new Float64Array(w * h);
  const cx = (x) => (x < 0 ? 0 : x >= w ? w - 1 : x), cy = (y) => (y < 0 ? 0 : y >= h ? h - 1 : y);
  for (let y = 0, row = 0; y < h; y++, row += w) {
    let s = 0;
    for (let i = -r - 1; i < r; i++) s += src[row + cx(i)];
    for (let x = 0; x < w; x++) {
      s += src[row + (x + r >= w ? w - 1 : x + r)] - src[row + (x - r - 1 < 0 ? 0 : x - r - 1)];
      t[row + x] = s / n;
    }
  }
  const col = new Float64Array(w);
  for (let i = -r - 1; i < r; i++) { const row = cy(i) * w; for (let x = 0; x < w; x++) col[x] += t[row + x]; }
  for (let y = 0, out = 0; y < h; y++, out += w) {
    const add = cy(y + r) * w, sub = cy(y - r - 1) * w;
    for (let x = 0; x < w; x++) { col[x] += t[add + x] - t[sub + x]; o[out + x] = col[x] / n; }
  }
  return o;
}

/** The k-th smallest of `a` (0-based), reordering `a` in place: quickselect, linear on average. */
function kth(a, k) {
  let lo = 0, hi = a.length - 1;
  while (hi > lo) {
    const mid = (lo + hi) >> 1;
    // median of three as the pivot, so a sorted or flat input does not degrade
    const x = a[lo], y = a[mid], z = a[hi];
    const piv = x < y ? (y < z ? y : x < z ? z : x) : (x < z ? x : y < z ? z : y);
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < piv) i++;
      while (a[j] > piv) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return a[k];
}
/** numpy.percentile (linear) of `a` (reordered in place), p in 0..100. */
function pct(a, p) {
  const k = (a.length - 1) * p / 100, f = Math.floor(k);
  const lo = kth(a, f);
  if (f + 1 >= a.length || k === f) return lo;
  let next = Infinity;   // the (f+1)-th smallest: the least of what quickselect left above f
  for (let i = f + 1; i < a.length; i++) if (a[i] < next) next = a[i];
  return lo + (next - lo) * (k - f);
}

const r4 = (v) => Math.round(v * 1e4) / 1e4, r2 = (v) => Math.round(v * 100) / 100;
// Stops between two 0-255 sRGB levels, in linear light.
const stops = (a, b) => r2(Math.log2(Math.max(LIN[Math.round(Math.max(0, Math.min(255, a)))], 1e-4) / Math.max(LIN[Math.round(Math.max(0, Math.min(255, b)))], 1e-4)));

/**
 * The numbers for one picture (RGBA bytes): shares blown / crushed (hi, lo), luma
 * percentiles p05 p50 p95 (0-255), texture per unit brightness at three scales
 * (fine: |Y - box3|, mid: box3 - box13, broad: box13 - box27, over mean luma; fine
 * and mid are stats.py's), and the median luma of the left, centre and right thirds.
 */
export function pictureStats(rgba, w, h) {
  const n = w * h, y = new Float64Array(n), hiMask = new Uint8Array(n);
  let hi = 0, lo = 0, sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const H = r >= CLIP_HI || g >= CLIP_HI || b >= CLIP_HI;
    if (H) { hi++; hiMask[i] = 1; } else if (r <= CLIP_LO && g <= CLIP_LO && b <= CLIP_LO) { lo++; hiMask[i] = 2; }
    sum += (y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  const lum = Float64Array.from(y);   // reordered by pct()
  const b1 = box(y, w, h, 1), b6 = box(y, w, h, 6), b13 = box(y, w, h, 13);
  let fine = 0, mid = 0, broad = 0;
  for (let i = 0; i < n; i++) { fine += Math.abs(y[i] - b1[i]); mid += Math.abs(b1[i] - b6[i]); broad += Math.abs(b6[i] - b13[i]); }
  const m = Math.max(1, sum / n) * n;
  const thirds = [0, 1, 2].map((t) => {
    const x0 = Math.round(t * w / 3), x1 = Math.round((t + 1) * w / 3), v = new Float64Array((x1 - x0) * h);
    let k = 0;
    for (let yy = 0; yy < h; yy++) for (let x = x0; x < x1; x++) v[k++] = y[yy * w + x];
    return r2(pct(v, 50));
  });
  return {
    stats: { hi: r4(hi / n), lo: r4(lo / n), p05: r2(pct(lum, 5)), p50: r2(pct(lum, 50)), p95: r2(pct(lum, 95)),
      fine: r4(fine / m), mid: r4(mid / m), broad: r4(broad / m), thirds },
    clip: hiMask,
  };
}

/**
 * A render's numbers, and with the photo it was made from (same size) the
 * differences that matter: pixels newly blown / crushed (clipped in the render, not
 * in the photo), how far the darks moved (p05 levels) and the tones (stops), detail
 * kept per scale (1 = the photo's), and each third's brightness in stops. `warnings`
 * lists what passes the LIMITS, in words.
 */
export function imageMetrics(rgba, w, h, photo) {
  const R = pictureStats(rgba, w, h);
  const out = { size: [w, h], render: R.stats };
  if (!photo) return out;
  // The photo as RGBA bytes, or its pictureStats() kept from an earlier call.
  const P = photo.stats ? photo : pictureStats(photo, w, h), r = R.stats, p = P.stats;
  let blown = 0, crushed = 0;
  for (let i = 0; i < w * h; i++) {
    if (R.clip[i] === 1 && P.clip[i] !== 1) blown++;
    else if (R.clip[i] === 2 && P.clip[i] !== 2) crushed++;
  }
  const keep = (k) => r2(r[k] / Math.max(p[k], 1e-6));
  const vs = {
    newBlown: r4(blown / (w * h)), newCrushed: r4(crushed / (w * h)),
    darksLift: r2(r.p05 - p.p05),
    stops: { p05: stops(r.p05, p.p05), p50: stops(r.p50, p.p50), p95: stops(r.p95, p.p95) },
    detail: { fine: keep('fine'), mid: keep('mid'), broad: keep('broad') },
    thirds: r.thirds.map((v, i) => stops(v, p.thirds[i])),
  };
  const warnings = [];
  const pc = (v) => `${(v * 100).toFixed(2)}%`;
  if (vs.newBlown > LIMITS.newBlown) warnings.push(`whites: ${pc(vs.newBlown)} of the picture newly blown (limit ${pc(LIMITS.newBlown)})`);
  if (vs.newCrushed > LIMITS.newCrushed) warnings.push(`darks: ${pc(vs.newCrushed)} newly crushed to black (limit ${pc(LIMITS.newCrushed)})`);
  if (vs.darksLift < LIMITS.darksLift[0]) warnings.push(`darks: ${-vs.darksLift} levels darker than the photo (p05)`);
  if (vs.darksLift > LIMITS.darksLift[1]) warnings.push(`darks: lifted ${vs.darksLift} levels over the photo (p05), may look milky`);
  for (const k of ['fine', 'mid']) if (vs.detail[k] < LIMITS.detailDrop) warnings.push(`${k} texture: ${Math.round(vs.detail[k] * 100)}% of the photo's (soft or smeared?)`);
  return { ...out, photo: p, vsPhoto: vs, warnings };
}

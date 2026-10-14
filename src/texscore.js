// texscore.js — texture contrast score, after RL-Sq (DiSciacca et al. 2026,
// "Surface roughness from raking light images"; docs/conoscopic-paper-improvements.md
// items 12–13).
//
// Under a fixed raking light, how much the brightness varies at stroke scale follows
// how rough the surface is (r = 0.87 against a profilometer in the paper). The score:
// brightness (luma) over a broad Gaussian blur of itself, which cancels the lamp's
// pool of light, its falloff and vignetting while keeping local contrast; a light
// blur to drop pixel noise; then the standard deviation, borders cut. It is scored
// the same way on a lamp photo and on a render under the same light, and the ratio
// (render / photo) says whether the render has as much stroke contrast as the real
// thing. Since the score rises with relief depth, Texture depth can be solved for.
//
// Kernels are in mm on the painting, not in pixels, so a photo of any resolution
// scores alike (the paper's 501 / 21 px kernels were for 204.8 px/mm).

export const BIG_MM = 2.5;      // broad blur: lighting and vignetting are smooth beyond this
export const SMALL_PX = 1.5;    // light blur against pixel noise and JPEG blocks; in pixels, as
                                // in the paper, so strokes near the pixel scale count less
const BORDER = 0.03;            // share of each side cut, on top of twice the broad blur

/** Gaussian blur of `sigma` px, separable, kernel cut at 3 sigma, clamped at the
 *  edges. A true Gaussian, not repeated boxes: those round to whole radii, which
 *  at the few-pixel sizes used here is off by up to 10% and moves the score. */
export function gaussBlur(src, w, h, sigma) {
  const out = Float32Array.from(src);
  if (sigma < 0.3) return out;
  const r = Math.ceil(3 * sigma), k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-i * i / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const t = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * out[o + Math.min(w - 1, Math.max(0, x + i))];
      t[o + x] = v;
    }
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let v = 0;
    for (let i = -r; i <= r; i++) v += k[i + r] * t[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = v;
  }
  return out;
}

/**
 * Texture contrast of RGBA bytes (w × h) of a painting `mmPerPx` mm per pixel.
 * `mask` (optional, Uint8Array): pixels set there are left out (clipped, glints).
 * Returns { score, mean, n, bigPx, smallPx }: score is the standard deviation of
 * the band-passed brightness (0 for a flat, evenly lit grey; 0.1 is 10% contrast).
 */
export function textureScore(rgba, w, h, mmPerPx, { bigMm = BIG_MM, smallPx = SMALL_PX, mask = null } = {}) {
  const n = w * h, y = new Float32Array(n);
  // Rec. 709 luma of the encoded values, as the paper (and the eye) take brightness.
  for (let i = 0; i < n; i++) y[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  const bigPx = bigMm / Math.max(1e-6, mmPerPx);
  const base = gaussBlur(y, w, h, bigPx);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = base[i] > 0.01 ? y[i] / base[i] : 1;
  const s = gaussBlur(q, w, h, smallPx);
  const cut = (len) => Math.min(Math.floor(len / 3), Math.ceil(2 * bigPx + BORDER * len));
  const bx = cut(w), by = cut(h);
  let sum = 0, sum2 = 0, k = 0;
  for (let j = by; j < h - by; j++) for (let i = bx; i < w - bx; i++) {
    const p = j * w + i;
    if (base[p] <= 0.01 || (mask && mask[p])) continue;
    sum += s[p]; sum2 += s[p] * s[p]; k++;
  }
  const mean = k ? sum / k : 0;
  return { score: k ? Math.sqrt(Math.max(0, sum2 / k - mean * mean)) : 0, mean, n: k, bigPx, smallPx };
}

/**
 * Texture depth whose render matches a target. `ratioAt(depth)` (async) renders at
 * that depth and returns render score / photo score (or a mean of such ratios); the
 * depth where it reaches 1 is found on a doubling grid, then by bisection on log
 * depth. Returns { depth, ratio, reached, samples: [[depth, ratio]] }; `reached` is
 * 'yes', or 'low' / 'high' when even the shallowest / deepest render has too much /
 * too little contrast (depth is then that end).
 */
export async function fitDepth(ratioAt, { lo = 0.25, hi = 10, steps = 4, stop = () => false } = {}) {
  const samples = [];
  const at = async (d) => { const r = await ratioAt(d); samples.push([d, r]); return r; };
  const grid = [];
  for (let d = lo; d < hi * 0.999; d *= 2) grid.push(d);
  grid.push(hi);
  let prev = null;
  for (const d of grid) {
    if (stop()) break;
    const r = await at(d);
    if (r >= 1) {
      if (!prev) return { depth: d, ratio: r, reached: 'low', samples };
      // Bisection between prev and this sample, on log depth.
      let a = prev, b = [d, r];
      for (let i = 0; i < steps && !stop(); i++) {
        const m = Math.sqrt(a[0] * b[0]), rm = await at(m);
        if (rm >= 1) b = [m, rm]; else a = [m, rm];
      }
      // Straight line through the last bracket, on log depth.
      const t = (1 - a[1]) / Math.max(1e-9, b[1] - a[1]);
      const depth = Math.exp(Math.log(a[0]) + t * (Math.log(b[0]) - Math.log(a[0])));
      return { depth, ratio: 1, reached: 'yes', samples };
    }
    prev = [d, r];
  }
  return { depth: prev ? prev[0] : lo, ratio: prev ? prev[1] : 0, reached: 'high', samples };
}

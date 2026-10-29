// scenedepth.js — the scene in a photograph, roughly: how near each part of it is, which part
// is the subject, where the sky is, and how the photo was lit across it. What a relight of a
// photo, a portrait or a room needs beyond the paint relief gbuffer.js reads.
//
// No learned model: a small copy of the photo (SCENE_SIZE on its long side) is read with a few
// classic cues, chosen by what the image is (SCENE_TYPES):
//   layout   the space behind the subject: a backdrop (portrait), a box room seen from its open
//            side (room, an art fair booth), a wall over a floor (object), ground under sky (photo);
//   subject  what stands apart from the image's border: the minimum barrier distance to it (Zhang
//            et al. 2015) and the distance from the border's colours, cut along the photo's own
//            edges by a guided filter (He et al. 2010);
//   pop-up   the subject stands where it meets the floor (Hoiem et al. 2005's pop-up), and is
//            rounded by inflating its outline: the square root of a Poisson dome turns a disc
//            into a hemisphere and a strip into a cylinder, whatever their size;
//   form     the subject's brighter parts forward, darker back, at the scale of its features.
// The result is plausible geometry, not a measurement. Light and shadow read well on it because
// every part faces roughly the right way, and the space has a back and a front for shadows to
// fall across; Depth, Roundness and Form scale it, and the user can choose the type.
//
// Pure functions on plain arrays, rows top first: runs in a page or in Node (tests/scenedepth.mjs).

export const SCENE_TYPES = ['artwork', 'photo', 'portrait', 'room', 'object'];
// Long side of the working copy. Depth, masks and lighting are smooth at this scale; the GPU
// carries them to full size along the photo's own edges (scene.js).
export const SCENE_SIZE = 256;

// Shape settings per type (the user's Scene sliders): depth, the space's front-to-back span in
// image widths; roundness, the subject's inflation (1 = hemispheres); form, shape from shading;
// gap, how far the subject stands in front of what is behind it, as a share of depth.
export const SCENE_SHAPE = {
  photo: { depth: 0.6, roundness: 0.5, form: 0.3, gap: 0.35 },
  portrait: { depth: 0.5, roundness: 0.9, form: 0.25, gap: 0.6 },
  room: { depth: 0.7, roundness: 0.3, form: 0.15, gap: 0.2 },
  object: { depth: 0.45, roundness: 0.35, form: 0.3, gap: 0.25 },
};
// A booth or a room seen from its open side: the back wall's rectangle (fractions of the image,
// x from the left, y from the top). Replaced by the photo's own lines when they are clear.
export const ROOM_WALL = { x0: 0.18, y0: 0.12, x1: 0.82, y1: 0.66 };
export const HORIZON = 0.42;   // photo: the horizon's height from the top when no sky shows it

const FORM_WIDTHS = 0.03;      // height in image widths of one unit of form (log luminance band)

// ------------------------------------------------------------------ image

const LIN = Float32Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** RGBA bytes (w × h) as the arrays every cue reads: CIELab, linear luma, sRGB 0..1 (the guide). */
export function readImage(rgba, w, h) {
  const n = w * h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const Y = new Float32Array(n), rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const R8 = rgba[i * 4], G8 = rgba[i * 4 + 1], B8 = rgba[i * 4 + 2];
    const r = LIN[R8], g = LIN[G8], b = LIN[B8];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const fx = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), fy = labF(y), fz = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    L[i] = 116 * fy - 16; A[i] = 500 * (fx - fy); B[i] = 200 * (fy - fz); Y[i] = y;
    rgb[i * 3] = R8 / 255; rgb[i * 3 + 1] = G8 / 255; rgb[i * 3 + 2] = B8 / 255;
  }
  return { w, h, L, A, B, Y, rgb, rgba };
}

// ------------------------------------------------------------------ filters

/** Mean over the (2r + 1)² window, the window clipped to the image (so edges are not darkened).
 *  Running sums: across each row, then down all columns at once (row by row, cache-friendly). */
export function boxMean(src, w, h, r, out = new Float32Array(w * h)) {
  const tmp = new Float32Array(w * h), col = new Float64Array(w);
  for (let y = 0, o = 0; y < h; y++, o += w) {
    let s = 0;
    for (let x = 0; x <= r && x < w; x++) s += src[o + x];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
      if (x + r + 1 < w) s += src[o + x + r + 1];
      if (x - r >= 0) s -= src[o + x - r];
    }
  }
  col.fill(0);
  for (let y = 0; y <= r && y < h; y++) for (let x = 0, o = y * w; x < w; x++) col[x] += tmp[o + x];
  for (let y = 0; y < h; y++) {
    const k = 1 / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1), o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = col[x] * k;
    if (y + r + 1 < h) for (let x = 0, a = (y + r + 1) * w; x < w; x++) col[x] += tmp[a + x];
    if (y - r >= 0) for (let x = 0, a = (y - r) * w; x < w; x++) col[x] -= tmp[a + x];
  }
  return out;
}

/** Gaussian of `sigma` pixels, as three box means (within a few per cent of the true kernel). */
export function blur(src, w, h, sigma) {
  if (!(sigma > 0.3)) return new Float32Array(src);
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  return boxMean(boxMean(boxMean(src, w, h, r), w, h, r), w, h, r);
}

/**
 * Guided filter with a colour guide (He et al. 2010): `p` smoothed over (2r + 1)² windows,
 * except across the guide's edges, where the output follows them. eps is the guide variance
 * (sRGB 0..1, squared) below which a window counts as flat. The guide's own window statistics
 * depend only on r, so they are made once per radius and kept on `img`.
 */
export function guidedFilter(img, p, r, eps) {
  const { w, h } = img, n = w * h, { I, mI, mII } = guideStats(img, r);
  const m = (a) => boxMean(a, w, h, r);
  const mp = m(p), mIp = I.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * p[i]; return m(o); });
  const ak = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], bk = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r0 = mI[0][i], g0 = mI[1][i], b0 = mI[2][i];
    // The window's colour covariance, regularised, and its covariance with p.
    const vrr = mII[0][i] - r0 * r0 + eps, vrg = mII[1][i] - r0 * g0, vrb = mII[2][i] - r0 * b0;
    const vgg = mII[3][i] - g0 * g0 + eps, vgb = mII[4][i] - g0 * b0, vbb = mII[5][i] - b0 * b0 + eps;
    const cr = mIp[0][i] - r0 * mp[i], cg = mIp[1][i] - g0 * mp[i], cb = mIp[2][i] - b0 * mp[i];
    // Inverse of the symmetric 3 × 3 by cofactors.
    const i00 = vgg * vbb - vgb * vgb, i01 = vrb * vgb - vrg * vbb, i02 = vrg * vgb - vrb * vgg;
    const i11 = vrr * vbb - vrb * vrb, i12 = vrb * vrg - vrr * vgb, i22 = vrr * vgg - vrg * vrg;
    const det = vrr * i00 + vrg * i01 + vrb * i02 || 1e-12;
    const a0 = (i00 * cr + i01 * cg + i02 * cb) / det, a1 = (i01 * cr + i11 * cg + i12 * cb) / det, a2 = (i02 * cr + i12 * cg + i22 * cb) / det;
    ak[0][i] = a0; ak[1][i] = a1; ak[2][i] = a2; bk[i] = mp[i] - a0 * r0 - a1 * g0 - a2 * b0;
  }
  const ma = ak.map(m), mb = m(bk), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = ma[0][i] * I[0][i] + ma[1][i] * I[1][i] + ma[2][i] * I[2][i] + mb[i];
  return q;
}

// The guide's channels and, per radius, their window means and products (kept on img).
function guideStats(img, r) {
  const { w, h, rgb } = img, n = w * h;
  img.guide ||= { I: [0, 1, 2].map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rgb[i * 3 + c]; return o; }) };
  const g = img.guide;
  if (!g[r]) {
    const m = (a) => boxMean(a, w, h, r), I = g.I;
    const prod = (a, b) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] * b[i]; return m(o); };
    g[r] = { mI: I.map(m), mII: [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]].map(([a, b]) => prod(I[a], I[b])) };
  }
  return { I: g.I, ...g[r] };
}

/** Value at fraction `p` of the sorted values (quickselect on a copy: no full sort). */
export function percentile(v, p) {
  const n = v.length;
  if (!n) return 0;
  const a = new Float32Array(v), k = Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))));
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return a[k];
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// out[i] = f(src[i], i) as a plain loop: TypedArray.from with a map function walks an iterator,
// several times slower on these arrays.
function map(src, f, out = new Float32Array(src.length)) { for (let i = 0; i < src.length; i++) out[i] = f(src[i], i); return out; }

/** Otsu's threshold of values in [0, 1]: the cut that best separates two groups. */
export function otsu(v, bins = 64) {
  const hist = new Float64Array(bins);
  for (const x of v) hist[Math.min(bins - 1, Math.max(0, Math.floor(x * bins)))]++;
  let total = 0, sum = 0;
  for (let i = 0; i < bins; i++) { total += hist[i]; sum += i * hist[i]; }
  let wB = 0, sB = 0, best = 0, cut = 0.5;
  for (let i = 0; i < bins - 1; i++) {
    wB += hist[i]; sB += i * hist[i];
    const wF = total - wB;
    if (!wB || !wF) continue;
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best) { best = between; cut = (i + 1) / bins; }
  }
  return cut;
}

// ------------------------------------------------------------------ the subject

/**
 * Grow `mask` (0/1, in place) through 4-connected pixels where allow(i) holds: a flood fill from
 * every pixel already in it. Returns the mask.
 */
export function grow(mask, w, h, allow) {
  const n = w * h, stack = new Int32Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) if (mask[i]) stack[top++] = i;
  while (top) {
    const i = stack[--top], x = i % w;
    if (x > 0 && !mask[i - 1] && allow(i - 1)) { mask[i - 1] = 1; stack[top++] = i - 1; }
    if (x < w - 1 && !mask[i + 1] && allow(i + 1)) { mask[i + 1] = 1; stack[top++] = i + 1; }
    if (i >= w && !mask[i - w] && allow(i - w)) { mask[i - w] = 1; stack[top++] = i - w; }
    if (i < n - w && !mask[i + w] && allow(i + w)) { mask[i + w] = 1; stack[top++] = i + w; }
  }
  return mask;
}

/** Which border pixels stand for the background: a band along the sides `sides` names. */
export function borderSeeds(w, h, sides = 'tlrb') {
  const seed = new Uint8Array(w * h), b = Math.max(2, Math.round(0.03 * Math.min(w, h)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((sides.includes('t') && y < b) || (sides.includes('b') && y >= h - b) || (sides.includes('l') && x < b) || (sides.includes('r') && x >= w - b)) seed[y * w + x] = 1;
  }
  return seed;
}

/**
 * Minimum barrier distance from the seeds (Zhang et al. 2015), summed over channels: for each
 * pixel, the least (highest − lowest value) met along any path to a seed. A subject is walled
 * off from the border by its outline, so it scores high however its inside varies; raster
 * scans down and back up converge in a few passes.
 */
export function barrierDistance(chans, w, h, seed, passes = 4) {
  const n = w * h, total = new Float32Array(n), D = new Float32Array(n), U = new Float32Array(n), Lo = new Float32Array(n);
  for (const I of chans) {
    for (let i = 0; i < n; i++) { D[i] = seed[i] ? 0 : Infinity; U[i] = Lo[i] = I[i]; }
    // Down and right from the top left, then up and left from the bottom right: each pixel takes
    // the path through a neighbour already visited (j) if its barrier is lower.
    const take = (i, j, v) => {
      const u = U[j] > v ? U[j] : v, l = Lo[j] < v ? Lo[j] : v;
      if (u - l < D[i]) { D[i] = u - l; U[i] = u; Lo[i] = l; }
    };
    for (let pass = 0; pass < passes; pass++) {
      if (pass % 2 === 0) {
        for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) {
          const v = I[i];
          if (x > 0) take(i, i - 1, v);
          if (y > 0) take(i, i - w, v);
        }
      } else {
        for (let y = h - 1; y >= 0; y--) for (let x = w - 1, i = y * w + x; x >= 0; x--, i--) {
          const v = I[i];
          if (x < w - 1) take(i, i + 1, v);
          if (y < h - 1) take(i, i + w, v);
        }
      }
    }
    let top = 0;
    for (let i = 0; i < n; i++) if (D[i] !== Infinity && D[i] > top) top = D[i];
    for (let i = 0; i < n; i++) total[i] += D[i] === Infinity ? top : D[i];
  }
  return total;
}

/**
 * How far each pixel's colour is from the border's: the seed pixels' Lab colours in `k`
 * clusters (k-means from a fixed start, so it is the same every time), and the distance to the
 * nearest one, or to the blend of two of them, over their own spread.
 */
export function borderColourDistance(img, seed, k = 3) {
  const { L, A, B, w, h } = img, n = w * h;
  let m = 0;
  for (let i = 0; i < n; i++) m += seed[i];
  const idx = new Int32Array(m);
  for (let i = 0, j = 0; i < n; i++) if (seed[i]) idx[j++] = i;
  if (!m) return new Float32Array(n);
  const C = new Float64Array(k * 3), spread = new Float64Array(k), d2 = (i, c) => (L[i] - C[c * 3]) ** 2 + (A[i] - C[c * 3 + 1]) ** 2 + (B[i] - C[c * 3 + 2]) ** 2;
  // Start: the seeds' mean, then each time the seed pixel farthest from the centres so far.
  for (const i of idx) { C[0] += L[i] / m; C[1] += A[i] / m; C[2] += B[i] / m; }
  for (let c = 1; c < k; c++) {
    let far = idx[0], fd = -1;
    for (const i of idx) { let d = Infinity; for (let q = 0; q < c; q++) d = Math.min(d, d2(i, q)); if (d > fd) { fd = d; far = i; } }
    C[c * 3] = L[far]; C[c * 3 + 1] = A[far]; C[c * 3 + 2] = B[far];
  }
  const acc = new Float64Array(k * 4);
  for (let it = 0; it < 8; it++) {
    acc.fill(0); spread.fill(0);
    for (const i of idx) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = d2(i, c); if (d < bd) { bd = d; best = c; } }
      acc[best * 4] += L[i]; acc[best * 4 + 1] += A[i]; acc[best * 4 + 2] += B[i]; acc[best * 4 + 3]++; spread[best] += bd;
    }
    for (let c = 0; c < k; c++) {
      const cnt = acc[c * 4 + 3];
      if (!cnt) continue;
      C[c * 3] = acc[c * 4] / cnt; C[c * 3 + 1] = acc[c * 4 + 1] / cnt; C[c * 3 + 2] = acc[c * 4 + 2] / cnt; spread[c] = Math.sqrt(spread[c] / cnt);
    }
  }
  // A colour between two of them is theirs too: where the wall meets the floor or the sky the
  // ground, the photo's edge blends the two, and that blend is not a subject.
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let c = 0; c < k; c++) best = Math.min(best, Math.sqrt(d2(i, c)) / (spread[c] + 6));
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      const ax = C[a * 3], ay = C[a * 3 + 1], az = C[a * 3 + 2], ex = C[b * 3] - ax, ey = C[b * 3 + 1] - ay, ez = C[b * 3 + 2] - az;
      const len2 = ex * ex + ey * ey + ez * ez;
      if (!(len2 > 0)) continue;
      const t = Math.min(1, Math.max(0, ((L[i] - ax) * ex + (A[i] - ay) * ey + (B[i] - az) * ez) / len2));
      const d = Math.hypot(L[i] - ax - t * ex, A[i] - ay - t * ey, B[i] - az - t * ez);
      best = Math.min(best, d / ((spread[a] + spread[b]) / 2 + 6));
    }
    out[i] = best;
  }
  return out;
}

/** 4-connected regions of a mask: labels (0 = outside) and each region's size and bounds. */
export function regions(mask, w, h) {
  const label = new Int32Array(w * h), list = [], stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    const id = list.length + 1, r = { id, size: 0, x0: w, y0: h, x1: 0, y1: 0, border: false, sx: 0, bottomX: 0, bottomN: 0 };
    let top = 0; stack[top++] = s; label[s] = id;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      r.size++; r.sx += x;
      if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y;
      if (y > r.y1) { r.y1 = y; r.bottomX = 0; r.bottomN = 0; }
      if (y === r.y1) { r.bottomX += x; r.bottomN++; }
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) r.border = true;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && !label[i - w]) { label[i - w] = id; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !label[i + w]) { label[i + w] = id; stack[top++] = i + w; }
    }
    list.push(r);
  }
  return { label, list };
}

/** Morphological opening by a (2r + 1)² square: what is thinner than that goes, the rest keeps
 *  its shape (a stroke of anti-aliased colour along an edge is not a subject). */
export function openMask(mask, w, h, r = 1) {
  const pass = (src, keepIf) => {
    // Rows then columns: a pixel survives erosion if all of its window is set, dilation if any is.
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let all = 1, any = 0;
      for (let d = -r; d <= r; d++) { const v = src[y * w + Math.min(w - 1, Math.max(0, x + d))]; all &= v; any |= v; }
      tmp[y * w + x] = keepIf(all, any);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let all = 1, any = 0;
      for (let d = -r; d <= r; d++) { const v = tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x]; all &= v; any |= v; }
      out[y * w + x] = keepIf(all, any);
    }
    return out;
  };
  return pass(pass(mask, (all) => all), (all, any) => any);
}

/** The mask without regions under `minArea` pixels and with its holes filled. */
export function cleanMask(mask, w, h, minArea) {
  const out = new Uint8Array(w * h), { label, list } = regions(mask, w, h);
  for (let i = 0; i < w * h; i++) if (label[i] && list[label[i] - 1].size >= minArea) out[i] = 1;
  // Holes: background regions that do not reach the border.
  const inv = map(out, (v) => 1 - v, new Uint8Array(w * h)), bg = regions(inv, w, h);
  for (let i = 0; i < w * h; i++) if (bg.label[i] && !bg.list[bg.label[i] - 1].border) out[i] = 1;
  return out;
}

/**
 * The subject: what is walled off from the background `seed`s by its outline or differs from
 * their colours. Returns {soft: 0..1 matte along the photo's edges, hard: 0/1, contrast: how
 * clearly it stands apart (0..1), area, parts: its regions, sal: the saliency read}. `centre`
 * weighs the middle of the frame up (portraits and objects sit there; a room's things do not).
 */
export function findSubject(img, seed, { centre = 0 } = {}) {
  const { w, h } = img, n = w * h;
  img.smooth ||= [img.L, img.A, img.B].map((c) => blur(c, w, h, 0.8));
  const mbd = barrierDistance(img.smooth, w, h, seed), cd = borderColourDistance(img, seed);
  // Each cue over its top end (not the 98th percentile: when the subject is small that is still
  // background, and the background's own small barriers would read as salient), never below a
  // clear difference (Lab units summed over the channels; spreads of the border's colours).
  const top1 = Math.max(percentile(mbd, 0.995), 40), top2 = Math.max(percentile(cd, 0.995), 2.5), sal = new Float32Array(n);
  const weight = new Float32Array(w);
  for (let x = 0; x < w; x++) { const u = (x + 0.5) / w - 0.5; weight[x] = 1 - centre + centre * Math.exp(-u * u / 0.18); }
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const a = mbd[i] / top1, b = cd[i] / top2;
    sal[i] = (0.55 * (a < 1 ? a : 1) + 0.45 * (b < 1 ? b : 1)) * weight[x];
  }
  // A confident core (Otsu's cut), grown through what still stands clearly above the background
  // (hysteresis): parts of the subject coloured like its surroundings (a white band on a board
  // against a cream wall) score lower but are joined to it.
  const cut = Math.max(0.2, otsu(sal));
  let bm = 0, bv = 0, bn = 0;
  for (let i = 0; i < n; i++) if (seed[i]) { bm += sal[i]; bv += sal[i] * sal[i]; bn++; }
  bm /= bn || 1; bv = Math.sqrt(Math.max(0, bv / (bn || 1) - bm * bm));
  const low = Math.min(0.8 * cut, Math.max(0.2, bm + 4 * bv));
  const grown = grow(map(sal, (v) => (v > cut ? 1 : 0), new Uint8Array(n)), w, h, (j) => sal[j] > low);
  // Opening by 5 × 5 first: a seam of blended colour where two parts of the background meet
  // (a horizon, a wall on a floor) is a few pixels thick and walled off like a subject.
  const hard = cleanMask(openMask(grown, w, h, 2), w, h, Math.round(0.012 * n));
  // Cut along the photo's own edges: a guided filter of the 0/1 mask, then pulled crisp.
  const r = Math.max(2, Math.round(0.018 * Math.max(w, h)));
  const soft = map(guidedFilter(img, new Float32Array(hard), r, 2e-3), (v) => smoothstep(0.3, 0.7, v));
  let si = 0, so = 0, ni = 0;
  for (let i = 0; i < n; i++) { if (hard[i]) { si += sal[i]; ni++; } else so += sal[i]; }
  const contrast = ni && ni < n ? clamp01(si / ni - so / (n - ni)) : 0;
  return { soft, hard, contrast, area: ni / n, parts: regions(hard, w, h).list, sal };
}

/**
 * Inflation (Ink-and-Ray, Sýkora et al. 2014; Lumo, Johnston 2002): the Poisson dome
 * ∇²φ = −4 inside the mask, 0 on its outline and level at the image's edges, whose square root
 * is a hemisphere of radius R over a disc of radius R and a half-cylinder over a strip, in
 * pixels. Solved coarse to fine: over-relaxed Gauss–Seidel on a pyramid, each level started from
 * the coarser one's answer (×4: the dome's height goes as size squared).
 */
export function inflate(mask, w, h) {
  const levels = [{ m: mask, W: w, H: h }];
  while (Math.max(levels.at(-1).W, levels.at(-1).H) > 40) {
    const { m, W, H } = levels.at(-1), W2 = Math.ceil(W / 2), H2 = Math.ceil(H / 2), m2 = new Uint8Array(W2 * H2);
    // A coarse cell is inside only when all its fine pixels are, so the outline never moves out.
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      let all = 1;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const X = Math.min(W - 1, 2 * x + dx), Y = Math.min(H - 1, 2 * y + dy); all &= m[Y * W + X]; }
      m2[y * W2 + x] = all;
    }
    levels.push({ m: m2, W: W2, H: H2 });
  }
  let phi = null, prev = null;
  for (let l = levels.length - 1; l >= 0; l--) {
    const { m, W, H } = levels[l], next = new Float32Array(W * H);
    if (phi) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (m[i]) next[i] = 4 * phi[Math.min(prev.H - 1, y >> 1) * prev.W + Math.min(prev.W - 1, x >> 1)]; }
    phi = relaxDome(m, W, H, next, l === levels.length - 1 ? 3 * Math.max(W, H) : 24);
    prev = levels[l];
  }
  return map(phi, (v) => Math.sqrt(Math.max(0, v)));
}

// Red-black over-relaxed Gauss–Seidel for the dome, level (mirrored) at the image's edges, where
// the subject goes on out of frame.
function relaxDome(m, W, H, phi, iters, omega = 1.9) {
  for (let it = 0; it < iters; it++) {
    for (let parity = 0; parity < 2; parity++) {
      for (let y = 0; y < H; y++) for (let x = (y + parity) & 1; x < W; x += 2) {
        const i = y * W + x;
        if (!m[i]) { phi[i] = 0; continue; }
        const l = phi[x > 0 ? i - 1 : i + 1], r = phi[x < W - 1 ? i + 1 : i - 1];
        const u = phi[y > 0 ? i - W : i + W], d = phi[y < H - 1 ? i + W : i - W];
        phi[i] += omega * ((l + r + u + d + 4) / 4 - phi[i]);
      }
    }
  }
  return phi;
}

// ------------------------------------------------------------------ sky and layout

/**
 * Sky: smooth pixels clearly brighter than the picture's middle tone, blue, or near white and
 * very bright (overcast), reached from the top edge through more of the same, in the upper
 * three quarters. A grey studio backdrop or a cream wall is neither, so it stays. Returns {soft,
 * hard, share, horizon} (horizon: the lowest row, as a fraction of the height, where most of
 * the width is still sky; null without sky).
 */
export function findSky(img) {
  const { w, h, L, A, B } = img, n = w * h;
  const grad = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    grad[i] = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]);
  }
  const smooth = blur(grad, w, h, 1.2), mid = percentile(L, 0.5), ok = new Uint8Array(n);
  for (let y = 0; y < Math.round(h * 0.78); y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const blue = B[i] < -8 && A[i] < 10 && L[i] > 45, overcast = Math.hypot(A[i], B[i]) < 9 && L[i] > 86;
    ok[i] = L[i] > mid + 8 && smooth[i] < 6 && (blue || overcast) ? 1 : 0;
  }
  const hard = new Uint8Array(n);
  for (let x = 0; x < w; x++) hard[x] = ok[x];
  grow(hard, w, h, (j) => ok[j]);
  let count = 0, horizon = null;
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) row += hard[y * w + x];
    count += row;
    if (row > 0.5 * w) horizon = (y + 1) / h;
  }
  if (count < 0.02 * n) return { soft: new Float32Array(n), hard: new Uint8Array(n), share: 0, horizon: null };
  const g = guidedFilter(img, new Float32Array(hard), Math.max(2, Math.round(0.012 * Math.max(w, h))), 1e-3);
  return { soft: map(g, (v) => smoothstep(0.35, 0.65, v)), hard, share: count / n, horizon };
}

/**
 * Lines of a room seen from its open side: the back wall's floor line (the longest horizontal
 * edge in the lower half), its ceiling line, and its two sides (long vertical edges left and
 * right). A line scores by how much of its length has an edge along it, not by contrast, so a
 * wall's corner beats the sharper but shorter edges of the paintings hung on it. Each line
 * falls back to ROOM_WALL's where the photo shows none clearly. Returns {wall, strength 0..1}.
 */
export function findRoomLines(img) {
  const { w, h, L } = img;
  const sm = blur(L, w, h, 0.8), rowC = new Float64Array(h), colC = new Float64Array(w);
  const xa = Math.round(0.2 * w), xb = Math.round(0.8 * w), ya = Math.round(0.15 * h), yb = Math.round(0.85 * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gy = Math.abs(sm[i + w] - sm[i - w]), gx = Math.abs(sm[i + 1] - sm[i - 1]);
    if (x >= xa && x < xb && gy > 2.5 && gy > 2 * gx) rowC[y] += 1 / (xb - xa);
    if (y >= ya && y < yb && gx > 2.5 && gx > 2 * gy) colC[x] += 1 / (yb - ya);
  }
  // The best line in [lo, hi] (fractions), a little drawn toward where rooms usually have it;
  // `cover`, how much of its length has an edge along it.
  const pick = (C, n, lo, hi, prior) => {
    let best = -1, at = prior, cover = 0;
    for (let k = Math.max(1, Math.round(lo * n)); k <= Math.min(n - 2, Math.round(hi * n)); k++) {
      const c = Math.max(C[k], (C[k - 1] + C[k] + C[k + 1]) / 2);
      const score = c * Math.exp(-(((k / n) - prior) ** 2) / (2 * 0.15 * 0.15));
      if (score > best) { best = score; at = (k + 0.5) / n; cover = c; }
    }
    return { at: cover > 0.35 ? at : prior, cover };
  };
  const floor = pick(rowC, h, 0.45, 0.9, ROOM_WALL.y1), ceil = pick(rowC, h, 0.04, 0.36, ROOM_WALL.y0);
  const left = pick(colC, w, 0.04, 0.4, ROOM_WALL.x0), right = pick(colC, w, 0.6, 0.96, ROOM_WALL.x1);
  // A room needs its floor line and both sides (one long line alone is a shelf or a horizon), and
  // perspective: the floor's edges along the side walls run from the back wall's lower corners
  // out toward the frame's, away from the vanishing point. A big board or panel in the frame has
  // the lines but not the diagonals.
  const wall = { x0: left.at, y0: ceil.at, x1: right.at, y1: floor.at };
  const lines = clamp01((floor.cover - 0.4) / 0.3) * clamp01((Math.min(left.cover, right.cover) - 0.3) / 0.3);
  const corners = [[wall.x0, wall.y1], [wall.x1, wall.y1]].map(([u, t]) => cornerRay(sm, w, h, wall, u, t));
  const strength = lines * clamp01((Math.min(...corners) - 0.25) / 0.35);
  return { wall, strength, lines, corners };
}

// How much of the ray from the vanishing point through a corner of the back wall (u, t), from
// the corner out to the frame, has an edge across it: 1 along a floor or ceiling edge.
function cornerRay(L, w, h, wall, u, t) {
  const cx = (wall.x0 + wall.x1) / 2 * w, cy = (wall.y0 + wall.y1) / 2 * h, x0 = u * w, y0 = t * h;
  let dx = x0 - cx, dy = y0 - cy;
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  let hit = 0, all = 0;
  for (let k = 3; ; k += 1) {
    const x = Math.round(x0 + dx * k), y = Math.round(y0 + dy * k);
    if (x < 2 || y < 2 || x > w - 3 || y > h - 3) break;
    // Across the ray: the luminance step from one side of it to the other, two pixels out.
    const nx = -dy, ny = dx, a = L[Math.round(y + 2 * ny) * w + Math.round(x + 2 * nx)], b = L[Math.round(y - 2 * ny) * w + Math.round(x - 2 * nx)];
    all++; if (Math.abs(a - b) > 3) hit++;
  }
  return all >= 6 ? hit / all : 0;
}

/**
 * Nearness of the space behind the subject, 0 (the back) to 1 (the camera), per type:
 *   portrait  a backdrop, its floor sweeping forward in the bottom quarter;
 *   room      a box seen from its open side in one-point perspective: the back wall's rectangle
 *             `wall`, and floor, ceiling and side walls running out to the frame;
 *   object    a wall, a floor in front of it below `floorAt` (fraction from the top);
 *   photo     ground rising toward the camera below the horizon, the rest far.
 */
export function layout(type, w, h, { wall = ROOM_WALL, floorAt = 0.8, horizon = HORIZON } = {}) {
  const out = new Float32Array(w * h);
  const cx = (wall.x0 + wall.x1) / 2, cy = (wall.y0 + wall.y1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, t = (y + 0.5) / h;
    let near = 0;
    if (type === 'portrait') near = 0.15 * smoothstep(0.72, 1, t);
    else if (type === 'room') {
      // Depth of the first surface the ray meets, as a share of the back wall's: a pixel past an
      // edge of the wall's rectangle sees the plane on that side, nearer the further out it is.
      let z = 1;
      if (t > wall.y1) z = Math.min(z, (wall.y1 - cy) / (t - cy));
      if (t < wall.y0) z = Math.min(z, (cy - wall.y0) / (cy - t));
      if (u < wall.x0) z = Math.min(z, (cx - wall.x0) / (cx - u));
      if (u > wall.x1) z = Math.min(z, (wall.x1 - cx) / (u - cx));
      near = 1 - z;
    } else if (type === 'object') near = t > floorAt ? 0.6 * (t - floorAt) / Math.max(0.05, 1 - floorAt) : 0;
    else if (type === 'photo') near = t > horizon ? (t - horizon) / Math.max(0.05, 1 - horizon) : 0;
    out[y * w + x] = near;
  }
  return out;
}

// ------------------------------------------------------------------ the scene

/**
 * Everything about the image that does not depend on the type's sliders, read once per photo:
 * the image arrays, the subject for each way of seeding the background, sky, room lines, the
 * photo's lighting at large scale (log luminance smoothed along its edges: the de-light divides
 * it out) and its form band. Then `composeScene` makes the maps for a type and settings in a
 * few milliseconds, so the sliders stay live.
 */
export function readScene(rgba, w, h) {
  const img = readImage(rgba, w, h), n = w * h, size = Math.max(w, h);
  const logY = map(img.Y, (y) => Math.log(y + 0.004));
  const form = new Float32Array(n), f1 = blur(logY, w, h, 0.012 * size), f2 = blur(logY, w, h, 0.07 * size);
  for (let i = 0; i < n; i++) form[i] = Math.max(-1, Math.min(1, f1[i] - f2[i]));
  // Subjects, made when first asked for: a portrait or an object usually runs out of the bottom
  // of the frame (a body, a floor), so its background seeds are the other three sides ('tlr');
  // a room's or a photo's are all four ('tlrb').
  const subjects = {};
  const subject = (sides) => (subjects[sides] ||= findSubject(img, borderSeeds(w, h, sides), { centre: sides === 'tlr' ? 0.5 : 0 }));
  return { img, w, h, light: photoLight(img, logY), form, subject, sky: findSky(img), room: findRoomLines(img) };
}

/**
 * The photo's own lighting: how brightness varies across each surface, at the scale of surfaces
 * (smoothed along the photo's edges so it stops at outlines), less its level over much more of
 * the same surface. What is left is shading (a face's lit and shaded sides, a wall's pool of
 * light), not the paint's or the cloth's own darkness, which the larger scale shares; the
 * de-light divides it out. Read at half size (it is smooth) and carried back up.
 */
function photoLight(img, logY) {
  const { w, h } = img, w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const half = (src, ch = 1) => {
    const o = new Float32Array(w2 * h2 * ch);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < ch; c++) {
      let s = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += src[(Math.min(h - 1, 2 * y + dy) * w + Math.min(w - 1, 2 * x + dx)) * ch + c];
      o[(y * w2 + x) * ch + c] = s / 4;
    }
    return o;
  };
  const small = { w: w2, h: h2, rgb: half(img.rgb, 3) }, ly = half(logY), size = Math.max(w2, h2);
  const along = (sigma, r) => guidedFilter(small, blur(ly, w2, h2, sigma * size), Math.max(2, Math.round(r * size)), 4e-3);
  const near = along(0.02, 0.06), wide = along(0.08, 0.22), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Bilinear, half-texel aligned.
    const fx = Math.min(w2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(h2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w2 - 1, x0 + 1), y1 = Math.min(h2 - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const at = (X, Y) => near[Y * w2 + X] - wide[Y * w2 + X];
    out[y * w + x] = (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
  }
  return out;
}

/**
 * The scene maps for `type` and its settings (SCENE_SHAPE, plus wall / horizon overrides),
 * rows top first: height in image widths (what the lights shade and shadow; also as `behind`
 * and `front`, the two smooth fields the subject matte joins), the photo's light
 * (log luminance across each surface: above 0 where it is lit more than the surface as a whole,
 * below in its shade), the subject matte and the sky matte, 0..1.
 */
export function composeScene(scene, type, settings = {}) {
  const { w, h, img } = scene, n = w * h;
  const s = { ...SCENE_SHAPE[type] || SCENE_SHAPE.photo, ...settings };
  const sky = type === 'photo' ? scene.sky : { soft: new Float32Array(n), horizon: null };
  const horizon = s.horizon ?? sky.horizon ?? HORIZON;
  const wall = s.wall || scene.room.wall;
  // A room's subject is only what stands on its floor (people, plinths): paintings hang on its
  // walls and stay there.
  const subj = scene.subject(type === 'portrait' || type === 'object' ? 'tlr' : 'tlrb');
  const hard = new Uint8Array(n), soft = new Float32Array(n);
  const floorAt = type === 'object' ? floorLine(subj, h) : 0.8;
  const back = layout(type, w, h, { wall, floorAt, horizon });
  const base = new Float32Array(subj.parts.length);   // nearness each part stands at
  for (const [k, p] of subj.parts.entries()) {
    const big = p.size >= 0.01 * n;
    const bottom = (p.y1 + 1) / h, contactX = Math.min(w - 1, Math.round(p.bottomN ? p.bottomX / p.bottomN : p.sx / p.size));
    const standing = bottom < 0.985;   // meets a floor inside the frame
    if (type === 'room' && !(standing && bottom > wall.y1 + 0.02 && big)) { base[k] = -1; continue; }
    if (!big) { base[k] = -1; continue; }
    const ground = back[Math.min(h - 1, p.y1) * w + contactX];
    base[k] = standing && type !== 'portrait' ? ground + 0.04 : Math.max(ground, s.gap);
  }
  const { label } = regions(subj.hard, w, h);
  for (let i = 0; i < n; i++) if (label[i] && base[label[i] - 1] >= 0) hard[i] = 1;
  // The matte: the soft one where a kept part is, spreading a little past its outline.
  const keep = blur(new Float32Array(hard), w, h, 1.5);
  for (let i = 0; i < n; i++) soft[i] = subj.soft[i] * smoothstep(0.02, 0.4, keep[i]);
  const dome = s.roundness > 0 ? inflate(hard, w, h) : new Float32Array(n);
  const nearBase = new Float32Array(n);
  for (let i = 0; i < n; i++) nearBase[i] = label[i] && base[label[i] - 1] >= 0 ? base[label[i] - 1] : 0;
  // Spread each part's standing nearness under its soft edge, so the matte blends to it.
  const nb = spread(nearBase, hard, w, h);
  // Behind (the layout) and in front (the subject: where it stands, rounded, its form), each
  // smooth, and the matte between them: the GPU joins them along the photo's own edges at
  // every size, so an outline stays crisp in a full-size export.
  const behind = new Float32Array(n), front = new Float32Array(n), height = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    behind[i] = back[i] * s.depth * (1 - sky.soft[i]);
    front[i] = nb[i] * s.depth + s.roundness * dome[i] / w + s.form * FORM_WIDTHS * scene.form[i];
    height[i] = behind[i] + soft[i] * (front[i] - behind[i]);
  }
  return { w, h, behind, front, height, light: scene.light, subject: soft, sky: sky.soft, wall, horizon: type === 'photo' ? horizon : null, floorAt: type === 'object' ? floorAt : null, settings: s };
}

// Where an object's floor meets the wall: just above where its subject meets the floor, or the
// default line when it runs out of the frame.
function floorLine(subj, h) {
  const p = subj.parts.reduce((a, b) => (b.size > (a?.size || 0) ? b : a), null);
  if (!p) return 0.8;
  const bottom = (p.y1 + 1) / h;
  return bottom < 0.985 ? Math.max(0.5, bottom - 0.12) : 0.8;
}

// Values inside `mask` carried out to the pixels near it (nearest inside value, by repeated
// 3 × 3 growth), so a soft edge blends toward the part it belongs to.
function spread(v, mask, w, h, steps = 6) {
  let cur = new Float32Array(v), has = new Uint8Array(mask);
  for (let s = 0; s < steps; s++) {
    const next = new Float32Array(cur), nh = new Uint8Array(has);
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      if (has[i]) continue;
      let sum = 0, k = 0;
      if (x > 0 && has[i - 1]) { sum += cur[i - 1]; k++; }
      if (x < w - 1 && has[i + 1]) { sum += cur[i + 1]; k++; }
      if (y > 0 && has[i - w]) { sum += cur[i - w]; k++; }
      if (y < h - 1 && has[i + w]) { sum += cur[i + w]; k++; }
      if (k) { next[i] = sum / k; nh[i] = 1; }
    }
    cur = next; has = nh;
  }
  return cur;
}

// ------------------------------------------------------------------ what is it?

const isSkin = (r, g, b) => {
  const y = 0.299 * r + 0.587 * g + 0.114 * b, cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 45 && cb >= 77 && cb <= 127 && cr >= 135 && cr <= 173;
};

/**
 * What the image most likely is, for the suggestion on open: {type, sure 0..1, why, scores}.
 * A guess from a few cues, never applied by itself (a painting of a person has skin tones too):
 *   portrait  a patch of skin tones in the upper part of a clear subject (a face);
 *   room      long floor and side lines, and no single subject filling the frame;
 *   photo     sky along the top;
 *   object    a clear subject apart from its surroundings;
 *   artwork   none of these: the picture fills the frame (the default).
 */
export function suggestType(scene) {
  const { img, w, h } = scene, n = w * h, s3 = scene.subject('tlr');
  // Skin in the subject, and its largest patch: a face is one patch of skin in the subject's upper
  // part, where a painting's skin-coloured strokes lie scattered.
  const skinMask = new Uint8Array(n);
  let inSubj = 0, top = h, bottom = 0;
  for (let i = 0; i < n; i++) if (s3.hard[i]) {
    inSubj++; const y = (i / w) | 0; top = Math.min(top, y); bottom = Math.max(bottom, y);
    if (isSkin(img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2])) skinMask[i] = 1;
  }
  const face = regions(skinMask, w, h).list.reduce((a, b) => (b.size > (a?.size || 0) ? b : a), null);
  const faceY = face ? (face.y0 + face.y1) / 2 : h;
  const skinShare = inSubj && face ? face.size / inSubj : 0;
  const faceHigh = face && faceY <= top + 0.67 * (bottom - top);
  const clear = s3.contrast > 0.5 && s3.area > 0.06 && s3.area < 0.85;
  const scores = {
    portrait: clear && faceHigh && skinShare > 0.04 ? Math.min(1, 0.5 + skinShare * 2) : 0,
    room: scene.room.strength > 0.4 && !(clear && s3.area > 0.12) ? scene.room.strength : 0,
    photo: scene.sky.share > 0.06 ? Math.min(1, 0.4 + scene.sky.share * 2) : 0,
    object: clear ? Math.min(1, 0.2 + s3.contrast * 0.8) : 0,
  };
  const [type, sure] = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a), ['artwork', 0.4]);
  const why = {
    portrait: `a face-like patch of skin tones, ${Math.round(skinShare * 100)}% of a clear subject`,
    room: 'long floor and wall lines, like a room or a booth seen from its open side',
    photo: `sky over ${Math.round(scene.sky.share * 100)}% of the picture`,
    object: 'a clear subject standing apart from its surroundings',
    artwork: 'the picture fills the frame, with no clear subject, sky or room',
  }[type];
  return { type, sure, why, scores, skinShare, subjectArea: s3.area, subjectContrast: s3.contrast };
}

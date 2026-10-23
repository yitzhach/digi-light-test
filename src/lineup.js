// lineup.js — a handheld photo of the painting lined up onto the painting photo.
//
// A sunlit photo is taken outdoors, by hand, from another spot: the painting sits elsewhere in
// the frame, larger or smaller, a little turned and in another perspective, with trees and sky
// around it. Since the painting is flat, one homography takes it onto the painting photo; this
// finds it the way tools/realref/register.py does with OpenCV, in plain JS and without the DOM:
// SIFT-like features (difference-of-Gaussian blobs, a dominant gradient direction, a 4 x 4 x 8
// gradient histogram), found on two copies of each photo, brightness and the colour ratio
// r / (r + g + b), each with its contrast evened out locally (the light changes brightness much
// more than the paint's colour, so the colour ratio keeps matches where raking sun has changed
// the brightness pattern: on the user's lintel panel brightness alone kept 6 of 18), matched with
// Lowe's ratio test, pooled, then a RANSAC homography refitted on its inliers. Features crowd
// where the painting has the most texture (and on anything standing off it, a fixed piece of wood,
// whose parallax pulls the fit), so the homography is then refined over the whole painting: patches
// on a grid matched on colour (as lampphotos.js align does for a tripod's creep) and the
// homography refitted through them, dropping the ones that disagree. align then takes out the rest.

import { boxBlur, colourBands, bestShift } from './lampphotos.js';

const WORK = 1000;              // features are found on copies this wide (as register.py)
const OCTAVE_LAYERS = 3, SIGMA0 = 1.6, CONTRAST = 0.02, EDGE = 10, MAX_FEATURES = 4000;
const RATIO = 0.8, RANSAC_PX = 3, RANSAC_ITERS = 3000;   // RANSAC_PX in working pixels (about 6 full-size, as register.py)

/** Separable Gaussian blur (kernel cut at 3 sigma, edges clamped). */
function gauss(src, w, h, sigma) {
  if (sigma < 0.2) return Float32Array.from(src);
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-i * i / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const t = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * src[o + Math.min(w - 1, Math.max(0, x + i))];
      t[o + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * t[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

/** RGBA bytes at `w` x `h` -> the two channels at about WORK px wide (area average), and the
 *  scale (working pixels per source pixel). */
function workChannels(rgba, w, h) {
  const k = Math.min(1, WORK / Math.max(w, h)), W = Math.max(8, Math.round(w * k)), H = Math.max(8, Math.round(h * k));
  const lum = new Float32Array(W * H), rat = new Float32Array(W * H), cnt = new Float32Array(W * H);
  const sx = W / w, sy = H / h;
  for (let y = 0; y < h; y++) {
    const Y = Math.min(H - 1, Math.floor(y * sy));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = Y * W + Math.min(W - 1, Math.floor(x * sx));
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      lum[j] += (0.299 * r + 0.587 * g + 0.114 * b) / 255; rat[j] += (r + 1) / (r + g + b + 3); cnt[j]++;
    }
  }
  for (let j = 0; j < W * H; j++) { lum[j] /= cnt[j] || 1; rat[j] /= cnt[j] || 1; }
  return { W, H, k: [W / w, H / h], chans: [even(lum, W, H), even(rat, W, H)] };
}
// Local contrast evened out (as CLAHE does for register.py): the local mean taken off and the
// local spread divided out, over a window an eighth of the picture across, then squashed to 0..1.
function even(a, w, h) {
  const r = Math.max(w, h) / 16, m = boxBlur(a, w, h, r), d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = (a[i] - m[i]) ** 2;
  const v = boxBlur(d, w, h, r), out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = 0.5 + 0.5 * Math.tanh((a[i] - m[i]) / (Math.sqrt(v[i]) + 1e-3) / 2.5);
  return out;
}

function half(a, w, h) {
  const W = w >> 1, H = h >> 1, o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = a[2 * y * w + 2 * x];
  return { a: o, w: W, h: H };
}

/** SIFT-like features of one channel: [{x, y, s, d (Float32Array 128)}], x, y in its pixels. */
function features(img, w, h) {
  const out = [];
  let base = gauss(img, w, h, Math.sqrt(SIGMA0 * SIGMA0 - 0.25)), bw = w, bh = h, step = 1;
  const kf = 2 ** (1 / OCTAVE_LAYERS);
  while (Math.min(bw, bh) >= 32) {
    // Gaussians at SIGMA0 * kf^i, i = 0 .. OCTAVE_LAYERS + 2, each blurred from the one before.
    const G = [base];
    for (let i = 1; i < OCTAVE_LAYERS + 3; i++) {
      const prev = SIGMA0 * kf ** (i - 1), next = prev * kf;
      G.push(gauss(G[i - 1], bw, bh, Math.sqrt(next * next - prev * prev)));
    }
    const D = [];
    for (let i = 0; i + 1 < G.length; i++) { const d = new Float32Array(bw * bh); for (let j = 0; j < d.length; j++) d[j] = G[i + 1][j] - G[i][j]; D.push(d); }
    // Gradient magnitude and direction of each Gaussian, for orientation and descriptor.
    const grads = G.map((g) => {
      const mag = new Float32Array(bw * bh), ang = new Float32Array(bw * bh);
      for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
        const i = y * bw + x, dx = g[i + 1] - g[i - 1], dy = g[i + bw] - g[i - bw];
        mag[i] = Math.hypot(dx, dy); ang[i] = Math.atan2(dy, dx);
      }
      return { mag, ang };
    });
    for (let l = 1; l <= OCTAVE_LAYERS; l++) {
      const a = D[l - 1], b = D[l], c = D[l + 1];
      for (let y = 8; y < bh - 8; y++) for (let x = 8; x < bw - 8; x++) {
        const i = y * bw + x, v = b[i];
        if (Math.abs(v) < CONTRAST / OCTAVE_LAYERS) continue;
        let ext = true;
        const isMax = v > 0;
        for (let dy = -1; dy <= 1 && ext; dy++) for (let dx = -1; dx <= 1 && ext; dx++) {
          const j = i + dy * bw + dx;
          if (isMax ? (a[j] >= v || c[j] >= v || (j !== i && b[j] >= v)) : (a[j] <= v || c[j] <= v || (j !== i && b[j] <= v))) ext = false;
        }
        if (!ext) continue;
        // Edges: the ratio of principal curvatures (Lowe's test).
        const dxx = b[i + 1] + b[i - 1] - 2 * v, dyy = b[i + bw] + b[i - bw] - 2 * v;
        const dxy = 0.25 * (b[i + bw + 1] - b[i + bw - 1] - b[i - bw + 1] + b[i - bw - 1]);
        const tr = dxx + dyy, det = dxx * dyy - dxy * dxy;
        if (det <= 0 || tr * tr * EDGE >= (EDGE + 1) ** 2 * det) continue;
        // Sub-pixel place: a parabola through the neighbours on each axis.
        const ox = dxx !== 0 ? Math.max(-0.5, Math.min(0.5, -0.5 * (b[i + 1] - b[i - 1]) / dxx)) : 0;
        const oy = dyy !== 0 ? Math.max(-0.5, Math.min(0.5, -0.5 * (b[i + bw] - b[i - bw]) / dyy)) : 0;
        const sigma = SIGMA0 * kf ** l;
        for (const kp of describe(grads[l], bw, bh, x + ox, y + oy, sigma)) {
          out.push({ x: kp.x * step, y: kp.y * step, s: sigma * step, r: Math.abs(v), d: kp.d });
        }
      }
    }
    const n = half(G[OCTAVE_LAYERS], bw, bh);
    base = n.a; bw = n.w; bh = n.h; step *= 2;
  }
  out.sort((p, q) => q.r - p.r);
  return out.slice(0, MAX_FEATURES);
}

// The dominant directions at a point (peaks of a 36-bin histogram within 80% of the highest) and
// the 128-number descriptor turned to each.
function describe({ mag, ang }, w, h, x, y, sigma) {
  const hist = new Float32Array(36), R = Math.round(4.5 * sigma), cx = Math.round(x), cy = Math.round(y), s2 = 2 * (1.5 * sigma) ** 2;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const X = cx + dx, Y = cy + dy;
    if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
    const i = Y * w + X, bin = Math.floor(((ang[i] + Math.PI) / (2 * Math.PI)) * 36) % 36;
    hist[bin] += mag[i] * Math.exp(-(dx * dx + dy * dy) / s2);
  }
  const sm = hist.map((_, i) => (hist[(i + 35) % 36] + 2 * hist[i] + hist[(i + 1) % 36]) / 4);
  const top = Math.max(...sm), out = [];
  for (let i = 0; i < 36; i++) {
    const l = sm[(i + 35) % 36], c = sm[i], r = sm[(i + 1) % 36];
    if (c < 0.8 * top || c <= l || c <= r) continue;
    const off = 0.5 * (l - r) / (l - 2 * c + r), theta = ((i + 0.5 + off) / 36) * 2 * Math.PI - Math.PI;
    out.push({ x, y, d: descriptor(mag, ang, w, h, x, y, sigma, theta) });
    if (out.length === 2) break;
  }
  return out;
}
function descriptor(mag, ang, w, h, x, y, sigma, theta) {
  const d = new Float32Array(128), cell = 3 * sigma, R = Math.round(cell * 2.5 * Math.SQRT2), co = Math.cos(theta), si = Math.sin(theta);
  const cx = Math.round(x), cy = Math.round(y);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const X = cx + dx, Y = cy + dy;
    if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
    // Into the point's own frame, in cells; cells span -2..2.
    const u = (co * (X - x) + si * (Y - y)) / cell, v = (-si * (X - x) + co * (Y - y)) / cell;
    const fu = u + 1.5, fv = v + 1.5;
    if (fu <= -1 || fu >= 4 || fv <= -1 || fv >= 4) continue;
    const i = Y * w + X, m = mag[i] * Math.exp(-(u * u + v * v) / 8);
    let o = (ang[i] - theta) / (2 * Math.PI) * 8; o = ((o % 8) + 8) % 8;
    const u0 = Math.floor(fu), v0 = Math.floor(fv), o0 = Math.floor(o), tu = fu - u0, tv = fv - v0, to = o - o0;
    for (let a = 0; a < 2; a++) {
      const U = u0 + a; if (U < 0 || U > 3) continue;
      for (let b = 0; b < 2; b++) {
        const V = v0 + b; if (V < 0 || V > 3) continue;
        const wuv = (a ? tu : 1 - tu) * (b ? tv : 1 - tv);
        d[(V * 4 + U) * 8 + o0 % 8] += m * wuv * (1 - to);
        d[(V * 4 + U) * 8 + (o0 + 1) % 8] += m * wuv * to;
      }
    }
  }
  // Normalised, large bins clipped (lighting), normalised again.
  let n = 0; for (const v of d) n += v * v; n = Math.sqrt(n) || 1;
  for (let i = 0; i < 128; i++) d[i] = Math.min(0.2, d[i] / n);
  n = 0; for (const v of d) n += v * v; n = Math.sqrt(n) || 1;
  for (let i = 0; i < 128; i++) d[i] /= n;
  return d;
}

/** Matches of features `a` in features `b` passing the ratio test: [[ia, ib], ...]. */
function match(a, b) {
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[i].d;
    let best = Infinity, second = Infinity, bj = -1;
    for (let j = 0; j < b.length; j++) {
      const q = b[j].d; let s = 0;
      for (let k = 0; k < 128; k++) { const t = p[k] - q[k]; s += t * t; if (s >= second) break; }
      if (s < best) { second = best; best = s; bj = j; } else if (s < second) second = s;
    }
    if (bj >= 0 && best < RATIO * RATIO * second) out.push([i, bj]);
  }
  return out;
}

// ------------------------------------------------------------------ homographies
// H maps (x, y) to ((h0 x + h1 y + h2) / w, (h3 x + h4 y + h5) / w), w = h6 x + h7 y + h8.
export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
// Least squares through point pairs (normalised first, Hartley), h8 = 1.
function fitH(src, dst) {
  const norm = (pts) => {
    let mx = 0, my = 0; for (const [x, y] of pts) { mx += x; my += y; } mx /= pts.length; my /= pts.length;
    let d = 0; for (const [x, y] of pts) d += Math.hypot(x - mx, y - my); d = d / pts.length || 1;
    const s = Math.SQRT2 / d; return { s, mx, my, p: pts.map(([x, y]) => [(x - mx) * s, (y - my) * s]) };
  };
  const A = norm(src), B = norm(dst), M = new Float64Array(64), v = new Float64Array(8);
  for (let i = 0; i < src.length; i++) {
    const [x, y] = A.p[i], [u, w] = B.p[i];
    const r1 = [x, y, 1, 0, 0, 0, -u * x, -u * y], r2 = [0, 0, 0, x, y, 1, -w * x, -w * y];
    for (const [r, t] of [[r1, u], [r2, w]]) for (let a = 0; a < 8; a++) { v[a] += r[a] * t; for (let b = 0; b < 8; b++) M[a * 8 + b] += r[a] * r[b]; }
  }
  const h = solve(M, v, 8); if (!h) return null;
  const Hn = [...h, 1];
  // Undo the normalisation: H = TB^-1 Hn TA.
  const TA = [A.s, 0, -A.s * A.mx, 0, A.s, -A.s * A.my, 0, 0, 1], TBi = [1 / B.s, 0, B.mx, 0, 1 / B.s, B.my, 0, 0, 1];
  const H = mul3(TBi, mul3(Hn, TA));
  return H.map((e) => e / H[8]);
}
function mul3(a, b) {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
}
export function invertH(H) {
  const [a, b, c, d, e, f, g, h, i] = H, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}
function solve(M, v, n) {
  const a = Float64Array.from(M), b = Float64Array.from(v);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r;
    if (Math.abs(a[p * n + c]) < 1e-12) return null;
    if (p !== c) { for (let k = 0; k < n; k++) [a[c * n + k], a[p * n + k]] = [a[p * n + k], a[c * n + k]]; [b[c], b[p]] = [b[p], b[c]]; }
    for (let r = c + 1; r < n; r++) { const f = a[r * n + c] / a[c * n + c]; if (!f) continue; for (let k = c; k < n; k++) a[r * n + k] -= f * a[c * n + k]; b[r] -= f * b[c]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= a[r * n + k] * x[k]; x[r] = s / a[r * n + r]; }
  return Array.from(x);
}

// A seeded generator, so the same photos always give the same lining up.
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** RANSAC over the pairs (src -> dst), then refitted on the inliers twice. */
function ransac(src, dst) {
  const n = src.length, rand = rng(12345), lim2 = RANSAC_PX * RANSAC_PX;
  let best = null, bestIn = [];
  const inliers = (H) => { const k = []; for (let i = 0; i < n; i++) { const [x, y] = applyH(H, src[i][0], src[i][1]); if ((x - dst[i][0]) ** 2 + (y - dst[i][1]) ** 2 < lim2) k.push(i); } return k; };
  for (let it = 0; it < RANSAC_ITERS; it++) {
    const pick = new Set(); while (pick.size < 4) pick.add(Math.floor(rand() * n));
    const p = [...pick], H = fitH(p.map((i) => src[i]), p.map((i) => dst[i]));
    if (!H || !(Math.abs(H[6]) < 0.01 && Math.abs(H[7]) < 0.01)) continue;   // no wild perspective
    const k = inliers(H);
    if (k.length > bestIn.length) { best = H; bestIn = k; }
  }
  for (let r = 0; r < 2 && bestIn.length >= 8; r++) {
    const H = fitH(bestIn.map((i) => src[i]), bestIn.map((i) => dst[i]));
    if (!H) break;
    const k = inliers(H);
    if (k.length < bestIn.length) break;
    best = H; bestIn = k;
  }
  return { H: best, inliers: bestIn };
}

// Patches on a G x G grid over the painting photo (w x h RGBA), matched in the other photo drawn
// in its frame by H, to a fraction of a pixel; then H refitted through them (painting photo pixel
// -> where H puts the matched place), the worst dropped until the rest agree.
const REFINE_GRID = 9, REFINE_REACH = 6;
function refine(ref, w, h, mov, mw, mh, H) {
  const warped = warpPhoto(mov, mw, mh, H, w, h, w, h);
  const A = colourBands(ref, w, h), B = colourBands(warped, w, h);
  const P = Math.max(24, Math.min(96, Math.floor(Math.min(w, h) / 12))), R = REFINE_REACH, inset = P / 2 + R + 3;
  const src = [], dst = [], q = [];
  for (let gy = 0; gy < REFINE_GRID; gy++) for (let gx = 0; gx < REFINE_GRID; gx++) {
    const cx = Math.round(inset + (w - 2 * inset) * gx / (REFINE_GRID - 1)), cy = Math.round(inset + (h - 2 * inset) * gy / (REFINE_GRID - 1));
    const x0 = cx - (P >> 1), y0 = cy - (P >> 1);
    // Patches the other photo does not fully cover are no use.
    let full = true;
    for (let y = y0 - R; y < y0 + P + R && full; y += 4) for (let x = x0 - R; x < x0 + P + R; x += 4) if (warped[(y * w + x) * 4 + 3] < 255) { full = false; break; }
    if (!full) continue;
    const f = bestShift(A, B, w, x0, y0, P, 0, 0, R);
    if (f.best < 0.3 || Math.abs(f.bx) === R || Math.abs(f.by) === R) continue;
    const para = (m, z, p) => { const d = m - 2 * z + p; return d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (m - p) / d)) : 0; };
    const dx = f.bx + para(f.at(f.bx - 1, f.by), f.best, f.at(f.bx + 1, f.by)), dy = f.by + para(f.at(f.bx, f.by - 1), f.best, f.at(f.bx, f.by + 1));
    src.push([cx, cy]); dst.push(applyH(H, cx + dx, cy + dy)); q.push(f.best);
  }
  let keep = src.map(() => true), out = H, med = null;
  for (let it = 0; it < 5; it++) {
    const use = src.map((_, i) => i).filter((i) => keep[i]);
    if (use.length < 12) return { H: out, used: use.length, of: src.length, errorPx: med };
    const Hn = fitH(use.map((i) => src[i]), use.map((i) => dst[i]));
    if (!Hn) break;
    out = Hn;
    const Hi = invertH(out), err = src.map((p, i) => { const [x, y] = applyH(Hi, dst[i][0], dst[i][1]); return Math.hypot(x - p[0], y - p[1]); });
    med = use.map((i) => err[i]).sort((a, b) => a - b)[use.length >> 1];
    const next = err.map((e) => e < Math.max(0.5, 2.5 * med));
    if (next.every((v, i) => v === keep[i])) break;
    keep = next;
  }
  return { H: out, used: keep.filter(Boolean).length, of: src.length, errorPx: med };
}

/**
 * Where each pixel of the painting photo (`ref`, rw x rh RGBA) is in the handheld photo (`mov`,
 * mw x mh RGBA): {H (ref pixel -> mov pixel), matches, inliers (features), patches (grid patches
 * the refined fit kept), errorPx (their median distance from it, in ref pixels), covered (share of
 * the painting photo the other one covers)}; H is null when too few matches agree (fewer than 12).
 */
export function lineUp(ref, rw, rh, mov, mw, mh) {
  const A = workChannels(ref, rw, rh), B = workChannels(mov, mw, mh);
  const src = [], dst = [];
  for (let c = 0; c < 2; c++) {
    const fa = features(A.chans[c], A.W, A.H), fb = features(B.chans[c], B.W, B.H);
    for (const [i, j] of match(fa, fb)) {
      // In each photo's own pixels.
      src.push([(fa[i].x + 0.5) / A.k[0] - 0.5, (fa[i].y + 0.5) / A.k[1] - 0.5]);
      dst.push([(fb[j].x + 0.5) / B.k[0] - 0.5, (fb[j].y + 0.5) / B.k[1] - 0.5]);
    }
  }
  if (src.length < 12) return { H: null, matches: src.length, inliers: 0, errorPx: null, covered: 0 };
  // RANSAC in working pixels of the painting photo (its threshold is in those).
  const s = A.k[0], sm = B.k[0];
  const { H: Hw, inliers } = ransac(src.map(([x, y]) => [x * s, y * s]), dst.map(([x, y]) => [x * sm, y * sm]));
  if (!Hw || inliers.length < 12) return { H: null, matches: src.length, inliers: inliers.length, errorPx: null, covered: 0 };
  const H = mul3([1 / sm, 0, 0, 0, 1 / sm, 0, 0, 0, 1], mul3(Hw, [s, 0, 0, 0, s, 0, 0, 0, 1]));
  let Hn = H.map((v) => v / H[8]);
  // Twice: the first pass can start a few pixels out, beyond a patch's reach at the edges.
  let fine = null;
  for (let k = 0; k < 2; k++) { fine = refine(ref, rw, rh, mov, mw, mh, Hn); Hn = fine.H.map((v) => v / fine.H[8]); }
  let cov = 0, tot = 0;
  for (let y = 0; y < rh; y += 8) for (let x = 0; x < rw; x += 8) { const [u, v] = applyH(Hn, x, y); tot++; if (u >= 0 && v >= 0 && u <= mw - 1 && v <= mh - 1) cov++; }
  return { H: Hn, matches: src.length, inliers: inliers.length, errorPx: fine.errorPx, covered: cov / tot, patches: fine.used };
}

/**
 * The handheld photo drawn in the painting photo's frame: an outW x outH RGBA picture whose
 * pixel (x, y) shows `mov` at H applied to the painting photo's pixel (x, y) * (rw / outW).
 * Bilinear, averaged over 2 x 2 samples where the photo is shrunk; transparent outside it.
 */
export function warpPhoto(mov, mw, mh, H, rw, rh, outW, outH) {
  const out = new Uint8ClampedArray(outW * outH * 4), kx = rw / outW, ky = rh / outH;
  // How many photo pixels one output pixel spans (at the centre), for the supersampling.
  const [a0, b0] = applyH(H, rw / 2, rh / 2), [a1, b1] = applyH(H, rw / 2 + kx, rh / 2);
  const ss = Math.hypot(a1 - a0, b1 - b0) > 1.2 ? 2 : 1;
  const px = new Float32Array(4);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    let n = 0; px.fill(0);
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const [u, v] = applyH(H, (x + (sx + 0.5) / ss) * kx - 0.5, (y + (sy + 0.5) / ss) * ky - 0.5);
      if (u < 0 || v < 0 || u > mw - 1 || v > mh - 1) continue;
      const x0 = Math.min(mw - 2, Math.floor(u)), y0 = Math.min(mh - 2, Math.floor(v)), fx = u - x0, fy = v - y0, j = (y0 * mw + x0) * 4;
      for (let c = 0; c < 3; c++) px[c] += (mov[j + c] * (1 - fx) + mov[j + 4 + c] * fx) * (1 - fy) + (mov[j + mw * 4 + c] * (1 - fx) + mov[j + mw * 4 + 4 + c] * fx) * fy;
      n++;
    }
    const o = (y * outW + x) * 4;
    if (n === ss * ss) { out[o] = px[0] / n; out[o + 1] = px[1] / n; out[o + 2] = px[2] / n; out[o + 3] = 255; }
  }
  return out;
}

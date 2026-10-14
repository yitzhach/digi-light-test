// lampphotos.js — relief measured from lamp photos.
//
// The single-photo estimate reads relief from shading the camera happened to see.
// An evenly lit photo hides most of it: on the user's red-ground painting the
// estimate from the even shot correlated about 0 with what a lamp actually showed
// (measured against three lamp shots from the same tripod). This module measures
// the relief instead, from two or three extra shots with one lamp close to the wall,
// moved between them, plus the even shot the app already has.
//
// Per pixel, a lamp shot over the even shot cancels the paint colour:
//
//     R = lamp / even  ≈  a + B(x) · (N · L) / lz
//
// where a is the room light's share (the room is still on), B the lamp's beam on
// flat paint (a real spot is far from a bare bulb: its pool of light is narrow and
// aimed), N the surface normal and L the direction to the lamp at that pixel (a
// point at its measured place, so the angle changes across the painting). B is
// unknown but smooth, so it is taken as the local mean of R − a: whatever is left,
//
//     s = (R − a) / blur(R − a)  ≈  1 − hx·ux − hy·uy,   (ux, uy) = (L_xy / L_z)
//
// is linear in the slopes (hx, hy). Each lamp shot gives one such equation per
// pixel, so two lamps from different sides give both slopes, and a third leaves
// one spare to check with. Shadowed, blown or very dark samples are left out. The
// slopes are integrated into a height (a least-squares Poisson solve), and since
// they are in true units (height per pixel of a painting of known width), the
// texture depth is measured too, not guessed.
//
// Shots must come from one tripod position, but a tripod still creeps: on the
// user's shots the camera moved up to 2 px and one shot was zoomed by 0.3%, which
// is enough to wipe out the finest relief. Each shot is aligned to the even one
// first, on colour alone (r/sum and b/sum), which lighting barely changes.

// Feature sizes, in painting widths, so a photo of any resolution behaves alike.
export const BEAM_SIGMA = 0.022;      // the beam is taken as smooth beyond this
export const DRIFT_SIGMA = 0.06;      // heights broader than this are dropped (drift)
export const ALIGN_SEARCH = 0.01;     // how far a shot may have moved
const SHADOW_S = 0.1;                 // shading below this is shadow: no slope to read
const REFINE = 2;                     // rounds of taking the relief out of the beam
const CHECK_BAND = [0.0022, 0.009];   // stroke-scale band the check scores
// Glints (varnish, wet-looking impasto) under a spot lamp read as steep slopes. A pixel
// is taken as a glint if it is well above what a facet turned straight at the lamp could
// give (no matte surface does that), or above it while near-white and having lost the
// paint's colour (specular light is the lamp's colour, not the paint's). Tested once the
// beam is known without the relief (first refine round). On DSC_8382 (matte) this masks
// 0.29% / 0.29% / 0.07% of the three shots and leaves the self-check as it was or a
// little higher (0.868 / 0.861 / 0.798 -> 0.869 / 0.864 / 0.799); at 1.0 x the maximum
// it masked 2% and lowered it.
export const GLINT = {
  over: 1.6,                          // shading over 1.6 times the Lambertian maximum
  near: 1.2,                          // ... or 1.2 times it, near-white and washed out
  white: 235,                         // brightest channel at least this (8-bit)
  colour: 0.15,                       // paint saturation the colour test needs
};

const SRGB = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; SRGB[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }

/** Linear luminance of RGBA bytes. */
export function luminance(rgba, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.2126 * SRGB[rgba[i * 4]] + 0.7152 * SRGB[rgba[i * 4 + 1]] + 0.0722 * SRGB[rgba[i * 4 + 2]];
  return out;
}

/** Box blur, `passes` times (3 is close to a Gaussian of sigma about r), clamped at the edges. */
export function boxBlur(src, w, h, r, passes = 3) {
  r = Math.max(0, Math.round(r));
  let a = Float32Array.from(src);
  if (r === 0) return a;
  const t = new Float32Array(w * h), n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        t[o + x] = s / n;
        s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / n;
        s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/** Percentiles of the values where `mask` (optional) is set, from a sample of at most ~200k. */
function percentiles(a, ps, mask) {
  const step = Math.max(1, Math.floor(a.length / 200000)), v = [];
  for (let i = 0; i < a.length; i += step) if (!mask || mask[i]) v.push(a[i]);
  if (!v.length) return ps.map(() => 0);
  const s = Float32Array.from(v).sort();
  return ps.map((p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]);
}

// ------------------------------------------------------------------ alignment

// Colour without brightness, band-passed: what a pigment boundary looks like
// under any light. Two channels, r/sum and b/sum.
function colourBands(rgba, w, h) {
  const n = w * h, big = Math.max(4, Math.round(0.006 * w)), out = [];
  for (const ch of [0, 2]) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = (rgba[i * 4 + ch] + 1) / (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2] + 3);
    const lo = boxBlur(c, w, h, big), hi = boxBlur(c, w, h, 1, 1);
    for (let i = 0; i < n; i++) hi[i] -= lo[i];
    out.push(hi);
  }
  return out;
}
function half(a, w, h) {
  const w2 = w >> 1, h2 = h >> 1, o = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const i = 2 * y * w + 2 * x; o[y * w2 + x] = 0.25 * (a[i] + a[i + 1] + a[i + w] + a[i + w + 1]);
  }
  return o;
}
// Normalised correlation of a patch of `ref` with `mov` shifted by (dx, dy), both channels.
function ncc(ref, mov, w, x0, y0, P, dx, dy) {
  let ab = 0, aa = 0, bb = 0;
  for (let c = 0; c < ref.length; c++) {
    const A = ref[c], B = mov[c];
    for (let y = y0; y < y0 + P; y++) {
      let i = y * w + x0, j = (y + dy) * w + x0 + dx;
      for (let x = 0; x < P; x++, i++, j++) { const a = A[i], b = B[j]; ab += a * b; aa += a * a; bb += b * b; }
    }
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}
function bestShift(ref, mov, w, x0, y0, P, cx, cy, R) {
  let best = -2, bx = cx, by = cy;
  const score = new Map();
  for (let dy = cy - R; dy <= cy + R; dy++) for (let dx = cx - R; dx <= cx + R; dx++) {
    const v = ncc(ref, mov, w, x0, y0, P, dx, dy); score.set(dx + ',' + dy, v);
    if (v > best) { best = v; bx = dx; by = dy; }
  }
  return { bx, by, best, at: (dx, dy) => score.get(dx + ',' + dy) };
}

/**
 * Where each pixel of `even` is in `shot`: a tiling of patches is matched on colour
 * (coarse at half size, then refined to a fraction of a pixel), and an affine map
 * fitted through the matches, dropping outliers. Returns {map: [ax, bx, cx, ay, by,
 * cy] with shot(x + ax·x + bx·y + cx, y + ay·x + by·y + cy) ≈ even(x, y), rms, used, of}.
 */
export function align(evenRgba, shotRgba, w, h) {
  const ref = colourBands(evenRgba, w, h), mov = colourBands(shotRgba, w, h);
  const R = Math.max(3, Math.min(24, Math.ceil(ALIGN_SEARCH * w)));
  const P = Math.max(32, Math.min(160, Math.floor(Math.min(w, h) / 6)));
  const w2 = w >> 1, h2 = h >> 1;
  const ref2 = ref.map((a) => half(a, w, h)), mov2 = mov.map((a) => half(a, w, h));
  const pts = [], G = 5, inset = P / 2 + R + 3;
  if (w < 2 * inset + 8 || h < 2 * inset + 8) return { map: [0, 0, 0, 0, 0, 0], rms: 0, used: 0, of: 0 };
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const cx = Math.round(inset + (w - 2 * inset) * gx / (G - 1)), cy = Math.round(inset + (h - 2 * inset) * gy / (G - 1));
    // Coarse: half size, half the reach (+1).
    const P2 = P >> 1, R2 = (R >> 1) + 1;
    const x02 = Math.max(R2, Math.min(w2 - P2 - R2 - 1, (cx >> 1) - (P2 >> 1))), y02 = Math.max(R2, Math.min(h2 - P2 - R2 - 1, (cy >> 1) - (P2 >> 1)));
    const c = bestShift(ref2, mov2, w2, x02, y02, P2, 0, 0, R2);
    // Fine: full size, ±2 around the coarse match.
    const x0 = cx - (P >> 1), y0 = cy - (P >> 1);
    const sx = Math.max(-R + 2, Math.min(R - 2, 2 * c.bx)), sy = Math.max(-R + 2, Math.min(R - 2, 2 * c.by));
    const f = bestShift(ref, mov, w, x0, y0, P, sx, sy, 2);
    // Parabola through the peak and its neighbours, each axis.
    const para = (m, z, p) => { const d = m - 2 * z + p; return d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (m - p) / d)) : 0; };
    const v0 = f.best, vxm = f.at(f.bx - 1, f.by), vxp = f.at(f.bx + 1, f.by), vym = f.at(f.bx, f.by - 1), vyp = f.at(f.bx, f.by + 1);
    const dx = f.bx + (vxm !== undefined && vxp !== undefined ? para(vxm, v0, vxp) : 0);
    const dy = f.by + (vym !== undefined && vyp !== undefined ? para(vym, v0, vyp) : 0);
    pts.push({ x: cx, y: cy, dx, dy, q: f.best });
  }
  // Affine fit, weighted by match quality, rejecting outliers.
  let keep = pts.map((p) => p.q > 0.15);
  let map = [0, 0, 0, 0, 0, 0], rms = 0;
  for (let it = 0; it < 4; it++) {
    const use = pts.filter((_, i) => keep[i]);
    if (use.length >= 6) {
      const solve3 = (key) => {
        const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
        for (const p of use) {
          const r = [p.x / w, p.y / h, 1], wt = p.q;
          for (let i = 0; i < 3; i++) { b[i] += wt * r[i] * p[key]; for (let j = 0; j < 3; j++) A[i * 3 + j] += wt * r[i] * r[j]; }
        }
        const s = solve3x3(A, b);
        return s ? [s[0] / w, s[1] / h, s[2]] : null;
      };
      const mx = solve3('dx'), my = solve3('dy');
      if (mx && my) map = [...mx, ...my];
    } else if (use.length) {
      const med = (k) => use.map((p) => p[k]).sort((a, b) => a - b)[use.length >> 1];
      map = [0, 0, med('dx'), 0, 0, med('dy')];
    }
    const err = pts.map((p) => Math.hypot(map[0] * p.x + map[1] * p.y + map[2] - p.dx, map[3] * p.x + map[4] * p.y + map[5] - p.dy));
    const used = err.filter((_, i) => keep[i]).sort((a, b) => a - b);
    const lim = Math.max(0.35, 2.5 * (used[used.length >> 1] || 0));
    keep = pts.map((p, i) => p.q > 0.15 && err[i] < lim);
    const k = err.filter((_, i) => keep[i]);
    rms = k.length ? Math.sqrt(k.reduce((s, e) => s + e * e, 0) / k.length) : 0;
  }
  return { map, rms, used: keep.filter(Boolean).length, of: pts.length };
}
function solve3x3(A, b) {
  const [a, bb, c, d, e, f, g, hh, i] = A;
  const det = a * (e * i - f * hh) - bb * (d * i - f * g) + c * (d * hh - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [
    (b[0] * (e * i - f * hh) - bb * (b[1] * i - f * b[2]) + c * (b[1] * hh - e * b[2])) / det,
    (a * (b[1] * i - f * b[2]) - b[0] * (d * i - f * g) + c * (d * b[2] - b[1] * g)) / det,
    (a * (e * b[2] - b[1] * hh) - bb * (d * b[2] - b[1] * g) + b[0] * (d * hh - e * g)) / det,
  ];
}

/** The shot's luminance resampled onto the even photo's pixels (bilinear), a mask of
 *  pixels that are blown (any channel at 250+) or fell outside the shot, and each
 *  pixel's saturation and whether it is near-white (for the glint test). */
export function warpShot(rgba, w, h, map) {
  const n = w * h, lum = luminance(rgba, n), out = new Float32Array(n), bad = new Uint8Array(n), sat = new Float32Array(n), white = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + map[0] * x + map[1] * y + map[2], sy = y + map[3] * x + map[4] * y + map[5];
    const i = y * w + x;
    if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) { bad[i] = 1; continue; }
    const x0 = Math.min(w - 2, Math.floor(sx)), y0 = Math.min(h - 2, Math.floor(sy)), fx = sx - x0, fy = sy - y0, j = y0 * w + x0;
    out[i] = (lum[j] * (1 - fx) + lum[j + 1] * fx) * (1 - fy) + (lum[j + w] * (1 - fx) + lum[j + w + 1] * fx) * fy;
    const k = (Math.round(sy) * w + Math.round(sx)) * 4;
    if (rgba[k] >= 250 || rgba[k + 1] >= 250 || rgba[k + 2] >= 250) bad[i] = 1;
    const mx = Math.max(rgba[k], rgba[k + 1], rgba[k + 2]), mn = Math.min(rgba[k], rgba[k + 1], rgba[k + 2]);
    sat[i] = mx > 0 ? (mx - mn) / mx : 0; white[i] = mx >= GLINT.white ? 1 : 0;
  }
  return { lum: out, bad, sat, white };
}

// ------------------------------------------------------------------ the solve

/** The lamp in pixels of a w-wide image of a painting widthCm wide: x from the left
 *  edge, y down from the top edge (a lamp above the painting is negative), z out. */
export function lampPixels(lamp, widthCm, w) {
  const k = w / widthCm;
  return { x: lamp.left * k, y: -lamp.above * k, z: Math.max(0.2, lamp.out) * k };
}

/** Normalised shading s, its usable mask and a first guess at the room-light share,
 *  for one shot. D is the shot over the even photo, less the room light. */
function shading(lum, bad, even, evenOk, w, h) {
  const n = w * h, D = new Float32Array(n), valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) { D[i] = lum[i] / Math.max(1e-4, even[i]); valid[i] = !bad[i] && evenOk[i] ? 1 : 0; }
  // First guess at the room light: what the deepest shadows inside the lamp's pool
  // still get (refined by fitRoom once there are slopes to go on).
  const pool = boxBlur(D, w, h, 0.03 * w), cut = percentiles(pool, [0.7])[0];
  const inPool = new Uint8Array(n);
  for (let i = 0; i < n; i++) inPool[i] = pool[i] > cut && valid[i] ? 1 : 0;
  const a = 0.9 * Math.max(0, percentiles(D, [0.01], inPool)[0]);
  for (let i = 0; i < n; i++) D[i] -= a;
  const sh = { D, valid, a, s: new Float32Array(n), ok: new Uint8Array(n), beam: null };
  normalise(sh, boxBlur(D, w, h, BEAM_SIGMA * w));
  return sh;
}
// s = D over the beam; usable where lit, not blown and not in shadow.
function normalise(sh, beam) {
  const { D, valid, s, ok } = sh;
  for (let i = 0; i < D.length; i++) {
    s[i] = D[i] / Math.max(1e-4, beam[i]);
    ok[i] = valid[i] && beam[i] > 1e-3 && s[i] > SHADOW_S && s[i] < 3 ? 1 : 0;
  }
  sh.beam = beam;
}
// The shading the current slopes predict for this shot's lamp (1 on flat paint).
function predicted(sh, hx, hy, w, h) {
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, ux = (sh.px.x - x - 0.5) / sh.px.z, uy = (sh.px.y - y - 0.5) / sh.px.z;
    p[i] = Math.max(0, (1 - hx[i] * ux - hy[i] * uy) / Math.sqrt(1 + hx[i] * hx[i] + hy[i] * hy[i]));
  }
  return p;
}
// Room light, refined: within a patch the beam is one number, so the shot (over the
// even photo) is a straight line in the predicted shading whose intercept is the
// room light. The median intercept over patches with enough relief to tell. The
// first guess reads too high where no shadow is deep (on the user's centre shot
// 35% against about 12%, and the wall's own shadow beside the panel agreed with
// the lower figure), and every bit too high exaggerates the relief.
function fitRoom(sh, pred, w, h) {
  const n = w * h, R = new Float32Array(n), RP = new Float32Array(n), PP = new Float32Array(n), P = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) if (sh.valid[i]) { const r = sh.D[i] + sh.a, p = pred[i]; R[i] = r; P[i] = p; RP[i] = r * p; PP[i] = p * p; V[i] = 1; }
  const rad = BEAM_SIGMA * w, [bR, bP, bRP, bPP, bV] = [R, P, RP, PP, V].map((a) => boxBlur(a, w, h, rad));
  const at = [];
  for (let i = 0; i < n; i += 7) {
    if (bV[i] < 0.5) continue;
    const mR = bR[i] / bV[i], mP = bP[i] / bV[i], vp = bPP[i] / bV[i] - mP * mP, B = (bRP[i] / bV[i] - mR * mP) / vp;
    if (vp >= 0.02 && B > 0) at.push([mR - B * mP, vp]);
  }
  if (at.length < 50) return;
  at.sort((p, q) => p[0] - q[0]);
  const half = at.reduce((t, v) => t + v[1], 0) / 2;
  let acc = 0, a = sh.a;
  for (const [v, wt] of at) { acc += wt; if (acc >= half) { a = v; break; } }
  a = Math.max(0, a);
  for (let i = 0; i < n; i++) sh.D[i] += sh.a - a;
  sh.a = a;
}

// Slopes from the shots listed in `use`: per pixel, least squares over the usable
// samples, with a little damping so one shot (or two from the same side) still
// gives the slope along its light and nothing across it.
function slopes(shots, use, w, h) {
  const n = w * h, hx = new Float32Array(n), hy = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let m11 = 0, m12 = 0, m22 = 0, b1 = 0, b2 = 0;
    for (const k of use) {
      const S = shots[k]; if (!S.ok[i]) continue;
      const ux = (S.px.x - x - 0.5) / S.px.z, uy = (S.px.y - y - 0.5) / S.px.z, r = 1 - S.s[i];
      m11 += ux * ux; m12 += ux * uy; m22 += uy * uy; b1 += ux * r; b2 += uy * r;
    }
    const lam = 0.01 * (m11 + m22) + 1e-9, a = m11 + lam, d = m22 + lam, det = a * d - m12 * m12;
    if (det > 1e-12) { hx[i] = (d * b1 - m12 * b2) / det; hy[i] = (a * b2 - m12 * b1) / det; }
  }
  return { hx, hy };
}

/**
 * Height from slopes: the least-squares surface whose steps between neighbours
 * match the slopes, edges free (Neumann). Multigrid W-cycles on cell-centred grids
 * (red-black Gauss-Seidel, bilinear prolongation), so the whole painting settles
 * in a few passes rather than the thousands plain relaxation would need. (V-cycles
 * gain only about half a digit each here; the W-cycle's second coarse visit makes
 * one cycle enough on a test surface, so three is plenty.)
 */
export function integrate(hx, hy, w, h, cycles = 3) {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const px = x < w - 1 ? 0.5 * (hx[i] + hx[i + 1]) : 0, pxm = x > 0 ? 0.5 * (hx[i - 1] + hx[i]) : 0;
    const py = y < h - 1 ? 0.5 * (hy[i] + hy[i + w]) : 0, pym = y > 0 ? 0.5 * (hy[i - w] + hy[i]) : 0;
    f[i] = px - pxm + py - pym;
  }
  const levels = [{ w, h, u: new Float32Array(w * h), f, r: new Float32Array(w * h) }];
  while (levels.at(-1).w > 3 && levels.at(-1).h > 3) {
    const L = levels.at(-1), cw = (L.w + 1) >> 1, ch = (L.h + 1) >> 1;
    levels.push({ w: cw, h: ch, u: new Float32Array(cw * ch), f: new Float32Array(cw * ch), r: new Float32Array(cw * ch) });
  }
  for (let c = 0; c < cycles; c++) { wcycle(levels, 0); removeMean(levels[0].u); }
  return levels[0].u;
}
function removeMean(a) { let m = 0; for (const v of a) m += v; m /= a.length; for (let i = 0; i < a.length; i++) a[i] -= m; }
function smooth(L, iters) {
  const { w, h, u, f } = L;
  for (let it = 0; it < iters; it++) for (let colour = 0; colour < 2; colour++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = (y + colour) & 1; x < w; x += 2) {
        const i = row + x; let s = 0, d = 0;
        if (x > 0) { s += u[i - 1]; d++; }
        if (x < w - 1) { s += u[i + 1]; d++; }
        if (y > 0) { s += u[i - w]; d++; }
        if (y < h - 1) { s += u[i + w]; d++; }
        if (d) u[i] = (s - f[i]) / d;
      }
    }
  }
}
function residual(L) {
  const { w, h, u, f, r } = L;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let s = 0, d = 0;
    if (x > 0) { s += u[i - 1]; d++; }
    if (x < w - 1) { s += u[i + 1]; d++; }
    if (y > 0) { s += u[i - w]; d++; }
    if (y < h - 1) { s += u[i + w]; d++; }
    r[i] = f[i] - (s - d * u[i]);
  }
}
function wcycle(levels, k) {
  const L = levels[k];
  if (k === levels.length - 1) { smooth(L, 80); return; }
  smooth(L, 2);
  residual(L);
  const C = levels[k + 1];
  // Coarse right-hand side: four times the mean of the children (spacing 2).
  C.f.fill(0); const cnt = new Uint8Array(C.w * C.h);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const j = (y >> 1) * C.w + (x >> 1); C.f[j] += L.r[y * L.w + x]; cnt[j]++; }
  for (let j = 0; j < C.f.length; j++) C.f[j] *= 4 / cnt[j];
  removeMean(C.f);
  C.u.fill(0);
  wcycle(levels, k + 1);
  wcycle(levels, k + 1);
  // Bilinear prolongation: a fine cell sits a quarter of a coarse cell from its parent.
  for (let y = 0; y < L.h; y++) {
    const Y = y >> 1, Yn = Math.min(C.h - 1, Math.max(0, (y & 1) ? Y + 1 : Y - 1));
    for (let x = 0; x < L.w; x++) {
      const X = x >> 1, Xn = Math.min(C.w - 1, Math.max(0, (x & 1) ? X + 1 : X - 1));
      L.u[y * L.w + x] += 0.5625 * C.u[Y * C.w + X] + 0.1875 * (C.u[Y * C.w + Xn] + C.u[Yn * C.w + X]) + 0.0625 * C.u[Yn * C.w + Xn];
    }
  }
  smooth(L, 2);
}

function bandCorr(a, b, mask, w, h) {
  const [s1, s2] = CHECK_BAND.map((s) => s * w);
  const a1 = boxBlur(a, w, h, s1), a2 = boxBlur(a, w, h, s2), b1 = boxBlur(b, w, h, s1), b2 = boxBlur(b, w, h, s2);
  let sa = 0, sb = 0, n = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) { sa += a1[i] - a2[i]; sb += b1[i] - b2[i]; n++; }
  if (n < 100) return 0;
  sa /= n; sb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) { const x = a1[i] - a2[i] - sa, y = b1[i] - b2[i] - sb; ab += x * y; aa += x * x; bb += y * y; }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Measure the relief. `even` is the evenly lit photo's RGBA bytes, w x h; each shot
 * is {rgba (same size), lamp: {left, above, out} in cm from the painting's left and
 * top edges and the wall}. Returns the height (w x h, in pixels of this image,
 * drift removed), its measured depth (2nd–98th percentile spread) in mm, and per
 * shot the alignment and room-light share. With three or more shots, `check` holds,
 * per shot, how well the others predict it (correlation over stroke-sized detail).
 */
/** Glint mask for one shot (dilated a pixel): see GLINT. */
function findGlints(sh, warped, evenSat, px, w, h) {
  const n = w * h, g = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!sh.valid[i]) continue;
    const dx = px.x - x - 0.5, dy = px.y - y - 0.5, sMax = Math.hypot(dx, dy, px.z) / px.z, s = sh.s[i];
    // The colour test needs paint with colour to lose: on grey or white paint only the
    // brightness test applies.
    if (s > GLINT.over * sMax || (s > GLINT.near * sMax && warped.white[i] && evenSat[i] > GLINT.colour && warped.sat[i] < 0.5 * evenSat[i])) g[i] = 1;
  }
  const out = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y * w + x]) continue;
    for (let v = Math.max(0, y - 1); v <= Math.min(h - 1, y + 1); v++) for (let u = Math.max(0, x - 1); u <= Math.min(w - 1, x + 1); u++) out[v * w + u] = 1;
  }
  return out;
}

export async function measureRelief({ even, shots, w, h, widthCm, onProgress = () => {}, glints = true }) {
  const n = w * h, evenLum = luminance(even, n);
  const evenSat = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = even[i * 4], g = even[i * 4 + 1], b = even[i * 4 + 2], mx = Math.max(r, g, b); evenSat[i] = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0; }
  // Very dark paint has too little light to divide by.
  const dark = percentiles(evenLum, [0.5])[0] * 0.04;
  const evenOk = new Uint8Array(n);
  for (let i = 0; i < n; i++) evenOk[i] = evenLum[i] > dark && even[i * 4] < 250 && even[i * 4 + 1] < 250 && even[i * 4 + 2] < 250 ? 1 : 0;
  const S = [];
  for (let k = 0; k < shots.length; k++) {
    onProgress(`Aligning lamp photo ${k + 1} of ${shots.length}…`); await tick();
    const al = align(even, shots[k].rgba, w, h);
    const warped = warpShot(shots[k].rgba, w, h, al.map), px = lampPixels(shots[k].lamp, widthCm, w);
    const sh = shading(warped.lum, warped.bad, evenLum, evenOk, w, h);
    S.push({ ...sh, align: al, px, warped, glint: 0, glintMask: null });
  }
  onProgress('Reading the slopes…'); await tick();
  const all = S.map((_, k) => k);
  let { hx, hy } = slopes(S, all, w, h);
  // The beam was taken as the local mean of each shot, which also holds whatever
  // relief is broader than BEAM_SIGMA, so that relief came out too flat. With the
  // slopes in hand, the beam is the shot's local mean over the shading they
  // predict, which leaves the relief out of it; then the slopes are read again.
  // On synthetic paintings this took the measured depth from about 60% of the
  // truth to about 80% (relief like the user's), and on the user's shots raised the
  // check from 0.83/0.80/0.73 to 0.87/0.86/0.80.
  for (let round = 0; round < REFINE; round++) {
    onProgress(`Taking the relief out of the lamps' light (${round + 1} of ${REFINE})…`); await tick();
    for (const sh of S) {
      const pred = predicted(sh, hx, hy, w, h);
      if (round === 0) fitRoom(sh, pred, w, h);
      const num = new Float32Array(n);
      for (let i = 0; i < n; i++) if (sh.valid[i]) num[i] = sh.D[i]; else pred[i] = 0;
      const bn = boxBlur(num, w, h, BEAM_SIGMA * w), bd = boxBlur(pred, w, h, BEAM_SIGMA * w);
      for (let i = 0; i < n; i++) bn[i] /= Math.max(1e-4, bd[i]);
      normalise(sh, bn);
      // Glints, once the beam no longer holds the relief (the first beam, a plain local
      // mean, is pulled down by shadows, so lit facets looked brighter than they are):
      // left out of the solve from here on; where no shot is left, the integration
      // fills in.
      if (round === 0 && glints) {
        const g = sh.glintMask = findGlints(sh, sh.warped, evenSat, sh.px, w, h);
        let k = 0;
        for (let i = 0; i < n; i++) if (g[i]) { if (sh.valid[i]) k++; sh.valid[i] = 0; sh.ok[i] = 0; }
        sh.glint = k / n;
      }
    }
    ({ hx, hy } = slopes(S, all, w, h));
  }
  onProgress('Building the height…'); await tick();
  const raw = integrate(hx, hy, w, h);
  const drift = boxBlur(raw, w, h, DRIFT_SIGMA * w);
  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) height[i] = raw[i] - drift[i];
  // Depth over the painting, away from its edges, in mm.
  const m = Math.round(0.02 * w), inner = new Uint8Array(n);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) inner[y * w + x] = 1;
  const [p2, p98] = percentiles(height, [0.02, 0.98], inner);
  const depthMm = (p98 - p2) * widthCm * 10 / w;
  let check = null;
  if (S.length >= 3) {
    onProgress('Checking each lamp photo against the others…'); await tick();
    check = S.map((sh, k) => {
      const { hx: gx, hy: gy } = slopes(S, all.filter((j) => j !== k), w, h);
      const pred = new Float32Array(n), mask = new Uint8Array(n);
      const cut = percentiles(sh.beam, [0.5])[0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        pred[i] = 1 - gx[i] * (sh.px.x - x - 0.5) / sh.px.z - gy[i] * (sh.px.y - y - 0.5) / sh.px.z;
        mask[i] = inner[i] && sh.ok[i] && sh.beam[i] > cut ? 1 : 0;
      }
      return bandCorr(sh.s, pred, mask, w, h);
    });
  }
  return {
    height, w, h, depthMm, check,
    shots: S.map((sh) => ({ align: sh.align, room: sh.a, usable: sh.ok.reduce((t, v) => t + v, 0) / n, glint: sh.glint, glintMask: sh.glintMask })),
  };
}

// photocheck.js — checks on photos and relief (docs/conoscopic-paper-improvements.md
// items 14–15): clipped highlights and crushed shadows, and the dominant stroke direction.

export const CLIP_HI = 250, CLIP_LO = 5;   // 8-bit levels counted as blown / crushed
export const CLIP_WARN = 0.005;            // share of pixels worth a warning (0.5%)
const SAMPLE_W = 1500;                      // photos are checked at most this wide

/**
 * Share of pixels blown (any channel at CLIP_HI or more) and crushed (every channel at
 * CLIP_LO or less) in RGBA bytes. Returns { hi, lo, warn } with warn a sentence, or ''.
 */
export function clipping(rgba) {
  let hi = 0, lo = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r >= CLIP_HI || g >= CLIP_HI || b >= CLIP_HI) hi++;
    else if (r <= CLIP_LO && g <= CLIP_LO && b <= CLIP_LO) lo++;
  }
  hi /= n; lo /= n;
  const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`, parts = [];
  if (hi > CLIP_WARN) parts.push(`${pct(hi)} blown highlights`);
  if (lo > CLIP_WARN) parts.push(`${pct(lo)} crushed shadows`);
  return { hi, lo, warn: parts.length ? `Overexposed or too contrasty: ${parts.join(' and ')}. Those pixels carry no shading, so they are left out of the relief and the scores; retake with less exposure (or more light in the shadows) if it is much.` : '' };
}

/** Clipping of an image or canvas, sampled with nearest pixels (smoothing would hide it). */
export function clippingOf(img) {
  const w = Math.min(img.width, SAMPLE_W), h = Math.max(1, Math.round(img.height * w / img.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, w, h);
  return clipping(x.getImageData(0, 0, w, h).data);
}

/**
 * Dominant stroke direction of a height map (w × h, rows top first), from its
 * structure tensor: the mean of the gradient's outer product. Strokes run across
 * the main gradient direction. Angles in degrees, 0 = to the right, 90 = up (as the
 * graze dial): strokeDeg 0..180, the strokes' direction; acrossDeg = strokeDeg + 90
 * (mod 180), the direction to light from to show them most. coherence 0 (no
 * direction) to 1 (all one way). Borders (3%) are left out.
 */
export function strokeDirection(H, w, h) {
  const m = Math.max(1, Math.round(0.03 * Math.min(w, h)));
  let jxx = 0, jyy = 0, jxy = 0;
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
    const i = y * w + x, gx = (H[i + 1] - H[i - 1]) / 2, gy = -(H[i + w] - H[i - w]) / 2; // y up
    jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
  }
  const tr = jxx + jyy;
  if (!(tr > 0)) return { strokeDeg: 0, acrossDeg: 90, coherence: 0 };
  const gradDeg = 0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180 / Math.PI;   // main gradient orientation
  const coherence = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / tr;
  const mod = (a) => ((a % 180) + 180) % 180;
  return { strokeDeg: mod(gradDeg + 90), acrossDeg: mod(gradDeg), coherence };
}

/** Of the two lights along `deg` (deg and deg + 180), the one nearer `current`. */
export function nearerSide(deg, current) {
  const d = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d(deg, current) <= d(deg + 180, current) ? ((deg % 360) + 360) % 360 : (deg + 180) % 360;
}

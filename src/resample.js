// resample.js — the photo at another size, the same pixels every time.
//
// Export tiles, the sharp zoom and the metrics' copy of the photo used to shrink it with
// drawImage at imageSmoothingQuality 'high'. Chromium's high-quality downscale is not stable:
// the same photo and size came out a level apart here and there from one page to the next
// (under load, 10-22), and the relief estimate, built from the photo's slopes, turns a level
// into speckle up to 99 levels deep (tests/repeat-look.cjs). Here the photo is copied 1:1
// (exact) and resampled in plain arithmetic: an area average, each output pixel the mean of
// the photo pixels its footprint covers (partly covered ones by the share covered), in sRGB as
// the browser averages. Upscaling (a footprint under a pixel wide) falls back to a footprint
// one pixel wide, which is linear interpolation.
//
// Every output pixel depends only on where it sits in the whole picture, never on the region
// asked for: a tile of a W x H picture has exactly the pixels a whole W x H resample has there.

/**
 * Pixels [ox, ox + ow) x [oy, oy + oh) of `source` (an image, bitmap or canvas, SW x SH)
 * resampled to W x H. Returns an ImageData (opaque).
 */
export function resampleRegion(source, W, H, ox, oy, ow, oh) {
  const SW = source.naturalWidth || source.width, SH = source.naturalHeight || source.height;
  const cols = weights(SW / W, SW, ox, ow), rows = weights(SH / H, SH, oy, oh);
  const sx0 = cols.lo, sw = cols.hi - cols.lo;
  const out = new ImageData(ow, oh), d = out.data;
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  // A strip of output rows at a time, so a big tile never holds the whole photo region.
  for (let y0 = 0; y0 < oh; y0 += STRIP) {
    const y1 = Math.min(oh, y0 + STRIP);
    let sy0 = Infinity, sy1 = 0;
    for (let y = y0; y < y1; y++) { sy0 = Math.min(sy0, rows.start[y]); sy1 = Math.max(sy1, rows.start[y] + rows.n[y]); }
    const sh = sy1 - sy0;
    // The photo pixels the strip's footprints cover, copied 1:1 (no filtering).
    if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; } else g.clearRect(0, 0, sw, sh);
    g.imageSmoothingEnabled = false;
    g.drawImage(source, sx0, sy0, sw, sh, 0, 0, sw, sh);
    const src = g.getImageData(0, 0, sw, sh).data;
    // Across: each photo row of the strip to ow columns.
    const mid = new Float64Array(sh * ow * 3);
    for (let y = 0; y < sh; y++) {
      const r = y * sw * 4, m = y * ow * 3;
      for (let x = 0; x < ow; x++) {
        const a = cols.at[x], n = cols.n[x], o = cols.start[x] - sx0;
        let R = 0, G = 0, B = 0;
        for (let k = 0; k < n; k++) {
          const w = cols.w[a + k], p = r + (o + k) * 4;
          R += w * src[p]; G += w * src[p + 1]; B += w * src[p + 2];
        }
        mid[m + x * 3] = R; mid[m + x * 3 + 1] = G; mid[m + x * 3 + 2] = B;
      }
    }
    // Down: the strip's rows.
    for (let y = y0; y < y1; y++) {
      const a = rows.at[y], n = rows.n[y], o = rows.start[y] - sy0;
      for (let x = 0; x < ow; x++) {
        let R = 0, G = 0, B = 0;
        for (let k = 0; k < n; k++) {
          const w = rows.w[a + k], p = ((o + k) * ow + x) * 3;
          R += w * mid[p]; G += w * mid[p + 1]; B += w * mid[p + 2];
        }
        const q = (y * ow + x) * 4;
        d[q] = Math.round(R); d[q + 1] = Math.round(G); d[q + 2] = Math.round(B); d[q + 3] = 255;
      }
    }
  }
  return out;
}
const STRIP = 128;   // output rows per strip

/** The same, drawn into a 2D context at (0, 0). */
export function drawResampled(ctx, source, W, H, ox, oy, ow, oh) {
  ctx.putImageData(resampleRegion(source, W, H, ox, oy, ow, oh), 0, 0);
}

// Per output pixel i of [o, o + n) along one axis (k photo pixels per output pixel, S photo
// pixels in all): its footprint, centred on (i + 0.5) k and k wide (at least 1), as weights
// over the photo pixels it covers, clamped to the photo and summing to 1. lo / hi: the photo
// pixels any of them reads.
function weights(k, S, o, n) {
  const half = Math.max(1, k) / 2, start = new Int32Array(n), cnt = new Int32Array(n), at = new Int32Array(n), w = [];
  let lo = S, hi = 0;
  for (let i = 0; i < n; i++) {
    const c = (o + i + 0.5) * k;
    const a = Math.max(0, c - half), b = Math.min(S, c + half);
    const p0 = Math.min(S - 1, Math.floor(a)), p1 = Math.max(p0 + 1, Math.ceil(b));
    let sum = 0;
    at[i] = w.length; start[i] = p0;
    for (let p = p0; p < p1; p++) { const v = Math.max(0, Math.min(b, p + 1) - Math.max(a, p)); w.push(v); sum += v; }
    if (!(sum > 0)) { w.length = at[i]; w.push(1); cnt[i] = 1; }
    else { for (let j = at[i]; j < w.length; j++) w[j] /= sum; cnt[i] = p1 - p0; }
    lo = Math.min(lo, p0); hi = Math.max(hi, start[i] + cnt[i]);
  }
  return { start, n: cnt, at, w: Float64Array.from(w), lo, hi };
}

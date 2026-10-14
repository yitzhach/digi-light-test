// reliefsave.js — measured relief (lampui.js) in a project file.
//
// The height map is the preview's size, rows top first. It is saved as a PNG data
// URL holding 16 bits per pixel (red high byte, green low byte) between the map's
// own lowest and highest value, which is far finer than the measurement itself.
// Projects saved before this, or without a measurement, have no `relief`.

export const RELIEF_FORMAT = 'height16png';

/** {height, w, h, on, depthMm, check} -> plain object for the project's `relief`. */
export function encodeRelief({ height, w, h, on, depthMm, check }) {
  let lo = Infinity, hi = -Infinity;
  for (const v of height) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi > lo ? hi - lo : 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) {
    const q = Math.round((height[i] - lo) / span * 65535);
    d[i * 4] = q >> 8; d[i * 4 + 1] = q & 255; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { format: RELIEF_FORMAT, w, h, lo, hi, on: !!on, depthMm: depthMm ?? null, check: check ?? null, image: c.toDataURL('image/png') };
}

/** Checks a project's `relief`; throws on anything malformed. */
export function validRelief(r) {
  const ok = r && typeof r === 'object' && r.format === RELIEF_FORMAT
    && Number.isInteger(r.w) && Number.isInteger(r.h) && r.w > 0 && r.h > 0 && r.w <= 4096 && r.h <= 4096
    && Number.isFinite(r.lo) && Number.isFinite(r.hi) && r.hi >= r.lo
    && typeof r.image === 'string' && r.image.startsWith('data:image/png;base64,')
    && (r.depthMm == null || Number.isFinite(r.depthMm))
    && (r.check == null || (Array.isArray(r.check) && r.check.length <= 16 && r.check.every(Number.isFinite)));
  if (!ok) throw new Error('Invalid measured relief in project.');
  return { format: r.format, w: r.w, h: r.h, lo: r.lo, hi: r.hi, on: r.on !== false, depthMm: r.depthMm ?? null, check: r.check ?? null, image: r.image };
}

/**
 * Validated `relief` -> {height, w, h, on, info} at w x h (the preview's size now),
 * resampled bilinearly if the map was saved at another size.
 */
export async function decodeRelief(r, w, h) {
  const im = new Image();
  await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('Measured relief could not be opened.')); im.src = r.image; });
  if (im.naturalWidth !== r.w || im.naturalHeight !== r.h) throw new Error('Invalid measured relief in project.');
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, r.w, r.h).data, src = new Float32Array(r.w * r.h), span = r.hi - r.lo;
  for (let i = 0; i < src.length; i++) src[i] = r.lo + (d[i * 4] * 256 + d[i * 4 + 1]) / 65535 * span;
  let height = src;
  if (r.w !== w || r.h !== h) {
    height = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(r.h - 1, Math.max(0, (y + 0.5) * r.h / h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(r.h - 1, y0 + 1), ty = fy - y0;
      for (let X = 0; X < w; X++) {
        const fx = Math.min(r.w - 1, Math.max(0, (X + 0.5) * r.w / w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(r.w - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * r.w + x0] * (1 - tx) + src[y0 * r.w + x1] * tx, b = src[y1 * r.w + x0] * (1 - tx) + src[y1 * r.w + x1] * tx;
        height[y * w + X] = a * (1 - ty) + b * ty;
      }
    }
  }
  return { height, w, h, on: r.on, info: { depthMm: r.depthMm, check: r.check } };
}

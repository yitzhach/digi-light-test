// colour.js — the photo's colour space, kept from the file to the export.
//
// Phones save in Display P3 (iPhone photos, JPEG and HEIC) and many cameras in Adobe RGB:
// reds, oranges and greens sRGB cannot hold. Drawn into the browser's default sRGB canvases they
// are clipped to sRGB on the way in and the export says sRGB. A photo whose profile is wider than
// sRGB is worked in Display P3 instead: its canvases, the WebGL textures and drawing buffer (the
// iMac's and iPhone's screens show it), and the exported files, which carry a Display P3 profile.
// Any other photo stays sRGB, exactly as before. The lighting works on the encoded values in
// either space (both use the sRGB curve, both are white at D65), so a look is the same look.
//
// HEIC: Safari opens it; elsewhere libheif (vendor/libheif, WebAssembly, ~1.5 MB) decodes it,
// loaded only then.

let working = 'srgb';
export const workingSpace = () => working;

// Linear sRGB to linear Display P3 (both D65).
const P3_FROM_SRGB = [0.8224621, 0.177538, 0, 0.0331941, 0.9668058, 0, 0.0170827, 0.0723974, 0.9105199];
/**
 * A light's or effect's colour, chosen in sRGB (Kelvin, the colour pickers), in the working
 * space's primaries: the same colour on a P3 photo. Linear values; unchanged in sRGB.
 */
export function toWorking(rgb) {
  if (working !== 'display-p3') return rgb;
  const m = P3_FROM_SRGB, [r, g, b] = rgb;
  return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
}
/** The same for an encoded colour (0–1, the sRGB curve, as a #rrggbb picker gives it). */
export function encodedToWorking(rgb) {
  if (working !== 'display-p3') return rgb;
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), enc = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  return toWorking(rgb.map(lin)).map((v) => enc(Math.min(1, Math.max(0, v))));
}

/** Work in `space` ('display-p3' or 'srgb') from now on; gl: the app's WebGL context. */
export function useSpace(space, gl) {
  working = space === 'display-p3' ? space : 'srgb';
  if (gl && 'drawingBufferColorSpace' in gl) { gl.drawingBufferColorSpace = working; gl.unpackColorSpace = working; }
}
/** A 2D context in the working space (opts: willReadFrequently...). */
export const ctx2d = (canvas, opts = {}) => canvas.getContext('2d', { ...opts, colorSpace: working });
/** A canvas of w x h and its 2D context, in the working space. */
export function canvas2d(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, ctx2d(c, opts)];
}
/** ImageData in the working space: (data, w, h) or (w, h). */
export const imageData = (a, b, c) => (typeof a === 'number' ? new ImageData(a, b, { colorSpace: working }) : new ImageData(a, b, c, { colorSpace: working }));

/** The space to work a photo in, from its file's colour profile: 'display-p3' or 'srgb'. */
export async function spaceOf(blob) {
  try {
    const u = new Uint8Array(await blob.slice(0, 1 << 20).arrayBuffer());
    const p = await profileOf(u);
    return p && (p.wide ?? iccWide(p.icc)) ? 'display-p3' : 'srgb';
  } catch { return 'srgb'; }
}

// The colour profile in a JPEG, PNG, WebP or HEIC / AVIF: {icc} (bytes) or {wide} (an nclx box).
async function profileOf(u) {
  const be16 = (i) => (u[i] << 8) | u[i + 1], be32 = (i) => ((u[i] << 24) >>> 0) + (u[i + 1] << 16) + (u[i + 2] << 8) + u[i + 3];
  const str = (i, n) => String.fromCharCode(...u.subarray(i, i + n));
  if (u[0] === 0xff && u[1] === 0xd8) {
    // JPEG: APP2 "ICC_PROFILE" segments, in order, before the scan.
    const parts = [];
    for (let i = 2; i + 4 < u.length && u[i] === 0xff;) {
      const m = u[i + 1], n = be16(i + 2);
      if (m === 0xda) break;
      if (m === 0xe2 && str(i + 4, 12) === 'ICC_PROFILE\0') parts.push(u.subarray(i + 18, i + 2 + n));
      i += 2 + n;
    }
    return parts.length ? { icc: concat(parts) } : null;
  }
  if (str(1, 3) === 'PNG') {
    // PNG: iCCP (name, 0, compression 0, zlib data), before the image data.
    for (let i = 8; i + 8 < u.length;) {
      const n = be32(i), t = str(i + 4, 4);
      if (t === 'IDAT') break;
      if (t === 'iCCP') { const d = u.subarray(i + 8, i + 8 + n), z = d.indexOf(0) + 2; return { icc: await inflate(d.subarray(z)) }; }
      i += 12 + n;
    }
    return null;
  }
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
    for (let i = 12; i + 8 < u.length;) {
      const t = str(i, 4), n = u[i + 4] | (u[i + 5] << 8) | (u[i + 6] << 16) | (u[i + 7] << 24);
      if (t === 'ICCP') return { icc: u.subarray(i + 8, i + 8 + n) };
      i += 8 + n + (n & 1);
    }
    return null;
  }
  if (str(4, 4) === 'ftyp') {
    // HEIC / AVIF: a 'colr' box, an ICC profile ('prof', 'rICC') or nclx primaries (1 sRGB / BT.709;
    // 9 BT.2020, 11 DCI-P3, 12 Display P3).
    for (let i = u.indexOf(0x63, 8); i > 4 && i + 8 < u.length; i = u.indexOf(0x63, i + 1)) {
      if (str(i, 4) !== 'colr') continue;
      const n = be32(i - 4), kind = str(i + 4, 4);
      if (kind === 'prof' || kind === 'rICC') return { icc: u.subarray(i + 8, i - 4 + n) };
      if (kind === 'nclx') return { wide: [9, 11, 12].includes(be16(i + 8)) };
    }
  }
  return null;
}

/** Whether an ICC profile's primaries reach past sRGB's (Display P3, Adobe RGB, ProPhoto...). */
export function iccWide(icc) {
  const v = new DataView(icc.buffer, icc.byteOffset, icc.byteLength), sig = (i) => String.fromCharCode(...icc.subarray(i, i + 4));
  const xyz = {};
  for (let k = 0, n = v.getUint32(128); k < n; k++) {
    const t = 132 + k * 12, name = sig(t), at = v.getUint32(t + 4);
    if ((name === 'rXYZ' || name === 'gXYZ') && sig(at) === 'XYZ ') xyz[name] = [0, 1, 2].map((j) => v.getInt32(at + 8 + 4 * j) / 65536);
  }
  const x = (c) => c && c[0] / (c[0] + c[1] + c[2]);
  // Chromaticity x of the primaries, adapted to D50 as ICC stores them: sRGB red 0.648, green
  // 0.321; Display P3 0.683, 0.284; Adobe RGB 0.648, 0.215.
  return x(xyz.rXYZ) > 0.66 || x(xyz.gXYZ) < 0.30;
}

const concat = (parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function inflate(z) {
  const s = new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export const isHeif = (file) => /\.(heic|heif)$/i.test(file?.name || '') || /image\/hei[cf]/i.test(file?.type || '');

let heif = null;
/**
 * A HEIC / HEIF photo the browser cannot open, decoded by libheif: a canvas in `space` holding
 * its pixels as they are encoded (libheif applies no profile; the space says what they are).
 */
export async function decodeHeif(blob, space) {
  heif ||= import('../vendor/libheif/libheif-bundle.mjs').then((m) => m.default());
  const lib = await heif;
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await blob.arrayBuffer()));
  if (!images?.length) throw new Error('No picture found in that HEIC file.');
  const im = images[0], w = im.get_width(), h = im.get_height();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { colorSpace: space }), data = new ImageData(w, h, { colorSpace: space });
  await new Promise((res, rej) => im.display(data, (d) => (d ? res() : rej(new Error('HEIC decoding failed.')))));
  g.putImageData(data, 0, 0);
  for (const x of images) x.free?.();
  return c;
}

// changemap.js — what a picture changed, pixel by pixel, against the photo it was made from.
//
// DigiLight's claim is that every output pixel is the photo's own pixel at that place times
// light computed from the relief. This checks it from the two pictures alone (both RGBA bytes,
// the same size: the photo drawn the way the picture's own pixels started, automation.js
// photoAt), never from what the shader says it did:
//   light   the light each pixel was multiplied by, in stops: log2 of the render's linear luma
//           over the photo's (E, about level 5, keeps near-black pixels from reading as
//           infinite gains)
//   colour  how far the render is from the photo's own colour at that new brightness (the
//           photo's linear RGB times that light, back to sRGB), in levels (0-255), the largest
//           channel. A coloured lamp, warmth (Kelvin), the Colour tool and clipping show up
//           here; plain light, however strong, does not.
// The map is a picture of one of them: light (grey = unchanged, orange = brighter, blue =
// darker, full colour at ±range stops) or colour (black = the photo's colour, white = 32
// levels or more off). DOM-free so tests/changemap.mjs runs it in Node.

const LIN = Float64Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const srgb = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const E = 0.0015;                     // linear; about sRGB level 5
const STEP = 0.01, SPAN = 16;         // light histogram: 0.01-stop bins over ±16 stops
const MOVED = 0.05;                   // stops: a pixel under this either way counts as unchanged light
export const COLOUR_TOL = 4;          // levels: a pixel over this counts as off the photo's colour
const BRIGHT = [255, 150, 30], DARK = [30, 100, 255], MID = 128;

const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 1e4) / 1e4;
// The p-th percentile of a histogram (counts, n in all), as the bin's value.
function pctHist(hist, n, p, at) {
  const want = Math.min(n - 1, Math.floor((n - 1) * p / 100));
  let seen = 0;
  for (let i = 0; i < hist.length; i++) { seen += hist[i]; if (seen > want) return at(i); }
  return at(hist.length - 1);
}

/**
 * render, photo: RGBA bytes, w x h. Returns {pixels (the map, RGBA bytes, unless map: false),
 * stats}: same (share of pixels identical to the photo), light (stops: min, p01, p05, p50,
 * p95, p99, max; brighter / darker the shares moved over MOVED stops), colour (levels: p50,
 * p95, p99, max; off the share over COLOUR_TOL).
 */
export function changeMap(render, photo, w, h, { map = 'light', range = 2 } = {}) {
  const n = w * h;
  if (render.length < n * 4 || photo.length < n * 4) throw new Error('changeMap: the render and the photo must be w x h RGBA.');
  if (map && map !== 'light' && map !== 'colour') throw new Error('changeMap: map is "light" or "colour".');
  if (!(range > 0)) throw new Error('changeMap: range (stops) must be over 0.');
  const out = map ? new Uint8ClampedArray(n * 4) : null;
  const bins = Math.round(2 * SPAN / STEP) + 1, lightHist = new Uint32Array(bins), colHist = new Uint32Array(256);
  let same = 0, brighter = 0, darker = 0, off = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const R0 = render[p], G0 = render[p + 1], B0 = render[p + 2], P0 = photo[p], P1 = photo[p + 1], P2 = photo[p + 2];
    if (R0 === P0 && G0 === P1 && B0 === P2) same++;
    const pr = LIN[P0], pg = LIN[P1], pb = LIN[P2];
    const yp = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb, yr = 0.2126 * LIN[R0] + 0.7152 * LIN[G0] + 0.0722 * LIN[B0];
    const k = (yr + E) / (yp + E), s = Math.log2(k);
    if (s < lo) lo = s;
    if (s > hi) hi = s;
    if (s > MOVED) brighter++; else if (s < -MOVED) darker++;
    lightHist[Math.min(bins - 1, Math.max(0, Math.round((s + SPAN) / STEP)))]++;
    // The photo's colour at the render's brightness (the plain ratio: E would tint the darks), against the render.
    const kc = yp > 0 ? yr / yp : 0;
    const dev = Math.max(Math.abs(R0 - srgb(Math.min(1, kc * pr))), Math.abs(G0 - srgb(Math.min(1, kc * pg))), Math.abs(B0 - srgb(Math.min(1, kc * pb))));
    if (dev > COLOUR_TOL) off++;
    colHist[Math.min(255, Math.round(dev))]++;
    if (!out) continue;
    if (map === 'colour') {
      const v = 255 * Math.sqrt(Math.min(1, dev / 32));
      out[p] = out[p + 1] = out[p + 2] = v;
    } else {
      const t = Math.max(-1, Math.min(1, s / range)), to = t > 0 ? BRIGHT : DARK, a = Math.abs(t);
      out[p] = MID + (to[0] - MID) * a; out[p + 1] = MID + (to[1] - MID) * a; out[p + 2] = MID + (to[2] - MID) * a;
    }
    out[p + 3] = 255;
  }
  const atL = (i) => r2(i * STEP - SPAN), atC = (i) => i;
  const lp = (q) => pctHist(lightHist, n, q, atL), cp = (q) => pctHist(colHist, n, q, atC);
  let cmax = 0;
  for (let i = 255; i >= 0; i--) if (colHist[i]) { cmax = i; break; }
  const stats = {
    size: [w, h], map: map || null, range: map === 'light' ? range : undefined,
    same: r4(same / n),
    light: { min: r2(lo), p01: lp(1), p05: lp(5), p50: lp(50), p95: lp(95), p99: lp(99), max: r2(hi), brighter: r4(brighter / n), darker: r4(darker / n) },
    colour: { p50: cp(50), p95: cp(95), p99: cp(99), max: cmax, off: r4(off / n) },
  };
  return { pixels: out, stats };
}

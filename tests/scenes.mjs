// scenes.mjs — synthetic photos with known answers, for the scene reading (src/scenedepth.js).
//   A portrait against a backdrop, a board standing on a floor before a wall, an art fair booth
//   seen from its open side, a landscape under sky, and a painting that fills the frame. Each is
//   lit from the upper left (so it has shading to read and to take out) and has a little sensor
//   noise; each returns {rgba, w, h, truth} with the subject / sky masks and lines it was drawn with.
// Plain arrays, no DOM: tests/scenedepth.mjs uses them in Node, tests/browser.cjs draws them in a page.

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const LIGHT = (() => { const v = [-0.55, 0.5, 0.67], n = Math.hypot(...v); return v.map((x) => x / n); })();
// Lambert under LIGHT with some room light, for a unit normal (x right, y up, z out).
const shade = (nx, ny, nz) => 0.35 + 0.65 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);

function canvas(w, h, seed) {
  const rgba = new Uint8ClampedArray(w * h * 4), rnd = rng(seed);
  const put = (x, y, [r, g, b], k = 1) => {
    const i = (y * w + x) * 4, n = (rnd() - 0.5) * 6;
    rgba[i] = r * k + n; rgba[i + 1] = g * k + n; rgba[i + 2] = b * k + n; rgba[i + 3] = 255;
  };
  return { rgba, put, rnd };
}

/** A head and shoulders against a grey-blue backdrop, the body running out of the bottom. */
function portrait(w = 480, h = 600) {
  const { rgba, put, rnd } = canvas(w, h, 11), subject = new Uint8Array(w * h);
  const head = { x: 0.5 * w, y: 0.36 * h, rx: 0.16 * w, ry: 0.2 * h };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / h, i = y * w + x;
    let col = [128 - 30 * t, 136 - 30 * t, 150 - 30 * t], k = 1 - 0.15 * Math.abs(x / w - 0.5);
    // Head (an ellipsoid), hair over its top, neck, then shoulders and chest (a wide half-cylinder).
    const ex = (x - head.x) / head.rx, ey = (y - head.y) / head.ry, e = ex * ex + ey * ey;
    const neck = Math.abs(x - head.x) < 0.07 * w && y > head.y && y < 0.66 * h;
    const bodyX = (x - 0.5 * w) / (0.38 * w), body = y > 0.62 * h && Math.abs(bodyX) < 1 - 0.6 * Math.max(0, (0.7 * h - y) / (0.08 * h));
    if (e < 1) {
      const nz = Math.sqrt(1 - e);
      const hair = ey < -0.35 + 0.15 * Math.abs(ex) && e > 0.0;
      col = hair ? [55, 40, 32] : [214, 164, 134]; k = shade(ex, -ey, nz); subject[i] = 1;
    } else if (neck) { col = [200, 150, 122]; k = shade((x - head.x) / (0.07 * w), 0, 1) * 0.85; subject[i] = 1; }
    else if (body) { col = [44, 62, 104]; k = shade(bodyX, 0.3, Math.sqrt(Math.max(0.05, 1 - bodyX * bodyX))); subject[i] = 1; }
    put(x, y, col, k * (0.97 + 0.06 * rnd()));
  }
  return { rgba, w, h, truth: { subject, head } };
}

/** A painted board standing on a wooden floor in front of a pale wall. */
function object(w = 600, h = 480) {
  const { rgba, put, rnd } = canvas(w, h, 23), subject = new Uint8Array(w * h);
  const floor = 0.74, board = { x0: 0.33, x1: 0.67, y0: 0.12, y1: 0.86 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, t = y / h, i = y * w + x;
    let col = t > floor ? [128, 96, 64] : [206, 196, 176], k = t > floor ? 0.8 + 0.4 * (t - floor) : 1.05 - 0.25 * u;
    if (u > board.x0 && u < board.x1 && t > board.y0 && t < board.y1) {
      // The painting: grey and white bands with a scumbled texture.
      const band = Math.sin(t * 18 + Math.sin(u * 9) * 1.5) > 0;
      col = band ? [222, 220, 214] : [96, 98, 104]; k = 0.9 + 0.2 * rnd(); subject[i] = 1;
    }
    put(x, y, col, k);
  }
  return { rgba, w, h, truth: { subject, floor, board } };
}

/** An art fair booth seen from its open side: white back wall with paintings, grey side walls,
 *  a dark tent ceiling and a carpet, in one-point perspective. */
function booth(w = 720, h = 480) {
  const { rgba, put } = canvas(w, h, 37);
  const wall = { x0: 0.2, y0: 0.16, x1: 0.8, y1: 0.66 }, cx = 0.5, cy = (wall.y0 + wall.y1) / 2;
  const art = [[0.27, 0.3, 0.37, 0.48, [168, 54, 40]], [0.44, 0.26, 0.56, 0.52, [40, 82, 140]], [0.63, 0.3, 0.73, 0.48, [214, 168, 40]]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, t = y / h;
    // Which surface: the first one the ray meets (as in scenedepth.js layout).
    const z = Math.min(1, t > wall.y1 ? (wall.y1 - cy) / (t - cy) : 1, t < wall.y0 ? (cy - wall.y0) / (cy - t) : 1,
      u < wall.x0 ? (cx - wall.x0) / (cx - u) : 1, u > wall.x1 ? (wall.x1 - cx) / (u - cx) : 1);
    let col = [236, 235, 230], k = 1;
    if (z < 1) {
      if (t > wall.y1 && (wall.y1 - cy) / (t - cy) === z) { col = [92, 92, 98]; k = 0.8 + 0.3 * (t - wall.y1); }
      else if (t < wall.y0 && (cy - wall.y0) / (cy - t) === z) { col = [44, 44, 50]; }
      else { col = [214, 214, 210]; k = u < 0.5 ? 0.95 : 0.85; }
    } else for (const [a0, b0, a1, b1, c] of art) if (u > a0 && u < a1 && t > b0 && t < b1) col = c;
    put(x, y, col, k);
  }
  return { rgba, w, h, truth: { wall } };
}

/** Rolling ground under a blue sky, a dark tree standing on it. */
function landscape(w = 720, h = 480) {
  const { rgba, put, rnd } = canvas(w, h, 53), sky = new Uint8Array(w * h);
  const horizon = 0.44, hill = (u) => horizon - 0.06 * Math.max(0, Math.sin(u * 5 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, t = y / h, i = y * w + x;
    const tree = Math.hypot((u - 0.7) * 1.5, t - 0.42) < 0.11 || (Math.abs(u - 0.7) < 0.012 && t > 0.45 && t < 0.62);
    let col, k = 1;
    if (tree) { col = [34, 62, 30]; k = 0.8 + 0.4 * rnd(); }
    else if (t < hill(u)) { col = [118 + 80 * t, 164 + 50 * t, 226 + 10 * t]; sky[i] = 1; }
    else { col = [96, 120, 58]; k = 0.75 + 0.5 * rnd() * (0.4 + t); }
    put(x, y, col, k);
  }
  return { rgba, w, h, truth: { sky, horizon } };
}

/** The same ground under a grey overcast sky. */
function overcast(w = 720, h = 480) {
  const { rgba, put, rnd } = canvas(w, h, 61), sky = new Uint8Array(w * h);
  const hill = (u) => 0.46 - 0.05 * Math.max(0, Math.sin(u * 4 + 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, t = y / h, i = y * w + x;
    if (t < hill(u)) { put(x, y, [232 - 24 * t, 233 - 24 * t, 236 - 24 * t]); sky[i] = 1; }
    else put(x, y, [88, 100, 64], 0.7 + 0.6 * rnd() * (0.4 + t));
  }
  return { rgba, w, h, truth: { sky } };
}

/** A plaster panel filling the frame, like the user's lintel (testdata/photos): lumpy white
 *  impasto lit from the upper left with a cool cast toward the top, a wooden lintel over a
 *  near-black doorway, grey streaks down the sides and along the foot, a few stains. Its whites
 *  are as bright, grey and textured as the photo's (the sky finder's texture: a quarter under
 *  3.6, half under 6.4; the photo 3.6, 5.3), so no sky. */
function plaster(w = 480, h = 600) {
  const { rgba, put, rnd } = canvas(w, h, 83);
  const lumps = Array.from({ length: 1400 }, () => ({ x: rnd() * w, y: rnd() * h, r: (0.006 + 0.02 * rnd()) * w, a: 0.4 * (rnd() - 0.4) }));
  const stains = Array.from({ length: 8 }, () => ({ x: rnd() * w, y: rnd() * 0.35 * h, r: (0.02 + 0.05 * rnd()) * w }));
  // The relief: a sum of round lumps; its slope, lit from the upper left, shades the paint.
  const z = new Float32Array(w * h);
  for (const l of lumps) for (let y = Math.max(0, Math.floor(l.y - l.r)); y < Math.min(h, l.y + l.r); y++) for (let x = Math.max(0, Math.floor(l.x - l.r)); x < Math.min(w, l.x + l.r); x++) {
    const d = Math.hypot(x - l.x, y - l.y) / l.r;
    if (d < 1) z[y * w + x] += l.a * l.r * (1 - d * d);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = x / w, t = y / h;
    const gx = x > 0 && x < w - 1 ? (z[i + 1] - z[i - 1]) / 2 : 0, gy = y > 0 && y < h - 1 ? (z[i - w] - z[i + w]) / 2 : 0, n = Math.hypot(gx, gy, 1);
    let col = [236 - 8 * (1 - t), 234 - 3 * (1 - t), 226 + 8 * (1 - t)];
    const streak = (u < 0.14 || u > 0.8) && t > 0.3 + 0.1 * Math.sin(u * 40);
    if (t > 0.9) col = [72, 72, 76];
    else if (u > 0.32 && u < 0.72 && t > 0.33 && t < 0.4) col = [122, 98, 72];
    else if (u > 0.36 && u < 0.66 && t >= 0.4) col = [58, 52, 48];
    else if (streak || stains.some((s) => Math.hypot(x - s.x, y - s.y) < s.r)) col = [138, 140, 146];
    put(x, y, col, Math.min(1.1, shade(-gx / n, -gy / n, 1 / n) * 1.25));
  }
  return { rgba, w, h, truth: {} };
}

/** A painting filling the frame: overlapping strokes of colour edge to edge. */
function painting(w = 480, h = 600) {
  const { rgba, put, rnd } = canvas(w, h, 71);
  const strokes = Array.from({ length: 140 }, () => ({ x: rnd() * w, y: rnd() * h, a: rnd() * Math.PI, l: 10 + rnd() * 40, r: 3 + rnd() * 6, c: [60 + rnd() * 180, 60 + rnd() * 160, 50 + rnd() * 150] }));
  const base = [150, 128, 104];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let col = base;
    for (const s of strokes) {
      const dx = x - s.x, dy = y - s.y, along = dx * Math.cos(s.a) + dy * Math.sin(s.a), across = -dx * Math.sin(s.a) + dy * Math.cos(s.a);
      if (Math.abs(along) < s.l && Math.abs(across) < s.r) col = s.c;
    }
    put(x, y, col, 0.9 + 0.2 * rnd());
  }
  return { rgba, w, h, truth: {} };
}

// Each scene drawn at twice the size and averaged down 2 × 2, so its outlines are anti-aliased
// like a real photo's (a hard stair-step outline is not what a camera gives); masks by majority.
function smooth(make) {
  return (w, h) => {
    const big = make(...(w ? [2 * w, 2 * h] : [])), W = big.w >> 1, H = big.h >> 1, rgba = new Uint8ClampedArray(W * H * 4), truth = { ...big.truth };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += big.rgba[((2 * y + dy) * big.w + 2 * x + dx) * 4 + c];
      rgba[(y * W + x) * 4 + c] = Math.round(s / 4);
    }
    for (const k of ['subject', 'sky']) if (big.truth[k]) {
      const m = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += big.truth[k][(2 * y + dy) * big.w + 2 * x + dx]; m[y * W + x] = s >= 2 ? 1 : 0; }
      truth[k] = m;
    }
    if (big.truth.head) truth.head = { x: big.truth.head.x / 2, y: big.truth.head.y / 2, rx: big.truth.head.rx / 2, ry: big.truth.head.ry / 2 };
    return { rgba, w: W, h: H, truth };
  };
}
export const SCENES = Object.fromEntries(Object.entries({ portrait, object, booth, landscape, overcast, painting, plaster }).map(([k, f]) => [k, smooth(f)]));

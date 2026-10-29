// scenedepth.mjs — the scene reading (src/scenedepth.js) on synthetic photos with known answers
// (tests/scenes.mjs), and its filters against slow, obvious versions of the same maths.
//   node tests/scenedepth.mjs        (a few seconds; no browser)
import assert from 'node:assert/strict';
import { readScene, composeScene, suggestType, boxMean, guidedFilter, percentile, barrierDistance, inflate, borderSeeds, readImage, SCENE_SHAPE } from '../src/scenedepth.js';
import { SCENES } from './scenes.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const mean = (v, pick) => { let s = 0, k = 0; for (let i = 0; i < v.length; i++) if (pick(i)) { s += v[i]; k++; } return k ? s / k : NaN; };
const iou = (soft, truth) => { let a = 0, b = 0; for (let i = 0; i < truth.length; i++) { const p = soft[i] > 0.5, q = !!truth[i]; if (p && q) a++; if (p || q) b++; } return a / b; };

// ---------------------------------------------------------------- filters
{
  let seed = 3;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const [w, h, r] of [[17, 9, 2], [40, 31, 5], [8, 50, 7], [1, 1, 3]]) {
    const v = Float32Array.from({ length: w * h }, rand), fast = boxMean(v, w, h, r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, k = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) { s += v[Y * w + X]; k++; } }
      assert.ok(Math.abs(fast[y * w + x] - s / k) < 1e-5, `boxMean ${w}x${h} r${r} at ${x},${y}`);
    }
  }
  const v = Float32Array.from({ length: 999 }, rand), sorted = Float32Array.from(v).sort();
  for (const p of [0, 0.02, 0.5, 0.98, 1]) assert.equal(percentile(v, p), sorted[Math.floor(p * 998)], `percentile ${p}`);
  console.log('PASS filters: box mean exact against the naive window, percentile against a full sort');
}
{
  // Guided filter: a noisy step in the input is smoothed on each side but its edge, which the guide
  // also has, stays sharp.
  const w = 60, h = 20, rgba = new Uint8ClampedArray(w * h * 4), p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, on = x >= 30, c = on ? 220 : 40;
    rgba.set([c, c, c, 255], i * 4); p[i] = (on ? 1 : 0) + ((x * 7 + y * 13) % 5 - 2) * 0.05;
  }
  const q = guidedFilter(readImage(rgba, w, h), p, 4, 1e-3), row = (x) => q[10 * w + x];
  assert.ok(Math.abs(row(28) - 0) < 0.06 && Math.abs(row(31) - 1) < 0.06, `edge kept ${r3(row(28))} ${r3(row(31))}`);
  let noise = 0;
  for (let x = 5; x < 25; x++) noise = Math.max(noise, Math.abs(row(x)));
  assert.ok(noise < 0.05, `flat side smoothed ${r3(noise)}`);
  console.log('PASS guided filter: edges the guide has stay sharp, noise either side is smoothed');
}
{
  // Barrier distance: a square of value 10 on 0 is walled off by a barrier of 10; the background is 0.
  const w = 30, h = 30, I = new Float32Array(w * h);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) I[y * w + x] = 10;
  const D = barrierDistance([I], w, h, borderSeeds(w, h));
  assert.equal(D[15 * w + 15], 10); assert.equal(D[3 * w + 3], 0);
  // Inflation: a disc of radius R rises to R (a hemisphere); a strip of half-width a to √2·a (∇²φ = −4 in 1D).
  const N = 120, disc = new Uint8Array(N * N), strip = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { disc[y * N + x] = Math.hypot(x - 60, y - 60) < 40 ? 1 : 0; strip[y * N + x] = Math.abs(x - 60) < 12 ? 1 : 0; }
  const hd = inflate(disc, N, N), hs = inflate(strip, N, N);
  assert.ok(Math.abs(hd[60 * N + 60] - 40) < 4, `disc ${r3(hd[60 * N + 60])}`);
  assert.ok(Math.abs(hd[60 * N + 90] - Math.sqrt(40 * 40 - 30 * 30)) < 4, `disc at r 30 ${r3(hd[60 * N + 90])}`);
  assert.ok(Math.abs(hs[60 * N + 60] - Math.SQRT2 * 12) < 2, `strip ${r3(hs[60 * N + 60])}`);
  console.log('PASS barrier distance and inflation: a walled-off square, a disc becomes a hemisphere, a strip a cylinder');
}

// ---------------------------------------------------------------- scenes
const read = {};
for (const [name, make] of Object.entries(SCENES)) {
  const s = make(), t0 = performance.now(), scene = readScene(s.rgba, s.w, s.h);
  read[name] = { s, scene, ms: performance.now() - t0 };
}
{
  const want = { portrait: 'portrait', object: 'object', booth: 'room', landscape: 'photo', painting: 'artwork' };
  const got = Object.fromEntries(Object.keys(want).map((k) => [k, suggestType(read[k].scene).type]));
  assert.deepEqual(got, want);
  console.log('PASS suggestions: portrait, object, room, photo and artwork told apart', JSON.stringify(got));
}
{
  const { s, scene } = read.portrait, m = composeScene(scene, 'portrait'), { w, h } = s, head = s.truth.head;
  const sub = iou(m.subject, s.truth.subject);
  assert.ok(sub > 0.9, `portrait subject IoU ${r3(sub)}`);
  const inside = mean(m.height, (i) => s.truth.subject[i]), outside = mean(m.height, (i) => !s.truth.subject[i]);
  const depth = SCENE_SHAPE.portrait.depth;
  assert.ok(inside - outside > 0.5 * depth * SCENE_SHAPE.portrait.gap, `subject in front ${r3(inside)} vs ${r3(outside)}`);
  // Rounded: the middle of the face stands out further than near its outline.
  const at = (u, v) => m.height[Math.round(v) * w + Math.round(u)];
  assert.ok(at(head.x, head.y) - at(head.x + 0.85 * head.rx, head.y) > 0.02, `rounded ${r3(at(head.x, head.y))} ${r3(at(head.x + 0.85 * head.rx, head.y))}`);
  // Lit from the upper left: the photo's light is higher on the face's left than its right.
  const left = mean(m.light, (i) => { const x = i % w, y = (i - x) / w; return Math.hypot((x - head.x) / head.rx, (y - head.y) / head.ry) < 0.8 && x < head.x - 0.2 * head.rx; });
  const right = mean(m.light, (i) => { const x = i % w, y = (i - x) / w; return Math.hypot((x - head.x) / head.rx, (y - head.y) / head.ry) < 0.8 && x > head.x + 0.2 * head.rx; });
  assert.ok(left > right + 0.1, `photo light left ${r3(left)} right ${r3(right)}`);
  console.log('PASS portrait: subject found, in front of its backdrop, rounded, its lit side read', JSON.stringify({ iou: r3(sub), front: r3(inside - outside), light: [r3(left), r3(right)] }));
}
{
  const { s, scene } = read.object, m = composeScene(scene, 'object'), { w, h } = s, b = s.truth.board;
  const sub = iou(m.subject, s.truth.subject);
  assert.ok(sub > 0.9, `object subject IoU ${r3(sub)}`);
  const wall = m.height[Math.round(0.3 * h) * w + Math.round(0.1 * w)], board = m.height[Math.round(0.5 * h) * w + Math.round(0.5 * w)];
  assert.ok(Math.abs(wall) < 0.01 && board > wall + 0.03, `board stands in front of the wall ${r3(board)} ${r3(wall)}`);
  assert.ok(m.floorAt > 0.6 && m.floorAt < b.y1, `floor line ${r3(m.floorAt)}`);
  console.log('PASS object: subject found, standing on the floor in front of the wall', JSON.stringify({ iou: r3(sub), board: r3(board), floorAt: r3(m.floorAt) }));
}
{
  const { s, scene } = read.booth, m = composeScene(scene, 'room'), { w, h } = s, t = s.truth.wall;
  for (const k of ['x0', 'y0', 'x1', 'y1']) assert.ok(Math.abs(scene.room.wall[k] - t[k]) < 0.03, `wall ${k} ${r3(scene.room.wall[k])} vs ${t[k]}`);
  const at = (u, v) => m.height[Math.round(v * h) * w + Math.round(u * w)];
  const depth = SCENE_SHAPE.room.depth;
  assert.ok(at(0.5, 0.97) > 0.4 * depth && Math.abs(at(0.5, 0.6)) < 0.01, `floor comes forward ${r3(at(0.5, 0.97))}, back wall at the back ${r3(at(0.5, 0.6))}`);
  assert.ok(at(0.03, 0.4) > 0.3 * depth && at(0.97, 0.4) > 0.3 * depth, 'side walls come forward');
  // The paintings hang on the back wall: not pulled out of it.
  assert.ok(Math.abs(at(0.5, 0.4)) < 0.01 && m.subject[Math.round(0.4 * h) * w + Math.round(0.5 * w)] < 0.5, `paintings stay on the wall ${r3(at(0.5, 0.4))}`);
  console.log('PASS room: wall lines found, floor and sides come forward, paintings stay on the wall', JSON.stringify(Object.fromEntries(Object.entries(scene.room.wall).map(([k, v]) => [k, r3(v)]))));
}
{
  const { s, scene } = read.landscape, m = composeScene(scene, 'photo'), { w, h } = s;
  const sky = iou(m.sky, s.truth.sky);
  assert.ok(sky > 0.9, `sky IoU ${r3(sky)}`);
  assert.ok(Math.abs(m.horizon - s.truth.horizon) < 0.06, `horizon ${r3(m.horizon)}`);
  const at = (u, v) => m.height[Math.round(v * h) * w + Math.round(u * w)];
  assert.ok(at(0.2, 0.1) === 0 && at(0.2, 0.98) > 0.8 * SCENE_SHAPE.photo.depth, `sky far, ground near ${r3(at(0.2, 0.98))}`);
  assert.ok(at(0.7, 0.42) > at(0.6, 0.42) + 0.05, `the tree stands out of what is behind it ${r3(at(0.7, 0.42))}`);
  console.log('PASS photo: sky found and far, horizon, ground comes forward, the tree stands on it', JSON.stringify({ sky: r3(sky), horizon: r3(m.horizon) }));
}
{
  // The same photo reads the same every time, and fast enough to run on open.
  const { s } = read.portrait, again = composeScene(readScene(s.rgba, s.w, s.h), 'portrait'), first = composeScene(read.portrait.scene, 'portrait');
  for (const k of ['height', 'behind', 'front', 'light', 'subject', 'sky']) assert.deepEqual(again[k], first[k], k);
  const slow = Object.entries(read).map(([k, v]) => [k, Math.round(v.ms)]);
  assert.ok(slow.every(([, ms]) => ms < 1500), JSON.stringify(slow));
  console.log('PASS repeatable and quick', JSON.stringify(Object.fromEntries(slow)));
}

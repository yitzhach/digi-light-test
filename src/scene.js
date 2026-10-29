// scene.js — the scene a photo shows, on the GPU, and the settings that shape it (state.scene).
//
// A painting is a plane with paint relief on it; a photo of a person, a room or an object on a
// floor is a space. Lights in a space fall off into the background, round the subject and throw
// its shadow across what stands behind it. scenedepth.js reads that space from a small copy of
// the photo; this module carries its maps to the preview's size and on to every export tile,
// each time along the photo's own edges (joint bilateral upsampling, Kopf et al. 2007), so an
// outline stays as crisp as the photo's at any size:
//   level 1  the preview's size, two targets: A the heights behind and in front (smooth fields,
//            Catmull-Rom) and the subject and sky mattes (edge-aware), B the photo's own light
//            (edge-aware);
//   a tile   GBuffer.build (any size, the preview's own included): level 1 carried up again the
//            same way, into T.scene (A) and T.sceneLight (B). The matte joins the two heights
//            there, and each keeps its own smooth slope: a face's roundness up to its outline,
//            the wall flat right up to it.
// Image type 'artwork' is the painting as it always was: no scene, nothing here runs.

import { readScene, composeScene, suggestType, SCENE_TYPES, SCENE_SHAPE, SCENE_SIZE } from './scenedepth.js';
import { program, makeTarget, bindTarget, bindTextures, drawFullscreen } from './gl.js';
import { resampleRegion } from './resample.js';

export { SCENE_TYPES };
export const SCENE_APPLY = ['all', 'subject', 'background'];
// The relief of the surfaces in a photo (skin, cloth, a wall's plaster, a painting on it) at
// Surface detail 100%, in image widths: about a millimetre on a painting a metre wide.
export const DETAIL_WIDTHS = 0.0012;
// [key, label, min, max, step]: the Scene sliders, in state.scene.
export const SCENE_FIELDS = [
  ['depth', 'Depth', 0, 1.5, 0.01], ['roundness', 'Roundness', 0, 1.5, 0.01], ['form', 'Form from shading', 0, 1, 0.01],
  ['gap', 'Subject forward', 0, 1, 0.01], ['delight', 'Remove photo light', 0, 1, 0.01], ['detail', 'Surface detail', 0, 1, 0.01],
  ['keepSky', 'Keep the sky', 0, 1, 0.01],
];

// A painting has no scene; these only fill the slots (and stay put, so saved settings do not move
// when a photo type's shape is tuned).
const ARTWORK_SHAPE = { depth: 0.5, roundness: 0.5, form: 0.3, gap: 0.4 };

/** A scene of `type` with that type's shape (SCENE_SHAPE) and the common defaults. */
export function sceneDefaults(type = 'artwork') {
  const shape = SCENE_SHAPE[type] || ARTWORK_SHAPE;
  return { type, ...shape, wall: null, horizon: null, delight: 0.6, detail: type === 'portrait' ? 0.2 : 0.45, keepSky: 1, apply: 'all' };
}
export const sceneActive = (st) => st.mode === 'single' && !!st.scene && st.scene.type !== 'artwork';
// What the maps are made from: a change here recomposes them and rebuilds the relief.
const mapKey = (sc) => JSON.stringify([sc.type, sc.depth, sc.roundness, sc.form, sc.gap, sc.wall, sc.horizon]);
/** Everything in state.scene that changes the relief (app.js surfaceKey). */
export const sceneSurfaceKey = (st) => (sceneActive(st) ? JSON.stringify([mapKey(st.scene), st.scene.delight, st.scene.detail]) : '');

/** state.scene from a project or an API call, checked; null or missing is the artwork default. */
export function validateScene(v) {
  if (v == null) return sceneDefaults();
  const bad = (what) => { throw new Error(`Invalid scene${what ? ` ${what}` : ''}.`); };
  if (typeof v !== 'object' || !SCENE_TYPES.includes(v.type)) bad('type');
  const out = sceneDefaults(v.type);
  for (const [k, , min, max] of SCENE_FIELDS) if (v[k] != null) { if (!Number.isFinite(v[k]) || v[k] < min || v[k] > max) bad(k); out[k] = v[k]; }
  if (v.apply != null) { if (!SCENE_APPLY.includes(v.apply)) bad('apply'); out.apply = v.apply; }
  if (v.wall != null) {
    const r = v.wall;
    if (typeof r !== 'object' || ![r.x0, r.y0, r.x1, r.y1].every((x) => Number.isFinite(x) && x >= 0 && x <= 1) || r.x1 - r.x0 < 0.05 || r.y1 - r.y0 < 0.05) bad('wall');
    out.wall = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  }
  if (v.horizon != null) { if (!Number.isFinite(v.horizon) || v.horizon < 0.05 || v.horizon > 0.95) bad('horizon'); out.horizon = v.horizon; }
  return out;
}

// Carry the scene maps up along the photo's edges. The smooth fields (the heights behind and in
// front) by Catmull-Rom, which keeps their slopes continuous so the shading never shows the low
// map's grid; the edges (subject, sky, the photo's light) by joint bilateral weights: a low
// texel counts as much as its colour in the low copy of the photo matches this pixel's.
// ("heights", not "smooth": that is a GLSL keyword.)
const SCENE_UP_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uLowA;      // behind, front, subject, sky
uniform sampler2D uLowB;      // r: the photo's light
uniform sampler2D uLowGuide;  // the photo the low maps belong to, at their size (sRGB)
uniform sampler2D uGuide;     // the photo at this target's size (sRGB)
uniform vec4 uRect;           // u0, v0, u1, v1: the part of the low maps this target covers
uniform int uMode;            // 0: A (behind, front, subject, sky), 1: B (light)
uniform float uSame;          // 1: this target's pixels are the low maps' own, from uOffset on
uniform ivec2 uOffset;
uniform float uRange;         // colour range of the edge-aware weights (sRGB)

vec4 put(vec2 heights, vec3 edge) {
  return uMode == 0 ? vec4(heights, clamp(edge.xy, 0.0, 1.0)) : vec4(edge.z, 0.0, 0.0, 1.0);
}
void main() {
  ivec2 size = textureSize(uLowA, 0);
  if (uSame > 0.5) {
    ivec2 q = ivec2(gl_FragCoord.xy) + uOffset;
    vec4 a = texelFetch(uLowA, q, 0);
    outColor = put(a.xy, vec3(a.zw, texelFetch(uLowB, q, 0).r));
    return;
  }
  vec2 p = mix(uRect.xy, uRect.zw, vUV) * vec2(size) - 0.5, i = floor(p), t = p - i;
  vec2 w0 = t * (-0.5 + t * (1.0 - 0.5 * t)), w1 = 1.0 + t * t * (-2.5 + 1.5 * t);
  vec2 w2 = t * (0.5 + t * (2.0 - 1.5 * t)), w3 = t * t * (-0.5 + 0.5 * t);
  vec3 g = texture(uGuide, vUV).rgb;
  vec2 heights = vec2(0.0);
  vec3 edge = vec3(0.0);
  float wsum = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    ivec2 q = clamp(ivec2(i) + ivec2(x - 1, y - 1), ivec2(0), size - 1);
    vec4 a = texelFetch(uLowA, q, 0);
    float cw = (x == 0 ? w0.x : x == 1 ? w1.x : x == 2 ? w2.x : w3.x) * (y == 0 ? w0.y : y == 1 ? w1.y : y == 2 ? w2.y : w3.y);
    heights += cw * a.xy;
    vec2 d = vec2(float(x - 1), float(y - 1)) - t;
    vec3 c = texelFetch(uLowGuide, q, 0).rgb - g;
    float s = exp(-dot(d, d) * 0.78);   // spatial: a Gaussian of 0.8 low texels
    float wt = s * (exp(-dot(c, c) / (2.0 * uRange * uRange)) + 1e-4);
    edge += wt * vec3(a.zw, texelFetch(uLowB, q, 0).r);
    wsum += wt;
  }
  outColor = put(heights, edge / wsum);
}`;

const RANGE = 0.1;   // sRGB difference at which a low texel's say falls to 0.6

/**
 * The scene of the open photo: its reading (scenedepth.js, once per photo), the maps for the
 * settings asked for (recomposed when they change), and their level-1 targets on the GPU.
 */
export class SceneMaps {
  constructor(glctx) {
    this.glctx = glctx;
    this.prog = program(glctx.gl, SCENE_UP_FS, 'scene');
    this.photo = null;      // {canvas, tex}: the preview's copy of the photo and its texture
    this.scene = null;      // readScene() of the working copy
    this.low = null;        // {guide, w, h, rgba}: the working copy, and as a texture
    this.levels = [];       // [{key, a, b, maps}], most recent first: two kept (exportMany's groups)
  }

  /** A new photo, at the preview's size, and its texture there: what was read from the last goes. */
  setPhoto(canvas, tex) {
    this.photo = { canvas, tex };
    this.scene = null;
    this.dropLevels();
    if (this.low) { this.glctx.gl.deleteTexture(this.low.guide); this.low = null; }
  }

  dropLevels() {
    const { gl } = this.glctx;
    for (const l of this.levels) for (const t of [l.a, l.b, l.lowA, l.lowB]) {
      if (t?.fbo) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } else if (t) gl.deleteTexture(t);
    }
    this.levels = [];
  }

  /** The reading of the photo (scenedepth.js readScene), made on first use. */
  read() {
    if (this.scene) return this.scene;
    const c = this.photo.canvas, k = Math.min(1, SCENE_SIZE / Math.max(c.width, c.height));
    const w = Math.max(8, Math.round(c.width * k)), h = Math.max(8, Math.round(c.height * k));
    // The same pixels every session (resample.js): the reading is repeatable to the bit.
    const rgba = resampleRegion(c, w, h, 0, 0, w, h).data;
    this.scene = readScene(rgba, w, h);
    const { gl } = this.glctx, guide = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, guide);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length));
    nearest(gl);
    this.low = { guide, w, h };
    return this.scene;
  }

  /** What the photo most likely is (scenedepth.js suggestType). */
  suggestion() { return suggestType(this.read()); }

  /** The CPU maps (scenedepth.js composeScene) for scene settings `sc`. */
  maps(sc) { return this.level(sc).maps; }

  /**
   * Level 1 for scene settings `sc`: {a, b} targets at the preview's size and what a tile needs to
   * carry them up (GBuffer.build's opts.sceneMap). Recomposed only when the maps' key changes.
   */
  level(sc) {
    const key = mapKey(sc);
    let l = this.levels.find((x) => x.key === key);
    if (l) { this.levels = [l, ...this.levels.filter((x) => x !== l)]; return l; }
    const { gl, caps } = this.glctx, scene = this.read(), { w, h } = this.low;
    const opts = { depth: sc.depth, roundness: sc.roundness, form: sc.form, gap: sc.gap, ...(sc.wall ? { wall: sc.wall } : {}), ...(sc.horizon != null ? { horizon: sc.horizon } : {}) };
    const maps = composeScene(scene, sc.type, opts);
    const A = new Float32Array(w * h * 4), B = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      A[i * 4] = maps.behind[i]; A[i * 4 + 1] = maps.front[i]; A[i * 4 + 2] = maps.subject[i]; A[i * 4 + 3] = maps.sky[i];
      B[i * 4] = maps.light[i]; B[i * 4 + 3] = 1;
    }
    const lowA = floatTexture(gl, w, h, A), lowB = floatTexture(gl, w, h, B);
    const { canvas, tex } = this.photo, W = canvas.width, H = canvas.height;
    const a = makeTarget(gl, W, H, { float: true, linear: false, caps }), b = makeTarget(gl, W, H, { float: true, linear: false, caps });
    for (const [target, mode] of [[a, 0], [b, 1]]) {
      this.run(target, { lowA, lowB, lowGuide: this.low.guide, guide: tex, rect: [0, 0, 1, 1], mode, same: false });
    }
    let top = 0;
    const inSubject = [];
    for (let i = 0; i < w * h; i++) { top = Math.max(top, maps.height[i]); if (maps.subject[i] > 0.5) inSubject.push(maps.height[i]); }
    // Where a lens would focus (postfx.js blur): the back of the subject (the tenth of its heights
    // furthest back), everything behind it softer; without a subject, near the front.
    inSubject.sort((x, y) => x - y);
    const focus = inSubject.length > 0.005 * w * h ? inSubject[Math.floor(inSubject.length * 0.1)] : 0.8 * top;
    l = { key, a, b, lowA, lowB, maps, w: W, h: H, top: Math.max(top, 1e-3), focus };
    this.levels.unshift(l);
    while (this.levels.length > 2) { const old = this.levels.pop(); for (const t of [old.a, old.b]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } gl.deleteTexture(old.lowA); gl.deleteTexture(old.lowB); }
    bindTarget(gl, null);
    return l;
  }

  /**
   * Where things stand, for placing lights (scenelights.js): the subject's anchor (x, y as
   * fractions of the width and height, y up; a portrait's is its head, the top of the figure),
   * how far forward it is (front, image widths), the scene's tallest point (top), the room's back
   * wall, the type and the picture's aspect (height / width). Without a subject, the middle.
   */
  describe(sc) {
    const l = this.level(sc), m = l.maps, { w, h } = m;
    let n = 0, sx = 0, sy = 0, y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m.subject[y * w + x] > 0.5) { n++; sx += x; sy += y; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    let ax = 0.5 * w, ay = 0.5 * h;
    if (n > 0.005 * w * h) {
      ax = sx / n; ay = sy / n;
      if (sc.type === 'portrait') {
        // The head: the subject's top fifth of the frame or its top third, whichever is less.
        const cut = y0 + Math.min(0.2 * h, (y1 - y0) / 3);
        let k = 0, kx = 0, ky = 0;
        for (let y = y0; y <= cut; y++) for (let x = 0; x < w; x++) if (m.subject[y * w + x] > 0.5) { k++; kx += x; ky += y; }
        if (k) { ax = kx / k; ay = ky / k; }
      }
    }
    const at = Math.min(h - 1, Math.round(ay)) * w + Math.min(w - 1, Math.round(ax));
    return { type: sc.type, aspect: this.photo.canvas.height / this.photo.canvas.width, subject: { x: (ax + 0.5) / w, y: 1 - (ay + 0.5) / h, found: n > 0.005 * w * h },
      front: m.height[at], top: l.top, wall: sc.type === 'room' ? m.wall : null, horizon: m.horizon };
  }

  /** What GBuffer.build needs for scene settings `sc` (its `sceneMap` option, rect added there):
   *  run(targetA, targetB, guide, rect) carries level 1 up to a tile, its own texels where the
   *  tile's pixels are level 1's (the preview, an export at the preview's size). */
  source(sc) {
    const l = this.level(sc);
    return { a: l.a.tex, b: l.b.tex, w: l.w, h: l.h, top: l.top, focus: l.focus, run: (ta, tb, guide, rect) => {
      const x0 = rect[0] * l.w, y0 = rect[1] * l.h, same = Math.abs((rect[2] - rect[0]) * l.w - ta.w) < 1e-6 && Math.abs((rect[3] - rect[1]) * l.h - ta.h) < 1e-6
        && Math.abs(x0 - Math.round(x0)) < 1e-6 && Math.abs(y0 - Math.round(y0)) < 1e-6;
      for (const [target, mode] of [[ta, 0], [tb, 1]]) this.run(target, { lowA: l.a.tex, lowB: l.b.tex, lowGuide: this.photo.tex, guide, rect, mode, same, offset: [Math.round(x0), Math.round(y0)] });
    } };
  }

  run(target, { lowA, lowB, lowGuide, guide, rect, mode, same, offset = [0, 0] }) {
    const { gl } = this.glctx, p = this.prog;
    bindTarget(gl, target);
    gl.useProgram(p.program);
    bindTextures(gl, p, [['uLowA', lowA], ['uLowB', lowB], ['uLowGuide', lowGuide], ['uGuide', guide]]);
    gl.uniform4f(p.uniforms.uRect, ...rect);
    gl.uniform1i(p.uniforms.uMode, mode);
    gl.uniform1f(p.uniforms.uSame, same ? 1 : 0);
    gl.uniform2i(p.uniforms.uOffset, offset[0], offset[1]);
    gl.uniform1f(p.uniforms.uRange, RANGE);
    drawFullscreen(gl);
  }
}

function nearest(gl) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
// RGBA16F from rows top first; uploads flip (gl.js UNPACK_FLIP_Y), so v = 0 is the bottom row,
// as for the photo's own textures.
function floatTexture(gl, w, h, data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  nearest(gl);
  return t;
}

// postfx.js — the effects that look at their neighbours, after the shading pass (fx.js): glow
// (bright light blooming, as in a lens) and background blur (a wide-open lens, from the scene's
// depth).
//
// Shader.draw runs them when either is on: the shading pass then draws into a target here, not
// the screen or the export tile, stopping short of its finish; these passes follow, and the last
// draws the finished picture (glsl.js finish: overlays, Original on top) where the shading pass
// would have. Sizes are shares of the picture's width, so the preview, the sharp zoom and every
// export tile (padded by fxMargin) draw the same picture.
//   blur   at half size: each pixel gathers from a disc as wide as its own blur, taking only the
//          samples whose own blur reaches it, so the sharp subject never bleeds into the soft
//          background behind it; the finish mixes it in by how far behind the subject a pixel is.
//   glow   the bright part (over From), in linear light, made small (a half to an eighth) and
//          blurred there, then added back in linear light.
import { program, makeTarget, bindTarget, bindTextures, drawFullscreen } from './gl.js';
import { BLEND_GLSL, PHOTO_GLSL, FINISH_GLSL } from './glsl.js';
import { OVERLAY_GLSL, setOverlayUniforms } from './overlays.js';
import { fxShown } from './fx.js';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
`;
const LIN = `
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
`;
// How far behind the subject a point is (0 on the subject and nearer, 1 far behind), times the
// blur Amount: its circle of confusion, 0..1. The subject itself is in focus all over.
const COC = `
uniform sampler2D uScene;   // behind, front, subject, sky (scene.js)
uniform float uFocus;       // the back of the subject (image widths): sharp there and nearer
uniform float uBlurAmount;
float coc(vec2 uv) {
  vec4 s = texture(uScene, uv);
  return clamp((uFocus - mix(s.x, s.y, s.z)) / max(uFocus, 1e-3), 0.0, 1.0) * (1.0 - s.z) * uBlurAmount;
}
`;

const BLUR_FS = `${HEAD}${LIN}${COC}
uniform sampler2D uSrc;     // the shaded picture (display values)
uniform float uRadius;      // the most blur, in pixels of uSrc
vec3 linearToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() {
  vec2 px = 1.0 / vec2(textureSize(uSrc, 0));
  float r0 = coc(vUV) * uRadius;
  vec3 sum = srgbToLinear(texture(uSrc, vUV).rgb);
  float wsum = 1.0;
  if (r0 >= 0.75) {
    // A Vogel disc of 40 samples as wide as this pixel's blur; each counts as far as its own blur
    // reaches here (scatter as gather), so what is sharp stays where it is.
    for (int i = 0; i < 40; i++) {
      float f = (float(i) + 0.5) / 40.0, r = sqrt(f) * r0, a = float(i) * 2.39996323;
      vec2 uv = vUV + vec2(cos(a), sin(a)) * r * px;
      float w = smoothstep(r - 1.5, r + 0.5, coc(uv) * uRadius);
      sum += w * srgbToLinear(texture(uSrc, uv).rgb);
      wsum += w;
    }
  }
  outColor = vec4(linearToSrgb(sum / wsum), 1.0);
}`;

// The bright part of the picture in linear light, averaged over the 4 × 4 bilinear taps that
// cover this smaller pixel's footprint (uScale source pixels across).
const BRIGHT_FS = `${HEAD}${LIN}
uniform sampler2D uSrc;
uniform float uFrom;
uniform float uScale;
void main() {
  vec2 px = 1.0 / vec2(textureSize(uSrc, 0));
  vec3 sum = vec3(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 o = (vec2(float(x), float(y)) - 1.5) * uScale * 0.25;
    vec3 c = srgbToLinear(texture(uSrc, vUV + o * px).rgb);
    float y0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
    sum += c * smoothstep(uFrom, mix(uFrom, 1.0, 0.5) + 0.02, y0);
  }
  outColor = vec4(sum / 16.0, 1.0);
}`;

const GAUSS_FS = `${HEAD}
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform float uSigma;
void main() {
  float s = max(uSigma, 1e-3), k = 1.0 / (2.0 * s * s);
  vec4 sum = texture(uSrc, vUV);
  float wsum = 1.0;
  for (int i = 1; i <= 48; i++) {
    float fi = float(i);
    if (fi > s * 3.0) break;
    float w = exp(-fi * fi * k);
    sum += w * (texture(uSrc, vUV + uStep * fi) + texture(uSrc, vUV - uStep * fi));
    wsum += 2.0 * w;
  }
  outColor = sum / wsum;
}`;

const FINAL_FS = `${HEAD}${LIN}${COC}
uniform sampler2D uSrc;       // the shaded picture (display)
uniform sampler2D uBlurred;   // it, background-blurred at half size
uniform sampler2D uGlow;      // its glow, linear, smaller
uniform float uBlurOn;
uniform float uGlowAmount;
uniform sampler2D uLin;
uniform sampler2D uLayerMask;
uniform vec4  uMaskOverlay;
uniform float uOriginalTop;
uniform float uAspect;
uniform vec2  uUVOffset;
uniform vec2  uUVScale;
${BLEND_GLSL}
${PHOTO_GLSL}
${OVERLAY_GLSL}
${FINISH_GLSL}
void main() {
  vec2 gUV = uUVOffset + vUV * uUVScale;
  vec3 col = texture(uSrc, vUV).rgb;
  if (uBlurOn > 0.5) col = mix(col, texture(uBlurred, vUV).rgb, smoothstep(0.02, 0.2, coc(vUV)));
  if (uGlowAmount > 0.0) col = clamp(linearToSrgb(srgbToLinear(col) + texture(uGlow, vUV).rgb * uGlowAmount), 0.0, 1.0);
  outColor = vec4(finish(col, gUV, texture(uLayerMask, gUV)), 1.0);
}`;

/** Glow or background blur is on for this state (the relit view, a picture being drawn). */
export function postWanted(state) {
  return state.viewMode === 0 && (fxShown(state, 'glow') || fxShown(state, 'blur'));
}

/** Pixels an export tile must be padded by for them, at W pixels for the picture's width. */
export function fxMargin(state, W) {
  if (state.viewMode !== 0 && state.viewMode != null) return 0;
  const f = state.fx;
  let m = 0;
  if (fxShown(state, 'blur')) m = Math.max(m, f.blur.size * W);
  if (fxShown(state, 'glow')) m = Math.max(m, 3 * f.glow.size * W);
  return m ? Math.ceil(m) + 4 : 0;
}

export class PostFX {
  constructor(glctx) {
    this.glctx = glctx;
    const { gl } = glctx;
    this.progs = { blur: program(gl, BLUR_FS, 'fx-blur'), bright: program(gl, BRIGHT_FS, 'fx-bright'), gauss: program(gl, GAUSS_FS, 'fx-gauss'), final: program(gl, FINAL_FS, 'fx-final') };
    this.targets = {};
  }

  // A target of this size kept between draws (made again when the size changes).
  target(name, w, h, float) {
    const { gl, caps } = this.glctx;
    let t = this.targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    t = this.targets[name] = makeTarget(gl, w, h, { float, linear: true, caps });
    return t;
  }

  /** Where the shading pass draws first: a viewW x viewH target. */
  source(w, h) { return this.target('shaded', w, h, false); }

  /**
   * The effects on `src` (the shading pass's output), finished into the framebuffer `out` (null:
   * the canvas). `W`: the whole picture's width in pixels at this render's scale (a tile's share
   * of it set by tile.sx). `finish`: the shading pass's finish values (originalTop, maskOverlay,
   * layerMask, lin) and its tile.
   */
  run({ src, w, h, state, sceneTex, out, finish }) {
    const { gl } = this.glctx, p = this.progs, f = state.fx, t = finish.tile;
    const W = w / t.sx;
    const blur = fxShown(state, 'blur') && !!sceneTex, glow = fxShown(state, 'glow');
    const focus = state.sceneMap?.focus ?? 0;
    const setCoc = (u) => { gl.uniform1f(u.uFocus, focus); gl.uniform1f(u.uBlurAmount, blur ? f.blur.amount : 0); };
    let blurred = src, glowed = src;
    if (blur) {
      const b = this.target('blur', Math.ceil(w / 2), Math.ceil(h / 2), false);
      bindTarget(gl, b); gl.useProgram(p.blur.program);
      bindTextures(gl, p.blur, [['uSrc', src.tex], ['uScene', sceneTex]]);
      setCoc(p.blur.uniforms); gl.uniform1f(p.blur.uniforms.uRadius, f.blur.size * W);
      drawFullscreen(gl);
      blurred = b;
    }
    if (glow) {
      // Small enough that the blur is at most 16 of its pixels: a half, a quarter or an eighth.
      const sigma = f.glow.size * W, k = Math.min(8, Math.max(2, 2 ** Math.ceil(Math.log2(sigma / 16))));
      const a = this.target('glowA', Math.ceil(w / k), Math.ceil(h / k), true), b2 = this.target('glowB', a.w, a.h, true);
      bindTarget(gl, a); gl.useProgram(p.bright.program);
      bindTextures(gl, p.bright, [['uSrc', src.tex]]);
      gl.uniform1f(p.bright.uniforms.uFrom, f.glow.from); gl.uniform1f(p.bright.uniforms.uScale, k);
      drawFullscreen(gl);
      for (const [from, to, step] of [[a, b2, [1 / a.w, 0]], [b2, a, [0, 1 / a.h]]]) {
        bindTarget(gl, to); gl.useProgram(p.gauss.program);
        bindTextures(gl, p.gauss, [['uSrc', from.tex]]);
        gl.uniform2f(p.gauss.uniforms.uStep, step[0], step[1]); gl.uniform1f(p.gauss.uniforms.uSigma, sigma / k);
        drawFullscreen(gl);
      }
      glowed = a;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, out);
    gl.viewport(0, 0, w, h);
    const u = p.final.uniforms;
    gl.useProgram(p.final.program);
    bindTextures(gl, p.final, [['uSrc', src.tex], ['uBlurred', blurred.tex], ['uGlow', glowed.tex], ['uScene', sceneTex || src.tex],
      ['uLin', finish.lin], ['uLayerMask', finish.layerMask]]);
    setCoc(u);
    gl.uniform1f(u.uBlurOn, blur ? 1 : 0);
    gl.uniform1f(u.uGlowAmount, glow ? f.glow.amount * 2 : 0);
    gl.uniform4fv(u.uMaskOverlay, finish.maskOverlay);
    gl.uniform1f(u.uOriginalTop, finish.originalTop);
    gl.uniform1f(u.uAspect, finish.aspect);
    gl.uniform2f(u.uUVOffset, t.ox, t.oy);
    gl.uniform2f(u.uUVScale, t.sx, t.sy);
    setOverlayUniforms(gl, u, state, false);
    drawFullscreen(gl);
  }
}

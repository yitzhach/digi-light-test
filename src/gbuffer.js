// gbuffer.js — derive surface data from a single flat-lit photograph.
//
// CORRECTED PIPELINE. The obvious formulation — high-pass the luminance, treat the
// result as a height field, differentiate it to get normals — does not work, and
// it is worth being precise about why, because it looks right.
//
// Under a light with azimuth â, Lambertian shading of a height field h is
//
//     I  ≈  N·L  ≈  Lz − (∂h/∂x·Lx + ∂h/∂y·Ly)   =  Lz − |Lxy|·(∂h/∂â)
//
// so the high-passed luminance is proportional to a *derivative* of the surface,
// not to the surface. Treating it as height and differentiating again yields the
// second derivative, which correlates with the true normals at r ≈ 0.0 — measured,
// not assumed (see tools/validate.mjs). The recovered field traces the brushwork
// convincingly enough to fool the eye, which is exactly what makes the error
// dangerous: it produces plausible relief that is not the relief that is there.
//
// The fix is to integrate rather than differentiate. Walking back along â and
// accumulating −s reconstructs a height field whose gradient does correlate with
// truth (r ≈ 0.74 along the azimuth under a raking source).
//
// Two consequences fall out of the same algebra and both are load-bearing:
//
//   1. Only the slope component ALONG â is recoverable. The perpendicular
//      component is unconstrained — the shape-from-shading ambiguity, appearing
//      at relief scale rather than at form scale. One photograph buys half the
//      surface. A second shot with the light moved buys the other half, which is
//      the real argument for the photometric-stereo path.
//
//   2. A properly executed archival copy shot — two matched lights at equal and
//      opposite angles — cancels the first-order term almost exactly. That
//      geometry exists precisely to suppress texture. Measured recovery on such
//      a source is r ≈ 0.00: the better the repro photography, the less relief
//      survives to be found.
//
// The remaining caveat is unchanged: high-frequency luminance is also produced by
// paint colour changing, which is albedo, not geometry. Relief shading is
// achromatic because it scales every channel together, whereas a pigment change
// usually shifts hue — so where hue moves at fine scale, the chroma-reject term
// below down-weights the contribution.
//
// EVEN-LIGHT ESTIMATE. The directional model above has nothing to work with when
// the photograph was lit evenly, which is how most paintings are photographed.
// Even light still leaves a signal, just a different one: recesses see less of
// the surrounding light than crests do, so they photograph darker. Read that way
// the band-passed luminance is itself a (rough) height, with no integration and
// no preferred direction. It is a heuristic — dark pigment also reads as low —
// so the two estimates are blended by how the photo was lit (`photoDiffuse`).
//
// CALIBRATION. Both estimates are in arbitrary units. Each is normalised so its
// 2nd–98th percentile spread is 1; the caller then scales that unit to the
// texture depth the user enters, in millimetres, so shading and cast shadows
// come from one physically sized height field instead of two unrelated gains.

import { program, makeTarget, bindTarget, bindTextures, drawFullscreen } from './gl.js';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
`;

// sRGB -> linear. All surface maths must happen in linear light or the gradients
// are wrong by the transfer curve, which shows up as relief that reads too hard
// in the shadows and too soft in the highlights.
const SRGB = `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float luma(vec3 lin) { return dot(lin, vec3(0.2126, 0.7152, 0.0722)); }
`;

const LUMA_FS = `${HEAD}${SRGB}
uniform sampler2D uSrc;
void main() {
  vec3 lin = srgbToLinear(texture(uSrc, vUV).rgb);
  outColor = vec4(lin, luma(lin));
}`;

// Separable Gaussian. The radius is a uniform rather than a compile-time constant
// so the relief-scale control is live; taps beyond the radius get zero weight.
const MAX_TAPS = 48;
// Below a third of a texel the blur has no taps left: the graze uses the relief as is.
const GRAZE_MIN_SIGMA = 1 / 3;
const BLUR_FS = `${HEAD}
uniform sampler2D uSrc;
uniform vec2 uStep;      // texel-sized step along the blur axis
uniform float uSigma;
void main() {
  float sigma = max(uSigma, 1e-3);
  float inv2s2 = 1.0 / (2.0 * sigma * sigma);
  vec4 sum = texture(uSrc, vUV);
  float wsum = 1.0;
  float stride = max(1.0, ceil(sigma * 3.0 / 48.0));
  for (int i = 1; i <= ${MAX_TAPS}; i++) {
    float fi = float(i) * stride;
    if (fi > sigma * 3.0) break;
    float w = exp(-fi * fi * inv2s2);
    sum += w * (texture(uSrc, vUV + uStep * fi) + texture(uSrc, vUV - uStep * fi));
    wsum += 2.0 * w;
  }
  outColor = sum / wsum;
}`;

// Slope field: the achromatic fine-scale residual of luminance, which by the
// relation above is proportional to ∂h/∂â — a slope, not a height.
const SLOPE_FS = `${HEAD}
uniform sampler2D uLin;    // linear rgb + luma
uniform sampler2D uBlur;   // blurred linear rgb + luma
uniform sampler2D uFine;
uniform sampler2D uBroad;
uniform vec3 uBands;
uniform float uChromaReject;
void main() {
  vec4 a = texture(uLin, vUV);
  vec4 b = texture(uBlur, vUV);
  float L = max(a.a, 1e-4);
  float Lb = max(b.a, 1e-4);

  // Work on the log ratio, not the difference: relief shading is *multiplicative*
  // on albedo, so a ratio makes the recovered height independent of how light or
  // dark the paint underneath happens to be. Without this, relief in dark passages
  // comes out flat and relief in light passages comes out exaggerated.
  float Lf = max(texture(uFine, vUV).a, 1e-4);
  float Lc = max(texture(uBroad, vUV).a, 1e-4);
  float h = uBands.x * log(L / Lf) + uBands.y * log(Lf / Lb) + uBands.z * log(Lb / Lc);
  // Even-light reading of the same bands. The broad band is left out on purpose:
  // in soft light a busy impasto passage photographs darker overall even though it
  // stands higher, so beyond stroke scale brightness stops meaning height (measured
  // on the synthetic soft-light rig: including it turns the correlation negative).
  float hEven = uBands.x * log(L / Lf) + uBands.y * log(Lf / Lb);

  // Chroma reject: compare the fine-scale hue against the local average hue.
  // A pure shading change leaves chromaticity untouched; a pigment change moves it.
  vec3 chromaA = a.rgb / L;
  vec3 chromaB = b.rgb / Lb;
  float hueShift = length(chromaA - chromaB);
  float w = 1.0 - uChromaReject * smoothstep(0.02, 0.25, hueShift);

  outColor = vec4(h * w, hueShift, hEven * w, 1.0);
}`;

// Directional integration: reconstruct height by accumulating −slope backwards
// along the source azimuth. The linear taper band-limits the integral, which
// both suppresses the unbounded DC drift a raw running sum would accumulate and
// keeps the result at the relief scale we actually care about.
const INTEGRATE_FS = `${HEAD}
uniform sampler2D uSlope;
uniform vec2 uTexel;
uniform vec2 uAzimuth;     // unit vector, the direction the original light came from
uniform float uTaps;
void main() {
  float acc = 0.0;
  float total = 0.0;
  float stride = max(1.0, uTaps / 32.0);
  for (int i = 1; i <= 32; i++) {
    float t = float(i) * stride;
    if (t > uTaps) break;
    vec2 suv = vUV - uAzimuth * uTexel * t;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
    float wt = 1.0 - (t - 1.0) / uTaps;
    acc += -texture(uSlope, suv).r * wt;
    total += wt;
  }
  // g: the even-light estimate, read straight off the band-passed luminance.
  outColor = vec4(total > 0.0 ? acc / total : 0.0, texture(uSlope, vUV).b, 0.0, 1.0);
}`;

// Point-sample both height estimates on a scattered grid, so their spread can be
// measured on the CPU from a few thousand values instead of a full readback.
const SAMPLE_FS = `${HEAD}
uniform sampler2D uHeight;
uniform vec2 uSize;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 jitter = vec2(hash(cell), hash(cell + 17.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 + jitter) / uSize;
  outColor = texture(uHeight, uv);
}`;

// Normals by central difference on the height field. Sobel would be smoother but
// central difference keeps single-bristle detail that Sobel averages away, and
// bristle detail is the entire point of this exercise.
const NORMAL_FS = `${HEAD}
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uStrength;
uniform vec3 uMix;   // x: directional scale, y: even-light scale, z: even-light share
float heightAt(vec2 uv) {
  vec2 e = texture(uHeight, uv).rg;
  return mix(e.r * uMix.x, e.g * uMix.y, uMix.z);
}
void main() {
  float l = heightAt(vUV - vec2(uTexel.x, 0.0));
  float r = heightAt(vUV + vec2(uTexel.x, 0.0));
  float d = heightAt(vUV - vec2(0.0, uTexel.y));
  float u = heightAt(vUV + vec2(0.0, uTexel.y));

  // dh/dx and dh/dy scaled into a slope. +Y is up because the source texture was
  // uploaded flipped, so the shading space and the light-handle space agree.
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  outColor = vec4(n * 0.5 + 0.5, heightAt(vUV));
}`;

// Albedo: divide the fine-scale shading back out, so the relight does not
// double-count light that is already baked into the photograph.
const ALBEDO_FS = `${HEAD}
uniform sampler2D uLin;
uniform sampler2D uBlur;
uniform float uSuppress;
uniform sampler2D uBroad;
uniform float uNeutralize;
uniform float uMeanLuma;
void main() {
  vec4 a = texture(uLin, vUV);
  vec4 b = texture(uBlur, vUV);
  float L = max(a.a, 1e-4);
  float Lb = max(b.a, 1e-4);
  float ratio = clamp(Lb / L, 0.25, 4.0);
  float broad = max(texture(uBroad, vUV).a, 0.02);
  float neutral = mix(1.0, clamp(uMeanLuma / broad, 0.5, 2.0), uNeutralize);
  outColor = vec4(a.rgb * mix(1.0, ratio, uSuppress) * neutral, 1.0);
}`;

export class GBuffer {
  constructor(glctx) {
    this.glctx = glctx;
    const { gl } = glctx;
    this.progs = {
      luma: program(gl, LUMA_FS, 'luma'),
      blur: program(gl, BLUR_FS, 'blur'),
      slope: program(gl, SLOPE_FS, 'slope'),
      integrate: program(gl, INTEGRATE_FS, 'integrate'),
      normal: program(gl, NORMAL_FS, 'normal'),
      sample: program(gl, SAMPLE_FS, 'sample'),
      albedo: program(gl, ALBEDO_FS, 'albedo'),
    };
    this.targets = null;
    this.size = { w: 0, h: 0 };
    this.sampleTarget = null;
    // Spread of each estimate from the last measured build; reused by export tiles,
    // which must be scaled exactly like the preview rather than measured alone.
    this.heightStats = { dir: 1, cav: 1 };
  }

  /**
   * Robust spread (2nd–98th percentile) of both height estimates. Read back from
   * a 128x128 scattered sample, which is plenty for two percentiles and keeps the
   * readback small enough to run on every surface rebuild.
   */
  measureHeight(heightTex) {
    const { gl, caps } = this.glctx;
    const N = 128;
    if (!this.sampleTarget) this.sampleTarget = makeTarget(gl, N, N, { float: true, linear: false, caps });
    bindTarget(gl, this.sampleTarget);
    gl.useProgram(this.progs.sample.program);
    bindTextures(gl, this.progs.sample, [['uHeight', heightTex]]);
    gl.uniform2f(this.progs.sample.uniforms.uSize, N, N);
    drawFullscreen(gl);
    const px = new Float32Array(N * N * 4);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, px);
    const spread = (ch) => {
      const v = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) v[i] = px[i * 4 + ch];
      v.sort();
      return v[Math.floor(N * N * 0.98)] - v[Math.floor(N * N * 0.02)];
    };
    const dir = spread(0), cav = spread(1);
    // A blank image has no spread; keep the scale finite rather than amplifying noise.
    return { dir: Math.max(dir, 1e-4), cav: Math.max(cav, 1e-4) };
  }

  resize(w, h) {
    if (this.size.w === w && this.size.h === h) return;
    const { gl, caps } = this.glctx;
    if (this.targets) {
      // A Set, because T.graze may be T.normal itself.
      for (const t of new Set(Object.values(this.targets))) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
    }
    const mk = () => makeTarget(gl, w, h, { float: true, caps });
    this.targets = { lin: mk(), tmp: mk(), blur: mk(), fine: mk(), broad: mk(), slope: mk(), height: mk(), normal: mk(), albedo: mk() };
    this.grazeSigma = -1;
    this.size = { w, h };
  }

  /**
   * Rebuild every derived map. Called only when the source image or a surface
   * parameter changes — never per frame, which is what keeps light dragging cheap.
   */
  build(srcTex, w, h, opts) {
    const { gl } = this.glctx;
    const { reliefScale, reliefStrength, chromaReject, albedoSuppress,
            azimuthDeg, integrateTaps } = opts;
    this.resize(w, h);
    const T = this.targets;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    const run = (prog, target, textures, setUniforms) => pass(gl, prog, target, textures, setUniforms);

    run(this.progs.luma, T.lin, [['uSrc', srcTex]]);

    // Two-pass separable blur; sigma is the relief scale in pixels.
    run(this.progs.blur, T.tmp, [['uSrc', T.lin.tex]], (u) => {
      gl.uniform2f(u.uStep, 1 / w, 0);
      gl.uniform1f(u.uSigma, reliefScale);
    });
    run(this.progs.blur, T.blur, [['uSrc', T.tmp.tex]], (u) => {
      gl.uniform2f(u.uStep, 0, 1 / h);
      gl.uniform1f(u.uSigma, reliefScale);
    });

    for (const [target, sigma] of [[T.fine, Math.max(0.5, reliefScale * 0.4)], [T.broad, reliefScale * 4]]) {
      run(this.progs.blur, T.tmp, [['uSrc', T.lin.tex]], (u) => {
        gl.uniform2f(u.uStep, 1 / w, 0); gl.uniform1f(u.uSigma, sigma);
      });
      run(this.progs.blur, target, [['uSrc', T.tmp.tex]], (u) => {
        gl.uniform2f(u.uStep, 0, 1 / h); gl.uniform1f(u.uSigma, sigma);
      });
    }
    run(this.progs.slope, T.slope, [['uLin', T.lin.tex], ['uBlur', T.blur.tex], ['uFine', T.fine.tex], ['uBroad', T.broad.tex]], (u) => {
      gl.uniform1f(u.uChromaReject, chromaReject);
      gl.uniform3f(u.uBands, opts.fineRelief ?? 1, opts.mediumRelief ?? 1, opts.broadRelief ?? 0.15);
    });

    const az = (azimuthDeg * Math.PI) / 180;
    run(this.progs.integrate, T.height, [['uSlope', T.slope.tex]], (u) => {
      gl.uniform2f(u.uTexel, 1 / w, 1 / h);
      gl.uniform2f(u.uAzimuth, Math.cos(az), Math.sin(az));
      gl.uniform1f(u.uTaps, integrateTaps);
    });

    // Test seam: lets a harness replace the estimated heights (e.g. with a synthetic
    // painting's known relief) so everything downstream is built from them.
    if (this.afterHeight) this.afterHeight(T, w, h);

    // Calibrated mode measures the preview and reuses that spread for export tiles;
    // legacy mode keeps the raw directional estimate exactly as it always was.
    if (opts.measureHeight) this.heightStats = this.measureHeight(T.height.tex);
    const calibrated = !!opts.physical;
    const stats = !calibrated ? { dir: 1, cav: 1 }
      : opts.measureHeight ? this.heightStats : (opts.heightStats || this.heightStats);
    const share = Math.min(1, Math.max(0, opts.photoDiffuse ?? 0));
    // Kept so the graze relief can be rebuilt alone with exactly these normals.
    this.normalMix = { strength: reliefStrength, mix: [1 / stats.dir, 1 / stats.cav, share] };
    run(this.progs.normal, T.normal, [['uHeight', T.height.tex]], (u) => this.normalUniforms(u, w, h));

    run(this.progs.albedo, T.albedo, [['uLin', T.lin.tex], ['uBlur', T.blur.tex], ['uBroad', T.broad.tex]], (u) => {
      gl.uniform1f(u.uSuppress, albedoSuppress);
      gl.uniform1f(u.uNeutralize, opts.neutralize ?? 0);
      gl.uniform1f(u.uMeanLuma, opts.meanLuma ?? 0.25);
    });

    this.grazeSigma = -1;
    this.buildGraze(opts.grazeSigmaPx ?? 0);
    bindTarget(gl, null);
    return T;
  }

  // Shared by the relief normals and the graze light's smoothed ones.
  normalUniforms(u, w, h) {
    const { gl } = this.glctx, m = this.normalMix;
    gl.uniform2f(u.uTexel, 1 / w, 1 / h);
    gl.uniform1f(u.uStrength, m.strength);
    gl.uniform3f(u.uMix, m.mix[0], m.mix[1], m.mix[2]);
  }

  /**
   * The graze light's own view of the relief: the height field low-passed by a
   * Gaussian of `sigma` pixels, with normals taken from that. A light a degree or
   * two off the wall multiplies every slope by 1/tan(angle), so the finest band of
   * a single-photo estimate (paint grain, pigment mottle, sensor noise) turns into
   * a leopard-spot pattern of glints and tiny shadows; this keeps the graze to the
   * forms big enough to be real. T.graze is what the shading pass reads: the full
   * relief itself when there is nothing to smooth. Reruns alone (a blur and a
   * normal pass, nothing else) when only the graze Detail changes.
   */
  buildGraze(sigma) {
    const { gl } = this.glctx, T = this.targets;
    if (!T || sigma === this.grazeSigma) return T;
    this.grazeSigma = sigma;
    if (!(sigma >= GRAZE_MIN_SIGMA)) { T.graze = T.normal; return T; }
    const { w, h } = this.size;
    // Made on first use, so a session that never grazes carries no extra targets.
    if (!T.grazeNormal) {
      const mk = () => makeTarget(gl, w, h, { float: true, caps: this.glctx.caps });
      Object.assign(T, { grazeHeight: mk(), grazeNormal: mk() });
    }
    // A wide blur (a large export) runs in two stages whose variances add: an exact
    // one of at most 16 texels, then the rest at the blur's own stride, which can no
    // longer let pixel-scale grain through once the first stage has removed it.
    const s1 = Math.min(sigma, 16), s2 = Math.sqrt(Math.max(0, sigma * sigma - s1 * s1));
    let src = T.height;
    for (const s of s2 > 0.5 ? [s1, s2] : [s1]) {
      pass(gl, this.progs.blur, T.tmp, [['uSrc', src.tex]], (u) => { gl.uniform2f(u.uStep, 1 / w, 0); gl.uniform1f(u.uSigma, s); });
      pass(gl, this.progs.blur, T.grazeHeight, [['uSrc', T.tmp.tex]], (u) => { gl.uniform2f(u.uStep, 0, 1 / h); gl.uniform1f(u.uSigma, s); });
      src = T.grazeHeight;
    }
    pass(gl, this.progs.normal, T.grazeNormal, [['uHeight', T.grazeHeight.tex]], (u) => this.normalUniforms(u, w, h));
    bindTarget(gl, null);
    T.graze = T.grazeNormal;
    return T;
  }
}

function pass(gl, prog, target, textures, setUniforms) {
  bindTarget(gl, target);
  gl.useProgram(prog.program);
  bindTextures(gl, prog, textures);
  if (setUniforms) setUniforms(prog.uniforms);
  drawFullscreen(gl);
}

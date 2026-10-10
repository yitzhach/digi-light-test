// shade.js — the per-frame pass. Everything above it is precomputed once per
// image; this runs on every slider tick, so it has to stay cheap.
//
// Physically-based rather than "a gradient that looks lit": Cook-Torrance GGX in
// linear light, inverse-square falloff, real spot cones, and a horizon-march
// against the height field so raised paint shadows the paint beside it. That last
// term is the one the depth-map competitors structurally cannot do.
//
// Every light also has a physical SIZE (radius, in painting widths). Size is what
// separates a spotlight from diffused light: a small source casts a hard edge, a
// softbox or window casts a wide penumbra, wraps light round the relief and
// spreads its highlight. The penumbra is angular — the source's angular radius
// seen from the surface — so the same lamp gives softer shadows as it comes closer.

import { program, bindTextures, drawFullscreen, bindTarget } from './gl.js';
import { blendModes, layerSources, MAX_LAYERS, GRAZE_DISTANCE, GRAZE_SIZE, GRAZE_AMBIENT, GRAZE_FINE_DEG, grazePower } from './presets.js';
import { kelvinToLinearRGB } from './kelvin.js';

const GRAZE_RGB = kelvinToLinearRGB(5000);

const B = Object.fromEntries(blendModes.map(([k], i) => [k, i]));

export const MAX_LIGHTS = 8;

const SHADE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uAlbedo;
uniform sampler2D uNormal;   // rgb = normal, a = height
uniform sampler2D uLin;      // original linear colour, for the before/after view
uniform sampler2D uMask;
uniform float uMetallic;
uniform float uShadowSoftness;
uniform float uHighlightRolloff;
uniform float uSplit;

uniform int   uLightCount;
uniform vec3  uLightPos[${MAX_LIGHTS}];
uniform vec3  uLightColor[${MAX_LIGHTS}];
uniform float uLightPower[${MAX_LIGHTS}];
uniform float uLightCone[${MAX_LIGHTS}];     // 0 = flood, 1 = tight spot
uniform float uLightEnabled[${MAX_LIGHTS}];
uniform float uLightSoftness[${MAX_LIGHTS}];
uniform float uLightFalloff[${MAX_LIGHTS}];
uniform vec2 uLightAim[${MAX_LIGHTS}];
uniform float uLightSize[${MAX_LIGHTS}];     // source radius, in painting widths

uniform float uAspect;
uniform vec2  uUVOffset;   // where this tile sits in the full image
uniform vec2  uUVScale;    // how much of the full image this tile covers
uniform float uShadowDist; // longest march, in whole-image UV units
uniform float uHeightReach; // tallest rise worth marching for, same units as heights
uniform float uTexelGlobal; // one full-image texel, in painting widths
uniform float uAOScale;
uniform float uHeightView;
uniform float uAmbient;
uniform vec3  uAmbientColor;
uniform float uRoughness;
uniform float uSpecular;
uniform float uReliefAmount;
uniform float uHeightScale;
uniform float uShadow;
uniform float uAO;
uniform float uExposure;
uniform int   uViewMode;     // 0 relit, 1 normals, 2 height, 3 albedo, 4 original, 6 shadows

uniform int   uLayerCount;
uniform int   uLayerMode[${MAX_LAYERS}];
uniform int   uLayerSource[${MAX_LAYERS}];   // 0 original photo, 1 relit image
uniform float uLayerOpacity[${MAX_LAYERS}];
uniform sampler2D uLayerMask;                 // one channel per layer slot, white = applies
uniform vec4  uLayerSel[${MAX_LAYERS}];      // picks this layer's channel from uLayerMask
uniform vec4  uMaskOverlay;                   // while painting a mask: tint where it hides

// Graze effect: one extra hard light almost in the painting's plane, rendered on its
// own and cross-faded over the main lighting by uGrazeOpacity (0 = off).
uniform vec3  uGrazePos;
uniform vec3  uGrazeColor;     // colour times power
uniform float uGrazeOpacity;
uniform sampler2D uGrazeNormal; // its own relief, smoothed to the graze Detail: rgb normal, a height
uniform float uGrazeFine;       // share of the finer relief put back into its shading (no shadows)

const float PI = 3.14159265359;
const int SHADOW_STEPS = 32;
const int SHADOW_STEPS_MAX = 96;

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

// Height-correlated Smith visibility (Heitz). Pairs with D_GGX above; using the
// uncorrelated form here is the usual source of specular that looks too bright
// at grazing angles, which on a varnished painting is exactly where you look.
float V_SmithGGX(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-7);
}

vec3 F_Schlick(float u, vec3 f0) {
  float f = pow(1.0 - u, 5.0);
  return f0 + (1.0 - f0) * f;
}

float sampleHeight(sampler2D relief, vec2 uv) {
  vec2 globalUV = uUVOffset + uv * uUVScale;
  return texture(relief, uv).a * uHeightScale * uReliefAmount * (texture(uMask, globalUV).r * 2.0);
}

/**
 * Horizon march: step along the light's planar direction and find the highest
 * horizon. The shadow is then the visible fraction of a source with angular
 * radius "penumbra" sitting at the light's elevation — half visible when the
 * horizon cuts through its centre, fully hidden once it clears the top edge.
 *
 * How far to march is physical too: the tallest relief can only reach
 * uHeightReach / tan(elevation) across the canvas, so a raking light marches far
 * and an overhead one hardly at all. Steps bunch up near the pixel, where the
 * small ridges that matter most sit.
 */
float shadowMarch(sampler2D relief, vec2 uv, vec3 L, float penumbra, float strength) {
  if (strength <= 0.0 || uHeightScale <= 0.0 || uReliefAmount <= 0.0) return 1.0;
  vec2 dxy = L.xy;
  float lxy = length(dxy);
  if (lxy < 1e-4) return 1.0;              // light overhead: nothing to cast
  vec2 dir = dxy / lxy;
  float slope = L.z / lxy;                 // world height gained per unit travelled
  float maxDist = min(uShadowDist, uHeightReach / max(slope, 1e-3));
  float tMin = 0.75 * uTexelGlobal;
  if (maxDist <= tMin) return 1.0;
  float h0 = sampleHeight(relief, uv);
  float horizon = -1.0e3;                  // tangent of the highest blocker seen
  // Long (grazing) marches take more steps so thin ridges are not stepped over;
  // about one step per three texels, never fewer than the usual 32.
  int steps = clamp(int(maxDist / (3.0 * uTexelGlobal)), SHADOW_STEPS, SHADOW_STEPS_MAX);
  for (int i = 1; i <= SHADOW_STEPS_MAX; i++) {
    if (i > steps) break;
    float f = float(i) / float(steps);
    float t = tMin + (maxDist - tMin) * pow(f, 1.5);
    vec2 suv = uv + (dir * t / vec2(1.0, uAspect)) / uUVScale;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
    horizon = max(horizon, (sampleHeight(relief, suv) - h0) / t);
  }
  // Relative to an open, flat surface: the part of a big low source that sits
  // below the painting's own plane is already accounted for by the light wrap, so
  // only relief rising above that plane may take light away.
  float elev = atan(slope);
  float open = smoothstep(-penumbra, penumbra, elev);
  float vis = smoothstep(-penumbra, penumbra, elev - atan(horizon)) / max(open, 1e-3);
  return 1.0 - (1.0 - min(vis, 1.0)) * strength;
}

// Diffuse plus GGX specular for one light. aSrc is the roughness already widened by
// the source's size; NoLw the wrapped cosine.
vec3 brdf(vec3 N, vec3 V, vec3 L, float NoV, float NoLw, vec3 albedo, vec3 f0, float aSrc) {
  vec3 H = normalize(L + V);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float NoLs = max(dot(N, L), 0.0);
  float D = D_GGX(NoH, aSrc);
  float Vis = V_SmithGGX(NoV, max(NoLs, 1e-4), aSrc);
  vec3 F = F_Schlick(VoH, f0);
  return D * Vis * F * NoLs + albedo * (1.0 - F) * (1.0 - uMetallic) / PI * NoLw;
}

// Layer blend modes, per channel on display values: a is what lies below, b the layer.
float dodge(float a, float b) { return a <= 0.0 ? 0.0 : b >= 1.0 ? 1.0 : min(1.0, a / (1.0 - b)); }
float burn(float a, float b) { return a >= 1.0 ? 1.0 : b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - a) / b); }
float softLightD(float a) { return a <= 0.25 ? ((16.0 * a - 12.0) * a + 4.0) * a : sqrt(a); }
float blend1(int m, float a, float b) {
  if (m == ${B.multiply}) return a * b;
  if (m == ${B.screen}) return 1.0 - (1.0 - a) * (1.0 - b);
  if (m == ${B.overlay}) return a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
  if (m == ${B.softLight}) return b <= 0.5 ? a - (1.0 - 2.0 * b) * a * (1.0 - a) : a + (2.0 * b - 1.0) * (softLightD(a) - a);
  if (m == ${B.hardLight}) return b < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
  if (m == ${B.colorDodge}) return dodge(a, b);
  if (m == ${B.colorBurn}) return burn(a, b);
  if (m == ${B.linearLight}) return clamp(a + 2.0 * b - 1.0, 0.0, 1.0);
  if (m == ${B.vividLight}) return b < 0.5 ? burn(a, 2.0 * b) : dodge(a, 2.0 * b - 1.0);
  if (m == ${B.pinLight}) return b < 0.5 ? min(a, 2.0 * b) : max(a, 2.0 * b - 1.0);
  if (m == ${B.darken}) return min(a, b);
  if (m == ${B.lighten}) return max(a, b);
  return b;
}
vec3 blendLayer(int m, vec3 a, vec3 b) {
  return vec3(blend1(m, a.r, b.r), blend1(m, a.g, b.g), blend1(m, a.b, b.b));
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec2 gUV = uUVOffset + vUV * uUVScale;
  if (uSplit >= 0.0 && gUV.x < uSplit) {
    outColor = vec4(linearToSrgb(texture(uLin, vUV).rgb), 1.0); return;
  }
  vec4 nh = texture(uNormal, vUV);
  float mask = texture(uMask, gUV).r * 2.0;
  vec3 rawN = nh.rgb * 2.0 - 1.0;
  vec3 reliefN = normalize(vec3(rawN.xy * mask, rawN.z));
  float height = nh.a * mask * uReliefAmount;

  if (uViewMode == 1) { outColor = vec4(reliefN * 0.5 + 0.5, 1.0); return; }
  if (uViewMode == 2) { float v = height * uHeightView + 0.5; outColor = vec4(vec3(v), 1.0); return; }
  if (uViewMode == 3) { outColor = vec4(linearToSrgb(texture(uAlbedo, vUV).rgb), 1.0); return; }
  if (uViewMode == 4) { outColor = vec4(linearToSrgb(texture(uLin, vUV).rgb), 1.0); return; }

  vec3 albedo = texture(uAlbedo, vUV).rgb;

  // The artwork is a plane. Its own normal is (0,0,1) and blending toward the
  // relief normal by uReliefAmount is what makes the relief slider a real dial
  // between "flat print" and "heavy impasto".
  vec3 N = normalize(mix(vec3(0.0, 0.0, 1.0), reliefN, uReliefAmount));

  // Position in whole-image space, so a light stays put as tiles change.
  vec3 P = vec3(gUV.x, gUV.y * uAspect, 0.0);
  vec3 V = normalize(vec3(0.5, 0.5 * uAspect, 1.6) - P);
  float NoV = max(dot(N, V), 1e-4);

  float rough = clamp(uRoughness, 0.03, 1.0);
  float a = rough * rough;
  vec3 f0 = mix(vec3(0.04 * uSpecular), clamp(albedo, 0.0, 1.0), uMetallic);

  vec3 acc = vec3(0.0);
  float litShare = 0.0, allShare = 0.0;   // for the Shadows view
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    if (uLightEnabled[i] < 0.5) continue;

    vec3 lp = uLightPos[i];
    vec3 Lv = vec3(lp.x, lp.y * uAspect, lp.z) - P;
    float dist = max(length(Lv), 1e-4);
    vec3 L = Lv / dist;
    float NoL = dot(N, L);

    // Angular radius of the source as this point sees it. A large, close source
    // wraps light past the terminator (the lit fraction of its disc falls off
    // gradually), which is why diffused light flattens texture and a spot carves it.
    float srcAngle = atan(max(uLightSize[i], 0.0) / dist);
    float wrap = sin(min(srcAngle, 1.2));
    float NoLw = (NoL + wrap) / (1.0 + wrap);

    // Inverse square, referenced to a half-width distance so that the Distance
    // slider lands on sane values instead of needing a power of ten of Power.
    float atten = pow(0.5 / dist, uLightFalloff[i]);

    // Cone: L.z is the cosine of the angle off the plane normal, so the spot
    // test falls out without needing a separate aim vector while the light
    // points straight at the surface.
    float cone = clamp(uLightCone[i], 0.0, 1.0);
    float cosOuter = mix(0.02, 0.985, cone);
    float cosInner = mix(cosOuter + 0.001, 1.0, uLightSoftness[i]);
    vec3 aim = normalize(vec3(uLightAim[i].x - lp.x, (uLightAim[i].y - lp.y) * uAspect, -lp.z));
    float spot = cone < 0.01 ? 1.0 : smoothstep(cosOuter, cosInner, dot(-L, aim));
    if (spot <= 0.0) continue;

    // Shadows view: everything inside the beam counts, and a facet turned away from
    // the light is in (attached) shadow just as much as one a ridge blocks.
    vec3 incoming = uLightColor[i] * uLightPower[i] * atten * spot;
    float weight = dot(incoming, vec3(0.2126, 0.7152, 0.0722));
    allShare += weight;
    if (NoLw <= 0.0) continue;

    float penumbra = max(srcAngle, 0.012) + 0.3 * uShadowSoftness * uShadowSoftness;
    float shadow = shadowMarch(uNormal, vUV, L, penumbra, uShadow);

    // A bigger source spreads the highlight: widen the lobe by the source's size
    // relative to its distance (Karis' sphere-light approximation, without the
    // representative-point term). D stays normalised, so the energy is spread
    // rather than added.
    float aSrc = min(1.0, a + uLightSize[i] / (2.0 * dist));
    acc += brdf(N, V, L, NoV, NoLw, albedo, f0, aSrc) * incoming * shadow;
    litShare += weight * shadow * smoothstep(0.0, 0.1, NoLw);
  }

  if (uViewMode == 6) {
    // Where the lights' cast shadows land: white is fully lit, blue is shadow.
    float v = allShare > 0.0 ? litShare / allShare : 1.0;
    float base = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    vec3 col = mix(vec3(0.08, 0.16, 0.55), vec3(1.0, 0.98, 0.94), v) * (0.75 + 0.25 * clamp(base * 2.0, 0.0, 1.0));
    outColor = vec4(col, 1.0); return;
  }

  // Ambient occlusion straight off the height field: the high-pass is already a
  // local-mean-zero signal, so a negative height *is* a pit and pits catch less
  // of the sky term.
  float ao = 1.0 - uAO * clamp(-height * uAOScale, 0.0, 1.0);
  acc += albedo * uAmbientColor * uAmbient * ao;

  acc *= exp2(uExposure);
  vec3 mapped = mix(clamp(acc, 0.0, 1.0), acesFilm(acc), uHighlightRolloff);
  vec3 relit = clamp(linearToSrgb(mapped), 0.0, 1.0);

  if (uGrazeOpacity > 0.0) {
    // The graze light shades and shadows the relief down to its Detail size only
    // (GBuffer buildGraze): at a degree or two off the wall the finest band of a
    // one-photo estimate is mostly grain and noise, and would turn into glitter.
    // The finer relief comes back into the shading alone, at the contrast a gentler
    // light gives it (uGrazeFine), so it reads as surface, not as spots.
    vec4 gnh = texture(uGrazeNormal, vUV);
    vec3 gRaw = gnh.rgb * 2.0 - 1.0;
    vec2 gxy = mix(gRaw.xy, rawN.xy * (gRaw.z / rawN.z), uGrazeFine);
    vec3 gN = normalize(mix(vec3(0.0, 0.0, 1.0), normalize(vec3(gxy * mask, gRaw.z)), uReliefAmount));
    float gNoV = max(dot(gN, V), 1e-4);
    float gAo = 1.0 - uAO * clamp(-gnh.a * mask * uReliefAmount * uAOScale, 0.0, 1.0);
    // Shadows always full strength and crisp here: that is the point of grazing light.
    vec3 g = albedo * uAmbientColor * ${GRAZE_AMBIENT.toFixed(3)} * gAo;
    vec3 Lv = vec3(uGrazePos.x, uGrazePos.y * uAspect, uGrazePos.z) - P;
    float dist = max(length(Lv), 1e-4);
    vec3 L = Lv / dist;
    float srcAngle = atan(${GRAZE_SIZE.toFixed(4)} / dist);
    float wrap = sin(srcAngle);
    float NoLw = (dot(gN, L) + wrap) / (1.0 + wrap);
    if (NoLw > 0.0) {
      float aSrc = min(1.0, a + ${GRAZE_SIZE.toFixed(4)} / (2.0 * dist));
      float shadow = shadowMarch(uGrazeNormal, vUV, L, max(srcAngle, 0.012), 1.0);
      g += brdf(gN, V, L, gNoV, NoLw, albedo, f0, aSrc) * uGrazeColor * pow(0.5 / dist, 2.0) * shadow;
    }
    g *= exp2(uExposure);
    vec3 gm = mix(clamp(g, 0.0, 1.0), acesFilm(g), uHighlightRolloff);
    relit = mix(relit, clamp(linearToSrgb(gm), 0.0, 1.0), uGrazeOpacity);
  }
  vec3 col = relit;
  vec4 lmask = texture(uLayerMask, gUV);
  if (uLayerCount > 0) {
    vec3 orig = clamp(linearToSrgb(texture(uLin, vUV).rgb), 0.0, 1.0);
    for (int i = 0; i < ${MAX_LAYERS}; i++) {
      if (i >= uLayerCount) break;
      vec3 b = uLayerSource[i] == 0 ? orig : relit;
      col = mix(col, blendLayer(uLayerMode[i], col, b), uLayerOpacity[i] * dot(lmask, uLayerSel[i]));
    }
  }
  float hidden = dot(uMaskOverlay, vec4(1.0)) > 0.0 ? 1.0 - dot(lmask, uMaskOverlay) : 0.0;
  col = mix(col, vec3(1.0, 0.18, 0.12), 0.45 * hidden);
  outColor = vec4(col, 1.0);
}`;

export class Shader {
  constructor(glctx) {
    this.glctx = glctx;
    this.prog = program(glctx.gl, SHADE_FS, 'shade');
    this.maskTex = glctx.gl.createTexture();
    this.maskVersion = -1;
    this.layerMaskTex = glctx.gl.createTexture();
    this.layerMaskVersion = -1;
  }

  /**
   * @param tile  {ox,oy,sx,sy} placing this draw within the full image in UV
   *              terms. Defaults to the whole image.
   */
  draw(targets, state, aspect, viewW, viewH, tile) {
    const { gl } = this.glctx;
    const p = this.prog;
    if (!state.exporting) bindTarget(gl, null);
    gl.viewport(0, 0, viewW, viewH);
    gl.useProgram(p.program);
    if (this.maskVersion !== (state.maskVersion ?? 0)) {
      gl.activeTexture(gl.TEXTURE0 + 3);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      if (state.maskCanvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, state.maskCanvas);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128,128,128,255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.maskVersion = state.maskVersion ?? 0;
    }
    if (this.layerMaskVersion !== (state.layerMaskVersion ?? 0)) {
      gl.activeTexture(gl.TEXTURE0 + 4);
      gl.bindTexture(gl.TEXTURE_2D, this.layerMaskTex);
      const d = state.layerMaskData, n = d ? Math.round(Math.sqrt(d.length / 4)) : 1;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, d || new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.layerMaskVersion = state.layerMaskVersion ?? 0;
    }
    bindTextures(gl, p, [
      ['uAlbedo', targets.albedo.tex],
      ['uNormal', targets.normal.tex],
      ['uLin', targets.lin.tex],
      ['uMask', this.maskTex],
      ['uLayerMask', this.layerMaskTex],
      ['uGrazeNormal', (targets.graze || targets.normal).tex],
    ]);

    const lights = state.lights.slice(0, MAX_LIGHTS);
    const pos = new Float32Array(MAX_LIGHTS * 3);
    const col = new Float32Array(MAX_LIGHTS * 3);
    const pow = new Float32Array(MAX_LIGHTS);
    const cone = new Float32Array(MAX_LIGHTS);
    const on = new Float32Array(MAX_LIGHTS);
    const soft = new Float32Array(MAX_LIGHTS);
    const falloff = new Float32Array(MAX_LIGHTS);
    const aim = new Float32Array(MAX_LIGHTS * 2);
    const size = new Float32Array(MAX_LIGHTS);
    lights.forEach((l, i) => {
      pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z;
      col[i * 3] = l.rgb[0]; col[i * 3 + 1] = l.rgb[1]; col[i * 3 + 2] = l.rgb[2];
      pow[i] = l.power;
      cone[i] = l.cone;
      on[i] = l.enabled ? 1 : 0;
      soft[i] = l.softness ?? 0.5;
      falloff[i] = l.falloff ?? 2;
      aim[i * 2] = l.aimX ?? l.x;
      aim[i * 2 + 1] = l.aimY ?? l.y;
      size[i] = l.size ?? 0.03;
    });

    const u = p.uniforms;
    gl.uniform1i(u.uLightCount, lights.length);
    gl.uniform3fv(u.uLightPos, pos);
    gl.uniform3fv(u.uLightColor, col);
    gl.uniform1fv(u.uLightPower, pow);
    gl.uniform1fv(u.uLightCone, cone);
    gl.uniform1fv(u.uLightEnabled, on);
    gl.uniform1fv(u.uLightSoftness, soft);
    gl.uniform1fv(u.uLightFalloff, falloff);
    gl.uniform2fv(u.uLightAim, aim);
    gl.uniform1fv(u.uLightSize, size);
    gl.uniform1f(u.uMetallic, state.metallic ?? 0);
    gl.uniform1f(u.uShadowSoftness, state.shadowSoftness ?? 0.35);
    gl.uniform1f(u.uHighlightRolloff, state.highlightRolloff ?? 1);
    gl.uniform1f(u.uSplit, state.exporting ? -1 : (state.compareSplit ?? -1));
    gl.uniform1f(u.uAspect, aspect);
    const t = tile || { ox: 0, oy: 0, sx: 1, sy: 1 };
    gl.uniform2f(u.uUVOffset, t.ox, t.oy);
    gl.uniform2f(u.uUVScale, t.sx, t.sy);
    // Shadow length follows the relief scale, not the image size. A fixed
    // fraction of image width would make shadows grow with resolution, so the
    // preview and the full-res export would not match.
    gl.uniform1f(u.uShadowDist, state.shadowDist);
    // Calibrated heights tell the march how far it needs to go; legacy heights are
    // in arbitrary units, so there the fixed reach above is the only limit.
    gl.uniform1f(u.uHeightReach, state.calibrated ? state.heightScale * state.reliefAmount * 1.5 : 1e3);
    gl.uniform1f(u.uTexelGlobal, t.sx / Math.max(1, viewW));
    gl.uniform1f(u.uAOScale, state.calibrated ? state.aoScale ?? 2.5 : 6.0);
    gl.uniform1f(u.uHeightView, state.calibrated ? 1.0 : 8.0);
    gl.uniform1f(u.uAmbient, state.ambient);
    gl.uniform3fv(u.uAmbientColor, new Float32Array(state.ambientColor));
    gl.uniform1f(u.uRoughness, state.roughness);
    gl.uniform1f(u.uSpecular, state.specular);
    gl.uniform1f(u.uReliefAmount, state.reliefAmount);
    gl.uniform1f(u.uHeightScale, state.heightScale);
    gl.uniform1f(u.uShadow, state.shadow);
    gl.uniform1f(u.uAO, state.ao);
    gl.uniform1f(u.uExposure, state.exposure);
    gl.uniform1i(u.uViewMode, state.viewMode);

    // Only visible layers go to the GPU, in order, bottom first. Each keeps the mask
    // channel of its place in state.layers.
    const all = (state.layers || []).slice(0, MAX_LAYERS);
    const layers = all.filter((l) => l.enabled && l.opacity > 0);
    const lMode = new Int32Array(MAX_LAYERS), lSrc = new Int32Array(MAX_LAYERS), lOp = new Float32Array(MAX_LAYERS);
    const lSel = new Float32Array(MAX_LAYERS * 4), overlay = new Float32Array(4);
    layers.forEach((l, i) => {
      lMode[i] = Math.max(0, B[l.mode] ?? 0);
      lSrc[i] = Math.max(0, layerSources.findIndex(([k]) => k === l.source));
      lOp[i] = l.opacity;
      lSel[i * 4 + all.indexOf(l)] = 1;
    });
    const shown = state.exporting ? -1 : state.maskOverlay ?? -1;
    if (shown >= 0 && shown < MAX_LAYERS) overlay[shown] = 1;
    gl.uniform4fv(u.uLayerSel, lSel);

    // Graze effect: direction is where the light comes from, 0 deg = right, 90 = top.
    const g = state.graze;
    const gOn = g && g.enabled && g.opacity > 0 && state.viewMode === 0 && !state.sweeping;
    const gEl = (g?.elevation ?? 3) * Math.PI / 180, gDir = (g?.angle ?? 180) * Math.PI / 180;
    const gz = GRAZE_DISTANCE * Math.tan(gEl), gPow = grazePower(Math.hypot(GRAZE_DISTANCE, gz), g?.elevation ?? 3);
    gl.uniform3f(u.uGrazePos, 0.5 + Math.cos(gDir) * GRAZE_DISTANCE, 0.5 + Math.sin(gDir) * GRAZE_DISTANCE / aspect, gz);
    gl.uniform3f(u.uGrazeColor, GRAZE_RGB[0] * gPow, GRAZE_RGB[1] * gPow, GRAZE_RGB[2] * gPow);
    gl.uniform1f(u.uGrazeOpacity, gOn ? g.opacity : 0);
    // Finer relief than Detail keeps the contrast it has at GRAZE_FINE_DEG: shading
    // contrast goes as slope / tan(elevation), so its weight goes as tan(elevation).
    const fineDeg = GRAZE_FINE_DEG * Math.PI / 180;
    gl.uniform1f(u.uGrazeFine, (g?.fine ?? 1) * Math.min(1, Math.tan(gEl) / Math.tan(fineDeg)));
    gl.uniform4fv(u.uMaskOverlay, overlay);
    gl.uniform1i(u.uLayerCount, layers.length);
    gl.uniform1iv(u.uLayerMode, lMode);
    gl.uniform1iv(u.uLayerSource, lSrc);
    gl.uniform1fv(u.uLayerOpacity, lOp);

    drawFullscreen(gl);
  }
}

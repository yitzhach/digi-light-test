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
import { blendModes, layerSources, MAX_LAYERS, GRAZE_DISTANCE, grazeSize, GRAZE_AMBIENT, GRAZE_FINE_DEG, GRAZE_CLEAN_MAX, grazePower, lampPosition, lampAngles, ROOM_NEUTRAL_K, STROKE_STOPS } from './presets.js';
import { kelvinToLinearRGB, roomLightRGB } from './kelvin.js';

const GRAZE_RGB = kelvinToLinearRGB(5000);
// Linear grey the Relief view and Grey surface give the paint under the graze light.
export const GRAZE_GREY = (0.3).toFixed(3);

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
uniform float uLightReach[${MAX_LIGHTS}];    // share of uShadowDist this light's shadows may run
uniform float uLightLift[${MAX_LIGHTS}];     // Shadow lift: how far this light raises the dark tones it falls on
uniform sampler2D uShadowRelief;             // relief for the main lights' shadows: grain smoothed out

uniform float uAspect;
uniform vec2  uUVOffset;   // where this tile sits in the full image
uniform vec2  uUVScale;    // how much of the full image this tile covers
uniform float uShadowDist; // longest march, in whole-image UV units
uniform float uHeightReach; // tallest rise worth marching for, same units as heights
uniform float uTexelGlobal; // one full-image texel, in painting widths
uniform float uAOScale;
uniform float uHeightView;
uniform int   uHeightColour;   // Height view: 0 grey, 1 turbo colour ramp (a calibrated topographic map)
uniform float uAmbient;
uniform vec3  uAmbientColor;
uniform float uRoughness;
uniform float uSpecular;
uniform float uReliefAmount;
uniform float uHeightScale;
uniform float uShadow;
uniform float uAO;
uniform float uExposure;
uniform int   uViewMode;     // 0 relit, 1 normals, 2 height, 3 albedo, 4 original, 6 shadows, 7 relief (graze on grey)

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
uniform float uGrazeBias;       // height a blocker must clear before it throws a graze shadow
uniform float uGrazeReach;      // longest graze march, in whole-image UV units
uniform float uGrazeSize;       // source radius, in painting widths (Softness)
uniform float uGrazeFine;       // share of the finer relief put back into its shading (no shadows)
uniform float uGrazeFill;       // soft room light under the graze light, so its shadows read as shadows
uniform float uGrazeLift;       // Shadow lift under the graze light
uniform float uGrazeLiftFall;   // its falloff with distance: 2 for a calibrated lamp, 0 (even) otherwise
uniform float uGrazeGrey;       // 1 = the graze light falls on an even grey instead of the paint's colour

// Colour & strokes. Neutral values (divisors of 1, 0, 0) leave the render untouched.
uniform vec3  uWhiteBalance;    // main lights: the camera's white balance, divided out in linear light
uniform vec3  uGrazeWhiteBalance;
uniform float uVibrance;        // saturation for coloured paint; near-greys left alone
uniform sampler2D uStrokeRelief; // the relief smoothed to Stroke size: rgb normal, a height
uniform sampler2D uStrokeFine;   // and to STROKE_FINE of it, the band's fine edge
uniform float uStrokeDef;       // Stroke definition, 0..1
uniform float uStrokeGain;      // 1 / the 2-98% spread of that band

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
float shadowMarch(sampler2D relief, vec2 uv, vec3 L, float penumbra, float strength, float bias, float reach) {
  if (strength <= 0.0 || uHeightScale <= 0.0 || uReliefAmount <= 0.0) return 1.0;
  vec2 dxy = L.xy;
  float lxy = length(dxy);
  if (lxy < 1e-4) return 1.0;              // light overhead: nothing to cast
  vec2 dir = dxy / lxy;
  float slope = L.z / lxy;                 // world height gained per unit travelled
  float maxDist = min(reach, uHeightReach / max(slope, 1e-3));
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
    horizon = max(horizon, (sampleHeight(relief, suv) - h0 - bias) / t);
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

// Turbo colour ramp (Mikhailov 2019, polynomial fit): perceptually ordered, unlike a
// plain rainbow, and with more steps than viridis for fine relief.
vec3 turbo(float t) {
  const vec4 kR4 = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  const vec4 kG4 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  const vec4 kB4 = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  const vec2 kR2 = vec2(-152.94239396, 59.28637943);
  const vec2 kG2 = vec2(4.27729857, 2.82956604);
  const vec2 kB2 = vec2(-89.90310912, 27.34824973);
  t = clamp(t, 0.0, 1.0);
  vec4 v4 = vec4(1.0, t, t * t, t * t * t);
  vec2 v2 = v4.zw * v4.z;
  return clamp(vec3(dot(v4, kR4) + dot(v2, kR2), dot(v4, kG4) + dot(v2, kG2), dot(v4, kB4) + dot(v2, kB2)), 0.0, 1.0);
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// Shadow lift, on display (sRGB) values: the darks rise, the lights barely move.
// y + 5 s y (1 - y)^6 is strongest around y = 0.15 (dark paint, baked-in recesses),
// leaves white at white, and stays monotonic for s up to 1 (its slope bottoms out
// at 0.07). Scaling the colour by the luma ratio keeps its hue and saturation.
// At 100%: 0.07 -> 0.29, 0.15 -> 0.43, 0.3 -> 0.47, 0.5 -> 0.54, 0.7 -> 0.70.
// Below 0 it deepens them instead: y - 0.8 |s| y (1 - y)^4 (slope stays >= 0.2).
// At -100%: 0.07 -> 0.04, 0.15 -> 0.09, 0.3 -> 0.24, 0.5 -> 0.48.
vec3 liftShadows(vec3 c, float s) {
  if (s == 0.0) return c;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (y <= 1e-4) return c;
  float k = 1.0 - y, k3 = k * k * k;
  float yl = s > 0.0 ? y + 5.0 * min(s, 1.0) * y * k3 * k3 : y - 0.8 * min(-s, 1.0) * y * k3 * k;
  return clamp(c * (yl / y), 0.0, 1.0);
}

// Vibrance, on display (sRGB) values: pushes colour away from its own grey (luma)
// by 1 + v w, where w rises from 0 for near-greys (chroma, max - min, under 0.04)
// to 1 by 0.16, so grey and white paint keep the slight tint the light gives them,
// and dark passages are not read as colour, while coloured paint gains or loses
// saturation. The push stops where a channel would clip, so hues never shift.
// Below 0 it desaturates.
vec3 vibrance(vec3 c, float v) {
  if (v == 0.0) return c;
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = 1.0 + v * smoothstep(0.04, 0.16, mx - mn);
  if (k > 1.0) k = min(k, min(y / max(y - mn, 1e-4), (1.0 - y) / max(mx - y, 1e-4)));
  return clamp(vec3(y) + (c - vec3(y)) * k, 0.0, 1.0);
}

// Stroke definition: the relief smoothed a little (STROKE_FINE of Stroke size, so the
// grain is left alone) minus the relief smoothed to Stroke size is a band-pass,
// negative in a crease and positive on a crest at brush-stroke scale. In units of
// its own 2-98% spread (uStrokeGain) it reads the same on any painting and depth;
// a crease at the band's edge loses ${STROKE_STOPS} stops at 100%, a crest gains half that.
// Light into a crease is cut by its walls and a crest catches what passes over them;
// a multiplier on all the light, so it never touches the paint's colour.
float strokeShade(float mask) {
  if (uStrokeDef <= 0.0) return 1.0;
  float c = (texture(uStrokeFine, vUV).a - texture(uStrokeRelief, vUV).a) * mask * uReliefAmount * uStrokeGain;
  c = clamp(c, -1.0, 1.0);
  return exp2(uStrokeDef * ${STROKE_STOPS.toFixed(1)} * (c < 0.0 ? c : 0.5 * c));
}

// How much of a light's pool reaches this point: 1 on the part of the painting
// nearest the light, falling off with its distance falloff (and the beam, via spot).
float poolShare(vec3 lp, float dist, float falloff) {
  vec2 near = clamp(vec2(lp.x, lp.y * uAspect), vec2(0.0), vec2(1.0, uAspect));
  float dmin = max(length(vec3(near - vec2(lp.x, lp.y * uAspect), lp.z)), 1e-4);
  return pow(min(1.0, dmin / dist), falloff);
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
  if (uViewMode == 2) {
    // Calibrated heights are in units of their 2-98% spread, so -0.5..0.5 spans it.
    float v = clamp(height * uHeightView + 0.5, 0.0, 1.0);
    outColor = vec4(uHeightColour == 1 ? turbo(v) : vec3(v), 1.0); return;
  }
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
  float lift = 0.0;                        // Shadow lift, summed over the lights reaching here
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
    // Shadow lift goes wherever the beam lands, cast shadows and facets turned away included.
    lift += uLightLift[i] * spot * poolShare(lp, dist, uLightFalloff[i]);

    // Shadows view: everything inside the beam counts, and a facet turned away from
    // the light is in (attached) shadow just as much as one a ridge blocks.
    vec3 incoming = uLightColor[i] * uLightPower[i] * atten * spot;
    float weight = dot(incoming, vec3(0.2126, 0.7152, 0.0722));
    allShare += weight;
    if (NoLw <= 0.0) continue;

    float penumbra = max(srcAngle, 0.012) + 0.3 * uShadowSoftness * uShadowSoftness;
    float shadow = shadowMarch(uShadowRelief, vUV, L, penumbra, uShadow, 0.0, uShadowDist * uLightReach[i]);

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

  float strokes = strokeShade(mask);
  acc *= strokes / uWhiteBalance;
  acc *= exp2(uExposure);
  vec3 mapped = mix(clamp(acc, 0.0, 1.0), acesFilm(acc), uHighlightRolloff);
  vec3 relit = liftShadows(clamp(linearToSrgb(mapped), 0.0, 1.0), lift);

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
    // Relief only: an even grey surface, so only the relief shows (the conservator's
    // raking-light image, Fontana et al.); GRAZE_GREY lands flat paint near mid-grey.
    vec3 gAlb = mix(albedo, vec3(${GRAZE_GREY}), uGrazeGrey);
    vec3 gF0 = mix(vec3(0.04 * uSpecular), clamp(gAlb, 0.0, 1.0), uMetallic);
    // Shadows always full strength and crisp here: that is the point of grazing light.
    vec3 g = gAlb * uAmbientColor * uGrazeFill * gAo;
    vec3 Lv = vec3(uGrazePos.x, uGrazePos.y * uAspect, uGrazePos.z) - P;
    float dist = max(length(Lv), 1e-4);
    vec3 L = Lv / dist;
    float srcAngle = atan(uGrazeSize / dist);
    float wrap = sin(srcAngle);
    float NoLw = (dot(gN, L) + wrap) / (1.0 + wrap);
    if (NoLw > 0.0) {
      float aSrc = min(1.0, a + uGrazeSize / (2.0 * dist));
      float shadow = shadowMarch(uGrazeNormal, vUV, L, max(srcAngle, 0.012), 1.0, uGrazeBias, uGrazeReach);
      g += brdf(gN, V, L, gNoV, NoLw, gAlb, gF0, aSrc) * uGrazeColor * pow(0.5 / dist, 2.0) * shadow;
    }
    g *= strokes / uGrazeWhiteBalance;
    g *= exp2(uExposure);
    vec3 gm = mix(clamp(g, 0.0, 1.0), acesFilm(g), uHighlightRolloff);
    vec3 gs = liftShadows(clamp(linearToSrgb(gm), 0.0, 1.0), uGrazeLift * poolShare(uGrazePos, dist, uGrazeLiftFall));
    // On grey the light's and the room's tint go too: a neutral image, like a raking-light photograph in black and white.
    gs = mix(gs, vec3(dot(gs, vec3(0.2126, 0.7152, 0.0722))), uGrazeGrey);
    relit = mix(relit, gs, uGrazeOpacity);
  }
  relit = vibrance(relit, uVibrance);
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
    // A tile draws into whatever target its caller bound; the preview, to the canvas.
    if (!tile) bindTarget(gl, null);
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
      ['uShadowRelief', (targets.shadow || targets.normal).tex],
      ['uStrokeRelief', (targets.stroke || targets.normal).tex],
      ['uStrokeFine', (targets.strokeFine || targets.normal).tex],
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
    const lift = new Float32Array(MAX_LIGHTS);
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
      lift[i] = l.lift ?? 0;
    });
    // Long shadows belong to the key light. Each extra light marches a share of the
    // reach set by its strength relative to the strongest one, so fills add light
    // without laying their own long streaks across the key's (lightReach).
    const reach = lightReach(lights);

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
    gl.uniform1fv(u.uLightReach, reach);
    gl.uniform1fv(u.uLightLift, lift);
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
    gl.uniform1i(u.uHeightColour, state.heightColour ? 1 : 0);
    gl.uniform1f(u.uAmbient, state.ambient);
    const room = state.roomKelvin != null ? roomLightRGB(state.roomKelvin, ROOM_NEUTRAL_K) : state.ambientColor;
    gl.uniform3fv(u.uAmbientColor, new Float32Array(room));
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
    // Relief view: no layers, the graze light alone on grey.
    const reliefView = state.viewMode === 7;
    if (shown >= 0 && shown < MAX_LAYERS) overlay[shown] = 1;
    gl.uniform4fv(u.uLayerSel, lSel);

    // Graze effect: direction is where the light comes from, 0 deg = right, 90 = top.
    const g = state.graze;
    const gOn = reliefView ? !!g : g && g.enabled && g.opacity > 0 && state.viewMode === 0 && !state.sweeping;
    const gEl = (g?.elevation ?? 3) * Math.PI / 180, gDir = (g?.angle ?? 180) * Math.PI / 180;
    const gz = GRAZE_DISTANCE * Math.tan(gEl);
    let gPow = grazePower(Math.hypot(GRAZE_DISTANCE, gz), g?.elevation ?? 3);
    let gPos = [0.5 + Math.cos(gDir) * GRAZE_DISTANCE, 0.5 + Math.sin(gDir) * GRAZE_DISTANCE / aspect, gz];
    if (g?.lamp) {
      // Calibrated lamp: a point at its measured place, power set so the painting's
      // centre gets what a directional graze light at that angle would give it.
      const c = lampAngles(g.lamp, state.paintingWidthCm, aspect);
      gPow = grazePower(c.dist, Math.max(0.2, c.elevation));
      gPos = lampPosition(g.lamp, state.paintingWidthCm, aspect);
    }
    gl.uniform3fv(u.uGrazePos, gPos);
    gl.uniform1f(u.uGrazeFill, g?.fill ?? GRAZE_AMBIENT);
    gl.uniform1f(u.uGrazeLift, g?.lift ?? 0);
    // The plain graze light stands for a distant one, so its lift is even; a calibrated lamp's fades.
    gl.uniform1f(u.uGrazeLiftFall, g?.lamp ? 2 : 0);
    gl.uniform3f(u.uGrazeColor, GRAZE_RGB[0] * gPow, GRAZE_RGB[1] * gPow, GRAZE_RGB[2] * gPow);
    gl.uniform1f(u.uGrazeOpacity, gOn ? (reliefView ? 1 : g.opacity) : 0);
    gl.uniform1f(u.uGrazeGrey, reliefView ? 1 : Math.min(1, Math.max(0, g?.grey ?? 0)));
    // Finer relief than Detail keeps the contrast it has at GRAZE_FINE_DEG: shading
    // contrast goes as slope / tan(elevation), so its weight goes as tan(elevation).
    const fineDeg = GRAZE_FINE_DEG * Math.PI / 180;
    // Clean shadows: heights are in units of the relief's measured spread, so the
    // dead zone follows how much of the relief the estimate can be trusted with.
    gl.uniform1f(u.uGrazeBias, state.calibrated ? (g?.clean ?? 0) * GRAZE_CLEAN_MAX * state.heightScale * state.reliefAmount : 0);
    gl.uniform1f(u.uGrazeReach, state.grazeReach ?? state.shadowDist);
    gl.uniform1f(u.uGrazeSize, grazeSize(g?.soft ?? 0));
    gl.uniform1f(u.uGrazeFine, (g?.fine ?? 1) * Math.min(1, Math.tan(gEl) / Math.tan(fineDeg)));

    // Keep greys neutral: each path's camera is balanced toward the mix of light that
    // path puts on the painting, so mixed lights still differ (a warm key over a cool
    // room light keeps warm faces and cool shadows) while their average turns grey.
    const wb = Math.min(1, Math.max(0, state.neutralWB ?? 0));
    const balance = (white) => white.map((v) => 1 + wb * (v - 1));
    const amb = room.map((v) => v * state.ambient);
    gl.uniform3fv(u.uWhiteBalance, balance(sceneWhite(lights, aspect, amb)));
    const grazeLight = { x: gPos[0], y: gPos[1], z: gPos[2], rgb: GRAZE_RGB, power: gPow, enabled: true, cone: 0, falloff: 2 };
    gl.uniform3fv(u.uGrazeWhiteBalance, balance(sceneWhite([grazeLight], aspect, room.map((v) => v * (g?.fill ?? GRAZE_AMBIENT)))));
    gl.uniform1f(u.uVibrance, Math.min(1, Math.max(-1, state.vibrance ?? 0)));
    // Stroke definition needs its smoothed relief (GBuffer buildStroke) and the
    // spread of the band it leaves (app.js measures it on the preview; export tiles reuse it).
    const strokeOn = state.viewMode === 0 || state.viewMode === 7;
    gl.uniform1f(u.uStrokeDef, strokeOn && targets.stroke && state.strokeSpread > 0 ? Math.min(1, Math.max(0, state.strokeDef ?? 0)) : 0);
    gl.uniform1f(u.uStrokeGain, state.strokeSpread > 0 ? 1 / state.strokeSpread : 0);
    gl.uniform4fv(u.uMaskOverlay, overlay);
    gl.uniform1i(u.uLayerCount, reliefView ? 0 : layers.length);
    gl.uniform1iv(u.uLayerMode, lMode);
    gl.uniform1iv(u.uLayerSource, lSrc);
    gl.uniform1fv(u.uLayerOpacity, lOp);

    drawFullscreen(gl);
  }
}

/**
 * The colour of the light a camera sees on the painting: each enabled light's
 * colour times what it delivers to a flat diffuse surface (power, falloff, beam,
 * cosine; the same terms as the shader), averaged over a 3 x 3 grid of points, plus
 * the room light `ambient` (already its colour times strength). Luminance 1, each
 * channel at least 0.2 so a candle-coloured mix cannot blow up a near-empty channel.
 */
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export function sceneWhite(lights, aspect, ambient) {
  const sum = [...ambient];
  for (const l of lights) {
    if (!l.enabled) continue;
    const cone = Math.min(1, Math.max(0, l.cone ?? 0));
    const cosOuter = 0.02 + (0.985 - 0.02) * cone, cosInner = cosOuter + 0.001 + (1 - cosOuter - 0.001) * (l.softness ?? 0.5);
    let ax = (l.aimX ?? l.x) - l.x, ay = ((l.aimY ?? l.y) - l.y) * aspect, az = -l.z;
    const an = Math.hypot(ax, ay, az) || 1; ax /= an; ay /= an; az /= an;
    let w = 0;
    for (const u of [1 / 6, 0.5, 5 / 6]) for (const v of [1 / 6, 0.5, 5 / 6]) {
      const lx = l.x - u, ly = (l.y - v) * aspect, lz = l.z, d = Math.max(Math.hypot(lx, ly, lz), 1e-4);
      const spot = cone < 0.01 ? 1 : smooth(cosOuter, cosInner, -(lx * ax + ly * ay + lz * az) / d);
      w += l.power * Math.pow(0.5 / d, l.falloff ?? 2) * spot * Math.max(0, lz / d) / Math.PI / 9;
    }
    for (let c = 0; c < 3; c++) sum[c] += l.rgb[c] * w;
  }
  const lum = 0.2126 * sum[0] + 0.7152 * sum[1] + 0.0722 * sum[2];
  if (!(lum > 1e-6)) return [1, 1, 1];
  const n = sum.map((v) => Math.max(0.2, v / lum));
  const l2 = 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
  return n.map((v) => v / l2);
}

/**
 * Shadow reach per light, as a share of the full reach: 1 for the strongest enabled
 * light (power times luminance), and its relative strength for the rest, never
 * below MIN_REACH so a fill still shades the deepest grooves.
 */
export const MIN_REACH = 0.15;
export function lightReach(lights) {
  const out = new Float32Array(MAX_LIGHTS);
  const w = lights.map((l) => l.enabled ? l.power * (0.2126 * l.rgb[0] + 0.7152 * l.rgb[1] + 0.0722 * l.rgb[2]) : 0);
  const key = Math.max(0, ...w);
  w.forEach((v, i) => { out[i] = key > 0 ? Math.max(MIN_REACH, Math.min(1, v / key)) : 1; });
  return out;
}

// glsl.js — GLSL shared by the shading pass (shade.js) and the effects that run after it
// (postfx.js): the layer blend modes, the photo as it was, linear to sRGB, and the finish every
// picture ends with (overlays, Original on top, the mask tint while painting a mask).
import { blendModes } from './presets.js';

const B = Object.fromEntries(blendModes.map(([k], i) => [k, i]));

export const BLEND_GLSL = `
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

`;

// Needs uniform sampler2D uLin (the photo, linear) and vUV.
export const PHOTO_GLSL = `
// The photo as it was, in linear light: its own texel when the render is the photo's size
// (exports at full size), so Original on top at 100% gives the photo back bit for bit.
vec3 photoLin() {
  vec2 at = vUV * vec2(textureSize(uLin, 0));
  return all(lessThan(abs(at - gl_FragCoord.xy), vec2(0.01))) ? texelFetch(uLin, ivec2(gl_FragCoord.xy), 0).rgb : texture(uLin, vUV).rgb;
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

`;

// Needs overlays() (overlays.js) and the uniforms below; the shading pass declares them itself.
export const FINISH_GLSL = `
// What every picture ends with: the overlays, Original on top, and while a layer mask is
// being painted, a red tint where it hides the layer.
vec3 finish(vec3 col, vec2 gUV, vec4 lmask) {
  col = overlays(col, gUV);
  if (uOriginalTop > 0.0) col = mix(col, clamp(linearToSrgb(photoLin()), 0.0, 1.0), uOriginalTop);
  float hidden = dot(uMaskOverlay, vec4(1.0)) > 0.0 ? 1.0 - dot(lmask, uMaskOverlay) : 0.0;
  return mix(col, vec3(1.0, 0.18, 0.12), 0.45 * hidden);
}`;

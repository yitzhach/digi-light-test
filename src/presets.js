// Creative defaults, not claims about a painting's measured material.

// Paint texture. depthMm is the estimated height of paint ridges above the hollows
// beside them; size is Texture size (the relief scale, in preview pixels); the
// three bands weight fine, medium and broad relief.
export const textures = {
  'Flat print / poster':      { depthMm: 0,    size: 3,   fine: 0.4,  medium: 0.4, broad: 0 },
  'Smooth glazes':            { depthMm: 0.15, size: 2.5, fine: 0.8,  medium: 0.5, broad: 0.05 },
  'Canvas weave':             { depthMm: 0.4,  size: 1.5, fine: 1.1,  medium: 0.4, broad: 0 },
  'Brushy oil':               { depthMm: 1,    size: 3,   fine: 0.65, medium: 0.8, broad: 0.15 },
  'Thick brushwork':          { depthMm: 2,    size: 3.5, fine: 0.7,  medium: 1.1, broad: 0.25 },
  'Palette-knife impasto':    { depthMm: 3.5,  size: 4.5, fine: 0.5,  medium: 1.3, broad: 0.4 },
  'Sculptural impasto':       { depthMm: 7,    size: 6,   fine: 0.5,  medium: 1.4, broad: 0.6 },
  'Acrylic texture paste':    { depthMm: 4,    size: 5,   fine: 0.6,  medium: 1.2, broad: 0.5 },
  'Plaster / fresco':         { depthMm: 1.5,  size: 5,   fine: 0.55, medium: 1.1, broad: 0.55 },
};
export const DEPTH_GUIDE = 'Typical: glazes 0.1–0.3 mm · canvas weave 0.3–0.6 · brushy oil 0.5–1.5 · impasto 2–5 · sculptural 5–10.';

// roughness, specular, metallic
export const materials = {
  'Matte acrylic': [0.8, 0.35, 0],
  'Oil paint': [0.55, 0.9, 0],
  'Satin oil': [0.45, 0.8, 0],
  'Gloss varnish': [0.24, 1.1, 0],
  'Canvas': [0.88, 0.25, 0],
  'Plaster / fresco': [0.92, 0.18, 0],
  'Cement': [0.85, 0.3, 0],
  'Metallic leaf': [0.32, 1, 0.85],
  'Resin': [0.13, 1, 0],
};

// How the original photograph was lit. Even light reads relief from darker
// recesses (any direction); light from one side reads it from shading along that
// side. azimuth: the direction the light came from, 0 = right, 90 = top.
export const photoDirections = [
  ['tl', '↖', 'top-left', 135], ['t', '↑', 'top', 90], ['tr', '↗', 'top-right', 45],
  ['l', '←', 'left', 180], ['even', 'Even', 'evenly (no single direction)', null], ['r', '→', 'right', 0],
  ['bl', '↙', 'bottom-left', 225], ['b', '↓', 'bottom', 270], ['br', '↘', 'bottom-right', 315],
];
// Even-light share used for each case. Measured on the synthetic rigs: 0.6 is best
// for soft even light. Those rigs score a side-lit photo best with none, but they
// have no cast shadows: a real raking photo (lamp a few degrees off the wall, room
// light filling in) has them, and the directional estimate alone integrates each
// shadow into a streak along the light. Some even-light share removes the streaks
// on real photos and costs little on the rigs, so sides use SIDE_SHARE.
export const EVEN_SHARE = 0.6;
export const SIDE_SHARE = 0.35;

// Shadow smoothing default, in painting widths (the blur's full width at half
// maximum; 0.004 = 2.4 mm on a 60 cm painting). Grain finer than this no longer
// throws shadows from the main lights (GBuffer buildShadow); the shading keeps it.
// Saves made before it existed open at 0, so they look as they did.
export const SHADOW_DETAIL = 0.004;

// Colour & strokes (shade.js). At their neutral values (0, 0, ROOM_NEUTRAL_K, 0) a
// render is exactly what it was before they existed; saves made earlier open there.
// Keep greys neutral: 0 = a daylight camera, the lights tint everything; 1 = the
// camera white-balanced to the lights' mix, so grey paint renders grey.
// Vibrance: saturation for coloured paint, near-greys left alone (-1..1).
// Room light colour: Kelvin of the room (ambient) light; ROOM_NEUTRAL_K is plain white.
// Stroke definition: darkens creases and lifts crests at brush-stroke scale, from the
// relief's curvature; Stroke size is that scale in painting widths (the smoothing's
// full width at half maximum, like Shadow smoothing). STROKE_STOPS: how many stops
// a crease at the band's 2% edge loses at 100% (crests rise half as much). The band
// stops at STROKE_FINE of Stroke size below: finer than that a one-photo relief is
// mostly grain, and darkening it reads as grit, not as strokes.
export const ROOM_NEUTRAL_K = 6500;
export const STROKE_SIZE = 0.01, STROKE_SIZE_MIN = 0.002, STROKE_SIZE_MAX = 0.04, STROKE_STOPS = 3, STROKE_FINE = 0.25;
export const LOOK_NEUTRAL = { neutralWB: 0, vibrance: 0, roomKelvin: ROOM_NEUTRAL_K, strokeDef: 0, strokeSize: STROKE_SIZE, strokeDir: 0 };

/**
 * One dial from spotlight to diffused light. Sets the three things that make the
 * difference: beam width (cone), beam edge (softness) and source size, which sets
 * shadow softness, light wrap and highlight spread.
 *   0 bare spot · 0.25 track light · 0.5 flood · 0.75 softbox · 1 window / sky
 */
export function applyCharacter(l, c) {
  const k = Math.min(1, Math.max(0, c));
  l.size = 0.01 + 0.99 * k ** 3;
  l.cone = 0.85 * Math.max(0, 1 - k / 0.6) ** 1.3;
  l.softness = 0.3 + 0.7 * k;
  return l;
}
export function characterOf(l) {
  return Math.min(1, Math.cbrt(Math.max(0, ((l.size ?? 0.03) - 0.01) / 0.99)));
}
// Where a light may sit, in painting widths/heights. Well past the edges, so a raking
// light can stand back from the painting; zoom the view out to see its dot.
export const LIGHT_MIN = -1.5, LIGHT_MAX = 2.5, LIGHT_Z_MIN = 0.01;
export const POWER_MAX = 1024;
// light.kind: an ordinary light, or a Shadow light that takes light away where it falls:
// 'shade' (a flag or a cloud between the lamps and the painting) or 'negative' (a lamp in reverse).
export const LIGHT_KINDS = ['light', 'shade', 'negative'];
export const isLamp = (l) => !l.kind || l.kind === 'light';
// A Shade's shape (shade.js shadeShape): a soft pool, or cast through window bars, blinds, leaves.
export const SHADE_SHAPES = ['pool', 'window', 'blinds', 'leaves'];

/**
 * Grazing light: the lamp almost in the painting's own plane, a painting width out
 * from the centre, so every ridge throws a long, hard shadow across the paint. Flat
 * paint only catches sin(angle) of the light there, so the brightness is raised to
 * keep the centre a little under a normal exposure: ridges facing the lamp catch
 * many times more and would otherwise blow out. 3 degrees is the default because
 * estimated relief turns glittery below that; the angle slider still goes to 1, and
 * the graze effect's Detail (below) is what keeps those low angles clean.
 */
export const GRAZE_DEG = 3, GRAZE_DISTANCE = 1;
export function grazePower(dist, deg) {
  return Math.min(POWER_MAX, 0.35 * Math.PI / ((0.5 / dist) ** 2 * Math.sin(deg * Math.PI / 180)));
}
const grazeZ = GRAZE_DISTANCE * Math.tan(GRAZE_DEG * Math.PI / 180);
// Graze effect (Graze light section): a small hard source, a dim fill so shadows read
// as shadows, and the range of angles off the wall its slider offers.
export const GRAZE_SIZE = 0.005, GRAZE_AMBIENT = 0.06, GRAZE_EL_MIN = 1, GRAZE_EL_MAX = 20;
// Graze Detail, in painting widths: relief narrower than this casts no graze shadow
// and is shaded only as a light GRAZE_FINE_DEG off the wall would show it, times
// the Fine texture amount. A light e degrees off the wall multiplies every slope's
// effect by 1/tan(e), and the finest band of a one-photo estimate is mostly paint
// grain, mottle and noise, so without this low angles turn it into a leopard-spot
// pattern of glints and tiny shadows. 0.01 (6 mm on a 60 cm painting) measured best
// on the synthetic rigs at 1-2.5 degrees (tools/graze-lab.cjs); 0 is every pixel.
export const GRAZE_DETAIL_MAX = 0.03, GRAZE_FINE_DEG = 10;
// Graze shadows. Shadow length is the share of the physical reach, the tallest
// relief over tan(angle to wall), the graze light's shadows may travel; the main
// lights bound it otherwise, a few pixels at their usual height, so a light a degree
// off the wall could never throw the long shadows it exists for. Clean shadows is
// the height, as a share of GRAZE_CLEAN_MAX of the relief's measured 2-98% spread,
// a blocker must clear before it throws any: the bumps the one-photo estimate makes
// out of grain stay under it and the real ridges do not (tools/graze-lab.cjs).
// Saved settings without them open at 0 and 0, the look before either existed.
export const GRAZE_CLEAN_MAX = 0.1;
// Graze Softness: the source's radius, from GRAZE_SIZE (a bare bulb) up to
// GRAZE_SIZE_MAX (a strip or small softbox). A bigger source softens shadow edges
// and wraps light past the terminator, which calms what grain is left at low angles
// more than spreading several hard lights round the painting did (tools/graze-lab.cjs).
export const GRAZE_SIZE_MAX = 0.04;

// Calibrate (match a raking photo): the graze light as the real lamp, measured in cm
// from the painting's edges: `left` across from the left edge, `above` the top edge
// (negative is below it), `out` from the wall. A lamp a few inches off the wall is
// not one angle: its light is several degrees steeper near it than across the
// painting, and falls off with distance, so it is placed as a point. `fill` is the
// room's soft light in the graze render (GRAZE_AMBIENT when not calibrated).
export const LAMP_OUT_MIN = 0.2, FILL_MAX = 0.6;
/** The lamp in the shading pass's units: x, y as fractions of width and height from
 *  the bottom-left corner, z in painting widths. */
export function lampPosition(lamp, widthCm, aspect) {
  return [lamp.left / widthCm, 1 + lamp.above / (widthCm * aspect), lamp.out / widthCm];
}
/** Where the lamp's light comes from at (u, v) of the painting (fractions of width
 *  and height from the bottom-left): direction (0° right, 90° top), angle to the
 *  wall in degrees, and distance in painting widths. */
export function lampAngles(lamp, widthCm, aspect, u = 0.5, v = 0.5) {
  const [x, y, z] = lampPosition(lamp, widthCm, aspect), dx = x - u, dy = (y - v) * aspect;
  return { angle: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360,
    elevation: Math.atan2(z, Math.hypot(dx, dy)) * 180 / Math.PI, dist: Math.hypot(dx, dy, z) };
}
export const grazeSize = (soft) => GRAZE_SIZE + Math.min(1, Math.max(0, soft)) * (GRAZE_SIZE_MAX - GRAZE_SIZE);

// Graze presets: starting points for common looks. Each keeps the light's direction;
// a new graze light starts as Broad soft raking. Lower angles need more Detail and Clean
// shadows, or grain turns into glitter.
export const grazePresets = {
  'Gentle raking':               { elevation: 6,   detail: 0.006, fine: 1,   reach: 1, clean: 0.15, soft: 0.2, opacity: 0.6, lift: 0 },
  // The user's own raking light (10-16, from their favourite look): broader shadows only,
  // little fine glitter, a softer source and a cleaner surface; the default for a new graze light.
  'Broad soft raking':           { elevation: 4,   detail: 0.02,  fine: 0.15, reach: 1, clean: 0.55, soft: 0.4, opacity: 0.63, lift: 0.13 },
  'Classic raking':              { elevation: 3,   detail: 0.01,  fine: 0.8, reach: 1, clean: 0.3,  soft: 0.2, opacity: 0.75, lift: 0 },
  'Long shadows':                { elevation: 1.5, detail: 0.01,  fine: 0.6, reach: 1, clean: 0.15, soft: 0.15, opacity: 0.9, lift: 0 },
  'Long shadows, clean surface': { elevation: 1,   detail: 0.012, fine: 0.5, reach: 1, clean: 0.3,  soft: 0.15, opacity: 0.9, lift: 0 },
  'Soft strip light':            { elevation: 2.5, detail: 0.01,  fine: 0.7, reach: 1, clean: 0.3,  soft: 0.5, opacity: 0.8, lift: 0 },
  'Every detail (raw)':          { elevation: 3,   detail: 0,     fine: 1,   reach: 1, clean: 0,    soft: 0,   opacity: 0.75, lift: 0 },
};

// Blend layers: copies of the photo composited over the relit result, the way an
// image editor's layer blend modes work (in display space, top of the list last).
export const MAX_LAYERS = 4;
export const blendModes = [
  ['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['softLight', 'Soft light'], ['hardLight', 'Hard light'], ['colorDodge', 'Color dodge'],
  ['colorBurn', 'Color burn'], ['linearLight', 'Linear light'], ['vividLight', 'Vivid light'],
  ['pinLight', 'Pin light'], ['darken', 'Darken'], ['lighten', 'Lighten'],
];
export const layerSources = [['original', 'Original'], ['relit', 'Relit']];

export const lightTypes = [['Spot', 0], ['Track', 0.25], ['Flood', 0.5], ['Softbox', 0.75], ['Window', 1]];

// Lighting scenes. Positions are in painting widths (x right, y up, z out from the
// wall); size is the source radius in painting widths. All lights aim at the centre.
const L = (x, y, z, power, kelvin, cone, softness, size) => ({ x, y, z, power, kelvin, cone, softness, size });
export const lighting = {
  'Gallery track':       { ambient: 0.22, lights: [L(0.3, 1.05, 0.8, 4.5, 4000, 0.3, 0.55, 0.03)] },
  'Museum spotlight':    { ambient: 0.08, lights: [L(0.5, 1.15, 0.9, 5.5, 3000, 0.8, 0.4, 0.015)] },
  'Two-spot gallery':    { ambient: 0.15, lights: [L(-0.05, 1.0, 0.85, 3.2, 3500, 0.45, 0.5, 0.025), L(1.05, 1.0, 0.85, 3.2, 3500, 0.45, 0.5, 0.025)] },
  'Soft window':         { ambient: 0.25, lights: [L(-0.3, 0.75, 0.9, 6, 6500, 0, 0.95, 0.8)] },
  'Studio softbox':      { ambient: 0.15, lights: [L(-0.1, 0.9, 0.7, 4.5, 5500, 0, 0.9, 0.35), L(1.2, 0.6, 0.9, 1.6, 5500, 0, 0.9, 0.5)] },
  'Overcast daylight':   { ambient: 0.32, lights: [L(0.5, 0.95, 1.5, 9, 6500, 0, 1, 1.5)] },
  'Raking light':        { ambient: 0.1, lights: [L(-0.12, 0.6, 0.18, 2.7, 5000, 0, 0.12, 0.02)] },
  'Soft raking':         { ambient: 0.14, lights: [L(-0.25, 0.55, 0.22, 3.2, 5000, 0, 0.8, 0.25)] },
  'Warm spotlight':      { ambient: 0.22, lights: [L(0.3, 0.85, 0.65, 3.2, 3000, 0.7, 0.55, 0.02)] },
  'Cool museum':         { ambient: 0.22, lights: [L(0.2, 0.95, 1, 4, 6000, 0.3, 0.7, 0.04), L(0.85, 0.9, 1, 2, 6000, 0.25, 0.7, 0.04)] },
  'Two-light studio':    { ambient: 0.22, lights: [L(-0.1, 0.75, 0.8, 4, 5500, 0, 0.85, 0.2), L(1.1, 0.7, 0.8, 3, 5500, 0, 0.85, 0.2)] },
  'Overhead wash':       { ambient: 0.22, lights: [L(0.5, 1.2, 0.85, 6, 4500, 0, 0.8, 0.4)] },
  'Candlelight':         { ambient: 0.04, lights: [L(0.12, 0.15, 0.3, 1.4, 1850, 0, 0.6, 0.015)] },
  'Grazing side light':  { ambient: 0.06, shadow: 1, shadowSoftness: 0.03, lights: [L(0.5 - GRAZE_DISTANCE, 0.5, grazeZ, grazePower(Math.hypot(GRAZE_DISTANCE, grazeZ), GRAZE_DEG), 5000, 0, 0.3, 0.005)] },
  'Sunset side':         { ambient: 0.22, lights: [L(-0.2, 0.55, 0.25, 3, 2400, 0, 0.25, 0.02)] },
  'Dramatic chiaroscuro':{ ambient: 0.03, lights: [L(-0.1, 1.1, 0.4, 4, 3800, 0.6, 0.3, 0.015)] },
  // One warm spot off the upper right with a white room light under it, the camera
  // mostly balanced to it (greys stay grey), richer colour and defined strokes.
  // Matched to an AI-relit image of the red panel (10-14); see HANDOFF.
  'Gallery spot, upper right': { ambient: 0.12, neutralWB: 0.7, vibrance: 0.35, roomKelvin: ROOM_NEUTRAL_K, strokeDef: 0.5, strokeSize: STROKE_SIZE,
    lights: [L(1.22, 0.75, 0.45, 4, 4300, 0, 0.5, 0.02)] },
};

// Matched looks: whole looks (lamp, graze light, exposure and tone, Colour & strokes,
// and the texture settings) tuned to an AI-relit image of the red panel the user liked
// (10-14/15, see HANDOFF; the user's round 1 picks). Round 2's softened-grain looks
// (Texture size 8, Fine 0.2, De-light 0.8-0.9) were dropped: blurry, unnatural texture. Unlike a lighting scene, a look sets everything it names and
// turns the graze light off when it has none, so applying one always gives the same image.
// Texture: reliefScale (Texture size), fineRelief (Fine texture), albedoSuppress (De-light).
const SPOT = (z = 0.45, power = 4) => [L(1.22, 0.75, z, power, 4300, 0, 0.5, 0.02)];
const RAKE25 = (opacity = 0.3) => ({ enabled: true, angle: 25, elevation: 3, opacity });
const ROUND1 = { ambient: 0.06, highlightRolloff: 1, exposure: 0.35, neutralWB: 0.6, vibrance: 0.4, strokeDef: 0.5, strokeSize: 0.01,
  roomKelvin: ROOM_NEUTRAL_K, reliefScale: 3, fineRelief: 0.65, albedoSuppress: 0.7, graze: null, lights: SPOT() };
// The user's own favourite (10-16, made by hand on the red panel; settings in
// tools/batches/user-best-10-16.settings.json): the Gallery track lamp with a low raking
// graze, a Pin light layer of the photo at 88%, bigger texture with less fine detail.
// It names more than the matched looks (surface, shadow, layers), so LOOK_KEYS carries those too;
// a look without them leaves them as they are.
const FAVOURITE = { ambient: 0.22, highlightRolloff: 0.7, exposure: 0.04, ...LOOK_NEUTRAL,
  reliefScale: 5, reliefStrength: 3.2375, chromaReject: 0.85, albedoSuppress: 0.2, fineRelief: 0.55, mediumRelief: 1.1, broadRelief: 0.55,
  roughness: 0.72, specular: 0.45, shadow: 0.85, shadowSoftness: 0.2,
  layers: [{ mode: 'pinLight', source: 'original', opacity: 0.88, enabled: true }], layersOn: 1, originalTop: 0.07,
  graze: { enabled: true, angle: 129, elevation: 4, opacity: 0.63, detail: 0.02, fine: 0.15, reach: 1, clean: 0.55, soft: 0.4, lift: 0.13 },
  lights: [L(0.3, 1.05, 0.8, 4.5, 4000, 0.3, 0.55, 0.03)] };
export const LOOK_KEYS = ['ambient', 'highlightRolloff', 'exposure', 'reliefScale', 'fineRelief', 'albedoSuppress', ...Object.keys(LOOK_NEUTRAL),
  'reliefStrength', 'chromaReject', 'mediumRelief', 'broadRelief', 'roughness', 'specular', 'shadow', 'shadowSoftness', 'layers', 'layersOn', 'originalTop'];
export const looks = {
  'Raking graze (05)':             { ...ROUND1, graze: RAKE25() },
  'Softer lamp (06)':              { ...ROUND1, lights: [L(1.22, 0.75, 0.45, 4, 4300, 0, 0.5, 0.08)] },
  'Brighter (07)':                 { ...ROUND1, exposure: 0.6 },
  'Lower lamp (09)':               { ...ROUND1, lights: SPOT(0.3, 3.5) },
  'Your favourite (10-16)':        FAVOURITE,
};

export class History {
  constructor(limit = 40) { this.limit = limit; this.entries = []; this.index = -1; }
  reset(value) { this.entries = [JSON.stringify(value)]; this.index = 0; }
  push(value) {
    const json = JSON.stringify(value);
    if (json === this.entries[this.index]) return;
    this.entries.splice(this.index + 1);
    this.entries.push(json);
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  undo() { if (this.index > 0) return JSON.parse(this.entries[--this.index]); }
  redo() { if (this.index + 1 < this.entries.length) return JSON.parse(this.entries[++this.index]); }
}

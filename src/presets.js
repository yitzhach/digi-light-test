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
// for soft even light; any share hurts a side-lit photo, so sides use none.
export const EVEN_SHARE = 0.6;

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

/**
 * Grazing light: the lamp almost in the painting's own plane, a painting width out
 * from the centre, so every ridge throws a long, hard shadow across the paint. Flat
 * paint only catches sin(angle) of the light there, so the brightness is raised to
 * keep the centre a little under a normal exposure: ridges facing the lamp catch
 * many times more and would otherwise blow out. 3 degrees is the default because
 * estimated relief turns glittery below that; the angle slider still goes to 1.
 */
export const GRAZE_DEG = 3, GRAZE_DISTANCE = 1;
export function grazePower(dist, deg) {
  return Math.min(POWER_MAX, 0.35 * Math.PI / ((0.5 / dist) ** 2 * Math.sin(deg * Math.PI / 180)));
}
const grazeZ = GRAZE_DISTANCE * Math.tan(GRAZE_DEG * Math.PI / 180);

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

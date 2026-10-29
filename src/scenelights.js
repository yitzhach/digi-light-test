// scenelights.js — light scenes for photos: the sun at every hour, window light (plain, framed,
// through blinds or leaves), overcast sky, gallery spots, the studio's portrait lighting
// (Rembrandt, loop, butterfly, split, rim), neon, candle, moonlight and a stage spot.
//
// Each scene places ordinary lights round the subject the scene reading found (SceneMaps
// describe(): where it stands and how far forward), so the same scene fits a head and
// shoulders, a figure in a room or an object on a floor. The pattern of a window frame, blinds
// or leaves is a Shade light (shade.js) on the key light's line, so it falls across the subject
// and onto what is behind it. A scene also sets the room light and its colour, the camera's
// white balance, its exposure bias and its effects (fx.js). Pure data and arithmetic: no DOM.

const DEG = Math.PI / 180;
// Light limits as studio.js validates them.
const LIM = { xy: [-1.5, 2.5], z: [0.01, 2.5] };
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/**
 * A lamp round the subject: `side` degrees round from the camera (−90 straight left, 90 straight
 * right; past ±90 it stands behind the subject), `up` degrees above the subject, `dist` image
 * widths away. Aimed at the subject.
 */
function around(ctx, side, up, dist, light) {
  const h = side * DEG, v = up * DEG, s = ctx.subject;
  const dx = Math.sin(h) * Math.cos(v), dy = Math.sin(v), dz = Math.cos(h) * Math.cos(v);
  return lamp({ x: s.x + dist * dx, y: s.y + dist * dy / ctx.aspect, z: ctx.front + dist * dz, aimX: s.x, aimY: s.y, ...light });
}
/** The sun from `side` degrees round from the camera (as `around`) and `up` above the horizon:
 *  shade.js reads a sun light's direction from its aim point to its dot. */
function sun(ctx, side, up, light) {
  const h = side * DEG, v = up * DEG;
  const d = [Math.sin(h) * Math.cos(v), Math.sin(v), Math.max(0.03, Math.cos(h) * Math.cos(v))];
  return lamp({ sun: true, x: 0.5 + d[0], y: 0.5 + d[1] / ctx.aspect, z: d[2], aimX: 0.5, aimY: 0.5, cone: 0, softness: 0.5, size: 0.012, ...light });
}
// A whole light with the panel's defaults, kept inside the limits.
function lamp(l) {
  const out = { kelvin: 5500, useKelvin: true, hex: '#ffffff', power: 4, cone: 0, softness: 0.9, size: 0.1, falloff: 2, lift: 0, enabled: true, ...l };
  out.x = clamp(out.x, LIM.xy); out.y = clamp(out.y, LIM.xy); out.z = clamp(out.z, LIM.z);
  out.aimX = clamp(out.aimX ?? out.x, LIM.xy); out.aimY = clamp(out.aimY ?? out.y, LIM.xy);
  return out;
}
const colour = (hex) => ({ useKelvin: false, hex });
// A Shade light (shade.js) on the line from `from` through the subject, casting `shape` (window,
// blinds, leaves) over the subject and on to what is behind it: the pattern of the key's light.
function pattern(ctx, from, shape, more = {}) {
  const s = ctx.subject;
  return lamp({ kind: 'shade', shape, x: from.x, y: from.y, z: from.z, aimX: clamp(s.x + (s.x - from.x) * 0.15, LIM.xy), aimY: s.y,
    kelvin: 6500, power: 2.2, dark: 0.78, cone: 0.45, softness: 0.55, size: 0.12, falloff: 0, patternSize: 1, patternRot: 0, ...more });
}

// The scenes. types: the image types it is offered for; bias: stops of exposure from the photo's
// own brightness (the dark scenes stay dark); fx: effects (fx.js) it turns on, the rest off.
export const LIGHT_SCENES = [
  { id: 'golden-hour', name: 'Golden hour', note: 'Low warm sun from the side, blue sky in the shadows, a warm haze', types: ['photo', 'portrait', 'object', 'room'], bias: -0.1,
    make: (c) => ({ lights: [sun(c, -55, 9, { kelvin: 3200, power: 2.3, size: 0.02 })], ambient: 0.22, roomKelvin: 9500, neutralWB: 0.25, shadowSoftness: 0.25,
      fx: { haze: { amount: 0.22, hex: '#ffb072' }, glow: { amount: 0.25 } } }) },
  { id: 'noon-sun', name: 'Midday sun', note: 'High hard sun, short crisp shadows, cool skylight', types: ['photo', 'portrait', 'object', 'room'], bias: 0,
    make: (c) => ({ lights: [sun(c, -25, 62, { kelvin: 5700, power: 2.1, size: 0.008 })], ambient: 0.3, roomKelvin: 8500, neutralWB: 0.4, shadowSoftness: 0.1 }) },
  { id: 'sunset', name: 'Sunset', note: 'The sun on the horizon: deep orange, long shadows, glowing air', types: ['photo', 'portrait', 'object', 'room'], bias: -0.35,
    make: (c) => ({ lights: [sun(c, -72, 3, { kelvin: 2100, power: 2.8, size: 0.025 })], ambient: 0.14, roomKelvin: 11000, neutralWB: 0, shadowSoftness: 0.3,
      fx: { haze: { amount: 0.35, hex: '#ff8a4c' }, glow: { amount: 0.35 } } }) },
  { id: 'window', name: 'Window light', note: 'A big soft window to one side, a little bounce on the other', types: ['portrait', 'object', 'room', 'photo'], bias: -0.2,
    make: (c) => ({ lights: [around(c, -70, 15, 0.8, { kelvin: 6200, power: 7, size: 0.45 }), around(c, 60, 0, 1, { kelvin: 6000, power: 1.2, size: 0.6 })],
      ambient: 0.16, roomKelvin: 6500, neutralWB: 0.5, shadowSoftness: 0.3 }) },
  { id: 'window-frame', name: 'Window, framed', note: 'Sunlight through a window: the frame\'s shadow across the subject and the wall', types: ['portrait', 'object', 'room'], bias: -0.25,
    make: (c) => { const key = around(c, -60, 25, 0.9, { kelvin: 5200, power: 7, size: 0.06, softness: 0.8 });
      return { lights: [key, around(c, 60, 0, 1, { kelvin: 6500, power: 1, size: 0.6 }), pattern(c, key, 'window', { patternSize: 1.1, patternRot: 6 })],
        ambient: 0.14, roomKelvin: 7000, neutralWB: 0.45, shadowSoftness: 0.15, fx: { rays: { amount: 0.25 } } }; } },
  { id: 'blinds', name: 'Through blinds', note: 'Sun through venetian blinds: bright stripes across everything', types: ['portrait', 'object', 'room', 'photo'], bias: -0.25,
    make: (c) => { const key = sun(c, -50, 25, { kelvin: 5200, power: 2.2 });
      return { lights: [key, pattern(c, around(c, -50, 25, 0.9), 'blinds', { patternSize: 0.9, patternRot: 18, dark: 0.85 })], ambient: 0.18, roomKelvin: 7500, neutralWB: 0.4, shadowSoftness: 0.15,
        fx: { rays: { amount: 0.2 } } }; } },
  { id: 'leaves', name: 'Dappled leaves', note: 'Sun through a tree: soft dapples of light and shade', types: ['portrait', 'object', 'photo', 'room'], bias: -0.15,
    make: (c) => ({ lights: [sun(c, -35, 45, { kelvin: 5000, power: 2.2 }), pattern(c, around(c, -35, 45, 0.9), 'leaves', { patternSize: 1.4, dark: 0.75, softness: 0.7 })],
      ambient: 0.25, roomKelvin: 7500, neutralWB: 0.35, shadowSoftness: 0.25 }) },
  { id: 'overcast', name: 'Overcast', note: 'A cloudy sky: soft even light from above, gentle shadows', types: ['photo', 'portrait', 'object', 'room'], bias: 0,
    make: (c) => ({ lights: [around(c, -10, 70, 1.4, { kelvin: 6800, power: 9, size: 1.5, softness: 1 })], ambient: 0.35, roomKelvin: 7000, neutralWB: 0.6, shadowSoftness: 0.5 }) },
  { id: 'gallery', name: 'Gallery spots', note: 'Warm track spots from the ceiling, pools of light, the room darker', types: ['room', 'object', 'portrait'], bias: -0.45,
    make: (c) => ({ lights: gallerySpots(c), ambient: 0.08, roomKelvin: 4000, neutralWB: 0.5, shadowSoftness: 0.15 }) },
  { id: 'rembrandt', name: 'Rembrandt', note: 'Key light high to one side: a triangle of light on the far cheek, deep shadow', types: ['portrait', 'object'], bias: -0.35,
    make: (c) => ({ lights: [around(c, -45, 40, 0.9, { kelvin: 4800, power: 6, size: 0.2 }), around(c, 40, 5, 1.1, { kelvin: 5000, power: 0.8, size: 0.5 })],
      ambient: 0.06, roomKelvin: 5500, neutralWB: 0.6, shadowSoftness: 0.2 }) },
  { id: 'loop', name: 'Soft key', note: 'Loop lighting: a softbox a little to the side and above, gentle fill', types: ['portrait', 'object'], bias: -0.25,
    make: (c) => ({ lights: [around(c, -30, 30, 0.9, { kelvin: 5200, power: 6, size: 0.35 }), around(c, 35, 10, 1, { kelvin: 5200, power: 1.5, size: 0.6 })],
      ambient: 0.1, roomKelvin: 6000, neutralWB: 0.6, shadowSoftness: 0.25 }) },
  { id: 'butterfly', name: 'Butterfly', note: 'Glamour light from straight above the camera, a reflector below', types: ['portrait'], bias: -0.25,
    make: (c) => ({ lights: [around(c, 0, 45, 0.9, { kelvin: 5400, power: 6, size: 0.3 }), around(c, 0, -22, 0.8, { kelvin: 5400, power: 1.5, size: 0.4 })],
      ambient: 0.08, roomKelvin: 6000, neutralWB: 0.6, shadowSoftness: 0.2 }) },
  { id: 'split', name: 'Split', note: 'One hard light straight from the side: half lit, half in shadow', types: ['portrait', 'object'], bias: -0.6,
    make: (c) => ({ lights: [around(c, -88, 5, 0.9, { kelvin: 5000, power: 6, size: 0.15 })], ambient: 0.04, roomKelvin: 6000, neutralWB: 0.6, shadowSoftness: 0.15 }) },
  { id: 'rim', name: 'Rim light', note: 'Two lights behind the subject outline it in light; a soft front fill', types: ['portrait', 'object'], bias: -0.7,
    make: (c) => ({ lights: [around(c, -115, 20, 0.6, { kelvin: 6500, power: 8, size: 0.2, target: 'subject' }), around(c, 115, 20, 0.6, { kelvin: 6500, power: 8, size: 0.2, target: 'subject' }),
      around(c, 0, 10, 1.2, { kelvin: 5500, power: 1.2, size: 0.6 })], ambient: 0.05, roomKelvin: 6500, neutralWB: 0.6, shadowSoftness: 0.2, fx: { glow: { amount: 0.2 } } }) },
  { id: 'neon', name: 'Neon', note: 'Magenta and cyan tubes either side, a dark room, glow', types: ['portrait', 'object', 'room', 'photo'], bias: -0.5,
    make: (c) => ({ lights: [around(c, -55, 15, 0.8, { ...colour('#ff2bd6'), power: 6, size: 0.25 }), around(c, 55, 15, 0.8, { ...colour('#20d8ff'), power: 6, size: 0.25 })],
      ambient: 0.04, roomKelvin: 10000, neutralWB: 0, shadowSoftness: 0.2, fx: { glow: { amount: 0.4 } } }) },
  { id: 'candle', name: 'Candlelight', note: 'One small flame low and near: warm, falling off fast into the dark', types: ['portrait', 'object', 'room'], bias: -0.8,
    make: (c) => ({ lights: [around(c, 35, -15, 0.35, { kelvin: 1800, power: 2.5, size: 0.01, softness: 0.6 })], ambient: 0.025, roomKelvin: 2500, neutralWB: 0, shadowSoftness: 0.1,
      fx: { glow: { amount: 0.3 } } }) },
  { id: 'moonlight', name: 'Moonlight', note: 'Cold light from a high moon, a dark blue night', types: ['photo', 'portrait', 'object', 'room'], bias: -1.1,
    make: (c) => ({ lights: [sun(c, -40, 35, { kelvin: 9500, power: 1.1 })], ambient: 0.06, roomKelvin: 12000, neutralWB: 0, shadowSoftness: 0.2, fx: { haze: { amount: 0.15, hex: '#3a5a9a' } } }) },
  { id: 'stage', name: 'Stage spot', note: 'A tight spot from above the stalls: the subject in a pool of light, the rest dark', types: ['portrait', 'object', 'room', 'photo'], bias: -0.9,
    make: (c) => ({ lights: [around(c, -10, 50, 1, { kelvin: 4200, power: 8, size: 0.02, cone: 0.88, softness: 0.3 })], ambient: 0.015, roomKelvin: 6000, neutralWB: 0.5, shadowSoftness: 0.1 }) },
];

// Gallery spots: on a subject, two warm spots from the ceiling either side; in a room, a row of
// three along the top of its open side, each aimed at its part of the back wall.
function gallerySpots(c) {
  const spot = { kelvin: 3000, power: 4.5, size: 0.03, cone: 0.55, softness: 0.5 };
  if (c.type !== 'room' || !c.wall) return [around(c, -25, 55, 1, spot), around(c, 25, 55, 1, spot)];
  const { x0, x1, y0, y1 } = c.wall, aimY = 1 - (y0 + y1) / 2;
  return [0.2, 0.5, 0.8].map((k) => { const aimX = x0 + (x1 - x0) * k;
    return lamp({ ...spot, power: 6, cone: 0.6, x: aimX, y: 1.12, z: c.top * 0.9 + 0.15, aimX, aimY }); });
}

// What each image type opens on when it is chosen.
export const DEFAULT_SCENE = { portrait: 'loop', object: 'window', room: 'gallery', photo: 'golden-hour' };

/** The scenes offered for image type `type`. */
export const scenesFor = (type) => LIGHT_SCENES.filter((s) => s.types.includes(type));

/**
 * Light scene `id` made for this picture (ctx: SceneMaps describe() plus the type): the settings
 * it changes, {lights, ambient, roomKelvin, neutralWB, shadowSoftness, fx}, and its bias.
 * `flip` mirrors it left to right (the key light from the right).
 */
export function lightScene(id, ctx, { flip = false } = {}) {
  const s = LIGHT_SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`No light scene "${id}". Scenes: ${LIGHT_SCENES.map((x) => x.id).join(', ')}.`);
  const out = s.make(ctx);
  if (flip) for (const l of out.lights) {
    const cx = l.sun ? 0.5 : ctx.subject.x;
    l.x = clamp(2 * cx - l.x, LIM.xy); l.aimX = clamp(2 * cx - l.aimX, LIM.xy);
    if (l.patternRot) l.patternRot = (360 - l.patternRot) % 360;
  }
  return { ...out, bias: s.bias, name: s.name, id: s.id };
}

// sun.cjs — the graze light as the sun (graze.sun), and sun photos through the app.
//   cd tools && npm install && cd .. && DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/sun.cjs   (~3 min)
//  1. graze.sun is checked like any setting: Angle to wall up to 60° with it, 20° without.
//  2. The sun lights the painting evenly: from the left at 10°, its left and right thirds keep the
//     photo's balance, where the plain graze light (a lamp a width away) falls off across it.
//  3. A sun photo's row: Light like this makes the graze light that sun (direction, angle, sky
//     share as room light); measureRelief without a deepest relief fits the depth to the photo
//     under it (Fit depth with a sun), with one keeps the artist's.
const assert = require('node:assert/strict');
const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));

(async () => {
  const s = await launch();
  const { call, page } = s;
  try {
    await call('load', { sample: 'painting' });
    await call('setGuard', false);
    // 1. Checked.
    const g = await call('set', { 'graze.enabled': true, 'graze.opacity': 1, 'graze.sun': true, 'graze.angle': 180, 'graze.elevation': 35 });
    assert.equal(g['graze.elevation'], 35);
    await assert.rejects(call('set', { 'graze.sun': false }), /nothing changed/);
    await assert.rejects(call('set', { 'graze.elevation': 61 }), /nothing changed/);
    await assert.rejects(call('set', { 'graze.sun': 'yes' }), /nothing changed/);
    await call('set', { 'graze.elevation': 10 });
    await call('set', { 'graze.sun': false });
    assert.equal(await call('get', 'graze.sun'), null, 'off: no sun field');
    console.log('PASS graze.sun checked: up to 60° with it, 20° without');

    // 2. Even light: thirds (stops against the photo) from the left at 10°, lamp against sun.
    // On an almost flat relief, so only the light varies (the painting's own relief differs by third).
    const depth = await call('get', 'textureDepthMm');
    const set = { textureDepthMm: 0.05, 'graze.detail': 0, 'graze.fine': 1, 'graze.lift': 0, 'graze.fill': 0.06, 'graze.angle': 180, 'graze.elevation': 10 };
    await call('set', set);
    const lamp = (await call('render', { metrics: true })).metrics.vsPhoto.thirds;
    await call('set', { 'graze.sun': true });
    const sun = (await call('render', { metrics: true })).metrics.vsPhoto.thirds;
    const tilt = (t) => t[0] - t[2];
    assert.ok(tilt(lamp) > 0.5, 'the lamp falls off across the painting ' + JSON.stringify(lamp));
    // (Against the photo, which was itself lit a little unevenly: about 0.15 stop.)
    assert.ok(Math.abs(tilt(sun)) < 0.25 && Math.abs(tilt(sun)) < tilt(lamp) / 5, 'the sun is even ' + JSON.stringify(sun));
    console.log('PASS the sun is even: left - right third', tilt(sun).toFixed(2), 'stops; the lamp', tilt(lamp).toFixed(2));

    // 3. A sun photo: the preview lit by a sun, as a stand-in photo of the painting in sun.
    await call('set', { textureDepthMm: depth, 'graze.angle': 135, 'graze.elevation': 15 });
    const photo = await call('render', { format: 'png' });
    await call('set', { 'graze.enabled': false, 'graze.sun': false });
    const fitted = await call('measureRelief', { photos: [{ src: photo, sun: { azimuthDeg: 135, elevationDeg: 15 } }] });
    assert.ok(fitted.measuredRelief && fitted.sun && fitted.fit && fitted.fit.depth > 0, 'Fit depth with a sun ' + JSON.stringify(fitted.fit));
    const light = await page.evaluate(() => { __studio.lamp.lightLike(0); return __bench.state.graze; });
    assert.ok(light.sun === true && light.wb === 1 && light.angle === 135 && light.elevation === 15 && light.detail === 0 && light.fine === 1 && Math.abs(light.fill - +(0.35 * fitted.shots[0].room / (1 - fitted.shots[0].room)).toFixed(3)) < 1e-9, 'Light like this, a sun ' + JSON.stringify(light));
    const kept = await call('measureRelief', { photos: [{ src: photo, sun: { azimuthDeg: 135, elevationDeg: 15 } }], deepestMm: 2 });
    assert.ok(kept.fit === null && Math.abs(kept.textureDepthMm - +(kept.depthMm * 2 / kept.rangeMm).toFixed(2)) < 0.011, 'deepest relief kept ' + JSON.stringify(kept));
    console.log('PASS sun photo: Light like this is that sun, Fit depth', JSON.stringify(fitted.fit), 'for a photo made at', depth, 'mm;', 'deepest relief', kept.textureDepthMm, 'mm');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

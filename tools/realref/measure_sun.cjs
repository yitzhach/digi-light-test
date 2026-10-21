// measure_sun.cjs — relief measured from a sunlit photo, through the app's own lamp-photo
// measurement (src/lampphotos.js), with the sun as a lamp 100 m away.
//
//   DIGILIGHT_BROWSER=... node tools/realref/measure_sun.cjs FLAT.jpg SUN.jpg OUT.digilight.json [elevationDeg] [azimuthDeg] [widthCm]
//
// SUN must be lined up onto FLAT first (tools/realref/register.py). azimuth: where the sun lay,
// in the picture's plane, degrees anticlockwise from the right (0 right, 90 up, 135 upper left);
// elevation: its angle to the painting's face. OUT is a project with the measured relief: open
// it with the CLI or the MCP server, or import it in the app. One sunlit photo gives the slopes
// along the sun's direction only, and its depth scales with tan(elevation), which no single
// photo can tell (10-21, the user's plaster door: 30° assumed, 2.39 mm on a 60 cm board).
// The app's Fit depth does not work with a lamp this far (its trial renders fade it with
// distance), so the depth is the measured spread.
const fs = require('fs');
const path = require('path');
const { launch, dataURL } = require(path.join(__dirname, '..', 'digilight-headless.cjs'));
const [flat, sun, out, elev = '30', azim = '135', width = '60'] = process.argv.slice(2);
(async () => {
  const s = await launch(); const { call, page } = s;
  await call('load', dataURL(flat));
  await call('setGuard', false);
  await call('set', { paintingWidthCm: +width });
  const info = await call('info');
  const W = +width, H = W * info.photo.height / info.photo.width;
  const e = +elev * Math.PI / 180, a = +azim * Math.PI / 180, D = 10000;   // the sun: a lamp 100 m away
  const dir = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];   // x right, y up, z out
  const lamp = { left: W / 2 + D * dir[0], above: D * dir[1] - H / 2, out: D * dir[2] };
  const res = await page.evaluate(async ([url, lamp]) => {
    const blob = await (await fetch(url)).blob();
    const f = new File([blob], 'sun.jpg', { type: 'image/jpeg' });
    const L = window.__studio.lamp; L.rows.length = 0;
    await L.addFiles([f]);
    L.rows[0].lamp = lamp;
    const r = await L.measure({ glints: true, fit: true });
    return { depthMm: r.depthMm, fit: r.fit && { depth: r.fit.depth ?? r.fit.depthMm ?? null, raw: JSON.stringify(r.fit).slice(0, 400) },
      shots: r.shots.map((x) => ({ room: x.room, usable: x.usable, glint: x.glint, align: x.align && { used: x.align.used, of: x.align.of, map: x.align.map } })),
      textureDepthMm: window.__bench.state.textureDepthMm, status: document.querySelector('#lampResult').textContent };
  }, [dataURL(sun), lamp]);
  console.log(JSON.stringify({ lamp, ...res }, null, 1));
  const p = await call('getProject', { name: 'Plaster door, relief measured from sunlight' });
  fs.writeFileSync(out, JSON.stringify(p));
  console.log('saved', out, Math.round(fs.statSync(out).size / 1024), 'KB, relief:', !!p.relief);
  await s.close();
})().catch((e) => { console.error(e); process.exit(1); });

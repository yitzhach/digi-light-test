// probe.js — Profile · height map (docs/conoscopic-paper-improvements.md items 1, 2, 19).
//
// The conoscopic-holography paper (Fontana et al.) measures a panel's surface with a
// cursor on its height map: the height profile along a line in µm, with the
// peak-to-valley (P-V) and RMS of the line and of the region around it, and a
// false-colour topographic map with a scale. Here the heights are the measured relief
// (lamp photos), in true mm, when it is in use; otherwise the relief the render uses
// (the one-photo estimate times Texture depth), labelled as estimated.
//
// Roughness numbers use the ISO names, so they mean the same to conservators:
// line (ISO 4287) Rz P-V, Rq RMS, Ra mean absolute, Rsk, Rku, after taking out the
// straight line that fits it best; region (ISO 25178) Sq, Sa, Sz, Sp, Sv, Ssk
// (impasto ridges on a flat ground read positive, cracks and crevices negative) and
// Sku (spiky above 3, rounded below), after taking out the best-fitting plane.

const MM_TO_UM = 1000;

/** "135 µm" below a millimetre, "1.42 mm" from there. */
export function fmtLen(mm) {
  if (!Number.isFinite(mm)) return '–';
  const a = Math.abs(mm);
  return a < 1 ? `${Math.round(mm * MM_TO_UM)} µm` : `${mm.toFixed(a < 10 ? 2 : 1)} mm`;
}

/** Heights along a line from (x0, y0) to (x1, y1), pixels, bilinear, every half pixel.
 *  Returns { d: distance in mm, z: height (as given) }. */
export function profile(H, w, h, x0, y0, x1, y1, mmPerPx) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(len * 2) + 1);
  const d = new Float32Array(n), z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = Math.min(w - 1, Math.max(0, x0 + (x1 - x0) * t - 0.5)), y = Math.min(h - 1, Math.max(0, y0 + (y1 - y0) * t - 0.5));
    const xi = Math.min(w - 2, Math.floor(x)), yi = Math.min(h - 2, Math.floor(y)), fx = x - xi, fy = y - yi, j = yi * w + xi;
    z[i] = (H[j] * (1 - fx) + H[j + 1] * fx) * (1 - fy) + (H[j + w] * (1 - fx) + H[j + w + 1] * fx) * fy;
    d[i] = t * len * mmPerPx;
  }
  return { d, z };
}

// Moments of residuals r: P-V, peak, valley, RMS, mean absolute, skewness, kurtosis.
function moments(r) {
  const n = r.length;
  let q2 = 0, a1 = 0, q3 = 0, q4 = 0, hi = -Infinity, lo = Infinity;
  for (const v of r) { q2 += v * v; a1 += Math.abs(v); q3 += v * v * v; q4 += v * v * v * v; if (v > hi) hi = v; if (v < lo) lo = v; }
  const q = Math.sqrt(q2 / n);
  return { pv: hi - lo, peak: hi, valley: -lo, q, a: a1 / n, sk: q > 0 ? q3 / n / q ** 3 : 0, ku: q > 0 ? q4 / n / q ** 4 : 0 };
}

/** Line roughness (ISO 4287 names) of heights z at distances d, the best straight line taken out. */
export function lineStats(d, z) {
  const n = z.length;
  let sd = 0, sz = 0, sdd = 0, sdz = 0;
  for (let i = 0; i < n; i++) { sd += d[i]; sz += z[i]; sdd += d[i] * d[i]; sdz += d[i] * z[i]; }
  const den = n * sdd - sd * sd, b = den > 0 ? (n * sdz - sd * sz) / den : 0, a = (sz - b * sd) / n;
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = z[i] - (a + b * d[i]);
  const m = moments(r);
  return { length: d[n - 1] - d[0], Rz: m.pv, Rp: m.peak, Rv: m.valley, Rq: m.q, Ra: m.a, Rsk: m.sk, Rku: m.ku, tilt: b, residual: r };
}

/** Areal roughness (ISO 25178 names) over the rectangle [x0, x1) × [y0, y1) of H, the
 *  best-fitting plane taken out. */
export function areaStats(H, w, h, x0 = 0, y0 = 0, x1 = w, y1 = h) {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
  // Plane z = a + b x + c y by least squares (normal equations, x and y centred).
  const cx = (x0 + x1 - 1) / 2, cy = (y0 + y1 - 1) / 2;
  let n = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const v = H[y * w + x], u = x - cx, t = y - cy;
    n++; sz += v; sxx += u * u; syy += t * t; sxy += u * t; sxz += u * v; syz += t * v;
  }
  if (!n) return null;
  const det = sxx * syy - sxy * sxy, b = det ? (sxz * syy - syz * sxy) / det : 0, c = det ? (syz * sxx - sxz * sxy) / det : 0, a = sz / n;
  const r = new Float64Array(n);
  let k = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r[k++] = H[y * w + x] - (a + b * (x - cx) + c * (y - cy));
  const m = moments(r);
  return { Sq: m.q, Sa: m.a, Sz: m.pv, Sp: m.peak, Sv: m.valley, Ssk: m.sk, Sku: m.ku, n, rect: [x0, y0, x1, y1] };
}

export function initProbe({ state, api, after }) {
  const $ = (id) => document.getElementById(id);
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'probeSection';
  box.innerHTML = `<summary>Profile · height map</summary><div class="grp">
    <p class="note">Measure the relief: drag a line across the painting to see its height profile, with peak-to-valley and RMS, and the roughness of the region you are looking at (zoom in to measure a smaller one). The height map shows the same relief in colour, with a scale. Heights are true only with measured relief (Measure relief · lamp photos) or a Texture depth you have checked; otherwise they are the one-photo estimate.</p>
    <div class="views"><button id="probeLine" title="Drag on the painting to draw the profile line">Draw a profile</button><button id="probeMapGrey">Height map</button><button id="probeMapColour">Colour height map</button></div>
    <svg id="probePlot" viewBox="0 0 300 130" role="img" aria-label="Height profile" hidden></svg>
    <p class="note" id="probeLineStats"></p>
    <p class="note" id="probeArea"></p>
  </div>`;
  after.after(box);

  // The line, over the painting: an SVG in #paper with the canvas's pixels as its units.
  const paper = api.canvas.parentElement, NS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(NS, 'svg'); overlay.id = 'probeOverlay';
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
  overlay.innerHTML = '<line stroke="#000" stroke-width="6" stroke-linecap="round" opacity=".6" vector-effect="non-scaling-stroke"/><line stroke="#ffd400" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
    '<circle r="5" fill="#ffd400" stroke="#000"/><circle r="5" fill="#fff" stroke="#000"/>';
  paper.append(overlay);
  // The scale bar, in the frame's corner while the Height view is shown.
  const bar = document.createElement('div'); bar.id = 'heightBar'; bar.hidden = true;
  bar.style.cssText = 'position:absolute;right:12px;bottom:12px;padding:6px 8px;background:rgba(14,16,20,.82);border-radius:6px;font:11px/1.3 system-ui,sans-serif;color:#e8eaee;pointer-events:none;z-index:5';
  bar.innerHTML = '<div id="heightBarTitle"></div><canvas width="180" height="10" style="display:block;width:180px;height:10px;margin:3px 0"></canvas><div style="display:flex;justify-content:space-between"><span></span><span></span><span></span></div>';
  $('wrap').append(bar);

  let line = null, drawing = false, tool = false;

  /** The heights in mm (Float32Array, w × h, rows top first) and where they come from. */
  function heights() {
    const m = api.measured.get(), w = api.canvas.width, h = api.canvas.height, mmPerPx = state.paintingWidthCm * 10 / w;
    let H, source;
    if (m?.on && m.w === w && m.h === h) {
      const raw = api.measured.height();
      H = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) H[i] = raw[i] * mmPerPx;
      source = 'measured';
    } else {
      const r = api.heights();
      if (!r || r.w !== w || r.h !== h) return null;
      const k = state.physical ? state.textureDepthMm * state.reliefAmount : 1;
      H = r.a.map((v) => v * k);
      source = state.physical ? 'estimated' : 'relative';
    }
    return { H, w, h, mmPerPx, source };
  }
  const unit = (src, mm) => (src === 'relative' ? mm.toFixed(3) : fmtLen(mm));
  const sourceNote = (src) => src === 'measured' ? 'measured relief (lamp photos)'
    : src === 'estimated' ? `one-photo estimate at Texture depth ${state.textureDepthMm.toFixed(2)} mm` : 'relative units (turn on physical depth for mm)';

  function drawLine() {
    const [a, b, c, d] = overlay.children;
    overlay.setAttribute('viewBox', `0 0 ${api.canvas.width} ${api.canvas.height}`);
    overlay.style.display = line ? '' : 'none';
    if (!line) return;
    for (const el of [a, b]) { el.setAttribute('x1', line[0]); el.setAttribute('y1', line[1]); el.setAttribute('x2', line[2]); el.setAttribute('y2', line[3]); }
    c.setAttribute('cx', line[0]); c.setAttribute('cy', line[1]); d.setAttribute('cx', line[2]); d.setAttribute('cy', line[3]);
  }

  // The part of the painting in view, in canvas pixels (all of it at fit), less a 2% border.
  function visibleRect() {
    const c = api.canvas, r = c.getBoundingClientRect(), f = $('wrap').getBoundingClientRect(), w = c.width, h = c.height;
    const sx = w / Math.max(1, r.width), sy = h / Math.max(1, r.height);
    let x0 = Math.max(0, (f.left - r.left) * sx), y0 = Math.max(0, (f.top - r.top) * sy);
    let x1 = Math.min(w, (f.right - r.left) * sx), y1 = Math.min(h, (f.bottom - r.top) * sy);
    if (!(x1 - x0 > 8 && y1 - y0 > 8)) { x0 = 0; y0 = 0; x1 = w; y1 = h; }
    const m = Math.round(0.02 * Math.min(w, h));
    return [Math.max(x0, m), Math.max(y0, m), Math.min(x1, w - m), Math.min(y1, h - m)];
  }

  function plot(p, st, src) {
    const svg = $('probePlot'), W = 300, Hh = 130, L = 46, R = 6, T = 8, B = 22;
    let lo = Infinity, hi = -Infinity;
    for (const v of p.z) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) { hi += 1e-3; lo -= 1e-3; }
    const X = (d) => L + (W - L - R) * d / Math.max(1e-9, st.length), Y = (z) => T + (Hh - T - B) * (hi - z) / (hi - lo);
    let pts = '';
    const step = Math.max(1, Math.floor(p.z.length / 600));
    for (let i = 0; i < p.z.length; i += step) pts += `${X(p.d[i]).toFixed(1)},${Y(p.z[i]).toFixed(1)} `;
    const mid = (lo + hi) / 2;
    svg.innerHTML = `<rect x="${L}" y="${T}" width="${W - L - R}" height="${Hh - T - B}" fill="none" stroke="currentColor" opacity=".25"/>
      <polyline points="${pts}" fill="none" stroke="#ffd400" stroke-width="1.4"/>
      <g font-size="9" fill="currentColor" opacity=".8">
      <text x="${L - 3}" y="${T + 7}" text-anchor="end">${unit(src, hi)}</text><text x="${L - 3}" y="${Y(mid) + 3}" text-anchor="end">${unit(src, mid)}</text><text x="${L - 3}" y="${Hh - B}" text-anchor="end">${unit(src, lo)}</text>
      <text x="${L}" y="${Hh - 8}">0</text><text x="${W - R}" y="${Hh - 8}" text-anchor="end">${src === 'relative' ? '' : fmtLen(st.length)} along the line</text></g>`;
    svg.hidden = false;
  }

  /** Profile of the current line and the region's roughness; returns both (tests). */
  function measure() {
    const hm = heights();
    if (!hm) { $('probeArea').textContent = 'No heights to measure for this photo (a capture, or the graphics card cannot read them back).'; return null; }
    const { H, w, h, mmPerPx, source } = hm, u = (mm) => unit(source, mm);
    let out = { source };
    if (line) {
      const p = profile(H, w, h, ...line, mmPerPx), st = lineStats(p.d, p.z);
      plot(p, st, source);
      $('probeLineStats').innerHTML = `<b>Line ${source === 'relative' ? '' : fmtLen(st.length)}</b>: P-V (Rz) ${u(st.Rz)}, RMS (Rq) ${u(st.Rq)}, Ra ${u(st.Ra)}, Rsk ${st.Rsk.toFixed(2)}, Rku ${st.Rku.toFixed(2)} (straight line taken out).`;
      out = { ...out, line: [...line], profile: p, lineStats: st };
    }
    const rect = visibleRect(), a = areaStats(H, w, h, ...rect);
    if (a) {
      const wmm = (a.rect[2] - a.rect[0]) * mmPerPx, hmm = (a.rect[3] - a.rect[1]) * mmPerPx;
      $('probeArea').innerHTML = `<b>Region in view</b> (${(wmm / 10).toFixed(1)} × ${(hmm / 10).toFixed(1)} cm, ${sourceNote(source)}): ` +
        `Sq ${u(a.Sq)}, Sa ${u(a.Sa)}, Sz ${u(a.Sz)} (Sp ${u(a.Sp)}, Sv ${u(a.Sv)}), Ssk ${a.Ssk.toFixed(2)}, Sku ${a.Sku.toFixed(2)}. ` +
        'Sq is the RMS height, Sz peak to valley; Ssk above 0 means ridges stand out of a flat ground, below 0 that cracks and crevices cut into it; Sku above 3, spiky; below, rounded.';
      out.area = a;
    }
    return out;
  }

  // Drawing the line: while the tool is on, a drag on the painting draws it (and keeps
  // the other tools, lights and brushes, from seeing the gesture).
  const toPx = (e) => { const r = api.canvas.getBoundingClientRect(); return [(e.clientX - r.left) * api.canvas.width / r.width, (e.clientY - r.top) * api.canvas.height / r.height]; };
  paper.addEventListener('pointerdown', (e) => {
    if (!tool || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const [x, y] = toPx(e); line = [x, y, x, y]; drawing = true; paper.setPointerCapture(e.pointerId); drawLine();
  }, true);
  paper.addEventListener('pointermove', (e) => {
    if (!drawing) return; e.stopPropagation();
    const [x, y] = toPx(e); line[2] = x; line[3] = y; drawLine();
  }, true);
  const end = (e) => {
    if (!drawing) return; e.stopPropagation(); drawing = false;
    if (Math.hypot(line[2] - line[0], line[3] - line[1]) < 3) { line = null; drawLine(); return; }
    measure();
  };
  paper.addEventListener('pointerup', end, true); paper.addEventListener('pointercancel', end, true);
  function setTool(on) {
    tool = on; $('probeLine').classList.toggle('on', on); $('probeLine').textContent = on ? 'Drawing: drag on the painting' : 'Draw a profile';
    paper.style.cursor = on ? 'crosshair' : '';
  }
  $('probeLine').onclick = () => setTool(!tool);

  function showMap(colour) {
    state.heightColour = colour ? 1 : 0; state.viewMode = 2;
    document.dispatchEvent(new Event('digilight:views')); api.render();
  }
  $('probeMapGrey').onclick = () => showMap(false);
  $('probeMapColour').onclick = () => showMap(true);

  // Scale bar: the Height view shows the render's heights, which are in units of the
  // relief's 2-98% spread as the render sampled it (state.heightStats), times Relief
  // amount; -0.5..0.5 fills the bar. In mm that is the sampled spread times mm per
  // pixel for measured relief (heights in pixels; true heights, so Relief amount is
  // divided back out), and Texture depth for the estimate (heights as rendered).
  function scaleBar() {
    const show = state.viewMode === 2 && state.mode === 'single';
    bar.hidden = !show; if (!show) return;
    const m = api.measured.get(), measured = m?.on && m.info?.depthMm != null;
    const half = measured ? state.heightStats.dir * state.paintingWidthCm * 10 / api.canvas.width / Math.max(1e-3, state.reliefAmount) / 2
      : state.textureDepthMm / 2;
    const rel = !state.physical && !measured;
    $('heightBarTitle').textContent = rel ? 'Height (relative)' : `Height, ${measured ? 'measured' : 'estimated'} (2–98% of the relief)`;
    const [l, c, r] = bar.querySelectorAll('span');
    l.textContent = rel ? 'low' : fmtLen(-half); c.textContent = rel ? '' : '0'; r.textContent = rel ? 'high' : fmtLen(half);
    const g = bar.querySelector('canvas').getContext('2d'), img = g.createImageData(180, 10);
    for (let x = 0; x < 180; x++) {
      const t = x / 179, [R, G, B] = state.heightColour ? turbo(t) : [t, t, t];
      for (let y = 0; y < 10; y++) { const o = (y * 180 + x) * 4; img.data[o] = R * 255; img.data[o + 1] = G * 255; img.data[o + 2] = B * 255; img.data[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
  }

  document.addEventListener('digilight:render', () => { scaleBar(); drawLine(); });
  // A new photo: the line and its numbers go.
  document.addEventListener('digilight:source', () => { line = null; drawLine(); $('probePlot').hidden = true; $('probeLineStats').textContent = ''; $('probeArea').textContent = ''; });
  drawLine();
  return { measure, setLine: (l) => { line = l ? [...l] : null; drawLine(); return measure(); }, setTool, heights };
}

// Same polynomial as shade.js's turbo(), for the scale bar.
function turbo(t) {
  t = Math.min(1, Math.max(0, t));
  const v = [1, t, t * t, t * t * t], v2 = [v[2] * v[2], v[3] * v[2]];
  const f = (k4, k2) => Math.min(1, Math.max(0, k4[0] * v[0] + k4[1] * v[1] + k4[2] * v[2] + k4[3] * v[3] + k2[0] * v2[0] + k2[1] * v2[1]));
  return [f([0.13572138, 4.61539260, -42.66032258, 132.13108234], [-152.94239396, 59.28637943]),
    f([0.09140261, 2.19418839, 4.84296658, -14.18503333], [4.27729857, 2.82956604]),
    f([0.10667330, 12.64194608, -60.58204836, 110.36276771], [-89.90310912, 27.34824973])];
}

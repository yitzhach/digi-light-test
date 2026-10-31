// export.js — full-resolution render.
//
// The preview deliberately works on a downscaled copy, because relief lives at a
// few pixels and dragging a light through a 60MP image is pointless. Export has
// the opposite priority: every pixel, however long it takes.
//
// It renders in tiles with an overlap margin. The margin is not cosmetic — the
// blur, the directional integration and the shadow march all read outside the
// pixel they are writing, so a tile rendered without context would show seams
// exactly where the relief is strongest. The same tiles render the visible part
// of a zoomed-in view from the full-resolution source (app.js, sharp zoom).

import { makeTarget, bindTarget } from './gl.js';
import { uploadShotArray } from './photometric.js';
import { FORM_OUTER } from './gbuffer.js';
import { drawResampled, resampleRegionAsync } from './resample.js';
import { fxMargin, postWanted } from './postfx.js';

/**
 * How far outside a tile the surface passes reach, in pixels. Getting this wrong
 * does not fail loudly — it seams, exactly where the relief is strongest.
 */
export function requiredMargin(state, W = 0) {
  const shadow = Math.ceil(Math.max(state.shadowDistPx || 0, state.grazeReachPx || 0)) + fxMargin(state, W);
  if (state.mode === 'photometric') {
    // Height comes from Jacobi relaxation, which moves information one texel per
    // sweep, so a pixel depends on everything within `iterations` texels. The
    // mean-removal blur that follows reaches 3 sigma further.
    const jacobi = Math.ceil(state.psJacobi || 48);
    const mean = Math.ceil(3 * (state.psMeanSigma || 16));
    return jacobi + mean + shadow + 4;
  }
  // 3 sigma of the widest luminance blur: the broad band, or Relief (3D)'s Broad form.
  const b = state.reliefBands;
  const blur = Math.ceil(3 * state.reliefScale * (b?.form > 0 ? Math.max(4, FORM_OUTER * b.formSize) : 4));
  const integrate = Math.ceil(state.integrateTaps);
  // The graze, shadow and stroke smoothed reliefs read 3 sigma beyond the heights they blur.
  const graze = Math.ceil(3 * Math.max(state.grazeSigmaPx || 0, state.shadowSigmaPx || 0, state.strokeSigmaPx || 0));
  return blur + integrate + graze + shadow + 4;
}

/**
 * Render the rectangle `rect` ({x, y, w, h} in output pixels) of a job's image into
 * the 2D context `out`, whose origin is the rectangle's corner. The export and the
 * zoomed-in view's sharp overlay both come through here.
 *
 * The image is the source at its own size, or resampled to `job.width` x
 * `job.height` (the overlay renders at about screen resolution). Tiles are padded
 * and clamped to the whole image, never to the rectangle, so any rectangle comes
 * out as the same pixels of a full render would. One padded tile, no larger than
 * maxTile, is alive on the GPU at a time.
 *
 * Several variants at once: `state` and `out` as arrays of the same length, settings that
 * share one relief (app.js surfaceKey: the same surface settings, photo and size). Each
 * tile's surface is then built once, from the first, and every variant is shaded on it
 * with its own smoothings, lights and tone, so a round of looks costs one relief build.
 *
 * `asyncRead` (the sharp zoom): each tile's photo is resampled in a worker and read back
 * without stalling the page while the GPU finishes it, so scrolling and sliders stay live; the preview may draw meanwhile, which
 * is why it needs reliefs of its own (`relief`). Exports read back at once.
 *
 * Kept reliefs (the sharp zoom): `relief` {get(key), make(key)} gives each padded tile
 * (key "x,y,w,h") its own GBuffer, which `get` returns again later so a light or tone
 * change only shades; `margin` makes the padding at least that wide, so a kept relief
 * still has room when a light's shadows grow a little.
 *
 * @param builders {gbuf, photo, shader}
 * @param job      {mode:'single', source, width?, height?} | {mode:'photometric', sources:[], solver}
 * @returns true when done; false if `cancelled()` turned true between tiles
 */
export async function renderTiles(glctx, builders, job, state, rect, out, { onProgress, cancelled, relief, margin: minMargin = 0, asyncRead = false } = {}) {
  const states = Array.isArray(state) ? state : [state], outs = Array.isArray(out) ? out : [out];
  state = states[0];
  const { gl, caps } = glctx;
  const { gbuf, photo, shader } = builders;
  const photometric = job.mode === 'photometric';
  const sources = photometric ? job.sources : [job.source];
  const source = sources[0];
  const SW = source.width || source.naturalWidth;
  const SH = source.height || source.naturalHeight;
  const W = job.width || SW, H = job.height || SH;
  // Source pixels per output pixel: 1 for an export, which resamples beforehand.
  const kx = SW / W, ky = SH / H;
  const aspect = H / W;

  // Glow and background blur work on grids a half to an eighth of the tile's size (postfx.js):
  // tiles on multiples of 8 pixels put those grids where the whole picture's are.
  const align = states.some(postWanted) ? 8 : 1;
  const margin = Math.ceil(Math.max(minMargin, ...states.map((st) => requiredMargin(st, W))) / align) * align;
  // Keep the padded tile inside the driver's texture limit with room to spare;
  // several float targets of this size are alive at once.
  // Overridable so the seam behaviour can be exercised on small test images, and
  // so a constrained device can be told to use less memory per tile. Software GL
  // keeps its targets in system memory, so it takes 4096 px tiles (about 2 GB of
  // half-float targets): fewer margins to redo, about a fifth less time per export.
  const maxTile = state.maxTile
    ? Math.max(64, state.maxTile)
    : Math.min(caps.software ? 4096 : 2048, Math.max(256, (caps.maxTexture || 4096) / 2));
  if (2 * margin + 64 > caps.maxTexture) throw new Error('Surface reach exceeds GPU limits. Reduce texture size or export scale.');
  const interior = Math.max(64, Math.floor((maxTile - 2 * margin) / align) * align);

  const cols = Math.ceil(rect.w / interior);
  const rows = Math.ceil(rect.h / interior);
  const total = cols * rows;

  // Scratch canvas for cutting padded regions out of the source.
  const cut = document.createElement('canvas');
  const cutx = cut.getContext('2d', { willReadFrequently: false });

  const tex = photometric ? null : gl.createTexture();
  let shotArray = null;
  let target = null;
  let done = 0;

  try {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (cancelled && cancelled()) return false;
        const ix0 = rect.x + tx * interior, iy0 = rect.y + ty * interior;
        const iw = Math.min(interior, rect.x + rect.w - ix0), ih = Math.min(interior, rect.y + rect.h - iy0);
        if (iw <= 0 || ih <= 0) continue;

        // Padded region, clamped to the image. Clamping means edge tiles get less
        // context than interior ones; that is correct, since there is no data to
        // be had beyond the border.
        const px0 = Math.max(0, ix0 - margin);
        const py0 = Math.max(0, iy0 - margin);
        const px1 = Math.min(W, ix0 + iw + margin);
        const py1 = Math.min(H, iy0 + ih + margin);
        const pw = px1 - px0, ph = py1 - py0;
        // The same region in source pixels.
        const from = [px0 * kx, py0 * ky, pw * kx, ph * ky];

        const key = `${px0},${py0},${pw},${ph}`;
        const kept = !photometric && relief ? relief.get(key) : null;
        let g = kept || gbuf;

        let targets;
        if (kept) {
          // The relief is already built: only this state's smoothings of it, if they differ.
          g.buildGraze(state.grazeSigmaPx ?? 0); g.buildShadow(state.shadowSigmaPx ?? 0); g.buildStroke(state.strokeSigmaPx ?? 0);
          targets = g.targets;
        } else if (photometric) {
          // Cut the same region out of every exposure. The solve is per pixel and
          // assumes all exposures see the same pixel, so they must be cut alike.
          const pieces = sources.map((src) => {
            const c = document.createElement('canvas');
            c.width = pw; c.height = ph;
            c.getContext('2d').drawImage(src, ...from, 0, 0, pw, ph);
            return c;
          });
          if (shotArray) gl.deleteTexture(shotArray);
          shotArray = uploadShotArray(gl, pieces, pw, ph);
          targets = photo.build(shotArray, job.solver, pw, ph, {
            highlightClamp: state.psClamp,
            heightGain: state.psHeightGain,
            jacobiIterations: state.psJacobi || 48,
            meanSigma: state.psMeanSigma || 16,
          });
        } else {
          cut.width = pw; cut.height = ph;
          const resized = kx !== 1 || ky !== 1;
          cutx.clearRect(0, 0, pw, ph);
          // Resized: our own area average (resample.js), the same pixels in every session;
          // the browser's high-quality drawImage was not. At 1:1 drawImage is an exact copy.
          if (resized && asyncRead) {
            const img = await resampleRegionAsync(source, W, H, px0, py0, pw, ph);
            if (cancelled && cancelled()) return false;
            cutx.putImageData(img, 0, 0);
          } else if (resized) drawResampled(cutx, source, W, H, px0, py0, pw, ph);
          else cutx.drawImage(source, ...from, 0, 0, pw, ph);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cut);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          // Measured relief and a photo's scene: this tile's window of their preview-sized maps (v up).
          const inMap = [px0 / W, (H - py1) / H, px1 / W, (H - py0) / H];
          // Made only now: a tile cancelled while its photo was resampled leaves no empty relief.
          if (relief) g = relief.make(key);
          targets = g.build(tex, pw, ph, state.measuredTex || state.sceneMap
            ? { ...state, measured: state.measuredTex ? { tex: state.measuredTex, rect: inMap } : null, sceneMap: state.sceneMap ? { ...state.sceneMap, rect: inMap } : null }
            : state);
        }

        if (!target || target.w !== pw || target.h !== ph) {
          if (target) { gl.deleteTexture(target.tex); gl.deleteFramebuffer(target.fbo); }
          target = makeTarget(gl, pw, ph, { float: false, linear: false, caps });
        }
        const buf = new Uint8Array(pw * ph * 4);
        for (let k = 0; k < states.length; k++) {
          const st = states[k], out = outs[k];
          // A variant's own smoothings of the shared relief (each reruns only if it differs).
          if (k > 0 && !photometric) { g.buildGraze(st.grazeSigmaPx ?? 0); g.buildShadow(st.shadowSigmaPx ?? 0); g.buildStroke(st.strokeSigmaPx ?? 0); }
          bindTarget(gl, target);

          // Textures are uploaded flipped, so v = 0 is the BOTTOM of the image and
          // the tile's UV origin has to be measured up from the bottom edge.
          shader.draw(targets, st, aspect, pw, ph, {
            ox: px0 / W,
            oy: (H - py1) / H,
            sx: pw / W,
            sy: ph / H,
          });

          if (asyncRead) {
            await readPixelsAsync(gl, pw, ph, buf);
            if (cancelled && cancelled()) return false;
          } else {
            gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          }

          // readPixels comes back bottom-up; un-flip while copying only the
          // interior, which is the part that had full context on every side.
          const offX = ix0 - px0, offY = iy0 - py0;
          const img = out.createImageData(iw, ih);
          for (let y = 0; y < ih; y++) {
            const srcRow = ph - 1 - (offY + y);
            let s = (srcRow * pw + offX) * 4;
            let d = y * iw * 4;
            for (let x = 0; x < iw; x++) {
              img.data[d] = buf[s]; img.data[d + 1] = buf[s + 1];
              img.data[d + 2] = buf[s + 2]; img.data[d + 3] = 255;
              s += 4; d += 4;
            }
          }
          out.putImageData(img, ix0 - rect.x, iy0 - rect.y);
        }

        done++;
        if (onProgress) onProgress(done / total, done, total);
        // Yield so the progress readout actually paints between tiles.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    bindTarget(gl, null);
    if (tex) gl.deleteTexture(tex);
    if (shotArray) gl.deleteTexture(shotArray);
    if (target) { gl.deleteTexture(target.tex); gl.deleteFramebuffer(target.fbo); }
  }
  return true;
}

/**
 * readPixels of the bound framebuffer into `buf` through a pixel buffer and a fence: the
 * copy is queued on the GPU and the page waits for it in short timeouts, not blocked.
 */
async function readPixelsAsync(gl, w, h, buf) {
  const pbo = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, buf.byteLength, gl.STREAM_READ);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  try {
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) await new Promise((r) => setTimeout(r, 4));
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  } finally {
    gl.deleteSync(sync);
    gl.deleteBuffer(pbo);
  }
}

/**
 * The whole image at the source's own resolution, or `job.rect` ({x, y, w, h} in its
 * pixels) of it: the same pixels a whole export has there, for a fraction of the time.
 * `state` should already be scaled to that resolution (renderState in app.js does it).
 * An array of states (variants sharing a relief, see renderTiles) returns one canvas each.
 */
export async function exportFullRes(glctx, builders, job, state, onProgress) {
  const source = job.mode === 'photometric' ? job.sources[0] : job.source;
  // job.width / height render it smaller than the photo (tiles resample the source).
  const W = job.width || source.width || source.naturalWidth;
  const H = job.height || source.height || source.naturalHeight;
  const rect = job.rect || { x: 0, y: 0, w: W, h: H };
  const many = Array.isArray(state), states = many ? state : [state];
  const outs = states.map(() => { const c = document.createElement('canvas'); c.width = rect.w; c.height = rect.h; return c; });
  const ctxs = outs.map((c) => c.getContext('2d', { willReadFrequently: false }));

  // An export leaves out what only the screen shows: the split and the mask tint.
  const prevExporting = states.map((s) => s.exporting);
  for (const s of states) s.exporting = true;
  try {
    await renderTiles(glctx, builders, job, many ? states : state, rect, many ? ctxs : ctxs[0], { onProgress });
  } finally {
    states.forEach((s, i) => { s.exporting = prevExporting[i]; });
  }
  return many ? outs : outs[0];
}

export function downloadCanvas(canvas, filename, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not encode the image.'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve(blob.size);
    }, type, quality);
  });
}

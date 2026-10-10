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

/**
 * How far outside a tile the surface passes reach, in pixels. Getting this wrong
 * does not fail loudly — it seams, exactly where the relief is strongest.
 */
export function requiredMargin(state) {
  const shadow = Math.ceil(state.shadowDistPx || 0);
  if (state.mode === 'photometric') {
    // Height comes from Jacobi relaxation, which moves information one texel per
    // sweep, so a pixel depends on everything within `iterations` texels. The
    // mean-removal blur that follows reaches 3 sigma further.
    const jacobi = Math.ceil(state.psJacobi || 48);
    const mean = Math.ceil(3 * (state.psMeanSigma || 16));
    return jacobi + mean + shadow + 4;
  }
  const blur = Math.ceil(12 * state.reliefScale);
  const integrate = Math.ceil(state.integrateTaps);
  // The graze light's smoothed relief reads 3 sigma beyond the heights it blurs.
  const graze = Math.ceil(3 * (state.grazeSigmaPx || 0));
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
 * @param builders {gbuf, photo, shader}
 * @param job      {mode:'single', source, width?, height?} | {mode:'photometric', sources:[], solver}
 * @returns true when done; false if `cancelled()` turned true between tiles
 */
export async function renderTiles(glctx, builders, job, state, rect, out, { onProgress, cancelled } = {}) {
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

  const margin = requiredMargin(state);
  // Keep the padded tile inside the driver's texture limit with room to spare;
  // several float targets of this size are alive at once.
  // Overridable so the seam behaviour can be exercised on small test images, and
  // so a constrained device can be told to use less memory per tile.
  const maxTile = state.maxTile
    ? Math.max(64, state.maxTile)
    : Math.min(2048, Math.max(256, (caps.maxTexture || 4096) / 2));
  if (2 * margin + 64 > caps.maxTexture) throw new Error('Surface reach exceeds GPU limits. Reduce texture size or export scale.');
  const interior = Math.max(64, maxTile - 2 * margin);

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

        cut.width = pw; cut.height = ph;
        // Resampling down in one step wants a better filter than the default.
        if (kx !== 1 || ky !== 1) cutx.imageSmoothingQuality = 'high';

        let targets;
        if (photometric) {
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
          cutx.clearRect(0, 0, pw, ph);
          cutx.drawImage(source, ...from, 0, 0, pw, ph);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cut);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          targets = gbuf.build(tex, pw, ph, state);
        }

        if (!target || target.w !== pw || target.h !== ph) {
          if (target) { gl.deleteTexture(target.tex); gl.deleteFramebuffer(target.fbo); }
          target = makeTarget(gl, pw, ph, { float: false, linear: false, caps });
        }
        bindTarget(gl, target);

        // Textures are uploaded flipped, so v = 0 is the BOTTOM of the image and
        // the tile's UV origin has to be measured up from the bottom edge.
        shader.draw(targets, state, aspect, pw, ph, {
          ox: px0 / W,
          oy: (H - py1) / H,
          sx: pw / W,
          sy: ph / H,
        });

        const buf = new Uint8Array(pw * ph * 4);
        gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);

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
 * The whole image at the source's own resolution. `state` should already be
 * scaled to that resolution (renderState in app.js does it).
 */
export async function exportFullRes(glctx, builders, job, state, onProgress) {
  const source = job.mode === 'photometric' ? job.sources[0] : job.source;
  const W = source.width || source.naturalWidth;
  const H = source.height || source.naturalHeight;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d', { willReadFrequently: false });

  // An export leaves out what only the screen shows: the split and the mask tint.
  const prevExporting = state.exporting;
  state.exporting = true;
  try {
    await renderTiles(glctx, builders, job, state, { x: 0, y: 0, w: W, h: H }, octx, { onProgress });
  } finally {
    state.exporting = prevExporting;
  }
  return out;
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

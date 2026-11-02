// resampleworker.js — resample.js's area average off the page's thread (resampleRegionAsync).
// Messages: {bitmap} sets the photo; {id, W, H, ox, oy, ow, oh, space} answers {id, data} (RGBA
// bytes in that colour space, transferred) or {id, error}.

import { resampleRegion } from './resample.js';

let bitmap = null;
onmessage = ({ data }) => {
  if (data.bitmap) { bitmap?.close(); bitmap = data.bitmap; return; }
  const { id, W, H, ox, oy, ow, oh, space } = data;
  try {
    const img = resampleRegion(bitmap, W, H, ox, oy, ow, oh, () => new OffscreenCanvas(1, 1), space);
    postMessage({ id, data: img.data.buffer }, [img.data.buffer]);
  } catch (e) {
    postMessage({ id, error: String(e) });
  }
};

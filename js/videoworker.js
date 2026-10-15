// Background video rendering: the whole zoom video is rendered and encoded here, on an OffscreenCanvas,
// so the app stays responsive while it runs.
importScripts('util.js', 'palettes.js', 'formula.js', 'hp.js', 'deep.js', 'escape.js', 'ifs.js', 'attractor.js', 'vector.js', 'fractal3d.js', 'presets.js', 'video.js');

let cancelled = false;

function capable(type) {
  if (typeof OffscreenCanvas === 'undefined' || !Video.supported()) return false;
  if (type === 'escape' || type === '3d') {
    try { return !!new OffscreenCanvas(2, 2).getContext('webgl2'); } catch { return false; }
  }
  return true;
}

onmessage = async (e) => {
  const m = e.data;
  if (m.cmd === 'cancel') { cancelled = true; return; }
  if (m.cmd !== 'start') return;
  if (!capable(m.job.def.type)) { postMessage({ type: 'unsupported' }); return; }
  try {
    const blob = await Video.renderZoom(m.job, {
      onStatus: (text, frac) => postMessage({ type: 'progress', text, frac }),
      isCancelled: () => cancelled,
    });
    postMessage({ type: 'done', blob });
  } catch (err) {
    postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

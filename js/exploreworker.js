// Finds "interesting spots" off the main thread (used by automatic zooming), so steering never stalls
// the UI even at deep zoom where each search runs a CPU perturbation over a few hundred points.
importScripts('util.js', 'palettes.js', 'formula.js', 'hp.js', 'deep.js', 'explore.js');

onmessage = (e) => {
  const { id, def, view, aspect, iter, samples } = e.data;
  try {
    const pv = HP.fromView(view);
    const s = Explore.findSpot(def, pv, aspect, iter, samples);
    if (!s) { postMessage({ id, point: null }); return; }
    const p = HP.pointAt(pv, s.qx, s.qy);
    postMessage({ id, point: { x: p.x, y: p.y, P: p.P }, n: s.n });
  } catch (err) {
    postMessage({ id, point: null, error: err && err.message });
  }
};

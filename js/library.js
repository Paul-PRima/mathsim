// Persistent user library (localStorage) + thumbnail rendering.
const Library = (() => {
  const KEY = 'fractalsim.library.v1';

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function save(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
      return true;
    } catch (e) {
      U.toast('Could not save: browser storage is full or blocked');
      return false;
    }
  }

  // Favourites are stored separately (by id) so built-ins can be favourited too.
  const FAV_KEY = 'fractalsim.favourites.v1';
  function favs() {
    try {
      const v = JSON.parse(localStorage.getItem(FAV_KEY));
      return new Set(Array.isArray(v) ? v : []);
    } catch {
      return new Set();
    }
  }
  function toggleFav(id) {
    const f = favs();
    if (f.has(id)) f.delete(id); else f.add(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...f])); } catch { /* storage blocked */ }
    return f.has(id);
  }

  return { load, save, favs, toggleFav };
})();

const Thumbs = (() => {
  const W = 240, H = 150;
  let glCanvas = null, gl = null, cv2 = null, ctx2 = null, cv3 = null, r3 = null;

  function make(def) {
    try {
      if (def.type === '3d') {
        if (!r3) {
          cv3 = document.createElement('canvas');
          cv3.width = W;
          cv3.height = H;
          r3 = new F3D.Renderer(cv3, { preserve: true });
        }
        r3.draw(def, def.camera);
        return cv3.toDataURL('image/jpeg', 0.85);
      }
      if (def.type === 'escape') {
        if (!gl) {
          glCanvas = document.createElement('canvas');
          glCanvas.width = W;
          glCanvas.height = H;
          gl = new EscapeGL.EscapeRenderer(glCanvas, true);
        }
        const pv = HP.fromView(def.view);
        gl.draw(def, pv, { aa: 2, time: 0, maxIter: Defs.effIter(def, pv.L) });
        return glCanvas.toDataURL('image/jpeg', 0.85);
      }
      if (!cv2) {
        cv2 = document.createElement('canvas');
        cv2.width = W;
        cv2.height = H;
        ctx2 = cv2.getContext('2d');
      }
      if (def.type === 'vector') {
        Vec.draw(ctx2, def, HP.approx(HP.fromView(def.view)), W, H, 0.6);
        return cv2.toDataURL('image/png');
      }
      const view = def.view || IFS.fit(def, W / H);
      const st = IFS.createAccum(W, H);
      IFS.reset(st, view, IFS.prepare(def));
      IFS.iterate(st, 300000);
      const img = ctx2.createImageData(W, H);
      IFS.toImage(st, def, img);
      ctx2.putImageData(img, 0, 0);
      return cv2.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      return null;
    }
  }

  return { make, W, H };
})();

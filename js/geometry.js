// Geometry: GeoGebra-style constructions. Free points can be dragged; everything built from them follows.
// Objects only refer to earlier objects, so computing them in list order resolves every dependency.
const Geo = (() => {
  // ---------------------------------------------------------------- pure geometry (also used by tests)
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const crs = (a, b) => a.x * b.y - a.y * b.x;
  const len = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => len(sub(a, b));
  // a line-like object: point p, direction d, kind 'line' | 'segment' | 'ray' (segments: p → p + d)
  const onLine = (L, t) => (L.kind === 'line' ? true : L.kind === 'ray' ? t >= -1e-9 : t >= -1e-9 && t <= 1 + 1e-9);
  function lineLine(A, B) {
    const den = crs(A.d, B.d);
    if (Math.abs(den) < 1e-12) return [];
    const w = sub(B.p, A.p), t = crs(w, B.d) / den, u = crs(w, A.d) / den;
    if (!onLine(A, t) || !onLine(B, u)) return [];
    return [add(A.p, mul(A.d, t))];
  }
  function lineCircle(L, C) {
    const f = sub(L.p, C.c), a = dot(L.d, L.d), b = 2 * dot(f, L.d), c = dot(f, f) - C.r * C.r;
    const D = b * b - 4 * a * c;
    if (D < -1e-12) return [];
    const s = Math.sqrt(Math.max(0, D));
    return [(-b - s) / (2 * a), (-b + s) / (2 * a)].map((t) => (onLine(L, t) ? add(L.p, mul(L.d, t)) : null));
  }
  function circleCircle(A, B) {
    const d = dist(A.c, B.c);
    if (d < 1e-12 || d > A.r + B.r + 1e-12 || d < Math.abs(A.r - B.r) - 1e-12) return [];
    const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a));
    const m = add(A.c, mul(sub(B.c, A.c), a / d)), n = { x: -(B.c.y - A.c.y) / d, y: (B.c.x - A.c.x) / d };
    return [add(m, mul(n, h)), sub(m, mul(n, h))];
  }
  function intersect(A, B) {
    if (A.d && B.d) return lineLine(A, B);
    if (A.d && B.c) return lineCircle(A, B);
    if (A.c && B.d) return lineCircle(B, A);
    if (A.c && B.c) return circleCircle(A, B);
    return [];
  }
  const angleAt = (a, b, c) => { // angle ABC in degrees, 0…180
    const u = sub(a, b), v = sub(c, b);
    return (Math.acos(U.clamp(dot(u, v) / (len(u) * len(v) || 1), -1, 1)) * 180) / Math.PI;
  };
  const polyArea = (pts) => Math.abs(pts.reduce((s, p, i) => s + crs(p, pts[(i + 1) % pts.length]), 0)) / 2;

  // Computes every object's geometry. objs: [{ id, type, ... }]; returns Map id -> geometry (or null).
  function solve(objs, withLoci = true) {
    const G = new Map();
    const P = (id) => { const g = G.get(id); return g && g.pt ? g.pt : null; };
    for (const o of objs) {
      let g = null;
      try {
        switch (o.type) {
          case 'point': g = { pt: { x: o.x, y: o.y } }; break;
          case 'onObj': { // a point that stays on a circle (t = angle) or a line (t = position along it)
            const H = G.get(o.on);
            if (H && H.c) g = { pt: { x: H.c.x + H.r * Math.cos(o.t), y: H.c.y + H.r * Math.sin(o.t) } };
            else if (H && H.d) { const t = H.kind === 'segment' ? U.clamp(o.t, 0, 1) : H.kind === 'ray' ? Math.max(0, o.t) : o.t; g = { pt: add(H.p, mul(H.d, t)) }; }
            break;
          }
          case 'midpoint': { const a = P(o.a), b = P(o.b); if (a && b) g = { pt: mul(add(a, b), 0.5) }; break; }
          case 'intersection': {
            const A = G.get(o.a), B = G.get(o.b);
            if (A && B) { const pts = intersect(A, B); const p = pts[o.which || 0]; if (p) g = { pt: p }; }
            break;
          }
          case 'segment': case 'line': case 'ray': {
            const a = P(o.a), b = P(o.b);
            if (a && b && dist(a, b) > 1e-12) g = { p: a, d: sub(b, a), kind: o.type, a, b };
            break;
          }
          case 'perp': case 'parallel': {
            const L = G.get(o.line), p = P(o.p);
            if (L && L.d && p) g = { p, d: o.type === 'perp' ? { x: -L.d.y, y: L.d.x } : L.d, kind: 'line' };
            break;
          }
          case 'bisector': {
            const a = P(o.a), b = P(o.b);
            if (a && b && dist(a, b) > 1e-12) { const d = sub(b, a); g = { p: mul(add(a, b), 0.5), d: { x: -d.y, y: d.x }, kind: 'line' }; }
            break;
          }
          case 'circle': { const c = P(o.c), p = P(o.p); if (c && p) g = { c, r: dist(c, p) }; break; }
          // transformed points
          case 'reflectL': { const p = P(o.src), L = G.get(o.line); if (p && L && L.d) { const t = dot(sub(p, L.p), L.d) / dot(L.d, L.d); g = { pt: sub(mul(add(L.p, mul(L.d, t)), 2), p) }; } break; }
          case 'reflectP': { const p = P(o.src), c = P(o.c); if (p && c) g = { pt: sub(mul(c, 2), p) }; break; }
          case 'rotate': { const p = P(o.src), c = P(o.c); if (p && c) { const a = (o.deg * Math.PI) / 180, v = sub(p, c); g = { pt: add(c, { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) }) }; } break; }
          case 'translate': { const p = P(o.src), a = P(o.a), b = P(o.b); if (p && a && b) g = { pt: add(p, sub(b, a)) }; break; }
          case 'dilate': { const p = P(o.src), c = P(o.c); if (p && c) g = { pt: add(c, mul(sub(p, c), o.k)) }; break; }
          case 'locus': { // the path of point p while the point q slides along its line or circle
            if (!withLoci) break;
            const qi = objs.findIndex((x) => x.id === o.q), Q = objs[qi], H = Q && G.get(Q.on);
            if (!Q || Q.type !== 'onObj' || !H) break;
            const upto = objs.slice(0, objs.indexOf(o)).map((x) => (x.id === Q.id ? { ...x } : x));
            const q = upto.find((x) => x.id === Q.id);
            const [t0, t1] = H.c ? [-Math.PI, Math.PI] : H.kind === 'segment' ? [0, 1] : H.kind === 'ray' ? [0, 40] : [-20, 20];
            const path = [];
            for (let i = 0; i <= 240; i++) {
              q.t = t0 + ((t1 - t0) * i) / 240;
              const g2 = solve(upto, false).get(o.p);
              path.push(g2 && g2.pt ? g2.pt : null);
            }
            g = { path };
            break;
          }
          case 'circleR': { const c = P(o.c); if (c && o.r > 0) g = { c, r: o.r }; break; }
          case 'angle': { const a = P(o.a), b = P(o.b), c = P(o.c); if (a && b && c) g = { a, b, c, deg: angleAt(a, b, c) }; break; }
          case 'polygon': { const pts = o.pts.map(P); if (pts.every(Boolean)) g = { pts, area: polyArea(pts), per: pts.reduce((s, p, i) => s + dist(p, pts[(i + 1) % pts.length]), 0) }; break; }
        }
      } catch { g = null; }
      G.set(o.id, g);
    }
    return G;
  }
  function paramOn(H, p) {
    if (H.c) return Math.atan2(p.y - H.c.y, p.x - H.c.x);
    return dot(sub(p, H.p), H.d) / dot(H.d, H.d);
  }
  return { solve, intersect, angleAt, polyArea, dist, paramOn };
})();

(() => {
  const { el } = U;
  const KEY = 'mathsim.geometry.v1';
  const PT_COLOR = '#4dabf7', CIRCLE_COLOR = '#51cf66', ANGLE_COLOR = '#ffc078', POLY_COLOR = '#cc5de8';
  const st = { objs: [], view: { cx: 0, cy: 0, s: 0.02 }, grid: true, snap: true, nextId: 1 };
  let cv, ctx, W = 1, H = 1, listEl, hintEl;
  let tool = 'move', pending = [], mouse = null, G = new Map(), hover = null, queued = false;
  const hist = { past: [], future: [] };

  const TOOLS = [
    ['move', '↖', 'Move', 'Drag points · drag the background to pan · scroll to zoom'],
    ['point', '•', 'Point', 'Click to place a point — on a line or circle it stays on it'],
    ['segment', '⁄', 'Segment', 'Click two points'],
    ['line', '↔', 'Line', 'Click two points'],
    ['ray', '→', 'Ray', 'Click the start point, then a point it passes through'],
    ['circle', '◯', 'Circle', 'Click the centre, then a point on the circle'],
    ['circleR', '⊙', 'Circle by radius', 'Click the centre, then type the radius'],
    ['midpoint', '⋯', 'Midpoint', 'Click two points'],
    ['bisector', '⊥̶', 'Perp. bisector', 'Click two points'],
    ['perp', '⊥', 'Perpendicular', 'Click a line, then a point'],
    ['parallel', '∥', 'Parallel', 'Click a line, then a point'],
    ['intersect', '✕', 'Intersect', 'Click two lines or circles'],
    ['angle', '∠', 'Angle', 'Click three points — the middle one is the vertex'],
    ['polygon', '⬠', 'Polygon', 'Click the corners, then the first one again'],
    ['reflect', '⇋', 'Reflect', 'Click the object, then the mirror line (or a point)'],
    ['rotate', '⟲', 'Rotate', 'Click the object, then the centre, then type the angle'],
    ['translate', '⇉', 'Translate', 'Click the object, then two points for the vector'],
    ['dilate', '⤢', 'Enlarge', 'Click the object, then the centre, then type the factor'],
    ['locus', '∿', 'Locus', 'Click a point, then the point on a line or circle that drives it'],
    ['trace', '✎', 'Trace', 'Click a point to leave a trail when things move (click again to stop)'],
    ['delete', '🗑', 'Delete', 'Click an object (anything built on it goes too)'],
  ];

  // ---------------------------------------------------------------- naming
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function nextName(type) {
    const used = new Set(st.objs.map((o) => o.name));
    const pick = (alphabet, suffix = '') => { for (const c of alphabet) if (!used.has(c + suffix)) return c + suffix; return null; };
    if (['point', 'onObj', 'midpoint', 'intersection', 'reflectL', 'reflectP', 'rotate', 'translate', 'dilate'].includes(type)) { for (let k = 0; ; k++) { const n = pick(LETTERS, k ? String(k) : ''); if (n) return n; } }
    if (['circle', 'circleR'].includes(type)) { for (let k = 0; ; k++) { const n = pick('cdkpq', k ? String(k) : ''); if (n) return n; } }
    if (type === 'angle') { for (let k = 0; ; k++) { const n = pick('αβγδεζηθ', k ? String(k) : ''); if (n) return n; } }
    if (type === 'polygon') { for (let k = 1; ; k++) if (!used.has('poly' + k)) return 'poly' + k; }
    for (let k = 0; ; k++) { const n = pick('fghjlmnrstuvw', k ? String(k) : ''); if (n) return n; }
  }
  const byId = (id) => st.objs.find((o) => o.id === id);
  const nm = (id) => (byId(id) || {}).name || '?';

  // ---------------------------------------------------------------- state
  const save = U.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } }, 300);
  function snapshot() { hist.past.push(JSON.stringify(st.objs)); if (hist.past.length > 100) hist.past.shift(); hist.future = []; }
  function undo() { if (!hist.past.length) return U.toast('Nothing to undo'); hist.future.push(JSON.stringify(st.objs)); st.objs = JSON.parse(hist.past.pop()); changed(); }
  function redo() { if (!hist.future.length) return U.toast('Nothing to redo'); hist.past.push(JSON.stringify(st.objs)); st.objs = JSON.parse(hist.future.pop()); changed(); }
  function create(o) {
    o.id = st.nextId++;
    o.name = nextName(o.type);
    st.objs.push(o);
    return o;
  }
  function removeWithDependents(id) {
    const gone = new Set([id]);
    for (const o of st.objs) {
      const refs = [o.a, o.b, o.c, o.p, o.q, o.line, o.on, o.src, ...(o.pts || [])].filter((v) => v != null);
      if (refs.some((r) => gone.has(r))) gone.add(o.id);
    }
    st.objs = st.objs.filter((o) => !gone.has(o.id));
  }
  function changed() { G = Geo.solve(st.objs); recordTraces(); renderList(); save(); requestDraw(); }
  function recordTraces() {
    for (const o of st.objs) {
      if (!o.trace) continue;
      const g = G.get(o.id);
      if (!g || !g.pt) continue;
      const t = traces.get(o.id) || [];
      const last = t[t.length - 1];
      if (!last || Math.hypot(last.x - g.pt.x, last.y - g.pt.y) > st.view.s * 2) t.push({ x: g.pt.x, y: g.pt.y });
      if (t.length > 5000) t.shift();
      traces.set(o.id, t);
    }
  }

  // ---------------------------------------------------------------- view
  const toPx = (x) => W / 2 + (x - st.view.cx) / st.view.s;
  const toPy = (y) => H / 2 - (y - st.view.cy) / st.view.s;
  const fromPx = (px) => st.view.cx + (px - W / 2) * st.view.s;
  const fromPy = (py) => st.view.cy - (py - H / 2) * st.view.s;
  const snapV = (v) => { if (!st.snap) return v; const g = Charts.niceStep(60 * st.view.s, 1) / 2; return Math.abs(v / g - Math.round(v / g)) * g < 8 * st.view.s ? Math.round(v / g) * g : v; };

  // ---------------------------------------------------------------- hit testing
  function distToGeom(g, px, py) {
    if (!g) return Infinity;
    const p = { x: fromPx(px), y: fromPy(py) };
    if (g.pt) return Math.hypot(toPx(g.pt.x) - px, toPy(g.pt.y) - py);
    if (g.d) {
      const L2 = g.d.x * g.d.x + g.d.y * g.d.y;
      let t = ((p.x - g.p.x) * g.d.x + (p.y - g.p.y) * g.d.y) / L2;
      if (g.kind === 'segment') t = U.clamp(t, 0, 1); else if (g.kind === 'ray') t = Math.max(0, t);
      const q = { x: g.p.x + t * g.d.x, y: g.p.y + t * g.d.y };
      return Math.hypot(toPx(q.x) - px, toPy(q.y) - py);
    }
    if (g.c) return Math.abs(Math.hypot(p.x - g.c.x, p.y - g.c.y) - g.r) / st.view.s;
    if (g.pts) { // inside the polygon counts as a hit
      let inside = false;
      for (let i = 0, j = g.pts.length - 1; i < g.pts.length; j = i++) {
        const a = g.pts[i], b = g.pts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside ? 7 : Infinity;
    }
    if (g.deg != null) return Math.hypot(toPx(g.b.x) - px, toPy(g.b.y) - py) < 24 ? 8 : Infinity;
    return Infinity;
  }
  // nearest object accepted by `filter` within reach; points win over curves
  function pick(px, py, filter = () => true) {
    let best = null, bd = Infinity;
    for (const o of st.objs) {
      if (o.hidden || !filter(o)) continue;
      const g = G.get(o.id);
      const d = distToGeom(g, px, py) - (g && g.pt ? 4 : 0);
      if (d < bd && d < (g && g.pt ? 10 : 7)) { bd = d; best = o; }
    }
    return best;
  }
  const isPoint = (o) => { const g = G.get(o.id); return !!(g && g.pt); };
  const isLine = (o) => { const g = G.get(o.id); return !!(g && g.d); };
  const isCurve = (o) => { const g = G.get(o.id); return !!(g && (g.d || g.c)); };
  // an existing point under the cursor, or a new free point there
  function pointAt(px, py) {
    const o = pick(px, py, isPoint);
    if (o) return o.id;
    const on = pick(px, py, isCurve);
    if (on) {
      const p = create({ type: 'onObj', on: on.id, t: Geo.paramOn(G.get(on.id), { x: fromPx(px), y: fromPy(py) }) });
      G = Geo.solve(st.objs);
      return p.id;
    }
    const p = create({ type: 'point', x: snapV(fromPx(px)), y: snapV(fromPy(py)) });
    G = Geo.solve(st.objs);
    return p.id;
  }

  // ---------------------------------------------------------------- tools
  function setTool(t) {
    tool = t; pending = [];
    document.querySelectorAll('.geo-tool').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    const info = TOOLS.find((x) => x[0] === t);
    hintEl.textContent = info ? `${info[2]}: ${info[3]}` : '';
    requestDraw();
  }
  // Builds the image of object o, using mk(pointId) → id of that point's image.
  function transformObject(o, mk, k = 1) {
    const pointTypes = ['point', 'onObj', 'midpoint', 'intersection', 'reflectL', 'reflectP', 'rotate', 'translate', 'dilate'];
    if (pointTypes.includes(o.type)) return mk(o.id);
    if (['segment', 'line', 'ray'].includes(o.type)) return create({ type: o.type, a: mk(o.a), b: mk(o.b) }).id;
    if (o.type === 'circle') return create({ type: 'circle', c: mk(o.c), p: mk(o.p) }).id;
    if (o.type === 'circleR') return create({ type: 'circleR', c: mk(o.c), r: o.r * Math.abs(k) }).id;
    if (o.type === 'polygon') return create({ type: 'polygon', pts: o.pts.map(mk) }).id;
    if (o.type === 'angle') return create({ type: 'angle', a: mk(o.a), b: mk(o.b), c: mk(o.c) }).id;
    if (o.type === 'bisector') return create({ type: 'bisector', a: mk(o.a), b: mk(o.b) }).id;
    U.toast('Transform the points this object is built from instead');
    return null;
  }
  function applyTransform(o, spec) {
    const made = new Map();
    const mk = (id) => {
      if (made.has(id)) return made.get(id);
      const src = byId(id);
      const p = create(Object.assign({ src: id }, spec));
      if (src && !st.objs.some((x) => x.name === src.name + '′')) p.name = src.name + '′';
      made.set(id, p.id);
      return p.id;
    };
    transformObject(o, mk, spec.k);
  }
  const traces = new Map(); // point id → trail of positions

  async function clickTool(px, py) {
    const twoPoints = { segment: 1, line: 1, ray: 1, circle: 1, midpoint: 1, bisector: 1 };
    if (tool === 'point') { snapshot(); pointAt(px, py); changed(); return; }
    if (tool === 'delete') { const o = pick(px, py); if (o) { snapshot(); removeWithDependents(o.id); changed(); } return; }
    if (twoPoints[tool]) {
      if (!pending.length) snapshot();
      pending.push(pointAt(px, py));
      if (pending.length === 2) {
        if (pending[0] !== pending[1]) {
          if (tool === 'circle') create({ type: 'circle', c: pending[0], p: pending[1] });
          else create({ type: tool, a: pending[0], b: pending[1] });
        }
        pending = [];
      }
      changed();
      return;
    }
    if (tool === 'circleR') {
      snapshot();
      const c = pointAt(px, py);
      changed();
      const v = await U.ask('Radius', '2');
      const r = v == null ? NaN : MX.evaluate(v);
      if (r > 0) create({ type: 'circleR', c, r }); else U.toast('The radius must be a positive number');
      changed();
      return;
    }
    if (tool === 'perp' || tool === 'parallel') {
      const ln = pick(px, py, isLine);
      if (!pending.length) snapshot();
      if (ln && !pending.some((x) => x.line)) pending.push({ line: ln.id });
      else pending.push({ p: pointAt(px, py) });
      const L = pending.find((x) => x.line), P = pending.find((x) => x.p);
      if (L && P) { create({ type: tool, line: L.line, p: P.p }); pending = []; }
      changed();
      return;
    }
    if (tool === 'intersect') {
      const o = pick(px, py, isCurve);
      if (!o) return;
      pending.push(o.id);
      if (pending.length === 2 && pending[0] !== pending[1]) {
        snapshot();
        const n = Geo.intersect(G.get(pending[0]), G.get(pending[1])).length || (G.get(pending[0]).c || G.get(pending[1]).c ? 2 : 1);
        for (let w = 0; w < n; w++) create({ type: 'intersection', a: pending[0], b: pending[1], which: w });
        pending = [];
      } else if (pending.length === 2) pending = [];
      changed();
      return;
    }
    if (tool === 'angle') {
      if (!pending.length) snapshot();
      pending.push(pointAt(px, py));
      if (pending.length === 3) { create({ type: 'angle', a: pending[0], b: pending[1], c: pending[2] }); pending = []; }
      changed();
      return;
    }
    if (tool === 'reflect' || tool === 'rotate' || tool === 'translate' || tool === 'dilate') {
      if (!pending.length) {
        const o = pick(px, py, (x) => x.type !== 'locus');
        if (!o) return;
        pending.push(o.id);
        hintEl.textContent = { reflect: 'Now click the mirror line, or a point to reflect in', rotate: 'Now click the centre of rotation', translate: 'Now click the start of the vector', dilate: 'Now click the centre of enlargement' }[tool];
        requestDraw();
        return;
      }
      const src = byId(pending[0]);
      if (tool === 'reflect') {
        const ln = pick(px, py, isLine);
        snapshot();
        if (ln) applyTransform(src, { type: 'reflectL', line: ln.id });
        else applyTransform(src, { type: 'reflectP', c: pointAt(px, py) });
        pending = []; setTool(tool); changed(); return;
      }
      if (tool === 'translate') {
        if (pending.length === 1) { snapshot(); pending.push(pointAt(px, py)); hintEl.textContent = 'Now click the end of the vector'; changed(); return; }
        applyTransform(src, { type: 'translate', a: pending[1], b: pointAt(px, py) });
        pending = []; setTool(tool); changed(); return;
      }
      snapshot();
      const c = pointAt(px, py);
      changed();
      const v = await U.ask(tool === 'rotate' ? 'Angle in degrees (counter-clockwise)' : 'Enlargement factor (e.g. 2 or 0.5 or -1)', tool === 'rotate' ? '90' : '2');
      const val = v == null ? NaN : MX.evaluate(v);
      if (isFinite(val)) applyTransform(src, tool === 'rotate' ? { type: 'rotate', c, deg: val } : { type: 'dilate', c, k: val });
      pending = []; setTool(tool); changed();
      return;
    }
    if (tool === 'locus') {
      const o = pick(px, py, isPoint);
      if (!o) return;
      if (!pending.length) { pending.push(o.id); hintEl.textContent = 'Now click the point that moves along a line or circle (made with Point on that line or circle)'; return; }
      if (o.type !== 'onObj') return U.toast('Pick a point that lies on a line or circle');
      snapshot();
      create({ type: 'locus', p: pending[0], q: o.id });
      pending = []; setTool(tool); changed();
      return;
    }
    if (tool === 'trace') {
      const o = pick(px, py, isPoint);
      if (!o) return;
      o.trace = !o.trace;
      if (!o.trace) traces.delete(o.id);
      U.toast(o.trace ? `Tracing ${o.name} — drag something to see its path` : `Stopped tracing ${o.name}`);
      changed();
      return;
    }
    if (tool === 'polygon') {
      if (!pending.length) snapshot();
      const id = pointAt(px, py);
      if (pending.length >= 3 && id === pending[0]) { create({ type: 'polygon', pts: pending.slice() }); pending = []; }
      else if (!pending.includes(id)) pending.push(id);
      changed();
    }
  }

  // ---------------------------------------------------------------- drawing
  function requestDraw() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } }
  function lineSpan(g) { // the part of a line-like object to draw, in px
    const big = (W + H) * 4 * st.view.s;
    const n = Math.hypot(g.d.x, g.d.y);
    if (g.kind === 'segment') return [g.p, { x: g.p.x + g.d.x, y: g.p.y + g.d.y }];
    const u = { x: g.d.x / n, y: g.d.y / n };
    const far = { x: st.view.cx, y: st.view.cy };
    const t0 = (far.x - g.p.x) * u.x + (far.y - g.p.y) * u.y;
    const a = g.kind === 'ray' ? g.p : { x: g.p.x + u.x * (t0 - big), y: g.p.y + u.y * (t0 - big) };
    return [a, { x: g.p.x + u.x * (Math.max(t0, 0) + big), y: g.p.y + u.y * (Math.max(t0, 0) + big) }];
  }
  function draw() {
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = Theme.bg;
    ctx.fillRect(0, 0, W, H);
    if (st.grid) drawGrid();
    const hov = hover && hover.id;
    const shown = st.objs.filter((o) => !o.hidden);
    // polygons, then curves, then angles, then points on top
    for (const o of shown) {
      const g = G.get(o.id);
      if (!g || !g.pts) continue;
      ctx.fillStyle = POLY_COLOR + (hov === o.id ? '55' : '30');
      ctx.strokeStyle = POLY_COLOR; ctx.lineWidth = 2;
      ctx.beginPath(); g.pts.forEach((p, i) => (i ? ctx.lineTo(toPx(p.x), toPy(p.y)) : ctx.moveTo(toPx(p.x), toPy(p.y)))); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const o of shown) {
      const g = G.get(o.id);
      if (!g) continue;
      const w = hov === o.id ? 3.4 : 2;
      if (g.d) {
        const [a, b] = lineSpan(g);
        ctx.strokeStyle = o.type === 'perp' || o.type === 'parallel' || o.type === 'bisector' ? Theme.muted : Theme.text;
        ctx.lineWidth = w;
        ctx.setLineDash(o.type === 'bisector' ? [7, 5] : []);
        ctx.beginPath(); ctx.moveTo(toPx(a.x), toPy(a.y)); ctx.lineTo(toPx(b.x), toPy(b.y)); ctx.stroke();
        ctx.setLineDash([]);
        if (o.type === 'segment') label(o.name, (toPx(a.x) + toPx(b.x)) / 2, (toPy(a.y) + toPy(b.y)) / 2, Theme.muted, 8, -8);
      } else if (g.c) {
        ctx.strokeStyle = CIRCLE_COLOR; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(toPx(g.c.x), toPy(g.c.y), g.r / st.view.s, 0, Math.PI * 2); ctx.stroke();
      } else if (g.deg != null) {
        const a0 = Math.atan2(g.a.y - g.b.y, g.a.x - g.b.x), a1 = Math.atan2(g.c.y - g.b.y, g.c.x - g.b.x);
        let d = a1 - a0; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI;
        const R = 26, bx = toPx(g.b.x), by = toPy(g.b.y);
        ctx.fillStyle = ANGLE_COLOR + '40'; ctx.strokeStyle = ANGLE_COLOR; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(bx, by);
        if (Math.abs(g.deg - 90) < 1e-6) { // right angle: a small square
          const u = { x: Math.cos(a0), y: Math.sin(a0) }, v = { x: Math.cos(a1), y: Math.sin(a1) }, s = 14;
          ctx.lineTo(bx + u.x * s, by - u.y * s); ctx.lineTo(bx + (u.x + v.x) * s, by - (u.y + v.y) * s); ctx.lineTo(bx + v.x * s, by - v.y * s);
        } else ctx.arc(bx, by, R, -a0, -(a0 + d), d > 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        const mid = a0 + d / 2;
        label(`${o.name} = ${fmt(g.deg)}°`, bx + Math.cos(mid) * (R + 22), by - Math.sin(mid) * (R + 22), ANGLE_COLOR, 0, 0, 'center');
      }
    }
    for (const o of shown) {
      const g = G.get(o.id);
      if (!g || !g.path) continue;
      ctx.strokeStyle = '#ff922b'; ctx.lineWidth = hov === o.id ? 3.4 : 2.4;
      ctx.beginPath();
      let pen = false;
      for (const p of g.path) {
        if (!p) { pen = false; continue; }
        pen ? ctx.lineTo(toPx(p.x), toPy(p.y)) : ctx.moveTo(toPx(p.x), toPy(p.y));
        pen = true;
      }
      ctx.stroke();
    }
    for (const [id, trail] of traces) {
      const o = byId(id);
      if (!o || o.hidden) continue;
      ctx.fillStyle = 'rgba(255,146,43,0.55)';
      for (const p of trail) ctx.fillRect(toPx(p.x) - 1.5, toPy(p.y) - 1.5, 3, 3);
    }
    for (const o of shown) {
      const g = G.get(o.id);
      if (!g || !g.pt) continue;
      const free = o.type === 'point' || o.type === 'onObj';
      const x = toPx(g.pt.x), y = toPy(g.pt.y);
      ctx.beginPath(); ctx.arc(x, y, hov === o.id ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = free ? PT_COLOR : Theme.muted; ctx.fill();
      ctx.strokeStyle = Theme.halo; ctx.lineWidth = 1.5; ctx.stroke();
      label(o.name, x, y, free ? (Theme.light ? '#1864ab' : '#cfe6ff') : Theme.label, 8, -10);
    }
    // construction in progress: a rubber band to the mouse
    if (pending.length && mouse) {
      ctx.strokeStyle = 'rgba(255,192,120,0.7)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      const pts = pending.map((p) => (typeof p === 'number' ? G.get(p) : p.p != null ? G.get(p.p) : null)).filter((g) => g && g.pt).map((g) => g.pt);
      if (pts.length) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(toPx(p.x), toPy(p.y)) : ctx.moveTo(toPx(p.x), toPy(p.y))));
        if (tool === 'circle') { const c = pts[0]; ctx.moveTo(toPx(c.x) + Math.hypot(toPx(c.x) - mouse.x, toPy(c.y) - mouse.y), toPy(c.y)); ctx.arc(toPx(c.x), toPy(c.y), Math.hypot(toPx(c.x) - mouse.x, toPy(c.y) - mouse.y), 0, Math.PI * 2); }
        else ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
  function label(text, x, y, color, dx = 0, dy = 0, align = 'left') {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = Theme.halo; ctx.strokeText(text, x + dx, y + dy);
    ctx.fillStyle = color; ctx.fillText(text, x + dx, y + dy);
  }
  function drawGrid() {
    const step = Charts.niceStep(70 * st.view.s, 1);
    const x0 = fromPx(0), x1 = fromPx(W), y0 = fromPy(H), y1 = fromPy(0);
    ctx.strokeStyle = Theme.gridMajor; ctx.lineWidth = 1; ctx.beginPath();
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) { const p = Math.round(toPx(v)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H); }
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) { const p = Math.round(toPy(v)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p); }
    ctx.stroke();
    ctx.strokeStyle = Theme.axis; ctx.beginPath();
    ctx.moveTo(toPx(0), 0); ctx.lineTo(toPx(0), H); ctx.moveTo(0, toPy(0)); ctx.lineTo(W, toPy(0)); ctx.stroke();
    ctx.fillStyle = Theme.label; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) if (Math.abs(v) > step / 2) ctx.fillText(Charts.tickLabel(v, step), toPx(v), U.clamp(toPy(0) + 3, 2, H - 12));
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) if (Math.abs(v) > step / 2) ctx.fillText(Charts.tickLabel(v, step), U.clamp(toPx(0) - 4, 24, W - 2), toPy(v));
  }
  const fmt = (v) => MX.fmt(Math.abs(v) < 1e-9 ? 0 : +v.toPrecision(5));

  // ---------------------------------------------------------------- object list
  function describe(o) {
    const g = G.get(o.id);
    const undef = g ? '' : '  (undefined)';
    switch (o.type) {
      case 'point': return [`point (${fmt(o.x)}, ${fmt(o.y)})`, true];
      case 'onObj': return [`point on ${nm(o.on)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : '  (undefined)')];
      case 'reflectL': return [`reflection of ${nm(o.src)} in ${nm(o.line)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : '  (undefined)')];
      case 'reflectP': return [`reflection of ${nm(o.src)} in ${nm(o.c)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : '  (undefined)')];
      case 'rotate': return [`${nm(o.src)} rotated ${fmt(o.deg)}° about ${nm(o.c)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : '  (undefined)')];
      case 'translate': return [`${nm(o.src)} moved by vector ${nm(o.a)}${nm(o.b)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : '  (undefined)')];
      case 'dilate': return [`${nm(o.src)} enlarged ×${fmt(o.k)} from ${nm(o.c)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : '  (undefined)')];
      case 'locus': return [`locus of ${nm(o.p)} as ${nm(o.q)} moves`];
      case 'midpoint': return [`midpoint of ${nm(o.a)}${nm(o.b)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : undef)];
      case 'intersection': return [`intersection of ${nm(o.a)} and ${nm(o.b)}` + (g ? `  (${fmt(g.pt.x)}, ${fmt(g.pt.y)})` : undef)];
      case 'segment': return [`segment ${nm(o.a)}${nm(o.b)}` + (g ? `  · length ${fmt(Math.hypot(g.d.x, g.d.y))}` : undef)];
      case 'line': {
        if (!g) return [`line ${nm(o.a)}${nm(o.b)}${undef}`];
        const m = g.d.x !== 0 ? g.d.y / g.d.x : Infinity;
        return [`line ${nm(o.a)}${nm(o.b)}  · ` + (isFinite(m) ? `y = ${fmt(m)}x ${g.p.y - m * g.p.x < 0 ? '−' : '+'} ${fmt(Math.abs(g.p.y - m * g.p.x))}` : `x = ${fmt(g.p.x)}`)];
      }
      case 'ray': return [`ray from ${nm(o.a)} through ${nm(o.b)}${undef}`];
      case 'perp': return [`perpendicular to ${nm(o.line)} through ${nm(o.p)}${undef}`];
      case 'parallel': return [`parallel to ${nm(o.line)} through ${nm(o.p)}${undef}`];
      case 'bisector': return [`perpendicular bisector of ${nm(o.a)}${nm(o.b)}${undef}`];
      case 'circle': case 'circleR':
        return [(o.type === 'circle' ? `circle with centre ${nm(o.c)} through ${nm(o.p)}` : `circle with centre ${nm(o.c)}`) + (g ? `  · r = ${fmt(g.r)}, area ${fmt(Math.PI * g.r * g.r)}, circumference ${fmt(2 * Math.PI * g.r)}` : undef)];
      case 'angle': return [`angle ${nm(o.a)}${nm(o.b)}${nm(o.c)}` + (g ? ` = ${fmt(g.deg)}°` : undef)];
      case 'polygon': return [`polygon ${o.pts.map(nm).join('')}` + (g ? `  · area ${fmt(g.area)}, perimeter ${fmt(g.per)}` : undef)];
    }
    return ['?'];
  }
  function renderList() {
    if (!listEl) return;
    listEl.replaceChildren(...(st.objs.length ? st.objs.map((o) => {
      const [text, editable] = describe(o);
      const name = el('span', { class: 'geo-name' }, o.name);
      const body = el('span', { class: 'geo-desc' }, text);
      if (editable) body.addEventListener('dblclick', async () => {
        const v = await U.ask(`Move ${o.name} to (x, y)`, `${fmt(o.x)}, ${fmt(o.y)}`);
        const m = v && /^\s*\(?\s*([^,]+),\s*([^)]+)\)?\s*$/.exec(v);
        if (m) { snapshot(); o.x = MX.evaluate(m[1]); o.y = MX.evaluate(m[2]); changed(); }
      });
      return el('div', { class: 'geo-row' + (hover && hover.id === o.id ? ' on' : ''), onmouseenter: () => { hover = o; requestDraw(); }, onmouseleave: () => { hover = null; requestDraw(); } },
        U.el('button', { type: 'button', class: 'icon gx-eye', title: 'Show / hide', onclick: () => { o.hidden = !o.hidden; changed(); } }, o.hidden ? '○' : '●'),
        name, body,
        U.el('button', { type: 'button', class: 'icon danger', title: 'Delete (and what is built on it)', onclick: () => { snapshot(); removeWithDependents(o.id); changed(); } }, '×'));
    }) : [el('p', { class: 'hint' }, 'Nothing yet — pick a tool above and click on the drawing area, or load an example.')]));
  }

  // ---------------------------------------------------------------- examples
  const EXAMPLES = {
    'Triangle with circumcircle': () => {
      const A = create({ type: 'point', x: -3, y: -2 }), B = create({ type: 'point', x: 4, y: -1.5 }), C = create({ type: 'point', x: 0.5, y: 3.5 });
      create({ type: 'polygon', pts: [A.id, B.id, C.id] });
      const f = create({ type: 'bisector', a: A.id, b: B.id }), g = create({ type: 'bisector', a: B.id, b: C.id });
      const M = create({ type: 'intersection', a: f.id, b: g.id, which: 0 });
      create({ type: 'circle', c: M.id, p: A.id });
      create({ type: 'angle', a: B.id, b: A.id, c: C.id }); create({ type: 'angle', a: C.id, b: B.id, c: A.id }); create({ type: 'angle', a: A.id, b: C.id, c: B.id });
    },
    "Thales' theorem": () => {
      const A = create({ type: 'point', x: -4, y: 0 }), B = create({ type: 'point', x: 4, y: 0 });
      create({ type: 'segment', a: A.id, b: B.id });
      const M = create({ type: 'midpoint', a: A.id, b: B.id });
      const k = create({ type: 'circle', c: M.id, p: B.id });
      const C = create({ type: 'onObj', on: k.id, t: 1.1 });
      create({ type: 'segment', a: A.id, b: C.id }); create({ type: 'segment', a: B.id, b: C.id });
      create({ type: 'angle', a: A.id, b: C.id, c: B.id });
    },
    'Perpendicular and parallel': () => {
      const A = create({ type: 'point', x: -4, y: -2 }), B = create({ type: 'point', x: 4, y: 1 }), P = create({ type: 'point', x: -1, y: 3 });
      const l = create({ type: 'line', a: A.id, b: B.id });
      const p = create({ type: 'perp', line: l.id, p: P.id });
      create({ type: 'parallel', line: l.id, p: P.id });
      const F = create({ type: 'intersection', a: l.id, b: p.id, which: 0 });
      create({ type: 'segment', a: P.id, b: F.id });
    },
    'Reflection and rotation': () => {
      const A = create({ type: 'point', x: -5, y: 1 }), B = create({ type: 'point', x: -2, y: 1 }), C = create({ type: 'point', x: -3, y: 4 });
      const T = create({ type: 'polygon', pts: [A.id, B.id, C.id] });
      const P1 = create({ type: 'point', x: 0, y: -4 }), P2 = create({ type: 'point', x: 0.5, y: 5 });
      const m = create({ type: 'line', a: P1.id, b: P2.id });
      applyTransform(T, { type: 'reflectL', line: m.id });
      const O = create({ type: 'point', x: 3, y: -2 });
      applyTransform(T, { type: 'rotate', c: O.id, deg: 90 });
    },
    'Locus: midpoint of a moving segment': () => {
      const O = create({ type: 'point', x: 0, y: 0 }), R = create({ type: 'point', x: 3, y: 0 });
      const k = create({ type: 'circle', c: O.id, p: R.id });
      const Q = create({ type: 'onObj', on: k.id, t: 0.9 });
      const A = create({ type: 'point', x: 6, y: 2 });
      create({ type: 'segment', a: A.id, b: Q.id });
      const M = create({ type: 'midpoint', a: A.id, b: Q.id });
      create({ type: 'locus', p: M.id, q: Q.id });
    },
    'Two circles intersecting': () => {
      const A = create({ type: 'point', x: -2, y: 0 }), B = create({ type: 'point', x: 2, y: 0.5 });
      const c = create({ type: 'circleR', c: A.id, r: 3 }), d = create({ type: 'circleR', c: B.id, r: 2.5 });
      const S1 = create({ type: 'intersection', a: c.id, b: d.id, which: 0 }), S2 = create({ type: 'intersection', a: c.id, b: d.id, which: 1 });
      create({ type: 'polygon', pts: [A.id, S1.id, B.id, S2.id] });
    },
  };

  // The construction as equations in the Graphing section.
  function toGraphing() {
    const f = (v) => MX.fmt(+v.toFixed(4));
    const sg = (v) => (v < 0 ? ` - ${f(-v)}` : ` + ${f(v)}`);
    const texts = [];
    const seg = (a, b) => texts.push(`(${f(a.x)}${sg(b.x - a.x)}t, ${f(a.y)}${sg(b.y - a.y)}t)`);
    for (const o of st.objs) {
      const g = G.get(o.id);
      if (!g || o.hidden) continue;
      if (g.pt) texts.push(`(${f(g.pt.x)}, ${f(g.pt.y)})`);
      else if (g.c) texts.push(`(x${sg(-g.c.x)})^2 + (y${sg(-g.c.y)})^2 = ${f(g.r * g.r)}`);
      else if (g.d && g.kind === 'segment') seg(g.p, add2(g.p, g.d));
      else if (g.d && g.kind === 'ray') seg(g.p, add2(g.p, { x: g.d.x * 40, y: g.d.y * 40 }));
      else if (g.d) {
        if (Math.abs(g.d.x) < 1e-12) texts.push(`x = ${f(g.p.x)}`);
        else { const m = g.d.y / g.d.x; texts.push(`y = ${f(m)}x${sg(g.p.y - m * g.p.x)}`); }
      } else if (g.pts) g.pts.forEach((p, i) => seg(p, g.pts[(i + 1) % g.pts.length]));
    }
    if (!texts.length) return U.toast('Nothing to send yet');
    Shell.api.graph.add(texts, { tRange: [0, 1], view: { cx: st.view.cx, cy: st.view.cy, s: st.view.s } });
  }
  const add2 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

  // ---------------------------------------------------------------- page
  function init(root) {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.objs)) Object.assign(st, s); } catch { /* fresh */ }
    if (!st.objs.length) { EXAMPLES['Triangle with circumcircle'](); }
    cv = el('canvas', { class: 'gx-canvas geo-canvas' });
    ctx = cv.getContext('2d');
    listEl = el('div', { class: 'geo-list' });
    hintEl = el('div', { class: 'geo-hint' });
    const exSel = el('select', {}, el('option', { value: '' }, 'Examples…'), Object.keys(EXAMPLES).map((k) => el('option', { value: k }, k)));
    exSel.addEventListener('change', () => { if (exSel.value) { snapshot(); st.objs = []; EXAMPLES[exSel.value](); st.view = { cx: 0, cy: 0, s: 0.02 }; changed(); } exSel.value = ''; });
    const toolbar = el('div', { class: 'geo-tools' }, TOOLS.map(([t, icon, name, how]) =>
      U.el('button', { type: 'button', class: 'geo-tool', 'data-t': t, title: `${name} — ${how}`, onclick: () => setTool(t) }, el('span', { class: 'geo-ic' }, icon), el('span', {}, name))));
    root.append(el('div', { class: 'gx' },
      el('aside', { class: 'gx-panel' },
        el('div', { class: 'gx-head' }, el('h2', {}, 'Geometry'),
          el('div', { class: 'btn-row' }, exSel,
            U.el('button', { type: 'button', class: 'small', title: 'Undo (Ctrl+Z)', onclick: undo }, '↶'),
            U.el('button', { type: 'button', class: 'small', title: 'Redo (Ctrl+Y)', onclick: redo }, '↷'),
            U.el('button', { type: 'button', class: 'small', onclick: () => { if (window.confirm('Remove everything?')) { snapshot(); st.objs = []; traces.clear(); changed(); } } }, 'Clear'),
            U.el('button', { type: 'button', class: 'small', title: 'Send the construction to Graphing as equations', onclick: toGraphing }, '📈 To Graphing')),
          el('div', { class: 'btn-row' },
            C.check({ label: 'Grid', get: () => st.grid, set: (v) => { st.grid = v; save(); requestDraw(); } }).el,
            C.check({ label: 'Snap to grid', get: () => st.snap, set: (v) => { st.snap = v; save(); } }).el)),
        listEl,
        el('p', { class: 'hint geo-foot' }, 'Double-click a point’s description to type exact coordinates. Hover an entry to highlight it.')),
      el('div', { class: 'gx-stage' }, toolbar, cv, hintEl,
        el('div', { class: 'gx-tools geo-zoom' },
          U.el('button', { type: 'button', title: 'Zoom in', onclick: () => { st.view.s *= 0.8; save(); requestDraw(); } }, '+'),
          U.el('button', { type: 'button', title: 'Zoom out', onclick: () => { st.view.s /= 0.8; save(); requestDraw(); } }, '−'),
          U.el('button', { type: 'button', title: 'Reset view', onclick: () => { st.view = { cx: 0, cy: 0, s: 0.02 }; save(); requestDraw(); } }, '⌂'),
          U.el('button', { type: 'button', title: 'Save as PNG', onclick: () => cv.toBlob((b) => b && U.download(b, 'geometry.png')) }, '⤓')))));
    // pointer interaction
    let drag = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      cv.setPointerCapture(e.pointerId);
      if (tool === 'move') {
        const o = pick(p.x, p.y, (x) => x.type === 'point' || x.type === 'onObj');
        if (o) { snapshot(); drag = { kind: 'point', o }; }
        else drag = { kind: 'pan', x: p.x, y: p.y };
      } else drag = { kind: 'click', x: p.x, y: p.y };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      mouse = p;
      if (drag && drag.kind === 'point') {
        const o = drag.o;
        if (o.type === 'onObj') { const H = G.get(o.on); if (H) o.t = Geo.paramOn(H, { x: fromPx(p.x), y: fromPy(p.y) }); }
        else { o.x = snapV(fromPx(p.x)); o.y = snapV(fromPy(p.y)); }
        G = Geo.solve(st.objs); recordTraces(); renderList(); requestDraw(); return;
      }
      if (drag && drag.kind === 'pan') { st.view.cx -= (p.x - drag.x) * st.view.s; st.view.cy += (p.y - drag.y) * st.view.s; drag.x = p.x; drag.y = p.y; requestDraw(); return; }
      const h = pick(p.x, p.y);
      if (h !== hover) { hover = h; renderList(); }
      requestDraw();
    });
    cv.addEventListener('pointerup', (e) => {
      const p = pos(e);
      if (drag && drag.kind === 'click' && Math.hypot(p.x - drag.x, p.y - drag.y) < 5) clickTool(p.x, p.y);
      if (drag && (drag.kind === 'point' || drag.kind === 'pan')) save();
      drag = null;
    });
    cv.addEventListener('pointerleave', () => { mouse = null; requestDraw(); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e), x = fromPx(p.x), y = fromPy(p.y);
      st.view.s = U.clamp(st.view.s * Math.exp(e.deltaY * 0.0015), 1e-6, 1e4);
      st.view.cx = x - (p.x - W / 2) * st.view.s; st.view.cy = y + (p.y - H / 2) * st.view.s;
      save(); requestDraw();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!Shell.isActive('geometry') || (e.target.closest && e.target.closest('input, textarea'))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') { pending = []; setTool('move'); }
    });
    new ResizeObserver(requestDraw).observe(cv);
    Theme.onChange(requestDraw);
    setTool('move');
    changed();
  }

  Shell.register('geometry', {
    commands: [
      { label: 'Send the construction to Graphing', keywords: 'equations export', run: () => toGraphing() },
      ...TOOLS.map(([t, , name, how]) => ({ label: `Geometry tool: ${name}`, keywords: how, run: () => setTool(t) })),
      ...Object.keys(EXAMPLES).map((k) => ({ label: `Geometry example: ${k}`, keywords: 'example beispiel', run: () => { snapshot(); st.objs = []; traces.clear(); EXAMPLES[k](); st.view = { cx: 0, cy: 0, s: 0.02 }; changed(); } })),
    ],
    label: 'Geometry', key: 5, order: 5, root: () => document.getElementById('mod-geometry'), init,
    onShow: () => requestDraw(),
    desc: 'Construct with points, lines, circles, perpendiculars, intersections, angles and polygons — drag a point and everything follows.',
    features: ['Constructions', 'Drag to explore', 'Angles & areas', 'Thales, circumcircle…'],
  });
})();

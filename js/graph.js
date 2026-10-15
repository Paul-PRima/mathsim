// Graphing calculator: y = f(x), x = f(y), polar r = f(θ), parametric (x(t), y(t)), implicit curves,
// inequalities and points, with sliders, tracing, roots / extrema / intersections and value tables.
(() => {
  const { el } = U;
  const KEY = 'mathsim.graph.v1';
  const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#cc5de8', '#ff922b', '#22b8cf', '#fcc419', '#f06595'];
  const RESERVED = new Set(['x', 'y', 't', 'θ', 'r']);
  const HOME = { cx: 0, cy: 0, s: 0.025 }; // s = graph units per CSS pixel

  const S = { items: [], view: { ...HOME }, active: null, trace: null, hoverPoi: null, pins: [] };
  let cv, ctx, W = 1, H = 1, listEl, coordEl, scope = { vars: {}, funcs: {} };
  let pois = [], poiTimer = 0, drawQueued = false, nextId = 1;

  // ---------------------------------------------------------------- persistence
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.items)) {
        S.items = s.items.map((it) => Object.assign(newItem(it.text), it, { id: nextId++ }));
        if (s.view && s.view.s > 0) S.view = s.view;
        return;
      }
    } catch { /* fresh */ }
    loadExample(EXAMPLES[0], false);
  }
  const save = U.debounce(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        items: S.items.map(({ text, color, hidden, min, max, step, tmin, tmax, showTable, tx0, tdx }) => ({ text, color, hidden, min, max, step, tmin, tmax, showTable, tx0, tdx })),
        view: S.view,
      }));
    } catch { /* storage full */ }
  }, 300);

  function newItem(text = '', extra = {}) {
    const used = new Set(S.items.map((i) => i.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[S.items.length % COLORS.length];
    return Object.assign({ id: nextId++, text, color, hidden: false, min: -10, max: 10, step: 0.1, tmin: 0, tmax: 2 * Math.PI, showTable: false, tx0: -2, tdx: 1 }, extra);
  }

  // ---------------------------------------------------------------- compiling the expression list
  const isSplit = (v) => v.length > 1 && /^[A-Za-zͰ-Ͽ]+$/u.test(v) && !(v in MX.CONSTS) && !(v in scope.vars) && !scope.funcs[v];
  function uses(ast, name) {
    for (const v of MX.names(ast).vars) if (v === name || (isSplit(v) && v.includes(name))) return true;
    return false;
  }

  function compileAll() {
    MX.M.af = 1;
    scope = { vars: {}, funcs: {}, splitUnknown: true };
    const defs = [];
    for (const it of S.items) {
      it.kind = null; it.err = null; it.ast = null; it.fns = null; it.missing = []; it.value = null;
      if (!it.text.trim()) continue;
      try { it.ast = MX.parse(it.text); } catch (e) { it.err = e.message; continue; }
      const a = it.ast;
      if (a.t === 'cmp' && a.op === '=' && a.a.t === 'call' && a.a.args.length && a.a.args.every((x) => x.t === 'var') && !MX.FUNCS[a.a.f.toLowerCase()]) {
        it.kind = 'def';
        it.defName = a.a.f;
        it.params = a.a.args.map((x) => x.name);
        defs.push(it);
        const impl = { f: () => NaN };
        const w = (...args) => impl.f(...args);
        w.arity = it.params.length;
        w.impl = impl;
        scope.funcs[it.defName] = w;
      } else if (a.t === 'cmp' && a.op === '=' && a.a.t === 'var' && !RESERVED.has(a.a.name) && !(a.a.name in MX.CONSTS) && !uses(a.b, 'x') && !uses(a.b, 'y')) {
        it.kind = 'var';
        it.varName = a.a.name;
      }
    }
    // variables: evaluate repeatedly so they may refer to each other in any order
    const pending = S.items.filter((it) => it.kind === 'var');
    for (let pass = 0; pass <= pending.length && pending.length; pass++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const it = pending[i];
        try {
          const { fn, free } = MX.compile(it.ast.b, [], scope);
          if ([...free].some((n) => !(n in scope.vars))) continue;
          scope.vars[it.varName] = fn();
          it.value = scope.vars[it.varName];
          it.slider = it.ast.b.t === 'num' || (it.ast.b.t === 'neg' && it.ast.b.a.t === 'num');
          pending.splice(i, 1);
        } catch (e) { it.err = e.message; pending.splice(i, 1); }
      }
    }
    for (const it of pending) { const { free } = MX.compile(it.ast.b, [], scope); it.err = 'Unknown: ' + [...free].filter((n) => !(n in scope.vars)).join(', '); }
    for (const it of defs) {
      try {
        if (MX.names(it.ast.b).calls.has(it.defName)) throw new Error(`${it.defName} can't call itself`);
        const { fn, free } = MX.compile(it.ast.b, it.params, scope);
        scope.funcs[it.defName].impl.f = fn;
        it.missing = [...free].filter((n) => !RESERVED.has(n));
        if (it.params.length === 1 && it.params[0] === 'x') it.fns = { fx: (x) => fn(x) }; // f(x) = … is also drawn
      } catch (e) { it.err = e.message; }
    }
    for (const it of S.items) if (it.ast && !it.kind && !it.err) {
      try { classify(it); } catch (e) { it.err = e.message; it.kind = null; }
    }
  }

  function comp(ast, locals, it) {
    const { fn, free } = MX.compile(ast, locals, scope);
    for (const n of free) if (!RESERVED.has(n) && !it.missing.includes(n)) it.missing.push(n);
    return fn;
  }

  function classify(it) {
    const a = it.ast;
    const minus = (p, q) => ({ t: 'bin', op: '-', a: p, b: q });
    if (a.t === 'tuple') {
      if (a.items.length !== 2) throw new Error('Points need two coordinates: (x, y)');
      if (uses(a, 't')) { it.kind = 'param'; it.fns = { px: comp(a.items[0], ['t'], it), py: comp(a.items[1], ['t'], it) }; }
      else { it.kind = 'point'; const fx = comp(a.items[0], [], it), fy = comp(a.items[1], [], it); it.fns = { pt: () => [fx(), fy()] }; }
      return;
    }
    if (a.t === 'cmp' && a.op === '=') {
      const L = a.a, R = a.b;
      if (L.t === 'var' && L.name === 'y' && !uses(R, 'y')) { it.kind = 'fx'; it.fns = { fx: comp(R, ['x'], it) }; return; }
      if (R.t === 'var' && R.name === 'y' && !uses(L, 'y')) { it.kind = 'fx'; it.fns = { fx: comp(L, ['x'], it) }; return; }
      if (L.t === 'var' && L.name === 'x' && !uses(R, 'x')) { it.kind = 'fy'; it.fns = { fy: comp(R, ['y'], it) }; return; }
      if (L.t === 'var' && L.name === 'r' && !uses(R, 'r')) { it.kind = 'polar'; it.fns = { pr: comp(R, [uses(R, 't') && !uses(R, 'θ') ? 't' : 'θ'], it) }; return; }
      it.kind = 'implicit';
      it.fns = { F: comp(minus(L, R), ['x', 'y'], it) };
      return;
    }
    if (a.t === 'cmp' || a.t === 'and') {
      it.kind = 'region';
      if (a.t === 'cmp') {
        it.op = a.op;
        it.fns = { F: comp(minus(a.a, a.b), ['x', 'y'], it) };
      } else {
        it.op = null;
        it.fns = { C: comp(a, ['x', 'y'], it) };
      }
      return;
    }
    const ux = uses(a, 'x'), uy = uses(a, 'y');
    if (ux && uy) { it.kind = 'implicit'; it.fns = { F: comp(a, ['x', 'y'], it) }; it.note = 'drawn where it equals 0'; return; }
    if (uy) throw new Error('Write x = … to graph a function of y');
    if (ux) { it.kind = 'fx'; it.fns = { fx: comp(a, ['x'], it) }; return; }
    // constant: just show its value
    it.kind = 'value';
    it.value = comp(a, [], it)();
  }

  // ---------------------------------------------------------------- view mapping
  const toPx = (x) => W / 2 + (x - S.view.cx) / S.view.s;
  const toPy = (y) => H / 2 - (y - S.view.cy) / S.view.s;
  const fromPx = (px) => S.view.cx + (px - W / 2) * S.view.s;
  const fromPy = (py) => S.view.cy - (py - H / 2) * S.view.s;
  const range = () => ({ x0: fromPx(0), x1: fromPx(W), y0: fromPy(H), y1: fromPy(0) });

  // ---------------------------------------------------------------- drawing
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }

  function drawGrid() {
    const { x0, x1, y0, y1 } = range();
    const major = Charts.niceStep(100 * S.view.s, 1);
    const mant = major / 10 ** Math.floor(Math.log10(major) + 1e-9);
    const minor = major / (Math.round(mant) === 2 ? 4 : 5);
    const lines = (step, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) { const p = Math.round(toPx(v)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H); }
      for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) { const p = Math.round(toPy(v)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p); }
      ctx.stroke();
    };
    lines(minor, 'rgba(255,255,255,0.035)');
    lines(major, 'rgba(255,255,255,0.09)');
    // axes
    const ax = toPx(0), ay = toPy(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    if (ax >= 0 && ax <= W) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
    if (ay >= 0 && ay <= H) { ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
    ctx.stroke();
    // labels, kept on screen when an axis is off to the side
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232,234,240,0.7)';
    const ly = U.clamp(ay + 4, 4, H - 16), lx = U.clamp(ax - 6, 30, W - 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(x0 / major) * major; v <= x1; v += major) {
      if (Math.abs(v) < major * 1e-6) continue;
      ctx.fillText(Charts.tickLabel(v, major), toPx(v), ly);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / major) * major; v <= y1; v += major) {
      if (Math.abs(v) < major * 1e-6) continue;
      ctx.fillText(Charts.tickLabel(v, major), lx, toPy(v));
    }
    if (ax >= 0 && ax <= W && ay >= 0 && ay <= H) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0', ax - 4, ay + 4); }
  }

  // y = f(x) (or x = f(y) with swap): one sample per half pixel, broken at gaps and asymptotes.
  function plotFn(f, color, swap, width = 2.5) {
    const N = Math.ceil((swap ? H : W) * 2);
    const lim = (swap ? W : H) * 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const p = (i / N) * (swap ? H : W);
      const u = swap ? fromPy(p) : fromPx(p);
      const v = f(u);
      if (!isFinite(v)) { prev = null; continue; }
      const q = swap ? toPx(v) : toPy(v);
      if (prev && Math.abs(q - prev.q) > (swap ? W : H) * 0.5) {
        // a big jump: continuous only if the midpoint lies between the two ends
        const vm = f((u + prev.u) / 2), qm = swap ? toPx(vm) : toPy(vm);
        if (!isFinite(vm) || qm < Math.min(q, prev.q) - 1 || qm > Math.max(q, prev.q) + 1) prev = null;
      }
      const qc = U.clamp(q, -lim, lim);
      if (prev) swap ? ctx.lineTo(qc, p) : ctx.lineTo(p, qc);
      else swap ? ctx.moveTo(qc, p) : ctx.moveTo(p, qc);
      prev = { q, u };
    }
    ctx.stroke();
  }

  function plotCurve(fxy, t0, t1, color) {
    const N = 3000;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N;
      const [x, y] = fxy(t);
      if (!isFinite(x) || !isFinite(y)) { prev = null; continue; }
      const px = U.clamp(toPx(x), -1e5, 1e5), py = U.clamp(toPy(y), -1e5, 1e5);
      if (prev && Math.hypot(px - prev[0], py - prev[1]) > Math.max(W, H)) prev = null;
      if (prev) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      prev = [px, py];
    }
    ctx.stroke();
  }

  // Marching squares on a grid of F values; cells crossing a pole (huge values, no real zero) are skipped.
  function contour(F, color, dashed) {
    const cell = 4, nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1;
    const v = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) { const y = fromPy(j * cell); for (let i = 0; i < nx; i++) v[j * nx + i] = F(fromPx(i * cell), y); }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.beginPath();
    const lerp = (a, b) => a / (a - b);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
      if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) continue;
      const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const X = i * cell, Y = j * cell;
      const top = [X + cell * lerp(a, b), Y], right = [X + cell, Y + cell * lerp(b, c)];
      const bottom = [X + cell * lerp(d, c), Y + cell], left = [X, Y + cell * lerp(a, d)];
      const segs = [];
      switch (code) {
        case 1: case 14: segs.push([left, top]); break;
        case 2: case 13: segs.push([top, right]); break;
        case 3: case 12: segs.push([left, right]); break;
        case 4: case 11: segs.push([right, bottom]); break;
        case 6: case 9: segs.push([top, bottom]); break;
        case 7: case 8: segs.push([left, bottom]); break;
        case 5: case 10: {
          const m = F(fromPx(X + cell / 2), fromPy(Y + cell / 2));
          if ((m > 0) === (code === 5)) segs.push([left, top], [right, bottom]); else segs.push([top, right], [left, bottom]);
          break;
        }
      }
      const big = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
      for (const [p, q] of segs) {
        const mid = F(fromPx((p[0] + q[0]) / 2), fromPy((p[1] + q[1]) / 2));
        if (!(Math.abs(mid) <= big * 0.75)) continue; // sign change through a pole, not a zero
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function shade(test, color) {
    const cell = 3;
    ctx.fillStyle = color + '38';
    for (let py = 0; py < H; py += cell) {
      const y = fromPy(py + cell / 2);
      let run = -1;
      for (let px = 0; px <= W; px += cell) {
        const on = px < W && test(fromPx(px + cell / 2), y);
        if (on && run < 0) run = px;
        if (!on && run >= 0) { ctx.fillRect(run, py, px - run, cell); run = -1; }
      }
    }
  }

  function dot(x, y, color, r = 5, hollow = false) {
    ctx.beginPath();
    ctx.arc(toPx(x), toPy(y), r, 0, Math.PI * 2);
    if (hollow) { ctx.fillStyle = '#0c0e13'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.fill(); }
  }

  function label(x, y, text, color = '#e8eaf0') {
    ctx.font = '12px ui-monospace, Consolas, monospace';
    const w = ctx.measureText(text).width + 12;
    let px = toPx(x) + 10, py = toPy(y) - 26;
    if (px + w > W - 4) px = toPx(x) - w - 10;
    if (py < 4) py = toPy(y) + 10;
    ctx.fillStyle = 'rgba(16,18,24,0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px, py, w, 20, 5) : ctx.rect(px, py, w, 20);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, px + 6, py + 10);
  }
  const pt = (x, y) => `(${MX.fmt(+x.toPrecision(6))}, ${MX.fmt(+y.toPrecision(6))})`;

  function draw() {
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c0e13';
    ctx.fillRect(0, 0, W, H);
    MX.M.af = 1;
    drawGrid();
    const vis = S.items.filter((it) => !it.hidden && it.fns && !it.err);
    for (const it of vis) if (it.kind === 'region') {
      if (it.op) {
        const F = it.fns.F, op = it.op;
        const test = (x, y) => { const f = F(x, y); return op === '<' ? f < 0 : op === '<=' ? f <= 0 : op === '>' ? f > 0 : op === '>=' ? f >= 0 : Math.abs(f) > 1e-12; };
        shade(test, it.color);
        if (op !== '!=') contour(F, it.color, op === '<' || op === '>');
      } else shade((x, y) => it.fns.C(x, y) > 0, it.color);
    }
    for (const it of vis) {
      const f = it.fns;
      if (f.fx) plotFn(f.fx, it.color, false, it.id === S.active ? 3.2 : 2.5);
      else if (f.fy) plotFn(f.fy, it.color, true, it.id === S.active ? 3.2 : 2.5);
      else if (f.F && it.kind === 'implicit') contour(f.F, it.color, false);
      else if (f.pr) plotCurve((t) => { const r = f.pr(t); return [r * Math.cos(t), r * Math.sin(t)]; }, it.tmin, it.tmax, it.color);
      else if (f.px) plotCurve((t) => [f.px(t), f.py(t)], it.tmin, it.tmax, it.color);
    }
    for (const it of vis) if (it.fns.pt) {
      const [x, y] = it.fns.pt();
      if (isFinite(x) && isFinite(y)) { dot(x, y, it.color, 5); label(x, y, pt(x, y), it.color); }
    }
    // points of interest of the selected curve
    for (const p of pois) dot(p.x, p.y, '#b0b5c3', 4, true);
    for (const p of S.pins) { dot(p.x, p.y, '#e8eaf0', 4); label(p.x, p.y, `${p.what} ${pt(p.x, p.y)}`); }
    if (S.hoverPoi) { dot(S.hoverPoi.x, S.hoverPoi.y, '#e8eaf0', 5); label(S.hoverPoi.x, S.hoverPoi.y, `${S.hoverPoi.what} ${pt(S.hoverPoi.x, S.hoverPoi.y)}`); }
    else if (S.trace) { dot(S.trace.x, S.trace.y, S.trace.color, 5); label(S.trace.x, S.trace.y, pt(S.trace.x, S.trace.y), S.trace.color); }
  }

  // ---------------------------------------------------------------- points of interest
  function computePois() {
    pois = [];
    const it = S.items.find((i) => i.id === S.active);
    if (!it || it.hidden || it.err || !it.fns || !it.fns.fx) { requestDraw(); return; }
    const f = it.fns.fx;
    const { x0, x1, y0, y1 } = range();
    const add = (x, y, what) => { if (isFinite(x) && isFinite(y) && y >= y0 && y <= y1 && pois.length < 120) pois.push({ x, y, what }); };
    const clean = (v) => (Math.abs(v) < 1e-10 * Math.max(1, x1 - x0) ? 0 : v);
    for (const r of MX.findRoots(f, x0, x1, 1500)) add(clean(r), 0, 'root');
    if (x0 < 0 && x1 > 0) add(0, f(0), 'y-intercept');
    // extrema: where the slope changes sign
    const n = 1500, h = (x1 - x0) / n;
    let ya = f(x0), yb = f(x0 + h);
    for (let i = 1; i < n; i++) {
      const yc = f(x0 + (i + 1) * h);
      if (isFinite(ya) && isFinite(yb) && isFinite(yc)) {
        if (yb > ya && yb > yc) { const m = MX.goldenMin((x) => -f(x), x0 + (i - 1) * h, x0 + (i + 1) * h); add(m, f(m), 'maximum'); }
        else if (yb < ya && yb < yc) { const m = MX.goldenMin(f, x0 + (i - 1) * h, x0 + (i + 1) * h); add(m, f(m), 'minimum'); }
      }
      ya = yb; yb = yc;
    }
    // intersections with the other visible y = f(x) curves
    for (const o of S.items) {
      if (o === it || o.hidden || o.err || !o.fns || !o.fns.fx) continue;
      const g = o.fns.fx;
      for (const r of MX.findRoots((x) => f(x) - g(x), x0, x1, 1500)) add(r, f(r), 'intersection');
    }
    requestDraw();
  }
  const schedulePois = () => { clearTimeout(poiTimer); poiTimer = setTimeout(computePois, 120); };

  // ---------------------------------------------------------------- interaction
  function bindCanvas() {
    const pointers = new Map();
    let pinch = null, downAt = null, moved = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) { downAt = p; moved = false; }
      pinch = null;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      coordEl.textContent = `x = ${Charts.tickLabel(fromPx(p.x), S.view.s * 2)}   y = ${Charts.tickLabel(fromPy(p.y), S.view.s * 2)}`;
      if (!pointers.has(e.pointerId)) { hover(p); return; }
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 3) moved = true;
        if (moved) {
          S.view.cx -= (p.x - prev.x) * S.view.s;
          S.view.cy += (p.y - prev.y) * S.view.s;
          S.trace = null; S.hoverPoi = null;
          viewChanged();
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
        if (pinch) {
          S.view.cx -= (mid.x - pinch.mid.x) * S.view.s;
          S.view.cy += (mid.y - pinch.mid.y) * S.view.s;
          zoomAt(mid.x, mid.y, pinch.dist / dist);
        }
        pinch = { mid, dist };
        moved = true;
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (e.type === 'pointerup' && !moved && !pointers.size) click(pos(e));
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { S.trace = null; S.hoverPoi = null; coordEl.textContent = ''; requestDraw(); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      zoomAt(p.x, p.y, Math.exp(U.clamp(dy, -300, 300) * 0.0015));
    }, { passive: false });
  }

  function zoomAt(px, py, f) {
    const x = fromPx(px), y = fromPy(py);
    S.view.s = U.clamp(S.view.s * f, 1e-12, 1e12);
    S.view.cx = x - (px - W / 2) * S.view.s;
    S.view.cy = y + (py - H / 2) * S.view.s;
    viewChanged();
  }

  function viewChanged() {
    save();
    schedulePois();
    requestDraw();
  }

  function hover(p) {
    S.hoverPoi = null;
    for (const q of [...S.pins, ...pois]) if (Math.hypot(toPx(q.x) - p.x, toPy(q.y) - p.y) < 8) { S.hoverPoi = q; break; }
    // trace the nearest function curve under the cursor
    S.trace = null;
    if (!S.hoverPoi) {
      let best = 14;
      MX.M.af = 1;
      for (const it of S.items) {
        if (it.hidden || it.err || !it.fns) continue;
        if (it.fns.fx) {
          const x = fromPx(p.x), y = it.fns.fx(x);
          const d = Math.abs(toPy(y) - p.y);
          if (isFinite(y) && d < best) { best = d; S.trace = { x, y, color: it.color }; }
        } else if (it.fns.fy) {
          const y = fromPy(p.y), x = it.fns.fy(y);
          const d = Math.abs(toPx(x) - p.x);
          if (isFinite(x) && d < best) { best = d; S.trace = { x, y, color: it.color }; }
        }
      }
    }
    requestDraw();
  }

  function click(p) {
    const q = S.hoverPoi;
    if (q) {
      const i = S.pins.indexOf(q);
      if (i >= 0) S.pins.splice(i, 1); else S.pins.push(q);
      requestDraw();
      return;
    }
    // clicking a curve selects its expression
    if (S.trace) {
      const it = S.items.find((i) => i.color === S.trace.color);
      if (it) setActive(it.id);
    }
  }

  function setActive(id) {
    S.active = id;
    S.pins = [];
    listEl.querySelectorAll('.gx-item').forEach((n) => n.classList.toggle('active', +n.dataset.id === id));
    schedulePois();
    requestDraw();
  }

  // ---------------------------------------------------------------- expression list UI
  function refresh(rebuildList = false) {
    compileAll();
    if (rebuildList) renderList(); else S.items.forEach(updateInfo);
    save();
    schedulePois();
    requestDraw();
  }

  function kindText(it) {
    switch (it.kind) {
      case 'fx': return 'function of x';
      case 'fy': return 'function of y';
      case 'polar': return 'polar curve, θ from';
      case 'param': return 'parametric curve, t from';
      case 'implicit': return it.note ? 'curve ' + it.note : 'implicit curve';
      case 'region': return 'region';
      case 'point': return 'point';
      case 'def': return `function ${it.defName}(${it.params.join(', ')})`;
      case 'var': return null;
      case 'value': return '= ' + MX.fmt(it.value);
      default: return '';
    }
  }

  function updateInfo(it) {
    const row = listEl.querySelector(`.gx-item[data-id="${it.id}"]`);
    if (!row) return;
    const info = row.querySelector('.gx-info');
    const kids = [];
    if (it.err) kids.push(el('span', { class: 'err-text' }, it.err));
    else {
      const k = kindText(it);
      if (k) kids.push(el('span', {}, k));
      if (it.kind === 'polar' || it.kind === 'param') {
        const num = (key) => {
          const inp = el('input', { type: 'text', class: 'mono gx-mini', value: MX.fmt(+it[key].toPrecision(6)) });
          inp.addEventListener('change', () => { try { it[key] = MX.evaluate(inp.value); refresh(); } catch { inp.value = MX.fmt(it[key]); } });
          return inp;
        };
        kids.push(num('tmin'), el('span', {}, 'to'), num('tmax'));
      }
      if (it.missing.length) {
        kids.push(el('span', {}, 'add slider:'), ...it.missing.map((n) => U.el('button', { type: 'button', class: 'chip', onclick: () => addSlider(n) }, n)));
        if (it.missing.length > 1) kids.push(U.el('button', { type: 'button', class: 'chip', onclick: () => it.missing.slice().forEach(addSlider) }, 'all'));
      }
    }
    info.replaceChildren(...kids);
    info.hidden = !kids.length;
    const sl = row.querySelector('.gx-slider');
    sl.hidden = !(it.kind === 'var' && it.slider && !it.err);
    if (!sl.hidden) {
      const [rng, lo, hi, step] = sl._parts;
      lo.value = MX.fmt(it.min); hi.value = MX.fmt(it.max); step.value = MX.fmt(it.step);
      rng.min = it.min; rng.max = it.max; rng.step = it.step || 'any';
      if (document.activeElement !== rng) rng.value = it.value;
    }
    const tb = row.querySelector('.gx-table');
    const canTable = it.fns && it.fns.fx && !it.err;
    row.querySelector('.gx-tbtn').hidden = !canTable;
    tb.hidden = !(canTable && it.showTable);
    if (!tb.hidden) renderTable(it, tb);
  }

  function renderTable(it, box) {
    const f = it.fns.fx;
    const start = el('input', { type: 'text', class: 'mono gx-mini', value: MX.fmt(it.tx0) });
    const stepI = el('input', { type: 'text', class: 'mono gx-mini', value: MX.fmt(it.tdx) });
    const set = () => { try { it.tx0 = MX.evaluate(start.value); it.tdx = MX.evaluate(stepI.value) || 1; save(); renderTable(it, box); } catch { /* keep */ } };
    start.addEventListener('change', set);
    stepI.addEventListener('change', set);
    MX.M.af = 1;
    const rows = [];
    for (let i = 0; i < 9; i++) {
      const x = it.tx0 + i * it.tdx;
      rows.push(el('tr', {}, el('td', {}, MX.fmt(+x.toPrecision(10))), el('td', {}, MX.fmt(+f(x).toPrecision(8)))));
    }
    box.replaceChildren(
      el('div', { class: 'gx-info' }, el('span', {}, 'x from'), start, el('span', {}, 'step'), stepI),
      el('table', { class: 'kv-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'x'), el('th', {}, 'y'))), el('tbody', {}, rows)));
  }

  function addSlider(name) {
    if (S.items.some((i) => i.kind === 'var' && i.varName === name)) return;
    S.items.push(newItem(`${name} = 1`));
    refresh(true);
  }

  function itemRow(it) {
    const input = el('input', { type: 'text', class: 'mono gx-input', value: it.text, spellcheck: 'false', autocomplete: 'off', placeholder: 'y = …' });
    input.addEventListener('input', () => { it.text = input.value; refresh(); });
    input.addEventListener('focus', () => setActive(it.id));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const idx = S.items.indexOf(it);
        const n = newItem('');
        S.items.splice(idx + 1, 0, n);
        refresh(true);
        const nxt = listEl.querySelector(`.gx-item[data-id="${n.id}"] .gx-input`);
        if (nxt) nxt.focus();
      } else if (e.key === 'Backspace' && !input.value && S.items.length > 1) {
        e.preventDefault();
        const idx = S.items.indexOf(it);
        S.items.splice(idx, 1);
        refresh(true);
        const prev = listEl.querySelectorAll('.gx-input')[Math.max(0, idx - 1)];
        if (prev) prev.focus();
      }
    });
    const color = el('input', { type: 'color', class: 'gx-color', value: it.color, title: 'Colour' });
    color.addEventListener('input', () => { it.color = color.value; save(); requestDraw(); });
    const eye = el('button', { type: 'button', class: 'icon gx-eye', title: 'Show / hide' }, it.hidden ? '○' : '●');
    eye.style.color = it.color;
    eye.addEventListener('click', () => { it.hidden = !it.hidden; eye.textContent = it.hidden ? '○' : '●'; save(); schedulePois(); requestDraw(); });
    color.addEventListener('input', () => { eye.style.color = color.value; });
    // slider for "a = 1"
    const rng = el('input', { type: 'range' });
    const lo = el('input', { type: 'text', class: 'mono gx-mini', title: 'Minimum' });
    const hi = el('input', { type: 'text', class: 'mono gx-mini', title: 'Maximum' });
    const step = el('input', { type: 'text', class: 'mono gx-mini', title: 'Step (0 = smooth)' });
    rng.addEventListener('input', () => {
      const v = +rng.value;
      it.text = `${it.varName} = ${MX.fmt(+v.toPrecision(10))}`;
      input.value = it.text;
      refresh();
    });
    const lim = (inp, key) => inp.addEventListener('change', () => { try { it[key] = MX.evaluate(inp.value); refresh(); } catch { inp.value = MX.fmt(it[key]); } });
    lim(lo, 'min'); lim(hi, 'max'); lim(step, 'step');
    const play = el('button', { type: 'button', class: 'icon', title: 'Animate' }, '▶');
    let anim = 0;
    play.addEventListener('click', () => {
      if (anim) { cancelAnimationFrame(anim); anim = 0; play.textContent = '▶'; return; }
      play.textContent = '⏸';
      // `cur` moves smoothly; the shown value snaps to the slider's step
      let dir = 1, last = performance.now(), cur = it.value;
      const tick = (now) => {
        if (!document.body.contains(play) || it.kind !== 'var') { anim = 0; return; }
        const dt = (now - last) / 1000; last = now;
        cur += dir * (it.max - it.min) * dt / 4;
        if (cur > it.max) { cur = it.max; dir = -1; } else if (cur < it.min) { cur = it.min; dir = 1; }
        const v = it.step > 0 ? Math.round(cur / it.step) * it.step : cur;
        it.text = `${it.varName} = ${MX.fmt(+v.toPrecision(10))}`;
        input.value = it.text;
        refresh();
        anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    });
    const slider = el('div', { class: 'gx-slider' }, lo, rng, hi, el('span', { class: 'hint' }, 'step'), step, play);
    slider._parts = [rng, lo, hi, step];
    const tbtn = el('button', { type: 'button', class: 'icon gx-tbtn', title: 'Table of values' }, '▦');
    tbtn.addEventListener('click', () => { it.showTable = !it.showTable; save(); updateInfo(it); });
    const del = el('button', { type: 'button', class: 'icon danger', title: 'Delete' }, '×');
    del.addEventListener('click', () => { S.items.splice(S.items.indexOf(it), 1); if (!S.items.length) S.items.push(newItem('')); refresh(true); });
    return el('div', { class: 'gx-item' + (S.active === it.id ? ' active' : ''), 'data-id': it.id },
      el('div', { class: 'gx-row' }, eye, input, color, tbtn, del),
      el('div', { class: 'gx-info' }),
      slider,
      el('div', { class: 'gx-table' }));
  }

  function renderList() {
    listEl.replaceChildren(...S.items.map(itemRow));
    S.items.forEach(updateInfo);
  }

  // ---------------------------------------------------------------- examples
  const EXAMPLES = [
    { name: 'Getting started', items: ['y = x^2 - 2', 'y = sin(x)', 'y = 0.5x + 1'] },
    { name: 'Parabola with sliders', items: ['y = a(x - h)^2 + k', 'a = 1', 'h = 0', 'k = 0'], sliders: { a: [-5, 5, 0.1], h: [-10, 10, 0.1], k: [-10, 10, 0.1] } },
    { name: 'Sine wave family', items: ['y = A sin(B(x - C)) + D', 'A = 2', 'B = 1', 'C = 0', 'D = 0'] },
    { name: 'Taylor series of sin', items: ['y = sin(x)', 'y = sum((-1)^k x^(2k+1)/(2k+1)!, k, 0, n)', 'n = 2'], sliders: { n: [0, 12, 1] } },
    { name: 'Derivative and integral', items: ['f(x) = x^3 - 3x', 'y = diff(f(x), x)', 'y = int(f(t), t, 0, x)'] },
    { name: 'Circles and ellipses', items: ['x^2 + y^2 = 9', '(x - 2)^2/16 + y^2/4 = 1', '(1, 2)'] },
    { name: 'Inequalities', items: ['y > x^2 - 4', 'y <= 2 - x/2', '-3 < x < -1'] },
    { name: 'Polar rose', items: ['r = 4cos(kθ)', 'k = 4'], sliders: { k: [1, 12, 1] } },
    { name: 'Spiral', items: ['r = θ/2'], t: [0, 8 * Math.PI] },
    { name: 'Parametric heart', items: ['(16sin(t)^3/2, (13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t))/2)'] },
    { name: 'Lissajous curves', items: ['(5sin(a t), 5sin(b t))', 'a = 3', 'b = 2'], sliders: { a: [1, 10, 1], b: [1, 10, 1] } },
    { name: 'Beautiful implicit curves', items: ['x^3 + y^3 = 6x y', 'sin(x^2 + y^2) = cos(x y)'] },
    { name: 'Asymptotes', items: ['y = tan(x)', 'y = 1/(x - 1)', 'y = (x^2 - 1)/(x^2 - 4)'] },
    { name: 'Exponential and log', items: ['y = e^x', 'y = ln(x)', 'y = x'] },
    { name: 'Normal distribution', items: ['y = normpdf(x, m, s)', 'm = 0', 's = 1'], sliders: { s: [0.2, 4, 0.1] } },
  ];
  function loadExample(ex, render = true) {
    S.items = [];
    ex.items.forEach((t) => {
      const it = newItem(t);
      S.items.push(it); // before the next newItem(), so each picks an unused colour
      const m = /^([A-Za-zͰ-Ͽ]+) =/u.exec(t);
      if (m && ex.sliders && ex.sliders[m[1]]) [it.min, it.max, it.step] = ex.sliders[m[1]];
      if (ex.t) [it.tmin, it.tmax] = ex.t;
    });
    S.active = null;
    S.pins = [];
    if (render) { S.view = { ...HOME }; refresh(true); }
  }

  function savePNG() {
    cv.toBlob((b) => { if (b) U.download(b, 'graph.png'); }, 'image/png');
  }

  // ---------------------------------------------------------------- page
  function init(root) {
    load();
    listEl = el('div', { class: 'gx-list' });
    coordEl = el('div', { class: 'gx-coords mono' });
    cv = el('canvas', { class: 'gx-canvas' });
    ctx = cv.getContext('2d');
    const examples = el('select', {}, el('option', { value: '' }, 'Examples…'), EXAMPLES.map((e, i) => el('option', { value: i }, e.name)));
    examples.addEventListener('change', () => { if (examples.value !== '') loadExample(EXAMPLES[+examples.value]); examples.value = ''; });
    const help = el('details', { class: 'help' },
      el('summary', {}, 'What can I type?'),
      el('ul', { class: 'hint' },
        el('li', {}, el('code', {}, 'y = x^2'), ' or just ', el('code', {}, 'x^2'), ' — functions of x'),
        el('li', {}, el('code', {}, 'x = y^2'), ' — functions of y'),
        el('li', {}, el('code', {}, 'r = 2cos(3θ)'), ' — polar (type theta for θ)'),
        el('li', {}, el('code', {}, '(cos(t), sin(2t))'), ' — parametric; ', el('code', {}, '(2, 3)'), ' — a point'),
        el('li', {}, el('code', {}, 'x^2 + y^2 = 4'), ' — any equation in x and y'),
        el('li', {}, el('code', {}, 'y < sin(x)'), ', ', el('code', {}, '1 < x < 3'), ' — shaded regions'),
        el('li', {}, el('code', {}, 'a = 2'), ' — a slider; any other letter you use can become one'),
        el('li', {}, el('code', {}, 'f(x) = …'), ' — define a function to use elsewhere'),
        el('li', {}, el('code', {}, 'diff(f(x), x)'), ', ', el('code', {}, 'int(f(t), t, 0, x)'), ', ', el('code', {}, 'sum(…, k, 0, n)')),
        el('li', {}, 'Click a curve, or its expression, to see roots, extrema and intersections. Click a marked point to pin its label.')));
    root.append(el('div', { class: 'gx' },
      el('aside', { class: 'gx-panel' },
        el('div', { class: 'gx-head' }, el('h2', {}, 'Graphing'), el('div', { class: 'btn-row' },
          U.el('button', { type: 'button', class: 'primary small', onclick: () => { const n = newItem(''); S.items.push(n); refresh(true); listEl.querySelector(`.gx-item[data-id="${n.id}"] .gx-input`).focus(); } }, '+ Expression'),
          examples,
          U.el('button', { type: 'button', class: 'small', onclick: () => { if (window.confirm('Remove all expressions?')) { S.items = [newItem('')]; refresh(true); } } }, 'Clear'))),
        listEl,
        help),
      el('div', { class: 'gx-stage' },
        cv,
        el('div', { class: 'gx-tools' },
          U.el('button', { type: 'button', title: 'Zoom in', onclick: () => zoomAt(W / 2, H / 2, 0.7) }, '+'),
          U.el('button', { type: 'button', title: 'Zoom out', onclick: () => zoomAt(W / 2, H / 2, 1 / 0.7) }, '−'),
          U.el('button', { type: 'button', title: 'Home view', onclick: () => { S.view = { ...HOME }; viewChanged(); } }, '⌂'),
          U.el('button', { type: 'button', title: 'Save as PNG', onclick: savePNG }, '⤓')),
        coordEl)));
    bindCanvas();
    new ResizeObserver(() => { requestDraw(); schedulePois(); }).observe(cv);
    refresh(true);
  }

  Shell.register('graph', {
    label: 'Graphing', key: 3, root: () => document.getElementById('mod-graph'), init,
    onShow: () => requestDraw(),
    desc: 'Plot functions, polar and parametric curves, equations and inequalities. Sliders, tracing, roots, extrema and intersections.',
    features: ['y = f(x)', 'Polar & parametric', 'Implicit curves', 'Sliders'],
  });
})();

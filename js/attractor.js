// Strange attractors, chaotic flows and bifurcation diagrams, drawn as point densities with the IFS
// accumulator (ifs.js): prepare() returns an object whose iterate() replaces the chaos game.
const Attr = (() => {
  // params: name -> [default, min, max, label]
  const KINDS = {
    // ---- 2D maps
    clifford: {
      label: 'Clifford', group: 'map', eq: 'x′ = sin(a·y) + c·cos(a·x)\ny′ = sin(b·x) + d·cos(b·y)',
      params: { a: [-1.4, -3, 3], b: [1.6, -3, 3], c: [1, -3, 3], d: [0.7, -3, 3] },
      map(s, a, b, c, d) { const x = s.x, y = s.y; s.x = Math.sin(a * y) + c * Math.cos(a * x); s.y = Math.sin(b * x) + d * Math.cos(b * y); },
    },
    dejong: {
      label: 'Peter de Jong', group: 'map', eq: 'x′ = sin(a·y) − cos(b·x)\ny′ = sin(c·x) − cos(d·y)',
      params: { a: [1.641, -3, 3], b: [1.902, -3, 3], c: [0.316, -3, 3], d: [1.525, -3, 3] },
      map(s, a, b, c, d) { const x = s.x, y = s.y; s.x = Math.sin(a * y) - Math.cos(b * x); s.y = Math.sin(c * x) - Math.cos(d * y); },
    },
    svensson: {
      label: 'Johnny Svensson', group: 'map', eq: 'x′ = d·sin(a·x) − sin(b·y)\ny′ = c·cos(a·x) + cos(b·y)',
      params: { a: [1.5, -3, 3], b: [-1.8, -3, 3], c: [1.6, -3, 3], d: [0.9, -3, 3] },
      map(s, a, b, c, d) { const x = s.x, y = s.y; s.x = d * Math.sin(a * x) - Math.sin(b * y); s.y = c * Math.cos(a * x) + Math.cos(b * y); },
    },
    bedhead: {
      label: 'Bedhead', group: 'map', eq: 'x′ = y·sin(x·y / b) + cos(a·x − y)\ny′ = x + sin(y) / b',
      params: { a: [-0.81, -1, 1], b: [-0.92, -1, 1] },
      map(s, a, b) { const x = s.x, y = s.y; s.x = y * Math.sin((x * y) / b) + Math.cos(a * x - y); s.y = x + Math.sin(y) / b; },
    },
    henon: {
      label: 'Hénon', group: 'map', eq: 'x′ = 1 − a·x² + y\ny′ = b·x',
      params: { a: [1.4, 0, 1.5], b: [0.3, -0.5, 0.5] },
      map(s, a, b) { const x = s.x; s.x = 1 - a * x * x + s.y; s.y = b * x; },
    },
    ikeda: {
      label: 'Ikeda', group: 'map', eq: 't = 0.4 − 6 / (1 + x² + y²)\nx′ = 1 + a·(x·cos t − y·sin t)\ny′ = a·(x·sin t + y·cos t)',
      params: { a: [0.9, 0.5, 1] }, start: [0, 0], spread: 0.05,
      map(s, a) {
        const x = s.x, y = s.y, t = 0.4 - 6 / (1 + x * x + y * y), ct = Math.cos(t), st = Math.sin(t);
        s.x = 1 + a * (x * ct - y * st); s.y = a * (x * st + y * ct);
      },
    },
    tinkerbell: {
      label: 'Tinkerbell', group: 'map', eq: 'x′ = x² − y² + a·x + b·y\ny′ = 2·x·y + c·x + d·y',
      params: { a: [0.9, -1, 1.2], b: [-0.6013, -1, 1], c: [2, 1, 3], d: [0.5, -1, 1] }, start: [-0.72, -0.64], spread: 0.01,
      map(s, a, b, c, d) { const x = s.x, y = s.y; s.x = x * x - y * y + a * x + b * y; s.y = 2 * x * y + c * x + d * y; },
    },
    hopalong: {
      label: 'Hopalong', group: 'map', eq: 'x′ = y − sign(x)·√|b·x − c|\ny′ = a − x',
      params: { a: [-55, -100, 100], b: [-1, -10, 10], c: [-42, -100, 100] }, start: [0, 0], spread: 0.5,
      map(s, a, b, c) { const x = s.x; s.x = s.y - Math.sign(x) * Math.sqrt(Math.abs(b * x - c)); s.y = a - x; },
    },
    gumowski: {
      label: 'Gumowski–Mira', group: 'map', eq: 'f(x) = b·x + 2(1 − b)·x² / (1 + x²)\nx′ = y + a·(1 − 0.05·y²)·y + f(x)\ny′ = −x + f(x′)',
      params: { a: [0.008, -0.05, 0.05], b: [-0.7, -1, 1] }, start: [0.1, 0.1], spread: 1,
      map(s, a, b) {
        const f = (x) => b * x + (2 * (1 - b) * x * x) / (1 + x * x);
        const x = s.x, y = s.y, nx = y + a * (1 - 0.05 * y * y) * y + f(x);
        s.x = nx; s.y = -x + f(nx);
      },
    },
    gingerbread: {
      label: 'Gingerbread man', group: 'map', eq: 'x′ = 1 − y + |x|\ny′ = x',
      params: {}, start: [-0.1, 0], spread: 2, chain: 4000,
      map(s) { const x = s.x; s.x = 1 - s.y + Math.abs(x); s.y = x; },
    },
    popcorn: {
      label: 'Pickover popcorn', group: 'map', eq: 'x′ = x − a·sin(y + tan(b·y))\ny′ = y − a·sin(x + tan(b·x))',
      params: { a: [0.05, 0.005, 0.2], b: [3, 0.5, 6] }, start: [0, 0], spread: 6, chain: 60, warm: 0,
      map(s, a, b) { const x = s.x, y = s.y; s.x = x - a * Math.sin(y + Math.tan(b * y)); s.y = y - a * Math.sin(x + Math.tan(b * x)); },
    },

    // ---- 3D flows (differential equations, Runge–Kutta), seen through a rotatable projection
    lorenz: {
      label: 'Lorenz', group: 'flow', dt: 0.004, start: [0.1, 0, 20], eq: 'dx = a·(y − x)\ndy = x·(b − z) − y\ndz = x·y − c·z',
      params: { a: [10, 1, 30], b: [28, 1, 60], c: [8 / 3, 0.5, 6] },
      f(x, y, z, a, b, c, o) { o[0] = a * (y - x); o[1] = x * (b - z) - y; o[2] = x * y - c * z; },
    },
    rossler: {
      label: 'Rössler', group: 'flow', dt: 0.015, start: [1, 1, 0], pitch: 70, eq: 'dx = −y − z\ndy = x + a·y\ndz = b + z·(x − c)',
      params: { a: [0.2, 0, 0.5], b: [0.2, 0, 2], c: [5.7, 1, 14] },
      f(x, y, z, a, b, c, o) { o[0] = -y - z; o[1] = x + a * y; o[2] = b + z * (x - c); },
    },
    aizawa: {
      label: 'Aizawa', group: 'flow', dt: 0.008, start: [0.1, 0, 0], pitch: 15, eq: 'dx = (z − b)·x − d·y\ndy = d·x + (z − b)·y\ndz = c + a·z − z³/3 − (x² + y²)(1 + z/4) + z·x³/10',
      params: { a: [0.95, 0, 1.5], b: [0.7, 0, 1.5], c: [0.6, 0, 1.5], d: [3.5, 0, 6] },
      f(x, y, z, a, b, c, d, o) {
        o[0] = (z - b) * x - d * y; o[1] = d * x + (z - b) * y;
        o[2] = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x;
      },
    },
    thomas: {
      label: 'Thomas', group: 'flow', dt: 0.04, start: [0.1, 0, 0], yaw: 35, pitch: 30, eq: 'dx = sin(y) − a·x\ndy = sin(z) − a·y\ndz = sin(x) − a·z',
      params: { a: [0.208186, 0.05, 0.35] },
      f(x, y, z, a, o) { o[0] = Math.sin(y) - a * x; o[1] = Math.sin(z) - a * y; o[2] = Math.sin(x) - a * z; },
    },
    halvorsen: {
      label: 'Halvorsen', group: 'flow', dt: 0.004, start: [-1.48, -1.51, 2.04], yaw: 45, pitch: 35, eq: 'dx = −a·x − 4y − 4z − y²\ndy = −a·y − 4z − 4x − z²\ndz = −a·z − 4x − 4y − x²',
      params: { a: [1.4, 1, 3] },
      f(x, y, z, a, o) { o[0] = -a * x - 4 * y - 4 * z - y * y; o[1] = -a * y - 4 * z - 4 * x - z * z; o[2] = -a * z - 4 * x - 4 * y - x * x; },
    },
    chen: {
      label: 'Chen', group: 'flow', dt: 0.0015, start: [-0.1, 0.5, -0.6], eq: 'dx = a·(y − x)\ndy = (c − a)·x − x·z + c·y\ndz = x·y − b·z',
      params: { a: [35, 20, 50], b: [3, 1, 6], c: [28, 15, 35] },
      f(x, y, z, a, b, c, o) { o[0] = a * (y - x); o[1] = (c - a) * x - x * z + c * y; o[2] = x * y - b * z; },
    },

    // ---- bifurcation diagrams: long-run values of x (vertical) against a parameter (horizontal)
    logistic: {
      label: 'Logistic map', group: 'bif', eq: 'x′ = r·x·(1 − x)\nr from a to b (horizontal)',
      params: { a: [2.5, 0, 4], b: [4, 0, 4] }, x0: [0.05, 0.95],
      g(x, r) { return r * x * (1 - x); },
    },
    gauss: {
      label: 'Gauss map', group: 'bif', eq: 'x′ = exp(−c·x²) + β\nβ from a to b (horizontal)',
      params: { a: [-1, -1.5, 1.5], b: [1, -1.5, 1.5], c: [6.2, 2, 12] }, x0: [-1, 1],
      g(x, r, c) { return Math.exp(-c * x * x) + r; },
    },
    sine: {
      label: 'Sine map', group: 'bif', eq: 'x′ = r·sin(π·x)\nr from a to b (horizontal)',
      params: { a: [0.6, 0, 1], b: [1, 0, 1] }, x0: [0.05, 0.95],
      g(x, r) { return r * Math.sin(Math.PI * x); },
    },
  };
  const GROUPS = { map: 'Chaotic map', flow: '3D flow', bif: 'Bifurcation' };

  function defaults(kind = 'clifford') {
    const K = KINDS[kind] || KINDS.clifford;
    const d = {
      type: 'attractor',
      name: K.label + (K.group === 'bif' ? ' bifurcation' : ' attractor'),
      kind,
      a: 0, b: 0, c: 0, d: 0,
      yaw: K.yaw || 0, pitch: K.pitch || 0,
      colorMode: 'speed',
      palette: PALETTES.Ocean.slice(1).concat(['#ffffff']),
      gamma: 2.4,
      brightness: 1.4,
      background: '#05060a',
      view: null,
    };
    for (const [k, v] of Object.entries(K.params)) d[k] = v[0];
    return d;
  }

  // Runge–Kutta 4 for a 3D flow, in place on s.
  const k1 = new Float64Array(3), k2 = new Float64Array(3), k3 = new Float64Array(3), k4 = new Float64Array(3);
  function rk4(s, call, h) {
    const { x, y, z } = s, h2 = h / 2;
    call(x, y, z, k1);
    call(x + h2 * k1[0], y + h2 * k1[1], z + h2 * k1[2], k2);
    call(x + h2 * k2[0], y + h2 * k2[1], z + h2 * k2[2], k3);
    call(x + h * k3[0], y + h * k3[1], z + h * k3[2], k4);
    s.x = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    s.y = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    s.z = z + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  }

  function prepare(def) {
    const K = KINDS[def.kind];
    if (!K) return null;
    const p = ['a', 'b', 'c', 'd'].map((k) => +def[k] || 0);
    const yaw = ((+def.yaw || 0) * Math.PI) / 180, pitch = ((+def.pitch || 0) * Math.PI) / 180;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const lo = Math.min(p[0], p[1]), hi = Math.max(p[0], p[1]);
    const spread = K.spread ?? 0.1;
    // the flow's derivative with its parameters bound (f takes x, y, z, its parameters, then the output)
    const call = K.f ? (K.f.length === 5 ? (x, y, z, o) => K.f(x, y, z, p[0], o)
      : K.f.length === 7 ? (x, y, z, o) => K.f(x, y, z, p[0], p[1], p[2], o)
        : (x, y, z, o) => K.f(x, y, z, p[0], p[1], p[2], p[3], o)) : null;
    const lut = IFS.paletteLUT(def.palette);

    function restart(s) {
      if (K.group === 'bif') {
        s.r = lo + Math.random() * (hi - lo);
        s.x = K.x0[0] + Math.random() * (K.x0[1] - K.x0[0]);
        s.warm = 300; s.left = 300 + 250;
      } else {
        const st = K.start || [0.1, 0.1, 0.1];
        s.x = st[0] + (Math.random() - 0.5) * spread;
        s.y = st[1] + (Math.random() - 0.5) * spread;
        s.z = (st[2] || 0) + (Math.random() - 0.5) * spread;
        s.warm = K.warm ?? (K.group === 'flow' ? 500 : 30);
        s.left = K.chain || Infinity;
      }
      s.px = s.py = NaN;
    }

    // Advances one step and sets the projected point (s.px, s.py) and its speed s.v. False = diverged.
    function advance(s) {
      if (s.left-- <= 0) restart(s);
      const ox = s.px, oy = s.py;
      if (K.group === 'map') {
        K.map(s, p[0], p[1], p[2], p[3]);
        s.px = s.x; s.py = s.y;
      } else if (K.group === 'flow') {
        rk4(s, call, K.dt);
        const x1 = s.x * cy - s.y * sy, y1 = s.x * sy + s.y * cy;
        s.px = x1; s.py = s.z * cp - y1 * sp;
      } else {
        s.x = K.g(s.x, s.r, p[2]);
        s.px = s.r; s.py = s.x;
      }
      if (!(Math.abs(s.px) < 1e7 && Math.abs(s.py) < 1e7)) return false;
      const dx = s.px - ox, dy = s.py - oy;
      s.v = K.group === 'bif' ? Math.abs(dy) : Math.sqrt(dx * dx + dy * dy);
      return true;
    }

    const P = { attr: true, kind: def.kind };
    P.init = (st) => { st.as = {}; restart(st.as); };

    // Typical speed, so speed colouring spans the palette whatever the attractor's size.
    {
      const s = {}; restart(s);
      const vs = [];
      for (let i = 0; i < 20000 && vs.length < 4000; i++) {
        if (!advance(s)) { restart(s); continue; }
        if (s.warm > 0) { s.warm--; continue; }
        if (s.v === s.v) vs.push(s.v);
      }
      vs.sort((x, y) => x - y);
      P.vs = (vs.length ? vs[Math.floor(vs.length * 0.9)] : 1) || 1;
    }

    P.iterate = (st, N) => {
      const s = st.as;
      const w = st.w, h = st.h, hw = w / 2, hh = h / 2, k = st.k, co = st.cos, si = st.sin, cx = st.cx, cyv = st.cy;
      const count = st.count, CR = st.cr, CG = st.cg, CB = st.cb, inv = 1 / P.vs;
      let max = st.max;
      for (let it = 0; it < N; it++) {
        if (!advance(s)) { restart(s); continue; }
        if (s.warm > 0) { s.warm--; continue; }
        const dx = s.px - cx, dy = s.py - cyv;
        const fx = hw + (dx * co + dy * si) * k;
        const fy = hh - (dy * co - dx * si) * k;
        if (fx >= 0 && fx < w && fy >= 0 && fy < h) {
          const idx = (fy | 0) * w + (fx | 0);
          const c = ++count[idx];
          if (c > max) max = c;
          const v = s.v * inv;
          const li = (v === v ? Math.min(255, (v * 160) | 0) : 0) * 3;
          CR[idx] += lut[li] / 255; CG[idx] += lut[li + 1] / 255; CB[idx] += lut[li + 2] / 255;
        }
      }
      st.max = max;
      st.total += N;
    };

    // Projected sample points, for framing the view.
    P.sample = (M) => {
      const xs = new Float64Array(M), ys = new Float64Array(M);
      const s = {}; restart(s);
      let m = 0;
      for (let i = 0; i < M * 4 && m < M; i++) {
        if (!advance(s)) { restart(s); continue; }
        if (s.warm > 0) { s.warm--; continue; }
        xs[m] = s.px; ys[m] = s.py; m++;
      }
      return { xs, ys, m };
    };
    return P;
  }

  function random() {
    const kind = Math.random() < 0.75 ? U.pick(['clifford', 'dejong', 'svensson']) : U.pick(['lorenz', 'aizawa', 'thomas', 'halvorsen']);
    const d = defaults(kind);
    const K = KINDS[kind];
    // Random maps are tried until one fills an area (rather than collapsing to a few points).
    for (let tries = 0; tries < 40; tries++) {
      if (K.group === 'map') for (const k of Object.keys(K.params)) d[k] = +U.rand(-2.6, 2.6).toFixed(3);
      else { d.yaw = Math.round(U.rand(-180, 180)); d.pitch = Math.round(U.rand(-40, 60)); }
      if (K.group !== 'map' || spreadOK(d)) break;
    }
    d.name = 'Random ' + K.label;
    d.palette = Math.random() < 0.5 ? randomPalette() : PALETTES[U.pick(Object.keys(PALETTES))].slice();
    d.colorMode = Math.random() < 0.7 ? 'speed' : 'palette';
    return d;
  }

  // True when the attractor covers many distinct cells of a coarse grid.
  function spreadOK(def) {
    const P = prepare(def);
    const { xs, ys, m } = P.sample(6000);
    if (m < 3000) return false;
    const cells = new Set();
    for (let i = 0; i < m; i++) cells.add(Math.round(xs[i] * 20) + ':' + Math.round(ys[i] * 20));
    return cells.size > 900;
  }

  return { KINDS, GROUPS, defaults, prepare, random };
})();

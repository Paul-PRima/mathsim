// Simulations: cellular automata (Game of Life and relatives, 1D rules), L-systems, reaction–diffusion
// (Gray–Scott) and the Ulam prime spiral.
const Sims = (() => {
  // "B3/S23" → { born: Set, survive: Set }
  function parseRule(s) {
    const m = /^\s*B([0-8]*)\s*\/\s*S([0-8]*)\s*$/i.exec(s);
    if (!m) return null;
    return { born: new Set([...m[1]].map(Number)), survive: new Set([...m[2]].map(Number)) };
  }
  // one Life-like step on a toroidal grid (Uint8Array, w × h)
  function lifeStep(g, w, h, rule) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w, xp = (x + 1) % w;
        const n = g[ym + xm] + g[ym + x] + g[ym + xp] + g[y0 + xm] + g[y0 + xp] + g[yp + xm] + g[yp + x] + g[yp + xp];
        out[y0 + x] = g[y0 + x] ? (rule.survive.has(n) ? 1 : 0) : (rule.born.has(n) ? 1 : 0);
      }
    }
    return out;
  }
  // next row of an elementary (1D) cellular automaton, wrapping at the edges
  function rowStep(row, rule) {
    const n = row.length, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (rule >> ((row[(i - 1 + n) % n] << 2) | (row[i] << 1) | row[(i + 1) % n])) & 1;
    return out;
  }
  // L-system expansion with a length cap
  function expand(axiom, rules, n, cap = 2e6) {
    let s = axiom;
    for (let i = 0; i < n; i++) {
      let t = '';
      for (const ch of s) { t += rules[ch] !== undefined ? rules[ch] : ch; if (t.length > cap) return { s, iterations: i, capped: true }; }
      s = t;
    }
    return { s, iterations: n, capped: false };
  }
  function sieve(n) {
    const p = new Uint8Array(n + 1).fill(1);
    p[0] = 0; if (n >= 1) p[1] = 0;
    for (let i = 2; i * i <= n; i++) if (p[i]) for (let j = i * i; j <= n; j += i) p[j] = 0;
    return p;
  }
  // (x, y) of n on the Ulam spiral (1 at the origin, going right, then counter-clockwise)
  function ulamXY(n) {
    if (n === 1) return [0, 0];
    const k = Math.ceil((Math.sqrt(n) - 1) / 2), t = 2 * k + 1;
    let m = t * t;
    const s = t - 1;
    if (n >= m - s) return [k - (m - n), -k];
    m -= s;
    if (n >= m - s) return [-k, -k + (m - n)];
    m -= s;
    if (n >= m - s) return [-k + (m - n), k];
    return [k, k - (m - s - n)];
  }

  // ---- physics
  // one classical Runge–Kutta step for y' = f(y)
  function rk4(f, y, h) {
    const k1 = f(y), k2 = f(y.map((v, i) => v + (h / 2) * k1[i])), k3 = f(y.map((v, i) => v + (h / 2) * k2[i])), k4 = f(y.map((v, i) => v + h * k3[i]));
    return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  // simple pendulum [θ, ω]
  const pendulum = ({ g, L, c = 0 }) => ([th, w]) => [w, -(g / L) * Math.sin(th) - c * w];
  // exact period of a pendulum released at angle θ0: T = 2π√(L/g) / AGM(1, cos(θ0/2))
  function pendulumPeriod(g, L, th0) {
    let a = 1, b = Math.cos(th0 / 2);
    for (let i = 0; i < 30 && Math.abs(a - b) > 1e-15; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
    return (2 * Math.PI * Math.sqrt(L / g)) / a;
  }
  // double pendulum [θ1, θ2, ω1, ω2]
  const doublePendulum = ({ g, L1, L2, m1, m2 }) => ([t1, t2, w1, w2]) => {
    const d = t1 - t2, den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    const a1 = (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) / (L1 * den);
    const a2 = (2 * Math.sin(d) * (w1 * w1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * L2 * m2 * Math.cos(d))) / (L2 * den);
    return [w1, w2, a1, a2];
  };
  function doubleEnergy({ g, L1, L2, m1, m2 }, [t1, t2, w1, w2]) {
    const y1 = -L1 * Math.cos(t1), y2 = y1 - L2 * Math.cos(t2);
    const T = 0.5 * m1 * L1 * L1 * w1 * w1 + 0.5 * m2 * (L1 * L1 * w1 * w1 + L2 * L2 * w2 * w2 + 2 * L1 * L2 * w1 * w2 * Math.cos(t1 - t2));
    return T + m1 * g * y1 + m2 * g * y2;
  }
  // projectile [x, y, vx, vy] with quadratic air drag k (per unit mass)
  const projectile = ({ g, k = 0 }) => ([, , vx, vy]) => { const v = Math.hypot(vx, vy); return [vx, vy, -k * v * vx, -g - k * v * vy]; };
  // Kepler orbit elements from position and velocity (μ = GM)
  function orbitElements(mu, [x, y], [vx, vy]) {
    const r = Math.hypot(x, y), E = (vx * vx + vy * vy) / 2 - mu / r, h = x * vy - y * vx;
    const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (mu * mu)));
    const a = E < 0 ? -mu / (2 * E) : Infinity;
    return { E, h, e, a, T: E < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity };
  }

  // ---- Fourier epicycles: discrete Fourier transform of a closed path (points as [x, y] = x + iy)
  function dft(pts) {
    const N = pts.length, out = [];
    for (let k = 0; k < N; k++) {
      const f = k <= N / 2 ? k : k - N; // frequencies −N/2 … N/2
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const a = (-2 * Math.PI * f * n) / N, c = Math.cos(a), s = Math.sin(a);
        re += pts[n][0] * c - pts[n][1] * s;
        im += pts[n][0] * s + pts[n][1] * c;
      }
      re /= N; im /= N;
      out.push({ f, re, im, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
    }
    return out.sort((a, b) => b.amp - a.amp);
  }
  // point at time t ∈ [0, 1) using the first m terms
  function epicycleAt(terms, t, m = terms.length) {
    let x = 0, y = 0;
    for (let i = 0; i < m; i++) { const a = 2 * Math.PI * terms[i].f * t + terms[i].phase; x += terms[i].amp * Math.cos(a); y += terms[i].amp * Math.sin(a); }
    return [x, y];
  }
  // n points equally spaced along a closed polyline
  function resample(pts, n) {
    const closed = pts.concat([pts[0]]), seg = [];
    let total = 0;
    for (let i = 1; i < closed.length; i++) { const d = Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]); seg.push(d); total += d; }
    if (!total) return pts.slice(0, 1);
    const out = [];
    let i = 0, acc = 0;
    for (let k = 0; k < n; k++) {
      const target = (k * total) / n;
      while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
      const f = seg[i] ? (target - acc) / seg[i] : 0;
      out.push([closed[i][0] + (closed[i + 1][0] - closed[i][0]) * f, closed[i][1] + (closed[i + 1][1] - closed[i][1]) * f]);
    }
    return out;
  }

  // ---- sorting: generators that sort `a` in place and yield every comparison / write for the animation
  const SORTS = {
    bubble: function* (a) {
      for (let end = a.length - 1; end > 0; end--) {
        let swapped = false;
        for (let i = 0; i < end; i++) {
          yield { cmp: [i, i + 1] };
          if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; yield { swap: [i, i + 1] }; }
        }
        yield { done: end };
        if (!swapped) break;
      }
    },
    insertion: function* (a) {
      for (let i = 1; i < a.length; i++) {
        for (let j = i; j > 0; j--) {
          yield { cmp: [j - 1, j] };
          if (a[j - 1] <= a[j]) break;
          [a[j - 1], a[j]] = [a[j], a[j - 1]]; yield { swap: [j - 1, j] };
        }
      }
    },
    selection: function* (a) {
      for (let i = 0; i < a.length - 1; i++) {
        let m = i;
        for (let j = i + 1; j < a.length; j++) { yield { cmp: [m, j] }; if (a[j] < a[m]) m = j; }
        if (m !== i) { [a[i], a[m]] = [a[m], a[i]]; yield { swap: [i, m] }; }
        yield { done: i };
      }
    },
    shell: function* (a) {
      for (let gap = Math.floor(a.length / 2); gap > 0; gap = Math.floor(gap / 2.2) || (gap > 1 ? 1 : 0)) {
        for (let i = gap; i < a.length; i++) {
          for (let j = i; j >= gap; j -= gap) {
            yield { cmp: [j - gap, j] };
            if (a[j - gap] <= a[j]) break;
            [a[j - gap], a[j]] = [a[j], a[j - gap]]; yield { swap: [j - gap, j] };
          }
        }
        if (gap === 1) break;
      }
    },
    merge: function* (a) {
      function* rec(lo, hi) {
        if (hi - lo < 2) return;
        const mid = (lo + hi) >> 1;
        yield* rec(lo, mid); yield* rec(mid, hi);
        const left = a.slice(lo, mid), right = a.slice(mid, hi);
        let i = 0, j = 0, k = lo;
        while (i < left.length && j < right.length) {
          yield { cmp: [lo + i, mid + j] };
          a[k] = left[i] <= right[j] ? left[i++] : right[j++]; yield { set: k++ };
        }
        while (i < left.length) { a[k] = left[i++]; yield { set: k++ }; }
        while (j < right.length) { a[k] = right[j++]; yield { set: k++ }; }
      }
      yield* rec(0, a.length);
    },
    quick: function* (a) {
      function* rec(lo, hi) {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1; // median of three as pivot, moved to the end
        if (a[mid] < a[lo]) [a[mid], a[lo]] = [a[lo], a[mid]];
        if (a[hi] < a[lo]) [a[hi], a[lo]] = [a[lo], a[hi]];
        if (a[mid] < a[hi]) [a[mid], a[hi]] = [a[hi], a[mid]];
        yield { swap: [mid, hi] };
        const p = a[hi];
        let i = lo;
        for (let j = lo; j < hi; j++) {
          yield { cmp: [j, hi] };
          if (a[j] < p) { [a[i], a[j]] = [a[j], a[i]]; yield { swap: [i, j] }; i++; }
        }
        [a[i], a[hi]] = [a[hi], a[i]]; yield { swap: [i, hi] };
        yield { done: i };
        yield* rec(lo, i - 1); yield* rec(i + 1, hi);
      }
      yield* rec(0, a.length - 1);
    },
    heap: function* (a) {
      const n = a.length;
      function* sift(i, size) {
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < size) { yield { cmp: [l, m] }; if (a[l] > a[m]) m = l; }
          if (r < size) { yield { cmp: [r, m] }; if (a[r] > a[m]) m = r; }
          if (m === i) return;
          [a[i], a[m]] = [a[m], a[i]]; yield { swap: [i, m] };
          i = m;
        }
      }
      for (let i = (n >> 1) - 1; i >= 0; i--) yield* sift(i, n);
      for (let end = n - 1; end > 0; end--) { [a[0], a[end]] = [a[end], a[0]]; yield { swap: [0, end] }; yield { done: end }; yield* sift(0, end); }
    },
  };

  // ---- shortest paths on a grid: 0 free, 1 wall, 2 mud (costs 5). Yields after every expanded cell.
  function* gridSearch(grid, w, h, start, goal, algo) {
    const N = w * h, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N), open = new Uint8Array(N);
    const hfn = (i) => Math.abs((i % w) - (goal % w)) + Math.abs(Math.floor(i / w) - Math.floor(goal / w));
    const cost = (i) => (grid[i] === 2 ? 5 : 1);
    // binary heap of [priority, tie, cell]
    const heap = [];
    let tie = 0;
    const push = (p, i) => { heap.push([p, tie++, i]); let k = heap.length - 1; while (k) { const q = (k - 1) >> 1; if (heap[q][0] < heap[k][0] || (heap[q][0] === heap[k][0] && heap[q][1] < heap[k][1])) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; for (const c of [l, r]) if (c < heap.length && (heap[c][0] < heap[m][0] || (heap[c][0] === heap[m][0] && heap[c][1] < heap[m][1]))) m = c; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const prio = (i) => (algo === 'bfs' ? 0 : algo === 'dijkstra' ? g[i] : algo === 'astar' ? g[i] + hfn(i) : hfn(i));
    g[start] = 0; open[start] = 1; push(prio(start), start);
    const state = { g, prev, closed, open, current: -1, path: null, cost: Infinity, expanded: 0 };
    while (heap.length) {
      const [, , i] = pop();
      if (closed[i]) continue;
      closed[i] = 1; open[i] = 0; state.current = i; state.expanded++;
      if (i === goal) break;
      const x = i % w, y = Math.floor(i / w);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (grid[j] === 1 || closed[j]) continue;
        const ng = g[i] + cost(j);
        if (ng < g[j] && !(algo === 'bfs' && open[j])) { g[j] = ng; prev[j] = i; open[j] = 1; push(prio(j), j); }
      }
      yield state;
    }
    if (closed[goal]) {
      const path = [];
      for (let i = goal; i >= 0; i = prev[i]) path.push(i);
      state.path = path.reverse(); state.cost = g[goal];
    } else state.path = [];
    state.current = -1;
    yield state;
  }
  // a perfect maze (recursive backtracker) on a w × h grid with odd sizes; 1 = wall
  function maze(w, h, rnd = Math.random) {
    const grid = new Uint8Array(w * h).fill(1);
    const stack = [[1, 1]];
    grid[w + 1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const next = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[ny * w + nx] === 1);
      if (!next.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = next[Math.floor(rnd() * next.length)];
      grid[(y + dy / 2) * w + (x + dx / 2)] = 0; grid[ny * w + nx] = 0;
      stack.push([nx, ny]);
    }
    // open a few extra passages so there is more than one route
    for (let k = 0; k < (w * h) / 40; k++) { const x = 1 + Math.floor(rnd() * (w - 2)), y = 1 + Math.floor(rnd() * (h - 2)); if ((x + y) % 2 === 1) grid[y * w + x] = 0; }
    return grid;
  }
  return { parseRule, lifeStep, rowStep, expand, sieve, ulamXY, rk4, pendulum, pendulumPeriod, doublePendulum, doubleEnergy, projectile, orbitElements, dft, epicycleAt, resample, SORTS, gridSearch, maze };
})();

(() => {
  const { el } = U;
  let root, body, active = null, running = false, last = 0;
  const st = { tab: 'life', speed: 12,
    pend: { mode: 'single', angle: 60, L: 1.5, g: 9.81, damp: 0, time: 1 }, proj: { v0: 25, angle: 45, h0: 0, g: 9.81, drag: 0, time: 1 },
    orbit: { v: 0.85, time: 1, areas: true }, epi: { n: 40, secs: 8, circles: true, original: true },
    sort: { algo: 'quick', input: 'random', n: 80, speed: 4 }, path: { algo: 'astar', speed: 6 } };
  const fmt = (v) => MX.fmt(+(+v).toPrecision(6));

  // ---------------------------------------------------------------- Game of Life (and other life-like rules)
  function lifeTab() {
    const RULES = { 'Conway (B3/S23)': 'B3/S23', 'HighLife (B36/S23)': 'B36/S23', 'Seeds (B2/S)': 'B2/S', 'Day & Night (B3678/S34678)': 'B3678/S34678', 'Life without death (B3/S012345678)': 'B3/S012345678', 'Maze (B3/S12345)': 'B3/S12345' };
    const cell = 7;
    let w = 1, h = 1, grid = new Uint8Array(1), gen = 0, rule = Sims.parseRule('B3/S23');
    const cv = el('canvas', { class: 'sim-canvas' }), info = el('div', { class: 'pl-stats' });
    const fit = () => {
      const nw = Math.max(10, Math.floor(cv.clientWidth / cell)), nh = Math.max(10, Math.floor(cv.clientHeight / cell));
      if (nw === w && nh === h) return;
      const g = new Uint8Array(nw * nh);
      for (let y = 0; y < Math.min(h, nh); y++) for (let x = 0; x < Math.min(w, nw); x++) g[y * nw + x] = grid[y * w + x];
      w = nw; h = nh; grid = g;
    };
    const place = (pattern, ox, oy) => pattern.forEach(([x, y]) => { const X = (ox + x + w) % w, Y = (oy + y + h) % h; grid[Y * w + X] = 1; });
    const PATTERNS = {
      Random: () => { for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.28 ? 1 : 0; },
      'Glider gun': () => { grid.fill(0); place([[24, 0], [22, 1], [24, 1], [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2], [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3], [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4], [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5], [10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8]], 4, 4); },
      'R-pentomino': () => { grid.fill(0); place([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], w >> 1, h >> 1); },
      Gliders: () => { grid.fill(0); for (let i = 0; i < 12; i++) place([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], Math.floor(Math.random() * w), Math.floor(Math.random() * h)); },
      Pulsar: () => { grid.fill(0); const q = [2, 3, 4]; const pts = []; for (const a of q) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { pts.push([sx * a, sy * 1], [sx * a, sy * 6], [sx * 1, sy * a], [sx * 6, sy * a]); } place(pts, w >> 1, h >> 1); },
      Clear: () => grid.fill(0),
    };
    const ruleSel = el('select', {}, Object.keys(RULES).map((k) => el('option', { value: RULES[k] }, k)));
    ruleSel.addEventListener('change', () => { rule = Sims.parseRule(ruleSel.value); });
    const patSel = el('select', {}, el('option', { value: '' }, 'Start pattern…'), Object.keys(PATTERNS).map((k) => el('option', { value: k }, k)));
    patSel.addEventListener('change', () => { if (patSel.value) { fit(); PATTERNS[patSel.value](); gen = 0; draw(); } patSel.value = ''; });
    function draw() {
      fit();
      const { ctx, w: cw, h: ch } = Charts.setup(cv);
      ctx.fillStyle = Theme.bg; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#51cf66';
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y * w + x]) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
      let pop = 0; for (let i = 0; i < grid.length; i++) pop += grid[i];
      info.replaceChildren(el('div', { class: 'pl-stat' }, el('span', {}, 'generation'), el('b', { class: 'mono' }, String(gen))), el('div', { class: 'pl-stat' }, el('span', {}, 'living cells'), el('b', { class: 'mono' }, String(pop))));
    }
    // paint cells with the mouse
    let paint = null;
    cv.addEventListener('pointerdown', (e) => { fit(); const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell); if (x < w && y < h) { paint = grid[y * w + x] ? 0 : 1; grid[y * w + x] = paint; draw(); cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', (e) => { if (paint == null) return; const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell); if (x >= 0 && y >= 0 && x < w && y < h) { grid[y * w + x] = paint; draw(); } });
    cv.addEventListener('pointerup', () => { paint = null; });
    let started = false;
    return {
      controls: [ruleSel, patSel],
      view: el('div', {}, cv, info, el('p', { class: 'hint' }, 'Each cell lives or dies by counting its 8 neighbours: Conway’s rule B3/S23 means a dead cell with exactly 3 neighbours is born, and a live cell with 2 or 3 survives. Click or drag on the grid to draw cells.')),
      step: () => { grid = Sims.lifeStep(grid, w, h, rule); gen++; },
      draw: () => { if (!started) { started = true; fit(); PATTERNS['Glider gun'](); } draw(); },
      reset: () => { fit(); PATTERNS.Random(); gen = 0; draw(); },
    };
  }

  // ---------------------------------------------------------------- 1D elementary automata
  function ecaTab() {
    const cell = 3;
    let rule = 30, rows = [], width = 1, single = true;
    const cv = el('canvas', { class: 'sim-canvas' });
    const ruleIn = el('input', { type: 'number', min: 0, max: 255, value: rule, class: 'num' });
    ruleIn.addEventListener('change', () => { rule = U.clamp(Math.round(+ruleIn.value || 0), 0, 255); ruleIn.value = rule; restart(); });
    const presets = el('select', {}, el('option', { value: '' }, 'Famous rules…'), [[30, 'Rule 30 — chaos'], [90, 'Rule 90 — Sierpinski'], [110, 'Rule 110 — universal computer'], [184, 'Rule 184 — traffic'], [73, 'Rule 73'], [45, 'Rule 45']].map(([v, l]) => el('option', { value: v }, l)));
    presets.addEventListener('change', () => { if (presets.value) { rule = +presets.value; ruleIn.value = rule; restart(); } presets.value = ''; });
    const startSel = el('select', {}, el('option', { value: 'one' }, 'Start: one cell'), el('option', { value: 'random' }, 'Start: random'));
    startSel.addEventListener('change', () => { single = startSel.value === 'one'; restart(); });
    function restart() {
      width = Math.max(20, Math.floor(cv.clientWidth / cell));
      const r = new Uint8Array(width);
      if (single) r[width >> 1] = 1; else for (let i = 0; i < width; i++) r[i] = Math.random() < 0.5 ? 1 : 0;
      rows = [r];
      draw();
    }
    const maxRows = () => Math.max(10, Math.floor(cv.clientHeight / cell));
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      ctx.fillStyle = Theme.bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffc078';
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x]) ctx.fillRect(x * cell, y * cell, cell, cell); });
      // the rule's lookup table, drawn small in the corner
      const bx = 8, by = h - 30;
      ctx.font = '10px ui-monospace, monospace';
      for (let i = 7; i >= 0; i--) {
        const x = bx + (7 - i) * 34;
        for (let b = 0; b < 3; b++) { ctx.fillStyle = (i >> (2 - b)) & 1 ? '#ffc078' : Theme.frame; ctx.fillRect(x + b * 9, by, 8, 8); }
        ctx.fillStyle = (rule >> i) & 1 ? '#ffc078' : Theme.frame; ctx.fillRect(x + 9, by + 10, 8, 8);
      }
    }
    let started = false;
    return {
      controls: [presets, el('label', { class: 'inline-ctl' }, 'rule ', ruleIn), startSel],
      view: el('div', {}, cv, el('p', { class: 'hint' }, 'A row of cells; each new row follows from the three cells above (left, self, right). The 8 possible patterns, written as an 8-bit number, are the rule — shown in the corner. Rule 30 looks random, Rule 90 draws Sierpinski’s triangle, Rule 110 can compute anything.')),
      step: () => { if (rows.length >= maxRows()) rows.shift(); rows.push(Sims.rowStep(rows[rows.length - 1], rule)); },
      draw: () => { if (!started) { started = true; restart(); } else draw(); },
      reset: restart,
    };
  }

  // ---------------------------------------------------------------- L-systems
  function lsysTab() {
    const PRESETS = {
      'Fractal plant': { axiom: 'X', rules: 'X=F+[[X]-X]-F[-FX]+X\nF=FF', angle: 25, n: 6, start: 70 },
      'Bushy tree': { axiom: 'F', rules: 'F=FF-[-F+F+F]+[+F-F-F]', angle: 22.5, n: 4, start: 90 },
      'Koch snowflake': { axiom: 'F--F--F', rules: 'F=F+F--F+F', angle: 60, n: 4, start: 0 },
      'Sierpinski arrowhead': { axiom: 'A', rules: 'A=B-A-B\nB=A+B+A', angle: 60, n: 7, start: 0 },
      'Dragon curve': { axiom: 'FX', rules: 'X=X+YF+\nY=-FX-Y', angle: 90, n: 12, start: 0 },
      'Hilbert curve': { axiom: 'A', rules: 'A=+BF-AFA-FB+\nB=-AF+BFB+FA-', angle: 90, n: 6, start: 0 },
      'Lévy C curve': { axiom: 'F', rules: 'F=+F--F+', angle: 45, n: 12, start: 0 },
      'Penrose-like star': { axiom: 'F++F++F++F++F', rules: 'F=F++F++F|F-F++F', angle: 36, n: 3, start: 0 },
    };
    const cur = Object.assign({}, PRESETS['Fractal plant']);
    const cv = el('canvas', { class: 'sim-canvas' }), info = el('div', { class: 'hint' });
    const pre = el('select', {}, Object.keys(PRESETS).map((k) => el('option', { value: k }, k)));
    const axiom = el('input', { type: 'text', class: 'mono', value: cur.axiom });
    const rules = el('textarea', { class: 'mono sim-rules', rows: 3 }, cur.rules);
    const angle = el('input', { type: 'number', class: 'num', value: cur.angle, step: 'any' });
    const iters = el('input', { type: 'number', class: 'num', value: cur.n, min: 0, max: 15 });
    const sync = () => { axiom.value = cur.axiom; rules.value = cur.rules; angle.value = cur.angle; iters.value = cur.n; };
    pre.addEventListener('change', () => { Object.assign(cur, PRESETS[pre.value]); sync(); draw(); });
    [axiom, rules, angle, iters].forEach((i) => i.addEventListener('input', () => { cur.axiom = axiom.value; cur.rules = rules.value; cur.angle = +angle.value || 0; cur.n = U.clamp(Math.round(+iters.value || 0), 0, 15); draw(); }));
    let progress = 1;
    function draw() {
      const ruleMap = {};
      for (const line of cur.rules.split(/\n/)) { const m = /^\s*(\S)\s*=\s*(.*)$/.exec(line); if (m) ruleMap[m[1]] = m[2].replace(/\s/g, ''); }
      const { s, iterations, capped } = Sims.expand(cur.axiom.replace(/\s/g, ''), ruleMap, cur.n);
      // walk the turtle: F, G, A, B draw; f moves; + − turn; [ ] push/pop; | turns around
      const a = (cur.angle * Math.PI) / 180;
      let x = 0, y = 0, dir = ((cur.start || 0) * Math.PI) / 180;
      const stack = [], segs = [];
      let minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (const ch of s) {
        if (ch === 'F' || ch === 'G' || ch === 'A' || ch === 'B') { const nx = x + Math.cos(dir), ny = y + Math.sin(dir); segs.push(x, y, nx, ny, stack.length); x = nx; y = ny; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        else if (ch === 'f') { x += Math.cos(dir); y += Math.sin(dir); }
        else if (ch === '+') dir += a; else if (ch === '-') dir -= a; else if (ch === '|') dir += Math.PI;
        else if (ch === '[') stack.push([x, y, dir]); else if (ch === ']' && stack.length) [x, y, dir] = stack.pop();
      }
      const { ctx, w, h } = Charts.setup(cv);
      ctx.fillStyle = Theme.bg; ctx.fillRect(0, 0, w, h);
      const sc = Math.min((w - 30) / ((maxX - minX) || 1), (h - 30) / ((maxY - minY) || 1));
      const ox = (w - (maxX + minX) * sc) / 2, oy = (h + (maxY + minY) * sc) / 2;
      const n = segs.length / 5, upto = Math.floor(n * progress);
      ctx.lineWidth = Math.max(0.6, Math.min(2, sc * 0.25));
      ctx.lineCap = 'round';
      // colour along the path (or by branch depth for plants)
      const plant = cur.rules.includes('[');
      const batch = 64;
      for (let i0 = 0; i0 < upto; i0 += batch) {
        const t = i0 / Math.max(1, n), depth = segs[i0 * 5 + 4];
        ctx.strokeStyle = plant ? `hsl(${100 + Math.min(depth, 8) * 6}, ${45 + depth * 5}%, ${32 + depth * 6}%)` : `hsl(${200 + t * 140}, 80%, 62%)`;
        ctx.beginPath();
        for (let i = i0; i < Math.min(upto, i0 + batch); i++) { ctx.moveTo(ox + segs[i * 5] * sc, oy - segs[i * 5 + 1] * sc); ctx.lineTo(ox + segs[i * 5 + 2] * sc, oy - segs[i * 5 + 3] * sc); }
        ctx.stroke();
      }
      info.textContent = `${iterations} iteration${iterations === 1 ? '' : 's'} · ${MX.fmt(s.length)} symbols · ${MX.fmt(n)} line segments${capped ? ' · stopped early (string too long)' : ''}`;
    }
    return {
      controls: [pre],
      view: el('div', { class: 'sim-split' }, el('div', { class: 'sim-side' },
        el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Axiom (start)'), axiom),
        el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Rules (one per line, e.g. F=F+F--F+F)'), rules),
        el('div', { class: 'grid2' }, el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Angle °'), angle), el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Iterations'), iters)),
        el('p', { class: 'hint' }, 'F (or G, A, B) = draw forward · f = move · + / − = turn · [ ] = save / restore position (branches) · | = turn around. Run animates the drawing.'), info),
      cv),
      step: () => { progress = Math.min(1, progress + 0.01); },
      draw: () => draw(),
      reset: () => { progress = 0; draw(); },
      onRun: () => { if (progress >= 1) progress = 0; },
    };
  }

  // ---------------------------------------------------------------- reaction–diffusion (Gray–Scott)
  function rdTab() {
    const PRESETS = { Coral: [0.0545, 0.062], Mitosis: [0.0367, 0.0649], Spots: [0.03, 0.062], Maze: [0.029, 0.057], Fingerprint: [0.037, 0.06], Waves: [0.014, 0.054], Worms: [0.078, 0.061] };
    const N = 200;
    let A = new Float32Array(N * N), B = new Float32Array(N * N), A2 = new Float32Array(N * N), B2 = new Float32Array(N * N);
    let [F, K] = PRESETS.Coral;
    const cv = el('canvas', { class: 'sim-canvas sim-rd' }), off = document.createElement('canvas');
    off.width = N; off.height = N;
    const octx = off.getContext('2d'), img = octx.createImageData(N, N);
    const pre = el('select', {}, Object.keys(PRESETS).map((k) => el('option', { value: k }, k)));
    pre.addEventListener('change', () => { [F, K] = PRESETS[pre.value]; seed(); });
    function seed() {
      A.fill(1); B.fill(0);
      for (let s = 0; s < 14; s++) {
        const cx = Math.floor(Math.random() * N), cy = Math.floor(Math.random() * N), r = 3 + Math.floor(Math.random() * 4);
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const i = ((cy + y + N) % N) * N + ((cx + x + N) % N); B[i] = 1; }
      }
      draw();
    }
    function step() {
      // Karl Sims' formulation: D_A = 1, D_B = 0.5, 3×3 Laplacian, dt = 1
      for (let y = 0; y < N; y++) {
        const ym = ((y - 1 + N) % N) * N, y0 = y * N, yp = ((y + 1) % N) * N;
        for (let x = 0; x < N; x++) {
          const xm = (x - 1 + N) % N, xp = (x + 1) % N, i = y0 + x;
          const a = A[i], b = B[i];
          const la = -a + 0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
          const lb = -b + 0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
          const abb = a * b * b;
          A2[i] = a + (la - abb + F * (1 - a));
          B2[i] = b + (0.5 * lb + abb - (K + F) * b);
        }
      }
      [A, A2] = [A2, A]; [B, B2] = [B2, B];
    }
    function draw() {
      const d = img.data;
      // dark → deep blue → cyan → white, by the amount of chemical B
      const stops = [[12, 14, 19], [27, 58, 92], [34, 184, 207], [233, 251, 255]];
      for (let i = 0; i < N * N; i++) {
        const t = U.clamp(B[i] * 3, 0, 0.999) * (stops.length - 1), k = Math.floor(t), f = t - k;
        for (let c = 0; c < 3; c++) d[i * 4 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
        d[i * 4 + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      const { ctx, w, h } = Charts.setup(cv);
      ctx.imageSmoothingEnabled = true;
      const s = Math.min(w, h);
      ctx.drawImage(off, (w - s) / 2, (h - s) / 2, s, s);
    }
    // paint chemical B with the mouse
    const paint = (e) => {
      const r = cv.getBoundingClientRect(), s = Math.min(r.width, r.height);
      const x = Math.floor(((e.clientX - r.left - (r.width - s) / 2) / s) * N), y = Math.floor(((e.clientY - r.top - (r.height - s) / 2) / s) * N);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) { const i = ((y + dy + N) % N) * N + ((x + dx + N) % N); B[i] = 1; }
      draw();
    };
    let down = false;
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); paint(e); });
    cv.addEventListener('pointermove', (e) => { if (down) paint(e); });
    cv.addEventListener('pointerup', () => { down = false; });
    let started = false;
    return {
      controls: [pre],
      view: el('div', {}, cv, el('p', { class: 'hint' }, 'Two virtual chemicals spread out and react (U + 2V → 3V). Depending on the feed and kill rates the same equations grow coral, dividing cells, mazes or fingerprints — Alan Turing’s idea for how animal patterns form. Paint with the mouse to add chemical.')),
      step: () => { for (let i = 0; i < 6; i++) step(); },
      draw: () => { if (!started) { started = true; seed(); } else draw(); },
      reset: seed, stepsPerFrame: true,
    };
  }

  // ---------------------------------------------------------------- Ulam spiral
  function ulamTab() {
    let size = 201, mode = 'primes';
    const cv = el('canvas', { class: 'sim-canvas' }), info = el('div', { class: 'pl-stats' });
    const sizeSel = el('select', {}, [[101, '101 × 101'], [201, '201 × 201'], [301, '301 × 301'], [501, '501 × 501']].map(([v, l]) => el('option', { value: v }, l)));
    sizeSel.value = size;
    sizeSel.addEventListener('change', () => { size = +sizeSel.value; draw(); });
    const modeSel = el('select', {}, [['primes', 'Primes'], ['twin', 'Twin primes'], ['euler', 'Euler’s n² + n + 41'], ['divisors', 'Number of divisors']].map(([v, l]) => el('option', { value: v }, l)));
    modeSel.addEventListener('change', () => { mode = modeSel.value; draw(); });
    let layout = null;
    function draw() {
      const N = size * size, pr = Sims.sieve(N + 2);
      const { ctx, w, h } = Charts.setup(cv);
      ctx.fillStyle = Theme.bg; ctx.fillRect(0, 0, w, h);
      const c = Math.min(w, h) / size, ox = (w - c * size) / 2 + (size >> 1) * c, oy = (h - c * size) / 2 + (size >> 1) * c;
      layout = { c, ox, oy };
      const euler = new Set();
      if (mode === 'euler') for (let n = 0; n * n + n + 41 <= N; n++) euler.add(n * n + n + 41);
      let divs = null;
      if (mode === 'divisors') { divs = new Uint16Array(N + 1); for (let i = 1; i <= N; i++) for (let j = i; j <= N; j += i) divs[j]++; }
      let count = 0;
      for (let n = 1; n <= N; n++) {
        const [x, y] = Sims.ulamXY(n);
        let col = null;
        if (mode === 'divisors') { const d = Math.min(divs[n], 48); col = `hsl(${220 - d * 4}, 70%, ${12 + d * 1.6}%)`; }
        else if (pr[n]) {
          if (mode === 'primes') col = Theme.text;
          else if (mode === 'twin') col = pr[n + 2] || (n > 2 && pr[n - 2]) ? '#ffc078' : Theme.frame;
          else col = euler.has(n) ? '#ff6b6b' : Theme.frame;
          count++;
        }
        if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * c, oy - y * c, Math.max(1, c), Math.max(1, c)); }
      }
      info.replaceChildren(el('div', { class: 'pl-stat' }, el('span', {}, 'numbers'), el('b', { class: 'mono' }, `1 … ${N}`)), mode === 'divisors' ? null : el('div', { class: 'pl-stat' }, el('span', {}, 'primes'), el('b', { class: 'mono' }, String(count))), el('div', { class: 'pl-stat hover-n' }, el('span', {}, 'under the mouse'), el('b', { class: 'mono' }, '—')));
    }
    cv.addEventListener('pointermove', (e) => {
      if (!layout) return;
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left - layout.ox) / layout.c), y = -Math.floor((e.clientY - r.top - layout.oy) / layout.c);
      // inverse of the spiral: search the ring that contains (x, y)
      const k = Math.max(Math.abs(x), Math.abs(y));
      let n = null;
      for (let m = Math.max(1, (2 * k - 1) ** 2); m <= (2 * k + 1) ** 2; m++) { const [px, py] = Sims.ulamXY(m); if (px === x && py === y) { n = m; break; } }
      const box = info.querySelector('.hover-n b');
      if (box && n) box.textContent = `${n}${MX.S.isPrime(n) ? ' (prime)' : ''}`;
    });
    return {
      controls: [sizeSel, modeSel],
      view: el('div', {}, cv, info, el('p', { class: 'hint' }, 'Write 1, 2, 3, … in a square spiral and mark the primes: they cluster on diagonal lines, which correspond to quadratic polynomials such as Euler’s n² + n + 41 (prime for n = 0 … 39). Stanisław Ulam noticed this while doodling in 1963.')),
      step: () => {}, draw, reset: draw, still: true,
    };
  }


  // ---------------------------------------------------------------- physics helpers
  const stat = (label, value) => el('div', { class: 'pl-stat' }, el('span', {}, label), el('b', { class: 'mono' }, value));
  const f4 = (v) => (isFinite(v) ? MX.fmt(+(+v).toPrecision(4)) : '∞');
  const deg = (r) => (r * 180) / Math.PI;
  const pause = () => { if (running) setRunning(false); };
  const slider = (label, min, max, get, set, opts = {}) => C.slider({ label, min, max, get, set, ...opts });
  const canvasXY = (cv, e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // ---------------------------------------------------------------- pendulums
  function pendulumTab() {
    const P = st.pend;
    let y, y2, t, trail, trail2, hist, sliders = [];
    const cv = el('canvas', { class: 'sim-canvas' }), chart = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' });
    const params = () => ({ g: P.g, L: P.L, c: P.damp, L1: P.L / 2, L2: P.L / 2, m1: 1, m2: 1 });
    function reset() {
      const a = (P.angle * Math.PI) / 180;
      t = 0; trail = []; trail2 = []; hist = [];
      y = P.mode === 'single' ? [a, 0] : [a, a, 0, 0];
      y2 = P.mode === 'chaos' ? [a + 1e-3, a, 0, 0] : null;
      P.E0 = P.mode === 'single' ? null : Sims.doubleEnergy(params(), y);
      draw();
    }
    function step(dt = 1 / 60) {
      const sub = 20, h = (dt * P.time) / sub, prm = params();
      const f = P.mode === 'single' ? Sims.pendulum(prm) : Sims.doublePendulum(prm);
      for (let i = 0; i < sub; i++) { y = Sims.rk4(f, y, h); if (y2) y2 = Sims.rk4(f, y2, h); }
      t += dt * P.time;
      hist.push([t, y[0], P.mode === 'single' ? null : y[1], y2 ? y2[0] : null]);
      if (hist.length > 1500) hist.shift();
    }
    // bob positions in metres, origin at the pivot, y up
    const bobs = (s) => {
      if (P.mode === 'single') return [[P.L * Math.sin(s[0]), -P.L * Math.cos(s[0])]];
      const x1 = (P.L / 2) * Math.sin(s[0]), y1 = -(P.L / 2) * Math.cos(s[0]);
      return [[x1, y1], [x1 + (P.L / 2) * Math.sin(s[1]), y1 - (P.L / 2) * Math.cos(s[1])]];
    };
    let view = null;
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      const scale = (Math.min(w, h) * 0.42) / P.L, ox = w / 2, oy = h * 0.47;
      view = { scale, ox, oy };
      const S = ([x, yy]) => [ox + x * scale, oy - yy * scale];
      const drawOne = (s, tr, color) => {
        const b = bobs(s);
        const last = b[b.length - 1];
        tr.push(last); if (tr.length > 600) tr.shift();
        if (P.mode !== 'single') {
          ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.beginPath();
          tr.forEach((p, i) => { const [px, py] = S(p); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = Theme.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy);
        b.forEach((p) => ctx.lineTo(...S(p))); ctx.stroke();
        b.forEach((p, i) => { ctx.fillStyle = i === b.length - 1 ? color : Theme.muted; ctx.beginPath(); ctx.arc(...S(p), P.mode === 'single' ? 13 : 9, 0, Math.PI * 2); ctx.fill(); });
      };
      ctx.fillStyle = Theme.muted; ctx.fillRect(ox - 40, oy - 3, 80, 3);
      if (y2) drawOne(y2, trail2, '#ff922b');
      drawOne(y, trail, '#4dabf7');
      // angle chart
      const span = Math.max(10, t), lim = Math.max(0.5, ...hist.map((p) => Math.max(Math.abs(p[1]), p[2] == null ? 0 : Math.abs(p[2]), p[3] == null ? 0 : Math.abs(p[3]))));
      const fr = Charts.frame(chart, { xmin: Math.max(0, span - 20), xmax: Math.max(20, span), ymin: -deg(lim) * 1.1, ymax: deg(lim) * 1.1, xlabel: I18n.t('time (s)'), ylabel: I18n.t('angle (°)') });
      const line = (k, color) => { fr.ctx.strokeStyle = color; fr.ctx.lineWidth = 1.6; fr.ctx.beginPath(); let started = false; for (const p of hist) { if (p[k] == null) continue; const X = fr.X(p[0]), Y = fr.Y(deg(p[k])); started ? fr.ctx.lineTo(X, Y) : fr.ctx.moveTo(X, Y); started = true; } fr.ctx.stroke(); };
      if (P.mode === 'single') {
        // small-angle approximation for comparison
        const a0 = (P.angle * Math.PI) / 180, om = Math.sqrt(P.g / P.L);
        fr.ctx.strokeStyle = 'rgba(255,146,43,0.8)'; fr.ctx.setLineDash([5, 4]); fr.ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const tt = Math.max(0, span - 20) + (i / 300) * 20; const v = deg(a0 * Math.cos(om * tt) * Math.exp((-P.damp * tt) / 2)); i ? fr.ctx.lineTo(fr.X(tt), fr.Y(v)) : fr.ctx.moveTo(fr.X(tt), fr.Y(v)); }
        fr.ctx.stroke(); fr.ctx.setLineDash([]);
      }
      line(1, '#4dabf7');
      if (P.mode === 'double') line(2, '#51cf66');
      if (P.mode === 'chaos') line(3, '#ff922b');
      const out = [stat(I18n.t('time'), f4(t) + ' s')];
      if (P.mode === 'single') {
        const T0 = 2 * Math.PI * Math.sqrt(P.L / P.g), Te = Sims.pendulumPeriod(P.g, P.L, (P.angle * Math.PI) / 180);
        out.push(stat(I18n.t('period, small angles 2π√(L/g)'), f4(T0) + ' s'), stat(I18n.t('exact period at this amplitude'), f4(Te) + ' s'), stat(I18n.t('angle now'), f4(deg(y[0])) + '°'));
      } else {
        const E = Sims.doubleEnergy(params(), y);
        out.push(stat(I18n.t('energy drift (numerical error)'), P.E0 ? f4((100 * (E - P.E0)) / Math.abs(P.E0 || 1)) + ' %' : '—'));
        if (y2) out.push(stat(I18n.t('difference between the two'), f4(deg(Math.abs(y[0] - y2[0]))) + '°'));
      }
      statsEl.replaceChildren(...out);
    }
    // drag the (last) bob to set the starting angle
    let dragging = false;
    cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); pause(); move(e); });
    const move = (e) => {
      if (!dragging || !view) return;
      const [x, yy] = canvasXY(cv, e);
      P.angle = Math.round(deg(Math.atan2(x - view.ox, -(yy - view.oy))) * 1) ; sliders.forEach((s) => s.sync()); reset();
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', () => { dragging = false; });
    const mode = el('select', {}, [['single', 'Simple pendulum'], ['double', 'Double pendulum'], ['chaos', 'Chaos: two double pendulums']].map(([v, l]) => el('option', { value: v }, l)));
    mode.value = P.mode;
    mode.addEventListener('change', () => { P.mode = mode.value; reset(); });
    sliders = [slider('Start angle (°)', -179, 179, () => P.angle, (v) => { P.angle = v; reset(); }, { step: 1 }), slider('Length (m)', 0.2, 5, () => P.L, (v) => { P.L = v; reset(); }),
      slider('Gravity g (m/s²)', 0.5, 30, () => P.g, (v) => { P.g = v; }), slider('Damping', 0, 1, () => P.damp, (v) => { P.damp = v; }), slider('Time speed', 0.1, 3, () => P.time, (v) => { P.time = v; })];
    reset();
    return {
      controls: [mode],
      view: el('div', { class: 'sim-split' }, cv, el('div', {}, el('div', { class: 'grid2' }, sliders.map((s) => s.el)), chart, statsEl,
        el('p', { class: 'hint' }, 'Drag the bob to set the start angle. A simple pendulum swings with period ≈ 2π√(L/g) only for small angles (orange dashed); at large angles it is slower. A double pendulum is chaotic: two copies started 0.06° apart soon do completely different things.'))),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- projectile motion
  function projectileTab() {
    const P = st.proj;
    let shots = [], sliders = [];
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    const colors = ['#4dabf7', '#ff922b', '#51cf66', '#cc5de8', '#ff6b6b', '#fcc419'];
    const theory = () => { const a = (P.angle * Math.PI) / 180, v = P.v0; return { R: (v * v * Math.sin(2 * a)) / P.g, H: (v * v * Math.sin(a) ** 2) / (2 * P.g), T: (2 * v * Math.sin(a)) / P.g }; };
    function fire() {
      const a = (P.angle * Math.PI) / 180;
      shots.push({ y: [0, P.h0, P.v0 * Math.cos(a), P.v0 * Math.sin(a)], t: 0, pts: [[0, P.h0]], maxH: P.h0, done: false, color: colors[shots.length % colors.length], angle: P.angle, v0: P.v0, k: P.drag, g: P.g });
      if (shots.length > 6) shots.shift();
      if (!running) setRunning(true);
    }
    function step(dt = 1 / 60) {
      let any = false;
      for (const s of shots) {
        if (s.done) continue;
        any = true;
        const f = Sims.projectile({ g: s.g, k: s.k }), sub = 10, h = (dt * P.time) / sub;
        for (let i = 0; i < sub && !s.done; i++) {
          const ny = Sims.rk4(f, s.y, h);
          if (ny[1] < 0) { // land: interpolate to y = 0
            const fr = s.y[1] / (s.y[1] - ny[1]);
            s.y = s.y.map((v, k) => v + (ny[k] - v) * fr); s.y[1] = 0; s.t += h * fr; s.done = true;
          } else { s.y = ny; s.t += h; }
          s.maxH = Math.max(s.maxH, s.y[1]);
        }
        s.pts.push([s.y[0], s.y[1]]);
      }
      if (!any) pause();
    }
    function draw() {
      const th = theory();
      const xmax = Math.max(10, th.R * 1.15, ...shots.flatMap((s) => s.pts.map((p) => p[0] * 1.08)));
      const ymax = Math.max(5, (th.H + P.h0) * 1.25, ...shots.flatMap((s) => s.pts.map((p) => p[1] * 1.15)));
      const fr = Charts.frame(cv, { xmin: 0, xmax, ymin: 0, ymax, xlabel: I18n.t('distance (m)'), ylabel: I18n.t('height (m)'), equal: true });
      const { ctx, X, Y } = fr;
      // aim line
      const a = (P.angle * Math.PI) / 180;
      ctx.strokeStyle = Theme.muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(0), Y(P.h0)); ctx.lineTo(X(0) + 60 * Math.cos(a), Y(P.h0) - 60 * Math.sin(a)); ctx.stroke(); ctx.setLineDash([]);
      for (const s of shots) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
        s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
        const [x, y, vx, vy] = s.y;
        ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(x), Y(y), 5, 0, Math.PI * 2); ctx.fill();
        if (!s.done) { ctx.strokeStyle = s.color; ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x) + vx * 2, Y(y) - vy * 2); ctx.stroke(); }
      }
      const s = shots[shots.length - 1];
      statsEl.replaceChildren(
        stat(I18n.t('no air: range'), f4(th.R) + ' m'), stat(I18n.t('no air: max height'), f4(th.H + P.h0) + ' m'), stat(I18n.t('no air: flight time'), P.h0 ? '—' : f4(th.T) + ' s'),
        ...(s ? [stat(I18n.t('last shot: distance'), f4(s.y[0]) + ' m'), stat(I18n.t('max height'), f4(s.maxH) + ' m'), stat(I18n.t('time'), f4(s.t) + ' s' + (s.done ? '' : ' …'))] : []));
    }
    sliders = [slider('Launch speed (m/s)', 1, 100, () => P.v0, (v) => { P.v0 = v; draw(); }), slider('Angle (°)', 0, 90, () => P.angle, (v) => { P.angle = v; draw(); }, { step: 1 }),
      slider('Launch height (m)', 0, 100, () => P.h0, (v) => { P.h0 = v; draw(); }), slider('Gravity g (m/s²)', 0.5, 30, () => P.g, (v) => { P.g = v; draw(); }),
      slider('Air resistance', 0, 0.1, () => P.drag, (v) => { P.drag = v; }), slider('Time speed', 0.1, 5, () => P.time, (v) => { P.time = v; })];
    return {
      controls: [U.el('button', { type: 'button', class: 'primary small', onclick: fire }, '🚀 Launch'), U.el('button', { type: 'button', class: 'small', onclick: () => { shots = []; draw(); } }, 'Clear shots')],
      view: el('div', {}, cv, el('div', { class: 'grid3' }, sliders.map((x) => x.el)), statsEl,
        el('p', { class: 'hint' }, 'Without air the path is a parabola and 45° goes furthest (complementary angles such as 30° and 60° land at the same spot). With air resistance the path is steeper on the way down and the best angle is lower. Up to six shots are kept for comparison.')),
      step, draw, reset: () => { shots = []; draw(); }, stepsPerFrame: true, onShow: () => sliders.forEach((x) => x.sync()),
    };
  }

  // ---------------------------------------------------------------- orbits (Kepler problem, GM = 1)
  function orbitTab() {
    const P = st.orbit;
    let pos, vel, t, trail, el0, launch = null, sliders = [];
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    function reset() {
      pos = [1, 0]; vel = [0, P.v]; t = 0; trail = [[1, 0, 0]];
      el0 = Sims.orbitElements(1, pos, vel);
      draw();
    }
    const acc = ([x, y]) => { const r3 = Math.hypot(x, y) ** 3; return [-x / r3, -y / r3]; };
    function step(dt = 1 / 60) {
      const sub = 200, h = (dt * P.time * 2) / sub;
      for (let i = 0; i < sub; i++) { // velocity Verlet
        const a = acc(pos);
        vel = [vel[0] + (a[0] * h) / 2, vel[1] + (a[1] * h) / 2];
        pos = [pos[0] + vel[0] * h, pos[1] + vel[1] * h];
        const b = acc(pos);
        vel = [vel[0] + (b[0] * h) / 2, vel[1] + (b[1] * h) / 2];
        t += h;
        if (Math.hypot(...pos) < 0.04) { pause(); break; } // crashed into the star
      }
      trail.push([pos[0], pos[1], t]);
      if (trail.length > 4000) trail.shift();
    }
    let view;
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      const reach = el0.E < 0 ? el0.a * (1 + el0.e) : 4;
      const scale = (Math.min(w, h) * 0.45) / Math.max(1.2, Math.min(reach, 8)), ox = w / 2, oy = h / 2;
      view = { scale, ox, oy };
      const S = ([x, y]) => [ox + x * scale, oy - y * scale];
      // Kepler's second law: sectors swept in equal times (12 per orbit), alternately shaded
      if (P.areas && el0.T < Infinity) {
        const per = el0.T / 12, n = trail.length, seg0 = (i) => Math.floor(trail[i][2] / per);
        let k = 0;
        while (k < n - 1) {
          const seg = seg0(k);
          let j = k;
          while (j < n - 1 && seg0(j) === seg) j++;
          if (seg % 2 === 0 && seg >= Math.floor(t / per) - 12) {
            ctx.fillStyle = 'rgba(77,171,247,0.18)'; ctx.beginPath(); ctx.moveTo(ox, oy);
            for (let i = k; i <= j; i++) ctx.lineTo(...S(trail[i]));
            ctx.closePath(); ctx.fill();
          }
          k = j;
        }
      }
      ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 1.5; ctx.beginPath();
      trail.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p))));
      ctx.stroke();
      const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, 18); g.addColorStop(0, '#fff3bf'); g.addColorStop(1, 'rgba(255,212,59,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#74c0fc'; ctx.beginPath(); ctx.arc(...S(pos), 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff922b'; ctx.beginPath(); ctx.moveTo(...S(pos)); ctx.lineTo(...S([pos[0] + vel[0] * 0.3, pos[1] + vel[1] * 0.3])); ctx.stroke();
      if (launch) { ctx.strokeStyle = '#51cf66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...S(launch.p)); ctx.lineTo(...S(launch.q)); ctx.stroke(); ctx.fillStyle = '#51cf66'; ctx.beginPath(); ctx.arc(...S(launch.p), 6, 0, Math.PI * 2); ctx.fill(); }
      const r = Math.hypot(...pos);
      statsEl.replaceChildren(stat(I18n.t('orbit'), el0.E < 0 ? (el0.e < 0.01 ? I18n.t('circle') : I18n.t('ellipse')) : el0.e > 1.0001 ? I18n.t('hyperbola (escapes)') : I18n.t('parabola (escapes)')),
        stat(I18n.t('eccentricity e'), f4(el0.e)), stat(I18n.t('semi-major axis a'), f4(el0.a)), stat(I18n.t('period T'), f4(el0.T)),
        stat('T² / a³', el0.T < Infinity ? f4(el0.T ** 2 / el0.a ** 3) : '—'), stat(I18n.t('distance r'), f4(r)), stat(I18n.t('speed'), f4(Math.hypot(...vel))));
    }
    // drag from a point to launch a planet there with that velocity
    const toWorld = (e) => { const [x, y] = canvasXY(cv, e); return [(x - view.ox) / view.scale, -(y - view.oy) / view.scale]; };
    cv.addEventListener('pointerdown', (e) => { if (!view) return; cv.setPointerCapture(e.pointerId); const p = toWorld(e); launch = { p, q: p }; pause(); draw(); });
    cv.addEventListener('pointermove', (e) => { if (launch) { launch.q = toWorld(e); draw(); } });
    cv.addEventListener('pointerup', () => {
      if (!launch) return;
      const { p, q } = launch;
      launch = null;
      if (Math.hypot(...p) < 0.08) return draw();
      pos = p; vel = [(q[0] - p[0]) * 1.5, (q[1] - p[1]) * 1.5];
      if (Math.hypot(...vel) < 1e-3) { const r = Math.hypot(...p); vel = [-p[1] / r ** 1.5, p[0] / r ** 1.5]; } // a click alone: circular orbit
      t = 0; trail = [[pos[0], pos[1], 0]]; el0 = Sims.orbitElements(1, pos, vel);
      setRunning(true);
    });
    sliders = [slider('Start speed (1 = circle)', 0.3, 1.6, () => P.v, (v) => { P.v = v; reset(); }), slider('Time speed', 0.1, 5, () => P.time, (v) => { P.time = v; })];
    const areas = el('input', { type: 'checkbox' }); areas.checked = P.areas;
    areas.addEventListener('change', () => { P.areas = areas.checked; draw(); });
    reset();
    return {
      controls: [el('label', { class: 'check' }, areas, el('span', {}, 'Equal areas'))],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, sliders.map((x) => x.el)), statsEl,
        el('p', { class: 'hint' }, 'A planet under the inverse-square law of gravity. Below escape speed (√2 ≈ 1.414 × circular) the orbit is an ellipse with the star at one focus; the shaded sectors are swept in equal times (Kepler’s second law) and T²/a³ is the same for every orbit (third law). Drag on the picture to launch the planet from any point.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((x) => x.sync()),
    };
  }

  // ---------------------------------------------------------------- Fourier epicycles
  const SHAPES = {
    heart: () => Array.from({ length: 300 }, (_, i) => { const t = (2 * Math.PI * i) / 300; return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]; }),
    star: () => Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.42 : 1, a = Math.PI / 2 + (Math.PI * i) / 5; return [r * Math.cos(a), r * Math.sin(a)]; }),
    square: () => [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    infinity: () => Array.from({ length: 300 }, (_, i) => { const t = (2 * Math.PI * i) / 300, d = 1 + Math.sin(t) ** 2; return [Math.cos(t) / d, (Math.sin(t) * Math.cos(t)) / d]; }),
    pi: () => [[-1, 0.8], [1.1, 0.8], [1.1, 0.6], [0.55, 0.6], [0.55, -0.55], [0.75, -0.75], [0.6, -0.9], [0.3, -0.65], [0.3, 0.6], [-0.3, 0.6], [-0.4, -0.3], [-0.65, -0.9], [-0.85, -0.75], [-0.6, -0.3], [-0.55, 0.6], [-1, 0.6]],
  };
  function epicycleTab() {
    const E = st.epi;
    let pts = [], terms = [], t = 0, drawn = [], drawing = null, sliders = [];
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    const N = 256;
    function setShape(raw) {
      // centre and scale to fit [−1, 1]
      const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 || 1;
      pts = Sims.resample(raw.map(([x, y]) => [(x - cx) / s, (y - cy) / s]), N);
      terms = Sims.dft(pts);
      t = 0; drawn = [];
      sliders.forEach((x) => x.sync());
      draw();
    }
    const count = () => Math.max(1, Math.min(terms.length, Math.round(E.n)));
    function step(dt = 1 / 60) {
      t += dt / E.secs;
      if (t >= 1) { t -= 1; drawn = []; }
      drawn.push(Sims.epicycleAt(terms, t, count()));
    }
    let view;
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      const scale = Math.min(w, h) * 0.4, ox = w / 2, oy = h / 2;
      view = { scale, ox, oy };
      const S = ([x, y]) => [ox + x * scale, oy - y * scale];
      if (drawing) {
        ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 2; ctx.beginPath();
        drawing.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        return;
      }
      if (!terms.length) return;
      if (E.original) { ctx.strokeStyle = Theme.frame; ctx.lineWidth = 1; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p)))); ctx.closePath(); ctx.stroke(); }
      // circles and arms
      const m = count();
      let x = 0, y = 0;
      for (let i = 0; i < m; i++) {
        const { f, amp, phase } = terms[i], a = 2 * Math.PI * f * t + phase;
        const nx = x + amp * Math.cos(a), ny = y + amp * Math.sin(a);
        if (E.circles && amp * scale > 0.6) {
          ctx.strokeStyle = Theme.light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(...S([x, y]), amp * scale, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = Theme.light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.moveTo(...S([x, y])); ctx.lineTo(...S([nx, ny])); ctx.stroke();
        }
        x = nx; y = ny;
      }
      ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2.2; ctx.beginPath();
      drawn.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p)))); ctx.stroke();
      ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.arc(...S([x, y]), 4, 0, Math.PI * 2); ctx.fill();
      // error of the approximation with m terms (mean distance to the original points)
      let err = 0;
      for (let k = 0; k < N; k += 4) { const q = Sims.epicycleAt(terms, k / N, m); err += Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]); }
      statsEl.replaceChildren(stat(I18n.t('circles used'), `${m} / ${terms.length}`), stat(I18n.t('largest circle radius'), f4(terms[0].amp)), stat(I18n.t('average error'), f4(err / (N / 4))));
    }
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drawing = [canvasXY(cv, e)]; pause(); draw(); });
    cv.addEventListener('pointermove', (e) => { if (drawing) { const p = canvasXY(cv, e), q = drawing[drawing.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2) { drawing.push(p); draw(); } } });
    cv.addEventListener('pointerup', () => {
      if (!drawing) return;
      const d = drawing; drawing = null;
      if (d.length < 8) return draw();
      setShape(d.map(([x, y]) => [x, -y]));
      shapeSel.value = '';
      setRunning(true);
    });
    const shapeSel = el('select', {}, [['', 'Draw your own…'], ['heart', 'Heart'], ['star', 'Star'], ['square', 'Square'], ['infinity', 'Infinity'], ['pi', 'π']].map(([v, l]) => el('option', { value: v }, l)));
    shapeSel.value = 'heart';
    shapeSel.addEventListener('change', () => { if (shapeSel.value) { setShape(SHAPES[shapeSel.value]()); } else { pts = []; terms = []; drawn = []; draw(); U.toast(I18n.t('Draw a closed shape on the canvas')); } });
    const chk = (label, key) => { const b = el('input', { type: 'checkbox' }); b.checked = E[key]; b.addEventListener('change', () => { E[key] = b.checked; draw(); }); return el('label', { class: 'check' }, b, el('span', {}, label)); };
    sliders = [slider('Circles', 1, N, () => E.n, (v) => { E.n = Math.round(v); drawn = []; t = 0; draw(); }, { log: true, step: 1 }), slider('Seconds per round', 1, 30, () => E.secs, (v) => { E.secs = v; })];
    setShape(SHAPES.heart());
    return {
      controls: [shapeSel, chk('Circles', 'circles'), chk('Original', 'original')],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, sliders.map((x) => x.el)), statsEl,
        el('p', { class: 'hint' }, 'Draw any closed shape with the mouse (or pick one). The discrete Fourier transform turns it into rotating circles — each turning at a whole-number speed — whose sum retraces the drawing. Few circles give a smooth outline; more circles add the corners and details.')),
      step, draw, reset: () => { t = 0; drawn = []; draw(); }, stepsPerFrame: true, onShow: () => sliders.forEach((x) => x.sync()),
    };
  }

  // ---------------------------------------------------------------- sorting algorithms
  const SORT_INFO = {
    bubble: ['Bubble sort', 'O(n²)', 'Swaps neighbours that are in the wrong order; the largest values bubble to the end.'],
    insertion: ['Insertion sort', 'O(n²)', 'Takes each value and slides it left into place — very fast on nearly sorted data.'],
    selection: ['Selection sort', 'O(n²)', 'Finds the smallest remaining value and puts it next; always n²/2 comparisons.'],
    shell: ['Shell sort', '≈ O(n^1.3)', 'Insertion sort over shrinking gaps, so values travel far early on.'],
    merge: ['Merge sort', 'O(n log n)', 'Sorts both halves, then merges them — always n log n, but needs extra memory.'],
    quick: ['Quicksort', 'O(n log n) on average', 'Splits around a pivot (median of three): smaller left, larger right, then recurses.'],
    heap: ['Heap sort', 'O(n log n)', 'Builds a max-heap, then repeatedly moves the largest value to the end.'],
  };
  function sortTab() {
    const S = st.sort;
    let a, gen, cmp, writes, hl, doneSet, finished;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' }), info = el('p', { class: 'hint' });
    function reset() {
      const n = S.n;
      a = Array.from({ length: n }, (_, i) => i + 1);
      if (S.input === 'random' || S.input === 'few') for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (S.input === 'few') a = a.map((v) => Math.ceil((v / n) * 5) * Math.ceil(n / 5));
      if (S.input === 'reversed') a.reverse();
      if (S.input === 'nearly') for (let k = 0; k < Math.max(1, n / 20); k++) { const i = Math.floor(Math.random() * (n - 1)); [a[i], a[i + 1]] = [a[i + 1], a[i]]; }
      gen = Sims.SORTS[S.algo](a); cmp = 0; writes = 0; hl = null; doneSet = new Set(); finished = false;
      const [name, big, text] = SORT_INFO[S.algo];
      info.textContent = `${name} — ${big}. ${text}`;
      draw();
    }
    function step() {
      if (finished) return;
      for (let k = 0; k < S.speed; k++) {
        const r = gen.next();
        if (r.done) { finished = true; hl = null; for (let i = 0; i < a.length; i++) doneSet.add(i); pause(); break; }
        const ev = r.value;
        hl = ev;
        if (ev.cmp) cmp++;
        if (ev.swap) writes += 2;
        if (ev.set != null) writes++;
        if (ev.done != null) doneSet.add(ev.done);
      }
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      const n = a.length, bw = w / n, max = Math.max(...a);
      const mark = new Map();
      if (hl && hl.cmp) hl.cmp.forEach((i) => mark.set(i, '#fcc419'));
      if (hl && hl.swap) hl.swap.forEach((i) => mark.set(i, '#ff6b6b'));
      if (hl && hl.set != null) mark.set(hl.set, '#ff6b6b');
      for (let i = 0; i < n; i++) {
        const bh = (a[i] / max) * (h - 10);
        ctx.fillStyle = mark.get(i) || (doneSet.has(i) ? '#51cf66' : `hsl(${220 + (a[i] / max) * 60}, 70%, ${Theme.light ? 55 : 62}%)`);
        ctx.fillRect(i * bw + (bw > 4 ? 1 : 0), h - bh, Math.max(1, bw - (bw > 4 ? 2 : 0)), bh);
      }
      statsEl.replaceChildren(stat(I18n.t('values'), String(n)), stat(I18n.t('comparisons'), String(cmp)), stat(I18n.t('writes'), String(writes)),
        stat('n²/2', String(Math.round((n * n) / 2))), stat('n·log₂n', String(Math.round(n * Math.log2(n)))), stat(I18n.t('status'), I18n.t(finished ? 'sorted ✓' : cmp ? 'sorting…' : 'ready')));
    }
    const algo = el('select', {}, Object.entries(SORT_INFO).map(([k, [name]]) => el('option', { value: k }, name)));
    algo.value = S.algo; algo.addEventListener('change', () => { S.algo = algo.value; reset(); });
    const input = el('select', {}, [['random', 'Random order'], ['nearly', 'Nearly sorted'], ['reversed', 'Reversed'], ['few', 'Few distinct values']].map(([v, l]) => el('option', { value: v }, l)));
    input.value = S.input; input.addEventListener('change', () => { S.input = input.value; reset(); });
    const sliders = [slider('Number of values', 8, 400, () => S.n, (v) => { S.n = Math.round(v); reset(); }, { step: 1 }), slider('Operations per frame', 1, 200, () => S.speed, (v) => { S.speed = Math.round(v); }, { log: true, step: 1 })];
    reset();
    return {
      controls: [algo, input, U.el('button', { type: 'button', class: 'small', onclick: () => { reset(); setRunning(true); } }, 'Shuffle & run')],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, sliders.map((x) => x.el)), statsEl, info,
        el('p', { class: 'hint' }, 'Yellow: comparing. Red: writing. Green: in its final place. Try the same input with different algorithms and compare the counters.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((x) => x.sync()),
    };
  }

  // ---------------------------------------------------------------- shortest paths on a grid
  const PATH_INFO = {
    bfs: ['Breadth-first search', 'Explores in rings of equal step count. Finds the fewest steps, but ignores mud.'],
    dijkstra: ['Dijkstra', 'Explores in order of total cost so far. Always finds the cheapest path.'],
    astar: ['A*', 'Dijkstra plus a distance estimate to the goal: still optimal, but explores far fewer cells.'],
    greedy: ['Greedy best-first', 'Always heads for the cell that looks closest to the goal. Fast, but the path may not be the shortest.'],
  };
  function pathTab() {
    const PS = st.path;
    const W = 45, H = 27;
    let grid, start, goal, gen, state, finished, brush = 'wall', dragging = null;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' }), info = el('p', { class: 'hint' });
    function clearSearch() { gen = null; state = null; finished = false; info.textContent = PATH_INFO[PS.algo].join(' — '); draw(); }
    function newGrid(kind) {
      grid = kind === 'maze' ? Sims.maze(W, H) : new Uint8Array(W * H);
      if (kind === 'random') for (let i = 0; i < W * H; i++) { const r = Math.random(); grid[i] = r < 0.25 ? 1 : r < 0.35 ? 2 : 0; }
      if (kind === 'mud') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - W / 2, y - H / 2) < 8) grid[y * W + x] = 2;
      start = W * Math.floor(H / 2) + 1; goal = W * Math.floor(H / 2) + W - 2;
      if (kind === 'maze') { start = W + 1; goal = W * (H - 2) + W - 2; }
      grid[start] = 0; grid[goal] = 0;
      clearSearch();
    }
    function step() {
      if (finished) return;
      if (!gen) gen = Sims.gridSearch(grid, W, H, start, goal, PS.algo);
      for (let k = 0; k < PS.speed; k++) {
        const r = gen.next();
        if (r.done) { finished = true; pause(); break; }
        state = r.value;
        if (state.path) { finished = true; pause(); break; }
      }
    }
    let lay;
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      const c = Math.floor(Math.min(w / W, h / H)), ox = Math.floor((w - c * W) / 2), oy = Math.floor((h - c * H) / 2);
      lay = { c, ox, oy };
      const maxG = state ? Math.max(1, ...Array.from(state.g).filter((v) => v < Infinity)) : 1;
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = Math.floor(i / W);
        let col = grid[i] === 1 ? (Theme.light ? '#495057' : '#69708a') : grid[i] === 2 ? (Theme.light ? '#c9a77c' : '#5c4630') : (Theme.light ? '#f1f3f5' : '#171a22');
        if (state && grid[i] !== 1) {
          if (state.closed[i]) col = `hsl(${200 + (state.g[i] / maxG) * 80}, 60%, ${Theme.light ? 72 : 32}%)`;
          else if (state.open[i]) col = Theme.light ? '#63e6be' : '#0ca678';
          if (grid[i] === 2 && state.closed[i]) col = `hsl(${30}, 45%, ${Theme.light ? 60 : 30}%)`;
        }
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * c, oy + y * c, c - 1, c - 1);
      }
      const ctr = (i) => [ox + (i % W) * c + c / 2 - 0.5, oy + Math.floor(i / W) * c + c / 2 - 0.5];
      if (state && state.path && state.path.length) {
        ctx.strokeStyle = '#ff922b'; ctx.lineWidth = Math.max(2, c / 3); ctx.lineJoin = 'round'; ctx.beginPath();
        state.path.forEach((i, k) => (k ? ctx.lineTo(...ctr(i)) : ctx.moveTo(...ctr(i)))); ctx.stroke();
      }
      if (state && state.current >= 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(ox + (state.current % W) * c, oy + Math.floor(state.current / W) * c, c - 1, c - 1); }
      for (const [i, color, label] of [[start, '#51cf66', 'S'], [goal, '#ff6b6b', 'G']]) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(...ctr(i), c * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(c * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, ...ctr(i));
      }
      statsEl.replaceChildren(stat(I18n.t('cells explored'), state ? String(state.expanded) : '0'),
        stat(I18n.t('path length (steps)'), state && state.path ? (state.path.length ? String(state.path.length - 1) : I18n.t('no path')) : '—'),
        stat(I18n.t('path cost (mud = 5)'), state && state.path && state.path.length ? String(state.cost) : '—'));
    }
    const cellAt = (e) => { const [x, y] = canvasXY(cv, e); const cx = Math.floor((x - lay.ox) / lay.c), cy = Math.floor((y - lay.oy) / lay.c); return cx >= 0 && cy >= 0 && cx < W && cy < H ? cy * W + cx : -1; };
    const paint = (i) => { if (i < 0 || i === start || i === goal) return; const v = brush === 'wall' ? 1 : brush === 'mud' ? 2 : 0; if (grid[i] !== v) { grid[i] = v; clearSearch(); } };
    cv.addEventListener('pointerdown', (e) => {
      if (!lay) return;
      cv.setPointerCapture(e.pointerId); pause();
      const i = cellAt(e);
      dragging = i === start ? 'start' : i === goal ? 'goal' : 'paint';
      if (dragging === 'paint') {
        if (i >= 0 && brush === 'wall' && grid[i] === 1) brush = 'erase-once'; // clicking a wall erases instead
        paint(i);
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const i = cellAt(e);
      if (i < 0) return;
      if (dragging === 'start' && i !== goal && grid[i] !== 1) { start = i; clearSearch(); }
      else if (dragging === 'goal' && i !== start && grid[i] !== 1) { goal = i; clearSearch(); }
      else if (dragging === 'paint') paint(i);
    });
    cv.addEventListener('pointerup', () => { dragging = null; if (brush === 'erase-once') brush = brushSel.value; });
    const algo = el('select', {}, Object.entries(PATH_INFO).map(([k, [name]]) => el('option', { value: k }, name)));
    algo.value = PS.algo; algo.addEventListener('change', () => { PS.algo = algo.value; clearSearch(); });
    const brushSel = el('select', {}, [['wall', 'Draw walls'], ['mud', 'Draw mud (cost 5)'], ['erase', 'Erase']].map(([v, l]) => el('option', { value: v }, l)));
    brushSel.addEventListener('change', () => { brush = brushSel.value; });
    const grids = el('select', {}, [['', 'New grid…'], ['empty', 'Empty'], ['maze', 'Maze'], ['random', 'Random walls and mud'], ['mud', 'Mud pond']].map(([v, l]) => el('option', { value: v }, l)));
    grids.addEventListener('change', () => { if (grids.value) newGrid(grids.value); grids.value = ''; });
    const speed = slider('Cells per frame', 1, 100, () => PS.speed, (v) => { PS.speed = Math.round(v); }, { log: true, step: 1 });
    newGrid('maze');
    return {
      controls: [algo, brushSel, grids],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, speed.el, el('div')), statsEl, info,
        el('p', { class: 'hint' }, 'Press Run to search from S to G. Draw walls or mud with the mouse and drag S and G to move them. Grey cells are walls, brown cells mud. Blue to purple shades show explored cells (purple = further), green the frontier, orange the path found.')),
      step, draw, reset: clearSearch, stepsPerFrame: true, onRun: () => { if (finished) clearSearch(); }, onShow: () => speed.sync(),
    };
  }

  // ---------------------------------------------------------------- page
  const TABS = { life: ['Game of Life', lifeTab, 'Patterns'], eca: ['1D automata', ecaTab, 'Patterns'], lsys: ['L-systems', lsysTab, 'Patterns'], rd: ['Reaction–diffusion', rdTab, 'Patterns'], ulam: ['Ulam spiral', ulamTab, 'Patterns'],
    pend: ['Pendulums', pendulumTab, 'Physics'], proj: ['Projectile', projectileTab, 'Physics'], orbit: ['Orbits', orbitTab, 'Physics'], epi: ['Fourier epicycles', epicycleTab, 'Physics'],
    sort: ['Sorting', sortTab, 'Algorithms'], path: ['Shortest paths', pathTab, 'Algorithms'] };
  const built = {};
  let playBtn, ctlBox, speedEl;
  function show(k) {
    st.tab = k;
    root.querySelectorAll('.page-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === k));
    if (!built[k]) built[k] = TABS[k][1]();
    active = built[k];
    ctlBox.replaceChildren(...active.controls);
    body.replaceChildren(active.view);
    playBtn.hidden = !!active.still;
    speedEl.hidden = !!active.still || !!active.stepsPerFrame;
    if (running && active.still) setRunning(false);
    if (active.onShow) active.onShow();
    requestAnimationFrame(() => active.draw());
  }
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
    last = ts;
    if (Shell.isActive('simulations') && active && !active.still) {
      if (active.stepsPerFrame) active.step(dt);
      else {
        active.acc = (active.acc || 0) + st.speed * dt;
        let k = Math.floor(active.acc);
        active.acc -= k;
        k = Math.min(k, 50);
        while (k-- > 0) active.step();
      }
      active.draw();
    }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    running = on;
    playBtn.textContent = on ? '⏸ Pause' : '▶ Run';
    playBtn.classList.toggle('primary', !on);
    if (on) { if (active && active.onRun) active.onRun(); last = 0; requestAnimationFrame(loop); }
  }
  function init(r) {
    root = r;
    body = el('div');
    ctlBox = el('div', { class: 'btn-row pl-ctl' });
    playBtn = U.el('button', { type: 'button', class: 'primary', onclick: () => setRunning(!running) }, '▶ Run');
    speedEl = el('div', { class: 'pl-speed' }, C.slider({ label: 'Steps per second', min: 1, max: 120, log: true, get: () => st.speed, set: (v) => { st.speed = v; } }).el);
    const groups = [...new Set(Object.values(TABS).map((t) => t[2]))];
    const tabs = el('div', { class: 'sim-groups' }, groups.map((g) => el('div', { class: 'sim-group' }, el('span', { class: 'sim-group-label' }, g),
      el('div', { class: 'seg page-tabs' }, Object.entries(TABS).filter(([, t]) => t[2] === g).map(([k, [label]]) => el('button', { type: 'button', 'data-v': k, onclick: () => show(k) }, label))))));
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Simulations'), el('p', {}, 'Simple rules, complex results: cellular automata and patterns, physics in motion, and algorithms at work.')),
      tabs,
      el('div', { class: 'pane' },
        el('div', { class: 'pl-top' }, playBtn,
          U.el('button', { type: 'button', onclick: () => { if (active && !active.still) { active.step(); active.draw(); } } }, 'Step'),
          U.el('button', { type: 'button', onclick: () => active && active.reset() }, 'Reset'), ctlBox, speedEl),
        body)));
    show(TABS[st.tab] ? st.tab : 'life');
    new ResizeObserver(() => active && active.draw()).observe(body);
    Theme.onChange(() => active && active.draw());
  }

  Shell.register('simulations', {
    label: 'Simulations', order: 11, root: () => document.getElementById('mod-simulations'), init,
    onHide: () => { if (running) setRunning(false); },
    desc: 'Cellular automata, L-systems and Turing patterns; pendulums, projectiles and orbits; Fourier epicycles; sorting and path-finding algorithms.',
    features: ['Game of Life', 'Double pendulum', 'Fourier epicycles', 'Sorting & paths'],
    commands: Object.entries(TABS).map(([k, [label, , g]]) => ({ label: `Simulation: ${label}`, keywords: `${g} ${k}`, run: () => { if (root) show(k); else st.tab = k; } })),
  });
  window.Sims = Sims;
})();

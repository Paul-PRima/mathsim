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

  // ---- Abelian sandpile: add n grains to cell i, then topple every cell with 4 or more (one grain to each
  // neighbour; grains falling off the edge are lost). Returns the number of topplings (the avalanche size).
  function sandpileAdd(g, w, h, i, n = 1) {
    g[i] += n;
    if (g[i] < 4) return 0;
    const stack = [i];
    let topples = 0;
    while (stack.length) {
      const j = stack.pop();
      if (g[j] < 4) continue;
      const k = g[j] >> 2;
      g[j] -= 4 * k; topples += k;
      const x = j % w, y = (j - x) / w;
      if (x > 0) { g[j - 1] += k; if (g[j - 1] >= 4) stack.push(j - 1); }
      if (x < w - 1) { g[j + 1] += k; if (g[j + 1] >= 4) stack.push(j + 1); }
      if (y > 0) { g[j - w] += k; if (g[j - w] >= 4) stack.push(j - w); }
      if (y < h - 1) { g[j + w] += k; if (g[j + w] >= 4) stack.push(j + w); }
    }
    return topples;
  }

  // ---- gravity: n bodies { x, y, vx, vy, m }, G = 1, softening eps; leapfrog (kick–drift–kick)
  function nbodyAcc(B, eps) {
    const n = B.length, a = new Float64Array(2 * n), e2 = eps * eps;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = B[j].x - B[i].x, dy = B[j].y - B[i].y, d2 = dx * dx + dy * dy + e2, inv = 1 / (d2 * Math.sqrt(d2));
      a[2 * i] += B[j].m * dx * inv; a[2 * i + 1] += B[j].m * dy * inv;
      a[2 * j] -= B[i].m * dx * inv; a[2 * j + 1] -= B[i].m * dy * inv;
    }
    return a;
  }
  function nbodyStep(B, h, eps = 0) {
    let a = nbodyAcc(B, eps);
    B.forEach((b, i) => { b.vx += (a[2 * i] * h) / 2; b.vy += (a[2 * i + 1] * h) / 2; b.x += b.vx * h; b.y += b.vy * h; });
    a = nbodyAcc(B, eps);
    B.forEach((b, i) => { b.vx += (a[2 * i] * h) / 2; b.vy += (a[2 * i + 1] * h) / 2; });
  }
  function nbodyEnergy(B, eps = 0) {
    let E = 0;
    B.forEach((b, i) => {
      E += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
      for (let j = i + 1; j < B.length; j++) E -= (b.m * B[j].m) / Math.sqrt((B[j].x - b.x) ** 2 + (B[j].y - b.y) ** 2 + eps * eps);
    });
    return E;
  }

  // ---- population models
  // Lotka–Volterra predator and prey [x = prey, y = predators]; K = carrying capacity for the prey (Infinity = none)
  const lotka = ({ a, b, c, d, K = Infinity }) => ([x, y]) => [a * x * (1 - x / K) - b * x * y, d * x * y - c * y];
  // logistic map x → r·x·(1 − x): settle, then look for a repeating cycle (0 = none found, i.e. chaos)
  function logisticSettle(r, x = 0.5, n = 3000) { for (let i = 0; i < n; i++) x = r * x * (1 - x); return x; }
  function logisticPeriod(r, maxP = 64) {
    const x0 = logisticSettle(r);
    let x = x0;
    for (let p = 1; p <= maxP; p++) { x = r * x * (1 - x); if (Math.abs(x - x0) < 1e-6) return p; }
    return 0;
  }
  function lyapunov(r, n = 4000) {
    let x = logisticSettle(r, 0.5, 600), s = 0;
    for (let i = 0; i < n; i++) { s += Math.log(Math.abs(r * (1 - 2 * x)) || 1e-12); x = r * x * (1 - x); }
    return s / n;
  }

  // ---- travelling salesman: points [x, y], tour = list of indices
  const dist2D = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const tourLength = (P, t) => t.reduce((s, a, i) => s + dist2D(P[a], P[t[(i + 1) % t.length]]), 0);
  function nearestTour(P) {
    const n = P.length, used = new Uint8Array(n), t = n ? [0] : [];
    if (n) used[0] = 1;
    for (let k = 1; k < n; k++) {
      const last = P[t[t.length - 1]];
      let best = -1, bd = Infinity;
      for (let j = 0; j < n; j++) if (!used[j]) { const d = dist2D(last, P[j]); if (d < bd) { bd = d; best = j; } }
      used[best] = 1; t.push(best);
    }
    return t;
  }
  // one random 2-opt move (reverse a stretch of the tour). Improvements are always kept; with temperature T > 0 a
  // longer tour is kept with probability e^(−Δ/T) (simulated annealing). Returns the change in length (0 = rejected).
  function twoOptMove(P, t, T = 0, rnd = Math.random) {
    const n = t.length;
    if (n < 4) return 0;
    let i = Math.floor(rnd() * n), j = Math.floor(rnd() * n);
    if (i > j) [i, j] = [j, i];
    if (j - i < 2 || (i === 0 && j === n - 1)) return 0;
    const a = P[t[i]], b = P[t[i + 1]], c = P[t[j]], d = P[t[(j + 1) % n]];
    const delta = dist2D(a, c) + dist2D(b, d) - dist2D(a, b) - dist2D(c, d);
    if (delta < -1e-12 || (T > 0 && rnd() < Math.exp(-delta / T))) {
      for (let lo = i + 1, hi = j; lo < hi; lo++, hi--) [t[lo], t[hi]] = [t[hi], t[lo]];
      return delta;
    }
    return 0;
  }

  // ---- convex hull, as generators that yield every step for the animation
  const cross3 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const HULL = {
    // gift wrapping: from the leftmost point, repeatedly find the point that has every other point on its left
    *jarvis(P) {
      const n = P.length;
      if (n < 3) { yield { hull: P.map((_, i) => i), done: true }; return; }
      let start = 0;
      for (let i = 1; i < n; i++) if (P[i][0] < P[start][0] || (P[i][0] === P[start][0] && P[i][1] < P[start][1])) start = i;
      const hull = [];
      let p = start;
      do {
        hull.push(p);
        let q = (p + 1) % n;
        for (let r = 0; r < n; r++) {
          if (r === p) continue;
          yield { chain: hull.slice(), from: p, cand: q, check: r };
          const c = cross3(P[p], P[q], P[r]);
          if (c < 0 || (c === 0 && dist2D(P[p], P[r]) > dist2D(P[p], P[q]))) q = r;
        }
        p = q;
      } while (p !== start && hull.length <= n);
      yield { hull, done: true };
    },
    // monotone chain: sort by x, build the lower and the upper hull, dropping points that make a right turn
    *monotone(P) {
      const n = P.length;
      if (n < 3) { yield { hull: P.map((_, i) => i), done: true }; return; }
      const idx = P.map((_, i) => i).sort((a, b) => P[a][0] - P[b][0] || P[a][1] - P[b][1]);
      const build = function* (order, base) {
        const ch = [];
        for (const i of order) {
          while (ch.length >= 2 && cross3(P[ch[ch.length - 2]], P[ch[ch.length - 1]], P[i]) <= 0) { yield { chain: base.concat(ch), check: i, from: ch[ch.length - 1] }; ch.pop(); }
          ch.push(i);
          yield { chain: base.concat(ch), check: i };
        }
        return ch;
      };
      const lower = yield* build(idx, []);
      const upper = yield* build(idx.slice().reverse(), lower.slice(0, -1));
      yield { hull: lower.slice(0, -1).concat(upper.slice(0, -1)), done: true };
    },
  };
  return { parseRule, lifeStep, rowStep, expand, sieve, ulamXY, rk4, pendulum, pendulumPeriod, doublePendulum, doubleEnergy, projectile, orbitElements, dft, epicycleAt, resample, SORTS, gridSearch, maze,
    sandpileAdd, nbodyStep, nbodyEnergy, lotka, logisticSettle, logisticPeriod, lyapunov, tourLength, nearestTour, twoOptMove, HULL };
})();

(() => {
  const { el } = U;
  let root, body, active = null, running = false, last = 0;
  const st = { tab: 'life', speed: 12,
    pend: { mode: 'single', angle: 60, L: 1.5, g: 9.81, damp: 0, time: 1 }, proj: { v0: 25, angle: 45, h0: 0, g: 9.81, drag: 0, time: 1 },
    orbit: { v: 0.85, time: 1, areas: true }, epi: { n: 40, secs: 8, circles: true, original: true },
    sort: { algo: 'quick', input: 'random', n: 80, speed: 4 }, path: { algo: 'astar', speed: 6 },
    boids: { n: 150, sep: 1, align: 1, coh: 1, radius: 50, speed: 140, scare: true }, ant: { rule: 'RL', count: 1, speed: 60 }, sand: { rate: 30 }, dla: { seed: 'point', speed: 20 },
    ripple: { mode: 'two', view: 'waves', period: 18, sep: 40, slit: 6 }, gas: { n: 300, temp: 5000, big: false, time: 1 }, grav: { preset: 'eight', time: 1, mass: 5, trails: true },
    sir: { n: 600, radius: 12, rate: 4, recover: 10, home: 0, speed: 3, seed: 3 }, prey: { a: 1.1, b: 0.04, c: 0.4, d: 0.01, K: 400, limited: false, x0: 60, y0: 10, speed: 3 },
    logi: { r: 3.2, x0: 0.2, speed: 4 }, tsp: { n: 60, layout: 'random', mode: '2opt', start: 'random', speed: 200 }, hull: { n: 60, layout: 'disk', algo: 'jarvis', speed: 3 } };
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
      info.replaceChildren(el('div', { class: 'pl-stat' }, el('span', {}, 'numbers'), el('b', { class: 'mono' }, `1 … ${N}`)), mode === 'divisors' ? '' : el('div', { class: 'pl-stat' }, el('span', {}, 'primes'), el('b', { class: 'mono' }, String(count))), el('div', { class: 'pl-stat hover-n' }, el('span', {}, 'under the mouse'), el('b', { class: 'mono' }, '—')));
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


  // ---------------------------------------------------------------- shared: small pixel grids drawn scaled up
  const RGB = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const HSL = (h, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return RGB(Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4)));
  };
  const bgRGB = () => (Theme.light ? RGB(244, 245, 248) : RGB(14, 16, 22));
  function pixGrid(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    return { w, h, c, px: new Uint32Array(img.data.buffer), put: () => g.putImageData(img, 0, 0) };
  }
  function blitGrid(cv, pg, smooth = false) {
    const { ctx, w, h } = Charts.setup(cv);
    const s = Math.min(w / pg.w, h / pg.h), ox = (w - pg.w * s) / 2, oy = (h - pg.h * s) / 2;
    pg.put();
    ctx.imageSmoothingEnabled = smooth;
    ctx.drawImage(pg.c, ox, oy, pg.w * s, pg.h * s);
    return { ctx, s, ox, oy, w, h };
  }
  const gridCell = (cv, lay, e) => { const [x, y] = canvasXY(cv, e); return [Math.floor((x - lay.ox) / lay.s), Math.floor((y - lay.oy) / lay.s)]; };
  const check = (label, get, set) => { const b = el('input', { type: 'checkbox' }); b.checked = get(); b.addEventListener('change', () => set(b.checked)); return el('label', { class: 'check' }, b, el('span', {}, label)); };
  const choose = (options, get, set) => { const s = el('select', {}, options.map(([v, l]) => el('option', { value: v }, l))); s.value = get(); s.addEventListener('change', () => set(s.value)); return s; };

  // ---------------------------------------------------------------- flocking (boids)
  function boidsTab() {
    const B = st.boids;
    let boids = [], W = 800, H = 460, mouse = null;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    function reset() {
      boids = Array.from({ length: B.n }, () => { const a = Math.random() * 2 * Math.PI; return { x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed }; });
      draw();
    }
    const wrapD = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
    function step(dt = 1 / 60) {
      dt = Math.min(dt, 0.05);
      const R = B.radius, R2 = R * R, sepR = R * 0.45, n = boids.length, acc = new Float32Array(2 * n);
      for (let i = 0; i < n; i++) {
        const b = boids[i];
        let cnt = 0, sx = 0, sy = 0, vx = 0, vy = 0, cx = 0, cy = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const o = boids[j], dx = wrapD(o.x - b.x, W), dy = wrapD(o.y - b.y, H), d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          cnt++; vx += o.vx; vy += o.vy; cx += dx; cy += dy;
          const d = Math.sqrt(d2) || 1e-3;
          if (d < sepR) { const k = (1 - d / sepR) / d; sx -= dx * k; sy -= dy * k; }
        }
        let fx = sx * 900 * B.sep, fy = sy * 900 * B.sep;
        if (cnt) {
          fx += (vx / cnt - b.vx) * 3 * B.align + (cx / cnt) * 2.5 * B.coh;
          fy += (vy / cnt - b.vy) * 3 * B.align + (cy / cnt) * 2.5 * B.coh;
        }
        if (mouse && B.scare) {
          const dx = wrapD(b.x - mouse[0], W), dy = wrapD(b.y - mouse[1], H), d = Math.hypot(dx, dy) || 1;
          if (d < 120) { fx += (dx / d) * 2400 * (1 - d / 120); fy += (dy / d) * 2400 * (1 - d / 120); }
        }
        acc[2 * i] = fx; acc[2 * i + 1] = fy;
      }
      boids.forEach((b, i) => {
        b.vx += acc[2 * i] * dt; b.vy += acc[2 * i + 1] * dt;
        const s = Math.hypot(b.vx, b.vy) || 1, want = Math.min(Math.max(s, B.speed * 0.6), B.speed * 1.4);
        b.vx *= want / s; b.vy *= want / s;
        b.x = (b.x + b.vx * dt + W) % W; b.y = (b.y + b.vy * dt + H) % H;
      });
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      if (Math.abs(w - W) > 1 || Math.abs(h - H) > 1) { for (const b of boids) { b.x *= w / W; b.y *= h / H; } W = w; H = h; }
      let sx = 0, sy = 0, ss = 0;
      for (const b of boids) {
        const a = Math.atan2(b.vy, b.vx);
        sx += b.vx; sy += b.vy; ss += Math.hypot(b.vx, b.vy);
        ctx.fillStyle = `hsl(${(a * 180) / Math.PI + 180}, 70%, ${Theme.light ? 42 : 62}%)`;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8);
        ctx.lineTo(b.x + Math.cos(a + 2.5) * 5, b.y + Math.sin(a + 2.5) * 5);
        ctx.lineTo(b.x + Math.cos(a - 2.5) * 5, b.y + Math.sin(a - 2.5) * 5);
        ctx.fill();
      }
      if (mouse && B.scare) { ctx.strokeStyle = 'rgba(255,107,107,0.5)'; ctx.beginPath(); ctx.arc(mouse[0], mouse[1], 120, 0, Math.PI * 2); ctx.stroke(); }
      statsEl.replaceChildren(stat(I18n.t('birds'), String(boids.length)), stat(I18n.t('average speed'), f4(ss / (boids.length || 1)) + ' px/s'),
        stat(I18n.t('alignment (1 = all fly the same way)'), f4(Math.hypot(sx, sy) / (ss || 1))));
    }
    cv.addEventListener('pointermove', (e) => { mouse = canvasXY(cv, e); if (!running) draw(); });
    cv.addEventListener('pointerleave', () => { mouse = null; if (!running) draw(); });
    const sliders = [slider('Birds', 10, 400, () => B.n, (v) => { B.n = Math.round(v); reset(); }, { step: 1 }), slider('Separation', 0, 3, () => B.sep, (v) => { B.sep = v; }),
      slider('Alignment', 0, 3, () => B.align, (v) => { B.align = v; }), slider('Cohesion', 0, 3, () => B.coh, (v) => { B.coh = v; }),
      slider('Sight radius (px)', 15, 150, () => B.radius, (v) => { B.radius = v; }), slider('Speed (px/s)', 40, 320, () => B.speed, (v) => { B.speed = v; })];
    reset();
    return {
      controls: [check('Mouse scares the flock', () => B.scare, (v) => { B.scare = v; })],
      view: el('div', {}, cv, el('div', { class: 'grid3' }, sliders.map((s) => s.el)), statsEl,
        el('p', { class: 'hint' }, 'Each bird follows three local rules — keep a little distance (separation), fly like your neighbours (alignment) and stay close to them (cohesion). Nobody leads, yet flocks form, split and merge. Set a rule to 0 to see what it does. Move the mouse over the picture to play the hawk.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- Langton's ant (and other turmites)
  const ANT_RULES = [['RL', "Langton's ant (RL)"], ['RLR', 'RLR — chaotic growth'], ['LLRR', 'LLRR — symmetric'], ['LRRRRRLLR', 'LRRRRRLLR — square'],
    ['LLRRRLRLRLLR', 'LLRRRLRLRLLR — convoluted'], ['RRLLLRLLLRRR', 'RRLLLRLLLRRR — triangle']];
  function antTab() {
    const A = st.ant, W = 240, H = 150, pg = pixGrid(W, H);
    let grid, ants, steps, lay;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    function reset() {
      grid = new Uint8Array(W * H); steps = 0;
      ants = Array.from({ length: A.count }, (_, i) => ({ x: Math.round(W / 2 + (i - (A.count - 1) / 2) * 14), y: Math.round(H / 2), d: 0 }));
      draw();
    }
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    function step() {
      const rule = A.rule, k = rule.length;
      for (let s = 0; s < A.speed; s++) {
        for (const a of ants) {
          const i = a.y * W + a.x, c = grid[i], t = rule[c];
          a.d = (a.d + (t === 'R' ? 1 : t === 'L' ? 3 : t === 'U' ? 2 : 0)) % 4;
          grid[i] = (c + 1) % k;
          a.x = (a.x + DX[a.d] + W) % W; a.y = (a.y + DY[a.d] + H) % H;
        }
        steps++;
      }
    }
    function draw() {
      const k = A.rule.length, cols = Array.from({ length: k }, (_, i) => (i === 0 ? bgRGB() : HSL(200 + (i - 1) * (300 / Math.max(1, k - 1)), 70, Theme.light ? 45 : 60)));
      for (let i = 0; i < W * H; i++) pg.px[i] = cols[grid[i]];
      for (const a of ants) pg.px[a.y * W + a.x] = RGB(255, 80, 80);
      lay = blitGrid(cv, pg);
      statsEl.replaceChildren(stat(I18n.t('steps'), String(steps)), stat(I18n.t('ants'), String(ants.length)), stat(I18n.t('rule'), A.rule), stat(I18n.t('colours'), String(k)));
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!lay) return;
      const [x, y] = gridCell(cv, lay, e);
      if (x >= 0 && y >= 0 && x < W && y < H) { ants.push({ x, y, d: Math.floor(Math.random() * 4) }); draw(); }
    });
    const custom = el('input', { type: 'text', class: 'mono', value: A.rule, title: 'L = turn left, R = turn right, N = straight on, U = turn around', style: 'width:140px' });
    custom.addEventListener('change', () => { const r = custom.value.toUpperCase().replace(/[^LRNU]/g, ''); if (r.length >= 2) { A.rule = r; preset.value = ANT_RULES.some(([k]) => k === r) ? r : ''; reset(); } });
    const preset = choose([['', 'Custom…'], ...ANT_RULES], () => A.rule, (v) => { if (v) { A.rule = v; custom.value = v; reset(); } });
    const count = choose([1, 2, 3, 4].map((n) => [n, n === 1 ? '1 ant' : `${n} ants`]), () => A.count, (v) => { A.count = +v; reset(); });
    const speed = slider('Steps per frame', 1, 5000, () => A.speed, (v) => { A.speed = Math.round(v); }, { log: true, step: 1 });
    reset();
    return {
      controls: [preset, custom, count],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, speed.el, el('div')), statsEl,
        el('p', { class: 'hint' }, 'The ant turns right on a white cell and left on a coloured one, flips the colour and steps forward. After about 10 000 steps of chaos it suddenly builds a straight “highway” — nobody has proved that it always will. Longer rules (one letter per colour) build other shapes. Click to add an ant.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => speed.sync(),
    };
  }

  // ---------------------------------------------------------------- sandpile
  function sandTab() {
    const P = st.sand, N = 151, pg = pixGrid(N, N), centre = ((N - 1) / 2) * N + (N - 1) / 2;
    let g, added, topples, last, biggest, lay;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    function reset() { g = new Uint32Array(N * N); added = 0; topples = 0; last = 0; biggest = 0; draw(); }
    const drop = (i, n) => { last = Sims.sandpileAdd(g, N, N, i, n); added += n; topples += last; biggest = Math.max(biggest, last); };
    const step = () => drop(centre, P.rate);
    function draw() {
      const cols = [bgRGB(), RGB(77, 171, 247), RGB(252, 196, 25), RGB(255, 107, 107)];
      let on = 0;
      for (let i = 0; i < N * N; i++) { on += g[i]; pg.px[i] = cols[Math.min(3, g[i])]; }
      lay = blitGrid(cv, pg);
      statsEl.replaceChildren(stat(I18n.t('grains dropped'), String(added)), stat(I18n.t('grains on the table'), String(on)), stat(I18n.t('last avalanche (topplings)'), String(last)),
        stat(I18n.t('biggest avalanche'), String(biggest)), stat(I18n.t('topplings in total'), String(topples)));
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!lay) return;
      const [x, y] = gridCell(cv, lay, e);
      if (x >= 0 && y >= 0 && x < N && y < N) { drop(y * N + x, 2000); draw(); }
    });
    const rate = slider('Grains per frame', 1, 2000, () => P.rate, (v) => { P.rate = Math.round(v); }, { log: true, step: 1 });
    reset();
    return {
      controls: [U.el('button', { type: 'button', class: 'small', onclick: () => { drop(centre, 20000); draw(); } }, '+20 000 grains'),
        U.el('button', { type: 'button', class: 'small', title: 'Every cell holds 3 grains — one more grain anywhere sets off a huge avalanche', onclick: () => { g.fill(3); draw(); } }, 'Make every cell 3')],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, rate.el, el('div')), statsEl,
        el('p', { class: 'hint' }, 'Grains fall on the middle cell. A cell with 4 grains topples and gives one to each neighbour, which may topple too. The pile organises itself into a delicate fractal and stays “critical”: most grains do nothing, a few start avalanches of every size (self-organised criticality). Colours: 0 · 1 blue · 2 yellow · 3 red. Click to drop 2000 grains anywhere.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => rate.sync(),
    };
  }

  // ---------------------------------------------------------------- diffusion-limited aggregation
  function dlaTab() {
    const P = st.dla, W = 300, H = 200, pg = pixGrid(W, H);
    let stuck, order, count, walker, maxR, top, done, lay;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    const cx = W >> 1, cy = H >> 1;
    const set = (x, y) => {
      const i = y * W + x;
      stuck[i] = 1; order[i] = ++count;
      if (P.seed === 'point') maxR = Math.max(maxR, Math.hypot(x - cx, y - cy)); else top = Math.min(top, y);
    };
    function reset() {
      stuck = new Uint8Array(W * H); order = new Uint32Array(W * H); count = 0; maxR = 1; top = H - 1; walker = null; done = false;
      if (P.seed === 'point') set(cx, cy); else for (let x = 0; x < W; x++) set(x, H - 1);
      draw();
    }
    const launch = () => {
      if (P.seed === 'point') { const a = Math.random() * 2 * Math.PI, r = maxR + 6; return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) }; }
      return { x: Math.floor(Math.random() * W), y: Math.max(0, top - 8) };
    };
    const touches = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && stuck[ny * W + nx]) return true;
      }
      return false;
    };
    function step() {
      if (done) return;
      for (let budget = P.speed * 2000; budget > 0; budget--) {
        if (!walker) walker = launch();
        const d = Math.floor(Math.random() * 4);
        walker.x += d === 0 ? 1 : d === 1 ? -1 : 0; walker.y += d === 2 ? 1 : d === 3 ? -1 : 0;
        if (P.seed === 'point') {
          if (walker.x < 1 || walker.y < 1 || walker.x >= W - 1 || walker.y >= H - 1 || Math.hypot(walker.x - cx, walker.y - cy) > maxR * 2 + 20) { walker = null; continue; }
        } else {
          walker.x = (walker.x + W) % W;
          if (walker.y < Math.max(0, top - 30) || walker.y >= H) { walker = null; continue; }
        }
        if (touches(walker.x, walker.y)) {
          set(walker.x, walker.y); walker = null;
          if ((P.seed === 'point' && maxR > Math.min(W, H) / 2 - 4) || (P.seed !== 'point' && top <= 2)) { done = true; pause(); return; }
        }
      }
    }
    function draw() {
      const bg = bgRGB();
      for (let i = 0; i < W * H; i++) pg.px[i] = stuck[i] ? HSL(190 + (order[i] / count) * 150, 75, Theme.light ? 45 : 60) : bg;
      if (walker) pg.px[walker.y * W + walker.x] = RGB(255, 255, 255);
      lay = blitGrid(cv, pg);
      const size = P.seed === 'point' ? maxR : H - 1 - top;
      statsEl.replaceChildren(stat(I18n.t('particles'), String(count)), stat(I18n.t(P.seed === 'point' ? 'radius' : 'height'), f4(size)),
        ...(P.seed === 'point' ? [stat(I18n.t('fractal dimension ≈ ln N / ln r'), count > 50 ? f4(Math.log(count) / Math.log(maxR)) : '—')] : []), stat(I18n.t('status'), I18n.t(done ? 'finished' : 'growing')));
    }
    const seed = choose([['point', 'Grow from a point'], ['line', 'Grow up from the ground']], () => P.seed, (v) => { P.seed = v; reset(); });
    const speed = slider('Speed', 1, 100, () => P.speed, (v) => { P.speed = Math.round(v); }, { log: true, step: 1 });
    reset();
    return {
      controls: [seed],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, speed.el, el('div')), statsEl,
        el('p', { class: 'hint' }, 'Particles wander about at random until they touch the cluster and stick. Tips stick out further and catch more particles, so branches grow and inner gaps stay empty: the result looks like frost, lightning or coral, with fractal dimension about 1.71. Colour shows when each particle arrived.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => speed.sync(),
    };
  }

  // ---------------------------------------------------------------- ripple tank (2D wave equation)
  function rippleTab() {
    const P = st.ripple, W = 240, H = 150, pg = pixGrid(W, H), C2 = 0.3;
    let u0, u1, avg, wall, damp, t, lay;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    function reset() {
      u0 = new Float32Array(W * H); u1 = new Float32Array(W * H); avg = new Float32Array(W * H); wall = new Uint8Array(W * H); damp = new Float32Array(W * H); t = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { // absorbing border
        const e = Math.min(x, y, W - 1 - x, H - 1 - y);
        damp[y * W + x] = e < 20 ? 1 - 0.08 * ((20 - e) / 20) ** 2 : 1;
      }
      if (P.mode === 'slit2' || P.mode === 'slit1') {
        const wx = 90, open = P.mode === 'slit2' ? [H / 2 - P.sep / 2, H / 2 + P.sep / 2] : [H / 2];
        for (let y = 0; y < H; y++) if (!open.some((c) => Math.abs(y - c) < P.slit / 2)) for (let x = wx; x < wx + 3; x++) wall[y * W + x] = 1;
      }
      draw();
    }
    function sources() {
      if (P.mode === 'one') return [[W / 2, H / 2]];
      if (P.mode === 'two') return [[W / 2, H / 2 - P.sep / 2], [W / 2, H / 2 + P.sep / 2]];
      if (P.mode === 'slit1' || P.mode === 'slit2') return 'line';
      return [];
    }
    function step() {
      const src = sources(), w = (2 * Math.PI) / P.period;
      for (let sub = 0; sub < 2; sub++) {
        t++;
        for (let y = 1; y < H - 1; y++) for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
          if (wall[i]) { u0[i] = 0; continue; }
          const lap = u1[i - 1] + u1[i + 1] + u1[i - W] + u1[i + W] - 4 * u1[i];
          u0[i] = (2 * u1[i] - u0[i] + C2 * lap) * damp[i];
        }
        [u0, u1] = [u1, u0];
        const v = Math.sin(w * t);
        if (src === 'line') for (let y = 1; y < H - 1; y++) u1[y * W + 22] = v;
        else for (const [sx, sy] of src) { const i = Math.round(sy) * W + Math.round(sx); u1[i] = u1[i + 1] = u1[i + W] = u1[i + W + 1] = 2 * v; }
        for (let i = 0; i < W * H; i++) avg[i] = avg[i] * 0.985 + u1[i] * u1[i] * 0.015;
      }
    }
    function draw() {
      const intensity = P.view === 'intensity';
      let peak = 1e-6; // brightest spot beyond the slits (or away from the sources), so the pattern fills the colour range
      const from = P.mode === 'slit1' || P.mode === 'slit2' ? 96 : 0, src = sources();
      if (intensity) for (let y = 2; y < H - 2; y++) for (let x = Math.max(2, from); x < W - 2; x++) {
        if (src !== 'line' && src.some(([sx, sy]) => Math.abs(x - sx) < 6 && Math.abs(y - sy) < 6)) continue;
        peak = Math.max(peak, avg[y * W + x]);
      }
      for (let i = 0; i < W * H; i++) {
        if (wall[i]) { pg.px[i] = Theme.light ? RGB(90, 96, 110) : RGB(150, 156, 170); continue; }
        const s = intensity ? Math.min(1, Math.sqrt(avg[i] / peak)) * 2 - 1 : Math.max(-1, Math.min(1, u1[i] * 1.4));
        const k = (s + 1) / 2;
        pg.px[i] = intensity ? RGB(Math.round(20 + 235 * k ** 1.5), Math.round(25 + 200 * k ** 2), Math.round(60 + 60 * k)) : RGB(Math.round(15 + 210 * k ** 1.4), Math.round(40 + 200 * k ** 1.2), Math.round(90 + 165 * k));
      }
      lay = blitGrid(cv, pg, true);
      statsEl.replaceChildren(stat(I18n.t('wavelength'), f4(Math.sqrt(C2) * P.period) + ' ' + I18n.t('cells')), stat(I18n.t('time steps'), String(t)));
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!lay) return;
      const [x0, y0] = gridCell(cv, lay, e);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) u1[y * W + x] += 3 * Math.exp(-(dx * dx + dy * dy) / 6);
      }
      if (!running) setRunning(true);
    });
    const mode = choose([['one', 'One source'], ['two', 'Two sources (interference)'], ['slit2', 'Double slit'], ['slit1', 'Single slit'], ['drops', 'Drops only (click)']], () => P.mode, (v) => { P.mode = v; reset(); });
    const view = choose([['waves', 'Show the waves'], ['intensity', 'Show the intensity (average energy)']], () => P.view, (v) => { P.view = v; draw(); });
    const sliders = [slider('Period (steps per wave)', 8, 40, () => P.period, (v) => { P.period = v; }), slider('Distance between sources / slits', 8, 90, () => P.sep, (v) => { P.sep = v; reset(); }, { step: 1 }),
      slider('Slit width', 2, 24, () => P.slit, (v) => { P.slit = v; reset(); }, { step: 1 })];
    reset();
    return {
      controls: [mode, view],
      view: el('div', {}, cv, el('div', { class: 'grid3' }, sliders.map((s) => s.el)), statsEl,
        el('p', { class: 'hint' }, 'A water surface following the wave equation. Two sources, or the two openings of a double slit, make waves that add up where crests meet and cancel where a crest meets a trough — the striped interference pattern that proved light is a wave. “Intensity” shows the average energy, so the stripes stand still. Shorter waves or wider spacing give more stripes. Click to drop a stone.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- ideal gas
  function gasTab() {
    const G = st.gas, R = 3.5;
    let ps = [], W = 800, H = 400, impulse = 0, simT = 0, colls = 0, collT = 0, trail = [];
    const cv = el('canvas', { class: 'sim-canvas' }), hist = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' });
    const kT = () => ps.reduce((s, p) => s + 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy), 0) / (ps.length || 1);
    function reset() {
      ps = []; impulse = 0; simT = 0; colls = 0; collT = 0; trail = [];
      if (G.big) ps.push({ x: W / 2, y: H / 2, vx: 0, vy: 0, r: 15, m: 12 });
      const n = G.n, s = Math.sqrt((W * H) / (n * 1.15)), cols = Math.max(1, Math.floor(W / s)), v0 = Math.sqrt(2 * G.temp);
      for (let k = 0; k < n; k++) {
        const x = ((k % cols) + 0.5) * (W / cols) + (Math.random() - 0.5) * s * 0.3, y = (Math.floor(k / cols) + 0.5) * s + (Math.random() - 0.5) * s * 0.3;
        if (G.big && Math.hypot(x - W / 2, y - H / 2) < 22) continue;
        const a = Math.random() * 2 * Math.PI;
        ps.push({ x: Math.min(W - R, Math.max(R, x)), y: Math.min(H - R, Math.max(R, y)), vx: v0 * Math.cos(a), vy: v0 * Math.sin(a), r: R, m: 1 });
      }
      draw();
    }
    const heat = (target) => { const f = Math.sqrt(target / (kT() || 1)); for (const p of ps) { p.vx *= f; p.vy *= f; } };
    function collide(p, q) {
      const dx = q.x - p.x, dy = q.y - p.y, rr = p.r + q.r, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) return;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (rr - d) / 2;
      p.x -= nx * ov; p.y -= ny * ov; q.x += nx * ov; q.y += ny * ov;
      const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
      if (rel <= 0) return;
      const J = (2 * rel) / (1 / p.m + 1 / q.m);
      p.vx -= (J / p.m) * nx; p.vy -= (J / p.m) * ny; q.vx += (J / q.m) * nx; q.vy += (J / q.m) * ny;
      colls++;
    }
    function step(dt = 1 / 60) {
      const sub = 4, h = (Math.min(dt, 0.05) * G.time) / sub, cs = 2 * R + 2, gw = Math.ceil(W / cs) + 2;
      for (let s = 0; s < sub; s++) {
        for (const p of ps) {
          p.x += p.vx * h; p.y += p.vy * h;
          if (p.x < p.r) { p.x = p.r; if (p.vx < 0) { impulse -= 2 * p.m * p.vx; p.vx = -p.vx; } }
          if (p.x > W - p.r) { p.x = W - p.r; if (p.vx > 0) { impulse += 2 * p.m * p.vx; p.vx = -p.vx; } }
          if (p.y < p.r) { p.y = p.r; if (p.vy < 0) { impulse -= 2 * p.m * p.vy; p.vy = -p.vy; } }
          if (p.y > H - p.r) { p.y = H - p.r; if (p.vy > 0) { impulse += 2 * p.m * p.vy; p.vy = -p.vy; } }
        }
        const first = G.big ? 1 : 0, cells = new Map();
        for (let i = first; i < ps.length; i++) { const k = Math.floor(ps[i].x / cs) + 1 + (Math.floor(ps[i].y / cs) + 1) * gw; let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(i); }
        for (let i = first; i < ps.length; i++) {
          const k = Math.floor(ps[i].x / cs) + 1 + (Math.floor(ps[i].y / cs) + 1) * gw;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const l = cells.get(k + dx + dy * gw);
            if (l) for (const j of l) if (j > i) collide(ps[i], ps[j]);
          }
        }
        if (G.big) for (let j = 1; j < ps.length; j++) collide(ps[0], ps[j]);
        simT += h; collT += h;
      }
      if (G.big) { trail.push([ps[0].x, ps[0].y]); if (trail.length > 4000) trail.shift(); }
      if (simT > 8) { impulse /= 2; simT /= 2; } // a sliding average for the pressure
      if (collT > 4) { colls /= 2; collT /= 2; }
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      if (Math.abs(w - W) > 1 || Math.abs(h - H) > 1) { for (const p of ps) { p.x *= w / W; p.y *= h / H; } trail = trail.map(([x, y]) => [(x * w) / W, (y * h) / H]); W = w; H = h; }
      const vt = Math.sqrt(2 * (kT() || 1));
      for (const p of ps) {
        const sp = Math.hypot(p.vx, p.vy) / vt;
        ctx.fillStyle = p.m > 1 ? 'rgba(255,146,43,0.55)' : `hsl(${220 - Math.min(1, sp / 2.2) * 220}, 80%, ${Theme.light ? 48 : 60}%)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (trail.length > 1) { ctx.strokeStyle = Theme.light ? '#c2410c' : '#ffd8a8'; ctx.lineWidth = 1.6; ctx.beginPath(); trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      // speed histogram with the 2D Maxwell–Boltzmann distribution f(v) = v/σ² · e^(−v²/2σ²), σ² = kT/m
      const small = ps.filter((p) => p.m === 1), sig2 = small.reduce((s, p) => s + p.vx * p.vx + p.vy * p.vy, 0) / (2 * (small.length || 1));
      const vmax = 4 * Math.sqrt(sig2 || 1), bins = 30, bw = vmax / bins, counts = new Array(bins).fill(0);
      for (const p of small) { const b = Math.floor(Math.hypot(p.vx, p.vy) / bw); if (b < bins) counts[b]++; }
      const mb = (v) => (v / sig2) * Math.exp((-v * v) / (2 * sig2)) * small.length * bw;
      const fr = Charts.frame(hist, { xmin: 0, xmax: vmax, ymin: 0, ymax: Math.max(...counts, mb(Math.sqrt(sig2))) * 1.15 || 1, xlabel: I18n.t('speed (px/s)'), ylabel: I18n.t('particles') });
      counts.forEach((c, i) => { fr.ctx.fillStyle = 'rgba(77,171,247,0.7)'; fr.ctx.fillRect(fr.X(i * bw) + 1, fr.Y(c), fr.X(bw) - fr.X(0) - 2, fr.Y(0) - fr.Y(c)); });
      fr.ctx.strokeStyle = '#ff922b'; fr.ctx.lineWidth = 2; fr.ctx.beginPath();
      for (let k = 0; k <= 120; k++) { const v = (vmax * k) / 120; k ? fr.ctx.lineTo(fr.X(v), fr.Y(mb(v))) : fr.ctx.moveTo(fr.X(v), fr.Y(mb(v))); }
      fr.ctx.stroke();
      const T = kT(), Pr = simT ? impulse / simT / (2 * (W + H)) : NaN;
      statsEl.replaceChildren(stat(I18n.t('particles'), String(ps.length)), stat(I18n.t('temperature kT = average energy'), f4(T)),
        stat(I18n.t('pressure P'), simT ? f4(Pr) : '—'), stat('P·A / (N·kT)', simT ? f4((Pr * W * H) / (ps.length * T)) : '—'), stat(I18n.t('collisions per second'), collT ? f4(colls / collT) : '—'));
    }
    const sliders = [slider('Particles', 20, 800, () => G.n, (v) => { G.n = Math.round(v); reset(); }, { step: 1 }),
      slider('Temperature', 500, 30000, () => G.temp, (v) => { G.temp = v; heat(v); }, { log: true }), slider('Time speed', 0.1, 3, () => G.time, (v) => { G.time = v; })];
    reset();
    return {
      controls: [check('Big heavy particle (Brownian motion)', () => G.big, (v) => { G.big = v; reset(); }), U.el('button', { type: 'button', class: 'small', title: 'Every particle starts with the same speed', onclick: reset }, 'Restart')],
      view: el('div', {}, cv, el('div', { class: 'grid3' }, sliders.map((s) => s.el)), hist, statsEl,
        el('p', { class: 'hint' }, 'Hard discs bouncing off each other and the walls. They all start with the same speed, yet within seconds the speeds spread into the Maxwell–Boltzmann distribution (orange). Temperature is just the average kinetic energy; the pressure comes from the pushes on the walls, and P·A ≈ N·kT is the ideal gas law. The big particle is jostled into a random zigzag — the Brownian motion Einstein used to prove that atoms exist.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- gravity sandbox (n bodies)
  const GRAV = {
    eight: { name: 'Figure-eight (three bodies)', span: 1.4, time: 1, bodies: () => {
      const v = [0.46620368, 0.43236573];
      return [{ x: 0.97000436, y: -0.24308753, vx: v[0], vy: v[1], m: 1 }, { x: -0.97000436, y: 0.24308753, vx: v[0], vy: v[1], m: 1 }, { x: 0, y: 0, vx: -2 * v[0], vy: -2 * v[1], m: 1 }];
    } },
    solar: { name: 'Sun, planet and moon', span: 14, time: 1.5, bodies: () => [{ x: 0, y: 0, vx: 0, vy: -0.01, m: 1000 }, { x: 10, y: 0, vx: 0, vy: 10, m: 1 }, { x: 10.6, y: 0, vx: 0, vy: 10 + Math.sqrt(1 / 0.6), m: 0.001 }] },
    binary: { name: 'Double star with a planet', span: 26, time: 2, bodies: () => { const v = Math.sqrt((500 * 3) / 36); return [{ x: -3, y: 0, vx: 0, vy: -v, m: 500 }, { x: 3, y: 0, vx: 0, vy: v, m: 500 }, { x: 20, y: 0, vx: 0, vy: Math.sqrt(1000 / 20), m: 0.1 }]; } },
    lagrange: { name: 'Lagrange points (Trojans)', span: 14, time: 1.5, bodies: () => {
      const out = [{ x: 0, y: 0, vx: 0, vy: 0, m: 1000 }, { x: 10, y: 0, vx: 0, vy: 10, m: 10 }];
      for (const a of [Math.PI / 3, -Math.PI / 3]) out.push({ x: 10 * Math.cos(a), y: 10 * Math.sin(a), vx: -10 * Math.sin(a), vy: 10 * Math.cos(a), m: 0.001 });
      return out;
    } },
    cluster: { name: 'Star cluster', span: 16, time: 1, bodies: () => {
      const out = [];
      for (let i = 0; i < 24; i++) { const r = 2 + Math.random() * 9, a = Math.random() * 2 * Math.PI, v = Math.sqrt((24 * 3 * (r / 11)) / r) * 0.75; out.push({ x: r * Math.cos(a), y: r * Math.sin(a), vx: -v * Math.sin(a), vy: v * Math.cos(a), m: 1 + Math.random() * 4 }); }
      return out;
    } },
  };
  function gravityTab() {
    const P = st.grav;
    let bodies, t, E0, eps, view, launch = null;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' });
    const colors = ['#ffd43b', '#4dabf7', '#ff922b', '#51cf66', '#cc5de8', '#ff6b6b', '#22b8cf', '#f06595'];
    function reset() {
      const pr = GRAV[P.preset];
      bodies = pr.bodies().map((b, i) => ({ ...b, trail: [], color: colors[i % colors.length] }));
      eps = pr.span * 0.006; t = 0; E0 = Sims.nbodyEnergy(bodies, eps);
      draw();
    }
    function step(dt = 1 / 60) {
      // adaptive steps: a small fraction of the shortest orbit / fly-by time between any two bodies, so close encounters stay accurate
      const pr = GRAV[P.preset];
      let left = Math.min(dt, 0.05) * P.time * pr.time;
      for (let iter = 0; left > 1e-12 && iter < 3000; iter++) {
        let tmin = Infinity;
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j], d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + eps * eps, v2 = (a.vx - b.vx) ** 2 + (a.vy - b.vy) ** 2;
          tmin = Math.min(tmin, Math.sqrt(d2 ** 1.5 / (a.m + b.m)), Math.sqrt(d2 / (v2 || 1e-12)));
        }
        const h = Math.min(left, 0.004 * tmin);
        Sims.nbodyStep(bodies, h, eps);
        left -= h; t += h;
      }
      if (P.trails) for (const b of bodies) { b.trail.push([b.x, b.y]); if (b.trail.length > 1500) b.trail.shift(); }
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv), pr = GRAV[P.preset];
      const M = bodies.reduce((s, b) => s + b.m, 0), cmx = bodies.reduce((s, b) => s + b.m * b.x, 0) / M, cmy = bodies.reduce((s, b) => s + b.m * b.y, 0) / M;
      const scale = Math.min(w, h) / (2 * pr.span), ox = w / 2 - cmx * scale, oy = h / 2 + cmy * scale;
      view = { scale, ox, oy };
      const S = (x, y) => [ox + x * scale, oy - y * scale];
      const maxM = Math.max(...bodies.map((b) => b.m));
      for (const b of bodies) {
        if (b.trail.length < 2) continue;
        ctx.strokeStyle = b.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.beginPath();
        b.trail.forEach(([x, y], i) => (i ? ctx.lineTo(...S(x, y)) : ctx.moveTo(...S(x, y)))); ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const b of bodies) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(...S(b.x, b.y), 2.5 + 7 * Math.cbrt(b.m / maxM), 0, Math.PI * 2); ctx.fill(); }
      if (launch) { ctx.strokeStyle = '#51cf66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...S(...launch.p)); ctx.lineTo(...S(...launch.q)); ctx.stroke(); }
      const E = Sims.nbodyEnergy(bodies, eps);
      statsEl.replaceChildren(stat(I18n.t('bodies'), String(bodies.length)), stat(I18n.t('time'), f4(t)), stat(I18n.t('energy drift (numerical error)'), f4((100 * (E - E0)) / Math.abs(E0 || 1)) + ' %'));
    }
    const toWorld = (e) => { const [x, y] = canvasXY(cv, e); return [(x - view.ox) / view.scale, -(y - view.oy) / view.scale]; };
    cv.addEventListener('pointerdown', (e) => { if (!view) return; cv.setPointerCapture(e.pointerId); const p = toWorld(e); launch = { p, q: p }; draw(); });
    cv.addEventListener('pointermove', (e) => { if (launch) { launch.q = toWorld(e); draw(); } });
    cv.addEventListener('pointerup', () => {
      if (!launch) return;
      const { p, q } = launch, k = 1.5 / GRAV[P.preset].time;
      launch = null;
      bodies.push({ x: p[0], y: p[1], vx: (q[0] - p[0]) * k, vy: (q[1] - p[1]) * k, m: P.mass, trail: [], color: colors[bodies.length % colors.length] });
      E0 = Sims.nbodyEnergy(bodies, eps);
      if (!running) setRunning(true);
    });
    const preset = choose(Object.entries(GRAV).map(([k, g]) => [k, g.name]), () => P.preset, (v) => { P.preset = v; reset(); });
    const sliders = [slider('Mass of new bodies', 0.001, 1000, () => P.mass, (v) => { P.mass = v; }, { log: true }), slider('Time speed', 0.1, 4, () => P.time, (v) => { P.time = v; })];
    reset();
    return {
      controls: [preset, check('Trails', () => P.trails, (v) => { P.trails = v; if (!v) bodies.forEach((b) => (b.trail = [])); draw(); })],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, sliders.map((s) => s.el)), statsEl,
        el('p', { class: 'hint' }, 'Every body pulls on every other with Newton’s law of gravity. Two bodies always follow ellipses, but three or more are usually chaotic — except for rare special orbits like the figure-eight found in 2000. Small bodies at the Lagrange points 60° ahead of and behind a planet ride along with it, like Jupiter’s Trojan asteroids. Drag on the picture to throw in a new body.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- epidemic (agent-based SIR)
  function sirTab() {
    const P = st.sir;
    let ag = [], W = 800, H = 380, day, hist, peak, peakDay;
    const cv = el('canvas', { class: 'sim-canvas' }), chart = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' });
    function reset() {
      day = 0; hist = []; peak = 0; peakDay = 0;
      ag = Array.from({ length: P.n }, () => { const a = Math.random() * 2 * Math.PI; return { x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, s: 0, t: 0, home: Math.random() < P.home / 100 }; });
      for (let k = 0; k < Math.min(P.seed, ag.length); k++) ag[k].s = 1;
      record(); draw();
    }
    const counts = () => { const c = [0, 0, 0]; for (const a of ag) c[a.s]++; return c; };
    const record = () => { const [S, I, R] = counts(); hist.push([day, S, I, R]); if (I > peak) { peak = I; peakDay = day; } };
    function step(dt = 1 / 60) {
      dt = Math.min(dt, 0.05);
      const dd = dt * P.speed, pInf = 1 - Math.exp(-P.rate * dd), r = P.radius, cells = new Map(), gw = Math.ceil(W / r) + 2;
      for (const a of ag) {
        if (a.home) continue;
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < 0 || a.x > W) { a.vx = -a.vx; a.x = Math.min(W, Math.max(0, a.x)); }
        if (a.y < 0 || a.y > H) { a.vy = -a.vy; a.y = Math.min(H, Math.max(0, a.y)); }
        if (Math.random() < dt * 0.5) { const ang = Math.random() * 2 * Math.PI; a.vx = Math.cos(ang) * 40; a.vy = Math.sin(ang) * 40; }
      }
      ag.forEach((a, i) => { if (a.s === 0) { const k = Math.floor(a.x / r) + 1 + (Math.floor(a.y / r) + 1) * gw; let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(i); } });
      for (const a of ag) {
        if (a.s !== 1) continue;
        if (day - a.t > P.recover) { a.s = 2; continue; }
        const k = Math.floor(a.x / r) + 1 + (Math.floor(a.y / r) + 1) * gw;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const l = cells.get(k + dx + dy * gw);
          if (l) for (const j of l) { const b = ag[j]; if (b.s === 0 && (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < r * r && Math.random() < pInf) { b.s = 1; b.t = day; } }
        }
      }
      day += dd;
      if (!hist.length || day - hist[hist.length - 1][0] >= 0.1) record();
      if (!counts()[1]) pause();
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      if (Math.abs(w - W) > 1 || Math.abs(h - H) > 1) { for (const a of ag) { a.x *= w / W; a.y *= h / H; } W = w; H = h; }
      const col = ['#4dabf7', '#ff6b6b', Theme.light ? '#adb5bd' : '#5c6378'];
      for (const a of ag) {
        if (a.s === 1) { ctx.fillStyle = 'rgba(255,107,107,0.12)'; ctx.beginPath(); ctx.arc(a.x, a.y, P.radius, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = col[a.s]; ctx.beginPath(); ctx.arc(a.x, a.y, a.home ? 2.5 : 3.5, 0, Math.PI * 2); ctx.fill();
      }
      const n = ag.length, fr = Charts.frame(chart, { xmin: 0, xmax: Math.max(10, day), ymin: 0, ymax: n, xlabel: I18n.t('days'), ylabel: I18n.t('people') });
      const area = (lo, hi, color) => {
        fr.ctx.fillStyle = color; fr.ctx.beginPath();
        hist.forEach((p, i) => (i ? fr.ctx.lineTo(fr.X(p[0]), fr.Y(hi(p))) : fr.ctx.moveTo(fr.X(p[0]), fr.Y(hi(p)))));
        for (let i = hist.length - 1; i >= 0; i--) fr.ctx.lineTo(fr.X(hist[i][0]), fr.Y(lo(hist[i])));
        fr.ctx.fill();
      };
      area(() => 0, (p) => p[2], 'rgba(255,107,107,0.85)');
      area((p) => p[2], (p) => p[2] + p[1], 'rgba(77,171,247,0.6)');
      area((p) => p[2] + p[1], () => n, Theme.light ? 'rgba(173,181,189,0.6)' : 'rgba(92,99,120,0.6)');
      const [S, I, R] = counts();
      statsEl.replaceChildren(stat(I18n.t('day'), f4(day)), stat(I18n.t('healthy'), String(S)), stat(I18n.t('ill'), String(I)), stat(I18n.t('recovered'), String(R)),
        stat(I18n.t('most ill at once'), `${peak} (${I18n.t('day')} ${Math.round(peakDay)})`), stat(I18n.t('ever ill'), `${Math.round((100 * (I + R)) / (n || 1))} %`));
    }
    const sliders = [slider('People', 100, 1500, () => P.n, (v) => { P.n = Math.round(v); reset(); }, { step: 1 }), slider('Staying at home (%)', 0, 95, () => P.home, (v) => { P.home = v; reset(); }, { step: 1 }),
      slider('Infection distance (px)', 4, 30, () => P.radius, (v) => { P.radius = v; }), slider('Infection rate (per contact-day)', 0.1, 10, () => P.rate, (v) => { P.rate = v; }, { log: true }),
      slider('Days until recovered', 2, 30, () => P.recover, (v) => { P.recover = v; }), slider('Days per second', 0.5, 10, () => P.speed, (v) => { P.speed = v; })];
    reset();
    return {
      controls: [U.el('button', { type: 'button', class: 'small', onclick: reset }, 'Restart')],
      view: el('div', {}, cv, el('div', { class: 'grid3' }, sliders.map((s) => s.el)), chart, statsEl,
        el('p', { class: 'hint' }, 'Blue people are healthy, red ones ill (they infect anyone close enough), grey ones recovered and immune. The chart stacks ill (red), healthy (blue) and recovered (grey). When many people stay at home the curve is “flattened”: fewer are ill at the same time and often not everyone catches it at all. This is the SIR model, simulated person by person.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- predator and prey (Lotka–Volterra)
  function preyTab() {
    const P = st.prey;
    let y, t, hist, map;
    const ts = el('canvas', { class: 'chart' }), ph = el('canvas', { class: 'chart tall' }), statsEl = el('div', { class: 'pl-stats' });
    const params = () => ({ a: P.a, b: P.b, c: P.c, d: P.d, K: P.limited ? P.K : Infinity });
    function reset(start) { y = start || [P.x0, P.y0]; t = 0; hist = [[0, y[0], y[1]]]; draw(); }
    function step(dt = 1 / 60) {
      const f = Sims.lotka(params()), h = 0.01, n = Math.max(1, Math.round((Math.min(dt, 0.05) * P.speed) / h));
      for (let i = 0; i < n; i++) { y = Sims.rk4(f, y, h).map((v) => Math.max(v, 1e-9)); t += h; }
      hist.push([t, y[0], y[1]]); if (hist.length > 6000) hist.shift();
    }
    function draw() {
      const pr = params(), ex = pr.c / pr.d, ey = (pr.a / pr.b) * (1 - ex / pr.K);
      const xmax = Math.max(ex * 2.5, ...hist.map((p) => p[1])) * 1.1, ymax = Math.max(Math.max(ey, 1) * 2.5, ...hist.map((p) => p[2])) * 1.1;
      const span = 60, f1 = Charts.frame(ts, { xmin: Math.max(0, t - span), xmax: Math.max(span, t), ymin: 0, ymax: Math.max(xmax, ymax), xlabel: I18n.t('time'), ylabel: I18n.t('animals') });
      for (const [k, color] of [[1, '#4dabf7'], [2, '#ff922b']]) { f1.ctx.strokeStyle = color; f1.ctx.lineWidth = 2; f1.ctx.beginPath(); hist.forEach((p, i) => (i ? f1.ctx.lineTo(f1.X(p[0]), f1.Y(p[k])) : f1.ctx.moveTo(f1.X(p[0]), f1.Y(p[k])))); f1.ctx.stroke(); }
      const fr = Charts.frame(ph, { xmin: 0, xmax, ymin: 0, ymax, xlabel: I18n.t('rabbits (prey)'), ylabel: I18n.t('foxes (predators)') });
      map = { fr, xmax, ymax };
      const f = Sims.lotka(pr);
      fr.ctx.strokeStyle = Theme.light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.2)'; fr.ctx.lineWidth = 1;
      for (let i = 1; i < 16; i++) for (let j = 1; j < 11; j++) { // direction field
        const px = (xmax * i) / 16, py = (ymax * j) / 11, [dx, dy] = f([px, py]);
        const sx = dx / xmax, sy = dy / ymax, L = Math.hypot(sx, sy) || 1, X = fr.X(px), Y = fr.Y(py);
        fr.ctx.beginPath(); fr.ctx.moveTo(X, Y); fr.ctx.lineTo(X + (sx / L) * 11, Y - (sy / L) * 11); fr.ctx.stroke();
      }
      fr.ctx.strokeStyle = '#cc5de8'; fr.ctx.lineWidth = 2; fr.ctx.beginPath();
      hist.forEach((p, i) => (i ? fr.ctx.lineTo(fr.X(p[1]), fr.Y(p[2])) : fr.ctx.moveTo(fr.X(p[1]), fr.Y(p[2])))); fr.ctx.stroke();
      if (ey > 0) { fr.ctx.fillStyle = Theme.text; fr.ctx.beginPath(); fr.ctx.arc(fr.X(ex), fr.Y(ey), 4, 0, Math.PI * 2); fr.ctx.fill(); }
      fr.ctx.fillStyle = '#cc5de8'; fr.ctx.beginPath(); fr.ctx.arc(fr.X(y[0]), fr.Y(y[1]), 5, 0, Math.PI * 2); fr.ctx.fill();
      statsEl.replaceChildren(stat(I18n.t('time'), f4(t)), stat(I18n.t('rabbits'), f4(y[0])), stat(I18n.t('foxes'), f4(y[1])), stat(I18n.t('balance point'), ey > 0 ? `(${f4(ex)}, ${f4(ey)})` : I18n.t('foxes die out')));
    }
    ph.addEventListener('pointerdown', (e) => {
      if (!map) return;
      const [px, py] = canvasXY(ph, e), { fr, xmax, ymax } = map;
      const x = ((px - fr.x0) / (fr.x1 - fr.x0)) * xmax, yy = ((fr.y1 - py) / (fr.y1 - fr.y0)) * ymax;
      if (x > 0 && yy > 0) { reset([x, yy]); if (!running) setRunning(true); }
    });
    const sliders = [slider('Rabbit births α', 0.1, 3, () => P.a, (v) => { P.a = v; draw(); }), slider('Hunting success β', 0.005, 0.2, () => P.b, (v) => { P.b = v; draw(); }, { log: true }),
      slider('Fox deaths γ', 0.1, 2, () => P.c, (v) => { P.c = v; draw(); }), slider('Fox births per rabbit δ', 0.002, 0.05, () => P.d, (v) => { P.d = v; draw(); }, { log: true }),
      slider('Food for at most K rabbits', 50, 1000, () => P.K, (v) => { P.K = v; draw(); }), slider('Time speed', 0.5, 10, () => P.speed, (v) => { P.speed = v; })];
    reset();
    return {
      controls: [check('Limited food for the rabbits', () => P.limited, (v) => { P.limited = v; draw(); }), U.el('button', { type: 'button', class: 'small', onclick: () => reset() }, 'Restart')],
      view: el('div', {}, el('div', { class: 'sim-split' }, ph, el('div', {}, ts, el('div', { class: 'grid2' }, sliders.map((s) => s.el)))), statsEl,
        el('p', { class: 'hint' }, 'More rabbits feed more foxes; more foxes eat more rabbits; then the foxes starve and the rabbits recover. The populations chase each other in endless cycles (blue rabbits, orange foxes), which are closed loops in the phase plane on the left. With limited food the loops spiral in to a steady balance. Click in the phase plane to start from another point.')),
      step, draw, reset: () => reset(), stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- logistic map (cobweb, time series, bifurcation)
  function logisticTab() {
    const P = st.logi;
    let xs, acc = 0, bifCache = null, bifMap;
    const cob = el('canvas', { class: 'chart tall' }), series = el('canvas', { class: 'chart' }), bif = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' });
    const R0 = 2.5, R1 = 4;
    function reset() { xs = [P.x0]; acc = 0; draw(); }
    function step(dt = 1 / 60) {
      acc += Math.min(dt, 0.1) * P.speed;
      while (acc >= 1) { const x = xs[xs.length - 1]; xs.push(P.r * x * (1 - x)); acc--; }
      if (xs.length > 3000) xs = xs.slice(-2000);
    }
    function draw() {
      const r = P.r, fr = Charts.frame(cob, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, xlabel: 'xₙ', ylabel: 'xₙ₊₁' }), { ctx, X, Y } = fr;
      ctx.strokeStyle = Theme.muted; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke();
      ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const x = i / 200; i ? ctx.lineTo(X(x), Y(r * x * (1 - x))) : ctx.moveTo(X(x), Y(0)); }
      ctx.stroke();
      const tail = xs.slice(-150);
      ctx.lineWidth = 1.3;
      for (let i = 0; i < tail.length - 1; i++) {
        const a = tail[i], b = tail[i + 1];
        ctx.strokeStyle = `rgba(255,146,43,${0.15 + (0.85 * i) / tail.length})`;
        ctx.beginPath(); ctx.moveTo(X(a), Y(i === 0 && xs.length === tail.length ? 0 : a)); ctx.lineTo(X(a), Y(b)); ctx.lineTo(X(b), Y(b)); ctx.stroke();
      }
      const last = xs.slice(-80), f2 = Charts.frame(series, { xmin: Math.max(0, xs.length - 80), xmax: Math.max(80, xs.length), ymin: 0, ymax: 1, xlabel: 'n', ylabel: 'xₙ' });
      f2.ctx.strokeStyle = '#ff922b'; f2.ctx.lineWidth = 1.5; f2.ctx.beginPath();
      last.forEach((x, i) => { const n = xs.length - last.length + i; i ? f2.ctx.lineTo(f2.X(n), f2.Y(x)) : f2.ctx.moveTo(f2.X(n), f2.Y(x)); });
      f2.ctx.stroke();
      last.forEach((x, i) => { f2.ctx.fillStyle = '#ff922b'; f2.ctx.beginPath(); f2.ctx.arc(f2.X(xs.length - last.length + i), f2.Y(x), 2, 0, Math.PI * 2); f2.ctx.fill(); });
      // bifurcation diagram, computed once per size
      const f3 = Charts.frame(bif, { xmin: R0, xmax: R1, ymin: 0, ymax: 1, xlabel: 'r', ylabel: 'x' });
      bifMap = f3;
      const key = `${f3.w}x${f3.h}${Theme.light}`;
      if (!bifCache || bifCache.key !== key) {
        const c = document.createElement('canvas'), pw = Math.max(1, Math.round(f3.x1 - f3.x0)), ph = Math.max(1, Math.round(f3.y1 - f3.y0));
        c.width = pw; c.height = ph;
        const g = c.getContext('2d'), img = g.createImageData(pw, ph), px = new Uint32Array(img.data.buffer), dot = Theme.light ? RGB(30, 60, 120) : RGB(150, 200, 255);
        for (let col = 0; col < pw; col++) {
          const rr = R0 + ((col + 0.5) / pw) * (R1 - R0);
          let x = Sims.logisticSettle(rr, 0.5, 300);
          for (let k = 0; k < 160; k++) { x = rr * x * (1 - x); const row = Math.round((1 - x) * (ph - 1)); px[row * pw + col] = dot; }
        }
        g.putImageData(img, 0, 0);
        bifCache = { key, c };
      }
      f3.ctx.drawImage(bifCache.c, f3.x0, f3.y0, f3.x1 - f3.x0, f3.y1 - f3.y0);
      if (r >= R0) { f3.ctx.strokeStyle = '#ff6b6b'; f3.ctx.lineWidth = 1.5; f3.ctx.beginPath(); f3.ctx.moveTo(f3.X(r), f3.y0); f3.ctx.lineTo(f3.X(r), f3.y1); f3.ctx.stroke(); }
      const per = Sims.logisticPeriod(r), lya = Sims.lyapunov(r);
      statsEl.replaceChildren(stat('r', f4(r)), stat('xₙ', f4(xs[xs.length - 1])), stat('n', String(xs.length - 1)),
        stat(I18n.t('behaviour'), per === 1 ? I18n.t('settles to one value') : per ? `${I18n.t('cycle of length')} ${per}` : I18n.t('chaos')), stat(I18n.t('Lyapunov exponent (> 0 = chaos)'), f4(lya)));
    }
    bif.addEventListener('pointerdown', (e) => {
      if (!bifMap) return;
      const [px] = canvasXY(bif, e), r = R0 + ((px - bifMap.x0) / (bifMap.x1 - bifMap.x0)) * (R1 - R0);
      if (r >= R0 && r <= R1) { P.r = +r.toFixed(4); rS.sync(); reset(); }
    });
    const rS = slider('Growth rate r', 0, 4, () => P.r, (v) => { P.r = v; reset(); }, { prec: 5 });
    const sliders = [rS, slider('Start value x₀', 0.01, 0.99, () => P.x0, (v) => { P.x0 = v; reset(); }), slider('Steps per second', 1, 60, () => P.speed, (v) => { P.speed = v; })];
    reset();
    return {
      controls: [U.el('button', { type: 'button', class: 'small', onclick: () => { for (let i = 0; i < 100; i++) { const x = xs[xs.length - 1]; xs.push(P.r * x * (1 - x)); } draw(); } }, '+100 steps')],
      view: el('div', {}, el('div', { class: 'sim-split' }, cob, el('div', {}, series, bif)), el('div', { class: 'grid3' }, sliders.map((s) => s.el)), statsEl,
        el('p', { class: 'hint' }, 'xₙ₊₁ = r·xₙ·(1 − xₙ) is a simple model of a population with limited food. The cobweb (left) shows each step: up to the curve, across to the diagonal. Below r = 3 it settles to one value; then the cycle doubles (2, 4, 8, …) faster and faster until chaos at r ≈ 3.57 — with calm windows such as the 3-cycle at r ≈ 3.83. The bifurcation diagram (click it to pick r) shows it all at once.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- travelling salesman
  function tspTab() {
    const P = st.tsp;
    let pts, tour, len, best, tries, better, T, T0, cool, sinceBetter, hist, lay;
    const cv = el('canvas', { class: 'sim-canvas wide' }), chart = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' });
    function makePoints() {
      const n = P.n, out = [];
      if (P.layout === 'circle') for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; out.push([0.5 + 0.42 * Math.cos(a), 0.5 + 0.42 * Math.sin(a)]); }
      else if (P.layout === 'grid') { const k = Math.ceil(Math.sqrt(n)); for (let i = 0; i < n; i++) out.push([0.08 + (0.84 * (i % k)) / Math.max(1, k - 1), 0.08 + (0.84 * Math.floor(i / k)) / Math.max(1, k - 1)]); }
      else if (P.layout === 'clusters') { const cs = Array.from({ length: 5 }, () => [0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7]); for (let i = 0; i < n; i++) { const c = cs[i % 5]; out.push([c[0] + (Math.random() - 0.5) * 0.18, c[1] + (Math.random() - 0.5) * 0.18]); } }
      else for (let i = 0; i < n; i++) out.push([0.04 + Math.random() * 0.92, 0.04 + Math.random() * 0.92]);
      if (P.layout === 'circle') for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    }
    function startTour() {
      if (P.start === 'nearest') tour = Sims.nearestTour(pts);
      else { tour = pts.map((_, i) => i); for (let i = tour.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tour[i], tour[j]] = [tour[j], tour[i]]; } }
      len = Sims.tourLength(pts, tour); best = len; tries = 0; better = 0; sinceBetter = 0; hist = [[0, len]];
      T0 = (len / Math.max(1, pts.length)) * 0.6; T = T0; cool = Math.pow(1e-3, 1 / (3000 * Math.max(4, pts.length)));
      draw();
    }
    function reset() { pts = makePoints(); startTour(); }
    function step() {
      if (pts.length < 4) return;
      for (let k = 0; k < P.speed; k++) {
        const d = Sims.twoOptMove(pts, tour, P.mode === 'anneal' ? T : 0);
        tries++;
        if (d) { len += d; if (len < best - 1e-12) { best = len; better++; sinceBetter = 0; } }
        sinceBetter++;
        if (P.mode === 'anneal') T *= cool;
      }
      if (tries % 5000 < P.speed) len = Sims.tourLength(pts, tour); // clear rounding drift now and then
      hist.push([tries, len]); if (hist.length > 3000) hist = hist.filter((_, i) => i % 2 === 0);
      if ((P.mode !== 'anneal' && sinceBetter > 40 * pts.length * pts.length) || (P.mode === 'anneal' && T < T0 * 1e-3)) pause();
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv), pad = 16, s = Math.min(w, h) - 2 * pad, ox = (w - s) / 2, oy = (h - s) / 2;
      lay = { s, ox, oy };
      const S = (p) => [ox + p[0] * s, oy + p[1] * s];
      ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
      tour.forEach((i, k) => (k ? ctx.lineTo(...S(pts[i])) : ctx.moveTo(...S(pts[i])))); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = Theme.text;
      for (const p of pts) { ctx.beginPath(); ctx.arc(...S(p), 3.5, 0, Math.PI * 2); ctx.fill(); }
      const fr = Charts.frame(chart, { xmin: 0, xmax: Math.max(10, tries), ymin: 0, ymax: Math.max(...hist.map((p) => p[1])) * 1.1 || 1, xlabel: I18n.t('moves tried'), ylabel: I18n.t('tour length') });
      fr.ctx.strokeStyle = '#ff922b'; fr.ctx.lineWidth = 2; fr.ctx.beginPath(); hist.forEach(([x, y], i) => (i ? fr.ctx.lineTo(fr.X(x), fr.Y(y)) : fr.ctx.moveTo(fr.X(x), fr.Y(y)))); fr.ctx.stroke();
      statsEl.replaceChildren(stat(I18n.t('cities'), String(pts.length)), stat(I18n.t('tour length'), f4(len)), stat(I18n.t('best so far'), f4(best)),
        stat(I18n.t('moves tried'), String(tries)), stat(I18n.t('improvements'), String(better)), ...(P.mode === 'anneal' ? [stat(I18n.t('temperature'), f4(T))] : []),
        ...(P.layout === 'circle' ? [stat(I18n.t('shortest possible'), f4(2 * pts.length * 0.42 * Math.sin(Math.PI / pts.length)))] : []));
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!lay) return;
      const [x, y] = canvasXY(cv, e), p = [(x - lay.ox) / lay.s, (y - lay.oy) / lay.s];
      if (p[0] < 0 || p[1] < 0 || p[0] > 1 || p[1] > 1) return;
      pts.push(p);
      const n = pts.length - 1;
      let bi = 0, bd = Infinity; // insert where it lengthens the tour least
      for (let i = 0; i < tour.length; i++) { const a = pts[tour[i]], b = pts[tour[(i + 1) % tour.length]], d = Math.hypot(a[0] - p[0], a[1] - p[1]) + Math.hypot(b[0] - p[0], b[1] - p[1]) - Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < bd) { bd = d; bi = i + 1; } }
      tour.splice(bi, 0, n); len = Sims.tourLength(pts, tour); best = Math.min(best, len); sinceBetter = 0;
      draw();
    });
    const mode = choose([['2opt', '2-opt (only improvements)'], ['anneal', 'Simulated annealing']], () => P.mode, (v) => { P.mode = v; startTour(); });
    const layout = choose([['random', 'Random cities'], ['clusters', 'Clusters'], ['circle', 'On a circle'], ['grid', 'Grid']], () => P.layout, (v) => { P.layout = v; reset(); });
    const start = choose([['random', 'Start: random tour'], ['nearest', 'Start: nearest neighbour']], () => P.start, (v) => { P.start = v; startTour(); });
    const sliders = [slider('Cities', 5, 300, () => P.n, (v) => { P.n = Math.round(v); reset(); }, { step: 1 }), slider('Moves per frame', 1, 5000, () => P.speed, (v) => { P.speed = Math.round(v); }, { log: true, step: 1 })];
    reset();
    return {
      controls: [mode, layout, start, U.el('button', { type: 'button', class: 'small', onclick: startTour }, 'New start tour')],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, sliders.map((s) => s.el)), chart, statsEl,
        el('p', { class: 'hint' }, 'Find the shortest round trip through all the cities. There are (n − 1)!/2 possible tours — for 60 cities more than atoms in the universe — so we improve a tour step by step instead: 2-opt reverses a stretch of the route whenever that makes it shorter, which removes every crossing but can get stuck. Simulated annealing sometimes accepts a worse tour, less and less often as it “cools”, and usually finds a better one. Click to add a city.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- convex hull
  const HULL_INFO = {
    jarvis: 'Gift wrapping (Jarvis march) — O(n·h): start at the leftmost point and keep turning to the point that has all others on its left, like wrapping a ribbon around nails.',
    monotone: 'Monotone chain (Andrew) — O(n log n): sort the points by x, then build the lower and upper edge, removing every point that would make a right turn.',
  };
  function hullTab() {
    const P = st.hull;
    let pts, gen, state, steps, done, lay;
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' }), info = el('p', { class: 'hint' });
    function makePoints() {
      const out = [];
      for (let i = 0; i < P.n; i++) {
        if (P.layout === 'disk') { const r = Math.sqrt(Math.random()) * 0.45, a = Math.random() * 2 * Math.PI; out.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]); }
        else if (P.layout === 'gauss') { const u = Math.random() || 1e-9, v = Math.random(), r = Math.sqrt(-2 * Math.log(u)) * 0.12; out.push([Math.min(0.98, Math.max(0.02, 0.5 + r * Math.cos(2 * Math.PI * v))), Math.min(0.98, Math.max(0.02, 0.5 + r * Math.sin(2 * Math.PI * v)))]); }
        else out.push([0.04 + Math.random() * 0.92, 0.04 + Math.random() * 0.92]);
      }
      return out;
    }
    function restart() { gen = Sims.HULL[P.algo](pts); state = null; steps = 0; done = false; info.textContent = HULL_INFO[P.algo]; draw(); }
    function reset() { pts = makePoints(); restart(); }
    function step() {
      if (done) return;
      for (let k = 0; k < P.speed; k++) {
        const r = gen.next();
        if (r.done) { done = true; break; }
        state = r.value; steps++;
        if (state.done) { done = true; pause(); break; }
      }
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv), pad = 18, sx = w - 2 * pad, sy = h - 2 * pad;
      lay = { pad, sx, sy };
      const S = (i) => [pad + pts[i][0] * sx, pad + pts[i][1] * sy];
      const line = (a, b, color, dash) => { ctx.strokeStyle = color; ctx.setLineDash(dash || []); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...S(a)); ctx.lineTo(...S(b)); ctx.stroke(); ctx.setLineDash([]); };
      if (state) {
        const chain = state.hull || state.chain || [];
        if (state.done && chain.length > 2) { ctx.fillStyle = 'rgba(255,146,43,0.12)'; ctx.beginPath(); chain.forEach((i, k) => (k ? ctx.lineTo(...S(i)) : ctx.moveTo(...S(i)))); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2.5; ctx.beginPath();
        chain.forEach((i, k) => (k ? ctx.lineTo(...S(i)) : ctx.moveTo(...S(i))));
        if (state.done) ctx.closePath();
        ctx.stroke();
        if (!state.done) {
          if (state.cand != null) line(state.from, state.cand, '#51cf66');
          if (state.check != null && state.from != null) line(state.from, state.check, '#ff6b6b', [5, 4]);
          else if (state.check != null && chain.length) line(chain[chain.length - 1], state.check, '#ff6b6b', [5, 4]);
        }
      }
      const onHull = new Set(state && (state.hull || state.chain) || []);
      pts.forEach((_, i) => { ctx.fillStyle = onHull.has(i) ? '#ff922b' : Theme.text; ctx.beginPath(); ctx.arc(...S(i), onHull.has(i) ? 4.5 : 3, 0, Math.PI * 2); ctx.fill(); });
      statsEl.replaceChildren(stat(I18n.t('points'), String(pts.length)), stat(I18n.t('corners of the hull'), done && state ? String((state.hull || []).length) : '—'),
        stat(I18n.t('steps'), String(steps)), stat(I18n.t('status'), I18n.t(done ? 'finished' : steps ? 'working…' : 'ready')));
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!lay) return;
      const [x, y] = canvasXY(cv, e), p = [(x - lay.pad) / lay.sx, (y - lay.pad) / lay.sy];
      if (p[0] >= 0 && p[1] >= 0 && p[0] <= 1 && p[1] <= 1) { pts.push(p); restart(); }
    });
    const algo = choose([['jarvis', 'Gift wrapping (Jarvis)'], ['monotone', 'Monotone chain (Andrew)']], () => P.algo, (v) => { P.algo = v; restart(); });
    const layout = choose([['disk', 'Points in a disc'], ['square', 'Points in a square'], ['gauss', 'Bell-shaped cloud']], () => P.layout, (v) => { P.layout = v; reset(); });
    const sliders = [slider('Points', 3, 500, () => P.n, (v) => { P.n = Math.round(v); reset(); }, { step: 1 }), slider('Steps per frame', 1, 200, () => P.speed, (v) => { P.speed = Math.round(v); }, { log: true, step: 1 })];
    reset();
    return {
      controls: [algo, layout, U.el('button', { type: 'button', class: 'small', onclick: reset }, 'New points')],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, sliders.map((s) => s.el)), statsEl, info,
        el('p', { class: 'hint' }, 'The convex hull is the shape a rubber band takes when stretched around all the points. Green: the best candidate so far. Red dashed: the point being checked. Orange: the hull being built. Click to add points; press Run to watch, or Step to go one comparison at a time.')),
      step, draw, reset, stepsPerFrame: true, onShow: () => sliders.forEach((s) => s.sync()),
    };
  }

  // ---------------------------------------------------------------- page
  const SIM_KEYWORDS = {
    boids: 'boids flocking birds swarm schwarm', ant: 'langton ant turmite ameise', sand: 'sandpile avalanche criticality sandhaufen', dla: 'dla aggregation crystal frost lightning kristall',
    ripple: 'waves interference double slit wellen', gas: 'ideal gas maxwell boltzmann brownian temperature pressure', grav: 'gravity n-body three body figure eight lagrange',
    sir: 'epidemic sir infection pandemic epidemie', prey: 'lotka volterra predator prey räuber beute', logi: 'logistic map chaos bifurcation cobweb feigenbaum',
    tsp: 'travelling salesman tsp annealing 2-opt route', hull: 'convex hull jarvis graham monotone konvexe hülle',
    life: 'conway cellular automaton', eca: 'rule 30 rule 110 wolfram', lsys: 'plant tree turtle', rd: 'turing gray scott', ulam: 'prime spiral',
    pend: 'double pendulum chaos swing period', proj: 'throw ballistic trajectory parabola air resistance', orbit: 'kepler planet gravity ellipse',
    epi: 'fourier draw circles dft', sort: 'bubble quicksort merge heap insertion selection', path: 'dijkstra a* astar bfs maze pathfinding',
  };
  const TABS = { life: ['Game of Life', lifeTab, 'Patterns'], eca: ['1D automata', ecaTab, 'Patterns'], lsys: ['L-systems', lsysTab, 'Patterns'], rd: ['Reaction–diffusion', rdTab, 'Patterns'], ulam: ['Ulam spiral', ulamTab, 'Patterns'],
    boids: ['Flocking', boidsTab, 'Patterns'], ant: ["Langton's ant", antTab, 'Patterns'], sand: ['Sandpile', sandTab, 'Patterns'], dla: ['Crystal growth', dlaTab, 'Patterns'],
    pend: ['Pendulums', pendulumTab, 'Physics'], proj: ['Projectile', projectileTab, 'Physics'], orbit: ['Orbits', orbitTab, 'Physics'], grav: ['Gravity', gravityTab, 'Physics'],
    ripple: ['Ripple tank', rippleTab, 'Physics'], gas: ['Gas in a box', gasTab, 'Physics'], epi: ['Fourier epicycles', epicycleTab, 'Physics'],
    sir: ['Epidemic', sirTab, 'Models'], prey: ['Predator & prey', preyTab, 'Models'], logi: ['Logistic map', logisticTab, 'Models'],
    sort: ['Sorting', sortTab, 'Algorithms'], path: ['Shortest paths', pathTab, 'Algorithms'], tsp: ['Travelling salesman', tspTab, 'Algorithms'], hull: ['Convex hull', hullTab, 'Algorithms'] };
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
    desc: '23 simulations: cellular automata, flocks, sandpiles and crystal growth; pendulums, orbits, waves and gases; epidemics and predators; sorting, paths, salesmen and hulls.',
    features: ['Flocking & Life', 'Waves & gravity', 'Epidemic & chaos', 'Algorithms'],
    commands: Object.entries(TABS).map(([k, [label, , g]]) => ({ label: `Simulation: ${label}`, keywords: `${g} ${k} ${SIM_KEYWORDS[k] || ''}`, run: () => { if (root) show(k); else st.tab = k; } })),
  });
  window.Sims = Sims;
})();

// Deep zoom via perturbation theory.
// One reference orbit Z_n is computed with BigInt fixed-point on the CPU. Each pixel then iterates only
// its small difference δ = S·w from that orbit on the GPU, where S is a per-pixel power-of-two scale kept
// as (mantissa, exponent) so δ never underflows. Rebasing (Zhuoran) swaps back to the start of the reference
// whenever the pixel gets closer to it, which avoids glitches with a single reference.
const Deep = (() => {
  const OK_FUNCS = new Set(['conj', 'abs', 're', 'im', 'sqr', 'inv', 'flip']);
  const OK_VARS = new Set(['z', 'c', 'k', 'x', 'y']);
  const SUPPORTED = '+ − × ÷, whole-number powers, conj, abs, re, im, sqr, inv, flip, and the variables z, c, k';

  // First thing in the tree that perturbation can't handle, or null.
  function unsupported(n, vars) {
    switch (n.t) {
      case 'num': return null;
      case 'var': return vars.has(n.name) ? null : n.name;
      case 'neg': return unsupported(n.a, vars);
      case 'call': return OK_FUNCS.has(n.f) ? n.args.map((a) => unsupported(a, vars)).find(Boolean) || null : n.f + '()';
      case 'bin':
        if (n.op === '^' && !(n.b.t === 'num' && n.b.im === 0 && Number.isInteger(n.b.re) && Math.abs(n.b.re) <= 64)) return 'non-integer powers';
        return unsupported(n.a, vars) || (n.op === '^' ? null : unsupported(n.b, vars));
    }
    return '?';
  }

  const cache = new Map();
  function analyze(def) {
    const key = [def.formula, def.init, def.julia, def.converge].join('\u0001');
    if (cache.has(key)) return cache.get(key);
    let res;
    try {
      if (def.converge) throw new Error('convergence stopping');
      const ast = Formula.ast(def.formula);
      const bad = unsupported(ast, OK_VARS);
      if (bad) throw new Error(`the formula uses ${bad}`);
      let initAst = null, initPixel = false;
      if (!def.julia) {
        const ia = Formula.ast(def.init || '0');
        if (ia.t === 'var' && (ia.name === 'p' || ia.name === 'c')) initPixel = true;
        else {
          const b = unsupported(ia, new Set(['k']));
          if (b) throw new Error(`the start value uses ${b}`);
          initAst = ia;
        }
      }
      res = { ok: true, ast, initAst, initPixel, code: codegen(ast), bla: blaCapable(ast, def.julia) };
    } catch (e) {
      res = { ok: false, reason: e.message };
    }
    if (cache.size > 50) cache.clear();
    cache.set(key, res);
    return res;
  }

  // ---------------------------------------------------------------- BLA (bilinear approximation)
  // While a pixel's delta δ is tiny, one step is almost linear: δ' ≈ A·δ + B·δc with A = ∂f/∂z and
  // B = ∂f/∂c at the reference point. Consecutive steps compose (A₂A₁, A₂B₁ + B₂), so a table of merged
  // steps covering 1, 2, 4, 8… iterations lets each pixel skip ahead whenever |δ| is inside the step's
  // validity radius R. A and B are 2×2 real matrices, so abs/conj/re/im formulas (Burning Ship, Tricorn,
  // Celtic) work too. In Mandelbrot mode c must enter separately from z (∂²f/∂z∂c = 0).
  // Self-contained so it can also run inside the orbit worker.
  function blaModule() {
    // BLA with 2×2 real matrices: δ' ≈ A·δ + B·δc, where A and B are the Jacobians of one step with
    // respect to z and c (as real 2-vectors). Complex-analytic formulas are the special case where A is a
    // rotation-and-scale; matrices also cover abs/conj/re/im (Burning Ship, Tricorn, Celtic…). abs() is
    // linear only while its argument keeps its sign, which adds a "kink" limit to the validity radius.
    // Matrices are [a, b, c, d] = [[a, b], [c, d]].
    const Z4 = [0, 0, 0, 0], I4 = [1, 0, 0, 1];
    const mm = (p, q) => [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];
    const madd = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
    const msub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
    const cm = (u) => [u[0], -u[1], u[1], u[0]]; // multiplication by complex u, as a matrix
    const cmulD = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const cdivD = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    // singular values of a 2×2 matrix
    function sv(p) {
      const T = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3];
      const D = Math.abs(p[0] * p[3] - p[1] * p[2]);
      const r = Math.sqrt(Math.max(0, T * T - 4 * D * D));
      return [Math.sqrt(Math.max(0, (T - r) / 2)), Math.sqrt((T + r) / 2)];
    }

    // Value plus Jacobians wrt z (J) and c (C). ctx.kink collects the abs() sign-change limit;
    // ctx.dc is the largest |δc| (0 in Julia mode).
    function ev(n, z, c, k, ctx) {
      switch (n.t) {
        case 'num': return { v: [n.re, n.im], J: Z4, C: Z4 };
        case 'var':
          if (n.name === 'z') return { v: z, J: I4, C: Z4 };
          if (n.name === 'c') return { v: c, J: Z4, C: I4 };
          if (n.name === 'k') return { v: k, J: Z4, C: Z4 };
          if (n.name === 'x') return { v: [z[0], 0], J: [1, 0, 0, 0], C: Z4 };
          if (n.name === 'y') return { v: [z[1], 0], J: [0, 1, 0, 0], C: Z4 };
          throw new Error('unsupported');
        case 'neg': { const a = ev(n.a, z, c, k, ctx); return { v: [-a.v[0], -a.v[1]], J: a.J.map((x) => -x), C: a.C.map((x) => -x) }; }
        case 'call': {
          const a = ev(n.args[0], z, c, k, ctx);
          switch (n.f) {
            case 'conj': return { v: [a.v[0], -a.v[1]], J: [a.J[0], a.J[1], -a.J[2], -a.J[3]], C: [a.C[0], a.C[1], -a.C[2], -a.C[3]] };
            case 're': return { v: [a.v[0], 0], J: [a.J[0], a.J[1], 0, 0], C: [a.C[0], a.C[1], 0, 0] };
            case 'im': return { v: [a.v[1], 0], J: [a.J[2], a.J[3], 0, 0], C: [a.C[2], a.C[3], 0, 0] };
            case 'flip': return { v: [a.v[1], a.v[0]], J: [a.J[2], a.J[3], a.J[0], a.J[1]], C: [a.C[2], a.C[3], a.C[0], a.C[1]] };
            case 'abs': {
              for (let i = 0; i < 2; i++) {
                const g = Math.hypot(a.J[i * 2], a.J[i * 2 + 1]), cg = Math.hypot(a.C[i * 2], a.C[i * 2 + 1]);
                const room = Math.abs(a.v[i]) - cg * ctx.dc;
                ctx.kink = Math.min(ctx.kink, room <= 0 ? 0 : g > 0 ? room / g : Infinity);
              }
              const s0 = a.v[0] < 0 ? -1 : 1, s1 = a.v[1] < 0 ? -1 : 1;
              return {
                v: [Math.abs(a.v[0]), Math.abs(a.v[1])],
                J: [s0 * a.J[0], s0 * a.J[1], s1 * a.J[2], s1 * a.J[3]],
                C: [s0 * a.C[0], s0 * a.C[1], s1 * a.C[2], s1 * a.C[3]],
              };
            }
            case 'sqr': return mul(a, a);
            case 'inv': return div({ v: [1, 0], J: Z4, C: Z4 }, a);
          }
          throw new Error('unsupported');
        }
        case 'bin': {
          const a = ev(n.a, z, c, k, ctx);
          if (n.op === '^') {
            let p = Math.abs(n.b.re), r = { v: [1, 0], J: Z4, C: Z4 }, b = a;
            while (p > 0) { if (p & 1) r = mul(r, b); p >>= 1; if (p) b = mul(b, b); }
            return n.b.re < 0 ? div({ v: [1, 0], J: Z4, C: Z4 }, r) : r;
          }
          const b = ev(n.b, z, c, k, ctx);
          if (n.op === '+') return { v: [a.v[0] + b.v[0], a.v[1] + b.v[1]], J: madd(a.J, b.J), C: madd(a.C, b.C) };
          if (n.op === '-') return { v: [a.v[0] - b.v[0], a.v[1] - b.v[1]], J: msub(a.J, b.J), C: msub(a.C, b.C) };
          if (n.op === '*') return mul(a, b);
          return div(a, b);
        }
      }
      throw new Error('unsupported');
    }
    function mul(a, b) {
      return { v: cmulD(a.v, b.v), J: madd(mm(cm(a.v), b.J), mm(cm(b.v), a.J)), C: madd(mm(cm(a.v), b.C), mm(cm(b.v), a.C)) };
    }
    function div(a, b) {
      // d(a/b) = (da − q·db) / b
      const q = cdivD(a.v, b.v), ib = cm(cdivD([1, 0], b.v)), cq = cm(q);
      return { v: q, J: mm(ib, msub(a.J, mm(cq, b.J))), C: mm(ib, msub(a.C, mm(cq, b.C))) };
    }

    function blaCapable(ast, julia) {
      // abs() folds the plane; for folding formulas (Burning Ship, Celtic…) perturbation itself is
      // ill-conditioned at depth, so skipping is left off rather than stacked on top of that.
      const hasAbs = (n) => (n.t === 'call' && n.f === 'abs') || (n.a && hasAbs(n.a)) || (n.b && hasAbs(n.b)) || (n.args && n.args.some(hasAbs));
      if (hasAbs(ast)) return false;
      try {
        const k = [0.3, -0.2], c = [-0.61, 0.37];
        const zs = [[0.13, 0.41], [-0.77, 0.25], [0.52, -0.66]];
        const r = zs.map((z) => ev(ast, z, c, k, { kink: Infinity, dc: 0 }));
        if (!r.every((x) => [...x.v, ...x.J, ...x.C].every(Number.isFinite))) return false;
        if (julia) return true;
        // ∂f/∂c must not depend on z (otherwise δ·δc terms break the linear step)
        const s = Math.max(1, ...r[0].C.map(Math.abs));
        return r.every((x) => x.C.every((v, i) => Math.abs(v - r[0].C[i]) < 1e-9 * s));
      } catch {
        return false;
      }
    }

    // Matrices with an extra binary exponent so merged steps never overflow.
    function feN(m, e) {
      const mx = Math.max(Math.abs(m[0]), Math.abs(m[1]), Math.abs(m[2]), Math.abs(m[3]));
      if (!(mx > 0) || !isFinite(mx)) return { m: Z4, e: -30000 };
      const s = Math.floor(Math.log2(mx)) + 1, f = 2 ** -s;
      return { m: [m[0] * f, m[1] * f, m[2] * f, m[3] * f], e: e + s };
    }
    const feMul = (a, b) => feN(mm(a.m, b.m), a.e + b.e);
    function feAdd(a, b) {
      if (a.e <= -30000) return b;
      if (b.e <= -30000) return a;
      const E = Math.max(a.e, b.e);
      const fa = a.e - E < -1000 ? 0 : 2 ** (a.e - E), fb = b.e - E < -1000 ? 0 : 2 ** (b.e - E);
      return feN([0, 1, 2, 3].map((i) => a.m[i] * fa + b.m[i] * fb), E);
    }
    const feNormLog2 = (a) => (a.e <= -30000 ? -Infinity : Math.log2(sv(a.m)[1]) + a.e);

    // Builds the merged-step table for a reference orbit.
    // zd: orbit as doubles [re0, im0, re1, im1, …]; ldc: log2 of the largest |δc| in the image.
    function buildBLA(an, def, zd, len, cRef, ldc, eps = 2 ** -24) {
      const k = [+def.k[0] || 0, +def.k[1] || 0];
      const c = def.julia ? [+def.juliaC[0], +def.juliaC[1]] : cRef;
      const dc = def.julia ? 0 : 2 ** Math.max(-1070, ldc);
      const lvl0 = [];
      for (let m = 1; m < len; m++) {
        const z = [zd[m * 2], zd[m * 2 + 1]];
        const ctx = { kink: Infinity, dc };
        let r, H = 0;
        try {
          r = ev(an.ast, z, c, k, ctx);
          // second-derivative bound from central differences of the Jacobian
          const h = 2 ** -20 * Math.max(1, Math.hypot(z[0], z[1]));
          for (const e of [[h, 0], [0, h]]) {
            const p = ev(an.ast, [z[0] + e[0], z[1] + e[1]], c, k, { kink: Infinity, dc: 0 });
            const q = ev(an.ast, [z[0] - e[0], z[1] - e[1]], c, k, { kink: Infinity, dc: 0 });
            H = Math.max(H, sv(msub(p.J, q.J))[1] / (2 * h));
          }
        } catch {
          return null;
        }
        const smin = sv(r.J)[0];
        const Rq = !(smin > 0) ? 0 : H > 1e-300 ? (2 * eps * smin) / H : Infinity;
        const R = Math.min(Rq, ctx.kink);
        lvl0.push({ A: feN(r.J, 0), B: def.julia ? feN(Z4, 0) : feN(r.C, 0), logR: R > 0 ? Math.log2(R) : -Infinity });
      }
      const levels = [lvl0];
      const lt = def.julia ? -Infinity : ldc;
      while (levels.length < 24) {
        const prev = levels[levels.length - 1];
        if (prev.length < 2) break;
        const next = [];
        for (let j = 0; j + 1 < prev.length; j += 2) {
          const x = prev[j], y = prev[j + 1];
          // R = min(Rx, (Ry − ‖Bx‖·dcMax) / ‖Ax‖), all in log2
          const lb = feNormLog2(x.B) + lt;
          let cand = lb >= y.logR ? -Infinity : y.logR + (lb === -Infinity ? 0 : Math.log2(1 - 2 ** (lb - y.logR)));
          cand -= feNormLog2(x.A);
          next.push({ A: feMul(y.A, x.A), B: feAdd(feMul(y.A, x.B), y.B), logR: Math.min(x.logR, cand) });
        }
        levels.push(next);
      }
      const total = levels.reduce((s, l) => s + l.length, 0);
      const W = 4096, rows = Math.max(1, Math.ceil((total * 3) / W));
      const data = new Float32Array(W * rows * 4);
      const offsets = [];
      let g = 0;
      for (const l of levels) {
        offsets.push(g);
        for (const e of l) {
          const lr = Number.isFinite(e.logR) ? Math.max(-1e30, Math.min(1e30, e.logR)) : e.logR > 0 ? 1e30 : -1e30;
          data.set([...e.A.m, ...e.B.m, e.A.e, e.B.e, lr, 0], g * 12);
          g++;
        }
      }
      return { data, rows, offsets, levels: levels.length, count: total };
    }

    return { buildBLA, blaCapable };
  }
  const { buildBLA, blaCapable } = blaModule();

  // ---------------------------------------------------------------- GLSL for the delta iteration
  // Every node yields a reference value (…r, plain float) and a delta in S units (…w).
  function codegen(ast) {
    const lines = [];
    let k = 0;
    const f = Formula.f;
    const emit = (r, w) => { const t = 't' + k++; lines.push(`vec2 ${t}r = ${r}; vec2 ${t}w = ${w};`); return t; };
    const mul = (A, B) => emit(`cmul(${A}r, ${B}r)`, `cmul(${A}r, ${B}w) + cmul(${A}w, ${B}r) + cmul(Sf * ${A}w, ${B}w)`);
    const div = (A, B) => emit(`cdiv(${A}r, ${B}r)`, `cdiv(cmul(${A}w, ${B}r) - cmul(${A}r, ${B}w), cmul(${B}r, ${B}r + Sf * ${B}w))`);
    const one = () => emit('vec2(1.0, 0.0)', 'vec2(0.0)');
    function powi(A, n) {
      if (n === 0) return one();
      if (n < 0) return div(one(), powi(A, -n));
      let result = null, base = A;
      while (n > 0) {
        if (n & 1) result = result ? mul(result, base) : base;
        n >>= 1;
        if (n) base = mul(base, base);
      }
      return result;
    }
    function g(n) {
      switch (n.t) {
        case 'num': return emit(`vec2(${f(n.re)}, ${f(n.im)})`, 'vec2(0.0)');
        case 'var':
          if (n.name === 'z') return 'zz';
          if (n.name === 'c') return 'cc';
          if (n.name === 'k') return 'kk';
          if (n.name === 'x') return emit('vec2(zzr.x, 0.0)', 'vec2(zzw.x, 0.0)');
          return emit('vec2(zzr.y, 0.0)', 'vec2(zzw.y, 0.0)');
        case 'neg': { const A = g(n.a); return emit(`-${A}r`, `-${A}w`); }
        case 'call': {
          const A = g(n.args[0]);
          switch (n.f) {
            case 'conj': return emit(`cconj(${A}r)`, `cconj(${A}w)`);
            case 're': return emit(`vec2(${A}r.x, 0.0)`, `vec2(${A}w.x, 0.0)`);
            case 'im': return emit(`vec2(${A}r.y, 0.0)`, `vec2(${A}w.y, 0.0)`);
            case 'flip': return emit(`${A}r.yx`, `${A}w.yx`);
            case 'sqr': return mul(A, A);
            case 'inv': return div(one(), A);
            case 'abs': {
              const Xs = A === 'zz' ? 'Zs' : `divS(${A}r, sm, se)`;
              const t = emit(`abs(${A}r)`, 'vec2(0.0)');
              lines.push(`{ vec2 xs = ${Xs}; ${t}w = vec2(diffabs(xs.x, ${A}w.x), diffabs(xs.y, ${A}w.y)); }`);
              return t;
            }
          }
          break;
        }
        case 'bin': {
          if (n.op === '^') return powi(g(n.a), n.b.re);
          const realConst = (x) => x.t === 'num' && x.im === 0;
          if (n.op === '*' && realConst(n.a)) { const B = g(n.b); return emit(`${f(n.a.re)} * ${B}r`, `${f(n.a.re)} * ${B}w`); }
          if (n.op === '*' && realConst(n.b)) { const A = g(n.a); return emit(`${A}r * ${f(n.b.re)}`, `${A}w * ${f(n.b.re)}`); }
          const A = g(n.a), B = g(n.b);
          if (n.op === '+' || n.op === '-') return emit(`${A}r ${n.op} ${B}r`, `${A}w ${n.op} ${B}w`);
          if (n.op === '*') return mul(A, B);
          if (n.op === '/') return div(A, B);
        }
      }
      throw new Error('unsupported node');
    }
    const out = g(ast);
    return { code: lines.join('\n    '), out: out + 'w' };
  }

  // ---------------------------------------------------------------- reference orbit (BigInt)
  // Self-contained so it can be stringified into a Web Worker.
  function orbitModule() {
    function ldexp(m, e) {
      while (e > 1000) { m *= 2 ** 1000; e -= 1000; }
      while (e < -1000) { m *= 2 ** -1000; e += 1000; }
      return m * 2 ** e;
    }
    function bitLen(n) {
      if (n < 0n) n = -n;
      if (n === 0n) return 0;
      const h = n.toString(16);
      return (h.length - 1) * 4 + (32 - Math.clz32(parseInt(h[0], 16)));
    }
    function fromDouble(d, P) {
      if (!d) return 0n;
      const ev = Math.floor(Math.log2(Math.abs(d)));
      const s = 52 - ev;
      const iv = BigInt(Math.round(ldexp(d, s)));
      const shift = P - s;
      return shift >= 0 ? iv << BigInt(shift) : iv >> BigInt(-shift);
    }
    const bP = (P) => BigInt(P);

    function evaluate(n, env, P, consts) {
      const B = bP(P);
      switch (n.t) {
        case 'num': {
          let v = consts.get(n);
          if (!v) { v = [fromDouble(n.re, P), fromDouble(n.im, P)]; consts.set(n, v); }
          return v;
        }
        case 'var': return env[n.name];
        case 'neg': { const a = evaluate(n.a, env, P, consts); return [-a[0], -a[1]]; }
        case 'call': {
          const a = evaluate(n.args[0], env, P, consts);
          switch (n.f) {
            case 'conj': return [a[0], -a[1]];
            case 'abs': return [a[0] < 0n ? -a[0] : a[0], a[1] < 0n ? -a[1] : a[1]];
            case 're': return [a[0], 0n];
            case 'im': return [a[1], 0n];
            case 'flip': return [a[1], a[0]];
            case 'sqr': return csqr(a, B);
            case 'inv': return cdiv([1n << B, 0n], a, B);
          }
          throw new Error('bad call');
        }
        case 'bin': {
          const a = evaluate(n.a, env, P, consts);
          if (n.op === '^') return cpow(a, n.b.re, B);
          const b = evaluate(n.b, env, P, consts);
          switch (n.op) {
            case '+': return [a[0] + b[0], a[1] + b[1]];
            case '-': return [a[0] - b[0], a[1] - b[1]];
            case '*': return cmul(a, b, B);
            case '/': return cdiv(a, b, B);
          }
        }
      }
      throw new Error('bad node');
    }
    const cmul = (a, b, B) => [(a[0] * b[0] - a[1] * b[1]) >> B, (a[0] * b[1] + a[1] * b[0]) >> B];
    // Squaring with 2 big multiplications instead of 4: (x+y)(x−y) and 2xy.
    const csqr = (a, B) => [((a[0] + a[1]) * (a[0] - a[1])) >> B, (a[0] * a[1]) >> (B - 1n)];
    function cdiv(a, b, B) {
      const den = b[0] * b[0] + b[1] * b[1];
      if (den === 0n) return [0n, 0n];
      return [((a[0] * b[0] + a[1] * b[1]) << B) / den, ((a[1] * b[0] - a[0] * b[1]) << B) / den];
    }
    function cpow(a, n, B) {
      if (n === 0) return [1n << B, 0n];
      if (n < 0) return cdiv([1n << B, 0n], cpow(a, -n, B), B);
      let r = null, base = a;
      while (n > 0) {
        if (n & 1) r = r ? cmul(r, base, B) : base;
        n >>= 1;
        if (n) base = csqr(base, B);
      }
      return r;
    }
    // Complex value -> (mantissa re, mantissa im, shared binary exponent)
    function toFE(z, P) {
      // Fast path: values that aren't tiny convert with one shift, no string/bit-length work.
      const fsh = P - 62;
      if (fsh > 0) {
        const bs = BigInt(fsh);
        const vr = Number(z[0] >> bs), vi = Number(z[1] >> bs);
        const mx = Math.max(Math.abs(vr), Math.abs(vi));
        if (mx >= 2 ** 30 && mx < 2 ** 1000) {
          const s = Math.floor(Math.log2(mx)) + 1;
          return [vr * 2 ** -s, vi * 2 ** -s, s - 62];
        }
      }
      const a = z[0] < 0n ? -z[0] : z[0], b = z[1] < 0n ? -z[1] : z[1];
      const big = a > b ? a : b;
      if (big === 0n) return [0, 0, -30000];
      const sh = bitLen(big) - 53;
      const mr = sh > 0 ? Number(z[0] >> BigInt(sh)) : Number(z[0]) * 2 ** -sh;
      const mi = sh > 0 ? Number(z[1] >> BigInt(sh)) : Number(z[1]) * 2 ** -sh;
      return [mr / 2 ** 53, mi / 2 ** 53, sh - P + 53];
    }

    // job: { ast, initAst, initPixel, julia, juliaC, k, x, y (BigInt, P bits), P, maxIter, bailout }
    return function computeOrbit(job) {
      const { P, maxIter } = job;
      const consts = new Map();
      const ref = [job.x, job.y];
      const k = [fromDouble(job.k[0], P), fromDouble(job.k[1], P)];
      let c, z;
      if (job.julia) {
        c = [fromDouble(job.juliaC[0], P), fromDouble(job.juliaC[1], P)];
        z = ref;
      } else {
        c = ref;
        z = job.initPixel ? ref : evaluate(job.initAst, { k }, P, consts);
      }
      const W = 4096;
      const rows = job.f64 ? 0 : Math.ceil((maxIter + 1) / W);
      // f64: plain doubles for CPU use (exploration); otherwise float mantissa + exponent for the GPU.
      const data = job.f64 ? new Float64Array((maxIter + 1) * 2) : new Float32Array(W * rows * 4);
      // zd: the orbit as doubles (for the BLA table); in f64 mode that's the data itself.
      const zd = job.f64 ? data : new Float64Array((maxIter + 1) * 2);
      const put = job.f64
        ? (i, v) => { const f = toFE(v, P); data[i * 2] = ldexp(f[0], f[2]); data[i * 2 + 1] = ldexp(f[1], f[2]); }
        : (i, v) => {
          const f = toFE(v, P);
          const o = i * 4;
          data[o] = f[0]; data[o + 1] = f[1]; data[o + 2] = f[2];
          zd[i * 2] = ldexp(f[0], f[2]); zd[i * 2 + 1] = ldexp(f[1], f[2]);
        };
      put(0, z);
      const z0 = toFE(z, P);
      const R2 = fromDouble(Math.max(4, job.bailout * job.bailout), 2 * P);
      let len = 0, escaped = false;
      const env = { c, k, z: null, x: null, y: null };
      for (let i = 1; i <= maxIter; i++) {
        env.z = z; env.x = [z[0], 0n]; env.y = [z[1], 0n];
        z = evaluate(job.ast, env, P, consts);
        put(i, z);
        len = i;
        if (z[0] * z[0] + z[1] * z[1] > R2) { escaped = true; break; }
      }
      const approx = (v) => Number(v >> BigInt(P - 60)) / 2 ** 60;
      return { data, zd, len, rows, escaped, maxIter, z0, cApprox: [approx(c[0]), approx(c[1])] };
    };
  }

  const computeOrbit = orbitModule();

  // Orbit plus (when the formula allows it) the BLA step table. Same logic runs inside the worker.
  function computeWithBla(job) {
    const r = computeOrbit(job);
    if (job.bla) r.bla = Object.assign(buildBLA({ ast: job.ast }, job.bla, r.zd, r.len, r.cApprox, job.bla.ldc) || {}, { ldc: job.bla.ldc });
    return r;
  }

  function makeJob(def, an, pv, maxIter, extraBits = 32) {
    const P = pv.P + extraBits;
    const sh = BigInt(extraBits);
    return {
      ast: an.ast, initAst: an.initAst, initPixel: an.initPixel, julia: !!def.julia,
      juliaC: def.juliaC, k: def.k, x: pv.x << sh, y: pv.y << sh, P, maxIter, bailout: def.bailout,
      // The table is built for |δc| up to 8 view-heights around this centre (covers the viewport + margin).
      bla: an.bla ? { julia: !!def.julia, k: def.k, juliaC: def.juliaC, ldc: pv.L + 3 } : null,
    };
  }

  // ---------------------------------------------------------------- worker (cancellable)
  let worker = null, workerUrl = null, busyId = 0, seq = 0;
  function requestOrbit(job, cb) {
    if (worker && busyId) { worker.terminate(); worker = null; }
    if (!worker) {
      if (!workerUrl) {
        const src = `const computeOrbit = (${orbitModule.toString()})();
          const { buildBLA } = (${blaModule.toString()})();
          ${computeWithBla.toString()}
          onmessage = (e) => {
            const r = computeWithBla(e.data.job);
            const t = [r.data.buffer];
            if (r.zd !== r.data) t.push(r.zd.buffer);
            if (r.bla && r.bla.data) t.push(r.bla.data.buffer);
            postMessage({ id: e.data.id, r }, t);
          };`;
        workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      }
      try {
        worker = new Worker(workerUrl);
      } catch {
        worker = null;
      }
    }
    const id = ++seq;
    busyId = id;
    if (!worker) { // no worker support: compute inline on the next tick
      setTimeout(() => { if (busyId === id) { busyId = 0; cb(computeWithBla(job)); } }, 0);
      return;
    }
    worker.onmessage = (e) => {
      if (e.data.id !== busyId) return;
      busyId = 0;
      cb(e.data.r);
    };
    worker.postMessage({ id, job });
  }

  return { analyze, computeOrbit, computeWithBla, makeJob, requestOrbit, buildBLA, SUPPORTED };
})();

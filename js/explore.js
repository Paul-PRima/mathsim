// "Find an interesting spot": samples points in the current view on the CPU and picks the one that
// takes longest to escape (i.e. sits closest to the fractal's boundary, where the detail is).
const Explore = (() => {
  // ---------------------------------------------------------------- complex helpers returning [re, im]
  const H = {
    div(ar, ai, br, bi) { const d = br * br + bi * bi; return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d]; },
    powi(ar, ai, n) {
      let rr = 1, ri = 0, br = ar, bi = ai, m = Math.abs(n);
      while (m > 0) {
        if (m & 1) { const t = rr * br - ri * bi; ri = rr * bi + ri * br; rr = t; }
        const t = br * br - bi * bi; bi = 2 * br * bi; br = t;
        m >>= 1;
      }
      return n < 0 ? H.div(1, 0, rr, ri) : [rr, ri];
    },
    powr(ar, ai, p) {
      const r = Math.hypot(ar, ai);
      if (!r) return [0, 0];
      const th = Math.atan2(ai, ar) * p, rp = Math.pow(r, p);
      return [rp * Math.cos(th), rp * Math.sin(th)];
    },
    exp(ar, ai) { const e = Math.exp(ar); return [e * Math.cos(ai), e * Math.sin(ai)]; },
    log(ar, ai) { return [Math.log(Math.hypot(ar, ai)), Math.atan2(ai, ar)]; },
    cpow(ar, ai, br, bi) {
      if (!ar && !ai) return [0, 0];
      const l = H.log(ar, ai);
      return H.exp(l[0] * br - l[1] * bi, l[0] * bi + l[1] * br);
    },
    sqrt(ar, ai) { const r = Math.hypot(ar, ai); return [Math.sqrt(Math.max(0, (r + ar) / 2)), (ai < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - ar) / 2))]; },
    sin(ar, ai) { return [Math.sin(ar) * Math.cosh(ai), Math.cos(ar) * Math.sinh(ai)]; },
    cos(ar, ai) { return [Math.cos(ar) * Math.cosh(ai), -Math.sin(ar) * Math.sinh(ai)]; },
    tan(ar, ai) { const s = H.sin(ar, ai), c = H.cos(ar, ai); return H.div(s[0], s[1], c[0], c[1]); },
    sinh(ar, ai) { return [Math.sinh(ar) * Math.cos(ai), Math.cosh(ar) * Math.sin(ai)]; },
    cosh(ar, ai) { return [Math.cosh(ar) * Math.cos(ai), Math.sinh(ar) * Math.sin(ai)]; },
    tanh(ar, ai) { const s = H.sinh(ar, ai), c = H.cosh(ar, ai); return H.div(s[0], s[1], c[0], c[1]); },
    asin(ar, ai) { const s = H.sqrt(1 - (ar * ar - ai * ai), -2 * ar * ai); const l = H.log(-ai + s[0], ar + s[1]); return [l[1], -l[0]]; },
    acos(ar, ai) { const s = H.sqrt(1 - (ar * ar - ai * ai), -2 * ar * ai); const l = H.log(ar - s[1], ai + s[0]); return [l[1], -l[0]]; },
    atan(ar, ai) { const q = H.div(ar, 1 + ai, -ar, 1 - ai); const l = H.log(q[0], q[1]); return [-l[1] / 2, l[0] / 2]; },
  };

  // ---------------------------------------------------------------- formula -> JS (doubles)
  function genJS(ast, vars) {
    const lines = [];
    let k = 0;
    const lit = (v) => `(${v})`;
    const tmp = (re, im) => { const t = 't' + k++; lines.push(`const ${t}r = ${re}, ${t}i = ${im};`); return [t + 'r', t + 'i']; };
    const call = (expr) => { const t = 't' + k++; lines.push(`const ${t} = ${expr}; const ${t}r = ${t}[0], ${t}i = ${t}[1];`); return [t + 'r', t + 'i']; };
    const mul = (a, b) => tmp(`${a[0]} * ${b[0]} - ${a[1]} * ${b[1]}`, `${a[0]} * ${b[1]} + ${a[1]} * ${b[0]}`);
    function g(n) {
      switch (n.t) {
        case 'num': return [lit(n.re), lit(n.im)];
        case 'var':
          if (!(n.name in vars)) throw new Error(`unknown name ${n.name}`);
          return vars[n.name];
        case 'neg': { const a = g(n.a); return tmp(`-${a[0]}`, `-${a[1]}`); }
        case 'call': {
          const a = g(n.args[0]);
          switch (n.f) {
            case 'conj': return tmp(a[0], `-${a[1]}`);
            case 'abs': return tmp(`Math.abs(${a[0]})`, `Math.abs(${a[1]})`);
            case 're': return tmp(a[0], '0');
            case 'im': return tmp(a[1], '0');
            case 'arg': return tmp(`Math.atan2(${a[1]}, ${a[0]})`, '0');
            case 'mag': return tmp(`Math.hypot(${a[0]}, ${a[1]})`, '0');
            case 'norm': return tmp(`${a[0]} * ${a[0]} + ${a[1]} * ${a[1]}`, '0');
            case 'flip': return tmp(a[1], a[0]);
            case 'floor': return tmp(`Math.floor(${a[0]})`, `Math.floor(${a[1]})`);
            case 'round': return tmp(`Math.floor(${a[0]} + 0.5)`, `Math.floor(${a[1]} + 0.5)`);
            case 'sqr': return mul(a, a);
            case 'inv': return call(`H.div(1, 0, ${a[0]}, ${a[1]})`);
            case 'ln': return call(`H.log(${a[0]}, ${a[1]})`);
            case 'pow': { const b = g(n.args[1]); return call(`H.cpow(${a[0]}, ${a[1]}, ${b[0]}, ${b[1]})`); }
            default: return call(`H.${n.f}(${a[0]}, ${a[1]})`);
          }
        }
        case 'bin': {
          const a = g(n.a);
          if (n.op === '^') {
            if (n.b.t === 'num' && n.b.im === 0) {
              if (Number.isInteger(n.b.re)) return n.b.re === 2 ? mul(a, a) : call(`H.powi(${a[0]}, ${a[1]}, ${n.b.re})`);
              return call(`H.powr(${a[0]}, ${a[1]}, ${n.b.re})`);
            }
            const b = g(n.b);
            return call(`H.cpow(${a[0]}, ${a[1]}, ${b[0]}, ${b[1]})`);
          }
          const b = g(n.b);
          if (n.op === '+' || n.op === '-') return tmp(`${a[0]} ${n.op} ${b[0]}`, `${a[1]} ${n.op} ${b[1]}`);
          if (n.op === '*') return mul(a, b);
          return call(`H.div(${a[0]}, ${a[1]}, ${b[0]}, ${b[1]})`);
        }
      }
      throw new Error('bad node');
    }
    const out = g(ast);
    return { code: lines.join('\n'), out };
  }

  const directCache = new Map();
  // Returns f(pr, pi, maxIter, time) -> iteration at which the orbit stopped, or -1 if it never did.
  function compileDirect(def) {
    const key = JSON.stringify([def.formula, def.init, def.julia, def.juliaC, def.k, def.bailout, def.escape, def.converge, def.epsilon]);
    if (directCache.has(key)) return directCache.get(key);
    const vars = {
      z: ['zr', 'zi'], c: ['cr', 'ci'], zp: ['qr', 'qi'], p: ['pr', 'pi'], n: ['n', '0'],
      t: ['T', '0'], k: ['KR', 'KI'], x: ['zr', '0'], y: ['zi', '0'],
    };
    const f = genJS(Formula.ast(def.formula), vars);
    const init = genJS(Formula.ast(def.init || '0'), { p: ['pr', 'pi'], c: ['cr', 'ci'], k: ['KR', 'KI'], t: ['T', '0'] });
    const src = `
      const KR = ${+def.k[0]}, KI = ${+def.k[1]}, B2 = ${def.bailout * def.bailout}, EPS = ${def.epsilon};
      return function (pr, pi, maxIter, T) {
        let cr, ci, zr, zi;
        if (${def.julia ? 'true' : 'false'}) { cr = ${+def.juliaC[0]}; ci = ${+def.juliaC[1]}; zr = pr; zi = pi; }
        else { cr = pr; ci = pi; ${init.code} zr = ${init.out[0]}; zi = ${init.out[1]}; }
        let qr = zr, qi = zi;
        for (let n = 0; n < maxIter; n++) {
          ${f.code}
          qr = zr; qi = zi; zr = ${f.out[0]}; zi = ${f.out[1]};
          const m = zr * zr + zi * zi;
          if (${def.escape ? '!(m <= B2)' : '!(m === m)'}) return n;
          if (${def.converge ? 'true' : 'false'} && (zr - qr) * (zr - qr) + (zi - qi) * (zi - qi) < EPS) return n;
        }
        return -1;
      };`;
    const fn = new Function('H', src)(H);
    if (directCache.size > 20) directCache.clear();
    directCache.set(key, fn);
    return fn;
  }

  // ---------------------------------------------------------------- perturbation on the CPU (deep zoom)
  // Each node evaluates to [refRe, refIm, deltaRe, deltaIm]; deltas are absolute doubles.
  function compileDelta(ast) {
    function g(n) {
      switch (n.t) {
        case 'num': return () => [n.re, n.im, 0, 0];
        case 'var':
          if (n.name === 'z') return (e) => [e.Zr, e.Zi, e.wr, e.wi];
          if (n.name === 'c') return (e) => [e.Cr, e.Ci, e.dr, e.di];
          if (n.name === 'k') return (e) => [e.Kr, e.Ki, 0, 0];
          if (n.name === 'x') return (e) => [e.Zr, 0, e.wr, 0];
          return (e) => [e.Zi, 0, e.wi, 0];
        case 'neg': { const a = g(n.a); return (e) => { const A = a(e); return [-A[0], -A[1], -A[2], -A[3]]; }; }
        case 'call': {
          const a = g(n.args[0]);
          switch (n.f) {
            case 'conj': return (e) => { const A = a(e); return [A[0], -A[1], A[2], -A[3]]; };
            case 're': return (e) => { const A = a(e); return [A[0], 0, A[2], 0]; };
            case 'im': return (e) => { const A = a(e); return [A[1], 0, A[3], 0]; };
            case 'flip': return (e) => { const A = a(e); return [A[1], A[0], A[3], A[2]]; };
            case 'abs': return (e) => { const A = a(e); return [Math.abs(A[0]), Math.abs(A[1]), diffabs(A[0], A[2]), diffabs(A[1], A[3])]; };
            case 'sqr': return (e) => { const A = a(e); return mulD(A, A); };
            case 'inv': return (e) => divD([1, 0, 0, 0], a(e));
          }
          break;
        }
        case 'bin': {
          const a = g(n.a);
          if (n.op === '^') {
            const p = n.b.re;
            return (e) => {
              const A = a(e);
              let r = [1, 0, 0, 0], b = A, m = Math.abs(p);
              while (m > 0) { if (m & 1) r = mulD(r, b); m >>= 1; if (m) b = mulD(b, b); }
              return p < 0 ? divD([1, 0, 0, 0], r) : r;
            };
          }
          const b = g(n.b);
          if (n.op === '+') return (e) => { const A = a(e), B = b(e); return [A[0] + B[0], A[1] + B[1], A[2] + B[2], A[3] + B[3]]; };
          if (n.op === '-') return (e) => { const A = a(e), B = b(e); return [A[0] - B[0], A[1] - B[1], A[2] - B[2], A[3] - B[3]]; };
          if (n.op === '*') return (e) => mulD(a(e), b(e));
          if (n.op === '/') return (e) => divD(a(e), b(e));
        }
      }
      throw new Error('unsupported');
    }
    return g(ast);
  }
  function diffabs(X, x) {
    if (X >= 0) return X + x >= 0 ? x : -(2 * X + x);
    return X + x > 0 ? 2 * X + x : -x;
  }
  function mulD(A, B) {
    // (A + a)(B + b) - AB = A b + a B + a b
    const wr = A[0] * B[2] - A[1] * B[3] + A[2] * B[0] - A[3] * B[1] + A[2] * B[2] - A[3] * B[3];
    const wi = A[0] * B[3] + A[1] * B[2] + A[2] * B[1] + A[3] * B[0] + A[2] * B[3] + A[3] * B[2];
    return [A[0] * B[0] - A[1] * B[1], A[0] * B[1] + A[1] * B[0], wr, wi];
  }
  function divD(A, B) {
    // (A + a)/(B + b) - A/B = (a B - A b) / (B (B + b))
    const R = H.div(A[0], A[1], B[0], B[1]);
    const nr = A[2] * B[0] - A[3] * B[1] - (A[0] * B[2] - A[1] * B[3]);
    const ni = A[2] * B[1] + A[3] * B[0] - (A[0] * B[3] + A[1] * B[2]);
    const sr = B[0] + B[2], si = B[1] + B[3];
    const dr = B[0] * sr - B[1] * si, di = B[0] * si + B[1] * sr;
    const W = H.div(nr, ni, dr, di);
    return [R[0], R[1], W[0], W[1]];
  }

  // ---------------------------------------------------------------- spot finding
  // Returns { qx, qy, n } in normalized screen coordinates of the view, or null.
  function findSpot(def, pv, aspect, iter, samples = 500) {
    const cs = Math.cos(pv.rot), sn = Math.sin(pv.rot);
    const pts = [];
    for (let i = 0; i < samples; i++) pts.push([U.rand(-0.92, 0.92) * aspect, U.rand(-0.92, 0.92)]);
    let best = null;
    const consider = (q, n) => { if (n >= 0 && (!best || n > best.n)) best = { qx: q[0], qy: q[1], n }; };

    if (pv.L > -44) {
      const fn = compileDirect(def);
      const v = HP.approx(pv);
      for (const q of pts) {
        const px = v.cx + (q[0] * cs - q[1] * sn) * v.scale, py = v.cy + (q[0] * sn + q[1] * cs) * v.scale;
        consider(q, fn(px, py, iter, 0));
      }
      return best;
    }

    const an = Deep.analyze(def);
    if (!an.ok || pv.L < -990) return null; // deltas would underflow doubles
    const job = Object.assign(Deep.makeJob(def, an, pv, iter), { f64: true });
    const o = Deep.computeOrbit(job);
    const Z = o.data, len = o.len;
    const z0r = Z[0], z0i = Z[1];
    const cref = def.julia ? def.juliaC : o.cApprox;
    const F = compileDelta(an.ast);
    const scale = 2 ** pv.L, B2 = def.bailout * def.bailout;
    const e = { Zr: 0, Zi: 0, wr: 0, wi: 0, Cr: cref[0], Ci: cref[1], dr: 0, di: 0, Kr: def.k[0], Ki: def.k[1] };
    for (const q of pts) {
      const dx = (q[0] * cs - q[1] * sn) * scale, dy = (q[0] * sn + q[1] * cs) * scale;
      if (def.julia) { e.dr = 0; e.di = 0; e.wr = dx; e.wi = dy; }
      else { e.dr = dx; e.di = dy; e.wr = an.initPixel ? dx : 0; e.wi = an.initPixel ? dy : 0; }
      let m = 0, stop = -1;
      for (let n = 0; n < iter; n++) {
        e.Zr = Z[m * 2]; e.Zi = Z[m * 2 + 1];
        const r = F(e);
        e.wr = r[2]; e.wi = r[3];
        m++;
        const zr = Z[m * 2] + e.wr, zi = Z[m * 2 + 1] + e.wi;
        const m2 = zr * zr + zi * zi;
        if (!(m2 <= B2)) { stop = n; break; }
        const rr = zr - z0r, ri = zi - z0i;
        if (m >= len || rr * rr + ri * ri < e.wr * e.wr + e.wi * e.wi) { e.wr = rr; e.wi = ri; m = 0; }
      }
      consider(q, stop);
    }
    return best;
  }

  return { findSpot, compileDirect, H };
})();

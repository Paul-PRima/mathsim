// Real-number expression engine shared by the calculator, grapher, statistics, matrices and tools.
//   MX.parse(src)                  -> AST
//   MX.compile(ast, locals, scope) -> { fn, free }   fn takes the locals as arguments; free = unknown names
//   MX.evaluate(src, scope)        -> number
// Also special functions and probability distributions (MX.S, MX.DIST), numeric calculus and number
// formatting (MX.fmt, MX.fraction, MX.altForms).
const MX = (() => {
  class MathError extends Error {
    constructor(msg, pos) {
      super(msg);
      this.pos = pos;
    }
  }

  // ---------------------------------------------------------------- special functions
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(x) {
    if (Number.isInteger(x) && x <= 0) return NaN;
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    if (Number.isInteger(x) && x <= 171) return FACT[x - 1];
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x / 2 + 0.25) * Math.exp(-t) * a * Math.pow(t, x / 2 + 0.25);
  }
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const FACT = [1];
  for (let i = 1; i <= 171; i++) FACT[i] = FACT[i - 1] * i;
  function fact(n) {
    if (Number.isInteger(n)) return n < 0 ? NaN : n > 170 ? Infinity : FACT[n];
    return gamma(n + 1);
  }
  function nCr(n, k) {
    if (Number.isInteger(n) && Number.isInteger(k)) {
      if (k < 0 || n < 0 || k > n) return 0;
      k = Math.min(k, n - k);
      let r = 1;
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
      return Math.round(r) === r || r > 9e15 ? r : Math.round(r);
    }
    return Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1));
  }
  function nPr(n, k) {
    if (Number.isInteger(n) && Number.isInteger(k)) {
      if (k < 0 || n < 0 || k > n) return 0;
      let r = 1;
      for (let i = 0; i < k; i++) r *= n - i;
      return r;
    }
    return Math.exp(lgamma(n + 1) - lgamma(n - k + 1));
  }

  // Regularized incomplete gamma P(a, x) and Q(a, x) = 1 − P.
  function gammaSeries(a, x) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 1000; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  function gammaCF(a, x) {
    const tiny = 1e-300;
    let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const gammaP = (a, x) => (x <= 0 ? 0 : x < a + 1 ? gammaSeries(a, x) : 1 - gammaCF(a, x));
  const gammaQ = (a, x) => (x <= 0 ? 1 : x < a + 1 ? 1 - gammaSeries(a, x) : gammaCF(a, x));

  // Regularized incomplete beta I_x(a, b).
  function betaCF(x, a, b) {
    const tiny = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 1000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  function betaI(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betaCF(x, a, b)) / a : 1 - (bt * betaCF(1 - x, b, a)) / b;
  }
  const erf = (x) => (x < 0 ? -gammaP(0.5, x * x) : gammaP(0.5, x * x));
  const erfc = (x) => (x < 0 ? 1 + gammaP(0.5, x * x) : gammaQ(0.5, x * x));

  // ---------------------------------------------------------------- probability distributions
  // Each: params [{ key, label, def, min, int }], pdf/cdf, mean/variance, plotting range.
  const DIST = {
    normal: {
      label: 'Normal', params: [{ key: 'mu', label: 'mean μ', def: 0 }, { key: 'sigma', label: 'std dev σ', def: 1, min: 0 }],
      pdf: (x, p) => Math.exp(-0.5 * ((x - p.mu) / p.sigma) ** 2) / (p.sigma * Math.sqrt(2 * Math.PI)),
      cdf: (x, p) => 0.5 * erfc(-(x - p.mu) / (p.sigma * Math.SQRT2)),
      mean: (p) => p.mu, variance: (p) => p.sigma ** 2,
      range: (p) => [p.mu - 4 * p.sigma, p.mu + 4 * p.sigma],
    },
    t: {
      label: 'Student t', params: [{ key: 'nu', label: 'degrees of freedom ν', def: 10, min: 0 }],
      pdf: (x, p) => Math.exp(lgamma((p.nu + 1) / 2) - lgamma(p.nu / 2)) / Math.sqrt(p.nu * Math.PI) * Math.pow(1 + (x * x) / p.nu, -(p.nu + 1) / 2),
      cdf: (x, p) => { const q = 0.5 * betaI(p.nu / (p.nu + x * x), p.nu / 2, 0.5); return x > 0 ? 1 - q : q; },
      mean: (p) => (p.nu > 1 ? 0 : NaN), variance: (p) => (p.nu > 2 ? p.nu / (p.nu - 2) : p.nu > 1 ? Infinity : NaN),
      range: (p) => { const s = p.nu > 2 ? Math.sqrt(p.nu / (p.nu - 2)) : 3; return [-4.5 * s, 4.5 * s]; },
    },
    chi2: {
      label: 'Chi-square χ²', params: [{ key: 'k', label: 'degrees of freedom k', def: 4, min: 0 }],
      pdf: (x, p) => (x <= 0 ? (x === 0 && p.k === 2 ? 0.5 : 0) : Math.exp((p.k / 2 - 1) * Math.log(x) - x / 2 - (p.k / 2) * Math.LN2 - lgamma(p.k / 2))),
      cdf: (x, p) => gammaP(p.k / 2, x / 2),
      mean: (p) => p.k, variance: (p) => 2 * p.k,
      range: (p) => [0, p.k + 5 * Math.sqrt(2 * p.k)],
    },
    f: {
      label: 'F', params: [{ key: 'd1', label: 'numerator df d₁', def: 5, min: 0 }, { key: 'd2', label: 'denominator df d₂', def: 10, min: 0 }],
      pdf: (x, p) => {
        if (x <= 0) return 0;
        const { d1, d2 } = p;
        return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (lgamma(d1 / 2) + lgamma(d2 / 2) - lgamma((d1 + d2) / 2)));
      },
      cdf: (x, p) => (x <= 0 ? 0 : betaI((p.d1 * x) / (p.d1 * x + p.d2), p.d1 / 2, p.d2 / 2)),
      mean: (p) => (p.d2 > 2 ? p.d2 / (p.d2 - 2) : NaN),
      variance: (p) => (p.d2 > 4 ? (2 * p.d2 ** 2 * (p.d1 + p.d2 - 2)) / (p.d1 * (p.d2 - 2) ** 2 * (p.d2 - 4)) : NaN),
      range: () => [0, 5],
    },
    exponential: {
      label: 'Exponential', params: [{ key: 'lambda', label: 'rate λ', def: 1, min: 0 }],
      pdf: (x, p) => (x < 0 ? 0 : p.lambda * Math.exp(-p.lambda * x)),
      cdf: (x, p) => (x < 0 ? 0 : 1 - Math.exp(-p.lambda * x)),
      mean: (p) => 1 / p.lambda, variance: (p) => 1 / p.lambda ** 2,
      range: (p) => [0, 6 / p.lambda],
    },
    uniform: {
      label: 'Uniform', params: [{ key: 'a', label: 'lower a', def: 0 }, { key: 'b', label: 'upper b', def: 1 }],
      pdf: (x, p) => (x < p.a || x > p.b ? 0 : 1 / (p.b - p.a)),
      cdf: (x, p) => (x <= p.a ? 0 : x >= p.b ? 1 : (x - p.a) / (p.b - p.a)),
      mean: (p) => (p.a + p.b) / 2, variance: (p) => (p.b - p.a) ** 2 / 12,
      range: (p) => { const w = p.b - p.a; return [p.a - w * 0.25, p.b + w * 0.25]; },
    },
    binomial: {
      label: 'Binomial', discrete: true, params: [{ key: 'n', label: 'trials n', def: 20, min: 0, int: true }, { key: 'p', label: 'success probability p', def: 0.5, min: 0, max: 1 }],
      pdf: (k, p) => (k < 0 || k > p.n || !Number.isInteger(k) ? 0 : Math.exp(lgamma(p.n + 1) - lgamma(k + 1) - lgamma(p.n - k + 1) + (k ? k * Math.log(p.p) : 0) + (p.n - k ? (p.n - k) * Math.log(1 - p.p) : 0))),
      cdf: (x, p) => { const k = Math.floor(x); return k < 0 ? 0 : k >= p.n ? 1 : betaI(1 - p.p, p.n - k, k + 1); },
      mean: (p) => p.n * p.p, variance: (p) => p.n * p.p * (1 - p.p),
      range: (p) => [0, p.n],
    },
    poisson: {
      label: 'Poisson', discrete: true, params: [{ key: 'lambda', label: 'mean λ', def: 4, min: 0 }],
      pdf: (k, p) => (k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(p.lambda) - p.lambda - lgamma(k + 1))),
      cdf: (x, p) => { const k = Math.floor(x); return k < 0 ? 0 : gammaQ(k + 1, p.lambda); },
      mean: (p) => p.lambda, variance: (p) => p.lambda,
      range: (p) => [0, Math.ceil(p.lambda + 5 * Math.sqrt(p.lambda) + 3)],
    },
    geometric: {
      label: 'Geometric (trials until 1st success)', discrete: true, params: [{ key: 'p', label: 'success probability p', def: 0.3, min: 0, max: 1 }],
      pdf: (k, p) => (k < 1 || !Number.isInteger(k) ? 0 : (1 - p.p) ** (k - 1) * p.p),
      cdf: (x, p) => { const k = Math.floor(x); return k < 1 ? 0 : 1 - (1 - p.p) ** k; },
      mean: (p) => 1 / p.p, variance: (p) => (1 - p.p) / p.p ** 2,
      range: (p) => [1, Math.max(5, Math.ceil(Math.log(0.002) / Math.log(1 - p.p)))],
    },
  };
  // Smallest x with cdf(x) ≥ q (continuous: the x where cdf(x) = q).
  function quantile(d, q, p) {
    if (!(q >= 0 && q <= 1)) return NaN;
    let [lo, hi] = d.range(p);
    if (d.discrete) {
      lo = Math.floor(lo);
      if (q <= d.cdf(lo, p)) return lo;
      let k = lo;
      while (d.cdf(k, p) < q && k < lo + 1e7) k++;
      return k;
    }
    if (q === 0 || q === 1) return d === DIST.uniform ? (q ? p.b : p.a) : q ? Infinity : d === DIST.normal || d === DIST.t ? -Infinity : 0;
    let span = Math.max(1, hi - lo);
    while (d.cdf(lo, p) > q) { lo -= span; span *= 2; }
    span = Math.max(1, hi - lo);
    while (d.cdf(hi, p) < q) { hi += span; span *= 2; }
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (d.cdf(m, p) < q) lo = m; else hi = m;
      if (hi - lo < 1e-14 * Math.max(1, Math.abs(m))) break;
    }
    return (lo + hi) / 2;
  }

  // ---------------------------------------------------------------- numeric calculus
  const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
  const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
  const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];
  function gk15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2, fc = f(c);
    let k = fc * WGK[7], g = fc * WG[3];
    for (let j = 0; j < 7; j++) {
      const dx = h * XGK[j], s = f(c - dx) + f(c + dx);
      k += WGK[j] * s;
      if (j % 2 === 1) g += WG[(j - 1) / 2] * s;
    }
    return [k * h, Math.abs((k - g) * h)];
  }
  // Adaptive Gauss–Kronrod; infinite limits are mapped onto finite intervals.
  function integral(f, a, b) {
    if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
    if (a === b) return 0;
    if (a > b) return -integral(f, b, a);
    if (a === -Infinity && b === Infinity) return integral(f, -Infinity, 0) + integral(f, 0, Infinity);
    if (b === Infinity) return integral((t) => { const u = 1 - t; return f(a + t / u) / (u * u); }, 0, 1);
    if (a === -Infinity) return integral((t) => { const u = 1 - t; return f(b - t / u) / (u * u); }, 0, 1);
    let budget = 3000;
    const whole = gk15(f, a, b);
    const tol = 1e-11 * Math.max(1, Math.abs(whole[0]));
    const rec = (lo, hi, est, depth) => {
      if (est[1] <= tol * ((hi - lo) / (b - a)) || depth > 50 || budget <= 0 || !isFinite(est[0])) return est[0];
      budget -= 2;
      const m = (lo + hi) / 2;
      return rec(lo, m, gk15(f, lo, m), depth + 1) + rec(m, hi, gk15(f, m, hi), depth + 1);
    };
    return rec(a, b, whole, 0);
  }
  // Central differences with Richardson extrapolation.
  function diff(f, x) {
    let h = 1e-2 * Math.max(1, Math.abs(x));
    const D = [];
    for (let i = 0; i < 6; i++) {
      D.push([(f(x + h) - f(x - h)) / (2 * h)]);
      for (let j = 1; j <= i; j++) D[i][j] = D[i][j - 1] + (D[i][j - 1] - D[i - 1][j - 1]) / (4 ** j - 1);
      h /= 2;
    }
    return D[5][5];
  }
  function bisect(f, lo, hi, flo) {
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2, fm = f(m);
      if (fm === 0) return m;
      if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m;
      if (hi - lo <= 4e-16 * Math.max(1, Math.abs(m))) break;
    }
    return (lo + hi) / 2;
  }
  // All real roots of f in [a, b]: sign changes (rejecting poles) plus touching roots like x² at 0.
  function findRoots(f, a, b, n = 2000) {
    const roots = [];
    const h = (b - a) / n;
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) { xs.push(a + i * h); ys.push(f(a + i * h)); }
    const scale = Math.max(1e-300, ...ys.filter(isFinite).map(Math.abs).sort((p, q) => p - q).slice(0, Math.max(1, n >> 1)));
    const add = (r) => {
      if (!isFinite(r)) return;
      const fr = f(r);
      if (!(Math.abs(fr) <= 1e-7 * Math.max(1, scale))) return; // a pole or a jump, not a root
      if (roots.every((q) => Math.abs(q - r) > Math.abs(h) * 0.5)) roots.push(r);
    };
    for (let i = 0; i < n; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      if (!isFinite(y0) || !isFinite(y1)) continue;
      if (y0 === 0) { add(xs[i]); continue; }
      if ((y0 < 0) !== (y1 < 0) && y1 !== 0) add(bisect(f, xs[i], xs[i + 1], y0));
      // local minimum of |f| close to zero: a root that touches the axis
      if (i > 0 && isFinite(ys[i - 1]) && Math.abs(y0) <= Math.abs(ys[i - 1]) && Math.abs(y0) <= Math.abs(y1) && (y0 < 0) === (ys[i - 1] < 0) && (y0 < 0) === (y1 < 0)) {
        const m = goldenMin((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1]);
        if (Math.abs(f(m)) < 1e-10 * Math.max(1, scale)) add(m);
      }
    }
    if (isFinite(ys[n]) && ys[n] === 0) add(xs[n]);
    return roots.sort((p, q) => p - q);
  }
  function goldenMin(f, a, b) {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < 120 && Math.abs(b - a) > 1e-15 * Math.max(1, Math.abs(a)); i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
    }
    return (a + b) / 2;
  }
  // A root of f: in [a, b] when both are given, otherwise near the guess a (default 1).
  function solve(f, a, b) {
    if (b !== undefined) {
      const fa = f(a), fb = f(b);
      if ((fa < 0) !== (fb < 0)) return bisect(f, Math.min(a, b), Math.max(a, b), a < b ? fa : fb);
      const r = findRoots(f, Math.min(a, b), Math.max(a, b), 1000);
      return r.length ? r[0] : NaN;
    }
    const x0 = a === undefined || !isFinite(a) ? 1 : a;
    let x = x0;
    for (let i = 0; i < 80; i++) {
      const fx = f(x);
      if (fx === 0) return x;
      const d = diff(f, x);
      if (!d || !isFinite(d) || !isFinite(fx)) break;
      const nx = x - fx / d;
      if (!isFinite(nx)) break;
      if (Math.abs(nx - x) < 1e-13 * Math.max(1, Math.abs(x)) && Math.abs(f(nx)) < 1e-8) return nx;
      x = nx;
    }
    for (let r = 1; r < 1e7; r *= 4) {
      const roots = findRoots(f, x0 - r, x0 + r, 400);
      if (roots.length) return roots.reduce((best, q) => (Math.abs(q - x0) < Math.abs(best - x0) ? q : best));
    }
    return NaN;
  }

  // ---------------------------------------------------------------- function library
  const isqrtInt = (n) => Number.isInteger(n) && n >= 0;
  function gcd2(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return NaN;
    while (b) [a, b] = [b, a % b];
    return a;
  }
  function isPrime(n) {
    if (!Number.isInteger(n) || n < 2) return 0;
    if (n % 2 === 0) return n === 2 ? 1 : 0;
    if (n % 3 === 0) return n === 3 ? 1 : 0;
    for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return 0;
    return 1;
  }
  const sorted = (a) => a.slice().sort((p, q) => p - q);
  const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const varOf = (a) => { const m = meanOf(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
  function medianOf(a) {
    const s = sorted(a), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  // a^b, with real odd roots of negative numbers: (-8)^(1/3) = -2.
  function pow(a, b) {
    if (a < 0 && !Number.isInteger(b) && isFinite(b)) {
      for (let q = 3; q <= 99; q += 2) {
        const p = b * q;
        if (Math.abs(p - Math.round(p)) < 1e-9) { const v = Math.pow(-a, b); return Math.round(p) % 2 === 0 ? v : -v; }
      }
    }
    return Math.pow(a, b);
  }
  function root(x, n) {
    if (x < 0 && Number.isInteger(n) && n % 2 !== 0) return -Math.pow(-x, 1 / n);
    return Math.pow(x, 1 / n);
  }

  const M = { af: 1 }; // af: angle factor (1 = radians, π/180 = degrees)
  // name -> [min args, max args, implementation, description, group]
  const FUNCS = {
    sin: [1, 1, (x) => Math.sin(x * M.af), 'sine', 'Trigonometry'],
    cos: [1, 1, (x) => Math.cos(x * M.af), 'cosine', 'Trigonometry'],
    tan: [1, 1, (x) => Math.tan(x * M.af), 'tangent', 'Trigonometry'],
    sec: [1, 1, (x) => 1 / Math.cos(x * M.af), 'secant', 'Trigonometry'],
    csc: [1, 1, (x) => 1 / Math.sin(x * M.af), 'cosecant', 'Trigonometry'],
    cot: [1, 1, (x) => 1 / Math.tan(x * M.af), 'cotangent', 'Trigonometry'],
    asin: [1, 1, (x) => Math.asin(x) / M.af, 'inverse sine', 'Trigonometry'],
    acos: [1, 1, (x) => Math.acos(x) / M.af, 'inverse cosine', 'Trigonometry'],
    atan: [1, 1, (x) => Math.atan(x) / M.af, 'inverse tangent', 'Trigonometry'],
    atan2: [2, 2, (y, x) => Math.atan2(y, x) / M.af, 'angle of the point (x, y): atan2(y, x)', 'Trigonometry'],
    sinh: [1, 1, Math.sinh, 'hyperbolic sine', 'Trigonometry'],
    cosh: [1, 1, Math.cosh, 'hyperbolic cosine', 'Trigonometry'],
    tanh: [1, 1, Math.tanh, 'hyperbolic tangent', 'Trigonometry'],
    asinh: [1, 1, Math.asinh, 'inverse hyperbolic sine', 'Trigonometry'],
    acosh: [1, 1, Math.acosh, 'inverse hyperbolic cosine', 'Trigonometry'],
    atanh: [1, 1, Math.atanh, 'inverse hyperbolic tangent', 'Trigonometry'],
    deg: [1, 1, (x) => (x * 180) / Math.PI, 'radians → degrees', 'Trigonometry'],
    rad: [1, 1, (x) => (x * Math.PI) / 180, 'degrees → radians', 'Trigonometry'],

    sqrt: [1, 1, Math.sqrt, 'square root (also √x)', 'Powers & logs'],
    cbrt: [1, 1, Math.cbrt, 'cube root (also ∛x)', 'Powers & logs'],
    root: [2, 2, root, 'n-th root: root(x, n)', 'Powers & logs'],
    exp: [1, 1, Math.exp, 'eˣ', 'Powers & logs'],
    ln: [1, 1, Math.log, 'natural logarithm', 'Powers & logs'],
    log: [1, 2, (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)), 'log base 10, or log(x, base)', 'Powers & logs'],
    log2: [1, 1, Math.log2, 'log base 2', 'Powers & logs'],
    log10: [1, 1, Math.log10, 'log base 10', 'Powers & logs'],

    abs: [1, 1, Math.abs, 'absolute value (also |x|)', 'Rounding & parts'],
    sign: [1, 1, Math.sign, 'sign: −1, 0 or 1', 'Rounding & parts'],
    floor: [1, 1, Math.floor, 'round down', 'Rounding & parts'],
    ceil: [1, 1, Math.ceil, 'round up', 'Rounding & parts'],
    round: [1, 2, (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; }, 'round, or round(x, decimals)', 'Rounding & parts'],
    trunc: [1, 1, Math.trunc, 'drop the fractional part', 'Rounding & parts'],
    frac: [1, 1, (x) => x - Math.trunc(x), 'fractional part', 'Rounding & parts'],
    mod: [2, 2, (a, b) => a - b * Math.floor(a / b), 'remainder of a ÷ b (never negative for b > 0)', 'Rounding & parts'],
    min: [1, Infinity, Math.min, 'smallest argument', 'Rounding & parts'],
    max: [1, Infinity, Math.max, 'largest argument', 'Rounding & parts'],
    clamp: [3, 3, (x, a, b) => Math.min(b, Math.max(a, x)), 'clamp(x, low, high)', 'Rounding & parts'],
    hypot: [1, Infinity, Math.hypot, '√(a² + b² + …)', 'Rounding & parts'],
    if: [3, 3, (c, a, b) => (c ? a : b), 'if(condition, then, else) — e.g. if(x < 0, -x, x)', 'Rounding & parts'],

    gcd: [1, Infinity, (...a) => a.reduce(gcd2), 'greatest common divisor', 'Number theory'],
    lcm: [1, Infinity, (...a) => a.reduce((p, q) => Math.abs(p * q) / gcd2(p, q)), 'least common multiple', 'Number theory'],
    isprime: [1, 1, isPrime, '1 if prime, else 0', 'Number theory'],
    fib: [1, 1, (n) => { if (!isqrtInt(n)) return NaN; let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; }, 'n-th Fibonacci number', 'Number theory'],

    fact: [1, 1, fact, 'factorial (also n!)', 'Combinatorics & special'],
    nCr: [2, 2, nCr, 'combinations: n choose r', 'Combinatorics & special'],
    nPr: [2, 2, nPr, 'permutations', 'Combinatorics & special'],
    gamma: [1, 1, gamma, 'gamma function Γ(x)', 'Combinatorics & special'],
    lngamma: [1, 1, lgamma, 'ln |Γ(x)|', 'Combinatorics & special'],
    beta: [2, 2, (a, b) => Math.exp(lgamma(a) + lgamma(b) - lgamma(a + b)), 'beta function B(a, b)', 'Combinatorics & special'],
    erf: [1, 1, erf, 'error function', 'Combinatorics & special'],
    erfc: [1, 1, erfc, 'complementary error function', 'Combinatorics & special'],

    mean: [1, Infinity, (...a) => meanOf(a), 'average of the arguments', 'Statistics'],
    median: [1, Infinity, (...a) => medianOf(a), 'median of the arguments', 'Statistics'],
    stdev: [2, Infinity, (...a) => Math.sqrt(varOf(a)), 'sample standard deviation', 'Statistics'],
    variance: [2, Infinity, (...a) => varOf(a), 'sample variance', 'Statistics'],
    total: [1, Infinity, (...a) => a.reduce((s, v) => s + v, 0), 'sum of the arguments', 'Statistics'],
    normpdf: [1, 3, (x, m = 0, s = 1) => DIST.normal.pdf(x, { mu: m, sigma: s }), 'normal density normpdf(x, μ, σ)', 'Statistics'],
    normcdf: [1, 3, (x, m = 0, s = 1) => DIST.normal.cdf(x, { mu: m, sigma: s }), 'normal P(X ≤ x): normcdf(x, μ, σ)', 'Statistics'],
    invnorm: [1, 3, (q, m = 0, s = 1) => quantile(DIST.normal, q, { mu: m, sigma: s }), 'inverse normal: x with P(X ≤ x) = p', 'Statistics'],
    binompdf: [3, 3, (n, p, k) => DIST.binomial.pdf(k, { n, p }), 'binomial P(X = k): binompdf(n, p, k)', 'Statistics'],
    binomcdf: [3, 3, (n, p, k) => DIST.binomial.cdf(k, { n, p }), 'binomial P(X ≤ k): binomcdf(n, p, k)', 'Statistics'],
    poissonpdf: [2, 2, (l, k) => DIST.poisson.pdf(k, { lambda: l }), 'Poisson P(X = k): poissonpdf(λ, k)', 'Statistics'],
    poissoncdf: [2, 2, (l, k) => DIST.poisson.cdf(k, { lambda: l }), 'Poisson P(X ≤ k): poissoncdf(λ, k)', 'Statistics'],
    rand: [0, 2, (a, b) => (a === undefined ? Math.random() : b === undefined ? Math.random() * a : a + Math.random() * (b - a)), 'random number in [0, 1), or rand(a, b)', 'Statistics'],
    randint: [2, 2, (a, b) => Math.floor(a + Math.random() * (Math.floor(b) - a + 1)), 'random whole number from a to b', 'Statistics'],
  };
  // Calculus and sums: the second argument names the variable (handled by the compiler).
  const SPECIAL = {
    sum: 'sum(expression, k, from, to) — Σ', prod: 'prod(expression, k, from, to) — Π',
    int: 'int(expression, x, a, b) — definite integral (limits may be ±inf)', integral: 'same as int',
    diff: 'diff(expression, x) — derivative; diff(expression, x, at) at a point', deriv: 'same as diff',
    solve: 'solve(equation, x) — a solution near 1; solve(eq, x, guess) or solve(eq, x, low, high)',
  };
  M.f = Object.fromEntries(Object.entries(FUNCS).map(([k, v]) => [k, v[2]]));
  M.pow = pow;
  M.fact = fact;
  M.degIn = (x) => (x * Math.PI) / 180 / M.af; // 30° in the current angle unit
  M.sum = (f, a, b) => { a = Math.ceil(a - 1e-9); b = Math.floor(b + 1e-9); if (b - a > 1e7) return NaN; let s = 0; for (let k = a; k <= b; k++) s += f(k); return s; };
  M.prod = (f, a, b) => { a = Math.ceil(a - 1e-9); b = Math.floor(b + 1e-9); if (b - a > 1e7) return NaN; let s = 1; for (let k = a; k <= b; k++) s *= f(k); return s; };
  M.integral = integral;
  M.diff = diff;
  M.solve = solve;
  M.eq = (a, b) => (Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)) ? 1 : 0);

  const CONSTS = {
    pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI, 'τ': 2 * Math.PI,
    phi: (1 + Math.sqrt(5)) / 2, 'φ': (1 + Math.sqrt(5)) / 2, inf: Infinity, infinity: Infinity, '∞': Infinity,
  };

  // ---------------------------------------------------------------- tokenizer + parser
  const ID_RE = /^[A-Za-zͰ-Ͽ](?:[A-Za-zͰ-Ͽ]*)(?:_[A-Za-z0-9]+)?/u;
  const SUPERS = { '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
  const RENAME = { theta: 'θ', Theta: 'θ' };

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      const rest = src.slice(i);
      let m = /^0x[0-9a-fA-F]+|^0b[01]+|^0o[0-7]+/.exec(rest);
      if (m) { toks.push({ t: 'num', v: Number(m[0]), pos: i }); i += m[0].length; continue; }
      m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
      if (m) { toks.push({ t: 'num', v: parseFloat(m[0]), pos: i }); i += m[0].length; continue; }
      m = ID_RE.exec(rest);
      if (m) { toks.push({ t: 'id', v: RENAME[m[0]] || m[0], pos: i }); i += m[0].length; continue; }
      if (SUPERS[ch] !== undefined) {
        let j = i, s = '';
        while (j < src.length && SUPERS[src[j]] !== undefined) s += SUPERS[src[j++]];
        toks.push({ t: 'op', v: '^', pos: i }, { t: 'num', v: +s, pos: i });
        i = j;
        continue;
      }
      const two = rest.slice(0, 2);
      if (['<=', '>=', '==', '!=', '**'].includes(two)) { toks.push({ t: 'op', v: two === '**' ? '^' : two === '==' ? '=' : two, pos: i }); i += 2; continue; }
      const map = { '×': '*', '·': '*', '÷': '/', '−': '-', '–': '-', '≤': '<=', '≥': '>=', '≠': '!=', '[': '(', ']': ')' };
      if (ch === '√' || ch === '∛') { toks.push({ t: 'id', v: ch === '√' ? 'sqrt' : 'cbrt', pos: i, prefix: true }); i++; continue; }
      if (ch === '∞') { toks.push({ t: 'id', v: '∞', pos: i }); i++; continue; }
      const op = map[ch] || ch;
      if ('+-*/^(),!%°|<>=;'.includes(op) || ['<=', '>=', '!='].includes(op)) { toks.push({ t: 'op', v: op, pos: i }); i++; continue; }
      throw new MathError(`Unexpected character '${ch}'`, i);
    }
    toks.push({ t: 'eof', pos: src.length });
    return toks;
  }

  const CMP = new Set(['=', '<', '>', '<=', '>=', '!=']);
  const lookupFunc = (name) => (FUNCS[name] ? name : FUNCS[name.toLowerCase()] ? name.toLowerCase() : null);

  function parse(src) {
    const toks = tokenize(String(src));
    let k = 0;
    const peek = () => toks[k];
    const next = () => toks[k++];
    const isOp = (v) => peek().t === 'op' && peek().v === v;
    const expect = (v) => {
      if (!isOp(v)) throw new MathError(peek().t === 'eof' ? `Missing '${v}'` : `Expected '${v}'`, peek().pos);
      next();
    };
    const startsOperand = () => {
      const p = peek();
      return p.t === 'num' || p.t === 'id' || (p.t === 'op' && p.v === '(');
    };

    function equation() {
      const a = expr();
      if (peek().t === 'op' && CMP.has(peek().v)) {
        const tk = next();
        const b = expr();
        if (peek().t === 'op' && CMP.has(peek().v)) { // a < b < c
          const tk2 = next();
          const c = expr();
          return { t: 'and', a: { t: 'cmp', op: tk.v, a, b, pos: tk.pos }, b: { t: 'cmp', op: tk2.v, a: b, b: c, pos: tk2.pos } };
        }
        return { t: 'cmp', op: tk.v, a, b, pos: tk.pos };
      }
      return a;
    }
    function expr() {
      let a = term();
      while (isOp('+') || isOp('-')) {
        const op = next().v;
        a = { t: 'bin', op, a, b: term() };
      }
      return a;
    }
    function term() {
      let a = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = next().v;
          a = { t: 'bin', op, a, b: unary() };
        } else if (startsOperand()) {
          a = { t: 'bin', op: '*', a, b: power(), implicit: true }; // 2x, 3(x + 1), x sin(x)
        } else break;
      }
      return a;
    }
    function unary() {
      if (isOp('-')) { next(); return { t: 'neg', a: unary() }; }
      if (isOp('+')) { next(); return unary(); }
      return power();
    }
    function power() {
      let base = postfix(primary());
      if (isOp('^')) { next(); return { t: 'bin', op: '^', a: base, b: unary() }; }
      return base;
    }
    function postfix(a) {
      for (;;) {
        if (isOp('!')) { next(); a = { t: 'post', op: '!', a }; }
        else if (isOp('%')) { next(); a = { t: 'post', op: '%', a }; }
        else if (isOp('°')) { next(); a = { t: 'post', op: '°', a }; }
        else return a;
      }
    }
    function primary() {
      const tk = peek();
      if (tk.t === 'num') { next(); return { t: 'num', v: tk.v }; }
      if (tk.t === 'id') {
        next();
        const name = tk.v;
        if (tk.prefix) {
          if (isOp('(')) { next(); const e = equation(); expect(')'); return { t: 'call', f: name, args: [e], pos: tk.pos }; }
          return { t: 'call', f: name, args: [power()], pos: tk.pos };
        }
        if (isOp('(')) {
          next();
          const args = [];
          if (!isOp(')')) {
            args.push(equation());
            while (isOp(',') || isOp(';')) { next(); args.push(equation()); }
          }
          expect(')');
          return { t: 'call', f: name, args, pos: tk.pos };
        }
        // "sin x", "ln 2": a function name followed directly by its argument
        if (lookupFunc(name) && startsOperand() && !(name.length === 1)) return { t: 'call', f: name, args: [power()], pos: tk.pos };
        return { t: 'var', name, pos: tk.pos };
      }
      if (isOp('(')) {
        next();
        const items = [equation()];
        while (isOp(',')) { next(); items.push(equation()); }
        expect(')');
        return items.length === 1 ? items[0] : { t: 'tuple', items, pos: tk.pos };
      }
      if (isOp('|')) { next(); const e = expr(); expect('|'); return { t: 'call', f: 'abs', args: [e], pos: tk.pos }; }
      throw new MathError(tk.t === 'eof' ? 'The expression ends too early' : `Unexpected '${tk.v}'`, tk.pos);
    }

    if (peek().t === 'eof') throw new MathError('Empty expression', 0);
    const ast = equation();
    if (peek().t !== 'eof') throw new MathError(`Unexpected '${peek().v}'`, peek().pos);
    return ast;
  }

  // ---------------------------------------------------------------- compiler (AST -> JS function)
  const q = (s) => JSON.stringify(s);
  const numLit = (v) => (v === Infinity ? 'Infinity' : v === -Infinity ? '(-Infinity)' : Number.isNaN(v) ? 'NaN' : `(${v})`);
  const SPLIT_RE = /^[A-Za-zͰ-Ͽ]{2,}$/u;

  // scope: { vars: { name: number }, funcs: { name: function (with .arity) } }. Unknown names go to `free`
  // and read scope.vars at run time (so a slider can change them without recompiling).
  function compile(ast, locals = [], scope = {}) {
    const vars = scope.vars || {}, funcs = scope.funcs || {};
    const free = new Set();
    let sid = 0;
    const env0 = new Map(locals.map((n, i) => [n, 'a' + i]));

    function varRef(name, pos, env) {
      if (env.has(name)) return env.get(name);
      if (name in CONSTS) return numLit(CONSTS[name]);
      if (name in vars) return `V[${q(name)}]`;
      // "xy" or "ab": a product of single-letter names, unless something by that whole name exists. Only
      // when each letter is known — or the caller allows new names (the grapher makes them sliders).
      if (SPLIT_RE.test(name) && !funcs[name] && (scope.splitUnknown || [...name].every((c) => env.has(c) || c in CONSTS || c in vars))) return '(' + [...name].map((c) => varRef(c, pos, env)).join(' * ') + ')';
      free.add(name);
      return `V[${q(name)}]`;
    }

    function special(name, n, env) {
      const a = n.args;
      const want = (lo, hi) => {
        if (a.length < lo || a.length > hi) throw new MathError(`${name}() takes ${lo === hi ? lo : lo + '–' + hi} arguments: ${SPECIAL[name]}`, n.pos);
        if (a[1].t !== 'var') throw new MathError(`The second argument of ${name}() must be a variable name`, n.pos);
      };
      const lambda = (body) => {
        const id = 's' + sid++;
        const env2 = new Map(env);
        env2.set(a[1].name, id);
        const b = body.t === 'cmp' && body.op === '=' ? { t: 'bin', op: '-', a: body.a, b: body.b } : body;
        return `((${id}) => ${g(b, env2)})`;
      };
      switch (name) {
        case 'sum': case 'prod':
          want(4, 4);
          return `M.${name}(${lambda(a[0])}, ${g(a[2], env)}, ${g(a[3], env)})`;
        case 'int': case 'integral':
          want(4, 4);
          return `M.integral(${lambda(a[0])}, ${g(a[2], env)}, ${g(a[3], env)})`;
        case 'diff': case 'deriv':
          want(2, 3);
          return `M.diff(${lambda(a[0])}, ${a.length === 3 ? g(a[2], env) : varRef(a[1].name, a[1].pos, env)})`;
        case 'solve':
          want(2, 4);
          return `M.solve(${lambda(a[0])}${a.length > 2 ? ', ' + g(a[2], env) : ''}${a.length > 3 ? ', ' + g(a[3], env) : ''})`;
      }
      return null;
    }

    function g(n, env) {
      switch (n.t) {
        case 'num': return numLit(n.v);
        case 'var': return varRef(n.name, n.pos, env);
        case 'neg': return `(-${g(n.a, env)})`;
        case 'post':
          if (n.op === '!') return `M.fact(${g(n.a, env)})`;
          if (n.op === '%') return `(${g(n.a, env)} / 100)`;
          return `M.degIn(${g(n.a, env)})`;
        case 'bin': {
          const A = g(n.a, env), B = g(n.b, env);
          if (n.op === '^') return `M.pow(${A}, ${B})`;
          return `(${A} ${n.op} ${B})`;
        }
        case 'cmp': {
          const A = g(n.a, env), B = g(n.b, env);
          if (n.op === '=') return `M.eq(${A}, ${B})`;
          if (n.op === '!=') return `(1 - M.eq(${A}, ${B}))`;
          return `(${A} ${n.op} ${B} ? 1 : 0)`;
        }
        case 'and': return `(${g(n.a, env)} && ${g(n.b, env)} ? 1 : 0)`;
        case 'tuple': throw new MathError('A point (x, y) is not a single number', n.pos);
        case 'call': {
          const lname = n.f.toLowerCase();
          if (SPECIAL[lname] && n.args.length >= 2 && n.args[1].t === 'var' && !(lname === 'sum' && n.args.length !== 4)) return special(lname, n, env);
          const args = n.args.map((x) => g(x, env));
          if (funcs[n.f] && !env.has(n.f)) {
            const ar = funcs[n.f].arity;
            if (ar != null && ar !== args.length) throw new MathError(`${n.f}() takes ${ar} argument${ar === 1 ? '' : 's'}`, n.pos);
            return `UF[${q(n.f)}](${args.join(', ')})`;
          }
          const fname = lookupFunc(n.f);
          if (fname && !env.has(n.f)) {
            const [lo, hi] = FUNCS[fname];
            if (args.length < lo || args.length > hi) throw new MathError(`${fname}() takes ${lo === hi ? lo : hi === Infinity ? 'at least ' + lo : lo + ' to ' + hi} argument${hi === 1 ? '' : 's'}`, n.pos);
            return `M.f[${q(fname)}](${args.join(', ')})`;
          }
          if (SPECIAL[lname]) return special(lname, n, env) || 'NaN';
          if (args.length === 1) return `(${varRef(n.f, n.pos, env)} * ${args[0]})`; // a(b + c)
          throw new MathError(`Unknown function '${n.f}'`, n.pos);
        }
      }
      throw new MathError('Could not understand the expression', 0);
    }

    const code = g(ast, env0);
    const params = locals.map((_, i) => 'a' + i).join(', ');
    // eslint-disable-next-line no-new-func
    const fn = new Function('M', 'V', 'UF', `"use strict"; return function (${params}) { return ${code}; };`)(M, vars, funcs);
    return { fn, free };
  }

  // Evaluates a constant expression; unknown names are an error.
  function evaluate(src, scope = {}) {
    const ast = typeof src === 'string' ? parse(src) : src;
    const { fn, free } = compile(ast, [], scope);
    for (const name of free) throw new MathError(`Unknown name '${name}'`, 0);
    return fn();
  }

  // Names used anywhere in an AST (variables and called functions).
  function names(ast) {
    const vars = new Set(), calls = new Set();
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.t === 'var') vars.add(n.name);
      if (n.t === 'call') calls.add(n.f);
      for (const k of ['a', 'b']) if (n[k]) walk(n[k]);
      if (n.args) n.args.forEach(walk);
      if (n.items) n.items.forEach(walk);
    };
    walk(ast);
    return { vars, calls };
  }

  // ---------------------------------------------------------------- formatting
  function fmt(v, digits = 12) {
    if (typeof v !== 'number') return String(v);
    if (Number.isNaN(v)) return 'undefined';
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '-∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (Number.isInteger(v) && a < 1e16) return String(v);
    const r = +v.toPrecision(digits);
    if (a >= 1e-6 && a < 1e16) return String(r);
    return r.toExponential().replace('e+', 'e');
  }

  // Best rational approximation p/q (q ≤ maxDen) when it matches v to ~12 digits; else null.
  function fraction(v, maxDen = 100000) {
    if (!isFinite(v) || Number.isInteger(v)) return null;
    const sgn = v < 0 ? -1 : 1, t = Math.abs(v);
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, x = t;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(x);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(t - h1 / k1) <= 1e-12 * Math.max(1, t)) return [sgn * h1, k1];
      const r = x - a;
      if (r < 1e-15) break;
      x = 1 / r;
    }
    return null;
  }
  const fracStr = ([p, q2]) => `${p}/${q2}`;

  // Exact-looking forms of a number: 3/4, 3π/4, √2/2, …
  function altForms(v) {
    const out = [];
    if (!isFinite(v) || Number.isInteger(v)) return out;
    const f = fraction(v, 10000);
    if (f) out.push(fracStr(f));
    const fp = fraction(v / Math.PI, 360);
    if (fp && Math.abs(fp[0]) <= 1000) out.push(`${fp[0] === 1 ? '' : fp[0] === -1 ? '-' : fp[0]}π${fp[1] === 1 ? '' : '/' + fp[1]}`);
    else if (Number.isInteger(+(v / Math.PI).toFixed(10)) && v !== 0) out.push(`${+(v / Math.PI).toFixed(10)}π`);
    if (!f) {
      const f2 = fraction(v * v, 1000);
      if (f2 && f2[0] > 0) {
        // √(p/q) = √(p·q)/q, with square factors taken out of the root
        let inside = f2[0] * f2[1], outside = 1;
        for (let k = 2; k * k <= inside; k++) while (inside % (k * k) === 0) { inside /= k * k; outside *= k; }
        if (inside > 1 && inside < 1e6) {
          const g2 = gcd2(outside, f2[1]);
          const num = outside / g2, den = f2[1] / g2;
          out.push(`${v < 0 ? '-' : ''}${num === 1 ? '' : num}√${inside}${den === 1 ? '' : '/' + den}`);
        }
      }
    }
    return out;
  }

  // Functions grouped for help screens.
  function docs() {
    const groups = {};
    for (const [name, v] of Object.entries(FUNCS)) (groups[v[4]] = groups[v[4]] || []).push([name, v[3]]);
    groups['Calculus & sums'] = Object.entries(SPECIAL);
    return groups;
  }

  return {
    parse, compile, evaluate, names, fmt, fraction, altForms, docs, MathError, M, FUNCS, SPECIAL, CONSTS,
    S: { gamma, lgamma, fact, nCr, nPr, erf, erfc, gammaP, gammaQ, betaI, gcd: gcd2, isPrime },
    DIST, quantile, integral, diff, solve, findRoots, goldenMin,
    stats: { mean: meanOf, median: medianOf, variance: varOf, sorted },
  };
})();

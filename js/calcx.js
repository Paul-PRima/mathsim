// Extra evaluators for the calculator, all working on MX syntax trees:
//  - Exact: rational arithmetic with BigInt (20! in full, 1/3 + 1/6 = 1/2). Returns null when an
//    expression needs something inexact (sin, π, √2 …), so the caller falls back to floating point.
//  - Complex: complex numbers (sqrt(-4) = 2i, e^(iπ) = -1).
//  - Units: quantities with units and conversions (5 km/h in m/s, 3 ft + 20 cm).
const CalcX = (() => {
  // ---------------------------------------------------------------- exact rationals
  const babs = (a) => (a < 0n ? -a : a);
  const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
  function Q(n, d = 1n) {
    if (d === 0n) throw new Error('division by zero');
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  const isInt = (q) => q.d === 1n;
  const MAX_BITS = 400000; // results bigger than ~120 000 digits are left to floating point
  const tooBig = (q) => q.n.toString(16).length * 4 > MAX_BITS || q.d.toString(16).length * 4 > MAX_BITS;

  // Exact value of a number literal ("0.1" is exactly 1/10); null for non-terminating binary floats.
  function fromLiteral(node) {
    const raw = node.raw;
    if (raw && /^0[xbo]/i.test(raw)) return Q(BigInt(raw));
    const s = raw || (Number.isInteger(node.v) && Number.isSafeInteger(node.v) ? String(node.v) : null);
    if (s == null) return null;
    const m = /^(\d*)\.?(\d*)(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m) return null;
    const digits = BigInt((m[1] || '0') + (m[2] || '')), exp = (m[3] ? +m[3] : 0) - (m[2] || '').length;
    if (Math.abs(exp) > 5000) return null;
    return exp >= 0 ? Q(digits * 10n ** BigInt(exp)) : Q(digits, 10n ** BigInt(-exp));
  }
  const fromNumber = (v) => (Number.isSafeInteger(v) ? Q(BigInt(v)) : null);
  const qadd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
  const qsub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
  const qmul = (a, b) => Q(a.n * b.n, a.d * b.d);
  const qdiv = (a, b) => { if (b.n === 0n) throw new Error('division by zero'); return Q(a.n * b.d, a.d * b.n); };
  function iroot(n, k) { // integer k-th root of n ≥ 0 if exact, else null
    if (n < 2n) return n;
    let x = BigInt(Math.round(Math.pow(Number(n), 1 / k)));
    if (n > 2n ** 1000n) { // Newton for big numbers
      x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
      for (let i = 0; i < 2000; i++) { const y = ((BigInt(k) - 1n) * x + n / x ** BigInt(k - 1)) / BigInt(k); if (y >= x) break; x = y; }
    }
    for (const c of [x - 1n, x, x + 1n]) if (c >= 0n && c ** BigInt(k) === n) return c;
    return null;
  }
  function qpow(a, b) {
    if (isInt(b)) {
      const e = b.n;
      if (babs(e) > 100000n) return null;
      const bits = Math.max(a.n.toString(2).length, a.d.toString(2).length) * Number(babs(e));
      if (bits > MAX_BITS) return null;
      if (e >= 0n) return Q(a.n ** e, a.d ** e);
      if (a.n === 0n) throw new Error('division by zero');
      return Q(a.d ** -e, a.n ** -e);
    }
    // a^(p/q): exact only when a is a perfect q-th power, e.g. 8^(2/3) = 4
    if (b.d > 12n || a.n < 0n) return null;
    const k = Number(b.d), rn = iroot(a.n, k), rd = iroot(a.d, k);
    if (rn == null || rd == null) return null;
    return qpow(Q(rn, rd), Q(b.n));
  }
  const bigFact = (n) => { let r = 1n; for (let i = 2n; i <= n; i++) r *= i; return r; };

  function exact(ast, scope) {
    const vars = (scope && scope.vars) || {};
    const ev = (n) => {
      switch (n.t) {
        case 'num': { const q = fromLiteral(n); if (!q) throw 0; return q; }
        case 'var': {
          if (scope && scope.exactVars && scope.exactVars[n.name]) return scope.exactVars[n.name];
          if (n.name in vars) { const q = fromNumber(vars[n.name]); if (q) return q; }
          throw 0;
        }
        case 'neg': { const a = ev(n.a); return Q(-a.n, a.d); }
        case 'post': {
          const a = ev(n.a);
          if (n.op === '%') return qdiv(a, Q(100n));
          if (n.op === '!' && isInt(a) && a.n >= 0n && a.n <= 20000n) return Q(bigFact(a.n));
          throw 0;
        }
        case 'bin': {
          const a = ev(n.a), b = ev(n.b);
          const r = n.op === '+' ? qadd(a, b) : n.op === '-' ? qsub(a, b) : n.op === '*' ? qmul(a, b) : n.op === '/' ? qdiv(a, b) : qpow(a, b);
          if (!r || tooBig(r)) throw 0;
          return r;
        }
        case 'call': {
          const f = n.f.toLowerCase(), args = n.args.map(ev);
          const ints = args.every(isInt);
          if (f === 'abs' && args.length === 1) return Q(babs(args[0].n), args[0].d);
          if ((f === 'fact') && ints && args[0].n >= 0n && args[0].n <= 20000n) return Q(bigFact(args[0].n));
          if (f === 'sqrt' || f === 'cbrt') { const r = qpow(args[0], Q(1n, f === 'sqrt' ? 2n : 3n)); if (r) return r; throw 0; }
          if (f === 'root' && args.length === 2 && isInt(args[1])) { const r = qpow(args[0], Q(1n, args[1].n)); if (r) return r; throw 0; }
          if ((f === 'ncr' || f === 'npr') && ints) {
            const N = args[0].n, K = args[1].n;
            if (K < 0n || N < 0n || K > N || N > 100000n) throw 0;
            let r = 1n;
            for (let i = 0n; i < K; i++) r *= N - i;
            return Q(f === 'ncr' ? r / bigFact(K) : r);
          }
          if ((f === 'gcd' || f === 'lcm') && ints && args.length) return Q(args.map((q) => q.n).reduce(f === 'gcd' ? bgcd : (p, q) => (p && q ? babs(p * q) / bgcd(p, q) : 0n)));
          if (f === 'mod' && ints && args[1].n !== 0n) { const r = ((args[0].n % args[1].n) + args[1].n) % args[1].n; return Q(r); }
          if (f === 'floor' || f === 'ceil' || f === 'trunc') {
            const { n: a, d } = args[0];
            let q = a / d;
            if (f === 'floor' && a < 0n && q * d !== a) q -= 1n;
            if (f === 'ceil' && a > 0n && q * d !== a) q += 1n;
            return Q(q);
          }
          if (f === 'sign') return Q(BigInt(Math.sign(Number(args[0].n))));
          if (f === 'fib' && ints && args[0].n >= 0n && args[0].n <= 100000n) { let x = 0n, y = 1n; for (let i = 0n; i < args[0].n; i++) [x, y] = [y, x + y]; return Q(x); }
          if (f === 'total' || f === 'mean') { const s = args.reduce(qadd, Q(0n)); return f === 'total' ? s : qdiv(s, Q(BigInt(args.length))); }
          if ((f === 'min' || f === 'max') && args.length) return args.reduce((p, q) => ((qsub(p, q).n < 0n) === (f === 'min') ? p : q));
          throw 0;
        }
      }
      throw 0;
    };
    try { return ev(ast); } catch { return null; }
  }
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const qToNumber = (q) => Number(q.n) / Number(q.d);
  function qString(q) { return isInt(q) ? q.n.toString() : `${q.n}/${q.d}`; }

  // ---------------------------------------------------------------- complex numbers
  const C = (re, im = 0) => [re, im];
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const cexp = (a) => { const r = Math.exp(a[0]); return [r * Math.cos(a[1]), r * Math.sin(a[1])]; };
  const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
  const csqrt = (a) => { const r = Math.hypot(a[0], a[1]); const re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt((r - a[0]) / 2); return [re, a[1] < 0 ? -im : im]; };
  function cpow(a, b) {
    if (b[1] === 0 && Number.isInteger(b[0]) && Math.abs(b[0]) <= 1024) { // exact repeated squaring
      let r = C(1), x = a, e = Math.abs(b[0]);
      while (e) { if (e & 1) r = cmul(r, x); x = cmul(x, x); e >>= 1; }
      return b[0] < 0 ? cdiv(C(1), r) : r;
    }
    if (a[0] === 0 && a[1] === 0) return C(0);
    return cexp(cmul(b, clog(a)));
  }
  const I = [0, 1];
  const CF = {
    sqrt: (a) => csqrt(a), exp: cexp, ln: clog, log: (a, b) => (b ? cdiv(clog(a), clog(b)) : cdiv(clog(a), C(Math.LN10))),
    sin: (a) => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])],
    cos: (a) => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])],
    sinh: (a) => [Math.sinh(a[0]) * Math.cos(a[1]), Math.cosh(a[0]) * Math.sin(a[1])],
    cosh: (a) => [Math.cosh(a[0]) * Math.cos(a[1]), Math.sinh(a[0]) * Math.sin(a[1])],
    abs: (a) => C(Math.hypot(a[0], a[1])), arg: (a) => C(Math.atan2(a[1], a[0])), conj: (a) => [a[0], -a[1]],
    re: (a) => C(a[0]), im: (a) => C(a[1]), cbrt: (a) => cpow(a, C(1 / 3)), root: (a, n) => cpow(a, cdiv(C(1), n)),
    asin: (a) => { const w = clog([csqrt([1 - cmul(a, a)[0], -cmul(a, a)[1]])[0] - a[1], csqrt([1 - cmul(a, a)[0], -cmul(a, a)[1]])[1] + a[0]]); return [w[1], -w[0]]; },
    acos: (a) => { const s = csqrt([1 - cmul(a, a)[0], -cmul(a, a)[1]]); const w = clog([a[0] - s[1], a[1] + s[0]]); return [w[1], -w[0]]; },
    atan: (a) => { const w = clog(cdiv([-a[0], 1 - a[1]], [a[0], 1 + a[1]])); return [w[1] / 2, -w[0] / 2]; },
  };
  CF.tan = (a) => cdiv(CF.sin(a), CF.cos(a));
  CF.tanh = (a) => cdiv(CF.sinh(a), CF.cosh(a));
  CF.angle = CF.arg;

  // scope: { vars, cvars (complex variables), funcs }
  function complex(ast, scope = {}) {
    const vars = scope.vars || {}, cvars = scope.cvars || {}, funcs = scope.funcs || {};
    const real = (a) => Math.abs(a[1]) < 1e-300;
    const ev = (n) => {
      switch (n.t) {
        case 'num': return C(n.v);
        case 'var':
          if (cvars[n.name]) return cvars[n.name];
          if (n.name in vars && isFinite(vars[n.name])) return C(vars[n.name]);
          if (n.name === 'i' || n.name === 'j') return I;
          if (n.name in MX.CONSTS) return C(MX.CONSTS[n.name]);
          throw new MX.MathError(`Unknown name '${n.name}'`, n.pos);
        case 'neg': { const a = ev(n.a); return [-a[0] || 0, -a[1] || 0]; } // no -0: it flips arg()
        case 'post': {
          const a = ev(n.a);
          if (n.op === '%') return [a[0] / 100, a[1] / 100];
          if (n.op === '°') return [(a[0] * Math.PI) / 180 / MX.M.af, (a[1] * Math.PI) / 180 / MX.M.af];
          if (real(a)) return C(MX.S.fact(a[0]));
          throw new MX.MathError('Factorial needs a real number', 0);
        }
        case 'bin': {
          const a = ev(n.a), b = ev(n.b);
          if (n.op === '+') return [a[0] + b[0], a[1] + b[1]];
          if (n.op === '-') return [a[0] - b[0], a[1] - b[1]];
          if (n.op === '*') return cmul(a, b);
          if (n.op === '/') return cdiv(a, b);
          return cpow(a, b);
        }
        case 'call': {
          const name = n.f, lname = name.toLowerCase(), args = n.args.map(ev);
          if (funcs[name] && args.every(real)) return C(funcs[name](...args.map((a) => a[0])));
          // real arguments: the normal function (honours degrees; e.g. sqrt(-4) is handled below)
          const realOk = args.every(real) && MX.M.f[lname] && !['sqrt', 'ln', 'log', 'asin', 'acos', 'cbrt', 'root'].includes(lname);
          if (realOk) return C(MX.M.f[lname](...args.map((a) => a[0])));
          if (CF[lname]) return CF[lname](...args);
          if (args.length === 1 && !MX.FUNCS[lname]) { const v = ev({ t: 'var', name, pos: n.pos }); return cmul(v, args[0]); }
          throw new MX.MathError(`${name}() is not defined for complex numbers`, n.pos);
        }
        case 'cmp': case 'and': case 'tuple': throw new MX.MathError('Not a number', 0);
      }
      throw new MX.MathError('Could not evaluate', 0);
    };
    const r = ev(ast);
    const clean = (x) => (Math.abs(x) < 1e-14 * Math.max(1, Math.hypot(r[0], r[1])) ? 0 : x);
    return [clean(r[0]), clean(r[1])];
  }
  function cString(z, fmt = MX.fmt) {
    const [re, im] = z;
    if (im === 0) return fmt(re);
    const imS = Math.abs(im) === 1 ? 'i' : fmt(Math.abs(im)) + 'i';
    if (re === 0) return (im < 0 ? '-' : '') + imS;
    return `${fmt(re)} ${im < 0 ? '−' : '+'} ${imS}`;
  }
  const polarString = (z) => {
    const r = Math.hypot(z[0], z[1]), th = Math.atan2(z[1], z[0]);
    return `${MX.fmt(+r.toPrecision(10))}·e^(${MX.fmt(+th.toPrecision(10))}i)   |z| = ${MX.fmt(+r.toPrecision(10))}, arg = ${MX.fmt(+((th * 180) / Math.PI).toPrecision(10))}°`;
  };

  // ---------------------------------------------------------------- units
  // dimension vector: [m, kg, s, A, K, mol, cd, bit]
  const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0, bit = 0) => [m, kg, s, A, K, mol, cd, bit];
  const L = D(1), M = D(0, 1), T = D(0, 0, 1);
  const VEL = D(1, 0, -1), AREA = D(2), VOL = D(3), FORCE = D(1, 1, -2), ENERGY = D(2, 1, -2), POWER = D(2, 1, -3), PRESS = D(-1, 1, -2), FREQ = D(0, 0, -1), CHARGE = D(0, 0, 1, 1), VOLT = D(2, 1, -3, -1), OHM = D(2, 1, -3, -2), DATA = D(0, 0, 0, 0, 0, 0, 0, 1), CUR = D(0, 0, 0, 1), TEMP = D(0, 0, 0, 0, 1);
  const UNITS = {
    m: [1, L], km: [1e3, L], cm: [1e-2, L], mm: [1e-3, L], um: [1e-6, L], µm: [1e-6, L], nm: [1e-9, L], mi: [1609.344, L], mile: [1609.344, L], miles: [1609.344, L],
    yd: [0.9144, L], ft: [0.3048, L], feet: [0.3048, L], foot: [0.3048, L], inch: [0.0254, L], inches: [0.0254, L], nmi: [1852, L], au: [1.495978707e11, L], ly: [9.4607304725808e15, L], pc: [3.0856775814913673e16, L],
    kg: [1, M], g: [1e-3, M], mg: [1e-6, M], ug: [1e-9, M], µg: [1e-9, M], tonne: [1e3, M], lb: [0.45359237, M], lbs: [0.45359237, M], oz: [0.028349523125, M], st: [6.35029318, M],
    s: [1, T], sec: [1, T], ms: [1e-3, T], us: [1e-6, T], µs: [1e-6, T], ns: [1e-9, T], min: [60, T], h: [3600, T], hr: [3600, T], hour: [3600, T], hours: [3600, T], day: [86400, T], days: [86400, T], week: [604800, T], weeks: [604800, T], year: [31557600, T], years: [31557600, T], yr: [31557600, T],
    ha: [1e4, AREA], acre: [4046.8564224, AREA], acres: [4046.8564224, AREA],
    L: [1e-3, VOL], l: [1e-3, VOL], mL: [1e-6, VOL], ml: [1e-6, VOL], cl: [1e-5, VOL], dl: [1e-4, VOL], gal: [3.785411784e-3, VOL], qt: [9.46352946e-4, VOL], pt: [4.73176473e-4, VOL], cup: [2.365882365e-4, VOL], floz: [2.95735295625e-5, VOL], tbsp: [1.478676478125e-5, VOL], tsp: [4.92892159375e-6, VOL],
    mph: [0.44704, VEL], kph: [1 / 3.6, VEL], kmh: [1 / 3.6, VEL], knot: [1852 / 3600, VEL], knots: [1852 / 3600, VEL], kn: [1852 / 3600, VEL], mach: [340.29, VEL],
    N: [1, FORCE], kN: [1e3, FORCE], lbf: [4.4482216152605, FORCE],
    J: [1, ENERGY], kJ: [1e3, ENERGY], MJ: [1e6, ENERGY], cal: [4.184, ENERGY], kcal: [4184, ENERGY], Wh: [3600, ENERGY], kWh: [3.6e6, ENERGY], MWh: [3.6e9, ENERGY], eV: [1.602176634e-19, ENERGY], BTU: [1055.05585262, ENERGY],
    W: [1, POWER], kW: [1e3, POWER], MW: [1e6, POWER], GW: [1e9, POWER], hp: [745.69987158227022, POWER],
    Pa: [1, PRESS], hPa: [100, PRESS], kPa: [1e3, PRESS], MPa: [1e6, PRESS], bar: [1e5, PRESS], mbar: [100, PRESS], atm: [101325, PRESS], psi: [6894.757293168, PRESS], mmHg: [133.322387415, PRESS],
    Hz: [1, FREQ], kHz: [1e3, FREQ], MHz: [1e6, FREQ], GHz: [1e9, FREQ], rpm: [1 / 60, FREQ],
    A: [1, CUR], mA: [1e-3, CUR], V: [1, VOLT], mV: [1e-3, VOLT], kV: [1e3, VOLT], ohm: [1, OHM], Ω: [1, OHM], kohm: [1e3, OHM], kΩ: [1e3, OHM], Ah: [3600, CHARGE], mAh: [3.6, CHARGE],
    K: [1, TEMP],
    bit: [1, DATA], bits: [1, DATA], byte: [8, DATA], bytes: [8, DATA], kB: [8e3, DATA], MB: [8e6, DATA], GB: [8e9, DATA], TB: [8e12, DATA], KiB: [8192, DATA], MiB: [8 * 2 ** 20, DATA], GiB: [8 * 2 ** 30, DATA], TiB: [8 * 2 ** 40, DATA], kbit: [1e3, DATA], Mbit: [1e6, DATA], Gbit: [1e9, DATA],
  };
  // names to try first when showing a result of a given dimension
  const NAMED = [[FORCE, 'N'], [ENERGY, 'J'], [POWER, 'W'], [PRESS, 'Pa'], [FREQ, 'Hz'], [VOLT, 'V'], [OHM, 'Ω'], [VEL, 'm/s'], [AREA, 'm²'], [VOL, 'm³'], [DATA, 'bit']];
  const SI = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd', 'bit'];
  const deq = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  const dzero = (a) => a.every((x) => Math.abs(x) < 1e-9);
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function dimString(d) {
    const named = NAMED.find(([nd]) => deq(nd, d));
    if (named) return named[1];
    const pos = [], neg = [];
    d.forEach((e, i) => {
      if (Math.abs(e) < 1e-9) return;
      const p = Math.abs(e) === 1 ? '' : String(Math.abs(e)).replace(/./g, (c) => SUP[c] || c);
      (e > 0 ? pos : neg).push(SI[i] + p);
    });
    return (pos.join('·') || '1') + (neg.length ? '/' + neg.join('·') : '');
  }
  const isUnit = (name) => Object.prototype.hasOwnProperty.call(UNITS, name);

  // Evaluates an expression with units. Returns { x (SI value), d (dimension), units: [names used] }.
  function unitEval(ast, scope = {}) {
    const vars = scope.vars || {};
    const used = [];
    const q = (x, d = D()) => ({ x, d });
    const need = (a, what) => { if (!dzero(a.d)) throw new MX.MathError(`${what} needs a plain number, not ${dimString(a.d)}`, 0); };
    const ev = (n) => {
      switch (n.t) {
        case 'num': return q(n.v);
        case 'var':
          if (n.name in vars && isFinite(vars[n.name])) return q(vars[n.name]);
          if (n.name in MX.CONSTS) return q(MX.CONSTS[n.name]);
          if (isUnit(n.name)) { used.push(n.name); const [f, d] = UNITS[n.name]; return q(f, d.slice()); }
          throw new MX.MathError(`Unknown unit or name '${n.name}'`, n.pos);
        case 'neg': { const a = ev(n.a); return q(-a.x, a.d); }
        case 'post': { const a = ev(n.a); if (n.op === '%') return q(a.x / 100, a.d); need(a, n.op); return q(MX.evaluate({ t: 'post', op: n.op, a: { t: 'num', v: a.x } }), a.d); }
        case 'bin': {
          const a = ev(n.a), b = ev(n.b);
          if (n.op === '+' || n.op === '-') {
            if (!deq(a.d, b.d)) throw new MX.MathError(`Can’t ${n.op === '+' ? 'add' : 'subtract'} ${dimString(a.d)} and ${dimString(b.d)}`, 0);
            return q(n.op === '+' ? a.x + b.x : a.x - b.x, a.d);
          }
          if (n.op === '*') return q(a.x * b.x, a.d.map((e, i) => e + b.d[i]));
          if (n.op === '/') return q(a.x / b.x, a.d.map((e, i) => e - b.d[i]));
          need(b, 'An exponent');
          return q(Math.pow(a.x, b.x), a.d.map((e) => e * b.x));
        }
        case 'call': {
          const f = n.f.toLowerCase();
          if (n.args.length === 1 && (f === 'sqrt' || f === 'cbrt')) { const a = ev(n.args[0]); const k = f === 'sqrt' ? 2 : 3; return q(Math.pow(a.x, 1 / k), a.d.map((e) => e / k)); }
          if (n.args.length === 1 && f === 'abs') { const a = ev(n.args[0]); return q(Math.abs(a.x), a.d); }
          if (!MX.M.f[f] && n.args.length === 1) { // "km(3)" style multiplication
            return ev({ t: 'bin', op: '*', a: { t: 'var', name: n.f, pos: n.pos }, b: n.args[0] });
          }
          const args = n.args.map(ev);
          args.forEach((a) => need(a, n.f + '()'));
          return q(MX.M.f[f](...args.map((a) => a.x)));
        }
      }
      throw new MX.MathError('Not a quantity', 0);
    };
    const r = ev(ast);
    return { x: r.x, d: r.d, units: used };
  }

  const TEMPS = { c: 'C', '°c': 'C', degc: 'C', celsius: 'C', f: 'F', '°f': 'F', degf: 'F', fahrenheit: 'F', k: 'K', kelvin: 'K' };
  const toK = { C: (v) => v + 273.15, F: (v) => ((v - 32) * 5) / 9 + 273.15, K: (v) => v };
  const fromK = { C: (v) => v - 273.15, F: (v) => ((v - 273.15) * 9) / 5 + 32, K: (v) => v };

  // "5 km/h in m/s", "3 ft + 20 cm", "100 °F to °C". Returns { text, alt, value } or null if this isn't a
  // units calculation. Throws for unit errors the user should see (e.g. adding metres and seconds).
  function units(src, scope = {}) {
    const fmt = (v) => MX.fmt(+v.toPrecision(10));
    const conv = /^(.*\S)\s+(?:in|to|as|into|->|→)\s+(\S.*)$/i.exec(src);
    if (conv) {
      const t1 = TEMPS[conv[2].trim().toLowerCase().replace(/\s/g, '')];
      const tm = /^\s*(-?[\d.]+)\s*(°\s*[cfk]|deg[cf]|celsius|fahrenheit|kelvin|[cfk])\s*$/i.exec(conv[1]);
      if (t1 && tm) {
        const from = TEMPS[tm[2].toLowerCase().replace(/\s/g, '')];
        const v = fromK[t1](toK[from](parseFloat(tm[1])));
        return { text: `${fmt(v)} ${t1 === 'K' ? 'K' : '°' + t1}`, value: v };
      }
    }
    let ast, target = null;
    try {
      ast = MX.parse(conv ? conv[1] : src);
      if (conv) target = MX.parse(conv[2]);
    } catch { return null; }
    const names = [...MX.names(ast).vars, ...(target ? MX.names(target).vars : [])].filter((n) => !(n in (scope.vars || {})) && !(n in MX.CONSTS));
    if (!names.length || !names.every(isUnit)) {
      if (conv && names.length && names.some(isUnit)) throw new MX.MathError(`Unknown unit: ${names.filter((n) => !isUnit(n)).join(', ')}`, 0);
      return null;
    }
    const r = unitEval(ast, scope);
    if (target) {
      const t = unitEval(target, scope);
      if (!deq(r.d, t.d)) throw new MX.MathError(`Can’t convert ${dimString(r.d)} to ${dimString(t.d)}`, 0);
      const v = r.x / t.x;
      const si = `${fmt(r.x)} ${dimString(r.d)}`, text = `${fmt(v)} ${conv[2].trim()}`;
      return { text, alt: dzero(r.d) || si === text ? '' : `= ${si}`, value: v };
    }
    if (dzero(r.d)) return { text: fmt(r.x), value: r.x };
    // show the result in the first unit of the input that has the same dimension, else in SI
    const same = r.units.find((u) => deq(UNITS[u][1], r.d));
    if (same) return { text: `${fmt(r.x / UNITS[same][0])} ${same}`, alt: `= ${fmt(r.x)} ${dimString(r.d)}`, value: r.x / UNITS[same][0] };
    return { text: `${fmt(r.x)} ${dimString(r.d)}`, value: r.x };
  }

  return { exact, qString, qToNumber, group, complex, cString, polarString, units, isUnit, UNITS };
})();

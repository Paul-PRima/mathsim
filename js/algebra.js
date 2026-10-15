// Computer algebra for the calculator: expand / factor / simplify polynomials and rational functions with
// exact rational coefficients (BigInt), symbolic derive / integrate, and vector & matrix arithmetic.
const Algebra = (() => {
  // ---------------------------------------------------------------- exact rationals
  const babs = (a) => (a < 0n ? -a : a);
  const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
  function Q(n, d = 1n) {
    if (d === 0n) throw new MX.MathError('Division by zero', 0);
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  const ZERO = Q(0n), ONE = Q(1n);
  const qadd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
  const qsub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
  const qmul = (a, b) => Q(a.n * b.n, a.d * b.d);
  const qdiv = (a, b) => Q(a.n * b.d, a.d * b.n);
  const qneg = (a) => Q(-a.n, a.d);
  const qzero = (a) => a.n === 0n;
  const qstr = (a) => (a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`);
  function literal(node) {
    if (node.raw && /^\d*\.?\d*(e[+-]?\d+)?$/i.test(node.raw)) {
      const m = /^(\d*)\.?(\d*)(?:[eE]([+-]?\d+))?$/.exec(node.raw);
      const digits = BigInt((m[1] || '0') + (m[2] || '')), exp = (m[3] ? +m[3] : 0) - (m[2] || '').length;
      return exp >= 0 ? Q(digits * 10n ** BigInt(exp)) : Q(digits, 10n ** BigInt(-exp));
    }
    if (Number.isSafeInteger(node.v)) return Q(BigInt(node.v));
    const f = MX.fraction(node.v, 1e6);
    if (f) return Q(BigInt(f[0]), BigInt(f[1]));
    throw new NotPoly();
  }
  class NotPoly extends Error { constructor(msg = 'Not a polynomial') { super(msg); } }

  // ---------------------------------------------------------------- polynomials: Map<key, { m: {var: exp}, c: Q }>
  const mkey = (m) => Object.keys(m).sort().map((v) => `${v}^${m[v]}`).join('*');
  const P = {
    const(q) { const p = new Map(); if (!qzero(q)) p.set('', { m: {}, c: q }); return p; },
    var(name) { return new Map([[`${name}^1`, { m: { [name]: 1 }, c: ONE }]]); },
    add(a, b, sign = 1) {
      const out = new Map(a);
      for (const [k, t] of b) {
        const c = out.has(k) ? (sign > 0 ? qadd(out.get(k).c, t.c) : qsub(out.get(k).c, t.c)) : sign > 0 ? t.c : qneg(t.c);
        if (qzero(c)) out.delete(k); else out.set(k, { m: t.m, c });
      }
      return out;
    },
    mul(a, b) {
      let out = new Map();
      for (const s of a.values()) for (const t of b.values()) {
        const m = { ...s.m };
        for (const [v, e] of Object.entries(t.m)) m[v] = (m[v] || 0) + e;
        out = P.add(out, new Map([[mkey(m), { m, c: qmul(s.c, t.c) }]]));
      }
      return out;
    },
    pow(a, n) { let r = P.const(ONE); for (let i = 0; i < n; i++) r = P.mul(r, a); return r; },
    scale(a, q) { const out = new Map(); for (const [k, t] of a) { const c = qmul(t.c, q); if (!qzero(c)) out.set(k, { m: t.m, c }); } return out; },
    isConst(a) { return [...a.keys()].every((k) => k === ''); },
    constVal(a) { return a.has('') ? a.get('').c : ZERO; },
    vars(a) { const s = new Set(); for (const t of a.values()) Object.keys(t.m).forEach((v) => s.add(v)); return [...s].sort(); },
    deg(a, v) { let d = 0; for (const t of a.values()) d = Math.max(d, t.m[v] || 0); return d; },
  };

  // AST → polynomial (throws NotPoly for anything else)
  function poly(n) {
    switch (n.t) {
      case 'num': return P.const(literal(n));
      case 'var': return P.var(n.name === 'pi' ? 'π' : n.name);
      case 'neg': return P.scale(poly(n.a), Q(-1n));
      case 'bin': {
        if (n.op === '+') return P.add(poly(n.a), poly(n.b));
        if (n.op === '-') return P.add(poly(n.a), poly(n.b), -1);
        if (n.op === '*') return P.mul(poly(n.a), poly(n.b));
        if (n.op === '/') { const d = poly(n.b); if (!P.isConst(d) || qzero(P.constVal(d))) throw new NotPoly('Dividing by an expression with variables'); return P.scale(poly(n.a), qdiv(ONE, P.constVal(d))); }
        if (n.op === '^') {
          const e = poly(n.b);
          if (!P.isConst(e)) throw new NotPoly('Exponents must be numbers');
          const q = P.constVal(e);
          if (q.d !== 1n || q.n < 0n || q.n > 64n) throw new NotPoly('Only whole-number powers from 0 to 64');
          return P.pow(poly(n.a), Number(q.n));
        }
      }
    }
    throw new NotPoly();
  }

  // polynomial → text, highest degree first ("3x^2y - 2x + 1/2")
  function str(p, order) {
    const vs = order || P.vars(p);
    const terms = [...p.values()].sort((s, t) => {
      const ds = Object.values(s.m).reduce((a, b) => a + b, 0), dt = Object.values(t.m).reduce((a, b) => a + b, 0);
      if (ds !== dt) return dt - ds;
      for (const v of vs) if ((s.m[v] || 0) !== (t.m[v] || 0)) return (t.m[v] || 0) - (s.m[v] || 0);
      return 0;
    });
    if (!terms.length) return '0';
    return terms.map((t, i) => {
      const neg = t.c.n < 0n, a = Q(babs(t.c.n), t.c.d);
      const mono = vs.filter((v) => t.m[v]).map((v) => (t.m[v] === 1 ? v : `${v}^${t.m[v]}`)).join('');
      let coef = mono && a.n === 1n && a.d === 1n ? '' : qstr(a);
      if (mono && a.d !== 1n) coef = `(${coef})`;
      const body = coef + mono;
      return i === 0 ? (neg ? '-' : '') + body : (neg ? ' - ' : ' + ') + body;
    }).join('');
  }

  // ---------------------------------------------------------------- one variable: dense coefficient arrays (low → high)
  function dense(p, v) {
    const c = new Array(P.deg(p, v) + 1).fill(ZERO);
    for (const t of p.values()) {
      if (Object.keys(t.m).some((w) => w !== v)) throw new NotPoly('More than one variable');
      c[t.m[v] || 0] = t.c;
    }
    return c;
  }
  const trim = (c) => { while (c.length > 1 && qzero(c[c.length - 1])) c.pop(); return c; };
  const sparse = (c, v) => { let p = new Map(); c.forEach((q, i) => { if (!qzero(q)) p = P.add(p, new Map([[i ? `${v}^${i}` : '', { m: i ? { [v]: i } : {}, c: q }]])); }); return p; };
  function divmod(a, b) { // dense rational division
    a = a.slice(); const q = new Array(Math.max(1, a.length - b.length + 1)).fill(ZERO);
    const lead = b[b.length - 1];
    for (let i = a.length - b.length; i >= 0; i--) {
      const f = qdiv(a[i + b.length - 1], lead);
      q[i] = f;
      for (let j = 0; j < b.length; j++) a[i + j] = qsub(a[i + j], qmul(f, b[j]));
    }
    return { q: trim(q), r: trim(a.slice(0, Math.max(1, b.length - 1))) };
  }
  function pgcd(a, b) {
    a = trim(a.slice()); b = trim(b.slice());
    while (!(b.length === 1 && qzero(b[0]))) { const r = divmod(a, b).r; a = b; b = r; }
    const lead = a[a.length - 1];
    return a.map((x) => qdiv(x, lead)); // monic
  }
  const evalQ = (c, x) => c.reduceRight((acc, q) => qadd(qmul(acc, x), q), ZERO);

  // ---------------------------------------------------------------- factor
  const divisors = (n) => { n = babs(n); const out = []; if (n === 0n) return [1n]; for (let i = 1n; i * i <= n && out.length < 400; i++) if (n % i === 0n) { out.push(i); if (i * i !== n) out.push(n / i); } return out; };
  function factorInt(n) {
    if (n < 2n) return n.toString();
    const parts = [];
    for (let p = 2n; p * p <= n && p < 1000000n; p += p === 2n ? 1n : 2n) { let k = 0; while (n % p === 0n) { n /= p; k++; } if (k) parts.push(k > 1 ? `${p}^${k}` : `${p}`); }
    if (n > 1n) parts.push(n.toString());
    return parts.join(' · ');
  }
  const linStr = (a, b, v) => { // a·v + b with integers a > 0
    const av = a === 1n ? v : `${a}${v}`;
    return b === 0n ? av : `${av} ${b < 0n ? '-' : '+'} ${babs(b)}`;
  };
  function factorPoly(p) {
    const vs = P.vars(p);
    if (!vs.length) {
      const q = P.constVal(p);
      if (q.d !== 1n) return qstr(q);
      return (q.n < 0n ? '-' : '') + factorInt(babs(q.n));
    }
    // common factor: rational content and the lowest power of every variable
    const terms = [...p.values()];
    let lcmD = 1n, gN = 0n;
    for (const t of terms) { lcmD = (lcmD * t.c.d) / bgcd(lcmD, t.c.d); }
    for (const t of terms) gN = bgcd(gN, (t.c.n * lcmD) / t.c.d);
    const lead = terms.reduce((best, t) => (Object.values(t.m).reduce((a, b) => a + b, 0) > Object.values(best.m).reduce((a, b) => a + b, 0) ? t : best));
    if (lead.c.n < 0n) gN = -gN;
    const content = Q(gN, lcmD);
    const minPow = {};
    for (const v of vs) minPow[v] = Math.min(...terms.map((t) => t.m[v] || 0));
    let rest = new Map();
    for (const t of terms) {
      const m = { ...t.m };
      for (const v of vs) { m[v] -= minPow[v]; if (!m[v]) delete m[v]; }
      rest = P.add(rest, new Map([[mkey(m), { m, c: qdiv(t.c, content) }]]));
    }
    const prefix = [];
    if (!(content.n === 1n && content.d === 1n)) prefix.push(content.n === -1n && content.d === 1n ? '-' : qstr(content));
    const mono = vs.filter((v) => minPow[v]).map((v) => (minPow[v] === 1 ? v : `${v}^${minPow[v]}`)).join('');
    const restVars = P.vars(rest);
    const factors = [];
    if (restVars.length === 1) {
      const v = restVars[0];
      // integer coefficients now (content removed); peel off rational roots p/q as (q·v - p)
      let c = dense(rest, v).map((q) => q.n); // all denominators are 1 here
      const found = new Map();
      for (let guard = 0; c.length > 2 && guard < 40; guard++) {
        let hit = null;
        outer: for (const pp of divisors(c[0])) for (const qq of divisors(c[c.length - 1])) for (const s of [1n, -1n]) {
          const r = Q(s * pp, qq);
          if (qzero(evalQ(c.map((x) => Q(x)), r))) { hit = r; break outer; }
        }
        if (!hit) break;
        const key = linStr(hit.d, -hit.n, v);
        found.set(key, (found.get(key) || 0) + 1);
        const { q } = divmod(c.map((x) => Q(x)), [Q(-hit.n), Q(hit.d)]);
        c = q.map((x) => x.n);
      }
      // a linear rest is one more root (the leading coefficient stays positive: the content took the sign,
      // and dividing by (q·v − p) keeps it); merge it with an identical factor found before
      if (c.length === 2) { const k = linStr(c[1], c[0], v); found.set(k, (found.get(k) || 0) + 1); }
      for (const [k, e] of found) factors.push(e > 1 ? `(${k})^${e}` : `(${k})`);
      if (c.length > 2) factors.push(`(${str(sparse(c.map((x) => Q(x)), v))})`);
    } else if (!(rest.size === 1 && P.isConst(rest))) factors.push(`(${str(rest)})`);
    const out = prefix.join('') + mono + factors.join('');
    return out || '1';
  }

  // ---------------------------------------------------------------- rational functions: { n: poly, d: poly }
  function ratfn(n) {
    try { return { n: poly(n), d: P.const(ONE) }; } catch (e) { if (!(e instanceof NotPoly)) throw e; }
    switch (n.t) {
      case 'neg': { const a = ratfn(n.a); return { n: P.scale(a.n, Q(-1n)), d: a.d }; }
      case 'bin': {
        const a = ratfn(n.a);
        if (n.op === '^') {
          const e = poly(n.b);
          if (!P.isConst(e) || P.constVal(e).d !== 1n) throw new NotPoly('Exponents must be whole numbers');
          const k = Number(P.constVal(e).n);
          if (Math.abs(k) > 32) throw new NotPoly('Power too large');
          return k >= 0 ? { n: P.pow(a.n, k), d: P.pow(a.d, k) } : { n: P.pow(a.d, -k), d: P.pow(a.n, -k) };
        }
        const b = ratfn(n.b);
        if (n.op === '+') return { n: P.add(P.mul(a.n, b.d), P.mul(b.n, a.d)), d: P.mul(a.d, b.d) };
        if (n.op === '-') return { n: P.add(P.mul(a.n, b.d), P.mul(b.n, a.d), -1), d: P.mul(a.d, b.d) };
        if (n.op === '*') return { n: P.mul(a.n, b.n), d: P.mul(a.d, b.d) };
        if (n.op === '/') { if (!b.n.size) throw new MX.MathError('Division by zero', 0); return { n: P.mul(a.n, b.d), d: P.mul(a.d, b.n) }; }
      }
    }
    throw new NotPoly('simplify works with polynomials and fractions of polynomials');
  }
  function simplify(ast) {
    let { n, d } = ratfn(ast);
    const vs = [...new Set([...P.vars(n), ...P.vars(d)])];
    if (vs.length === 1 && !P.isConst(d)) {
      const v = vs[0];
      const g = pgcd(dense(n, v), dense(d, v));
      if (g.length > 1) { n = sparse(divmod(dense(n, v), g).q, v); d = sparse(divmod(dense(d, v), g).q, v); }
    }
    // make the denominator's leading coefficient 1
    if (!P.isConst(d) || !qzero(P.constVal(d))) {
      const terms = [...d.values()];
      const lc = terms.length ? terms.reduce((best, t) => (Object.values(t.m).reduce((a, b) => a + b, 0) >= Object.values(best.m).reduce((a, b) => a + b, 0) ? t : best)).c : ONE;
      n = P.scale(n, qdiv(ONE, lc)); d = P.scale(d, qdiv(ONE, lc));
    }
    if (P.isConst(d)) return str(P.scale(n, qdiv(ONE, P.constVal(d))));
    const ns = str(n), ds = str(d);
    return `${n.size > 1 ? `(${ns})` : ns}/(${ds})`;
  }

  // polynomial antiderivative
  function integrate(ast, v) {
    const p = poly(ast);
    let out = new Map();
    for (const t of p.values()) {
      const e = (t.m[v] || 0) + 1, m = { ...t.m, [v]: e };
      out = P.add(out, new Map([[mkey(m), { m, c: qdiv(t.c, Q(BigInt(e))) }]]));
    }
    return str(out) + ' + C';
  }

  // ---------------------------------------------------------------- calculator entry point
  const CAS = new Set(['expand', 'factor', 'simplify', 'derive', 'integrate']);
  const isCAS = (ast) => ast.t === 'call' && CAS.has(ast.f.toLowerCase()) && !(ast.f.toLowerCase() === 'integrate' && ast.args.length === 4);
  function run(ast) {
    const f = ast.f.toLowerCase(), a = ast.args;
    const varOf = (i, e) => (a[i] && a[i].t === 'var' ? a[i].name : (P.vars(poly(e))[0] || 'x'));
    try {
      if (f === 'expand') { if (a.length !== 1) throw new MX.MathError('expand(expression)', 0); return str(poly(a[0])); }
      if (f === 'factor') { if (a.length !== 1) throw new MX.MathError('factor(expression)', 0); return factorPoly(poly(a[0])); }
      if (f === 'simplify') { if (a.length !== 1) throw new MX.MathError('simplify(expression)', 0); return simplify(a[0]); }
      if (f === 'derive') { if (a.length < 1 || a.length > 2) throw new MX.MathError('derive(expression, x)', 0); const v = a[1] ? a[1].name : (MX.names(a[0]).vars.has('x') ? 'x' : [...MX.names(a[0]).vars][0] || 'x'); return Sym.str(Sym.derive(a[0], v)); }
      if (f === 'integrate') { if (a.length < 1 || a.length > 2) throw new MX.MathError('integrate(polynomial, x) — or int(f, x, a, b) for a number', 0); return integrate(a[0], varOf(1, a[0])); }
    } catch (e) {
      if (e instanceof NotPoly) throw new MX.MathError(`${f}: ${e.message}`, 0);
      throw e;
    }
    return null;
  }

  // ---------------------------------------------------------------- vectors and matrices
  const isVec = (x) => Array.isArray(x) && !Array.isArray(x[0]);
  const isMat = (x) => Array.isArray(x) && Array.isArray(x[0]);
  const kind = (x) => (typeof x === 'number' ? 'number' : isMat(x) ? `${x.length}×${x[0].length} matrix` : `${x.length}-vector`);
  const LIN = new Set(['dot', 'cross', 'norm', 'det', 'inv', 'transpose', 'rank', 'trace', 'rref', 'unit', 'angle', 'identity', 'eig']);
  function usesLinalg(ast, lvars) {
    let hit = false;
    const walk = (n) => {
      if (!n || hit) return;
      if (n.t === 'tuple' || (n.t === 'var' && lvars[n.name]) || (n.t === 'call' && LIN.has(n.f.toLowerCase()))) { hit = true; return; }
      for (const k of ['a', 'b']) walk(n[k]);
      (n.args || []).forEach(walk);
      (n.items || []).forEach(walk);
    };
    walk(ast);
    return hit;
  }
  function linalg(ast, scope) {
    const vars = scope.vars || {}, lvars = scope.lvars || {};
    const err = (m) => { throw new MX.MathError(m, 0); };
    const same = (a, b) => (isMat(a) ? isMat(b) && a.length === b.length && a[0].length === b[0].length : isVec(b) && a.length === b.length);
    const zip = (a, b, f) => (isMat(a) ? a.map((r, i) => r.map((x, j) => f(x, b[i][j]))) : a.map((x, i) => f(x, b[i])));
    const map = (a, f) => (typeof a === 'number' ? f(a) : isMat(a) ? a.map((r) => r.map(f)) : a.map(f));
    const ev = (n) => {
      switch (n.t) {
        case 'num': return n.v;
        case 'var':
          if (lvars[n.name]) return lvars[n.name];
          if (n.name in vars && isFinite(vars[n.name])) return vars[n.name];
          if (n.name in MX.CONSTS) return MX.CONSTS[n.name];
          return err(`Unknown name '${n.name}'`);
        case 'tuple': {
          const items = n.items.map(ev);
          if (items.every((x) => typeof x === 'number')) return items;
          if (items.every(isVec) && items.every((r) => r.length === items[0].length)) return items;
          return err('A matrix needs rows of equal length: [[1, 2], [3, 4]]');
        }
        case 'neg': return map(ev(n.a), (x) => -x);
        case 'bin': {
          const a = ev(n.a), b = ev(n.b), na = typeof a === 'number', nb = typeof b === 'number';
          if (n.op === '+' || n.op === '-') {
            const s = n.op === '+' ? 1 : -1;
            if (na && nb) return a + s * b;
            if (!na && !nb && same(a, b)) return zip(a, b, (x, y) => x + s * y);
            return err(`Can’t ${n.op === '+' ? 'add' : 'subtract'} a ${kind(a)} and a ${kind(b)}`);
          }
          if (n.op === '*') {
            if (na) return map(b, (x) => a * x);
            if (nb) return map(a, (x) => x * b);
            if (isVec(a) && isVec(b)) { if (a.length !== b.length) err('Vectors of different lengths'); return a.reduce((s, x, i) => s + x * b[i], 0); }
            if (isMat(a) && isMat(b)) return LinAlg.mul(a, b);
            if (isMat(a) && isVec(b)) return LinAlg.mul(a, b.map((x) => [x])).map((r) => r[0]);
            if (isVec(a) && isMat(b)) return LinAlg.mul([a], b)[0];
          }
          if (n.op === '/') { if (nb) return map(a, (x) => x / b); return err('Divide by a number only — for matrices use inv()'); }
          if (n.op === '^') { if (isMat(a) && nb) return LinAlg.power(a, b); if (na && nb) return MX.M.pow(a, b); return err('Powers work for numbers and square matrices'); }
          return err('Not supported for vectors');
        }
        case 'call': {
          const f = n.f.toLowerCase(), args = n.args.map(ev);
          const v1 = args[0];
          const need = (cond, msg) => { if (!cond) err(msg); };
          switch (f) {
            case 'dot': need(isVec(args[0]) && isVec(args[1]) && args[0].length === args[1].length, 'dot(u, v) needs two vectors of the same length'); return args[0].reduce((s, x, i) => s + x * args[1][i], 0);
            case 'cross': { need(isVec(args[0]) && isVec(args[1]) && args[0].length === 3 && args[1].length === 3, 'cross(u, v) needs two 3-vectors'); const [a, b] = args; return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
            case 'norm': case 'abs': case 'length':
              if (typeof v1 === 'number') return Math.abs(v1);
              return Math.sqrt((isMat(v1) ? v1.flat() : v1).reduce((s, x) => s + x * x, 0));
            case 'unit': { need(isVec(v1), 'unit(v) needs a vector'); const l = Math.hypot(...v1); return v1.map((x) => x / l); }
            case 'angle': { need(isVec(args[0]) && isVec(args[1]), 'angle(u, v) needs two vectors'); const [a, b] = args; const c = a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b)); return Math.acos(U.clamp(c, -1, 1)) / MX.M.af; }
            case 'det': need(isMat(v1), 'det needs a square matrix'); return LinAlg.det(v1);
            case 'inv': need(isMat(v1), 'inv needs a square matrix'); return LinAlg.inverse(v1);
            case 'transpose': return isVec(v1) ? v1.map((x) => [x]) : LinAlg.transpose(v1);
            case 'rank': need(isMat(v1), 'rank needs a matrix'); return LinAlg.rank(v1);
            case 'trace': need(isMat(v1) && v1.length === v1[0].length, 'trace needs a square matrix'); return v1.reduce((s, r, i) => s + r[i], 0);
            case 'rref': need(isMat(v1), 'rref needs a matrix'); return LinAlg.rref(v1).R;
            case 'identity': need(typeof v1 === 'number' && Number.isInteger(v1) && v1 > 0 && v1 <= 12, 'identity(n) with n from 1 to 12'); return LinAlg.eye(v1);
            case 'eig': { need(isMat(v1), 'eig needs a square matrix'); const es = LinAlg.eigen(v1); need(es.every((e) => e.im === 0), 'Some eigenvalues are complex — see the Matrices section'); return es.flatMap((e) => Array(e.mult || 1).fill(e.re)); }
          }
          if (args.every((x) => typeof x === 'number') && MX.M.f[f]) return MX.M.f[f](...args);
          return err(`${n.f}() doesn’t work with vectors or matrices`);
        }
      }
      return err('Not supported for vectors and matrices');
    };
    return ev(ast);
  }
  function fmtLin(x) {
    const f = (v) => { const r = Math.abs(v) < 1e-12 ? 0 : v; const q = MX.fraction(r, 1000); return Number.isInteger(+r.toFixed(10)) ? String(Math.round(r)) : q ? `${q[0]}/${q[1]}` : MX.fmt(+r.toPrecision(10)); };
    if (typeof x === 'number') return f(x);
    if (isMat(x)) return '[' + x.map((r) => '[' + r.map(f).join(', ') + ']').join(', ') + ']';
    return '[' + x.map(f).join(', ') + ']';
  }

  return { isCAS, run, expand: (s) => str(poly(MX.parse(s))), factor: (s) => factorPoly(poly(MX.parse(s))), simplify: (s) => simplify(MX.parse(s)), usesLinalg, linalg, fmtLin, isVec, isMat, kind };
})();

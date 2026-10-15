// Symbolic differentiation and simplification on MX syntax trees (used by the tools page).
const Sym = (() => {
  const N = (v) => ({ t: 'num', v });
  const B = (op, a, b) => ({ t: 'bin', op, a, b });
  const F = (f, a) => ({ t: 'call', f, args: [a] });
  const neg = (a) => ({ t: 'neg', a });
  const has = (n, x) => {
    if (!n) return false;
    if (n.t === 'var') return n.name === x;
    return has(n.a, x) || has(n.b, x) || (n.args || []).some((a) => has(a, x));
  };
  const isNum = (n, v) => n.t === 'num' && (v === undefined || n.v === v);
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  const prec = (n) => (n.t === 'bin' ? PREC[n.op] : n.t === 'neg' ? 3 : n.t === 'num' && n.v < 0 ? 3 : 5);
  function str(n) {
    const wrap = (c, min) => (prec(c) < min ? `(${str(c)})` : str(c));
    switch (n.t) {
      case 'num': { const f = MX.fraction(n.v, 1000); return f && Math.abs(f[1]) < 1000 ? `${f[0]}/${f[1]}` : n.v === Math.PI ? 'π' : MX.fmt(n.v); }
      case 'var': return n.name;
      case 'call': return `${n.f}(${n.args.map(str).join(', ')})`;
      case 'neg': return '-' + wrap(n.a, 4);
      case 'post': return wrap(n.a, 5) + n.op;
      case 'bin': {
        const { op, a, b } = n;
        if (op === '+') return `${str(a)} + ${str(b)}`;
        if (op === '-') return `${str(a)} - ${wrap(b, 2)}`;
        if (op === '*') {
          const L = wrap(a, 2), R = wrap(b, b.t === 'bin' && b.op === '*' ? 2 : 3); // a·(b·c) = a·b·c
          // 3x, 2sin(x), 4x^2 — but 2·3 and x·y stay explicit
          if (a.t === 'num' && !/^[\d(]/.test(R) && !R.startsWith('-')) return L + R;
          return `${L}·${R}`;
        }
        if (op === '/') return `${wrap(a, 2)}/${wrap(b, 3)}`;
        return `${wrap(a, 5)}^${wrap(b, 5)}`;
      }
    }
    return '?';
  }
  const same = (a, b) => str(a) === str(b);
  function simp(n) {
    if (n.t === 'neg') {
      const a = simp(n.a);
      if (isNum(a)) return N(-a.v);
      if (a.t === 'neg') return a.a;
      return neg(a);
    }
    if (n.t === 'call') return { ...n, args: n.args.map(simp) };
    if (n.t !== 'bin') return n;
    const a = simp(n.a), b = simp(n.b), op = n.op;
    if (isNum(a) && isNum(b)) {
      const v = op === '+' ? a.v + b.v : op === '-' ? a.v - b.v : op === '*' ? a.v * b.v : op === '/' ? a.v / b.v : Math.pow(a.v, b.v);
      if (isFinite(v) && (op !== '/' || Number.isInteger(v) || MX.fraction(v, 1000))) return N(v);
    }
    switch (op) {
      case '+':
        if (isNum(a, 0)) return b;
        if (isNum(b, 0)) return a;
        if (b.t === 'neg') return simp(B('-', a, b.a));
        if (isNum(b) && b.v < 0) return B('-', a, N(-b.v));
        if (same(a, b)) return simp(B('*', N(2), a));
        break;
      case '-':
        if (isNum(b, 0)) return a;
        if (isNum(a, 0)) return simp(neg(b));
        if (b.t === 'neg') return simp(B('+', a, b.a));
        if (same(a, b)) return N(0);
        break;
      case '*':
        if (isNum(a, 0) || isNum(b, 0)) return N(0);
        if (isNum(a, 1)) return b;
        if (isNum(b, 1)) return a;
        if (isNum(a, -1)) return simp(neg(b));
        if (isNum(b, -1)) return simp(neg(a));
        if (isNum(b) && !isNum(a)) return simp(B('*', b, a));
        // f·(2x) → 2·(x·f), printed as 2x·f
        if (!isNum(a) && b.t === 'bin' && b.op === '*' && isNum(b.a)) return simp(B('*', b.a, B('*', b.b, a)));
        if (a.t === 'neg') return simp(neg(B('*', a.a, b)));
        if (b.t === 'neg') return simp(neg(B('*', a, b.a)));
        if (isNum(a) && b.t === 'bin' && b.op === '*' && isNum(b.a)) return simp(B('*', N(a.v * b.a.v), b.b));
        if (isNum(a) && b.t === 'bin' && b.op === '/' && isNum(b.a)) return simp(B('/', N(a.v * b.a.v), b.b));
        if (same(a, b)) return B('^', a, N(2));
        if (a.t === 'bin' && a.op === '^' && same(a.a, b) && isNum(a.b)) return simp(B('^', b, N(a.b.v + 1)));
        if (b.t === 'bin' && b.op === '^' && same(b.a, a) && isNum(b.b)) return simp(B('^', a, N(b.b.v + 1)));
        break;
      case '/':
        if (isNum(a, 0)) return N(0);
        if (isNum(b, 1)) return a;
        if (same(a, b)) return N(1);
        if (a.t === 'neg') return simp(neg(B('/', a.a, b)));
        break;
      case '^':
        if (isNum(b, 0)) return N(1);
        if (isNum(b, 1)) return a;
        if (isNum(a, 1)) return N(1);
        if (a.t === 'bin' && a.op === '^' && isNum(a.b) && isNum(b)) return simp(B('^', a.a, N(a.b.v * b.v)));
        break;
    }
    return B(op, a, b);
  }
  function d(n, x) {
    if (!has(n, x)) return N(0);
    switch (n.t) {
      case 'var': return N(1);
      case 'neg': return neg(d(n.a, x));
      case 'post':
        if (n.op === '%') return B('/', d(n.a, x), N(100));
        if (n.op === '°') return B('*', d(n.a, x), B('/', N(Math.PI), N(180)));
        throw new Error('Factorials of x can’t be differentiated symbolically');
      case 'bin': {
        const { op, a, b } = n, da = d(a, x), db = d(b, x);
        if (op === '+' || op === '-') return B(op, da, db);
        if (op === '*') return B('+', B('*', da, b), B('*', a, db));
        if (op === '/') return B('/', B('-', B('*', da, b), B('*', a, db)), B('^', b, N(2)));
        if (!has(b, x)) return B('*', B('*', b, B('^', a, B('-', b, N(1)))), da);
        if (!has(a, x)) return B('*', B('*', n, F('ln', a)), db);
        return B('*', n, B('+', B('*', db, F('ln', a)), B('/', B('*', b, da), a)));
      }
      case 'call': {
        const f = n.f.toLowerCase();
        if (n.args.length !== 1) {
          if (f === 'log' && n.args.length === 2 && !has(n.args[1], x)) return d(B('/', F('ln', n.args[0]), F('ln', n.args[1])), x);
          throw new Error(`Can’t differentiate ${n.f}() symbolically`);
        }
        const u = n.args[0], du = d(u, x);
        const R = {
          sin: () => F('cos', u), cos: () => neg(F('sin', u)), tan: () => B('/', N(1), B('^', F('cos', u), N(2))),
          sec: () => B('*', F('sec', u), F('tan', u)), csc: () => neg(B('*', F('csc', u), F('cot', u))), cot: () => neg(B('/', N(1), B('^', F('sin', u), N(2)))),
          asin: () => B('/', N(1), F('sqrt', B('-', N(1), B('^', u, N(2))))), acos: () => neg(B('/', N(1), F('sqrt', B('-', N(1), B('^', u, N(2)))))),
          atan: () => B('/', N(1), B('+', N(1), B('^', u, N(2)))),
          sinh: () => F('cosh', u), cosh: () => F('sinh', u), tanh: () => B('/', N(1), B('^', F('cosh', u), N(2))),
          asinh: () => B('/', N(1), F('sqrt', B('+', B('^', u, N(2)), N(1)))), acosh: () => B('/', N(1), F('sqrt', B('-', B('^', u, N(2)), N(1)))), atanh: () => B('/', N(1), B('-', N(1), B('^', u, N(2)))),
          exp: () => F('exp', u), ln: () => B('/', N(1), u), log: () => B('/', N(1), B('*', u, F('ln', N(10)))), log2: () => B('/', N(1), B('*', u, F('ln', N(2)))), log10: () => B('/', N(1), B('*', u, F('ln', N(10)))),
          sqrt: () => B('/', N(1), B('*', N(2), F('sqrt', u))), cbrt: () => B('/', N(1), B('*', N(3), B('^', F('cbrt', u), N(2)))),
          abs: () => F('sign', u),
        }[f];
        if (!R) throw new Error(`Can’t differentiate ${n.f}() symbolically`);
        return B('*', R(), du);
      }
    }
    throw new Error('Can’t differentiate this expression');
  }
  const derive = (ast, x) => { let r = simp(d(ast, x)); for (let i = 0; i < 4; i++) r = simp(r); return r; };
  return { derive, str, simp, d, has };
})();

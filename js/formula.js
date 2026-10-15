// Parses a complex-number formula like "z^2 + c" and emits GLSL that works on vec2 complex values.
const Formula = (() => {
  class FormulaError extends Error {
    constructor(msg, pos) {
      super(msg);
      this.pos = pos;
    }
  }

  // name -> [arity, glsl function, description]
  const FUNCS = {
    sin: [1, 'csin', 'sine'],
    cos: [1, 'ccos', 'cosine'],
    tan: [1, 'ctan', 'tangent'],
    sinh: [1, 'csinh', 'hyperbolic sine'],
    cosh: [1, 'ccosh', 'hyperbolic cosine'],
    tanh: [1, 'ctanh', 'hyperbolic tangent'],
    asin: [1, 'casin', 'arc sine'],
    acos: [1, 'cacos', 'arc cosine'],
    atan: [1, 'catan', 'arc tangent'],
    exp: [1, 'cexp', 'e^z'],
    log: [1, 'clog', 'natural log'],
    ln: [1, 'clog', 'natural log'],
    sqrt: [1, 'csqrt', 'square root'],
    sqr: [1, 'csqr', 'z·z'],
    inv: [1, 'cinv', '1/z'],
    conj: [1, 'cconj', 'complex conjugate'],
    abs: [1, 'cabsc', 'abs of re and im separately (Burning Ship)'],
    re: [1, 'cre', 'real part'],
    im: [1, 'cim', 'imaginary part (as a real number)'],
    arg: [1, 'carg', 'angle'],
    mag: [1, 'cmag', 'magnitude |z|'],
    norm: [1, 'cnorm', '|z|²'],
    flip: [1, 'cflip', 'swap re and im'],
    floor: [1, 'cfloor', 'floor of re and im'],
    round: [1, 'cround', 'round re and im'],
    pow: [2, 'cpow', 'pow(a, b)'],
  };

  const FORMULA_VARS = {
    z: 'z',
    c: 'c',
    p: 'p',
    zp: 'zp',
    n: 'vec2(float(n), 0.0)',
    t: 'vec2(uTime, 0.0)',
    k: 'uK',
    x: 'vec2(z.x, 0.0)',
    y: 'vec2(z.y, 0.0)',
  };
  const INIT_VARS = { p: 'p', c: 'c', k: 'uK', t: 'vec2(uTime, 0.0)' };

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      const rest = src.slice(i);
      const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
      if (num) { toks.push({ t: 'num', v: parseFloat(num[0]), pos: i }); i += num[0].length; continue; }
      const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
      if (id) { toks.push({ t: 'id', v: id[0].toLowerCase(), pos: i }); i += id[0].length; continue; }
      if (rest.startsWith('**')) { toks.push({ t: 'op', v: '^', pos: i }); i += 2; continue; }
      if ('+-*/^(),|'.includes(ch)) { toks.push({ t: 'op', v: ch, pos: i }); i++; continue; }
      throw new FormulaError(`Unexpected character '${ch}'`, i);
    }
    toks.push({ t: 'eof', pos: src.length });
    return toks;
  }

  function parse(src) {
    const toks = tokenize(src);
    let k = 0;
    const peek = () => toks[k];
    const next = () => toks[k++];
    const isOp = (v) => peek().t === 'op' && peek().v === v;
    const expect = (v) => {
      if (!isOp(v)) throw new FormulaError(`Expected '${v}'`, peek().pos);
      next();
    };
    const startsPrimary = () => {
      const p = peek();
      return p.t === 'num' || p.t === 'id' || (p.t === 'op' && p.v === '(');
    };

    function expr() {
      let a = mul();
      while (isOp('+') || isOp('-')) {
        const op = next().v;
        a = { t: 'bin', op, a, b: mul() };
      }
      return a;
    }
    function mul() {
      let a = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = next().v;
          a = { t: 'bin', op, a, b: unary() };
        } else if (startsPrimary()) {
          a = { t: 'bin', op: '*', a, b: unary() }; // implicit multiplication: 2z, 3(z+1)
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
      const base = primary();
      if (isOp('^')) { next(); return { t: 'bin', op: '^', a: base, b: unary() }; }
      return base;
    }
    function primary() {
      const tk = peek();
      if (tk.t === 'num') { next(); return { t: 'num', re: tk.v, im: 0 }; }
      if (tk.t === 'id') {
        next();
        const name = tk.v;
        if (isOp('(')) {
          const f = FUNCS[name];
          if (!f) throw new FormulaError(`Unknown function '${name}'`, tk.pos);
          next();
          const args = [];
          if (!isOp(')')) {
            args.push(expr());
            while (isOp(',')) { next(); args.push(expr()); }
          }
          expect(')');
          if (args.length !== f[0]) throw new FormulaError(`${name}() takes ${f[0]} argument${f[0] > 1 ? 's' : ''}`, tk.pos);
          return { t: 'call', f: name, args };
        }
        if (name === 'i') return { t: 'num', re: 0, im: 1 };
        if (name === 'pi') return { t: 'num', re: Math.PI, im: 0 };
        if (name === 'e') return { t: 'num', re: Math.E, im: 0 };
        return { t: 'var', name, pos: tk.pos };
      }
      if (isOp('(')) { next(); const e = expr(); expect(')'); return e; }
      if (isOp('|')) { next(); const e = expr(); expect('|'); return { t: 'call', f: 'mag', args: [e] }; }
      throw new FormulaError(tk.t === 'eof' ? 'Formula ends unexpectedly' : `Unexpected '${tk.v}'`, tk.pos);
    }

    if (peek().t === 'eof') throw new FormulaError('Formula is empty', 0);
    const ast = expr();
    if (peek().t !== 'eof') throw new FormulaError(`Unexpected '${peek().v}'`, peek().pos);
    return ast;
  }

  // Complex arithmetic on constant nodes so "2*pi*i" becomes a single literal.
  function fold(n) {
    if (n.t === 'neg') {
      const a = fold(n.a);
      return a.t === 'num' ? { t: 'num', re: -a.re, im: -a.im } : { t: 'neg', a };
    }
    if (n.t === 'call') return { ...n, args: n.args.map(fold) };
    if (n.t !== 'bin') return n;
    const a = fold(n.a), b = fold(n.b);
    if (a.t === 'num' && b.t === 'num') {
      switch (n.op) {
        case '+': return { t: 'num', re: a.re + b.re, im: a.im + b.im };
        case '-': return { t: 'num', re: a.re - b.re, im: a.im - b.im };
        case '*': return { t: 'num', re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
        case '/': {
          const d = b.re * b.re + b.im * b.im;
          if (d !== 0) return { t: 'num', re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
          break;
        }
        case '^':
          if (a.im === 0 && b.im === 0 && a.re > 0) return { t: 'num', re: Math.pow(a.re, b.re), im: 0 };
          break;
      }
    }
    return { ...n, a, b };
  }

  function f(v) {
    if (!isFinite(v)) throw new FormulaError('Number out of range', 0);
    return Number.isInteger(v) && Math.abs(v) < 1e15 ? v.toFixed(1) : String(v);
  }
  const isReal = (n) => n.t === 'num' && n.im === 0;

  function gen(n, vars) {
    switch (n.t) {
      case 'num': return `vec2(${f(n.re)}, ${f(n.im)})`;
      case 'var':
        if (!(n.name in vars)) {
          const hint = FUNCS[n.name] ? ` — functions need parentheses, e.g. ${n.name}(z)` : '';
          throw new FormulaError(`Unknown name '${n.name}'${hint}`, n.pos);
        }
        return vars[n.name];
      case 'neg': return `(-${gen(n.a, vars)})`;
      case 'call': return `${FUNCS[n.f][1]}(${n.args.map((a) => gen(a, vars)).join(', ')})`;
      case 'bin': {
        const { op, a, b } = n;
        if (op === '+' || op === '-') return `(${gen(a, vars)} ${op} ${gen(b, vars)})`;
        if (op === '*') {
          if (isReal(a)) return `(${f(a.re)} * ${gen(b, vars)})`;
          if (isReal(b)) return `(${gen(a, vars)} * ${f(b.re)})`;
          return `cmul(${gen(a, vars)}, ${gen(b, vars)})`;
        }
        if (op === '/') {
          if (isReal(b) && b.re !== 0) return `(${gen(a, vars)} / ${f(b.re)})`;
          return `cdiv(${gen(a, vars)}, ${gen(b, vars)})`;
        }
        if (op === '^') {
          const A = gen(a, vars);
          if (isReal(b)) {
            const v = b.re;
            if (Number.isInteger(v) && Math.abs(v) <= 4096) {
              if (v === 0) return 'vec2(1.0, 0.0)';
              if (v === 1) return A;
              if (v === 2) return `csqr(${A})`;
              if (v === 3) return `ccube(${A})`;
              if (v === -1) return `cinv(${A})`;
              return `cpowi(${A}, ${v})`;
            }
            return `cpowr(${A}, ${f(v)})`;
          }
          return `cpow(${A}, ${gen(b, vars)})`;
        }
      }
    }
    throw new FormulaError('Could not compile formula', 0);
  }

  function compile(src, vars) {
    return gen(fold(parse(String(src))), vars);
  }

  function usesVar(src, name) {
    try {
      const walk = (n) =>
        (n.t === 'var' && n.name === name) ||
        (n.t === 'neg' && walk(n.a)) ||
        (n.t === 'bin' && (walk(n.a) || walk(n.b))) ||
        (n.t === 'call' && n.args.some(walk));
      return walk(parse(String(src)));
    } catch {
      return false;
    }
  }

  const ast = (src) => fold(parse(String(src)));

  return { compile, ast, usesVar, FormulaError, FUNCS, FORMULA_VARS, INIT_VARS, f };
})();

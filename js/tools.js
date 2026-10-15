// Algebra & tools: equation solver, polynomial roots, symbolic derivatives and integrals, triangle solver,
// number theory, GCD / LCM, base conversion, unit conversion and sequences.
(() => {
  const { el } = U;
  const KEY = 'mathsim.tools.v1';
  const f6 = (v) => MX.fmt(+(+v).toPrecision(10));
  const st = {
    eq: 'x^3 - 2x = 5', eqLo: '-100', eqHi: '100',
    poly: 'x^4 - 5x^2 + 4',
    calc: 'x^2 sin(x)', calcA: '1', calcB: '3',
    tri: { a: '3', b: '4', c: '5', A: '', B: '', C: '' },
    num: '360', gcd: '84, 126, 210', base: 'FF', baseFrom: '16', baseTo: '2',
    unitCat: 'length', unitVal: '1', unitFrom: 'mi',
    seq: '1/n^2', seqFrom: '1', seqTo: '20',
  };
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) { Object.assign(st, s); st.tri = Object.assign({ a: '', b: '', c: '', A: '', B: '', C: '' }, s.tri); } } catch { /* fresh */ } }
  const save = U.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } }, 300);

  const field = (label, key, attrs = {}, onChange) => {
    const inp = el('input', Object.assign({ type: 'text', class: 'mono', value: st[key], spellcheck: 'false' }, attrs));
    inp.addEventListener('input', () => { st[key] = inp.value; save(); onChange(); });
    return label ? el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, label), inp) : inp;
  };
  const card = (title, sub, ...kids) => el('section', { class: 'pane tool-card' }, el('h3', {}, title), sub ? el('p', { class: 'hint' }, sub) : null, ...kids);
  const errP = (m) => el('p', { class: 'err-text' }, m);
  const freeVar = (ast) => {
    const { free } = MX.compile(ast, [], { vars: {}, funcs: {} });
    return [...free];
  };


  // ---------------------------------------------------------------- equation solver
  function solverCard() {
    const out = el('div');
    const cv = el('canvas', { class: 'chart short' });
    function update() {
      try {
        MX.M.af = 1;
        const ast = MX.parse(st.eq);
        const fx = ast.t === 'cmp' && ast.op === '=' ? { t: 'bin', op: '-', a: ast.a, b: ast.b } : ast;
        const vars = freeVar(fx);
        if (vars.length !== 1) throw new Error(vars.length ? `Use a single unknown (found ${vars.join(', ')})` : 'The equation has no unknown');
        const v = vars[0];
        const { fn } = MX.compile(fx, [v], {});
        const lo = MX.evaluate(st.eqLo), hi = MX.evaluate(st.eqHi);
        if (!(hi > lo)) throw new Error('The search range needs from < to');
        const roots = MX.findRoots(fn, lo, hi, 40000).map((r) => (Math.abs(r - Math.round(r)) < 1e-10 ? Math.round(r) : r));
        out.replaceChildren(roots.length
          ? el('div', {}, el('div', { class: 'st-big mono' }, roots.slice(0, 20).map((r) => `${v} = ${f6(r)}`).join('    ')),
            el('p', { class: 'hint' }, `${roots.length} real solution${roots.length > 1 ? 's' : ''} between ${f6(lo)} and ${f6(hi)}` + roots.slice(0, 3).map((r) => { const a = MX.altForms(r); return a.length ? ` · ${f6(r)} = ${a[0]}` : ''; }).join('')))
          : el('p', {}, 'No real solutions in this range.'));
        requestAnimationFrame(() => {
          const span = roots.length ? [Math.min(...roots), Math.max(...roots)] : [Math.max(lo, -10), Math.min(hi, 10)];
          const pad = Math.max(1, (span[1] - span[0]) * 0.3);
          const x0 = span[0] - pad, x1 = span[1] + pad;
          const ys = Array.from({ length: 200 }, (_, i) => fn(x0 + ((x1 - x0) * i) / 199)).filter(isFinite).sort((p, q) => p - q);
          const ylo = ys[Math.floor(ys.length * 0.05)] ?? -1, yhi = ys[Math.floor(ys.length * 0.95)] ?? 1;
          const fr = Charts.frame(cv, { xmin: x0, xmax: x1, ymin: Math.min(ylo, 0) - 1, ymax: Math.max(yhi, 0) + 1 });
          fr.ctx.strokeStyle = '#8a90a0'; fr.ctx.beginPath(); fr.ctx.moveTo(fr.x0, fr.Y(0)); fr.ctx.lineTo(fr.x1, fr.Y(0)); fr.ctx.stroke();
          Charts.curve(fr, fn, x0, x1, '#4dabf7', 2);
          fr.ctx.fillStyle = '#ff922b';
          for (const r of roots) { fr.ctx.beginPath(); fr.ctx.arc(fr.X(r), fr.Y(0), 4, 0, Math.PI * 2); fr.ctx.fill(); }
        });
      } catch (e) { out.replaceChildren(errP(e.message)); Charts.setup(cv); }
    }
    const c = card('Equation solver', 'Finds every real solution of an equation in one unknown, e.g. cos(x) = x/3 or 2^x = x^2.',
      field('Equation', 'eq', {}, update), el('div', { class: 'grid2' }, field('Search from', 'eqLo', {}, update), field('to', 'eqHi', {}, update)), out, cv);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- polynomial roots
  // Coefficients (low → high) of a polynomial given as an expression, found from exact sample values.
  function polyCoefs(src) {
    MX.M.af = 1;
    const txt = src.trim();
    if (/^[-+\d.,\s/e]+$/i.test(txt) && txt.includes(',')) return txt.split(',').map((s) => MX.evaluate(s)).reverse(); // "1, 0, -2" (highest first)
    const ast = MX.parse(txt);
    const fx = ast.t === 'cmp' && ast.op === '=' ? { t: 'bin', op: '-', a: ast.a, b: ast.b } : ast;
    const vars = freeVar(fx);
    if (vars.length > 1) throw new Error('Use one variable, e.g. x');
    const { fn } = MX.compile(fx, vars.length ? vars : ['x'], {});
    const xs = Array.from({ length: 16 }, (_, i) => i - 7), ys = xs.map(fn);
    if (!ys.every(isFinite)) throw new Error('That isn’t a polynomial');
    // degree = order of the last non-zero finite difference
    let diffs = ys.slice(), deg = -1;
    const sc = Math.max(1, ...ys.map(Math.abs));
    for (let k = 0; k < 15; k++) {
      if (diffs.every((v) => Math.abs(v) < 1e-9 * sc)) { deg = k - 1; break; }
      diffs = diffs.slice(1).map((v, i) => v - diffs[i]);
    }
    if (deg < 0 && !diffs.every((v) => Math.abs(v) < 1e-9 * sc)) throw new Error('That isn’t a polynomial (or its degree is above 13)');
    if (deg < 1) throw new Error('A constant has no roots to find');
    const pts = Array.from({ length: deg + 1 }, (_, i) => i - Math.floor(deg / 2));
    const A = pts.map((x) => Array.from({ length: deg + 1 }, (_, j) => x ** j)), b = pts.map((x) => [fn(x)]);
    const c = LinAlg.solve(A, b).X.map((r) => r[0]);
    return c.map((v) => (Math.abs(v - Math.round(v)) < 1e-8 * Math.max(1, Math.abs(v)) ? Math.round(v) : v));
  }
  function polyCard() {
    const out = el('div');
    function update() {
      try {
        const c = polyCoefs(st.poly);
        const roots = LinAlg.polyRoots(c);
        // polish real roots with Newton on the original polynomial
        const P = (x) => c.reduce((s, v, i) => s + v * x ** i, 0), dP = (x) => c.reduce((s, v, i) => s + (i ? i * v * x ** (i - 1) : 0), 0);
        const pol = roots.map(([re, im]) => {
          if (im !== 0) return [re, im];
          let x = re;
          for (let i = 0; i < 30; i++) { const d = dP(x); if (!d) break; const nx = x - P(x) / d; if (!isFinite(nx) || Math.abs(nx - x) < 1e-15) break; x = nx; }
          if (Math.abs(x - Math.round(x)) < 1e-9) x = Math.round(x);
          return [x, 0];
        });
        const terms = [];
        for (let i = c.length - 1; i >= 0; i--) {
          if (!c[i]) continue;
          const v = c[i], mag = Math.abs(v) === 1 && i ? '' : f6(Math.abs(v));
          terms.push(`${terms.length ? (v < 0 ? ' − ' : ' + ') : v < 0 ? '−' : ''}${mag}${i === 0 ? '' : i === 1 ? 'x' : 'x^' + i}`);
        }
        const show = ([re, im]) => (im === 0 ? f6(re) + (MX.altForms(re)[0] ? `  (= ${MX.altForms(re)[0]})` : '') : `${f6(re)} ${im < 0 ? '−' : '+'} ${f6(Math.abs(im))}i`);
        const real = pol.filter(([, im]) => im === 0);
        out.replaceChildren(
          el('p', { class: 'mono' }, terms.join(''), el('span', { class: 'hint' }, `   degree ${c.length - 1}`)),
          el('table', { class: 'kv-table' }, el('tbody', {}, pol.map((r, i) => el('tr', {}, el('th', {}, `x${'₁₂₃₄₅₆₇₈₉'[i] || '_' + (i + 1)}`), el('td', { class: 'mono' }, show(r)))))),
          el('p', { class: 'hint' }, `${real.length} real, ${pol.length - real.length} complex · sum of roots ${f6(-c[c.length - 2] / c[c.length - 1])} · product ${f6(((c.length - 1) % 2 ? -1 : 1) * c[0] / c[c.length - 1])}`));
      } catch (e) { out.replaceChildren(errP(e.message)); }
    }
    const c = card('Polynomial roots', 'All roots, real and complex. Type a polynomial (x^3 - 6x^2 + 11x - 6) or coefficients from the highest power (1, -6, 11, -6).',
      field('Polynomial', 'poly', {}, update), out);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- calculus
  function calcCard() {
    const out = el('div');
    const cv = el('canvas', { class: 'chart' });
    function update() {
      try {
        MX.M.af = 1;
        const ast = MX.parse(st.calc);
        const vars = freeVar(ast);
        if (vars.length > 1) throw new Error(`Use one variable (found ${vars.join(', ')})`);
        const x = vars[0] || 'x';
        const { fn: f } = MX.compile(ast, [x], {});
        const a = MX.evaluate(st.calcA), b = MX.evaluate(st.calcB);
        let d1 = null, d2 = null, d1f, d2f;
        try {
          d1 = Sym.derive(ast, x); d2 = Sym.derive(d1, x);
          d1f = MX.compile(d1, [x], {}).fn; d2f = MX.compile(d2, [x], {}).fn;
        } catch (e) { d1 = null; d1f = (t) => MX.diff(f, t); d2f = (t) => MX.diff(d1f, t); out.dataset.note = e.message; }
        const I = MX.integral(f, a, b);
        const fa = f(a), s1 = d1f(a);
        // two-sided limit at a, estimated from shrinking steps
        let lim = NaN;
        if (!isFinite(fa)) {
          const L = [1e-3, 1e-5, 1e-7].map((h) => (f(a - h) + f(a + h)) / 2);
          if (L.every(isFinite) && Math.abs(L[2] - L[1]) < 1e-4 * Math.max(1, Math.abs(L[2]))) lim = L[2];
        }
        out.replaceChildren(
          el('table', { class: 'kv-table' }, el('tbody', {},
            el('tr', {}, el('th', {}, `f′(${x})`), el('td', { class: 'mono' }, d1 ? Sym.str(d1) : 'numeric only — ' + (out.dataset.note || ''))),
            d1 ? el('tr', {}, el('th', {}, `f″(${x})`), el('td', { class: 'mono' }, Sym.str(d2))) : null,
            el('tr', {}, el('th', {}, `f(${f6(a)})`), el('td', { class: 'mono' }, isFinite(fa) ? f6(fa) : `undefined${isFinite(lim) ? ` · limit ≈ ${f6(lim)}` : ''}`)),
            el('tr', {}, el('th', {}, `f′(${f6(a)})`), el('td', { class: 'mono' }, f6(s1))),
            el('tr', {}, el('th', {}, `f″(${f6(a)})`), el('td', { class: 'mono' }, f6(d2f(a)))),
            el('tr', {}, el('th', {}, `tangent at ${f6(a)}`), el('td', { class: 'mono' }, isFinite(fa) && isFinite(s1) ? `y = ${f6(s1)}${x === 'x' ? 'x' : '·' + x} ${fa - s1 * a < 0 ? '−' : '+'} ${f6(Math.abs(fa - s1 * a))}` : '—')),
            el('tr', {}, el('th', {}, `∫ from ${f6(a)} to ${f6(b)}`), el('td', { class: 'mono' }, f6(I) + (MX.altForms(I)[0] ? `  (≈ ${MX.altForms(I)[0]})` : ''))),
            el('tr', {}, el('th', {}, 'average value'), el('td', { class: 'mono' }, b !== a ? f6(I / (b - a)) : '—')))));
        requestAnimationFrame(() => {
          const lo = Math.min(a, b), hi = Math.max(a, b), pad = Math.max(1, (hi - lo) * 0.5);
          const x0 = lo - pad, x1 = hi + pad;
          const ys = Array.from({ length: 300 }, (_, i) => f(x0 + ((x1 - x0) * i) / 299)).filter(isFinite).sort((p, q) => p - q);
          const ylo = Math.min(0, ys[Math.floor(ys.length * 0.02)] ?? -1), yhi = Math.max(0, ys[Math.floor(ys.length * 0.98)] ?? 1);
          const yp = (yhi - ylo) * 0.1 || 1;
          const fr = Charts.frame(cv, { xmin: x0, xmax: x1, ymin: ylo - yp, ymax: yhi + yp });
          const { ctx, X, Y } = fr;
          ctx.save(); ctx.beginPath(); ctx.rect(fr.x0, fr.y0, fr.x1 - fr.x0, fr.y1 - fr.y0); ctx.clip();
          ctx.fillStyle = 'rgba(81,207,102,0.3)';
          ctx.beginPath(); ctx.moveTo(X(lo), Y(0));
          for (let i = 0; i <= 200; i++) { const t = lo + ((hi - lo) * i) / 200, y = f(t); ctx.lineTo(X(t), Y(isFinite(y) ? y : 0)); }
          ctx.lineTo(X(hi), Y(0)); ctx.fill();
          ctx.strokeStyle = '#8a90a0'; ctx.beginPath(); ctx.moveTo(fr.x0, Y(0)); ctx.lineTo(fr.x1, Y(0)); ctx.stroke();
          ctx.restore();
          Charts.curve(fr, f, x0, x1, '#4dabf7', 2.2);
          if (isFinite(fa) && isFinite(s1)) {
            Charts.curve(fr, (t) => fa + s1 * (t - a), x0, x1, '#ff922b', 1.5);
            ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.arc(X(a), Y(fa), 4, 0, Math.PI * 2); ctx.fill();
          }
        });
      } catch (e) { out.replaceChildren(errP(e.message)); Charts.setup(cv); }
    }
    const c = card('Derivatives & integrals', 'Symbolic first and second derivatives, the tangent line at a, and the integral from a to b (shaded).',
      field('f(x) =', 'calc', {}, update), el('div', { class: 'grid2' }, field('a (point / lower limit)', 'calcA', {}, update), field('b (upper limit)', 'calcB', {}, update)), out, cv);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- triangle solver
  function solveTriangle(given) {
    const r = Math.PI / 180;
    const s = ['a', 'b', 'c'].map((k) => given[k]), g = ['A', 'B', 'C'].map((k) => given[k]);
    const known = (arr) => arr.filter((v) => v != null).length;
    if (s.some((v) => v != null && !(v > 0))) throw new Error('Sides must be positive');
    if (g.some((v) => v != null && !(v > 0 && v < 180))) throw new Error('Angles must be between 0° and 180°');
    if (known(s) + known(g) < 3) throw new Error('Enter three values, including at least one side');
    if (!known(s)) throw new Error('Three angles fix the shape but not the size — enter a side');
    if (known(g) === 2) { const i = g.findIndex((v) => v == null); g[i] = 180 - g.reduce((p, v) => p + (v || 0), 0); if (!(g[i] > 0)) throw new Error('The angles add up to 180° or more'); }
    if (known(g) === 3 && Math.abs(g[0] + g[1] + g[2] - 180) > 1e-6) throw new Error('The three angles must add up to 180°');
    const finish = (S, G) => {
      const area = 0.5 * S[0] * S[1] * Math.sin(G[2] * r);
      return { s: S, g: G, area, perimeter: S[0] + S[1] + S[2] };
    };
    const fromSides = (S) => {
      const [a, b, c] = S;
      if (a + b <= c || a + c <= b || b + c <= a) throw new Error('These sides can’t form a triangle (each must be shorter than the other two together)');
      const A = Math.acos((b * b + c * c - a * a) / (2 * b * c)) / r, B = Math.acos((a * a + c * c - b * b) / (2 * a * c)) / r;
      return finish(S, [A, B, 180 - A - B]);
    };
    if (known(g) === 3) {
      const i = s.findIndex((v) => v != null), k = s[i] / Math.sin(g[i] * r);
      return [finish(g.map((A) => k * Math.sin(A * r)), g)];
    }
    if (known(s) === 3) return [fromSides(s)];
    const ai = g.findIndex((v) => v != null);
    if (ai < 0) throw new Error('Enter an angle');
    if (s[ai] == null) { // SAS: the angle between two known sides
      const [j, k] = [0, 1, 2].filter((i) => i !== ai);
      const S = s.slice();
      S[ai] = Math.sqrt(s[j] ** 2 + s[k] ** 2 - 2 * s[j] * s[k] * Math.cos(g[ai] * r));
      return [fromSides(S)];
    }
    // SSA: the angle is opposite a known side; 0, 1 or 2 triangles
    const j = [0, 1, 2].find((i) => i !== ai && s[i] != null);
    const sinJ = (s[j] * Math.sin(g[ai] * r)) / s[ai];
    if (sinJ > 1 + 1e-12) throw new Error('No triangle has these measurements (the side opposite the angle is too short)');
    const J1 = Math.asin(Math.min(1, sinJ)) / r;
    const out = [];
    for (const J of Math.abs(J1 - 90) < 1e-9 ? [J1] : [J1, 180 - J1]) {
      const K = 180 - g[ai] - J;
      if (K <= 1e-9) continue;
      const G = [0, 0, 0], k = 3 - ai - j;
      G[ai] = g[ai]; G[j] = J; G[k] = K;
      const ratio = s[ai] / Math.sin(g[ai] * r);
      out.push(finish(G.map((A) => ratio * Math.sin(A * r)), G));
    }
    if (!out.length) throw new Error('No triangle has these measurements');
    return out;
  }
  function triangleCard() {
    const out = el('div');
    const cv = el('canvas', { class: 'chart tri' });
    const inputs = {};
    function update() {
      try {
        const given = {};
        for (const k of ['a', 'b', 'c', 'A', 'B', 'C']) {
          const t = st.tri[k].trim();
          given[k] = t === '' ? null : MX.evaluate(t);
        }
        const sols = solveTriangle(given);
        const kind = (T) => {
          const sides = T.s.map((v) => +v.toPrecision(9)), angles = T.g.map((v) => +v.toPrecision(9));
          const bySide = sides[0] === sides[1] && sides[1] === sides[2] ? 'equilateral' : sides[0] === sides[1] || sides[1] === sides[2] || sides[0] === sides[2] ? 'isosceles' : 'scalene';
          const byAngle = angles.some((v) => Math.abs(v - 90) < 1e-7) ? 'right' : angles.some((v) => v > 90) ? 'obtuse' : 'acute';
          return `${byAngle}, ${bySide}`;
        };
        out.replaceChildren(...sols.map((T, n) => el('div', {},
          sols.length > 1 ? el('h4', {}, `Solution ${n + 1} of 2`) : null,
          el('table', { class: 'kv-table' }, el('tbody', {},
            el('tr', {}, el('th', {}, 'sides a, b, c'), el('td', { class: 'mono' }, T.s.map(f6).join(',  '))),
            el('tr', {}, el('th', {}, 'angles A, B, C'), el('td', { class: 'mono' }, T.g.map((v) => f6(v) + '°').join(',  '))),
            el('tr', {}, el('th', {}, 'area'), el('td', { class: 'mono' }, f6(T.area))),
            el('tr', {}, el('th', {}, 'perimeter'), el('td', { class: 'mono' }, f6(T.perimeter))),
            el('tr', {}, el('th', {}, 'type'), el('td', {}, kind(T))))))));
        requestAnimationFrame(() => drawTri(sols[0]));
      } catch (e) { out.replaceChildren(errP(e.message)); Charts.setup(cv); }
    }
    function drawTri(T) {
      const { ctx, w, h } = Charts.setup(cv);
      const [a, b, c] = T.s, A = T.g[0] * Math.PI / 180;
      // vertex A at origin, B along the x-axis (side c), C using angle A and side b
      const P = [[0, 0], [c, 0], [b * Math.cos(A), b * Math.sin(A)]];
      const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      const sc = Math.min((w - 60) / (Math.max(...xs) - Math.min(...xs)), (h - 50) / (Math.max(...ys) - Math.min(...ys) || 1));
      const ox = (w - (Math.max(...xs) + Math.min(...xs)) * sc) / 2, oy = (h + (Math.max(...ys) + Math.min(...ys)) * sc) / 2;
      const Q = P.map(([x, y]) => [ox + x * sc, oy - y * sc]);
      ctx.fillStyle = 'rgba(77,171,247,0.18)'; ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 2;
      ctx.beginPath(); Q.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#e8eaf0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx = (Q[0][0] + Q[1][0] + Q[2][0]) / 3, cy = (Q[0][1] + Q[1][1] + Q[2][1]) / 3;
      ['A', 'B', 'C'].forEach((n, i) => { const dx = Q[i][0] - cx, dy = Q[i][1] - cy, d = Math.hypot(dx, dy) || 1; ctx.fillText(n, Q[i][0] + (dx / d) * 14, Q[i][1] + (dy / d) * 14); });
      ctx.fillStyle = '#8a90a0';
      [['a', 1, 2], ['b', 0, 2], ['c', 0, 1]].forEach(([n, i, j]) => {
        const mx = (Q[i][0] + Q[j][0]) / 2, my = (Q[i][1] + Q[j][1]) / 2, dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1;
        ctx.fillText(n, mx + (dx / d) * 12, my + (dy / d) * 12);
      });
      void a;
    }
    const grid = el('div', { class: 'tri-grid' }, ['a', 'b', 'c', 'A', 'B', 'C'].map((k) => {
      const inp = el('input', { type: 'text', class: 'mono', value: st.tri[k], placeholder: '?' });
      inp.addEventListener('input', () => { st.tri[k] = inp.value; save(); update(); });
      inputs[k] = inp;
      return el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, k === k.toLowerCase() ? `side ${k}` : `angle ${k} (°)`), inp);
    }));
    const c = card('Triangle solver', 'Give any three of the sides and angles (at least one side). Angle A is opposite side a, and so on.',
      grid, el('div', { class: 'btn-row' }, U.el('button', { type: 'button', class: 'small', onclick: () => { for (const k in inputs) { inputs[k].value = ''; st.tri[k] = ''; } update(); } }, 'Clear')), out, cv);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- number theory (BigInt)
  const babs = (n) => (n < 0n ? -n : n);
  const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
  function modpow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
  const SMALL = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  function isPrime(n) {
    if (n < 2n) return false;
    for (const p of SMALL) { if (n === p) return true; if (n % p === 0n) return false; }
    let d = n - 1n, r = 0;
    while (!(d & 1n)) { d >>= 1n; r++; }
    outer: for (const a of SMALL) {
      let x = modpow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      for (let i = 1; i < r; i++) { x = (x * x) % n; if (x === n - 1n) continue outer; }
      return false;
    }
    return true;
  }
  function rho(n, budget) {
    if (n % 2n === 0n) return 2n;
    for (let c = 1n; c < 50n; c++) {
      let x = 2n, y = 2n, d = 1n;
      const f = (v) => (v * v + c) % n;
      while (d === 1n && budget.left-- > 0) { x = f(x); y = f(f(y)); d = bgcd(x - y, n); }
      if (d !== n && d !== 1n) return d;
      if (budget.left <= 0) return null;
    }
    return null;
  }
  // Prime factorization as [[p, e], …]; `complete` is false if a factor couldn't be split in time.
  function factor(n) {
    const out = new Map();
    let complete = true;
    const add = (p, e = 1) => out.set(p, (out.get(p) || 0) + e);
    for (let p = 2n; p < 10000n && p * p <= n; p += p === 2n ? 1n : 2n) while (n % p === 0n) { add(p); n /= p; }
    const budget = { left: 3e6 };
    const split = (m) => {
      if (m === 1n) return;
      if (isPrime(m)) { add(m); return; }
      const d = rho(m, budget);
      if (!d) { add(m); complete = false; return; }
      split(d); split(m / d);
    };
    split(n);
    return { factors: [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)), complete };
  }
  const isqrt = (n) => { if (n < 2n) return n; let x = BigInt(Math.floor(Math.sqrt(Number(n)))); while (x * x > n) x--; while ((x + 1n) * (x + 1n) <= n) x++; return x; };
  const isSquare = (n) => n >= 0n && isqrt(n) ** 2n === n;
  const sup = (k) => (k === 1 ? '' : String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function parseBig(s) {
    const t = String(s).trim().replace(/[\s_,]/g, '');
    if (/^[+-]?\d+$/.test(t)) return BigInt(t);
    if (/^0x[0-9a-f]+$/i.test(t) || /^0b[01]+$/i.test(t) || /^0o[0-7]+$/i.test(t)) return BigInt(t);
    // allow expressions with an exact whole-number result, e.g. 2^31 - 1 or 10!
    const v = MX.evaluate(t);
    if (!Number.isInteger(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new Error('Enter a whole number (digits, or an expression below 2^53)');
    return BigInt(v);
  }
  function numberCard() {
    const out = el('div');
    function update() {
      try {
        const n = parseBig(st.num);
        const a = babs(n);
        const rows = [];
        const row = (k, v) => rows.push(el('tr', {}, el('th', {}, k), el('td', { class: 'mono' }, v)));
        row('number', (n < 0n ? '−' : '') + group(a.toString()) + `   (${a.toString().length} digits)`);
        if (a > 1n) {
          const prime = isPrime(a);
          row('prime?', prime ? 'yes — prime' : 'no — composite');
          const { factors, complete } = prime ? { factors: [[a, 1]], complete: true } : factor(a);
          if (!prime) row('prime factors', factors.map(([p, e]) => p.toString() + sup(e)).join(' · ') + (complete ? '' : '   (last factor not fully split)'));
          if (complete) {
            const count = factors.reduce((p, [, e]) => p * (e + 1), 1);
            const sigma = factors.reduce((p, [q, e]) => p * ((q ** BigInt(e + 1) - 1n) / (q - 1n)), 1n);
            const phi = factors.reduce((p, [q, e]) => p * (q - 1n) * q ** BigInt(e - 1), 1n);
            row('number of divisors', String(count));
            if (count <= 400) {
              let divs = [1n];
              for (const [p, e] of factors) { const nx = []; for (const d of divs) { let m = 1n; for (let i = 0; i <= e; i++) { nx.push(d * m); m *= p; } } divs = nx; }
              divs.sort((x, y) => (x < y ? -1 : 1));
              row('divisors', divs.map(String).join(', '));
            }
            row('sum of divisors σ(n)', group(sigma.toString()) + (sigma === 2n * a ? '   — a perfect number!' : sigma > 2n * a ? '   (abundant)' : '   (deficient)'));
            row('Euler totient φ(n)', group(phi.toString()));
          }
          let p = a + 1n, guard = 0;
          while (!isPrime(p) && guard++ < 100000) p++;
          row('next prime', group(p.toString()));
          if (a > 2n) { let q = a - 1n; guard = 0; while (q > 1n && !isPrime(q) && guard++ < 100000) q--; row('previous prime', group(q.toString())); }
        }
        const props = [];
        if (isSquare(a)) props.push(`perfect square (${isqrt(a)}²)`);
        if (isSquare(8n * a + 1n)) props.push('triangular');
        if (isSquare(5n * a * a + 4n) || isSquare(5n * a * a - 4n)) props.push('Fibonacci');
        props.push(a % 2n ? 'odd' : 'even');
        const digits = a.toString();
        if (digits === [...digits].reverse().join('')) props.push('palindrome');
        row('properties', props.join(', '));
        row('digit sum', String([...digits].reduce((s, d) => s + +d, 0)));
        row('binary', (n < 0n ? '−' : '') + a.toString(2));
        row('octal', (n < 0n ? '−' : '') + a.toString(8));
        row('hexadecimal', (n < 0n ? '−' : '') + a.toString(16).toUpperCase());
        if (a <= 3999n && a > 0n) {
          let v = Number(a), rom = '';
          for (const [k, s] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (v >= k) { rom += s; v -= k; }
          row('Roman numerals', rom);
        }
        out.replaceChildren(el('table', { class: 'kv-table' }, el('tbody', {}, rows)));
      } catch (e) { out.replaceChildren(errP(e.message)); }
    }
    const c = card('Number facts', 'Primality, prime factorization, divisors, φ(n), σ(n) and more. Works with very large whole numbers.',
      field('Whole number', 'num', {}, update), out);
    c._update = update;
    update();
    return c;
  }

  function gcdCard() {
    const out = el('div');
    function update() {
      try {
        const nums = st.gcd.split(/[\s,;]+/).filter(Boolean).map(parseBig);
        if (nums.length < 2) throw new Error('Enter two or more whole numbers');
        const g = nums.reduce(bgcd);
        const l = nums.reduce((p, q) => (p === 0n || q === 0n ? 0n : babs(p * q) / bgcd(p, q)));
        const rows = [el('tr', {}, el('th', {}, 'GCD (greatest common divisor)'), el('td', { class: 'mono' }, group(g.toString()))),
          el('tr', {}, el('th', {}, 'LCM (least common multiple)'), el('td', { class: 'mono' }, group(l.toString())))];
        if (nums.length === 2) {
          // extended Euclid: a·x + b·y = gcd
          let [r0, r1] = [nums[0], nums[1]], [s0, s1] = [1n, 0n], [t0, t1] = [0n, 1n];
          while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; [t0, t1] = [t1, t0 - q * t1]; }
          if (r0 < 0n) { r0 = -r0; s0 = -s0; t0 = -t0; }
          rows.push(el('tr', {}, el('th', {}, 'Bézout identity'), el('td', { class: 'mono' }, `${nums[0]}·(${s0}) + ${nums[1]}·(${t0}) = ${r0}`)));
          if (g === 1n) rows.push(el('tr', {}, el('th', {}, 'coprime'), el('td', {}, `yes — ${nums[0]} has an inverse mod ${nums[1]}: ${((s0 % nums[1]) + nums[1]) % babs(nums[1])}`)));
          const a = nums[0], b = nums[1];
          if (b !== 0n) {
            const gg = bgcd(a, b);
            rows.push(el('tr', {}, el('th', {}, 'fraction a/b simplified'), el('td', { class: 'mono' }, `${a / gg}/${b / gg}`)));
          }
        }
        out.replaceChildren(el('table', { class: 'kv-table' }, el('tbody', {}, rows)));
      } catch (e) { out.replaceChildren(errP(e.message)); }
    }
    const c = card('GCD & LCM', 'Greatest common divisor and least common multiple of a list; for two numbers also the Bézout coefficients.', field('Numbers', 'gcd', {}, update), out);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- bases
  const DIG = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function toBase(n, b) {
    if (n === 0n) return '0';
    const neg = n < 0n;
    let a = babs(n), s = '';
    const B = BigInt(b);
    while (a > 0n) { s = DIG[Number(a % B)] + s; a /= B; }
    return (neg ? '−' : '') + s;
  }
  function fromBase(str, b) {
    const t = str.trim().toUpperCase().replace(/[\s_]/g, '');
    const neg = t.startsWith('-') || t.startsWith('−');
    const body = neg ? t.slice(1) : t;
    if (!body) throw new Error('Enter a number');
    let n = 0n;
    const B = BigInt(b);
    for (const ch of body) {
      const d = DIG.indexOf(ch);
      if (d < 0 || d >= b) throw new Error(`'${ch}' is not a digit in base ${b}`);
      n = n * B + BigInt(d);
    }
    return neg ? -n : n;
  }
  function baseCard() {
    const out = el('div');
    const bsel = (key) => {
      const s = el('select', {}, Array.from({ length: 35 }, (_, i) => el('option', { value: i + 2 }, `base ${i + 2}${{ 2: ' (binary)', 8: ' (octal)', 10: ' (decimal)', 16: ' (hex)' }[i + 2] || ''}`)));
      s.value = st[key];
      s.addEventListener('change', () => { st[key] = s.value; save(); update(); });
      return s;
    };
    function update() {
      try {
        const n = fromBase(st.base, +st.baseFrom);
        const to = +st.baseTo;
        out.replaceChildren(
          el('div', { class: 'st-big mono wrap' }, toBase(n, to), el('sub', {}, String(to))),
          el('table', { class: 'kv-table' }, el('tbody', {}, [[2, 'binary'], [8, 'octal'], [10, 'decimal'], [16, 'hexadecimal'], [36, 'base 36']].map(([b, name]) =>
            el('tr', {}, el('th', {}, name), el('td', { class: 'mono wrap' }, toBase(n, b)))))));
      } catch (e) { out.replaceChildren(errP(e.message)); }
    }
    const c = card('Base converter', 'Whole numbers of any size between bases 2 and 36.',
      field('Number', 'base', {}, update), el('div', { class: 'grid2' }, el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'from'), bsel('baseFrom')), el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'to'), bsel('baseTo'))), out);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- units
  const UNITS = {
    length: { label: 'Length', u: { m: 1, km: 1e3, cm: 0.01, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, 'nautical mi': 1852, au: 1.495978707e11, 'light-year': 9.4607304725808e15, parsec: 3.0856775814913673e16 } },
    mass: { label: 'Mass', u: { kg: 1, g: 1e-3, mg: 1e-6, 'µg': 1e-9, tonne: 1e3, lb: 0.45359237, oz: 0.028349523125, stone: 6.35029318, 'US ton': 907.18474, 'UK ton': 1016.0469088, carat: 2e-4 } },
    time: { label: 'Time', u: { s: 1, ms: 1e-3, 'µs': 1e-6, ns: 1e-9, min: 60, h: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600, decade: 315576000, century: 3155760000 } },
    area: { label: 'Area', u: { 'm²': 1, 'km²': 1e6, 'cm²': 1e-4, 'mm²': 1e-6, hectare: 1e4, acre: 4046.8564224, 'ft²': 0.09290304, 'in²': 6.4516e-4, 'yd²': 0.83612736, 'mi²': 2589988.110336 } },
    volume: { label: 'Volume', u: { 'm³': 1, L: 1e-3, mL: 1e-6, 'cm³': 1e-6, 'US gal': 3.785411784e-3, 'UK gal': 4.54609e-3, 'US qt': 9.46352946e-4, 'US pt': 4.73176473e-4, 'US cup': 2.365882365e-4, 'US fl oz': 2.95735295625e-5, tbsp: 1.478676478125e-5, tsp: 4.92892159375e-6, 'ft³': 0.028316846592, 'in³': 1.6387064e-5 } },
    speed: { label: 'Speed', u: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 1852 / 3600, 'ft/s': 0.3048, mach: 340.29, 'speed of light': 299792458 } },
    temperature: { label: 'Temperature', temp: true, u: { '°C': 1, '°F': 1, K: 1, '°R': 1 } },
    energy: { label: 'Energy', u: { J: 1, kJ: 1e3, MJ: 1e6, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6, eV: 1.602176634e-19, BTU: 1055.05585262, 'ft·lbf': 1.3558179483314004 } },
    power: { label: 'Power', u: { W: 1, kW: 1e3, MW: 1e6, hp: 745.69987158227022, 'BTU/h': 0.29307107017 } },
    pressure: { label: 'Pressure', u: { Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5, mbar: 100, atm: 101325, psi: 6894.757293168, mmHg: 133.322387415, inHg: 3386.389 } },
    data: { label: 'Data', u: { bit: 1, byte: 8, kB: 8e3, MB: 8e6, GB: 8e9, TB: 8e12, KiB: 8192, MiB: 8 * 2 ** 20, GiB: 8 * 2 ** 30, TiB: 8 * 2 ** 40 } },
    angle: { label: 'Angle', u: { degree: Math.PI / 180, radian: 1, gradian: Math.PI / 200, turn: 2 * Math.PI, arcminute: Math.PI / 10800, arcsecond: Math.PI / 648000 } },
  };
  const toK = { '°C': (v) => v + 273.15, '°F': (v) => ((v - 32) * 5) / 9 + 273.15, K: (v) => v, '°R': (v) => (v * 5) / 9 };
  const fromK = { '°C': (v) => v - 273.15, '°F': (v) => ((v - 273.15) * 9) / 5 + 32, K: (v) => v, '°R': (v) => (v * 9) / 5 };
  function unitCard() {
    const out = el('div');
    const cat = el('select', {}, Object.entries(UNITS).map(([k, v]) => el('option', { value: k }, v.label)));
    const from = el('select');
    cat.value = UNITS[st.unitCat] ? st.unitCat : 'length';
    const fill = () => {
      from.replaceChildren(...Object.keys(UNITS[cat.value].u).map((u) => el('option', { value: u }, u)));
      from.value = UNITS[cat.value].u[st.unitFrom] !== undefined ? st.unitFrom : Object.keys(UNITS[cat.value].u)[0];
    };
    function update() {
      st.unitCat = cat.value; st.unitFrom = from.value; save();
      try {
        const v = MX.evaluate(st.unitVal);
        const C = UNITS[cat.value];
        const conv = (u) => (C.temp ? fromK[u](toK[from.value](v)) : (v * C.u[from.value]) / C.u[u]);
        out.replaceChildren(el('table', { class: 'kv-table' }, el('tbody', {}, Object.keys(C.u).filter((u) => u !== from.value).map((u) =>
          el('tr', {}, el('th', {}, u), el('td', { class: 'mono' }, MX.fmt(+conv(u).toPrecision(10))))))));
      } catch (e) { out.replaceChildren(errP(e.message)); }
    }
    cat.addEventListener('change', () => { fill(); update(); });
    from.addEventListener('change', update);
    fill();
    const c = card('Unit converter', null,
      el('div', { class: 'grid2' }, el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Quantity'), cat), el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'From'), from)),
      field('Value', 'unitVal', {}, update), out);
    c._update = update;
    update();
    return c;
  }

  // ---------------------------------------------------------------- sequences
  function seqCard() {
    const out = el('div');
    const cv = el('canvas', { class: 'chart short' });
    function update() {
      try {
        MX.M.af = 1;
        const ast = MX.parse(st.seq);
        const vars = freeVar(ast).filter((v) => v !== 'n');
        if (vars.length) throw new Error(`Use n as the variable (unknown: ${vars.join(', ')})`);
        const { fn } = MX.compile(ast, ['n'], {});
        const n0 = Math.round(MX.evaluate(st.seqFrom)), n1 = Math.round(MX.evaluate(st.seqTo));
        if (!(n1 >= n0)) throw new Error('“to” must be at least “from”');
        if (n1 - n0 > 1e6) throw new Error('At most a million terms');
        const terms = [], sums = [];
        let s = 0;
        for (let n = n0; n <= n1; n++) { const v = fn(n); terms.push(v); s += v; sums.push(s); }
        const diffs = terms.slice(1).map((v, i) => v - terms[i]), ratios = terms.slice(1).map((v, i) => v / terms[i]);
        const constant = (a) => a.length > 1 && a.every((v) => Math.abs(v - a[0]) < 1e-9 * Math.max(1, Math.abs(a[0])));
        const kind = constant(diffs) ? `arithmetic, difference ${f6(diffs[0])}` : constant(ratios) ? `geometric, ratio ${f6(ratios[0])}` : '';
        // does the series seem to converge? compare the last partial sums
        const tail = sums.length > 20 ? Math.abs(sums[sums.length - 1] - sums[Math.floor(sums.length * 0.9)]) : NaN;
        out.replaceChildren(
          el('p', { class: 'mono wrap' }, terms.slice(0, 15).map(f6).join(', ') + (terms.length > 15 ? ', …' : '')),
          el('table', { class: 'kv-table' }, el('tbody', {},
            el('tr', {}, el('th', {}, `sum Σ from n = ${n0} to ${n1}`), el('td', { class: 'mono' }, f6(s) + (MX.altForms(s)[0] ? `  (= ${MX.altForms(s)[0]})` : ''))),
            el('tr', {}, el('th', {}, 'last term'), el('td', { class: 'mono' }, f6(terms[terms.length - 1]))),
            kind ? el('tr', {}, el('th', {}, 'type'), el('td', {}, kind)) : null,
            isFinite(tail) ? el('tr', {}, el('th', {}, 'partial sums'), el('td', {}, tail < 1e-3 * Math.max(1, Math.abs(s)) ? 'settling down (the series may converge)' : 'still changing')) : null)));
        requestAnimationFrame(() => {
          const show = terms.length > 400 ? 400 : terms.length;
          const all = [...terms.slice(0, show), ...sums.slice(0, show)].filter(isFinite);
          const fr = Charts.frame(cv, { xmin: n0 - 0.5, xmax: n0 + show - 0.5, ymin: Math.min(0, ...all), ymax: Math.max(0, ...all) || 1, discreteX: true });
          const r = show > 100 ? 1.5 : 3;
          for (let i = 0; i < show; i++) {
            fr.ctx.fillStyle = '#4dabf7'; fr.ctx.beginPath(); fr.ctx.arc(fr.X(n0 + i), fr.Y(terms[i]), r, 0, Math.PI * 2); fr.ctx.fill();
            fr.ctx.fillStyle = '#ff922b'; fr.ctx.beginPath(); fr.ctx.arc(fr.X(n0 + i), fr.Y(sums[i]), r, 0, Math.PI * 2); fr.ctx.fill();
          }
        });
      } catch (e) { out.replaceChildren(errP(e.message)); Charts.setup(cv); }
    }
    const c = card('Sequences & series', 'Terms a(n) (blue) and partial sums (orange). Try 1/n^2, (1 + 1/n)^n, fib(n) or (-1)^(n+1)/n.',
      field('a(n) =', 'seq', {}, update), el('div', { class: 'grid2' }, field('n from', 'seqFrom', {}, update), field('to', 'seqTo', {}, update)), out, cv);
    c._update = update;
    update();
    return c;
  }

  function init(root) {
    load();
    const cards = [solverCard, polyCard, calcCard, triangleCard, numberCard, gcdCard, seqCard, baseCard, unitCard];
    const grid = el('div', { class: 'tool-grid' });
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Algebra & tools'), el('p', {}, 'Solvers, calculus, geometry, number theory and converters.')),
      grid));
    for (const make of cards) {
      try { grid.append(make()); } catch (e) { grid.append(card(make.name, null, errP(e.message))); }
    }
    let rt = 0;
    new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => grid.querySelectorAll('.tool-card').forEach((c) => c._update && c._update()), 120); }).observe(grid);
  }

  Shell.register('tools', {
    label: 'Algebra & tools', short: 'Tools', key: 9, order: 9, root: () => document.getElementById('mod-tools'), init,
    desc: 'Equation and polynomial solvers, symbolic derivatives, integrals, triangle solver, prime factorization, base and unit converters.',
    features: ['Solve equations', 'Derivatives', 'Primes & factors', 'Units'],
  });
})();

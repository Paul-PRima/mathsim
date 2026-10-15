// Scientific calculator: typed or keypad input, history, variables, your own functions, equation solving.
(() => {
  const { el } = U;
  const KEY = 'mathsim.calc.v1';
  const st = { history: [], vars: { ans: 0 }, cvars: {}, defs: {}, deg: false, second: false, hpos: -1 };
  // exactVars: exact (BigInt) values of variables, so ans keeps all digits of 50!
  const scope = { vars: st.vars, funcs: {}, exactVars: {} };
  let input, preview, histEl, varsEl, keysEl, modeBtn;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s) return;
      st.history = Array.isArray(s.history) ? s.history.slice(-200) : [];
      for (const [k, v] of Object.entries(s.vars || {})) st.vars[k] = typeof v === 'number' ? v : NaN;
      for (const [k, z] of Object.entries(s.cvars || {})) if (Array.isArray(z)) st.cvars[k] = z;
      st.defs = s.defs || {};
      st.deg = !!s.deg;
      for (const [name, d] of Object.entries(st.defs)) { try { defineFn(name, d.params, d.body); } catch { delete st.defs[name]; } }
    } catch { /* fresh start */ }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ history: st.history.slice(-200), vars: st.vars, cvars: st.cvars, defs: st.defs, deg: st.deg })); } catch { /* storage full */ } };

  const angles = () => { MX.M.af = st.deg ? Math.PI / 180 : 1; };

  function defineFn(name, params, body) {
    const ast = MX.parse(body);
    if (MX.names(ast).calls.has(name)) throw new MX.MathError(`${name} can't call itself`, 0);
    const { fn, free } = MX.compile(ast, params, scope);
    for (const n of free) if (!(n in st.vars)) throw new MX.MathError(`Unknown name '${n}' (use one of: ${params.join(', ')})`, 0);
    const f = (...a) => fn(...a);
    f.arity = params.length;
    scope.funcs[name] = f;
  }

  // Integer factorization for display (small numbers only): 360 = 2³·3²·5
  function factorStr(n) {
    if (!Number.isInteger(n) || Math.abs(n) < 4 || Math.abs(n) > 1e12) return null;
    const sup = (k) => (k === 1 ? '' : String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));
    let m = Math.abs(n);
    const parts = [];
    for (let p = 2; p * p <= m; p += p === 2 ? 1 : 2) {
      let k = 0;
      while (m % p === 0) { m /= p; k++; }
      if (k) parts.push(p + sup(k));
    }
    if (m > 1) parts.push(String(m));
    if (parts.length === 1 && !parts[0].match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/)) return 'prime';
    return (n < 0 ? '−' : '') + parts.join(' · ');
  }

  // Runs one line. Returns a history entry (or throws).
  function run(src) {
    angles();
    const ast = MX.parse(src);
    if (ast.t === 'cmp' && ast.op === '=') {
      // a = 5  → variable
      if (ast.a.t === 'var' && !(ast.a.name in MX.CONSTS) && !MX.names(ast.b).vars.has(ast.a.name)) {
        const name = ast.a.name;
        const r = compute(src.slice(src.indexOf('=') + 1).trim(), ast.b);
        setVar(name, r);
        return { src, kind: 'assign', text: `${name} = ${r.display}`, value: r.value };
      }
      // f(x) = x² + 1  → function
      if (ast.a.t === 'call' && ast.a.args.length && ast.a.args.every((a) => a.t === 'var')) {
        const name = ast.a.f;
        if (MX.FUNCS[name.toLowerCase()] || MX.SPECIAL[name.toLowerCase()]) throw new MX.MathError(`${name} is a built-in function`, 0);
        const params = ast.a.args.map((a) => a.name);
        const body = src.slice(src.indexOf('=') + 1).trim();
        defineFn(name, params, body);
        st.defs[name] = { params, body };
        return { src, kind: 'def', text: `${name}(${params.join(', ')}) defined` };
      }
      // 2x + 3 = 11  → solve for the one unknown
      const diff = { t: 'bin', op: '-', a: ast.a, b: ast.b };
      const { free } = MX.compile(diff, [], scope);
      if (free.size === 1) {
        const v = [...free][0];
        const { fn } = MX.compile(diff, [v], scope);
        let roots = MX.findRoots(fn, -1000, 1000, 20000);
        if (!roots.length) { const r = MX.solve(fn, 1); if (isFinite(r)) roots = [r]; }
        if (!roots.length) {
          // polynomials always have complex roots
          const c = polyCoefs(fn);
          if (c && c.length > 1) {
            const zs = LinAlg.polyRoots(c).map((z) => CalcX.cString(z.map((x) => +x.toPrecision(12))));
            return { src, kind: 'solve', text: 'no real solution · complex: ' + zs.map((z) => `${v} = ${z}`).join('   or   ') };
          }
          throw new MX.MathError(`No real solution for ${v} found`, 0);
        }
        roots = roots.map((r) => (Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r) : r));
        st.vars.ans = roots[0];
        return { src, kind: 'solve', text: roots.slice(0, 12).map((r) => `${v} = ${MX.fmt(r)}`).join('   or   ') + (roots.length > 12 ? '  …' : ''), value: roots[0] };
      }
      if (free.size > 1) throw new MX.MathError(`Unknown names: ${[...free].join(', ')} — to solve, use one unknown`, 0);
    }
    const r = compute(src, ast);
    setVar('ans', r);
    return { src, kind: 'value', value: r.value, display: r.display, alt: r.alt, exact: r.exact };
  }

  // Stores a computed result in a variable (real, exact and complex parts kept in step).
  function setVar(name, r) {
    st.vars[name] = r.value == null ? NaN : r.value;
    if (r.complex && r.complex[1] !== 0) st.cvars[name] = r.complex; else delete st.cvars[name];
    if (r.q) scope.exactVars[name] = r.q; else delete scope.exactVars[name];
  }

  // Coefficients (low → high) when fn is a polynomial of degree ≤ 10, else null.
  function polyCoefs(fn) {
    const xs = Array.from({ length: 14 }, (_, i) => i - 6), ys = xs.map(fn);
    if (!ys.every(isFinite)) return null;
    const sc = Math.max(1, ...ys.map(Math.abs));
    let d = ys.slice(), deg = -1;
    for (let k = 0; k <= 12; k++) { if (d.every((v) => Math.abs(v) < 1e-9 * sc)) { deg = k - 1; break; } d = d.slice(1).map((v, i) => v - d[i]); }
    if (deg < 1 || deg > 10) return null;
    const pts = Array.from({ length: deg + 1 }, (_, i) => i - Math.floor(deg / 2));
    const c = LinAlg.solve(pts.map((x) => Array.from({ length: deg + 1 }, (_, j) => x ** j)), pts.map((x) => [fn(x)])).X.map((r) => r[0]);
    return c.map((v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v));
  }

  // Evaluates an expression the best available way: with units, as a real number (plus its exact
  // rational / big-integer form), or as a complex number. Returns { display, alt, value, exact, complex, q }.
  function compute(src, ast, preview = false) {
    const u = CalcX.units(src, scope); // throws for unit mistakes such as 3 m + 2 s
    if (u) return { display: u.text, alt: u.alt || '', value: u.value };
    let v, err = null;
    try { v = MX.evaluate(ast, scope); } catch (e) { err = e; }
    const usesI = MX.names(ast).vars.has('i') && !('i' in st.vars);
    const usesC = [...MX.names(ast).vars].some((n) => st.cvars[n]);
    if (!err && !Number.isNaN(v) && !usesI && !usesC) {
      const q = preview ? null : CalcX.exact(ast, scope);
      if (q && q.d === 1n && (Math.abs(v) >= 1e16 || !isFinite(v))) {
        const s = CalcX.qString(q);
        return { display: CalcX.group(s), alt: `${s.replace('-', '').length} digits` + (isFinite(v) ? ` · ≈ ${MX.fmt(v)}` : ''), value: v, exact: s, q };
      }
      let alt = describe(v);
      if (q && q.d !== 1n) {
        const s = CalcX.qString(q);
        if (!alt.includes(s) && s.length < 300) alt = (alt ? alt + '   ·   ' : '') + `exactly ${s}`;
      }
      return { display: MX.fmt(v), alt, value: v, q: q || null };
    }
    try {
      const z = CalcX.complex(ast, { vars: st.vars, cvars: st.cvars, funcs: scope.funcs });
      if (isFinite(z[0]) && isFinite(z[1])) {
        return { display: CalcX.cString(z), alt: z[1] !== 0 ? CalcX.polarString(z) : describe(z[0]), value: z[1] === 0 ? z[0] : null, complex: z };
      }
    } catch (e2) { if (!err) err = e2; }
    if (err) throw err;
    return { display: 'undefined', alt: '', value: NaN };
  }

  function describe(v) {
    const alt = MX.altForms(v);
    const fs = factorStr(v);
    if (fs) alt.push(fs === 'prime' ? 'a prime number' : fs);
    return alt.join('   ·   ');
  }

  function entryEl(h, i) {
    const result = h.error
      ? el('div', { class: 'cx-res err' }, h.error)
      : h.kind === 'value'
        ? el('div', { class: 'cx-res', title: 'Click to use this value', onclick: () => insert(h.exact || (h.value != null && isFinite(h.value) ? MX.fmt(h.value) : 'ans')) }, '= ' + (h.display || MX.fmt(h.value)))
        : el('div', { class: 'cx-res small' }, h.text);
    const alt = !h.error && h.kind === 'value' ? (h.alt !== undefined ? h.alt : describe(h.value)) : '';
    return el('div', { class: 'cx-entry' },
      el('div', { class: 'cx-src mono', title: 'Click to edit', onclick: () => { input.value = h.src; input.focus(); updatePreview(); } }, h.src),
      result,
      alt ? el('div', { class: 'cx-alt' }, alt) : null,
      el('button', { type: 'button', class: 'icon cx-del', title: 'Remove', onclick: () => { st.history.splice(i, 1); save(); renderHistory(); } }, '×'));
  }

  function renderHistory() {
    histEl.replaceChildren(...(st.history.length ? st.history.map(entryEl) : [el('div', { class: 'cx-empty' },
      el('p', {}, 'Type a calculation and press Enter.'),
      el('p', { class: 'hint' }, 'Try:  2^10   ·   sin(30°)   ·   30!   ·   sqrt(-4)   ·   2x + 3 = 11   ·   5 km/h in m/s   ·   f(x) = x^2 + 1   ·   int(x^2, x, 0, 3)'))]));
    histEl.scrollTop = histEl.scrollHeight;
    renderVars();
  }

  function renderVars() {
    const rows = [];
    for (const [k, v] of Object.entries(st.vars)) {
      rows.push(el('div', { class: 'cx-var' },
        el('button', { type: 'button', class: 'linkish mono', onclick: () => insert(k) }, k),
        el('span', { class: 'mono' }, st.cvars[k] ? CalcX.cString(st.cvars[k]) : scope.exactVars[k] ? CalcX.qString(scope.exactVars[k]) : MX.fmt(v)),
        k === 'ans' ? el('span') : el('button', { type: 'button', class: 'icon danger', title: 'Delete', onclick: () => { delete st.vars[k]; delete st.cvars[k]; delete scope.exactVars[k]; save(); renderVars(); } }, '×')));
    }
    for (const [k, d] of Object.entries(st.defs)) {
      rows.push(el('div', { class: 'cx-var' },
        el('button', { type: 'button', class: 'linkish mono', onclick: () => insert(k + '(') }, `${k}(${d.params.join(', ')})`),
        el('span', { class: 'mono' }, d.body),
        el('button', { type: 'button', class: 'icon danger', title: 'Delete', onclick: () => { delete st.defs[k]; delete scope.funcs[k]; save(); renderVars(); } }, '×')));
    }
    varsEl.replaceChildren(...rows);
  }

  function updatePreview() {
    const src = input.value.trim();
    preview.className = 'cx-preview';
    if (!src) { preview.textContent = ''; return; }
    try {
      angles();
      const ast = MX.parse(src);
      if (ast.t === 'cmp' && ast.op === '=') { preview.textContent = 'Enter to ' + (ast.a.t === 'var' || ast.a.t === 'call' ? 'define' : 'solve'); return; }
      preview.textContent = '= ' + compute(src, ast, true).display;
    } catch (e) {
      preview.textContent = e.message;
      preview.className = 'cx-preview err';
    }
  }

  function submit() {
    const src = input.value.trim();
    if (!src) return;
    let h;
    try { h = run(src); } catch (e) { h = { src, error: e.message }; }
    st.history.push(h);
    if (st.history.length > 200) st.history.shift();
    st.hpos = -1;
    if (!h.error) input.value = '';
    save();
    renderHistory();
    updatePreview();
  }

  function insert(text) {
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    // starting with an operator after a result continues from it
    if (!input.value && /^[+\-*/^!%×÷²]/.test(text) && st.history.length) text = 'ans' + text;
    input.value = input.value.slice(0, s) + text + input.value.slice(e);
    const caret = s + text.length - (text.endsWith('()') ? 1 : 0);
    input.focus();
    input.setSelectionRange(caret, caret);
    updatePreview();
  }

  function backspace() {
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    if (s !== e) input.value = input.value.slice(0, s) + input.value.slice(e);
    else if (s > 0) {
      // delete a whole function name with its bracket: "sin(" → ""
      const m = /[A-Za-z]+\($/.exec(input.value.slice(0, s));
      const n = m ? m[0].length : 1;
      input.value = input.value.slice(0, s - n) + input.value.slice(s);
      input.setSelectionRange(s - n, s - n);
    }
    input.focus();
    updatePreview();
  }

  // [label, insert, 2nd label, 2nd insert, class]
  const KEYS = [
    [['2nd', () => { st.second = !st.second; paintKeys(); }, null, null, 'fn toggle'], ['DEG', () => { st.deg = !st.deg; save(); paintKeys(); updatePreview(); }, null, null, 'fn'], ['(', '('], [')', ')'], ['AC', () => { input.value = ''; updatePreview(); input.focus(); }, null, null, 'danger'], ['⌫', backspace, null, null, 'fn']],
    [['sin', 'sin(', 'sin⁻¹', 'asin('], ['cos', 'cos(', 'cos⁻¹', 'acos('], ['tan', 'tan(', 'tan⁻¹', 'atan('], ['ln', 'ln(', 'eˣ', 'exp('], ['log', 'log(', '10ˣ', '10^('], ['x⁻¹', '^(-1)', '|x|', 'abs(']],
    [['x²', '^2', '√x', 'sqrt('], ['xʸ', '^', 'ʸ√x', 'root('], ['√', 'sqrt(', '∛', 'cbrt('], ['n!', '!', 'nPr', 'nPr('], ['π', 'π', 'i', 'i'], ['e', 'e', 'φ', 'φ']],
    [['7', '7', null, null, 'num'], ['8', '8', null, null, 'num'], ['9', '9', null, null, 'num'], ['÷', '/', null, null, 'op'], ['nCr', 'nCr(', 'gcd', 'gcd('], ['%', '%', 'mod', 'mod(']],
    [['4', '4', null, null, 'num'], ['5', '5', null, null, 'num'], ['6', '6', null, null, 'num'], ['×', '*', null, null, 'op'], [',', ', '], ['ans', 'ans']],
    [['1', '1', null, null, 'num'], ['2', '2', null, null, 'num'], ['3', '3', null, null, 'num'], ['−', '-', null, null, 'op'], ['x', 'x', 'y', 'y'], ['=', submit, null, null, 'eq']],
    [['0', '0', null, null, 'num'], ['.', '.', null, null, 'num'], ['×10ⁿ', '*10^', 'E', 'e'], ['+', '+', null, null, 'op'], ['x=', '=', '<', '<', 'fn']],
  ];
  const keyBtns = [];
  function paintKeys() {
    for (const { b, k } of keyBtns) {
      const second = st.second && k[2];
      b.textContent = second ? k[2] : k[0];
      b.classList.toggle('second', !!second);
    }
    keyBtns.find((x) => x.k[0] === '2nd').b.classList.toggle('on', st.second);
    modeBtn.textContent = st.deg ? 'DEG' : 'RAD';
    modeBtn.title = st.deg ? 'Angles in degrees — click for radians' : 'Angles in radians — click for degrees';
  }

  function buildKeys() {
    keysEl = el('div', { class: 'cx-keys' });
    KEYS.forEach((row, r) => row.forEach((k, c) => {
      const isEq = k[4] === 'eq';
      const b = el('button', { type: 'button', class: 'cx-key ' + (k[4] || ''), style: isEq ? `grid-row: ${r + 1} / span 2; grid-column: ${c + 1}` : '' });
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the input
      b.addEventListener('click', () => {
        const second = st.second && k[2];
        const act = second ? k[3] : k[1];
        if (typeof act === 'function') act(); else insert(act);
        if (second && k[0] !== '2nd') { st.second = false; paintKeys(); }
      });
      if (k[0] === 'DEG') modeBtn = b;
      keyBtns.push({ b, k });
      keysEl.append(b);
    }));
    return keysEl;
  }

  function buildReference() {
    const groups = MX.docs();
    return el('details', { class: 'help cx-ref' },
      el('summary', {}, 'All functions'),
      Object.entries(groups).map(([g, list]) => el('div', {},
        el('h4', {}, g),
        el('div', { class: 'ref-list' }, list.map(([name, desc]) => el('button', { type: 'button', class: 'ref-item', title: desc, onclick: () => insert(name + '(') },
          el('code', {}, name), el('span', {}, desc)))))),
      el('h4', {}, 'Constants'),
      el('p', { class: 'hint' }, 'π (pi), e, τ (tau), φ (phi), ∞ (inf), ans = last result'),
      el('h4', {}, 'Also'),
      el('ul', { class: 'hint' },
        el('li', {}, '30° — degrees in either angle mode'),
        el('li', {}, '50% = 0.5, 5! factorial, |x| absolute value'),
        el('li', {}, '0xFF, 0b1010 — hexadecimal and binary'),
        el('li', {}, 'Complex numbers: sqrt(-4), (2 + 3i)(1 − i), e^(iπ) — i is on 2nd + π'),
        el('li', {}, 'Exact results: 30!, 2^200, 1/3 + 1/6 (whole numbers of any size, exact fractions)'),
        el('li', {}, 'Units: 5 km/h in m/s, 3 ft + 20 cm, 60 mph * 2 h in km, 100 °F in °C'),
        el('li', {}, 'a = 5 stores a variable; f(x) = x^2 defines a function'),
        el('li', {}, '2x + 3 = 11 solves for the unknown (all real solutions between −1000 and 1000)'),
        el('li', {}, 'Up / Down arrows: previous inputs · Esc: clear')));
  }

  function init(root) {
    load();
    input = el('input', { type: 'text', class: 'cx-input mono', placeholder: 'Type a calculation…', spellcheck: 'false', autocomplete: 'off' });
    preview = el('div', { class: 'cx-preview' });
    histEl = el('div', { class: 'cx-history' });
    varsEl = el('div', { class: 'cx-vars' });
    input.addEventListener('input', updatePreview);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { input.value = ''; updatePreview(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const srcs = st.history.map((h) => h.src);
        if (!srcs.length) return;
        e.preventDefault();
        st.hpos = st.hpos < 0 ? srcs.length : st.hpos;
        st.hpos = U.clamp(st.hpos + (e.key === 'ArrowUp' ? -1 : 1), 0, srcs.length);
        input.value = srcs[st.hpos] || '';
        updatePreview();
      }
    });
    root.append(el('div', { class: 'page calc' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Calculator'), el('p', {}, 'Scientific calculator with variables, your own functions and an equation solver.')),
      el('div', { class: 'cx-grid' },
        el('div', { class: 'cx-main' },
          histEl,
          el('div', { class: 'cx-entry-row' }, input, preview),
          buildKeys()),
        el('div', { class: 'cx-side' },
          el('div', { class: 'pane' },
            el('h3', {}, 'Variables & functions'),
            varsEl,
            el('div', { class: 'btn-row' }, U.el('button', { type: 'button', class: 'small', onclick: () => { st.history = []; save(); renderHistory(); } }, 'Clear history'))),
          el('div', { class: 'pane' }, buildReference())))));
    paintKeys();
    renderHistory();
    // typing anywhere on this page goes into the input
    window.addEventListener('keydown', (e) => {
      if (!Shell.isActive('calc') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key.length === 1 || e.key === 'Backspace') input.focus();
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }

  Shell.register('calc', {
    label: 'Calculator', key: 2, order: 2, root: () => document.getElementById('mod-calc'), init,
    onShow: () => setTimeout(() => input && input.focus(), 0),
    desc: 'Scientific calculator with history, variables, your own functions, fractions, and an equation solver.',
    features: ['Degrees / radians', 'Solve 2x+3=11', 'f(x) = …', 'Integrals & sums'],
  });
})();

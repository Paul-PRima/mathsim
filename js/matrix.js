// Linear algebra helpers (also used by the tools page) and the matrix calculator page.
const LinAlg = (() => {
  const EPS = 1e-10;
  const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
  const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const clone = (A) => A.map((r) => r.slice());
  const dims = (A) => [A.length, A[0] ? A[0].length : 0];
  const scaleOf = (A) => Math.max(1e-300, ...A.flat().map(Math.abs));

  function add(A, B, s = 1) {
    const [r, c] = dims(A), [r2, c2] = dims(B);
    if (r !== r2 || c !== c2) throw new Error(`Sizes differ: ${r}×${c} and ${r2}×${c2}`);
    return A.map((row, i) => row.map((v, j) => v + s * B[i][j]));
  }
  function mul(A, B) {
    const [r, n] = dims(A), [n2, c] = dims(B);
    if (n !== n2) throw new Error(`Can't multiply ${r}×${n} by ${n2}×${c}: the inner sizes must match`);
    const C = zeros(r, c);
    for (let i = 0; i < r; i++) for (let k = 0; k < n; k++) { const a = A[i][k]; if (a) for (let j = 0; j < c; j++) C[i][j] += a * B[k][j]; }
    return C;
  }
  const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const square = (A, what) => { const [r, c] = dims(A); if (r !== c) throw new Error(`${what} needs a square matrix (this one is ${r}×${c})`); return r; };

  function det(A) {
    const n = square(A, 'The determinant');
    const M = clone(A);
    let d = 1;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < EPS * scaleOf(A)) return 0;
      if (p !== c) { [M[c], M[p]] = [M[p], M[c]]; d = -d; }
      d *= M[c][c];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; }
    }
    return d;
  }

  // Reduced row echelon form; also returns the pivot columns.
  function rref(A) {
    const M = clone(A), [r, c] = dims(M), tol = EPS * scaleOf(A);
    const pivots = [];
    let row = 0;
    for (let col = 0; col < c && row < r; col++) {
      let p = row;
      for (let i = row + 1; i < r; i++) if (Math.abs(M[i][col]) > Math.abs(M[p][col])) p = i;
      if (Math.abs(M[p][col]) <= tol) continue;
      [M[row], M[p]] = [M[p], M[row]];
      const pv = M[row][col];
      for (let k = 0; k < c; k++) M[row][k] /= pv;
      for (let i = 0; i < r; i++) if (i !== row) { const f = M[i][col]; if (f) for (let k = 0; k < c; k++) M[i][k] -= f * M[row][k]; }
      pivots.push(col);
      row++;
    }
    for (const rr of M) for (let k = 0; k < c; k++) if (Math.abs(rr[k]) < tol) rr[k] = 0;
    return { R: M, pivots };
  }
  const rank = (A) => rref(A).pivots.length;

  function inverse(A) {
    const n = square(A, 'The inverse');
    const { R, pivots } = rref(A.map((row, i) => [...row, ...eye(n)[i]]));
    if (pivots.length < n || pivots[n - 1] !== n - 1) throw new Error('This matrix has no inverse (its determinant is 0)');
    return R.map((row) => row.slice(n));
  }

  function power(A, k) {
    const n = square(A, 'A power');
    if (!Number.isInteger(k)) throw new Error('The power must be a whole number');
    let base = k < 0 ? inverse(A) : clone(A), e = Math.abs(k), R = eye(n);
    while (e > 0) { if (e & 1) R = mul(R, base); base = mul(base, base); e >>= 1; }
    return R;
  }

  // Basis of the null space of A (columns as arrays).
  function nullspace(A, tol) {
    const { R, pivots } = rref(A);
    const c = A[0].length;
    const free = [...Array(c).keys()].filter((j) => !pivots.includes(j));
    return free.map((f) => {
      const v = new Array(c).fill(0);
      v[f] = 1;
      pivots.forEach((pc, i) => { v[pc] = -R[i][f]; });
      const m = Math.max(...v.map(Math.abs));
      return v.map((x) => (Math.abs(x / m) < (tol || 1e-9) ? 0 : x / m));
    });
  }

  // Characteristic polynomial coefficients (low → high) by Faddeev–LeVerrier.
  function charpoly(A) {
    const n = square(A, 'Eigenvalues');
    const c = new Array(n + 1).fill(0);
    c[n] = 1;
    let M = zeros(n, n);
    for (let k = 1; k <= n; k++) {
      const AM = mul(A, M);
      M = AM.map((row, i) => row.map((v, j) => v + (i === j ? c[n - k + 1] : 0)));
      const AMk = mul(A, M);
      let tr = 0;
      for (let i = 0; i < n; i++) tr += AMk[i][i];
      c[n - k] = -tr / k;
    }
    return c;
  }

  // All complex roots of a polynomial (coefficients low → high) by Durand–Kerner, polished.
  function polyRoots(coef) {
    let c = coef.slice();
    while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-300) c.pop();
    const n = c.length - 1;
    if (n < 1) return [];
    const lead = c[n];
    c = c.map((v) => v / lead);
    const zeroRoots = [];
    while (c.length > 1 && c[0] === 0) { c.shift(); zeroRoots.push([0, 0]); }
    const m = c.length - 1;
    if (m === 0) return zeroRoots;
    const bound = 1 + Math.max(...c.slice(0, m).map(Math.abs));
    const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const cd = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    const evalP = (z) => { let r = [1, 0]; for (let i = m - 1; i >= 0; i--) { r = cm(r, z); r[0] += c[i]; } return r; };
    let z = Array.from({ length: m }, (_, k) => { const a = (2 * Math.PI * k) / m + 0.4; return [bound * 0.9 * Math.cos(a), bound * 0.9 * Math.sin(a)]; });
    for (let it = 0; it < 2000; it++) {
      let move = 0;
      const nz = z.map((zi, i) => {
        let den = [1, 0];
        z.forEach((zj, j) => { if (j !== i) den = cm(den, [zi[0] - zj[0], zi[1] - zj[1]]); });
        const d = cd(evalP(zi), den);
        move = Math.max(move, Math.hypot(d[0], d[1]));
        return [zi[0] - d[0], zi[1] - d[1]];
      });
      z = nz;
      if (move < 1e-15 * bound) break;
    }
    const roots = z.map(([re, im]) => {
      const s = Math.max(1, Math.hypot(re, im));
      return [Math.abs(re) < 1e-12 * s ? 0 : re, Math.abs(im) < 1e-9 * s ? 0 : im];
    });
    return [...zeroRoots, ...roots].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  // Symmetric matrices: Jacobi rotations give exact-quality eigenvalues and orthonormal eigenvectors.
  function jacobi(A) {
    const n = A.length, a = clone(A), V = eye(n), sc = scaleOf(A);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
      if (off < 1e-26 * sc * sc) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const vp = V[k][p], vq = V[k][q]; V[k][p] = c * vp - s * vq; V[k][q] = s * vp + c * vq; }
      }
    }
    return a.map((row, i) => ({ value: row[i], vec: V.map((r) => r[i]) }));
  }

  // Eigenvalues (with multiplicity) and eigenvectors of real eigenvalues.
  function eigen(A) {
    square(A, 'Eigenvalues');
    const sc = scaleOf(A), tol = 1e-6 * sc;
    const symmetric = A.every((row, i) => row.every((v, j) => Math.abs(v - A[j][i]) <= 1e-12 * sc));
    const out = [];
    const near = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(1, sc);
    if (symmetric) {
      for (const { value, vec } of jacobi(A).sort((p, q) => p.value - q.value)) {
        const v = Math.abs(value) < 1e-12 * sc ? 0 : value;
        const nv = vec.map((x) => (Math.abs(x) < 1e-12 ? 0 : x));
        const prev = out.find((o) => near(o.re, v));
        if (prev) { prev.mult++; prev.vecs.push(nv); } else out.push({ re: v, im: 0, mult: 1, vecs: [nv] });
      }
      return out;
    }
    // general: roots of the characteristic polynomial; nearly-equal roots of a repeated eigenvalue are merged
    const roots = polyRoots(charpoly(A)).map(([re, im]) => [re, Math.abs(im) < 1e-5 * Math.max(1, sc) ? 0 : im]);
    for (const [re, im] of roots) {
      const prev = out.find((o) => near(o.re, re) && near(o.im, im) && (o.im === 0) === (im === 0));
      if (prev) { prev.sum += re; prev.mult++; prev.re = prev.sum / prev.mult; continue; }
      out.push({ re, im, mult: 1, sum: re, vecs: [] });
    }
    for (const o of out) if (o.im === 0) o.vecs = nullspaceTol(A.map((row, i) => row.map((v, j) => v - (i === j ? o.re : 0))), tol);
    return out;
  }
  function nullspaceTol(B, tol) {
    const M = clone(B), [r, c] = dims(M);
    const pivots = [];
    let row = 0;
    for (let col = 0; col < c && row < r; col++) {
      let p = row;
      for (let i = row + 1; i < r; i++) if (Math.abs(M[i][col]) > Math.abs(M[p][col])) p = i;
      if (Math.abs(M[p][col]) <= tol) continue;
      [M[row], M[p]] = [M[p], M[row]];
      const pv = M[row][col];
      for (let k = 0; k < c; k++) M[row][k] /= pv;
      for (let i = 0; i < r; i++) if (i !== row) { const f = M[i][col]; if (f) for (let k = 0; k < c; k++) M[i][k] -= f * M[row][k]; }
      pivots.push(col);
      row++;
    }
    const free = [...Array(c).keys()].filter((j) => !pivots.includes(j));
    return free.map((f) => {
      const v = new Array(c).fill(0);
      v[f] = 1;
      pivots.forEach((pc, i) => { v[pc] = -M[i][f]; });
      const nrm = Math.hypot(...v);
      return v.map((x) => (Math.abs(x / nrm) < 1e-10 ? 0 : x / nrm));
    });
  }

  // Least-squares / exact solution of A·x = b for each column of B.
  function solve(A, B) {
    const [r, c] = dims(A), [r2, k] = dims(B);
    if (r !== r2) throw new Error(`A has ${r} rows but B has ${r2}`);
    const { R, pivots } = rref(A.map((row, i) => [...row, ...B[i]]));
    if (pivots.some((p) => p >= c)) throw new Error('No solution: the equations contradict each other');
    const X = zeros(c, k);
    pivots.forEach((pc, i) => { for (let j = 0; j < k; j++) X[pc][j] = R[i][c + j]; });
    const freeCount = c - pivots.length;
    return { X, free: freeCount };
  }

  return { zeros, eye, clone, dims, add, mul, transpose, det, rref, rank, inverse, power, nullspace, charpoly, polyRoots, eigen, solve };
})();

(() => {
  const { el } = U;
  const KEY = 'mathsim.matrix.v1';
  const st = {
    A: [['2', '1', '0'], ['1', '3', '1'], ['0', '1', '4']],
    B: [['1'], ['2'], ['3']],
    target: 'A', k: '2', n: '2', fractions: true,
  };
  let result = null, resEl, edA, edB;

  function load() { try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* fresh */ } }
  const save = U.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } }, 300);

  const fmtCell = (v) => {
    if (Math.abs(v) < 1e-12) return '0';
    if (Math.abs(v - Math.round(v)) < 1e-9 * Math.max(1, Math.abs(v))) return String(Math.round(v));
    if (st.fractions) { const f = MX.fraction(v, 1000); if (f) return `${f[0]}/${f[1]}`; }
    return MX.fmt(+v.toPrecision(8));
  };
  const fmtC = (re, im) => (im === 0 ? fmtCell(re) : `${fmtCell(re)} ${im < 0 ? '−' : '+'} ${fmtCell(Math.abs(im))}i`);

  function read(name) {
    MX.M.af = 1;
    let bad = false;
    const M = st[name].map((row, i) => row.map((s, j) => {
      const inp = (name === 'A' ? edA : edB).grid.querySelector(`[data-ij="${i},${j}"]`);
      try {
        const v = s.trim() === '' ? 0 : MX.evaluate(s);
        if (inp) inp.classList.remove('bad');
        return v;
      } catch { bad = true; if (inp) inp.classList.add('bad'); return NaN; }
    }));
    if (bad) throw new Error(`Matrix ${name} has an entry that isn’t a number`);
    return M;
  }

  function editor(name) {
    const grid = el('div', { class: 'mx-grid' });
    const rows = el('select', {}, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('option', { value: n }, n)));
    const cols = el('select', {}, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('option', { value: n }, n)));
    function resize(r, c) {
      st[name] = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (st[name][i] && st[name][i][j] !== undefined ? st[name][i][j] : '0')));
      build();
    }
    function build() {
      const M = st[name];
      rows.value = M.length; cols.value = M[0].length;
      grid.style.gridTemplateColumns = `repeat(${M[0].length}, minmax(48px, 72px))`;
      grid.replaceChildren(...M.flatMap((row, i) => row.map((s, j) => {
        const inp = el('input', { type: 'text', class: 'mono', value: s, 'data-ij': `${i},${j}`, spellcheck: 'false' });
        inp.addEventListener('input', () => { st[name][i][j] = inp.value; save(); });
        inp.addEventListener('focus', () => inp.select());
        inp.addEventListener('keydown', (e) => {
          const go = (di, dj) => { const n = grid.querySelector(`[data-ij="${i + di},${j + dj}"]`); if (n) { e.preventDefault(); n.focus(); } };
          if (e.key === 'ArrowDown' || e.key === 'Enter') go(1, 0);
          else if (e.key === 'ArrowUp') go(-1, 0);
          else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) go(0, 1);
          else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) go(0, -1);
        });
        return inp;
      })));
      save();
    }
    rows.addEventListener('change', () => resize(+rows.value, st[name][0].length));
    cols.addEventListener('change', () => resize(st[name].length, +cols.value));
    const fill = (fn) => { st[name] = st[name].map((row, i) => row.map((_, j) => String(fn(i, j)))); build(); };
    const box = el('div', { class: 'pane mx-ed' },
      el('div', { class: 'mx-head' }, el('h3', {}, 'Matrix ' + name),
        el('span', { class: 'mx-size' }, rows, '×', cols)),
      el('div', { class: 'mx-wrap' }, grid),
      el('div', { class: 'btn-row' },
        U.el('button', { type: 'button', class: 'small', onclick: () => fill((i, j) => (i === j ? 1 : 0)) }, 'Identity'),
        U.el('button', { type: 'button', class: 'small', onclick: () => fill(() => 0) }, 'Zeros'),
        U.el('button', { type: 'button', class: 'small', onclick: () => fill(() => Math.floor(Math.random() * 19) - 9) }, 'Random'),
        U.el('button', { type: 'button', class: 'small', title: 'Make it square', onclick: () => { const n = Math.max(st[name].length, st[name][0].length); resize(n, n); } }, 'Square')));
    build();
    return { box, grid, build };
  }

  function matrixEl(M) {
    const t = el('div', { class: 'mx-show' });
    t.style.gridTemplateColumns = `repeat(${M[0].length}, auto)`;
    t.append(...M.flat().map((v) => el('span', { class: 'mono' }, typeof v === 'string' ? v : fmtCell(v))));
    return el('div', { class: 'mx-bracket' }, t);
  }

  function show(title, body, M) {
    result = M || null;
    resEl.replaceChildren(...[
      el('div', { class: 'mx-res-title' }, title),
      body,
      M ? el('div', { class: 'btn-row' },
        U.el('button', { type: 'button', class: 'small', onclick: () => { st.A = M.map((r) => r.map((v) => fmtCell(v))); edA.build(); } }, 'Copy to A'),
        U.el('button', { type: 'button', class: 'small', onclick: () => { st.B = M.map((r) => r.map((v) => fmtCell(v))); edB.build(); } }, 'Copy to B')) : null,
    ].filter(Boolean));
  }

  function run(op) {
    try {
      const T = () => read(st.target), tn = st.target;
      switch (op) {
        case 'add': return show('A + B', matrixEl(LinAlg.add(read('A'), read('B'))), LinAlg.add(read('A'), read('B')));
        case 'sub': { const R = LinAlg.add(read('A'), read('B'), -1); return show('A − B', matrixEl(R), R); }
        case 'mulAB': { const R = LinAlg.mul(read('A'), read('B')); return show('A × B', matrixEl(R), R); }
        case 'mulBA': { const R = LinAlg.mul(read('B'), read('A')); return show('B × A', matrixEl(R), R); }
        case 'scale': { const k = MX.evaluate(st.k); const R = T().map((r) => r.map((v) => v * k)); return show(`${MX.fmt(k)} · ${tn}`, matrixEl(R), R); }
        case 'pow': { const n = MX.evaluate(st.n); const R = LinAlg.power(T(), n); return show(`${tn}^${MX.fmt(n)}`, matrixEl(R), R); }
        case 'tr': { const R = LinAlg.transpose(T()); return show(`${tn}ᵀ (transpose)`, matrixEl(R), R); }
        case 'inv': { const R = LinAlg.inverse(T()); return show(`${tn}⁻¹ (inverse)`, matrixEl(R), R); }
        case 'det': { const d = LinAlg.det(T()); return show(`det ${tn}`, el('div', { class: 'st-big mono' }, fmtCell(d) + (st.fractions && MX.fraction(d, 1000) ? `  ≈ ${MX.fmt(+d.toPrecision(10))}` : ''))); }
        case 'rank': return show(`rank ${tn}`, el('div', { class: 'st-big mono' }, String(LinAlg.rank(T()))));
        case 'trace': { const M = T(); if (M.length !== M[0].length) throw new Error('The trace needs a square matrix'); return show(`trace ${tn}`, el('div', { class: 'st-big mono' }, fmtCell(M.reduce((s, r, i) => s + r[i], 0)))); }
        case 'rref': { const { R, pivots } = LinAlg.rref(T()); return show(`RREF of ${tn} · pivot columns ${pivots.map((p) => p + 1).join(', ') || 'none'}`, matrixEl(R), R); }
        case 'eig': {
          const M = T();
          const es = LinAlg.eigen(M);
          const poly = LinAlg.charpoly(M);
          const terms = [];
          for (let i = poly.length - 1; i >= 0; i--) {
            const c = poly[i];
            if (Math.abs(c) < 1e-12) continue;
            const pw = i === 0 ? '' : i === 1 ? 'λ' : `λ^${i}`;
            const mag = Math.abs(c) === 1 && i > 0 ? '' : fmtCell(Math.abs(c));
            terms.push(`${terms.length ? (c < 0 ? ' − ' : ' + ') : c < 0 ? '−' : ''}${mag}${pw}`);
          }
          return show(`Eigenvalues of ${tn}`, el('div', {},
            el('p', { class: 'hint mono' }, 'Characteristic polynomial: ' + terms.join('')),
            el('table', { class: 'kv-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'λ'), el('th', {}, 'multiplicity'), el('th', {}, 'eigenvectors'))),
              el('tbody', {}, es.map((e) => el('tr', {},
                el('td', { class: 'mono' }, fmtC(e.re, e.im)),
                el('td', {}, e.im ? '' : String(e.mult)),
                el('td', {}, e.im ? el('span', { class: 'hint' }, 'complex') : el('div', { class: 'mx-vecs' }, e.vecs.map((v) => matrixEl(v.map((x) => [x])))))))))));
        }
        case 'solve': {
          const { X, free } = LinAlg.solve(read('A'), read('B'));
          return show(free ? `A·x = B has infinitely many solutions (${free} free variable${free > 1 ? 's' : ''}); one of them:` : 'Solution x of A·x = B', matrixEl(X), X);
        }
      }
    } catch (e) {
      resEl.replaceChildren(el('p', { class: 'err-text' }, e.message));
    }
  }

  function init(root) {
    load();
    edA = editor('A');
    edB = editor('B');
    resEl = el('div', { class: 'mx-result' }, el('p', { class: 'hint' }, 'Pick an operation. Entries can be expressions like 1/3 or sqrt(2).'));
    const target = el('div', { class: 'seg' }, ['A', 'B'].map((n) => el('button', { type: 'button', 'data-v': n, onclick: () => { st.target = n; save(); paintTarget(); } }, n)));
    const paintTarget = () => target.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.target));
    const kIn = el('input', { type: 'text', class: 'mono gx-mini', value: st.k });
    kIn.addEventListener('input', () => { st.k = kIn.value; save(); });
    const nIn = el('input', { type: 'text', class: 'mono gx-mini', value: st.n });
    nIn.addEventListener('input', () => { st.n = nIn.value; save(); });
    const frac = el('input', { type: 'checkbox' });
    frac.checked = st.fractions;
    frac.addEventListener('change', () => { st.fractions = frac.checked; save(); });
    const b = (label, op, title) => U.el('button', { type: 'button', title: title || '', onclick: () => run(op) }, label);
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Matrices'), el('p', {}, 'Arithmetic, determinant, inverse, row reduction, eigenvalues and linear systems.')),
      el('div', { class: 'mx-top' }, edA.box, edB.box),
      el('div', { class: 'pane mx-ops' },
        el('div', { class: 'mx-opgroup' }, el('h4', {}, 'Both'), b('A + B', 'add'), b('A − B', 'sub'), b('A × B', 'mulAB'), b('B × A', 'mulBA'), b('Solve A·x = B', 'solve', 'B holds the right-hand side(s)')),
        el('div', { class: 'mx-opgroup' }, el('h4', {}, 'One matrix'), target,
          b('det', 'det', 'Determinant'), b('inverse', 'inv'), b('transpose', 'tr'), b('rank', 'rank'), b('trace', 'trace'), b('RREF', 'rref', 'Reduced row echelon form'), b('eigen', 'eig', 'Eigenvalues and eigenvectors'),
          el('span', { class: 'mx-inline' }, b('k ·', 'scale'), kIn), el('span', { class: 'mx-inline' }, b('power', 'pow'), nIn)),
        el('label', { class: 'check inline' }, frac, el('span', {}, 'Show fractions'))),
      el('div', { class: 'pane' }, resEl)));
    paintTarget();
  }

  Shell.register('matrix', {
    label: 'Matrices', key: 5, root: () => document.getElementById('mod-matrix'), init,
    desc: 'Matrix arithmetic, determinants, inverses, row reduction, eigenvalues and eigenvectors, and solving linear systems.',
    features: ['det & inverse', 'RREF & rank', 'Eigenvalues', 'Solve Ax = b'],
  });
})();

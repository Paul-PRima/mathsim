// Statistics: descriptive statistics with histogram and box plot, regression, probability distributions and
// hypothesis tests.
(() => {
  const { el } = U;
  const KEY = 'mathsim.stats.v1';
  const f6 = (v) => (typeof v === 'number' ? MX.fmt(+v.toPrecision(6)) : v);
  const DEMO1 = '12 15 11 18 14 16 13 15 19 22 14 15 17 13 16 15 12 21 14 16 18 15 13 17 30';
  const DEMO2 = '1, 2.1\n2, 3.9\n3, 6.2\n4, 7.8\n5, 10.1\n6, 12.2\n7, 13.8\n8, 16.1\n9, 18.3\n10, 19.7';
  const st = { tab: 'one', data1: DEMO1, data2: DEMO2, model: 'linear', degree: 2, bins: 0, normal: true, population: false,
    dist: 'normal', dparams: {}, dmode: 'le', dx: '1', da: '-1', db: '1', dp: '0.95',
    test: 't1', s1: DEMO1, s2: '14 17 16 19 18 15 20 17 16 18 21 19', mu0: '15', alt: 'two', conf: '0.95', px: '58', pn: '100', p0: '0.5' };

  function load() { try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* fresh */ } }
  const save = U.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } }, 300);

  // Numbers separated by spaces, commas, semicolons or new lines; entries may be expressions (1/3, pi).
  function parseNums(text) {
    const vals = [], bad = [];
    MX.M.af = 1;
    for (const tok of String(text).split(/[\s,;]+/).filter(Boolean)) {
      const n = Number(tok);
      if (tok !== '' && isFinite(n)) { vals.push(n); continue; }
      try { const v = MX.evaluate(tok); if (isFinite(v)) vals.push(v); else bad.push(tok); } catch { bad.push(tok); }
    }
    return { vals, bad };
  }
  function parsePairs(text) {
    const xs = [], ys = [], bad = [];
    String(text).split(/\n/).forEach((line, i) => {
      const parts = line.trim().split(/[\s,;\t]+/).filter(Boolean);
      if (!parts.length) return;
      const nums = parts.map(Number);
      if (nums.length >= 2 && isFinite(nums[0]) && isFinite(nums[1])) { xs.push(nums[0]); ys.push(nums[1]); } else if (i > 0 || isFinite(nums[0])) bad.push(i + 1);
    });
    return { xs, ys, bad };
  }

  // ---------------------------------------------------------------- descriptive statistics
  const quant = (s, p) => { const h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)]) - s[lo]); };
  function describe(a) {
    const n = a.length, s = MX.stats.sorted(a);
    const sum = a.reduce((p, v) => p + v, 0), mean = sum / n;
    let m2 = 0, m3 = 0, m4 = 0;
    for (const v of a) { const d = v - mean; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
    const ss = m2;
    m2 /= n; m3 /= n; m4 /= n;
    const varS = n > 1 ? ss / (n - 1) : NaN, varP = ss / n;
    const q1 = quant(s, 0.25), q3 = quant(s, 0.75), iqr = q3 - q1;
    const counts = new Map();
    for (const v of a) counts.set(v, (counts.get(v) || 0) + 1);
    const top = Math.max(...counts.values());
    const modes = top > 1 ? [...counts].filter(([, c]) => c === top).map(([v]) => v).sort((p, q) => p - q) : [];
    const g1 = m3 / m2 ** 1.5, g2 = m4 / m2 ** 2 - 3;
    return {
      n, sum, mean, median: quant(s, 0.5), modes, min: s[0], max: s[n - 1], q1, q3, iqr, range: s[n - 1] - s[0],
      varS, varP, sdS: Math.sqrt(varS), sdP: Math.sqrt(varP), se: Math.sqrt(varS / n),
      skew: n > 2 ? (g1 * Math.sqrt(n * (n - 1))) / (n - 2) : NaN,
      kurt: n > 3 ? (((n + 1) * g2 + 6) * (n - 1)) / ((n - 2) * (n - 3)) : NaN,
      gmean: s[0] > 0 ? Math.exp(a.reduce((p, v) => p + Math.log(v), 0) / n) : NaN,
      hmean: s[0] > 0 ? n / a.reduce((p, v) => p + 1 / v, 0) : NaN,
      outliers: s.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr),
      sorted: s, sumsq: a.reduce((p, v) => p + v * v, 0),
    };
  }

  const kv = (rows) => el('table', { class: 'kv-table' }, el('tbody', {}, rows.filter(Boolean).map(([k, v, hint]) =>
    el('tr', { title: hint || '' }, el('th', {}, k), el('td', { class: 'mono' }, f6(v))))));

  function histogram(cv, d, bins, showNormal) {
    const s = d.sorted, n = d.n;
    const k = bins || Math.max(1, Math.min(60, Math.ceil(Math.log2(n) + 1)));
    let lo = s[0], hi = s[n - 1];
    if (hi === lo) { lo -= 0.5; hi += 0.5; }
    const w = (hi - lo) / k;
    const counts = new Array(k).fill(0);
    for (const v of s) counts[Math.min(k - 1, Math.floor((v - lo) / w))]++;
    const sd = d.sdS || 1;
    const normMax = showNormal ? (n * w) / (sd * Math.sqrt(2 * Math.PI)) : 0;
    const fr = Charts.frame(cv, { xmin: lo - w * 0.5, xmax: hi + w * 0.5, ymin: 0, ymax: Math.max(...counts, normMax) * 1.1, ylabel: 'count' });
    const { ctx, X, Y } = fr;
    counts.forEach((c, i) => {
      const x0 = X(lo + i * w), x1 = X(lo + (i + 1) * w);
      ctx.fillStyle = 'rgba(77,171,247,0.55)';
      ctx.fillRect(x0 + 1, Y(c), x1 - x0 - 2, Y(0) - Y(c));
      ctx.strokeStyle = '#4dabf7';
      ctx.strokeRect(x0 + 1.5, Y(c) + 0.5, x1 - x0 - 3, Y(0) - Y(c));
    });
    if (showNormal && d.sdS > 0) Charts.curve(fr, (x) => (n * w * Math.exp(-0.5 * ((x - d.mean) / sd) ** 2)) / (sd * Math.sqrt(2 * Math.PI)), lo - w * 0.5, hi + w * 0.5, '#ff922b', 2);
    return k;
  }

  function boxplot(cv, d) {
    const pad = (d.max - d.min) * 0.08 || 1;
    const fr = Charts.frame(cv, { xmin: d.min - pad, xmax: d.max + pad, ymin: 0, ymax: 1 });
    const { ctx, X, Y } = fr;
    const wl = Math.min(...d.sorted.filter((v) => v >= d.q1 - 1.5 * d.iqr)), wh = Math.max(...d.sorted.filter((v) => v <= d.q3 + 1.5 * d.iqr));
    const yc = Y(0.5), hh = (Y(0) - Y(1)) * 0.28;
    ctx.strokeStyle = Theme.text;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(204,93,232,0.35)';
    ctx.fillRect(X(d.q1), yc - hh, X(d.q3) - X(d.q1), 2 * hh);
    ctx.strokeRect(X(d.q1), yc - hh, X(d.q3) - X(d.q1), 2 * hh);
    ctx.beginPath();
    ctx.moveTo(X(d.median), yc - hh); ctx.lineTo(X(d.median), yc + hh);
    ctx.moveTo(X(wl), yc); ctx.lineTo(X(d.q1), yc); ctx.moveTo(X(d.q3), yc); ctx.lineTo(X(wh), yc);
    ctx.moveTo(X(wl), yc - hh / 2); ctx.lineTo(X(wl), yc + hh / 2); ctx.moveTo(X(wh), yc - hh / 2); ctx.lineTo(X(wh), yc + hh / 2);
    ctx.stroke();
    ctx.fillStyle = '#ff6b6b';
    for (const o of d.outliers) { ctx.beginPath(); ctx.arc(X(o), yc, 3.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ff922b';
    ctx.beginPath(); ctx.moveTo(X(d.mean), yc - 5); ctx.lineTo(X(d.mean) + 5, yc); ctx.lineTo(X(d.mean), yc + 5); ctx.lineTo(X(d.mean) - 5, yc); ctx.fill();
  }

  function oneVarTab() {
    const ta = el('textarea', { class: 'mono st-data', spellcheck: 'false' }, st.data1);
    const out = el('div', { class: 'st-out' });
    const hist = el('canvas', { class: 'chart' }), box = el('canvas', { class: 'chart short' });
    const binsI = el('input', { type: 'range', min: 0, max: 60, step: 1, value: st.bins });
    const binsL = el('span', { class: 'hint' });
    const normC = el('input', { type: 'checkbox' }); normC.checked = st.normal;
    const msg = el('p', { class: 'hint' });
    function update() {
      st.data1 = ta.value; st.bins = +binsI.value; st.normal = normC.checked; save();
      const { vals, bad } = parseNums(ta.value);
      msg.textContent = `${vals.length} value${vals.length === 1 ? '' : 's'}` + (bad.length ? ` · ignored: ${bad.slice(0, 5).join(' ')}${bad.length > 5 ? '…' : ''}` : '');
      if (vals.length < 1) { out.replaceChildren(el('p', { class: 'hint' }, 'Enter some numbers.')); return; }
      const d = describe(vals);
      out.replaceChildren(
        el('div', { class: 'st-cols' },
          el('div', {}, el('h4', {}, 'Centre'), kv([['Count n', d.n], ['Sum', d.sum], ['Mean x̄', d.mean], ['Median', d.median],
            ['Mode', d.modes.length ? d.modes.slice(0, 6).map(f6).join(', ') + (d.modes.length > 6 ? '…' : '') : 'none'],
            ['Geometric mean', d.gmean, 'only for positive data'], ['Harmonic mean', d.hmean]])),
          el('div', {}, el('h4', {}, 'Spread'), kv([['Std dev s (sample)', d.sdS], ['Std dev σ (population)', d.sdP], ['Variance s²', d.varS], ['Variance σ²', d.varP],
            ['Std error of mean', d.se], ['Coeff. of variation', d.mean ? d.sdS / Math.abs(d.mean) : NaN]])),
          el('div', {}, el('h4', {}, 'Five-number summary'), kv([['Minimum', d.min], ['Q1 (25%)', d.q1], ['Median', d.median], ['Q3 (75%)', d.q3], ['Maximum', d.max], ['Range', d.range], ['IQR', d.iqr]])),
          el('div', {}, el('h4', {}, 'Shape'), kv([['Skewness', d.skew, 'sample-adjusted; > 0 means a long right tail'], ['Excess kurtosis', d.kurt, '0 for a normal distribution'], ['Σx²', d.sumsq],
            ['Outliers (1.5·IQR)', d.outliers.length ? d.outliers.slice(0, 8).map(f6).join(', ') : 'none']]))));
      requestAnimationFrame(() => {
        const k = histogram(hist, d, st.bins, st.normal);
        binsL.textContent = `${k} bins${st.bins ? '' : ' (auto)'}`;
        boxplot(box, d);
      });
    }
    ta.addEventListener('input', update);
    binsI.addEventListener('input', update);
    normC.addEventListener('change', update);
    const sample = (kind) => {
      const n = 60;
      const g = () => { let u = 0; for (let i = 0; i < 12; i++) u += Math.random(); return u - 6; };
      const v = Array.from({ length: n }, () => (kind === 'normal' ? 50 + 10 * g() : kind === 'skewed' ? -10 * Math.log(1 - Math.random()) : 1 + Math.floor(Math.random() * 6)));
      ta.value = v.map((x) => +x.toFixed(2)).join(' ');
      update();
    };
    const view = el('div', { class: 'st-grid' },
      el('div', { class: 'pane' },
        el('h3', {}, 'Data'), ta, msg,
        el('div', { class: 'btn-row' },
          U.el('button', { type: 'button', class: 'small', onclick: () => sample('normal') }, 'Random normal'),
          U.el('button', { type: 'button', class: 'small', onclick: () => sample('skewed') }, 'Random skewed'),
          U.el('button', { type: 'button', class: 'small', onclick: () => sample('dice') }, 'Dice rolls'),
          U.el('button', { type: 'button', class: 'small', onclick: () => { ta.value = ''; update(); } }, 'Clear'),
          DataFile.button('Open file…', async (table) => { const cols = await DataFile.pickColumns(table, ['Column'], 'Which column?'); if (cols) { ta.value = DataFile.numbers(cols[0]).join(' '); update(); } })),
        el('p', { class: 'hint' }, 'Separate values with spaces, commas or new lines — or paste a column from a spreadsheet.')),
      el('div', { class: 'pane' },
        el('div', { class: 'st-charthead' }, el('h3', {}, 'Histogram'), el('label', { class: 'check inline' }, normC, el('span', {}, 'normal curve')), el('span', { class: 'st-bins' }, binsL, binsI)),
        hist, el('h3', {}, 'Box plot'), box, out));
    update();
    return { view, update };
  }

  // ---------------------------------------------------------------- regression
  // Solves the square system A·x = b (Gaussian elimination with partial pivoting).
  function solveLin(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
    return x;
  }
  // Least-squares polynomial; fitted on standardized x for accuracy, then expanded back. Coefs low → high.
  function polyfit(xs, ys, deg) {
    const n = xs.length, m = MX.stats.mean(xs);
    const s = Math.sqrt(xs.reduce((p, v) => p + (v - m) ** 2, 0) / n) || 1;
    const ts = xs.map((x) => (x - m) / s);
    const A = Array.from({ length: deg + 1 }, (_, i) => Array.from({ length: deg + 1 }, (_, j) => ts.reduce((p, t) => p + t ** (i + j), 0)));
    const b = Array.from({ length: deg + 1 }, (_, i) => ts.reduce((p, t, k) => p + t ** i * ys[k], 0));
    const ct = solveLin(A, b);
    if (!ct) return null;
    // expand Σ ct[i]·((x − m)/s)^i into powers of x
    const c = new Array(deg + 1).fill(0);
    for (let i = 0; i <= deg; i++) for (let j = 0; j <= i; j++) c[j] += ct[i] * MX.S.nCr(i, j) * (-m) ** (i - j) / s ** i;
    return c;
  }
  const signed = (v, first) => (first ? f6(v) : v < 0 ? ` − ${f6(-v)}` : ` + ${f6(v)}`);
  function polyStr(c) {
    const terms = [];
    for (let i = c.length - 1; i >= 0; i--) {
      const v = c[i];
      const pw = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`;
      terms.push(terms.length ? signed(v, false) + pw : f6(v) + pw);
    }
    return 'y = ' + terms.join('');
  }
  const MODELS = {
    linear: 'Linear  y = a + bx', poly: 'Polynomial', exp: 'Exponential  y = a·e^(bx)', power: 'Power  y = a·x^b', log: 'Logarithmic  y = a + b·ln x', logistic: 'Logistic  y = L / (1 + e^(−k(x − x₀)))',
  };
  function fit(model, xs, ys, degree) {
    const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
    if (model === 'linear' || model === 'poly') {
      const deg = model === 'linear' ? 1 : degree;
      ok(xs.length > deg, `Needs at least ${deg + 1} points`);
      const c = polyfit(xs, ys, deg);
      ok(c, 'The points don’t determine a unique fit');
      return { f: (x) => c.reduce((p, v, i) => p + v * x ** i, 0), eq: polyStr(c), coefs: c.map((v, i) => [`x^${i} coefficient`, v]) };
    }
    if (model === 'exp') {
      ok(ys.every((y) => y > 0), 'Exponential fits need every y > 0');
      const c = polyfit(xs, ys.map(Math.log), 1);
      const a = Math.exp(c[0]), b = c[1];
      return { f: (x) => a * Math.exp(b * x), eq: `y = ${f6(a)} · e^(${f6(b)}x)`, coefs: [['a', a], ['b', b], ['growth per unit x', Math.exp(b) - 1]] };
    }
    if (model === 'power') {
      ok(xs.every((x) => x > 0) && ys.every((y) => y > 0), 'Power fits need x > 0 and y > 0');
      const c = polyfit(xs.map(Math.log), ys.map(Math.log), 1);
      const a = Math.exp(c[0]), b = c[1];
      return { f: (x) => a * x ** b, eq: `y = ${f6(a)} · x^${f6(b)}`, coefs: [['a', a], ['b', b]] };
    }
    if (model === 'log') {
      ok(xs.every((x) => x > 0), 'Logarithmic fits need every x > 0');
      const c = polyfit(xs.map(Math.log), ys, 1);
      return { f: (x) => c[0] + c[1] * Math.log(x), eq: `y = ${f6(c[0])}${signed(c[1])} · ln x`, coefs: [['a', c[0]], ['b', c[1]]] };
    }
    // logistic: Gauss–Newton from a rough start
    ok(xs.length >= 4, 'Needs at least 4 points');
    let L = Math.max(...ys) * 1.05, x0 = MX.stats.median(xs), k = 4 / ((Math.max(...xs) - Math.min(...xs)) || 1);
    for (let it = 0; it < 200; it++) {
      const J = [], r = [];
      xs.forEach((x, i) => {
        const e = Math.exp(-k * (x - x0)), d = 1 + e, y = L / d;
        r.push(ys[i] - y);
        J.push([1 / d, (L * (x - x0) * e) / (d * d), (-L * k * e) / (d * d)]);
      });
      const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => J.reduce((p, row) => p + row[i] * row[j], 0) + (i === j ? 1e-9 : 0)));
      const g = [0, 1, 2].map((i) => J.reduce((p, row, q) => p + row[i] * r[q], 0));
      const step = solveLin(A, g);
      if (!step) break;
      L += step[0]; k += step[1]; x0 += step[2];
      if (Math.max(...step.map(Math.abs)) < 1e-12) break;
    }
    ok(isFinite(L) && isFinite(k) && isFinite(x0), 'The logistic fit did not converge');
    return { f: (x) => L / (1 + Math.exp(-k * (x - x0))), eq: `y = ${f6(L)} / (1 + e^(−${f6(k)}(x − ${f6(x0)})))`, coefs: [['L (limit)', L], ['k (rate)', k], ['x₀ (midpoint)', x0]] };
  }

  function twoVarTab() {
    const ta = el('textarea', { class: 'mono st-data', spellcheck: 'false' }, st.data2);
    const model = el('select', {}, Object.entries(MODELS).map(([k, v]) => el('option', { value: k }, v)));
    model.value = st.model;
    const deg = el('input', { type: 'number', min: 2, max: 8, step: 1, value: st.degree, class: 'num' });
    const degRow = el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Degree'), deg);
    const pred = el('input', { type: 'text', class: 'mono', placeholder: 'x value' });
    const predOut = el('div', { class: 'mono st-big' });
    const msg = el('p', { class: 'hint' });
    const out = el('div', { class: 'st-out' });
    const plot = el('canvas', { class: 'chart tall' }), resid = el('canvas', { class: 'chart short' });
    let current = null;
    function update() {
      st.data2 = ta.value; st.model = model.value; st.degree = U.clamp(+deg.value || 2, 2, 8); save();
      degRow.hidden = st.model !== 'poly';
      const { xs, ys, bad } = parsePairs(ta.value);
      msg.textContent = `${xs.length} point${xs.length === 1 ? '' : 's'}` + (bad.length ? ` · skipped lines ${bad.slice(0, 6).join(', ')}` : '');
      current = null;
      if (xs.length < 2) { out.replaceChildren(el('p', { class: 'hint' }, 'Enter at least two x, y pairs.')); return; }
      const mx = MX.stats.mean(xs), my = MX.stats.mean(ys);
      const sxx = xs.reduce((p, x) => p + (x - mx) ** 2, 0), syy = ys.reduce((p, y) => p + (y - my) ** 2, 0);
      const sxy = xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0);
      const r = sxy / Math.sqrt(sxx * syy);
      let F;
      try { F = fit(st.model, xs, ys, st.degree); } catch (e) { out.replaceChildren(el('p', { class: 'err-text' }, e.message)); drawPlot(xs, ys, null); return; }
      current = F;
      const res = ys.map((y, i) => y - F.f(xs[i]));
      const ssr = res.reduce((p, v) => p + v * v, 0);
      const r2 = 1 - ssr / syy;
      const nParams = F.coefs.length;
      out.replaceChildren(
        el('div', { class: 'st-eq mono' }, F.eq),
        el('div', { class: 'st-cols' },
          el('div', {}, el('h4', {}, 'Fit'), kv([['R²', r2, 'share of the variation in y explained by the model'], ['Adjusted R²', 1 - ((1 - r2) * (xs.length - 1)) / (xs.length - nParams), ''], ['Residual std error', Math.sqrt(ssr / Math.max(1, xs.length - nParams))], ...F.coefs])),
          el('div', {}, el('h4', {}, 'Data'), kv([['n', xs.length], ['Correlation r', r, 'linear correlation (Pearson)'], ['Mean x̄', mx], ['Mean ȳ', my], ['Std dev x', Math.sqrt(sxx / (xs.length - 1))], ['Std dev y', Math.sqrt(syy / (xs.length - 1))], ['Covariance', sxy / (xs.length - 1)]]))));
      updatePred();
      requestAnimationFrame(() => {
        drawPlot(xs, ys, F);
        const ext = Math.max(...res.map(Math.abs)) * 1.2 || 1;
        const fr = Charts.frame(resid, { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: -ext, ymax: ext, ylabel: 'residual' });
        fr.ctx.strokeStyle = Theme.muted; fr.ctx.beginPath(); fr.ctx.moveTo(fr.x0, fr.Y(0)); fr.ctx.lineTo(fr.x1, fr.Y(0)); fr.ctx.stroke();
        fr.ctx.fillStyle = '#cc5de8';
        xs.forEach((x, i) => { fr.ctx.beginPath(); fr.ctx.arc(fr.X(x), fr.Y(res[i]), 3.5, 0, Math.PI * 2); fr.ctx.fill(); });
      });
    }
    function drawPlot(xs, ys, F) {
      const pad = (a) => { const lo = Math.min(...a), hi = Math.max(...a), p = (hi - lo) * 0.08 || 1; return [lo - p, hi + p]; };
      const [x0, x1] = pad(xs), [y0, y1] = pad(ys);
      const fr = Charts.frame(plot, { xmin: x0, xmax: x1, ymin: y0, ymax: y1, xlabel: 'x', ylabel: 'y' });
      if (F) Charts.curve(fr, F.f, x0, x1, '#ff922b', 2);
      fr.ctx.fillStyle = '#4dabf7';
      xs.forEach((x, i) => { fr.ctx.beginPath(); fr.ctx.arc(fr.X(x), fr.Y(ys[i]), 4, 0, Math.PI * 2); fr.ctx.fill(); });
    }
    function updatePred() {
      if (!current || !pred.value.trim()) { predOut.textContent = ''; return; }
      try { const x = MX.evaluate(pred.value); predOut.textContent = `ŷ(${f6(x)}) = ${f6(current.f(x))}`; } catch (e) { predOut.textContent = e.message; }
    }
    ta.addEventListener('input', update);
    model.addEventListener('change', update);
    deg.addEventListener('input', update);
    pred.addEventListener('input', updatePred);
    const view = el('div', { class: 'st-grid' },
      el('div', { class: 'pane' },
        el('h3', {}, 'Data (x, y per line)'), ta, msg,
        el('div', { class: 'btn-row' },
          DataFile.button('Open file…', async (table) => {
            const cols = await DataFile.pickColumns(table, ['x', 'y'], 'Which columns are x and y?');
            if (!cols) return;
            const n = Math.min(cols[0].length, cols[1].length), lines = [];
            for (let i = 0; i < n; i++) { const x = Number(String(cols[0][i]).replace(',', '.')), y = Number(String(cols[1][i]).replace(',', '.')); if (cols[0][i] !== '' && cols[1][i] !== '' && isFinite(x) && isFinite(y)) lines.push(`${x}, ${y}`); }
            ta.value = lines.join('\n'); update();
          }),
          U.el('button', { type: 'button', class: 'small', title: 'Show the points and the fitted curve in Graphing', onclick: () => {
            const { xs, ys } = parsePairs(ta.value);
            if (!xs.length) return U.toast('No data yet');
            Shell.api.graph.add(current ? [current.eq.replace(/·/g, '*')] : [], { table: { rows: xs.map((x, i) => [x, ys[i]]), fit: 'none' } });
          } }, '📈 Open in Graphing')),
        el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Model'), model), degRow,
        el('h3', {}, 'Predict'), pred, predOut,
        el('p', { class: 'hint' }, 'Paste two columns from a spreadsheet, or type pairs like “3, 7.5”.')),
      el('div', { class: 'pane' }, el('h3', {}, 'Scatter plot and fit'), plot, out, el('h3', {}, 'Residuals'), resid));
    update();
    return { view, update };
  }

  // ---------------------------------------------------------------- distributions
  function distTab() {
    const sel = el('select', {}, Object.entries(MX.DIST).map(([k, d]) => el('option', { value: k }, d.label)));
    sel.value = st.dist;
    const paramsBox = el('div', { class: 'grid2' });
    const mode = el('select', {});
    const inputs = { x: el('input', { type: 'text', class: 'mono', value: st.dx }), a: el('input', { type: 'text', class: 'mono', value: st.da }), b: el('input', { type: 'text', class: 'mono', value: st.db }), p: el('input', { type: 'text', class: 'mono', value: st.dp }) };
    const row = (label, inp) => el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, label), inp);
    const rows = { x: row('x', inputs.x), a: row('from a', inputs.a), b: row('to b', inputs.b), p: row('probability p', inputs.p) };
    const result = el('div', { class: 'st-big mono' });
    const info = el('div');
    const cv = el('canvas', { class: 'chart tall' });
    let pins = {};
    function buildParams() {
      const d = MX.DIST[sel.value];
      const saved = st.dparams[sel.value] || {};
      pins = {};
      paramsBox.replaceChildren(...d.params.map((p) => {
        const inp = el('input', { type: 'text', class: 'mono', value: saved[p.key] ?? p.def });
        inp.addEventListener('input', update);
        pins[p.key] = inp;
        return row(p.label, inp);
      }));
      const modes = d.discrete
        ? [['eq', 'P(X = x)'], ['le', 'P(X ≤ x)'], ['ge', 'P(X ≥ x)'], ['between', 'P(a ≤ X ≤ b)'], ['inv', 'Inverse: smallest x with P(X ≤ x) ≥ p']]
        : [['le', 'P(X ≤ x)'], ['ge', 'P(X ≥ x)'], ['between', 'P(a ≤ X ≤ b)'], ['inv', 'Inverse: x with P(X ≤ x) = p']];
      mode.replaceChildren(...modes.map(([v, l]) => el('option', { value: v }, l)));
      mode.value = modes.some(([v]) => v === st.dmode) ? st.dmode : 'le';
    }
    function update() {
      const d = MX.DIST[sel.value];
      st.dist = sel.value; st.dmode = mode.value;
      st.dx = inputs.x.value; st.da = inputs.a.value; st.db = inputs.b.value; st.dp = inputs.p.value;
      const p = {};
      try {
        for (const q of d.params) {
          const v = MX.evaluate(pins[q.key].value);
          if (q.min !== undefined && !(v > q.min || (q.key === 'p' && v === q.min))) throw new Error(`${q.label} must be greater than ${q.min}`);
          if (q.max !== undefined && v > q.max) throw new Error(`${q.label} must be at most ${q.max}`);
          if (q.int && !Number.isInteger(v)) throw new Error(`${q.label} must be a whole number`);
          p[q.key] = v;
        }
        if (d === MX.DIST.uniform && !(p.b > p.a)) throw new Error('b must be greater than a');
      } catch (e) { result.textContent = e.message; result.classList.add('err-text'); return; }
      result.classList.remove('err-text');
      st.dparams[sel.value] = Object.fromEntries(d.params.map((q) => [q.key, pins[q.key].value]));
      save();
      const m = mode.value;
      for (const k of Object.keys(rows)) rows[k].hidden = !(k === 'x' ? ['eq', 'le', 'ge'].includes(m) : k === 'p' ? m === 'inv' : m === 'between');
      let shadeLo = null, shadeHi = null, value, text;
      try {
        const num = (k) => MX.evaluate(inputs[k].value);
        const c = (x) => d.cdf(x, p);
        if (m === 'eq') { const x = num('x'); value = d.pdf(x, p); text = `P(X = ${f6(x)}) = `; shadeLo = shadeHi = x; }
        else if (m === 'le') { const x = num('x'); value = c(x); text = `P(X ≤ ${f6(x)}) = `; shadeHi = x; shadeLo = -Infinity; }
        else if (m === 'ge') { const x = num('x'); value = 1 - (d.discrete ? c(Math.ceil(x) - 1) : c(x)); text = `P(X ≥ ${f6(x)}) = `; shadeLo = x; shadeHi = Infinity; }
        else if (m === 'between') {
          const a = num('a'), b = num('b');
          value = Math.max(0, c(b) - (d.discrete ? c(Math.ceil(a) - 1) : c(a)));
          text = `P(${f6(a)} ≤ X ≤ ${f6(b)}) = `; shadeLo = a; shadeHi = b;
        } else { const q = num('p'); value = MX.quantile(d, q, p); text = `x = `; shadeLo = -Infinity; shadeHi = value; }
        result.textContent = text + f6(value);
      } catch (e) { result.textContent = e.message; result.classList.add('err-text'); }
      const mean = d.mean(p), v = d.variance(p);
      info.replaceChildren(kv([['Mean', mean], ['Variance', v], ['Std dev', Math.sqrt(v)]]));
      requestAnimationFrame(() => drawDist(d, p, shadeLo, shadeHi));
    }
    function drawDist(d, p, lo, hi) {
      const [x0, x1] = d.range(p);
      if (d.discrete) {
        const ks = [];
        for (let k = Math.max(0, Math.floor(x0)); k <= Math.ceil(x1) && ks.length < 400; k++) ks.push(k);
        const ymax = Math.max(...ks.map((k) => d.pdf(k, p))) * 1.1 || 1;
        const fr = Charts.frame(cv, { xmin: ks[0] - 0.7, xmax: ks[ks.length - 1] + 0.7, ymin: 0, ymax, discreteX: true, ylabel: 'P(X = k)' });
        const bw = Math.max(1, (fr.X(1) - fr.X(0)) * 0.7);
        for (const k of ks) {
          const y = d.pdf(k, p), on = lo != null && k >= lo - 1e-9 && k <= hi + 1e-9;
          fr.ctx.fillStyle = on ? '#ff922b' : 'rgba(77,171,247,0.6)';
          fr.ctx.fillRect(fr.X(k) - bw / 2, fr.Y(y), bw, fr.Y(0) - fr.Y(y));
        }
      } else {
        const N = 400;
        let ymax = 0;
        for (let i = 0; i <= N; i++) { const y = d.pdf(x0 + ((x1 - x0) * i) / N, p); if (isFinite(y)) ymax = Math.max(ymax, y); }
        ymax = Math.min(ymax, 50) * 1.1 || 1;
        const fr = Charts.frame(cv, { xmin: x0, xmax: x1, ymin: 0, ymax, ylabel: 'density' });
        const { ctx, X, Y } = fr;
        if (lo != null) {
          const a = Math.max(x0, lo), b = Math.min(x1, hi);
          if (b > a) {
            ctx.fillStyle = 'rgba(255,146,43,0.45)';
            ctx.beginPath(); ctx.moveTo(X(a), Y(0));
            for (let i = 0; i <= N; i++) { const x = a + ((b - a) * i) / N; ctx.lineTo(X(x), Y(Math.min(ymax, d.pdf(x, p)))); }
            ctx.lineTo(X(b), Y(0)); ctx.fill();
          }
        }
        Charts.curve(fr, (x) => Math.min(ymax * 2, d.pdf(x, p)), x0, x1, '#4dabf7', 2.2);
      }
    }
    sel.addEventListener('change', () => { buildParams(); update(); });
    mode.addEventListener('change', update);
    Object.values(inputs).forEach((i) => i.addEventListener('input', update));
    buildParams();
    const view = el('div', { class: 'st-grid' },
      el('div', { class: 'pane' },
        el('h3', {}, 'Distribution'), el('label', { class: 'ctl' }, sel), paramsBox,
        el('h3', {}, 'Probability'), el('label', { class: 'ctl' }, mode), rows.x, rows.a, rows.b, rows.p,
        el('p', { class: 'hint' }, 'Limits accept expressions such as 1.96, -inf or mean + 2.')),
      el('div', { class: 'pane' }, result, cv, info));
    update();
    return { view, update };
  }

  // ---------------------------------------------------------------- hypothesis tests
  const TESTS = { t1: 'One-sample t-test', t2: 'Two-sample t-test (Welch)', tp: 'Paired t-test', z1: 'One-proportion z-test', chi_gof: 'Chi-square goodness of fit', chi_ind: 'Chi-square test of independence', anova: 'One-way ANOVA' };
  const TEST_EXAMPLES = {
    t1: ['12 15 11 18 14 16 13 15 19 22 14 15 17 13 16 15 12 21 14 16', ''], t2: ['12 15 11 18 14 16 13 15 19 22', '14 17 16 19 18 15 20 17 16 18 21 19'],
    tp: ['72 80 65 90 77 84 69 75', '75 84 66 95 79 88 70 80'], z1: ['', ''],
    chi_gof: ['18 22 16 25 19 20', ''], chi_ind: ['20 15 25\n30 25 15', ''], anova: ['23 25 21 27 24\n30 28 31 27 29\n22 20 24 21 23', ''],
  };
  function testsTab() {
    const sel = el('select', {}, Object.entries(TESTS).map(([k, v]) => el('option', { value: k }, v)));
    sel.value = st.test;
    const s1 = el('textarea', { class: 'mono st-data small', spellcheck: 'false' }, st.s1);
    const s2 = el('textarea', { class: 'mono st-data small', spellcheck: 'false' }, st.s2);
    const mu0 = el('input', { type: 'text', class: 'mono', value: st.mu0 });
    const alt = el('select', {}, [['two', '≠ (two-sided)'], ['less', '< (left-tailed)'], ['greater', '> (right-tailed)']].map(([v, l]) => el('option', { value: v }, l)));
    alt.value = st.alt;
    const conf = el('input', { type: 'text', class: 'mono', value: st.conf });
    const px = el('input', { type: 'text', class: 'mono', value: st.px }), pn = el('input', { type: 'text', class: 'mono', value: st.pn }), p0 = el('input', { type: 'text', class: 'mono', value: st.p0 });
    const row = (l, i) => el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, l), i);
    const r1 = row('Sample 1', s1), r2 = row('Sample 2', s2), rmu = row('Hypothesised value (μ₀ or difference)', mu0);
    const ralt = row('Alternative', alt);
    const rprop = el('div', { class: 'grid2' }, row('Successes x', px), row('Trials n', pn));
    const rp0 = row('Hypothesised proportion p₀', p0);
    const out = el('div');
    const cv = el('canvas', { class: 'chart' });
    function update() {
      Object.assign(st, { test: sel.value, s1: s1.value, s2: s2.value, mu0: mu0.value, alt: alt.value, conf: conf.value, px: px.value, pn: pn.value, p0: p0.value });
      save();
      const t = sel.value;
      const other = t === 'chi_gof' || t === 'chi_ind' || t === 'anova';
      r1.hidden = t === 'z1'; r2.hidden = t === 't1' || t === 'z1' || t === 'chi_ind' || t === 'anova'; rmu.hidden = t === 'z1' || other; rprop.hidden = rp0.hidden = t !== 'z1';
      ralt.hidden = other;
      r1.querySelector('.ctl-label').textContent = { chi_gof: 'Observed counts', chi_ind: 'Table of counts (one row per line)', anova: 'Groups (one group per line)' }[t] || 'Sample 1';
      r2.querySelector('.ctl-label').textContent = t === 'tp' ? 'Sample 2 (same order as sample 1)' : t === 'chi_gof' ? 'Expected proportions (leave empty for all equal)' : 'Sample 2';
      if (other) return otherTest(t);
      let stat, df = null, se, est, label, distName, rowsOut;
      try {
        const cl = MX.evaluate(conf.value);
        if (!(cl > 0 && cl < 1)) throw new Error('Confidence level must be between 0 and 1, e.g. 0.95');
        if (t === 'z1') {
          const x = MX.evaluate(px.value), n = MX.evaluate(pn.value), q0 = MX.evaluate(p0.value);
          if (!(n > 0 && x >= 0 && x <= n)) throw new Error('Need 0 ≤ x ≤ n');
          est = x / n;
          stat = (est - q0) / Math.sqrt((q0 * (1 - q0)) / n);
          se = Math.sqrt((est * (1 - est)) / n);
          label = 'p̂'; distName = 'z';
          rowsOut = [['Sample proportion p̂', est], ['n', n]];
        } else {
          const a = parseNums(s1.value).vals, m0 = MX.evaluate(mu0.value);
          if (t === 't1') {
            if (a.length < 2) throw new Error('Sample 1 needs at least 2 values');
            const d = describe(a);
            est = d.mean; se = d.se; df = a.length - 1; label = 'x̄';
            rowsOut = [['n', a.length], ['Mean x̄', d.mean], ['Std dev s', d.sdS], ['Std error', se]];
          } else {
            const b = parseNums(s2.value).vals;
            if (a.length < 2 || b.length < 2) throw new Error('Each sample needs at least 2 values');
            if (t === 'tp') {
              if (a.length !== b.length) throw new Error(`Paired samples need the same length (${a.length} vs ${b.length})`);
              const diffs = a.map((v, i) => v - b[i]);
              const d = describe(diffs);
              est = d.mean; se = d.se; df = a.length - 1; label = 'mean difference';
              rowsOut = [['Pairs n', a.length], ['Mean difference', d.mean], ['Std dev of differences', d.sdS]];
            } else {
              const da = describe(a), db = describe(b);
              const va = da.varS / a.length, vb = db.varS / b.length;
              est = da.mean - db.mean; se = Math.sqrt(va + vb);
              df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
              label = 'x̄₁ − x̄₂';
              rowsOut = [['n₁ / n₂', `${a.length} / ${b.length}`], ['Mean x̄₁', da.mean], ['Mean x̄₂', db.mean], ['Std dev s₁', da.sdS], ['Std dev s₂', db.sdS]];
            }
          }
          stat = (est - m0) / se;
          distName = 't';
        }
        const D = distName === 'z' ? MX.DIST.normal : MX.DIST.t, P = distName === 'z' ? { mu: 0, sigma: 1 } : { nu: df };
        const cdf = D.cdf(stat, P);
        const pval = alt.value === 'two' ? 2 * Math.min(cdf, 1 - cdf) : alt.value === 'less' ? cdf : 1 - cdf;
        const crit = MX.quantile(D, 1 - (1 - cl) / 2, P);
        const ci = [est - crit * se, est + crit * se];
        const sig = pval < 1 - cl;
        out.replaceChildren(
          el('div', { class: 'st-big mono' }, `${distName} = ${f6(stat)}${df != null ? `,  df = ${f6(df)}` : ''},  p = ${f6(pval)}`),
          el('p', { class: 'st-verdict ' + (sig ? 'yes' : 'no') }, sig
            ? `Significant at the ${f6((1 - cl) * 100)}% level: reject the null hypothesis.`
            : `Not significant at the ${f6((1 - cl) * 100)}% level: the data are consistent with the null hypothesis.`),
          kv([...rowsOut, [`Estimate (${label})`, est], [`${f6(cl * 100)}% confidence interval`, `${f6(ci[0])} … ${f6(ci[1])}`]]));
        requestAnimationFrame(() => {
          const lim = Math.max(4, Math.abs(stat) * 1.2);
          const fr = Charts.frame(cv, { xmin: -lim, xmax: lim, ymin: 0, ymax: D.pdf(0, P) * 1.15, ylabel: 'density' });
          const { ctx, X, Y } = fr;
          const tail = (a, b) => {
            ctx.fillStyle = 'rgba(255,107,107,0.45)';
            ctx.beginPath(); ctx.moveTo(X(a), Y(0));
            for (let i = 0; i <= 100; i++) { const x = a + ((b - a) * i) / 100; ctx.lineTo(X(x), Y(D.pdf(x, P))); }
            ctx.lineTo(X(b), Y(0)); ctx.fill();
          };
          const s = Math.abs(stat);
          if (alt.value === 'two') { tail(-lim, -s); tail(s, lim); } else if (alt.value === 'less') tail(-lim, stat); else tail(stat, lim);
          Charts.curve(fr, (x) => D.pdf(x, P), -lim, lim, '#4dabf7', 2);
          ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(X(stat), fr.y0); ctx.lineTo(X(stat), fr.y1); ctx.stroke();
        });
      } catch (e) { out.replaceChildren(el('p', { class: 'err-text' }, e.message)); }
    }
    // chi-square tests and ANOVA: statistic, df and p-value from the χ² or F distribution
    function otherTest(t) {
      try {
        const cl = MX.evaluate(conf.value);
        if (!(cl > 0 && cl < 1)) throw new Error('Confidence level must be between 0 and 1, e.g. 0.95');
        let stat, df1, df2 = null, rowsOut, D, note = '';
        if (t === 'chi_gof') {
          const O = parseNums(s1.value).vals;
          if (O.length < 2) throw new Error('Enter at least two observed counts');
          let p = parseNums(s2.value).vals;
          if (!p.length) p = O.map(() => 1);
          if (p.length !== O.length) throw new Error(`Give ${O.length} expected proportions (one per count), or leave them empty`);
          const N = O.reduce((a, b) => a + b, 0), ps = p.reduce((a, b) => a + b, 0);
          const E = p.map((q) => (N * q) / ps);
          stat = O.reduce((s, o, i) => s + (o - E[i]) ** 2 / E[i], 0);
          df1 = O.length - 1; D = 'chi2';
          rowsOut = [['Total N', N], ['Expected counts', E.map(f6).join(', ')]];
          if (E.some((e) => e < 5)) note = 'Some expected counts are below 5, so the χ² approximation may be rough.';
        } else if (t === 'chi_ind') {
          const T = s1.value.split(/\n/).map((l) => parseNums(l).vals).filter((r) => r.length);
          if (T.length < 2 || T.some((r) => r.length !== T[0].length) || T[0].length < 2) throw new Error('Enter a table of at least 2 × 2 counts, one row per line, rows of equal length');
          const R = T.map((r) => r.reduce((a, b) => a + b, 0)), Cs = T[0].map((_, j) => T.reduce((s, r) => s + r[j], 0)), N = R.reduce((a, b) => a + b, 0);
          stat = 0;
          let low = false;
          T.forEach((r, i) => r.forEach((o, j) => { const e = (R[i] * Cs[j]) / N; if (e < 5) low = true; stat += (o - e) ** 2 / e; }));
          df1 = (T.length - 1) * (T[0].length - 1); D = 'chi2';
          rowsOut = [['Table', `${T.length} rows × ${T[0].length} columns`], ['Total N', N], ['Row totals', R.join(', ')], ['Column totals', Cs.join(', ')]];
          if (low) note = 'Some expected counts are below 5, so the χ² approximation may be rough.';
        } else {
          const groups = s1.value.split(/\n/).map((l) => parseNums(l).vals).filter((g) => g.length);
          if (groups.length < 2 || groups.some((g) => g.length < 2)) throw new Error('Enter at least two groups (one per line) with at least two values each');
          const all = groups.flat(), N = all.length, k = groups.length, m = all.reduce((a, b) => a + b, 0) / N;
          const means = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
          const ssb = groups.reduce((s, g, i) => s + g.length * (means[i] - m) ** 2, 0);
          const ssw = groups.reduce((s, g, i) => s + g.reduce((a, x) => a + (x - means[i]) ** 2, 0), 0);
          df1 = k - 1; df2 = N - k;
          stat = ssb / df1 / (ssw / df2); D = 'f';
          rowsOut = [['Groups', k], ['Group means', means.map(f6).join(', ')], ['Grand mean', m], ['Between-groups SS', ssb], ['Within-groups SS', ssw]];
        }
        const Dist = MX.DIST[D], P = D === 'chi2' ? { k: df1 } : { d1: df1, d2: df2 };
        const pval = 1 - Dist.cdf(stat, P);
        const sig = pval < 1 - cl;
        out.replaceChildren(
          el('div', { class: 'st-big mono' }, `${D === 'chi2' ? 'χ²' : 'F'} = ${f6(stat)},  df = ${df1}${df2 != null ? `, ${df2}` : ''},  p = ${f6(pval)}`),
          el('p', { class: 'st-verdict ' + (sig ? 'yes' : 'no') }, sig
            ? `Significant at the ${f6((1 - cl) * 100)}% level: reject the null hypothesis.`
            : `Not significant at the ${f6((1 - cl) * 100)}% level: the data are consistent with the null hypothesis.`),
          kv(rowsOut), note ? el('p', { class: 'hint' }, note) : '');
        requestAnimationFrame(() => {
          const [lo, hi0] = Dist.range(P), hi = Math.max(hi0, stat * 1.2);
          let ymax = 0;
          for (let i = 1; i <= 200; i++) { const y = Dist.pdf(lo + ((hi - lo) * i) / 200, P); if (isFinite(y)) ymax = Math.max(ymax, y); }
          const fr = Charts.frame(cv, { xmin: lo, xmax: hi, ymin: 0, ymax: Math.min(ymax, 5) * 1.15 || 1, ylabel: 'density' });
          const { ctx, X, Y } = fr;
          ctx.fillStyle = 'rgba(255,107,107,0.45)'; ctx.beginPath(); ctx.moveTo(X(stat), Y(0));
          for (let i = 0; i <= 100; i++) { const x = stat + ((hi - stat) * i) / 100; ctx.lineTo(X(x), Y(Math.min(ymax * 1.2, Dist.pdf(x, P)))); }
          ctx.lineTo(X(hi), Y(0)); ctx.fill();
          Charts.curve(fr, (x) => Math.min(ymax * 1.2, Dist.pdf(x, P)), lo, hi, '#4dabf7', 2);
          ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(stat), fr.y0); ctx.lineTo(X(stat), fr.y1); ctx.stroke();
        });
      } catch (e) { out.replaceChildren(el('p', { class: 'err-text' }, e.message)); }
    }
    const exampleBtn = U.el('button', { type: 'button', class: 'small', onclick: () => { const ex = TEST_EXAMPLES[sel.value]; if (ex) { s1.value = ex[0]; s2.value = ex[1]; update(); } } }, 'Example data');
    const fileBtn = DataFile.button('Open file…', async (table) => {
      const t = sel.value;
      const many = t === 'chi_ind' || t === 'anova';
      const cols = await DataFile.pickColumns(table, many ? 'many' : t === 't2' || t === 'tp' ? ['Sample 1', 'Sample 2'] : ['Column'], many ? (t === 'anova' ? 'Columns = groups' : 'Columns of the table') : 'Which column?');
      if (!cols) return;
      const nums = cols.map(DataFile.numbers);
      if (t === 'chi_ind') { const n = Math.min(...nums.map((c) => c.length)); s1.value = Array.from({ length: n }, (_, i) => nums.map((c) => c[i]).join(' ')).join('\n'); }
      else if (t === 'anova') s1.value = nums.map((c) => c.join(' ')).join('\n');
      else { s1.value = nums[0].join(' '); if (nums[1]) s2.value = nums[1].join(' '); }
      update();
    });
    [sel, alt].forEach((x) => x.addEventListener('change', update));
    [s1, s2, mu0, conf, px, pn, p0].forEach((x) => x.addEventListener('input', update));
    const view = el('div', { class: 'st-grid' },
      el('div', { class: 'pane' },
        el('h3', {}, 'Test'), el('label', { class: 'ctl' }, sel),
        el('div', { class: 'btn-row' }, exampleBtn, fileBtn),
        r1, r2, rmu, rprop, rp0,
        el('div', { class: 'grid2' }, ralt, row('Confidence level', conf))),
      el('div', { class: 'pane' }, el('h3', {}, 'Result'), out, cv,
        el('p', { class: 'hint' }, 'The shaded area is the p-value: the chance of a result at least this extreme if the null hypothesis were true.')));
    update();
    return { view, update };
  }

  // ---------------------------------------------------------------- confidence intervals: what “95 %” means
  function ciTab() {
    const inp = (v) => el('input', { type: 'text', class: 'mono', value: v });
    const mu = inp('50'), sigma = inp('10'), nIn = inp('20'), confIn = inp('0.95');
    const row = (l, i) => el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, l), i);
    const cv = el('canvas', { class: 'chart tall' }), out = el('div');
    let iv = [];
    const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
    const params = () => { const p = { mu: MX.evaluate(mu.value), sigma: MX.evaluate(sigma.value), n: Math.round(MX.evaluate(nIn.value)), cl: MX.evaluate(confIn.value) }; if (!(p.sigma > 0 && p.n >= 2 && p.cl > 0 && p.cl < 1)) throw new Error('Need σ > 0, n ≥ 2 and a confidence level between 0 and 1'); return p; };
    function sample(k) {
      const p = params();
      const tcrit = MX.quantile(MX.DIST.t, 1 - (1 - p.cl) / 2, { nu: p.n - 1 });
      for (let j = 0; j < k; j++) {
        const xs = Array.from({ length: p.n }, () => p.mu + p.sigma * gauss());
        const m = xs.reduce((a, b) => a + b, 0) / p.n, s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (p.n - 1));
        const h = (tcrit * s) / Math.sqrt(p.n);
        iv.push({ m, lo: m - h, hi: m + h, hit: m - h <= p.mu && p.mu <= m + h });
      }
      if (iv.length > 20000) iv = iv.slice(-20000);
      update();
    }
    function update() {
      let p;
      try { p = params(); } catch (e) { out.replaceChildren(el('p', { class: 'err-text' }, e.message)); return; }
      const hits = iv.filter((x) => x.hit).length;
      out.replaceChildren(el('div', { class: 'st-big mono' }, iv.length ? `${hits} of ${iv.length} intervals contain μ  (${f6((100 * hits) / iv.length)} %)` : 'Draw some samples'),
        el('p', { class: 'hint' }, `Each line is a ${f6(p.cl * 100)}% t-interval from one random sample of n = ${p.n}. In the long run about ${f6(p.cl * 100)}% of them catch the true mean μ = ${f6(p.mu)} — that is what the confidence level means. Red lines miss it.`));
      requestAnimationFrame(() => {
        const show = iv.slice(-100);
        const w = Math.max(...show.map((x) => Math.max(Math.abs(x.lo - p.mu), Math.abs(x.hi - p.mu))), p.sigma) * 1.1;
        const fr = Charts.frame(cv, { xmin: p.mu - w, xmax: p.mu + w, ymin: 0, ymax: 101, xticks: true });
        const { ctx, X, Y } = fr;
        ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(p.mu), fr.y0); ctx.lineTo(X(p.mu), fr.y1); ctx.stroke();
        show.forEach((x, i) => {
          ctx.strokeStyle = x.hit ? 'rgba(77,171,247,0.85)' : '#ff6b6b'; ctx.lineWidth = x.hit ? 1.5 : 2.2;
          const y = Y(100 - i);
          ctx.beginPath(); ctx.moveTo(X(x.lo), y); ctx.lineTo(X(x.hi), y); ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(X(x.m) - 1.5, y - 1.5, 3, 3);
        });
      });
    }
    [mu, sigma, nIn, confIn].forEach((i) => i.addEventListener('input', () => { iv = []; update(); }));
    const view = el('div', { class: 'st-grid' },
      el('div', { class: 'pane' }, el('h3', {}, 'Population and samples'),
        el('div', { class: 'grid2' }, row('Population mean μ', mu), row('Population std dev σ', sigma)),
        el('div', { class: 'grid2' }, row('Sample size n', nIn), row('Confidence level', confIn)),
        el('div', { class: 'btn-row' },
          U.el('button', { type: 'button', class: 'primary', onclick: () => sample(1) }, '+1 sample'),
          U.el('button', { type: 'button', onclick: () => sample(100) }, '+100 samples'),
          U.el('button', { type: 'button', onclick: () => sample(1000) }, '+1000'),
          U.el('button', { type: 'button', onclick: () => { iv = []; update(); } }, 'Clear'))),
      el('div', { class: 'pane' }, el('h3', {}, 'The last 100 intervals'), out, cv));
    sample(30);
    return { view, update };
  }

  // ---------------------------------------------------------------- page
  let showTab = null;
  function init(root) {
    load();
    const tabs = { one: ['One variable', oneVarTab], two: ['Regression', twoVarTab], dist: ['Distributions', distTab], test: ['Hypothesis tests', testsTab], ci: ['Confidence intervals', ciTab] };
    const built = {};
    const body = el('div');
    const seg = el('div', { class: 'seg page-tabs' });
    function show(k) {
      st.tab = k; save();
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === k));
      if (!built[k]) { built[k] = tabs[k][1](); }
      body.replaceChildren(built[k].view);
      requestAnimationFrame(() => built[k].update());
    }
    for (const [k, [label]] of Object.entries(tabs)) seg.append(el('button', { type: 'button', 'data-v': k, onclick: () => show(k) }, label));
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Statistics'), el('p', {}, 'Describe data, fit models, work out probabilities and run significance tests.')),
      seg, body));
    showTab = (k, after) => { show(k); if (after) after(); };
    show(tabs[st.tab] ? st.tab : 'one');
    let rt = 0;
    new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => built[st.tab] && built[st.tab].update(), 100); }).observe(body);
    Theme.onChange(() => built[st.tab] && built[st.tab].update());
  }

  const testCmd = (k) => () => showTab('test', () => { st.test = k; const s = document.querySelector('#mod-stats .st-grid select'); if (s) { s.value = k; s.dispatchEvent(new Event('change')); } });
  Shell.register('stats', {
    commands: [
      { label: 'Descriptive statistics (mean, median, standard deviation)', keywords: 'mean median mode quartile histogram box plot mittelwert', run: () => showTab('one') },
      { label: 'Regression / curve fitting', keywords: 'regression fit least squares correlation r2', run: () => showTab('two') },
      { label: 'Probability distributions', keywords: 'normal binomial poisson t chi distribution verteilung', run: () => showTab('dist') },
      { label: 'Confidence interval demo', keywords: 'confidence interval coverage konfidenzintervall', run: () => showTab('ci') },
      ...Object.entries(TESTS).map(([k, v]) => ({ label: v, keywords: 'hypothesis test p-value significance', run: testCmd(k) })),
    ],
    label: 'Statistics', key: 6, order: 6, root: () => document.getElementById('mod-stats'), init,
    desc: 'Descriptive statistics, histograms and box plots, regression (linear to logistic), distributions and hypothesis tests.',
    features: ['Mean, median, σ', 'Regression & R²', 'CSV & Excel files', 'χ², ANOVA, t-tests'],
  });
})();

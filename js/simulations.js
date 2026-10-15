// Simulations: cellular automata (Game of Life and relatives, 1D rules), L-systems, reaction–diffusion
// (Gray–Scott) and the Ulam prime spiral.
const Sims = (() => {
  // "B3/S23" → { born: Set, survive: Set }
  function parseRule(s) {
    const m = /^\s*B([0-8]*)\s*\/\s*S([0-8]*)\s*$/i.exec(s);
    if (!m) return null;
    return { born: new Set([...m[1]].map(Number)), survive: new Set([...m[2]].map(Number)) };
  }
  // one Life-like step on a toroidal grid (Uint8Array, w × h)
  function lifeStep(g, w, h, rule) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w, xp = (x + 1) % w;
        const n = g[ym + xm] + g[ym + x] + g[ym + xp] + g[y0 + xm] + g[y0 + xp] + g[yp + xm] + g[yp + x] + g[yp + xp];
        out[y0 + x] = g[y0 + x] ? (rule.survive.has(n) ? 1 : 0) : (rule.born.has(n) ? 1 : 0);
      }
    }
    return out;
  }
  // next row of an elementary (1D) cellular automaton, wrapping at the edges
  function rowStep(row, rule) {
    const n = row.length, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (rule >> ((row[(i - 1 + n) % n] << 2) | (row[i] << 1) | row[(i + 1) % n])) & 1;
    return out;
  }
  // L-system expansion with a length cap
  function expand(axiom, rules, n, cap = 2e6) {
    let s = axiom;
    for (let i = 0; i < n; i++) {
      let t = '';
      for (const ch of s) { t += rules[ch] !== undefined ? rules[ch] : ch; if (t.length > cap) return { s, iterations: i, capped: true }; }
      s = t;
    }
    return { s, iterations: n, capped: false };
  }
  function sieve(n) {
    const p = new Uint8Array(n + 1).fill(1);
    p[0] = 0; if (n >= 1) p[1] = 0;
    for (let i = 2; i * i <= n; i++) if (p[i]) for (let j = i * i; j <= n; j += i) p[j] = 0;
    return p;
  }
  // (x, y) of n on the Ulam spiral (1 at the origin, going right, then counter-clockwise)
  function ulamXY(n) {
    if (n === 1) return [0, 0];
    const k = Math.ceil((Math.sqrt(n) - 1) / 2), t = 2 * k + 1;
    let m = t * t;
    const s = t - 1;
    if (n >= m - s) return [k - (m - n), -k];
    m -= s;
    if (n >= m - s) return [-k, -k + (m - n)];
    m -= s;
    if (n >= m - s) return [-k + (m - n), k];
    return [k, k - (m - s - n)];
  }
  return { parseRule, lifeStep, rowStep, expand, sieve, ulamXY };
})();

(() => {
  const { el } = U;
  let root, body, active = null, running = false, last = 0;
  const st = { tab: 'life', speed: 12 };
  const fmt = (v) => MX.fmt(+(+v).toPrecision(6));

  // ---------------------------------------------------------------- Game of Life (and other life-like rules)
  function lifeTab() {
    const RULES = { 'Conway (B3/S23)': 'B3/S23', 'HighLife (B36/S23)': 'B36/S23', 'Seeds (B2/S)': 'B2/S', 'Day & Night (B3678/S34678)': 'B3678/S34678', 'Life without death (B3/S012345678)': 'B3/S012345678', 'Maze (B3/S12345)': 'B3/S12345' };
    const cell = 7;
    let w = 1, h = 1, grid = new Uint8Array(1), gen = 0, rule = Sims.parseRule('B3/S23');
    const cv = el('canvas', { class: 'sim-canvas' }), info = el('div', { class: 'pl-stats' });
    const fit = () => {
      const nw = Math.max(10, Math.floor(cv.clientWidth / cell)), nh = Math.max(10, Math.floor(cv.clientHeight / cell));
      if (nw === w && nh === h) return;
      const g = new Uint8Array(nw * nh);
      for (let y = 0; y < Math.min(h, nh); y++) for (let x = 0; x < Math.min(w, nw); x++) g[y * nw + x] = grid[y * w + x];
      w = nw; h = nh; grid = g;
    };
    const place = (pattern, ox, oy) => pattern.forEach(([x, y]) => { const X = (ox + x + w) % w, Y = (oy + y + h) % h; grid[Y * w + X] = 1; });
    const PATTERNS = {
      Random: () => { for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.28 ? 1 : 0; },
      'Glider gun': () => { grid.fill(0); place([[24, 0], [22, 1], [24, 1], [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2], [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3], [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4], [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5], [10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8]], 4, 4); },
      'R-pentomino': () => { grid.fill(0); place([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], w >> 1, h >> 1); },
      Gliders: () => { grid.fill(0); for (let i = 0; i < 12; i++) place([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], Math.floor(Math.random() * w), Math.floor(Math.random() * h)); },
      Pulsar: () => { grid.fill(0); const q = [2, 3, 4]; const pts = []; for (const a of q) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { pts.push([sx * a, sy * 1], [sx * a, sy * 6], [sx * 1, sy * a], [sx * 6, sy * a]); } place(pts, w >> 1, h >> 1); },
      Clear: () => grid.fill(0),
    };
    const ruleSel = el('select', {}, Object.keys(RULES).map((k) => el('option', { value: RULES[k] }, k)));
    ruleSel.addEventListener('change', () => { rule = Sims.parseRule(ruleSel.value); });
    const patSel = el('select', {}, el('option', { value: '' }, 'Start pattern…'), Object.keys(PATTERNS).map((k) => el('option', { value: k }, k)));
    patSel.addEventListener('change', () => { if (patSel.value) { fit(); PATTERNS[patSel.value](); gen = 0; draw(); } patSel.value = ''; });
    function draw() {
      fit();
      const { ctx, w: cw, h: ch } = Charts.setup(cv);
      ctx.fillStyle = '#0c0e13'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#51cf66';
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y * w + x]) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
      let pop = 0; for (let i = 0; i < grid.length; i++) pop += grid[i];
      info.replaceChildren(el('div', { class: 'pl-stat' }, el('span', {}, 'generation'), el('b', { class: 'mono' }, String(gen))), el('div', { class: 'pl-stat' }, el('span', {}, 'living cells'), el('b', { class: 'mono' }, String(pop))));
    }
    // paint cells with the mouse
    let paint = null;
    cv.addEventListener('pointerdown', (e) => { fit(); const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell); if (x < w && y < h) { paint = grid[y * w + x] ? 0 : 1; grid[y * w + x] = paint; draw(); cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', (e) => { if (paint == null) return; const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell); if (x >= 0 && y >= 0 && x < w && y < h) { grid[y * w + x] = paint; draw(); } });
    cv.addEventListener('pointerup', () => { paint = null; });
    let started = false;
    return {
      controls: [ruleSel, patSel],
      view: el('div', {}, cv, info, el('p', { class: 'hint' }, 'Each cell lives or dies by counting its 8 neighbours: Conway’s rule B3/S23 means a dead cell with exactly 3 neighbours is born, and a live cell with 2 or 3 survives. Click or drag on the grid to draw cells.')),
      step: () => { grid = Sims.lifeStep(grid, w, h, rule); gen++; },
      draw: () => { if (!started) { started = true; fit(); PATTERNS['Glider gun'](); } draw(); },
      reset: () => { fit(); PATTERNS.Random(); gen = 0; draw(); },
    };
  }

  // ---------------------------------------------------------------- 1D elementary automata
  function ecaTab() {
    const cell = 3;
    let rule = 30, rows = [], width = 1, single = true;
    const cv = el('canvas', { class: 'sim-canvas' });
    const ruleIn = el('input', { type: 'number', min: 0, max: 255, value: rule, class: 'num' });
    ruleIn.addEventListener('change', () => { rule = U.clamp(Math.round(+ruleIn.value || 0), 0, 255); ruleIn.value = rule; restart(); });
    const presets = el('select', {}, el('option', { value: '' }, 'Famous rules…'), [[30, 'Rule 30 — chaos'], [90, 'Rule 90 — Sierpinski'], [110, 'Rule 110 — universal computer'], [184, 'Rule 184 — traffic'], [73, 'Rule 73'], [45, 'Rule 45']].map(([v, l]) => el('option', { value: v }, l)));
    presets.addEventListener('change', () => { if (presets.value) { rule = +presets.value; ruleIn.value = rule; restart(); } presets.value = ''; });
    const startSel = el('select', {}, el('option', { value: 'one' }, 'Start: one cell'), el('option', { value: 'random' }, 'Start: random'));
    startSel.addEventListener('change', () => { single = startSel.value === 'one'; restart(); });
    function restart() {
      width = Math.max(20, Math.floor(cv.clientWidth / cell));
      const r = new Uint8Array(width);
      if (single) r[width >> 1] = 1; else for (let i = 0; i < width; i++) r[i] = Math.random() < 0.5 ? 1 : 0;
      rows = [r];
      draw();
    }
    const maxRows = () => Math.max(10, Math.floor(cv.clientHeight / cell));
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      ctx.fillStyle = '#0c0e13'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffc078';
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x]) ctx.fillRect(x * cell, y * cell, cell, cell); });
      // the rule's lookup table, drawn small in the corner
      const bx = 8, by = h - 30;
      ctx.font = '10px ui-monospace, monospace';
      for (let i = 7; i >= 0; i--) {
        const x = bx + (7 - i) * 34;
        for (let b = 0; b < 3; b++) { ctx.fillStyle = (i >> (2 - b)) & 1 ? '#ffc078' : '#2a2f3c'; ctx.fillRect(x + b * 9, by, 8, 8); }
        ctx.fillStyle = (rule >> i) & 1 ? '#ffc078' : '#2a2f3c'; ctx.fillRect(x + 9, by + 10, 8, 8);
      }
    }
    let started = false;
    return {
      controls: [presets, el('label', { class: 'inline-ctl' }, 'rule ', ruleIn), startSel],
      view: el('div', {}, cv, el('p', { class: 'hint' }, 'A row of cells; each new row follows from the three cells above (left, self, right). The 8 possible patterns, written as an 8-bit number, are the rule — shown in the corner. Rule 30 looks random, Rule 90 draws Sierpinski’s triangle, Rule 110 can compute anything.')),
      step: () => { if (rows.length >= maxRows()) rows.shift(); rows.push(Sims.rowStep(rows[rows.length - 1], rule)); },
      draw: () => { if (!started) { started = true; restart(); } else draw(); },
      reset: restart,
    };
  }

  // ---------------------------------------------------------------- L-systems
  function lsysTab() {
    const PRESETS = {
      'Fractal plant': { axiom: 'X', rules: 'X=F+[[X]-X]-F[-FX]+X\nF=FF', angle: 25, n: 6, start: 70 },
      'Bushy tree': { axiom: 'F', rules: 'F=FF-[-F+F+F]+[+F-F-F]', angle: 22.5, n: 4, start: 90 },
      'Koch snowflake': { axiom: 'F--F--F', rules: 'F=F+F--F+F', angle: 60, n: 4, start: 0 },
      'Sierpinski arrowhead': { axiom: 'A', rules: 'A=B-A-B\nB=A+B+A', angle: 60, n: 7, start: 0 },
      'Dragon curve': { axiom: 'FX', rules: 'X=X+YF+\nY=-FX-Y', angle: 90, n: 12, start: 0 },
      'Hilbert curve': { axiom: 'A', rules: 'A=+BF-AFA-FB+\nB=-AF+BFB+FA-', angle: 90, n: 6, start: 0 },
      'Lévy C curve': { axiom: 'F', rules: 'F=+F--F+', angle: 45, n: 12, start: 0 },
      'Penrose-like star': { axiom: 'F++F++F++F++F', rules: 'F=F++F++F|F-F++F', angle: 36, n: 3, start: 0 },
    };
    const cur = Object.assign({}, PRESETS['Fractal plant']);
    const cv = el('canvas', { class: 'sim-canvas' }), info = el('div', { class: 'hint' });
    const pre = el('select', {}, Object.keys(PRESETS).map((k) => el('option', { value: k }, k)));
    const axiom = el('input', { type: 'text', class: 'mono', value: cur.axiom });
    const rules = el('textarea', { class: 'mono sim-rules', rows: 3 }, cur.rules);
    const angle = el('input', { type: 'number', class: 'num', value: cur.angle, step: 'any' });
    const iters = el('input', { type: 'number', class: 'num', value: cur.n, min: 0, max: 15 });
    const sync = () => { axiom.value = cur.axiom; rules.value = cur.rules; angle.value = cur.angle; iters.value = cur.n; };
    pre.addEventListener('change', () => { Object.assign(cur, PRESETS[pre.value]); sync(); draw(); });
    [axiom, rules, angle, iters].forEach((i) => i.addEventListener('input', () => { cur.axiom = axiom.value; cur.rules = rules.value; cur.angle = +angle.value || 0; cur.n = U.clamp(Math.round(+iters.value || 0), 0, 15); draw(); }));
    let progress = 1;
    function draw() {
      const ruleMap = {};
      for (const line of cur.rules.split(/\n/)) { const m = /^\s*(\S)\s*=\s*(.*)$/.exec(line); if (m) ruleMap[m[1]] = m[2].replace(/\s/g, ''); }
      const { s, iterations, capped } = Sims.expand(cur.axiom.replace(/\s/g, ''), ruleMap, cur.n);
      // walk the turtle: F, G, A, B draw; f moves; + − turn; [ ] push/pop; | turns around
      const a = (cur.angle * Math.PI) / 180;
      let x = 0, y = 0, dir = ((cur.start || 0) * Math.PI) / 180;
      const stack = [], segs = [];
      let minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (const ch of s) {
        if (ch === 'F' || ch === 'G' || ch === 'A' || ch === 'B') { const nx = x + Math.cos(dir), ny = y + Math.sin(dir); segs.push(x, y, nx, ny, stack.length); x = nx; y = ny; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        else if (ch === 'f') { x += Math.cos(dir); y += Math.sin(dir); }
        else if (ch === '+') dir += a; else if (ch === '-') dir -= a; else if (ch === '|') dir += Math.PI;
        else if (ch === '[') stack.push([x, y, dir]); else if (ch === ']' && stack.length) [x, y, dir] = stack.pop();
      }
      const { ctx, w, h } = Charts.setup(cv);
      ctx.fillStyle = '#0c0e13'; ctx.fillRect(0, 0, w, h);
      const sc = Math.min((w - 30) / ((maxX - minX) || 1), (h - 30) / ((maxY - minY) || 1));
      const ox = (w - (maxX + minX) * sc) / 2, oy = (h + (maxY + minY) * sc) / 2;
      const n = segs.length / 5, upto = Math.floor(n * progress);
      ctx.lineWidth = Math.max(0.6, Math.min(2, sc * 0.25));
      ctx.lineCap = 'round';
      // colour along the path (or by branch depth for plants)
      const plant = cur.rules.includes('[');
      const batch = 64;
      for (let i0 = 0; i0 < upto; i0 += batch) {
        const t = i0 / Math.max(1, n), depth = segs[i0 * 5 + 4];
        ctx.strokeStyle = plant ? `hsl(${100 + Math.min(depth, 8) * 6}, ${45 + depth * 5}%, ${32 + depth * 6}%)` : `hsl(${200 + t * 140}, 80%, 62%)`;
        ctx.beginPath();
        for (let i = i0; i < Math.min(upto, i0 + batch); i++) { ctx.moveTo(ox + segs[i * 5] * sc, oy - segs[i * 5 + 1] * sc); ctx.lineTo(ox + segs[i * 5 + 2] * sc, oy - segs[i * 5 + 3] * sc); }
        ctx.stroke();
      }
      info.textContent = `${iterations} iteration${iterations === 1 ? '' : 's'} · ${MX.fmt(s.length)} symbols · ${MX.fmt(n)} line segments${capped ? ' · stopped early (string too long)' : ''}`;
    }
    return {
      controls: [pre],
      view: el('div', { class: 'sim-split' }, el('div', { class: 'sim-side' },
        el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Axiom (start)'), axiom),
        el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Rules (one per line, e.g. F=F+F--F+F)'), rules),
        el('div', { class: 'grid2' }, el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Angle °'), angle), el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Iterations'), iters)),
        el('p', { class: 'hint' }, 'F (or G, A, B) = draw forward · f = move · + / − = turn · [ ] = save / restore position (branches) · | = turn around. Run animates the drawing.'), info),
      cv),
      step: () => { progress = Math.min(1, progress + 0.01); },
      draw: () => draw(),
      reset: () => { progress = 0; draw(); },
      onRun: () => { if (progress >= 1) progress = 0; },
    };
  }

  // ---------------------------------------------------------------- reaction–diffusion (Gray–Scott)
  function rdTab() {
    const PRESETS = { Coral: [0.0545, 0.062], Mitosis: [0.0367, 0.0649], Spots: [0.03, 0.062], Maze: [0.029, 0.057], Fingerprint: [0.037, 0.06], Waves: [0.014, 0.054], Worms: [0.078, 0.061] };
    const N = 200;
    let A = new Float32Array(N * N), B = new Float32Array(N * N), A2 = new Float32Array(N * N), B2 = new Float32Array(N * N);
    let [F, K] = PRESETS.Coral;
    const cv = el('canvas', { class: 'sim-canvas sim-rd' }), off = document.createElement('canvas');
    off.width = N; off.height = N;
    const octx = off.getContext('2d'), img = octx.createImageData(N, N);
    const pre = el('select', {}, Object.keys(PRESETS).map((k) => el('option', { value: k }, k)));
    pre.addEventListener('change', () => { [F, K] = PRESETS[pre.value]; seed(); });
    function seed() {
      A.fill(1); B.fill(0);
      for (let s = 0; s < 14; s++) {
        const cx = Math.floor(Math.random() * N), cy = Math.floor(Math.random() * N), r = 3 + Math.floor(Math.random() * 4);
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const i = ((cy + y + N) % N) * N + ((cx + x + N) % N); B[i] = 1; }
      }
      draw();
    }
    function step() {
      // Karl Sims' formulation: D_A = 1, D_B = 0.5, 3×3 Laplacian, dt = 1
      for (let y = 0; y < N; y++) {
        const ym = ((y - 1 + N) % N) * N, y0 = y * N, yp = ((y + 1) % N) * N;
        for (let x = 0; x < N; x++) {
          const xm = (x - 1 + N) % N, xp = (x + 1) % N, i = y0 + x;
          const a = A[i], b = B[i];
          const la = -a + 0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
          const lb = -b + 0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
          const abb = a * b * b;
          A2[i] = a + (la - abb + F * (1 - a));
          B2[i] = b + (0.5 * lb + abb - (K + F) * b);
        }
      }
      [A, A2] = [A2, A]; [B, B2] = [B2, B];
    }
    function draw() {
      const d = img.data;
      // dark → deep blue → cyan → white, by the amount of chemical B
      const stops = [[12, 14, 19], [27, 58, 92], [34, 184, 207], [233, 251, 255]];
      for (let i = 0; i < N * N; i++) {
        const t = U.clamp(B[i] * 3, 0, 0.999) * (stops.length - 1), k = Math.floor(t), f = t - k;
        for (let c = 0; c < 3; c++) d[i * 4 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
        d[i * 4 + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      const { ctx, w, h } = Charts.setup(cv);
      ctx.imageSmoothingEnabled = true;
      const s = Math.min(w, h);
      ctx.drawImage(off, (w - s) / 2, (h - s) / 2, s, s);
    }
    // paint chemical B with the mouse
    const paint = (e) => {
      const r = cv.getBoundingClientRect(), s = Math.min(r.width, r.height);
      const x = Math.floor(((e.clientX - r.left - (r.width - s) / 2) / s) * N), y = Math.floor(((e.clientY - r.top - (r.height - s) / 2) / s) * N);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) { const i = ((y + dy + N) % N) * N + ((x + dx + N) % N); B[i] = 1; }
      draw();
    };
    let down = false;
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); paint(e); });
    cv.addEventListener('pointermove', (e) => { if (down) paint(e); });
    cv.addEventListener('pointerup', () => { down = false; });
    let started = false;
    return {
      controls: [pre],
      view: el('div', {}, cv, el('p', { class: 'hint' }, 'Two virtual chemicals spread out and react (U + 2V → 3V). Depending on the feed and kill rates the same equations grow coral, dividing cells, mazes or fingerprints — Alan Turing’s idea for how animal patterns form. Paint with the mouse to add chemical.')),
      step: () => { for (let i = 0; i < 6; i++) step(); },
      draw: () => { if (!started) { started = true; seed(); } else draw(); },
      reset: seed, stepsPerFrame: true,
    };
  }

  // ---------------------------------------------------------------- Ulam spiral
  function ulamTab() {
    let size = 201, mode = 'primes';
    const cv = el('canvas', { class: 'sim-canvas' }), info = el('div', { class: 'pl-stats' });
    const sizeSel = el('select', {}, [[101, '101 × 101'], [201, '201 × 201'], [301, '301 × 301'], [501, '501 × 501']].map(([v, l]) => el('option', { value: v }, l)));
    sizeSel.value = size;
    sizeSel.addEventListener('change', () => { size = +sizeSel.value; draw(); });
    const modeSel = el('select', {}, [['primes', 'Primes'], ['twin', 'Twin primes'], ['euler', 'Euler’s n² + n + 41'], ['divisors', 'Number of divisors']].map(([v, l]) => el('option', { value: v }, l)));
    modeSel.addEventListener('change', () => { mode = modeSel.value; draw(); });
    let layout = null;
    function draw() {
      const N = size * size, pr = Sims.sieve(N + 2);
      const { ctx, w, h } = Charts.setup(cv);
      ctx.fillStyle = '#0c0e13'; ctx.fillRect(0, 0, w, h);
      const c = Math.min(w, h) / size, ox = (w - c * size) / 2 + (size >> 1) * c, oy = (h - c * size) / 2 + (size >> 1) * c;
      layout = { c, ox, oy };
      const euler = new Set();
      if (mode === 'euler') for (let n = 0; n * n + n + 41 <= N; n++) euler.add(n * n + n + 41);
      let divs = null;
      if (mode === 'divisors') { divs = new Uint16Array(N + 1); for (let i = 1; i <= N; i++) for (let j = i; j <= N; j += i) divs[j]++; }
      let count = 0;
      for (let n = 1; n <= N; n++) {
        const [x, y] = Sims.ulamXY(n);
        let col = null;
        if (mode === 'divisors') { const d = Math.min(divs[n], 48); col = `hsl(${220 - d * 4}, 70%, ${12 + d * 1.6}%)`; }
        else if (pr[n]) {
          if (mode === 'primes') col = '#e8eaf0';
          else if (mode === 'twin') col = pr[n + 2] || (n > 2 && pr[n - 2]) ? '#ffc078' : '#3d4353';
          else col = euler.has(n) ? '#ff6b6b' : '#3d4353';
          count++;
        }
        if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * c, oy - y * c, Math.max(1, c), Math.max(1, c)); }
      }
      info.replaceChildren(el('div', { class: 'pl-stat' }, el('span', {}, 'numbers'), el('b', { class: 'mono' }, `1 … ${N}`)), mode === 'divisors' ? null : el('div', { class: 'pl-stat' }, el('span', {}, 'primes'), el('b', { class: 'mono' }, String(count))), el('div', { class: 'pl-stat hover-n' }, el('span', {}, 'under the mouse'), el('b', { class: 'mono' }, '—')));
    }
    cv.addEventListener('pointermove', (e) => {
      if (!layout) return;
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left - layout.ox) / layout.c), y = -Math.floor((e.clientY - r.top - layout.oy) / layout.c);
      // inverse of the spiral: search the ring that contains (x, y)
      const k = Math.max(Math.abs(x), Math.abs(y));
      let n = null;
      for (let m = Math.max(1, (2 * k - 1) ** 2); m <= (2 * k + 1) ** 2; m++) { const [px, py] = Sims.ulamXY(m); if (px === x && py === y) { n = m; break; } }
      const box = info.querySelector('.hover-n b');
      if (box && n) box.textContent = `${n}${MX.S.isPrime(n) ? ' (prime)' : ''}`;
    });
    return {
      controls: [sizeSel, modeSel],
      view: el('div', {}, cv, info, el('p', { class: 'hint' }, 'Write 1, 2, 3, … in a square spiral and mark the primes: they cluster on diagonal lines, which correspond to quadratic polynomials such as Euler’s n² + n + 41 (prime for n = 0 … 39). Stanisław Ulam noticed this while doodling in 1963.')),
      step: () => {}, draw, reset: draw, still: true,
    };
  }

  // ---------------------------------------------------------------- page
  const TABS = { life: ['Game of Life', lifeTab], eca: ['1D automata', ecaTab], lsys: ['L-systems', lsysTab], rd: ['Reaction–diffusion', rdTab], ulam: ['Ulam spiral', ulamTab] };
  const built = {};
  let playBtn, ctlBox, speedEl;
  function show(k) {
    st.tab = k;
    root.querySelectorAll('.page-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === k));
    if (!built[k]) built[k] = TABS[k][1]();
    active = built[k];
    ctlBox.replaceChildren(...active.controls);
    body.replaceChildren(active.view);
    playBtn.hidden = !!active.still;
    speedEl.hidden = !!active.still || !!active.stepsPerFrame;
    if (running && active.still) setRunning(false);
    requestAnimationFrame(() => active.draw());
  }
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
    last = ts;
    if (Shell.isActive('simulations') && active && !active.still) {
      if (active.stepsPerFrame) active.step();
      else {
        active.acc = (active.acc || 0) + st.speed * dt;
        let k = Math.floor(active.acc);
        active.acc -= k;
        k = Math.min(k, 50);
        while (k-- > 0) active.step();
      }
      active.draw();
    }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    running = on;
    playBtn.textContent = on ? '⏸ Pause' : '▶ Run';
    playBtn.classList.toggle('primary', !on);
    if (on) { if (active && active.onRun) active.onRun(); last = 0; requestAnimationFrame(loop); }
  }
  function init(r) {
    root = r;
    body = el('div');
    ctlBox = el('div', { class: 'btn-row pl-ctl' });
    playBtn = U.el('button', { type: 'button', class: 'primary', onclick: () => setRunning(!running) }, '▶ Run');
    speedEl = el('div', { class: 'pl-speed' }, C.slider({ label: 'Steps per second', min: 1, max: 120, log: true, get: () => st.speed, set: (v) => { st.speed = v; } }).el);
    const tabs = el('div', { class: 'seg page-tabs' }, Object.entries(TABS).map(([k, [label]]) => el('button', { type: 'button', 'data-v': k, onclick: () => show(k) }, label)));
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Simulations'), el('p', {}, 'Simple rules, complex results: cellular automata, growing plants, chemical patterns and prime spirals.')),
      tabs,
      el('div', { class: 'pane' },
        el('div', { class: 'pl-top' }, playBtn,
          U.el('button', { type: 'button', onclick: () => { if (active && !active.still) { active.step(); active.draw(); } } }, 'Step'),
          U.el('button', { type: 'button', onclick: () => active && active.reset() }, 'Reset'), ctlBox, speedEl),
        body)));
    show(st.tab);
    new ResizeObserver(() => active && active.draw()).observe(body);
  }

  Shell.register('simulations', {
    label: 'Simulations', order: 11, root: () => document.getElementById('mod-simulations'), init,
    onHide: () => { if (running) setRunning(false); },
    desc: 'Game of Life and other cellular automata, L-system plants, reaction–diffusion patterns and the Ulam prime spiral.',
    features: ['Game of Life', 'L-systems', 'Turing patterns', 'Prime spiral'],
  });
  window.Sims = Sims;
})();

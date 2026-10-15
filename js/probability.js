// Probability lab: live experiments next to the theory — dice sums, coin flips, a Galton board and
// Monte Carlo estimation of π.
const ProbLab = (() => {
  // Exact distribution of the sum of n dice with s sides: probabilities for sums n … n·s (by convolution).
  function diceSum(n, s) {
    let dist = [1];
    for (let k = 0; k < n; k++) {
      const next = new Array(dist.length + s - 1).fill(0);
      dist.forEach((p, i) => { for (let f = 0; f < s; f++) next[i + f] += p / s; });
      dist = next;
    }
    return dist; // index i ↔ sum n + i
  }
  return { diceSum };
})();

(() => {
  const { el } = U;
  const st = { tab: 'dice', speed: 30, dice: { n: 2, s: 6 }, galton: { rows: 12 } };
  let root, body, running = false, last = 0, active = null;

  // ---------------------------------------------------------------- shared bits
  const fmt = (v, d = 4) => MX.fmt(+(+v).toPrecision(d));
  const stat = (label, value) => el('div', { class: 'pl-stat' }, el('span', {}, label), el('b', { class: 'mono' }, value));

  // ---------------------------------------------------------------- dice
  function diceExp() {
    let counts, rolls, lastRoll, sumTotal;
    const cv = el('canvas', { class: 'chart tall' }), facesEl = el('div', { class: 'pl-faces' }), statsEl = el('div', { class: 'pl-stats' });
    const reset = () => { const k = st.dice.n * (st.dice.s - 1) + 1; counts = new Array(k).fill(0); rolls = 0; lastRoll = []; sumTotal = 0; draw(); };
    const roll = (times) => {
      for (let t = 0; t < times; t++) {
        lastRoll = Array.from({ length: st.dice.n }, () => 1 + Math.floor(Math.random() * st.dice.s));
        const s = lastRoll.reduce((a, b) => a + b, 0);
        counts[s - st.dice.n]++; rolls++; sumTotal += s;
      }
    };
    function draw() {
      const { n, s } = st.dice, theo = ProbLab.diceSum(n, s);
      const ymax = Math.max(...theo, ...counts.map((c) => (rolls ? c / rolls : 0))) * 1.15;
      const fr = Charts.frame(cv, { xmin: n - 0.6, xmax: n * s + 0.6, ymin: 0, ymax, discreteX: true, xlabel: 'sum of the dice', ylabel: 'relative frequency' });
      const bw = Math.max(2, (fr.X(1) - fr.X(0)) * 0.7);
      counts.forEach((c, i) => {
        const f = rolls ? c / rolls : 0;
        fr.ctx.fillStyle = 'rgba(77,171,247,0.65)';
        fr.ctx.fillRect(fr.X(n + i) - bw / 2, fr.Y(f), bw, fr.Y(0) - fr.Y(f));
      });
      fr.ctx.strokeStyle = '#ff922b'; fr.ctx.fillStyle = '#ff922b'; fr.ctx.lineWidth = 2;
      fr.ctx.beginPath();
      theo.forEach((p, i) => (i ? fr.ctx.lineTo(fr.X(n + i), fr.Y(p)) : fr.ctx.moveTo(fr.X(n + i), fr.Y(p))));
      fr.ctx.stroke();
      theo.forEach((p, i) => { fr.ctx.beginPath(); fr.ctx.arc(fr.X(n + i), fr.Y(p), 3, 0, Math.PI * 2); fr.ctx.fill(); });
      facesEl.replaceChildren(...lastRoll.slice(0, 8).map((v) => el('span', { class: 'pl-die' }, String(v))));
      const mean = (n * (s + 1)) / 2, sd = Math.sqrt((n * (s * s - 1)) / 12);
      statsEl.replaceChildren(stat('rolls', String(rolls)), stat('average sum', rolls ? fmt(sumTotal / rolls) : '—'), stat('expected', fmt(mean)), stat('std dev (theory)', fmt(sd)),
        stat('most likely sum', String(n + theo.indexOf(Math.max(...theo)))));
    }
    const nSel = el('select', {}, [1, 2, 3, 4, 5, 6, 8, 10].map((v) => el('option', { value: v }, v + (v === 1 ? ' die' : ' dice'))));
    const sSel = el('select', {}, [4, 6, 8, 10, 12, 20].map((v) => el('option', { value: v }, 'd' + v)));
    nSel.value = st.dice.n; sSel.value = st.dice.s;
    nSel.addEventListener('change', () => { st.dice.n = +nSel.value; reset(); });
    sSel.addEventListener('change', () => { st.dice.s = +sSel.value; reset(); });
    reset();
    return {
      controls: [nSel, sSel, U.el('button', { type: 'button', class: 'small', onclick: () => { roll(1000); draw(); } }, '+1000 rolls')],
      view: el('div', {}, facesEl, cv, statsEl, el('p', { class: 'hint' }, 'Blue bars: what happened. Orange: the exact probabilities. The more you roll, the closer they get (law of large numbers) — and with more dice the shape turns into a bell curve (central limit theorem).')),
      step: (k) => roll(k), draw, reset,
    };
  }

  // ---------------------------------------------------------------- coins
  function coinExp() {
    let flips, heads, history, recent, run, best;
    const cv = el('canvas', { class: 'chart tall' }), recentEl = el('div', { class: 'pl-coins' }), statsEl = el('div', { class: 'pl-stats' });
    const reset = () => { flips = 0; heads = 0; history = []; recent = []; run = { side: null, len: 0 }; best = { H: 0, T: 0 }; draw(); };
    const flip = (k) => {
      for (let i = 0; i < k; i++) {
        const h = Math.random() < 0.5;
        flips++; if (h) heads++;
        const side = h ? 'H' : 'T';
        run = run.side === side ? { side, len: run.len + 1 } : { side, len: 1 };
        best[side] = Math.max(best[side], run.len);
        recent.push(side); if (recent.length > 60) recent.shift();
        // keep at most ~2000 points of the running proportion (thin out as it grows)
        if (flips <= 200 || flips % Math.ceil(flips / 1000) === 0) history.push([flips, heads / flips]);
      }
    };
    function draw() {
      const N = Math.max(10, flips);
      const fr = Charts.frame(cv, { xmin: 0, xmax: N, ymin: 0, ymax: 1, xlabel: 'number of flips', ylabel: 'share of heads' });
      const { ctx, X, Y } = fr;
      // ±2 standard errors around 0.5: where the share should usually be
      ctx.fillStyle = 'rgba(255,146,43,0.15)';
      ctx.beginPath();
      for (let i = 1; i <= 200; i++) { const n = (N * i) / 200; ctx.lineTo(X(n), Y(Math.min(1, 0.5 + 1 / Math.sqrt(n)))); }
      for (let i = 200; i >= 1; i--) { const n = (N * i) / 200; ctx.lineTo(X(n), Y(Math.max(0, 0.5 - 1 / Math.sqrt(n)))); }
      ctx.fill();
      ctx.strokeStyle = '#ff922b'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(fr.x0, Y(0.5)); ctx.lineTo(fr.x1, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 2; ctx.beginPath();
      history.forEach(([n, p], i) => (i ? ctx.lineTo(X(n), Y(p)) : ctx.moveTo(X(n), Y(p))));
      ctx.stroke();
      recentEl.replaceChildren(...recent.map((s) => el('span', { class: 'pl-coin ' + s }, s)));
      statsEl.replaceChildren(stat('flips', String(flips)), stat('heads', `${heads} (${flips ? fmt((100 * heads) / flips, 3) : '—'} %)`), stat('tails', String(flips - heads)),
        stat('longest run of heads', String(best.H)), stat('longest run of tails', String(best.T)), stat('expected longest run', flips ? fmt(Math.log2(flips), 3) : '—'));
    }
    reset();
    return {
      controls: [U.el('button', { type: 'button', class: 'small', onclick: () => { flip(1000); draw(); } }, '+1000 flips')],
      view: el('div', {}, recentEl, cv, statsEl, el('p', { class: 'hint' }, 'The share of heads wanders at first, then settles near 50 %. The shaded band is where it should stay about 95 % of the time. Long runs are more common than most people expect — about log₂(flips).')),
      step: (k) => flip(k), draw, reset,
    };
  }

  // ---------------------------------------------------------------- Galton board
  function galtonExp() {
    let bins, balls, total;
    const cv = el('canvas', { class: 'chart pl-galton' }), statsEl = el('div', { class: 'pl-stats' });
    const reset = () => { bins = new Array(st.galton.rows + 1).fill(0); balls = []; total = 0; draw(); };
    // each ball: a precomputed path of left/right bounces, animated row by row
    const spawn = (k) => {
      for (let i = 0; i < k; i++) {
        const path = Array.from({ length: st.galton.rows }, () => (Math.random() < 0.5 ? 0 : 1));
        if (balls.length > 250) { // too many in flight: drop straight into the bins
          bins[path.reduce((a, b) => a + b, 0)]++; total++;
        } else balls.push({ path, t: 0 });
      }
    };
    function advance(dt) {
      const speed = 6; // rows per second
      for (const b of balls) b.t += dt * speed;
      const landed = balls.filter((b) => b.t >= st.galton.rows);
      for (const b of landed) { bins[b.path.reduce((a, c) => a + c, 0)]++; total++; }
      balls = balls.filter((b) => b.t < st.galton.rows);
    }
    function draw() {
      const { ctx, w, h } = Charts.setup(cv);
      const R = st.galton.rows, top = 18, boardH = h * 0.5, binTop = top + boardH + 10, binH = h - binTop - 22;
      const dx = Math.min(36, (w - 40) / (R + 1)), cx = w / 2, dy = boardH / R;
      const pegX = (r, k) => cx + (k - r / 2) * dx;
      ctx.fillStyle = '#5c6275';
      for (let r = 0; r < R; r++) for (let k = 0; k <= r; k++) { ctx.beginPath(); ctx.arc(pegX(r, k), top + r * dy, 2.6, 0, Math.PI * 2); ctx.fill(); }
      // balls in flight
      ctx.fillStyle = '#ffc078';
      for (const b of balls) {
        const r = Math.floor(b.t), f = b.t - r;
        let k = 0; for (let i = 0; i < r; i++) k += b.path[i];
        const x0 = pegX(r, k), x1 = pegX(r + 1, k + b.path[r]);
        const x = x0 + (x1 - x0) * f, y = top + (r + f) * dy - Math.sin(f * Math.PI) * dy * 0.35;
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      // bins with the expected binomial counts
      const maxP = Math.max(...Array.from({ length: R + 1 }, (_, k) => MX.S.nCr(R, k) / 2 ** R));
      const scale = Math.max(...bins, maxP * Math.max(1, total)) || 1;
      for (let k = 0; k <= R; k++) {
        const x = pegX(R, k), hh = (bins[k] / scale) * binH;
        ctx.fillStyle = 'rgba(77,171,247,0.7)';
        ctx.fillRect(x - dx * 0.42, binTop + binH - hh, dx * 0.84, hh);
        ctx.strokeStyle = '#2a2f3c'; ctx.strokeRect(x - dx / 2, binTop, dx, binH);
      }
      if (total) {
        ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.beginPath();
        for (let k = 0; k <= R; k++) { const e = (MX.S.nCr(R, k) / 2 ** R) * total; const y = binTop + binH - (e / scale) * binH; k ? ctx.lineTo(pegX(R, k), y) : ctx.moveTo(pegX(R, k), y); }
        ctx.stroke();
      }
      ctx.fillStyle = '#8a90a0'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
      for (let k = 0; k <= R; k++) ctx.fillText(String(k), pegX(R, k), binTop + binH + 14);
      const mean = total ? bins.reduce((s, c, k) => s + c * k, 0) / total : NaN;
      statsEl.replaceChildren(stat('balls landed', String(total)), stat('in flight', String(balls.length)), stat('average bin', total ? fmt(mean) : '—'), stat('expected', fmt(R / 2)), stat('std dev (theory)', fmt(Math.sqrt(R) / 2)));
    }
    const rows = el('select', {}, [4, 6, 8, 10, 12, 14, 16, 20].map((v) => el('option', { value: v }, v + ' rows')));
    rows.value = st.galton.rows;
    rows.addEventListener('change', () => { st.galton.rows = +rows.value; reset(); });
    reset();
    return {
      controls: [rows, U.el('button', { type: 'button', class: 'small', onclick: () => { for (let i = 0; i < 1000; i++) { const p = Array.from({ length: st.galton.rows }, () => (Math.random() < 0.5 ? 0 : 1)); bins[p.reduce((a, b) => a + b, 0)]++; total++; } draw(); } }, '+1000 balls')],
      view: el('div', {}, cv, statsEl, el('p', { class: 'hint' }, 'Every peg sends a ball left or right with equal chance. The number of “rights” is binomially distributed — orange is the expected count n·C(rows, k)/2^rows — and for many rows it looks like a normal distribution.')),
      step: (k) => spawn(k), tick: advance, draw, reset, animated: true,
    };
  }

  // ---------------------------------------------------------------- Monte Carlo π
  function piExp() {
    let n, inside, pts, history;
    const sq = el('canvas', { class: 'pl-square' }), cv = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' });
    const reset = () => { n = 0; inside = 0; pts = []; history = []; draw(); };
    const throwPts = (k) => {
      for (let i = 0; i < k; i++) {
        const x = Math.random(), y = Math.random(), hit = x * x + y * y <= 1;
        n++; if (hit) inside++;
        if (pts.length < 20000) pts.push([x, y, hit]);
        if (n <= 300 || n % Math.ceil(n / 1000) === 0) history.push([n, (4 * inside) / n]);
      }
    };
    function draw() {
      const { ctx, w, h } = Charts.setup(sq);
      const s = Math.max(10, Math.min(w, h) - 20), ox = (w - s) / 2, oy = (h - s) / 2; // (tiny before the canvas is on screen)
      ctx.strokeStyle = '#3d4353'; ctx.strokeRect(ox + 0.5, oy + 0.5, s, s);
      ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy + s, s, -Math.PI / 2, 0); ctx.stroke();
      for (const [x, y, hit] of pts) { ctx.fillStyle = hit ? 'rgba(77,171,247,0.8)' : 'rgba(255,107,107,0.8)'; ctx.fillRect(ox + x * s - 1, oy + s - y * s - 1, 2, 2); }
      const est = n ? (4 * inside) / n : NaN;
      const lo = Math.min(2.6, ...history.map((p) => p[1])), hi = Math.max(3.7, ...history.map((p) => p[1]));
      const fr = Charts.frame(cv, { xmin: 0, xmax: Math.max(10, n), ymin: lo, ymax: hi, xlabel: 'points', ylabel: 'estimate of π' });
      fr.ctx.strokeStyle = '#ff922b'; fr.ctx.setLineDash([6, 4]); fr.ctx.beginPath(); fr.ctx.moveTo(fr.x0, fr.Y(Math.PI)); fr.ctx.lineTo(fr.x1, fr.Y(Math.PI)); fr.ctx.stroke(); fr.ctx.setLineDash([]);
      fr.ctx.strokeStyle = '#4dabf7'; fr.ctx.lineWidth = 2; fr.ctx.beginPath();
      history.forEach(([k, v], i) => (i ? fr.ctx.lineTo(fr.X(k), fr.Y(v)) : fr.ctx.moveTo(fr.X(k), fr.Y(v))));
      fr.ctx.stroke();
      statsEl.replaceChildren(stat('points', String(n)), stat('inside the quarter circle', String(inside)), stat('estimate 4 · inside / all', n ? fmt(est, 7) : '—'), stat('π', fmt(Math.PI, 7)), stat('error', n ? fmt(Math.abs(est - Math.PI), 3) : '—'));
    }
    reset();
    return {
      controls: [U.el('button', { type: 'button', class: 'small', onclick: () => { throwPts(10000); draw(); } }, '+10 000 points')],
      view: el('div', { class: 'pl-pi' }, el('div', {}, sq), el('div', {}, cv, statsEl, el('p', { class: 'hint' }, 'Random points in a unit square land inside the quarter circle with probability π/4, so 4 × (share inside) estimates π. The error shrinks only like 1/√n — 100× more points for each extra digit.'))),
      step: (k) => throwPts(k), draw, reset,
    };
  }

  // ---------------------------------------------------------------- page
  const EXPS = { dice: ['Dice', diceExp], coins: ['Coin flips', coinExp], galton: ['Galton board', galtonExp], pi: ['Monte Carlo π', piExp] };
  const built = {};
  let playBtn, speedCtl, ctlBox;
  function show(k) {
    st.tab = k;
    root.querySelectorAll('.page-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === k));
    if (!built[k]) built[k] = EXPS[k][1]();
    active = built[k];
    ctlBox.replaceChildren(...active.controls);
    body.replaceChildren(active.view);
    requestAnimationFrame(() => active.draw());
  }
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
    last = ts;
    if (Shell.isActive('probability') && active) {
      // speed = events per second
      active.acc = (active.acc || 0) + st.speed * dt;
      const k = Math.floor(active.acc);
      active.acc -= k;
      if (k) active.step(k);
      if (active.tick) active.tick(dt);
      active.draw();
    }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    running = on;
    playBtn.textContent = on ? '⏸ Pause' : '▶ Run';
    playBtn.classList.toggle('primary', !on);
    if (on) { last = 0; requestAnimationFrame(loop); }
  }
  function init(r) {
    root = r;
    body = el('div');
    ctlBox = el('div', { class: 'btn-row pl-ctl' });
    playBtn = U.el('button', { type: 'button', class: 'primary', onclick: () => setRunning(!running) }, '▶ Run');
    speedCtl = C.slider({ label: 'Speed (per second)', min: 1, max: 5000, log: true, step: 1, get: () => st.speed, set: (v) => { st.speed = v; } });
    const tabs = el('div', { class: 'seg page-tabs' }, Object.entries(EXPS).map(([k, [label]]) => el('button', { type: 'button', 'data-v': k, onclick: () => show(k) }, label)));
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Probability lab'), el('p', {}, 'Run random experiments and watch them approach the theory.')),
      tabs,
      el('div', { class: 'pane' },
        el('div', { class: 'pl-top' }, playBtn, U.el('button', { type: 'button', onclick: () => { active.reset(); } }, 'Reset'), ctlBox, el('div', { class: 'pl-speed' }, speedCtl.el)),
        body)));
    show(st.tab);
    new ResizeObserver(() => active && active.draw()).observe(body);
  }

  Shell.register('probability', {
    label: 'Probability lab', short: 'Probability', key: 7, order: 7, root: () => document.getElementById('mod-probability'), init,
    onHide: () => { if (running) setRunning(false); },
    desc: 'Simulate dice, coin flips, a Galton board and Monte Carlo π — and watch the results approach the theoretical distribution.',
    features: ['Dice sums', 'Law of large numbers', 'Galton board', 'Monte Carlo π'],
  });
})();

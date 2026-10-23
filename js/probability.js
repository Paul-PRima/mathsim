// Probability lab: live experiments next to the theory — dice sums, coin flips, a Galton board,
// Monte Carlo π, the Monty Hall problem, the birthday paradox, random walks and Markov chains.
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

  // P(at least two of n people share a birthday), d days in the year
  function birthday(n, d = 365) {
    let q = 1;
    for (let k = 0; k < n; k++) q *= (d - k) / d;
    return 1 - Math.max(0, q);
  }
  // Long-run distribution of a row-stochastic matrix by power iteration, starting from state `start`
  // (or uniform). For an irreducible chain this is the stationary distribution, whatever the start.
  function stationary(P, start = -1) {
    const n = P.length;
    let v = start >= 0 ? P.map((_, i) => (i === start ? 1 : 0)) : new Array(n).fill(1 / n);
    for (let it = 0; it < 5000; it++) {
      const w = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[j] += v[i] * P[i][j];
      // averaging with the previous vector also converges for periodic chains
      const nv = w.map((x, j) => 0.5 * (x + v[j]));
      const diff = nv.reduce((s, x, j) => s + Math.abs(x - v[j]), 0);
      v = nv;
      if (diff < 1e-13) break;
    }
    return v;
  }
  return { diceSum, birthday, stationary };
})();

(() => {
  const { el } = U;
  const st = { tab: 'dice', speed: 30, dice: { n: 2, s: 6 }, galton: { rows: 12 }, monty: { doors: 3 }, bday: { n: 23 }, walk: { dim: 1, count: 8, maxT: 20000 }, markov: 'weather' };
  // English goes into the page; the German pair is registered with the interface dictionary, which
  // translates the page when German is selected. Text drawn on canvases is translated directly (TC).
  const T = (en, de) => { I18n.add('de', { [en]: de }); return en; };
  const TC = (en, de) => I18n.t(T(en, de));
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
      ctx.fillStyle = Theme.muted;
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
        ctx.strokeStyle = Theme.frame; ctx.strokeRect(x - dx / 2, binTop, dx, binH);
      }
      if (total) {
        ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.beginPath();
        for (let k = 0; k <= R; k++) { const e = (MX.S.nCr(R, k) / 2 ** R) * total; const y = binTop + binH - (e / scale) * binH; k ? ctx.lineTo(pegX(R, k), y) : ctx.moveTo(pegX(R, k), y); }
        ctx.stroke();
      }
      ctx.fillStyle = Theme.muted; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
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
      ctx.strokeStyle = Theme.frame; ctx.strokeRect(ox + 0.5, oy + 0.5, s, s);
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


  // ---------------------------------------------------------------- Monty Hall
  function montyExp() {
    let games, winsStay, winsSwitch, history, lastGame, play;
    const cv = el('canvas', { class: 'chart' }), doorsEl = el('div', { class: 'pl-doors' }), msgEl = el('div', { class: 'pl-msg' }), statsEl = el('div', { class: 'pl-stats' });
    const D = () => st.monty.doors;
    const reset = () => { games = 0; winsStay = 0; winsSwitch = 0; history = []; lastGame = null; play = null; draw(); };
    // one simulated game: the host opens all other doors but one, never the car
    const game = () => {
      const n = D(), car = Math.floor(Math.random() * n), pick = Math.floor(Math.random() * n);
      const other = pick === car ? (car + 1 + Math.floor(Math.random() * (n - 1))) % n : car;
      return { car, pick, other };
    };
    const simulate = (k) => {
      for (let i = 0; i < k; i++) {
        const g = game();
        games++;
        if (g.pick === g.car) winsStay++; else winsSwitch++;
        lastGame = g;
        if (games <= 200 || games % Math.ceil(games / 1000) === 0) history.push([games, winsStay / games, winsSwitch / games]);
      }
    };
    // play it yourself: choose a door, the host opens the others, then stay or switch
    const startPlay = () => { play = { car: Math.floor(Math.random() * D()), pick: null, other: null, done: false }; lastGame = null; draw(); };
    const choose = (i) => {
      if (!play || play.done) return;
      if (play.pick == null) {
        play.pick = i;
        play.other = i === play.car ? (play.car + 1 + Math.floor(Math.random() * (D() - 1))) % D() : play.car;
      } else if (i === play.pick || i === play.other) {
        play.final = i; play.done = true;
        const won = i === play.car;
        st.monty.mine = st.monty.mine || { stay: [0, 0], swap: [0, 0] };
        const rec = st.monty.mine[i === play.pick ? 'stay' : 'swap'];
        rec[0] += won ? 1 : 0; rec[1]++;
      }
      draw();
    };
    function drawDoors() {
      const n = D(), g = play || (lastGame && { ...lastGame, done: true, final: lastGame.pick });
      const shown = Math.min(n, 10);
      doorsEl.replaceChildren(...Array.from({ length: shown }, (_, i) => {
        let cls = 'pl-door', label = String(i + 1);
        if (g) {
          const open = g.done || (g.pick != null && i !== g.pick && i !== g.other);
          if (open) { cls += ' open'; label = i === g.car ? '🚗' : '🐐'; }
          if (i === g.pick) cls += ' picked';
          if (g.done && i === g.final) cls += ' final';
        }
        return U.el('button', { type: 'button', class: cls, onclick: () => choose(i) }, label);
      }), n > shown ? el('span', { class: 'hint' }, `… ${n - shown} more`) : '');
      if (!play) msgEl.textContent = lastGame ? T('Last simulated game shown. Press “Play a round” to try it yourself.', 'Letztes simuliertes Spiel. Mit „Selbst spielen“ probierst du es selbst.') : T('Press “Play a round” to play, or Run to simulate many games.', 'Drücke „Selbst spielen“ oder „Start“, um viele Spiele zu simulieren.');
      else if (play.pick == null) msgEl.textContent = T('Pick a door.', 'Wähle eine Tür.');
      else if (!play.done) msgEl.textContent = T(`The host opened ${n - 2 === 1 ? 'a door' : `${n - 2} doors`} with a goat. Click your door to stay, or door ${play.other + 1} to switch.`, `Der Moderator hat ${n - 2 === 1 ? 'eine Tür' : `${n - 2} Türen`} mit einer Ziege geöffnet. Klicke deine Tür zum Bleiben oder Tür ${play.other + 1} zum Wechseln.`);
      else msgEl.textContent = (play.final === play.car ? T('🎉 You won the car!', '🎉 Du hast das Auto gewonnen!') : T('🐐 A goat. ', '🐐 Eine Ziege. ')) + ' ' + T(`Switching wins with probability ${n - 1}/${n}.`, `Wechseln gewinnt mit Wahrscheinlichkeit ${n - 1}/${n}.`);
    }
    function draw() {
      drawDoors();
      const n = D();
      const fr = Charts.frame(cv, { xmin: 0, xmax: Math.max(10, games), ymin: 0, ymax: 1, xlabel: TC('games', 'Spiele'), ylabel: TC('share won', 'Anteil gewonnen') });
      const { ctx, X, Y } = fr;
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      for (const [p, c] of [[1 / n, '#ff6b6b'], [(n - 1) / n, '#51cf66']]) { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(fr.x0, Y(p)); ctx.lineTo(fr.x1, Y(p)); ctx.stroke(); }
      ctx.setLineDash([]); ctx.lineWidth = 2;
      for (const [k, c] of [[1, '#ff6b6b'], [2, '#51cf66']]) { ctx.strokeStyle = c; ctx.beginPath(); history.forEach((h, i) => (i ? ctx.lineTo(X(h[0]), Y(h[k])) : ctx.moveTo(X(h[0]), Y(h[k])))); ctx.stroke(); }
      const mine = st.monty.mine || { stay: [0, 0], swap: [0, 0] };
      statsEl.replaceChildren(stat(T('games', 'Spiele'), String(games)),
        stat(T('staying wins', 'Bleiben gewinnt'), games ? `${fmt((100 * winsStay) / games, 3)} %` : '—'), stat(T('switching wins', 'Wechseln gewinnt'), games ? `${fmt((100 * winsSwitch) / games, 3)} %` : '—'),
        stat(T('theory', 'Theorie'), `1/${n} vs ${n - 1}/${n}`),
        stat(T('your games (stay / switch)', 'deine Spiele (bleiben / wechseln)'), `${mine.stay[0]}/${mine.stay[1]} · ${mine.swap[0]}/${mine.swap[1]}`));
    }
    const doors = el('select', {}, [3, 4, 5, 10, 100].map((v) => el('option', { value: v }, v + ' ' + T('doors', 'Türen'))));
    doors.value = st.monty.doors;
    doors.addEventListener('change', () => { st.monty.doors = +doors.value; reset(); });
    reset();
    return {
      controls: [doors, U.el('button', { type: 'button', class: 'small', onclick: startPlay }, T('🚪 Play a round', '🚪 Selbst spielen')), U.el('button', { type: 'button', class: 'small', onclick: () => { simulate(1000); draw(); } }, '+1000')],
      view: el('div', {}, doorsEl, msgEl, cv, statsEl, el('p', { class: 'hint' }, T('A car is behind one door, goats behind the others. You pick a door; the host, who knows where the car is, opens all the other doors except one — always showing goats. Staying wins only if your first guess was right (1 in n). Switching wins every other time. Red: staying. Green: switching.', 'Hinter einer Tür steht ein Auto, hinter den anderen Ziegen. Du wählst eine Tür; der Moderator, der das Auto kennt, öffnet alle anderen Türen bis auf eine — immer mit Ziegen. Bleiben gewinnt nur, wenn die erste Wahl richtig war (1 von n). Wechseln gewinnt in allen anderen Fällen. Rot: bleiben, Grün: wechseln.'))),
      step: (k) => simulate(k), draw, reset,
    };
  }

  // ---------------------------------------------------------------- birthday paradox
  function birthdayExp() {
    let groups, hits, lastGroup;
    const cv = el('canvas', { class: 'chart tall' }), groupEl = el('div', { class: 'pl-bdays' }), statsEl = el('div', { class: 'pl-stats' });
    const reset = () => { groups = 0; hits = 0; lastGroup = null; draw(); };
    const sample = (k) => {
      const n = st.bday.n;
      for (let i = 0; i < k; i++) {
        const days = Array.from({ length: n }, () => Math.floor(Math.random() * 365));
        const seen = new Map();
        let shared = null;
        days.forEach((d) => { seen.set(d, (seen.get(d) || 0) + 1); if (seen.get(d) > 1 && shared == null) shared = d; });
        groups++; if (shared != null) hits++;
        lastGroup = { days, shared, seen };
      }
    };
    const dayName = (d) => new Date(2001, 0, 1 + d).toLocaleDateString(I18n.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short' });
    function draw() {
      const n = st.bday.n;
      const fr = Charts.frame(cv, { xmin: 0, xmax: 80, ymin: 0, ymax: 1, xlabel: TC('people in the room', 'Personen im Raum'), ylabel: TC('P(shared birthday)', 'P(gemeinsamer Geburtstag)') });
      const { ctx, X, Y } = fr;
      ctx.strokeStyle = Theme.muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(fr.x0, Y(0.5)); ctx.lineTo(fr.x1, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k <= 80; k++) (k ? ctx.lineTo(X(k), Y(ProbLab.birthday(k))) : ctx.moveTo(X(k), Y(0)));
      ctx.stroke();
      ctx.strokeStyle = '#4dabf7'; ctx.beginPath(); ctx.moveTo(X(n), fr.y0); ctx.lineTo(X(n), fr.y1); ctx.stroke();
      if (groups) { ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.arc(X(n), Y(hits / groups), 5, 0, Math.PI * 2); ctx.fill(); }
      if (lastGroup) {
        const sorted = [...lastGroup.days].sort((a, b) => a - b);
        groupEl.replaceChildren(...sorted.slice(0, 80).map((d) => el('span', { class: 'pl-bday' + (lastGroup.seen.get(d) > 1 ? ' hit' : '') }, dayName(d))));
      } else groupEl.replaceChildren();
      let n50 = 1; while (ProbLab.birthday(n50) < 0.5) n50++;
      statsEl.replaceChildren(stat(T('group size', 'Gruppengröße'), String(n)), stat(T('groups tried', 'Gruppen'), String(groups)),
        stat(T('with a shared birthday', 'mit gemeinsamem Geburtstag'), groups ? `${fmt((100 * hits) / groups, 3)} %` : '—'), stat(T('theory', 'Theorie'), `${fmt(100 * ProbLab.birthday(n), 4)} %`),
        stat(T('pairs of people', 'Paare'), String((n * (n - 1)) / 2)), stat(T('50 % reached at', '50 % ab'), `${n50} ${T('people', 'Personen')}`));
    }
    const nCtl = C.slider({ label: T('People', 'Personen'), min: 2, max: 80, step: 1, get: () => st.bday.n, set: (v) => { st.bday.n = Math.round(v); reset(); } });
    reset();
    requestAnimationFrame(() => nCtl.sync());
    return {
      controls: [el('div', { class: 'pl-inline-slider' }, nCtl.el), U.el('button', { type: 'button', class: 'small', onclick: () => { sample(1000); draw(); } }, T('+1000 groups', '+1000 Gruppen'))],
      view: el('div', {}, groupEl, cv, statsEl, el('p', { class: 'hint' }, T('With only 23 people the chance that two share a birthday is already above 50 % — because there are 253 pairs, and each pair could match. Orange: exact probability 1 − 365·364·…/365ⁿ. Blue dot: your simulation. Highlighted dates in the last group are shared.', 'Schon bei 23 Personen liegt die Chance für einen gemeinsamen Geburtstag über 50 % — denn es gibt 253 Paare, und jedes könnte passen. Orange: exakte Wahrscheinlichkeit 1 − 365·364·…/365ⁿ. Blauer Punkt: die Simulation. Hervorgehobene Daten der letzten Gruppe kommen doppelt vor.'))),
      step: (k) => sample(Math.max(1, Math.ceil(k / 10))), draw, reset,
    };
  }

  // ---------------------------------------------------------------- random walks
  function walkExp() {
    let walkers, t, msd, w2lim;
    const cv = el('canvas', { class: 'chart tall' }), statsEl = el('div', { class: 'pl-stats' });
    const colors = ['#4dabf7', '#ff922b', '#51cf66', '#cc5de8', '#ff6b6b', '#fcc419', '#22b8cf', '#f06595'];
    const reset = () => {
      t = 0; msd = []; w2lim = 0;
      walkers = Array.from({ length: st.walk.count }, () => ({ x: 0, y: 0, path: [[0, 0]] }));
      draw();
    };
    const step = (k) => {
      for (let i = 0; i < k; i++) {
        if (t >= st.walk.maxT) return;
        t++;
        let sq = 0;
        for (const w of walkers) {
          if (st.walk.dim === 1) w.x += Math.random() < 0.5 ? -1 : 1;
          else { const d = Math.floor(Math.random() * 4); w.x += [1, -1, 0, 0][d]; w.y += [0, 0, 1, -1][d]; }
          if (st.walk.dim === 1 || w.path.length < 40000) w.path.push(st.walk.dim === 1 ? [t, w.x] : [w.x, w.y]);
          sq += w.x * w.x + w.y * w.y;
          if (!w.x && !w.y) w.back = true;
        }
        msd.push(sq / walkers.length);
      }
    };
    function draw() {
      const T_ = Math.max(50, t);
      if (st.walk.dim === 1) {
        const lim = Math.max(10, 3 * Math.sqrt(T_), ...walkers.map((w) => Math.abs(w.x)));
        const fr = Charts.frame(cv, { xmin: 0, xmax: T_, ymin: -lim, ymax: lim, xlabel: TC('steps', 'Schritte'), ylabel: TC('position', 'Position') });
        const { ctx, X, Y } = fr;
        ctx.fillStyle = 'rgba(255,146,43,0.12)'; ctx.beginPath();
        for (let i = 0; i <= 100; i++) ctx.lineTo(X((T_ * i) / 100), Y(2 * Math.sqrt((T_ * i) / 100)));
        for (let i = 100; i >= 0; i--) ctx.lineTo(X((T_ * i) / 100), Y(-2 * Math.sqrt((T_ * i) / 100)));
        ctx.fill();
        walkers.forEach((w, k) => {
          ctx.strokeStyle = colors[k % colors.length]; ctx.globalAlpha = walkers.length > 8 ? 0.45 : 0.9; ctx.lineWidth = 1.3; ctx.beginPath();
          const stride = Math.max(1, Math.floor(w.path.length / 1500));
          w.path.forEach(([a, b], i) => { if (i % stride && i !== w.path.length - 1) return; i ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b)); });
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else {
        w2lim = Math.max(w2lim || 0, ...walkers.map((w) => Math.max(Math.abs(w.x), Math.abs(w.y))));
        const lim = Math.max(10, w2lim, 2.2 * Math.sqrt(T_)) * 1.1;
        const fr = Charts.frame(cv, { xmin: -lim, xmax: lim, ymin: -lim, ymax: lim, equal: true });
        const { ctx, X, Y } = fr;
        ctx.strokeStyle = 'rgba(255,146,43,0.6)'; ctx.setLineDash([5, 4]); ctx.beginPath();
        const r = Math.sqrt(Math.max(1, t)); ctx.ellipse(X(0), Y(0), Math.abs(X(r) - X(0)), Math.abs(Y(r) - Y(0)), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        walkers.forEach((w, k) => {
          ctx.strokeStyle = colors[k % colors.length]; ctx.globalAlpha = walkers.length > 8 ? 0.5 : 0.85; ctx.lineWidth = 1.1; ctx.beginPath();
          w.path.forEach(([a, b], i) => (i ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b))));
          ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = colors[k % colors.length]; ctx.beginPath(); ctx.arc(X(w.x), Y(w.y), 3.5, 0, Math.PI * 2); ctx.fill();
        });
      }
      const mean = walkers.reduce((s, w) => s + w.x, 0) / walkers.length;
      const rms = Math.sqrt(msd.length ? msd[msd.length - 1] : 0);
      const back = walkers.filter((w) => w.back).length;
      statsEl.replaceChildren(stat(T('steps', 'Schritte'), `${t}${t >= st.walk.maxT ? ' (max)' : ''}`), stat(T('walkers', 'Wanderer'), String(walkers.length)),
        stat(st.walk.dim === 1 ? T('average position', 'mittlere Position') : T('average x', 'mittleres x'), fmt(mean, 3)),
        stat(T('root-mean-square distance', 'mittlerer quadratischer Abstand'), fmt(rms, 4)), stat('√steps', fmt(Math.sqrt(t), 4)),
        stat(T('walkers that came back to 0', 'zurück bei 0 gewesen'), `${back} / ${walkers.length}`));
    }
    const dim = el('select', {}, [[1, T('1D (along a line)', '1D (auf einer Geraden)')], [2, T('2D (on a grid)', '2D (im Gitter)')]].map(([v, l]) => el('option', { value: v }, l)));
    dim.value = st.walk.dim;
    dim.addEventListener('change', () => { st.walk.dim = +dim.value; reset(); });
    const cnt = el('select', {}, [1, 3, 8, 25, 100].map((v) => el('option', { value: v }, `${v} ${v === 1 ? T('walker', 'Wanderer') : T('walkers', 'Wanderer')}`)));
    cnt.value = st.walk.count;
    cnt.addEventListener('change', () => { st.walk.count = +cnt.value; reset(); });
    reset();
    return {
      controls: [dim, cnt, U.el('button', { type: 'button', class: 'small', onclick: () => { step(1000); draw(); } }, T('+1000 steps', '+1000 Schritte'))],
      view: el('div', {}, cv, statsEl, el('p', { class: 'hint' }, T('Each walker takes random unit steps. On average they go nowhere, but they spread out: the typical distance from the start grows like √(steps) — the shaded band (1D) and dashed circle (2D). In 1D and 2D a walker returns to the start with certainty sooner or later; in 3D it does not.', 'Jeder Wanderer macht zufällige Einheitsschritte. Im Mittel kommen sie nicht voran, aber sie verteilen sich: der typische Abstand vom Start wächst wie √(Schritte) — das schattierte Band (1D) und der gestrichelte Kreis (2D). In 1D und 2D kehrt ein Wanderer früher oder später sicher zum Start zurück, in 3D nicht.'))),
      step, draw, reset,
    };
  }

  // ---------------------------------------------------------------- Markov chains
  const MARKOV = {
    weather: { en: 'Weather', de: 'Wetter', states: ['☀ Sun', '☁ Cloud', '🌧 Rain'], P: '0.7 0.2 0.1\n0.3 0.4 0.3\n0.2 0.4 0.4' },
    mood: { en: 'Mood', de: 'Laune', states: ['Happy', 'OK', 'Grumpy'], P: '0.6 0.3 0.1\n0.25 0.5 0.25\n0.1 0.4 0.5' },
    web: { en: 'Web surfer (PageRank)', de: 'Surfer (PageRank)', states: ['A', 'B', 'C', 'D'], P: '0.05 0.45 0.45 0.05\n0.05 0.05 0.85 0.05\n0.45 0.05 0.05 0.45\n0.05 0.05 0.85 0.05' },
    gambler: { en: "Gambler's ruin", de: 'Ruin des Spielers', start: 2, states: ['0 €', '1 €', '2 €', '3 €', '4 €'], P: '1 0 0 0 0\n0.5 0 0.5 0 0\n0 0.5 0 0.5 0\n0 0 0.5 0 0.5\n0 0 0 0 1' },
    cycle: { en: 'Cycle (periodic)', de: 'Kreislauf (periodisch)', states: ['1', '2', '3'], P: '0 1 0\n0 0 1\n1 0 0' },
  };
  function markovExp() {
    let P, names, state, start, visits, steps, err, trail, anim;
    const cv = el('canvas', { class: 'pl-markov' }), bars = el('canvas', { class: 'chart' }), statsEl = el('div', { class: 'pl-stats' }), errEl = el('div', { class: 'err-text' });
    const area = el('textarea', { class: 'mono st-data small', spellcheck: 'false', rows: 5 });
    const namesIn = el('input', { type: 'text', class: 'mono' });
    function parse() {
      err = '';
      try {
        const rows = area.value.trim().split(/\n+/).map((r) => r.trim().split(/[\s,;]+/).map((x) => MX.evaluate(MX.parse(x), {})));
        const n = rows.length;
        if (n < 2 || n > 8) throw new Error(T('Use 2 to 8 states (one row per state).', 'Verwende 2 bis 8 Zustände (eine Zeile pro Zustand).'));
        rows.forEach((r, i) => {
          if (r.length !== n) throw new Error(T(`Row ${i + 1} needs ${n} numbers.`, `Zeile ${i + 1} braucht ${n} Zahlen.`));
          if (r.some((x) => !(x >= 0))) throw new Error(T(`Row ${i + 1} has a negative or invalid entry.`, `Zeile ${i + 1} enthält einen ungültigen Wert.`));
          const s = r.reduce((a, b) => a + b, 0);
          if (Math.abs(s - 1) > 1e-6) throw new Error(T(`Row ${i + 1} adds up to ${fmt(s)}, not 1.`, `Zeile ${i + 1} ergibt ${fmt(s)} statt 1.`));
        });
        P = rows;
        const given = namesIn.value.split(',').map((x) => x.trim()).filter(Boolean);
        names = Array.from({ length: n }, (_, i) => given[i] || String.fromCharCode(65 + i));
      } catch (e) { err = e.message; }
      errEl.textContent = err;
      reset();
    }
    function reset() { if (!P) return; state = Math.min(P.length - 1, (MARKOV[st.markov] && MARKOV[st.markov].start) || 0); steps = 0; visits = new Array(P.length).fill(0); visits[state] = 1; start = state; trail = []; anim = null; draw(); }
    const step = (k) => {
      if (!P || err) return;
      for (let i = 0; i < k; i++) {
        let r = Math.random(), j = 0;
        while (j < P.length - 1 && r >= P[state][j]) { r -= P[state][j]; j++; }
        anim = { from: state, to: j, t: 0 };
        state = j; steps++; visits[j]++;
        trail.push(j); if (trail.length > 40) trail.shift();
      }
    };
    const pos = (i, n, w, h) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n, R = Math.min(w, h) * 0.34; return [w / 2 + R * Math.cos(a), h / 2 + R * Math.sin(a)]; };
    function draw() {
      if (!P) return;
      const { ctx, w, h } = Charts.setup(cv);
      const n = P.length, r = Math.max(18, Math.min(34, Math.min(w, h) / (n + 4)));
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const p = P[i][j];
        if (p <= 0) continue;
        const [x1, y1] = pos(i, n, w, h), [x2, y2] = pos(j, n, w, h);
        ctx.strokeStyle = Theme.muted; ctx.fillStyle = Theme.muted; ctx.lineWidth = 0.8 + 3 * p; ctx.globalAlpha = 0.35 + 0.6 * p;
        let lx, ly;
        if (i === j) { // self-loop outside the circle
          const a = Math.atan2(y1 - h / 2, x1 - w / 2), cx = x1 + Math.cos(a) * r * 1.3, cy = y1 + Math.sin(a) * r * 1.3;
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
          lx = x1 + Math.cos(a) * r * 2.35; ly = y1 + Math.sin(a) * r * 2.35;
        } else { // curved arrow, bent to the right so i→j and j→i don't overlap
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
          const cx = mx + (-dy / L) * L * 0.18, cy = my + (dx / L) * L * 0.18;
          const a2 = Math.atan2(y2 - cy, x2 - cx), ex = x2 - Math.cos(a2) * (r + 2), ey = y2 - Math.sin(a2) * (r + 2);
          const a1 = Math.atan2(cy - y1, cx - x1), sx = x1 + Math.cos(a1) * r, sy = y1 + Math.sin(a1) * r;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 9 * Math.cos(a2 - 0.4), ey - 9 * Math.sin(a2 - 0.4)); ctx.lineTo(ex - 9 * Math.cos(a2 + 0.4), ey - 9 * Math.sin(a2 + 0.4)); ctx.fill();
          lx = 0.25 * sx + 0.5 * cx + 0.25 * ex; ly = 0.25 * sy + 0.5 * cy + 0.25 * ey;
        }
        ctx.globalAlpha = 1; ctx.fillStyle = Theme.text;
        ctx.fillText(fmt(p, 3), lx, ly);
      }
      for (let i = 0; i < n; i++) {
        const [x, y] = pos(i, n, w, h);
        ctx.fillStyle = i === state ? '#7c5cff' : Theme.panel; ctx.strokeStyle = i === state ? '#b197fc' : Theme.frame; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = i === state ? '#fff' : Theme.text; ctx.fillText(names[i], x, y);
      }
      // stationary distribution vs visit frequencies
      const pi = ProbLab.stationary(P, start).map((p) => (p < 1e-9 ? 0 : p)), total = visits.reduce((a, b) => a + b, 0);
      const fr = Charts.frame(bars, { xmin: -0.6, xmax: n - 0.4, ymin: 0, ymax: Math.min(1, Math.max(...pi, ...visits.map((v) => v / total)) * 1.2 + 0.02), discreteX: true, xlabel: TC('state', 'Zustand'), ylabel: TC('share of time', 'Zeitanteil'), xfmt: (v) => names[Math.round(v)] || '' });
      const bw = (fr.X(1) - fr.X(0)) * 0.6;
      visits.forEach((v, i) => { fr.ctx.fillStyle = 'rgba(77,171,247,0.7)'; fr.ctx.fillRect(fr.X(i) - bw / 2, fr.Y(v / total), bw, fr.Y(0) - fr.Y(v / total)); });
      fr.ctx.strokeStyle = '#ff922b'; fr.ctx.lineWidth = 3;
      pi.forEach((p, i) => { fr.ctx.beginPath(); fr.ctx.moveTo(fr.X(i) - bw / 2 - 4, fr.Y(p)); fr.ctx.lineTo(fr.X(i) + bw / 2 + 4, fr.Y(p)); fr.ctx.stroke(); });
      statsEl.replaceChildren(stat(T('steps', 'Schritte'), String(steps)), stat(T('now in', 'jetzt in'), names[state]),
        stat(T('recent path', 'letzte Zustände'), trail.slice(-12).map((j) => names[j]).join(' → ') || '—'),
        stat(T('long-run distribution', 'Grenzverteilung'), pi.map((p, i) => `${names[i]}: ${fmt(p, 3)}`).join(', ')));
    }
    const preset = el('select', {}, Object.entries(MARKOV).map(([k, m]) => el('option', { value: k }, T(m.en, m.de))));
    const load = (k) => { st.markov = k; const m = MARKOV[k]; area.value = m.P; namesIn.value = m.states.join(', '); parse(); };
    preset.value = MARKOV[st.markov] ? st.markov : 'weather';
    preset.addEventListener('change', () => load(preset.value));
    let pt = 0;
    const onEdit = () => { clearTimeout(pt); pt = setTimeout(parse, 300); };
    area.addEventListener('input', onEdit); namesIn.addEventListener('input', onEdit);
    load(preset.value);
    return {
      controls: [preset, U.el('button', { type: 'button', class: 'small', onclick: () => { step(1000); draw(); } }, T('+1000 steps', '+1000 Schritte'))],
      view: el('div', { class: 'pl-markov-wrap' },
        el('div', {}, cv),
        el('div', {}, el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, T('Transition matrix (row = from, column = to; rows add up to 1)', 'Übergangsmatrix (Zeile = von, Spalte = nach; Zeilensumme 1)')), area),
          el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, T('State names (comma-separated)', 'Zustandsnamen (durch Kommas getrennt)')), namesIn), errEl,
          bars, statsEl, el('p', { class: 'hint' }, T('The next state depends only on the current one. Over time the share of time spent in each state (blue) approaches the stationary distribution π with πP = π (orange) — unless the chain has absorbing states (gambler’s ruin) or is periodic.', 'Der nächste Zustand hängt nur vom aktuellen ab. Mit der Zeit nähert sich der Zeitanteil in jedem Zustand (blau) der stationären Verteilung π mit πP = π (orange) — außer bei absorbierenden Zuständen (Ruin des Spielers) oder periodischen Ketten.')))),
      step: (k) => step(Math.max(1, Math.round(k / 5))), draw, reset,
    };
  }

  // ---------------------------------------------------------------- page
  const EXPS = { dice: ['Dice', diceExp], coins: ['Coin flips', coinExp], galton: ['Galton board', galtonExp], pi: ['Monte Carlo π', piExp],
    monty: ['Monty Hall', montyExp], bday: ['Birthday paradox', birthdayExp], walk: ['Random walks', walkExp], markov: ['Markov chains', markovExp] };
  const built = {};
  let playBtn, speedCtl, ctlBox, explain;
  function show(k) {
    st.tab = k;
    root.querySelectorAll('.page-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === k));
    if (!built[k]) built[k] = EXPS[k][1]();
    active = built[k];
    ctlBox.replaceChildren(...active.controls);
    body.replaceChildren(active.view);
    explain.show(k);
    requestAnimationFrame(() => active.draw());
  }
  // one frame of time; speed = events per second
  function advance(exp, dt) {
    exp.acc = (exp.acc || 0) + st.speed * dt;
    const k = Math.floor(exp.acc);
    exp.acc -= k;
    if (k) exp.step(k);
    if (exp.tick) exp.tick(dt);
  }
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
    last = ts;
    if (Shell.isActive('probability') && active) {
      advance(active, dt);
      active.draw();
    }
    requestAnimationFrame(loop);
  }
  // Records the running experiment as an MP4, frame by frame (each frame is 1/fps of experiment time).
  async function clip() {
    const exp = active, label = EXPS[st.tab][0];
    if (!exp) return;
    const o = await Clips.dialog({ title: label, intro: 'Records the experiment running at the speed set here, with its charts and counters.' });
    if (!o) return;
    const wasRunning = running;
    if (running) setRunning(false);
    if (o.fromStart) exp.reset();
    await Clips.record({
      name: label, secs: o.secs, fps: o.fps, size: o.size,
      frame: (i) => {
        if (i > 0) advance(exp, 1 / o.fps);
        exp.draw();
        return Clips.snapshot(exp.view);
      },
      onEnd: () => { exp.draw(); if (wasRunning) setRunning(true); },
    });
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
    explain = Explain.attach('prob');
    speedCtl = C.slider({ label: 'Speed (per second)', min: 1, max: 5000, log: true, step: 1, get: () => st.speed, set: (v) => { st.speed = v; } });
    const tabs = el('div', { class: 'seg page-tabs' }, Object.entries(EXPS).map(([k, [label]]) => el('button', { type: 'button', 'data-v': k, onclick: () => show(k) }, label)));
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Probability lab'), el('p', {}, 'Run random experiments and watch them approach the theory.')),
      tabs,
      el('div', { class: 'pane' },
        el('div', { class: 'pl-top' }, playBtn, U.el('button', { type: 'button', onclick: () => { active.reset(); } }, 'Reset'),
          U.el('button', { type: 'button', title: 'Record this experiment as a video clip (MP4)', onclick: clip }, '🎬 Clip'), explain.button,
          ctlBox, el('div', { class: 'pl-speed' }, speedCtl.el)),
        explain.box,
        body)));
    show(EXPS[st.tab] ? st.tab : 'dice');
    new ResizeObserver(() => active && active.draw()).observe(body);
    Theme.onChange(() => active && active.draw());
  }

  Shell.register('probability', {
    label: 'Probability lab', short: 'Probability', key: 7, order: 7, root: () => document.getElementById('mod-probability'), init,
    onHide: () => { if (running) setRunning(false); Clips.cancel(); },
    desc: 'Simulate dice, coins, a Galton board, Monte Carlo π, Monty Hall, the birthday paradox, random walks and Markov chains — and watch them approach the theory.',
    features: ['Dice & coins', 'Galton board', 'Monty Hall', 'Markov chains'],
    commands: Object.entries(EXPS).map(([k, [label]]) => ({ label: `Probability: ${label}`, keywords: 'experiment simulation ' + k, run: () => { if (root) show(k); else st.tab = k; } })),
  });
})();

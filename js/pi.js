// π viewer: up to 100 000 digits of π, computed here, shown as digits, base-26 letters, pixels, RGB pixels, the
// π walk, a circle of chords and digit frequencies, with search, and Run / Clip / Explain like the simulations.
//   PiMath.piGen(n)        generator: yields progress 0…1, returns "31415…" with n decimals
//   PiMath.piDigits(n)     the same, all at once
//   PiMath.piLetters(ds)   π's fractional part in base 26 (A = 0 … Z = 25)
const PiMath = (() => {
  // Machin's formula π = 16·arctan(1/5) − 4·arctan(1/239) in BigInt fixed point (10 guard digits).
  // A generator, so long runs can pause every few hundred terms (yields progress 0…1); returns "31415…" with n decimals.
  function* piGen(n) {
    const unity = 10n ** BigInt(n + 10);
    const terms5 = Math.ceil((n + 10) / Math.log10(25)), terms239 = Math.ceil((n + 10) / Math.log10(239 * 239));
    let done = 0;
    function* atanInv(x) {
      const X = BigInt(x), x2 = X * X;
      let term = unity / X, sum = term, k = 1n, neg = true;
      while (term) {
        term /= x2;
        sum = neg ? sum - term / (2n * k + 1n) : sum + term / (2n * k + 1n);
        neg = !neg; k++;
        if (++done % 200 === 0) yield done / (terms5 + terms239);
      }
      return sum;
    }
    const a = yield* atanInv(5), b = yield* atanInv(239);
    return (16n * a - 4n * b).toString().slice(0, n + 1);
  }
  function piDigits(n) { const g = piGen(n); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
  // π's fractional part written in base 26 with A = 0 … Z = 25 (so π = 3.DRSQLOLYRTRODNLH…). From n decimals only
  // n·log₂₆10 letters are certain; one fewer is kept so rounding never shows.
  function piLetters(digits) {
    const n = digits.length - 1, m = Math.max(0, Math.floor((n * Math.LN10) / Math.log(26)) - 1);
    if (!m) return '';
    const f = (BigInt(digits.slice(1)) * 26n ** BigInt(m)) / 10n ** BigInt(n);
    return f.toString(26).padStart(m, '0').replace(/./g, (c) => String.fromCharCode(65 + parseInt(c, 26)));
  }

  return { piGen, piDigits, piLetters };
})();

(() => {
  const { el } = U;
  const KEY = 'mathsim.pi.v1';
  const st = { n: 10000, view: 'walk', speed: 300, find: '' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* fresh */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* not saved */ } };
  let sim = null, running = false, last = 0, playBtn, explain;

  // ---------------------------------------------------------------- small helpers (as in the simulations)
  const stat = (label, value) => el('div', { class: 'pl-stat' }, el('span', {}, label), el('b', { class: 'mono' }, value));
  const f4 = (v) => (isFinite(v) ? MX.fmt(+(+v).toPrecision(4)) : '∞');
  const slider = (label, min, max, get, set, opts = {}) => C.slider({ label, min, max, get, set: (v) => { set(v); save(); }, ...opts });
  const choose = (options, get, set) => { const s = el('select', {}, options.map(([v, l]) => el('option', { value: v }, l))); s.value = get(); s.addEventListener('change', () => { set(s.value); save(); }); return s; };
  const RGB = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  function pixGrid(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    return { w, h, c, px: new Uint32Array(img.data.buffer), put: () => g.putImageData(img, 0, 0) };
  }
  function blitGrid(cv, pg) {
    const { ctx, w, h } = Charts.setup(cv);
    const s = Math.min(w / pg.w, h / pg.h), ox = (w - pg.w * s) / 2, oy = (h - pg.h * s) / 2;
    pg.put();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pg.c, ox, oy, pg.w * s, pg.h * s);
    return { ctx, s, ox, oy, w, h };
  }

  // ---------------------------------------------------------------- the viewer
  // π's digits (computed here, up to 100 000) shown as text, letters (base 26), pixels, RGB pixels, a walk, a
  // circle of chords and a tally. Run streams them in; Find searches for digits or (in base 26) words.
  const PI_COL = ['#868e96', '#ff6b6b', '#ff922b', '#fcc419', '#94d82d', '#51cf66', '#22b8cf', '#4dabf7', '#845ef7', '#f06595'];
  const PI_VIEWS = [['digits', 'Digits'], ['letters', 'Letters (base 26)'], ['pixels', 'Pixels'], ['rgb', 'RGB pixels'],
    ['walk', 'π walk'], ['circle', 'Circle of chords'], ['freq', 'Digit frequencies']];
  function viewer() {
    const P = st;
    let digits = '', letters = '', n = 0, shown = 0, acc = 0, progress = 0, job = 0;
    let walk = null, chords = null, grid = null;
    let hit = null; // { q, kind: 'digits' | 'letters', at (0-based decimal / letter index, −1 = not found), k, count }
    let focus = false; // keep the found place in view instead of following the newest digit
    const cv = el('canvas', { class: 'sim-canvas wide' }), statsEl = el('div', { class: 'pl-stats' }), msg = el('p', { class: 'hint' });
    const L26 = Math.LN10 / Math.log(26);
    const lettersShown = () => Math.min(letters.length, Math.floor(shown * L26));
    const rgbOf = (hex) => RGB(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    const PX = PI_COL.map(rgbOf);
    const hitIn = (kind, i) => hit && hit.kind === kind && hit.at >= 0 && i >= hit.at && i < hit.at + hit.q.length;
    const fmtInt = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // digits are computed in slices, so even 100 000 of them never freeze the window
    async function compute() {
      const my = ++job, want = +P.n, all = !n || shown >= n;
      progress = 0;
      draw();
      const g = PiMath.piGen(want);
      let r = g.next(), t = performance.now();
      while (!r.done) {
        if (performance.now() - t > 25) { progress = r.value; draw(); await U.yieldNow(); if (my !== job) return; t = performance.now(); }
        r = g.next();
      }
      digits = r.value; letters = PiMath.piLetters(digits); n = want; progress = 1;
      walk = chords = grid = null;
      shown = all ? n : Math.min(shown, n);
      if (hit) find(false); else showMsg();
      draw();
    }

    // ---- search: digits are found among the decimals, words among the base-26 letters
    const findIn = el('input', { type: 'text', class: 'mono', placeholder: 'e.g. 1403 or PI', value: P.find || '', spellcheck: 'false' });
    findIn.style.width = '190px';
    findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') find(true); });
    const b = (t) => el('b', { class: 'mono' }, t);
    function showMsg() {
      if (!hit) msg.replaceChildren('Type digits (a birthday, a phone number …) or a word and press Find. Words are looked up in π written in base 26.');
      else if (hit.at < 0) {
        msg.replaceChildren(b(hit.q), ' ', 'is not in the first', ' ', b(fmtInt(hit.kind === 'letters' ? letters.length : n)), ' ',
          hit.kind === 'letters' ? 'base-26 letters of π — try more digits.' : 'decimals of π — try more digits.');
      } else {
        msg.replaceChildren(b(hit.q), ' ', hit.kind === 'letters' ? 'appears at base-26 letter' : 'appears at decimal place', ' ', b(fmtInt(hit.at + 1)), ' · ',
          'occurrence', ' ', b(`${hit.k} / ${hit.count}`), ...(hit.count > 1 ? [' · ', 'press Find again for the next one'] : []));
      }
    }
    function find(next) {
      const raw = findIn.value.trim();
      P.find = raw;
      save();
      const word = /[a-z]/i.test(raw), q = word ? raw.toUpperCase().replace(/[^A-Z]/g, '') : raw.replace(/\D/g, '');
      if (!q || !digits) { hit = null; showMsg(); draw(); return; }
      const kind = word ? 'letters' : 'digits', text = word ? letters : digits.slice(1);
      const again = next && hit && hit.q === q && hit.at >= 0;
      let at = text.indexOf(q, again ? hit.at + 1 : 0);
      if (at < 0 && again) at = text.indexOf(q); // wrap round to the first one
      let count = 0, k = 0;
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) { count++; if (i === at) k = count; }
      hit = { q, kind, at, k, count };
      if (at >= 0) {
        // switch to a view that can show it, and stream far enough to reach it
        if (word && P.view !== 'letters') { P.view = 'letters'; viewSel.value = 'letters'; }
        if (!word && ['letters', 'rgb', 'circle', 'freq'].includes(P.view)) { P.view = 'digits'; viewSel.value = 'digits'; }
        const need = word ? Math.ceil((at + q.length + 1) / L26) : at + q.length;
        shown = Math.max(shown, Math.min(n, need));
        focus = true;
      }
      showMsg();
      draw();
    }

    // ---- drawing
    function textView(ctx, w, h, chars, count, colour, kind) {
      const fs = 15, lh = 21, mono = (px) => `${px}px ui-monospace, Consolas, monospace`;
      ctx.font = mono(fs);
      const cw = Math.ceil(ctx.measureText('0').width) + 1, gut = cw * 8;
      const cols = Math.max(8, Math.floor((w - gut - 12) / cw)), rows = Math.max(1, Math.floor((h - 12) / lh));
      // cell 0 is "3", cell 1 the point, cell i + 2 the i-th digit / letter
      let top = Math.max(0, Math.floor((count + 1) / cols) - rows + 1);
      if (focus && hit && hit.kind === kind && hit.at >= 0) top = Math.max(0, Math.floor((hit.at + 2) / cols) - Math.floor(rows / 3));
      ctx.textBaseline = 'middle';
      for (let r = 0; r < rows; r++) {
        const row = top + r, y = 8 + r * lh + lh / 2;
        if (row * cols > count + 1) break;
        ctx.fillStyle = Theme.muted; ctx.textAlign = 'right'; ctx.font = mono(11);
        ctx.fillText(fmtInt(Math.max(1, row * cols - 1)), gut - cw, y);
        ctx.font = mono(fs); ctx.textAlign = 'left';
        for (let c = 0; c < cols; c++) {
          const cell = row * cols + c;
          if (cell > count + 1) break;
          const x = gut + c * cw, i = cell - 2;
          if (cell < 2) { ctx.fillStyle = Theme.text; ctx.fillText(cell ? '.' : '3', x, y); continue; }
          const on = hitIn(kind, i);
          if (on) { ctx.fillStyle = 'rgba(124, 92, 255, 0.5)'; ctx.fillRect(x - 1, y - lh / 2 + 1, cw, lh - 2); }
          ctx.fillStyle = on ? Theme.text : colour(chars, i);
          ctx.fillText(chars[i], x, y);
        }
      }
    }
    // pixel views keep one layout for all the cells, so the picture fills in as the digits stream
    function pixelView(cells, fill) {
      const w = cv.clientWidth || 1, h = cv.clientHeight || 1;
      const cols = Math.max(1, Math.ceil(Math.sqrt((cells * w) / h))), rows = Math.max(1, Math.ceil(cells / cols));
      if (!grid || grid.w !== cols || grid.h !== rows) grid = pixGrid(cols, rows);
      grid.px.fill(0);
      fill(grid.px);
      return { lay: blitGrid(cv, grid), cols };
    }
    function buildWalk() {
      const pts = new Float32Array(2 * (n + 1));
      let x = 0, y = 0, x0 = 0, x1 = 0, y0 = 0, y1 = 0;
      for (let i = 0; i < n; i++) {
        const a = (digits.charCodeAt(i + 1) - 48) * (Math.PI / 5);
        x += Math.cos(a); y -= Math.sin(a);
        pts[2 * i + 2] = x; pts[2 * i + 3] = y;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      walk = { pts, x0, x1, y0, y1 };
    }
    function draw() {
      if (!digits) {
        const { ctx, w, h } = Charts.setup(cv);
        ctx.fillStyle = Theme.muted; ctx.textAlign = 'center'; ctx.font = '15px system-ui, sans-serif';
        ctx.fillText(`${I18n.t('Computing π…')} ${Math.round(progress * 100)} %`, w / 2, h / 2);
        return stats();
      }
      const view = P.view;
      if (view === 'pixels') {
        const { lay, cols } = pixelView(n, (px) => { for (let i = 0; i < shown; i++) px[i] = PX[digits.charCodeAt(i + 1) - 48]; });
        if (hit && hit.kind === 'digits' && hit.at >= 0 && hit.at < shown) {
          // a spotlight: dim everything, then the found digits at full strength with guide lines through them,
          // so a few pixels among 100 000 can still be found
          const { ctx, s, ox, oy } = lay, W = cols * s, H = grid.h * s;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'; ctx.fillRect(ox, oy, W, H);
          const hx = ox + ((hit.at % cols) + 0.5) * s, hy = oy + (Math.floor(hit.at / cols) + 0.5) * s;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ox, hy); ctx.lineTo(ox + W, hy); ctx.moveTo(hx, oy); ctx.lineTo(hx, oy + H); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, s / 4);
          for (let i = hit.at; i < hit.at + hit.q.length; i++) {
            const x = ox + (i % cols) * s, y = oy + Math.floor(i / cols) * s, m = Math.max(2, s);
            ctx.fillStyle = PI_COL[digits.charCodeAt(i + 1) - 48];
            ctx.fillRect(x - (m - s) / 2, y - (m - s) / 2, m, m);
            ctx.strokeRect(x - (m - s) / 2 - 1, y - (m - s) / 2 - 1, m + 2, m + 2);
          }
        }
      } else if (view === 'rgb') {
        pixelView(Math.floor(n / 9), (px) => {
          const m = Math.floor(shown / 9);
          for (let p = 0; p < m; p++) {
            const o = 1 + 9 * p, c3 = (k) => Math.round((+digits.substr(o + 3 * k, 3) / 999) * 255);
            px[p] = RGB(c3(0), c3(1), c3(2));
          }
        });
      } else {
        const { ctx, w, h } = Charts.setup(cv);
        if (view === 'digits') textView(ctx, w, h, digits.slice(1), shown, (s, i) => PI_COL[s.charCodeAt(i) - 48], 'digits');
        else if (view === 'letters') textView(ctx, w, h, letters, lettersShown(), (s, i) => `hsl(${((s.charCodeAt(i) - 65) * 360) / 26}, 70%, ${Theme.light ? 40 : 68}%)`, 'letters');
        else if (view === 'walk') drawWalk(ctx, w, h);
        else if (view === 'circle') drawCircle(ctx, w, h);
        else drawFreq();
      }
      stats();
    }
    // each digit is one step, turned by digit × 36°; the colour runs from violet (start) to red (latest)
    function drawWalk(ctx, w, h) {
      if (!walk) buildWalk();
      const { pts, x0, x1, y0, y1 } = walk, pad = 18;
      const s = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0));
      const ox = (w - (x1 - x0) * s) / 2 - x0 * s, oy = (h - (y1 - y0) * s) / 2 - y0 * s;
      const X = (i) => ox + pts[2 * i] * s, Y = (i) => oy + pts[2 * i + 1] * s;
      ctx.lineWidth = n > 20000 ? 0.7 : 1.1;
      ctx.lineJoin = 'round';
      const bands = 120;
      for (let k = 0; k < bands; k++) {
        const a = Math.floor((k * n) / bands), e = Math.min(shown, Math.floor(((k + 1) * n) / bands));
        if (a >= e) break;
        ctx.strokeStyle = `hsl(${270 - (k / bands) * 270}, 80%, ${Theme.light ? 45 : 60}%)`;
        ctx.beginPath(); ctx.moveTo(X(a), Y(a));
        for (let i = a + 1; i <= e; i++) ctx.lineTo(X(i), Y(i));
        ctx.stroke();
      }
      if (hit && hit.kind === 'digits' && hit.at >= 0 && hit.at < shown) {
        ctx.strokeStyle = Theme.text; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(X(hit.at), Y(hit.at));
        for (let i = hit.at + 1; i <= Math.min(shown, hit.at + hit.q.length); i++) ctx.lineTo(X(i), Y(i));
        ctx.stroke();
        ctx.beginPath(); ctx.arc(X(hit.at), Y(hit.at), 9, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.fillStyle = Theme.text;
      ctx.beginPath(); ctx.arc(X(0), Y(0), 3.5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath(); ctx.arc(X(shown), Y(shown), 3.5, 0, 2 * Math.PI); ctx.fill();
    }
    // Each digit owns a tenth of the circle and a chord joins every digit to the next one. The chords go into a
    // cached layer that is only extended as more digits arrive.
    function drawCircle(ctx, w, h) {
      const dpr = cv.width / Math.max(1, w), R = Math.min(w, h) / 2 - 34, cx = w / 2, cy = h / 2;
      const key = `${cv.width}x${cv.height}:${n}:${Theme.light}`;
      if (!chords || chords.key !== key || chords.done > shown) {
        const c = document.createElement('canvas');
        c.width = cv.width; c.height = cv.height;
        chords = { key, c, g: c.getContext('2d'), done: 0 };
        chords.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const g = chords.g, pos = (d, i) => ((d + 0.04 + 0.92 * (i / n)) * Math.PI) / 5 - Math.PI / 2;
      g.lineWidth = 0.8;
      g.globalAlpha = U.clamp(12 / Math.sqrt(n), 0.04, 0.5);
      const end = Math.min(shown, n) - 1;
      for (let i = chords.done; i < end; i++) {
        const d1 = digits.charCodeAt(i + 1) - 48, d2 = digits.charCodeAt(i + 2) - 48, a1 = pos(d1, i), a2 = pos(d2, i + 1);
        g.strokeStyle = PI_COL[d1];
        g.beginPath(); g.moveTo(cx + R * Math.cos(a1), cy + R * Math.sin(a1));
        g.quadraticCurveTo(cx, cy, cx + R * Math.cos(a2), cy + R * Math.sin(a2));
        g.stroke();
      }
      chords.done = Math.max(chords.done, end);
      ctx.drawImage(chords.c, 0, 0, w, h);
      // the ten arcs, labelled
      ctx.lineWidth = 7; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 14px system-ui, sans-serif';
      for (let d = 0; d < 10; d++) {
        const a0 = ((d + 0.03) * Math.PI) / 5 - Math.PI / 2, a1 = ((d + 0.97) * Math.PI) / 5 - Math.PI / 2, am = (a0 + a1) / 2;
        ctx.strokeStyle = ctx.fillStyle = PI_COL[d];
        ctx.beginPath(); ctx.arc(cx, cy, R + 7, a0, a1); ctx.stroke();
        ctx.fillText(String(d), cx + (R + 24) * Math.cos(am), cy + (R + 24) * Math.sin(am));
      }
    }
    function counts() { const c = new Array(10).fill(0); for (let i = 1; i <= shown; i++) c[digits.charCodeAt(i) - 48]++; return c; }
    function drawFreq() {
      const c = counts(), E = shown / 10, top = Math.max(1, ...c, E) * 1.15;
      const { ctx, X, Y } = Charts.frame(cv, { xmin: -0.6, xmax: 9.6, ymin: 0, ymax: top, discreteX: true, xlabel: 'digit', ylabel: 'how often' });
      const bw = (X(1) - X(0)) * 0.7;
      c.forEach((v, d) => { ctx.fillStyle = PI_COL[d]; ctx.fillRect(X(d) - bw / 2, Y(v), bw, Y(0) - Y(v)); });
      ctx.strokeStyle = '#ff922b'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(-0.6), Y(E)); ctx.lineTo(X(9.6), Y(E)); ctx.stroke();
      ctx.setLineDash([]);
    }
    function stats() {
      const out = [stat(I18n.t('decimals shown'), `${fmtInt(shown)} / ${fmtInt(n || +P.n)}`)];
      if (digits && shown) {
        const c = counts(), E = shown / 10, chi = c.reduce((s, v) => s + ((v - E) ** 2) / E, 0);
        out.push(stat(I18n.t('latest digit'), digits[shown]), stat(I18n.t('letters (base 26)'), fmtInt(lettersShown())),
          stat(I18n.t('χ² (are the digits equally common?)'), f4(chi)), stat('p', shown >= 50 ? f4(1 - MX.DIST.chi2.cdf(chi, { k: 9 })) : '—'));
      }
      statsEl.replaceChildren(...out);
    }

    const viewSel = choose(PI_VIEWS, () => P.view, (v) => { P.view = v; draw(); });
    const nSel = choose([['1000', '1 000 decimals'], ['10000', '10 000 decimals'], ['100000', '100 000 decimals']], () => String(P.n), (v) => { P.n = +v; compute(); });
    const speed = slider('Digits per second', 1, 5000, () => P.speed, (v) => { P.speed = Math.round(v); }, { log: true, step: 1 });
    compute();
    showMsg();
    return {
      controls: [viewSel, nSel, findIn, U.el('button', { type: 'button', class: 'small', onclick: () => find(true) }, 'Find')],
      view: el('div', {}, cv, el('div', { class: 'grid2' }, speed.el, el('div')), statsEl, msg,
        el('p', { class: 'hint' }, 'π = 3.14159… never ends and never repeats. Run streams the digits in; Reset starts again from 3. In the walk each digit is a step turned by digit × 36°, in the circle every digit is joined to the next one, and each RGB pixel takes 3 digits for red, 3 for green and 3 for blue.')),
      step: (dt) => {
        if (!digits) return;
        let k = 1;
        if (dt != null) { acc += P.speed * dt; k = Math.floor(acc); acc -= k; }
        shown = Math.min(n, shown + k);
        focus = false;
      },
      draw,
      reset: () => { shown = 0; acc = 0; focus = false; draw(); },
      onRun: () => { if (digits && shown >= n) shown = 0; },
      finished: () => !!digits && shown >= n,
      stepsPerFrame: true,
      onShow: () => speed.sync(),
    };
  }

  // ---------------------------------------------------------------- page
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
    last = ts;
    if (Shell.isActive('pi')) { sim.step(dt); sim.draw(); }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    running = on;
    playBtn.textContent = on ? '⏸ Pause' : '▶ Run';
    playBtn.classList.toggle('primary', !on);
    if (on) { sim.onRun(); last = 0; requestAnimationFrame(loop); }
  }
  // Records the digits streaming in as an MP4, frame by frame (each frame is 1/fps of time at the set speed).
  async function clip() {
    const o = await Clips.dialog({ title: 'π viewer', intro: 'Records the digits streaming into the current view, counters included. Pick the view and the speed first.', finish: true });
    if (!o) return;
    const wasRunning = running;
    if (running) setRunning(false);
    if (o.fromStart) sim.reset();
    sim.onRun();
    let doneAt = -1;
    await Clips.record({
      name: 'π viewer', secs: o.secs, fps: o.fps, size: o.size,
      frame: (i) => {
        if (i > 0) {
          if (o.untilDone && sim.finished()) {
            if (doneAt < 0) doneAt = i;
            else if (i - doneAt > o.fps * 1.5) return null; // hold the finished picture for a moment, then stop
          }
          sim.step(1 / o.fps);
        }
        sim.draw();
        return Clips.snapshot(sim.view);
      },
      onEnd: () => { sim.draw(); if (wasRunning) setRunning(true); },
    });
  }
  function init(root) {
    sim = viewer();
    playBtn = U.el('button', { type: 'button', class: 'primary', onclick: () => setRunning(!running) }, '▶ Run');
    explain = Explain.attach('pi');
    root.append(el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'π viewer'), el('p', {}, 'The digits of π, computed right here, as digits, letters, pixels, a walk and a circle. Find your birthday in π.')),
      el('div', { class: 'pane' },
        el('div', { class: 'pl-top' }, playBtn,
          U.el('button', { type: 'button', onclick: () => { sim.step(); sim.draw(); } }, 'Step'),
          U.el('button', { type: 'button', onclick: () => sim.reset() }, 'Reset'),
          U.el('button', { type: 'button', title: 'Record the digits streaming in as a video clip (MP4)', onclick: clip }, '🎬 Clip'), explain.button,
          el('div', { class: 'btn-row pl-ctl' }, ...sim.controls)),
        explain.box,
        sim.view)));
    explain.show('viewer');
    sim.onShow();
    new ResizeObserver(() => sim.draw()).observe(sim.view);
    Theme.onChange(() => sim.draw());
  }
  // a palette command can pick the view before the page is built, or while it is open
  function setView(v) {
    st.view = v;
    save();
    Shell.open('pi');
    if (sim) { sim.controls[0].value = v; sim.draw(); }
  }

  Shell.register('pi', {
    label: 'π viewer', short: 'Pi', order: 11.5, root: () => document.getElementById('mod-pi'), init,
    onShow: () => sim && requestAnimationFrame(() => sim.draw()),
    onHide: () => { if (running) setRunning(false); save(); Clips.cancel(); },
    desc: 'Up to 100 000 digits of π as digits, base-26 letters, pixels, RGB pixels, the π walk and a circle of chords. Search for your birthday or a word.',
    features: ['Digits & letters', 'Pixels', 'π walk', 'Find your birthday'],
    commands: [
      ...PI_VIEWS.map(([v, l]) => ({ label: `π: ${l}`, keywords: `pi π digits ziffern kreiszahl ${v}`, run: () => setView(v) })),
      { label: 'π: find my birthday', keywords: 'pi π search find birthday geburtstag suchen', run: () => { Shell.open('pi'); if (sim) sim.controls[2].focus(); } },
    ],
  });
})();

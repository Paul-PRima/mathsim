// Small canvas chart helpers shared by the statistics, matrices and tools pages.
const Charts = (() => {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const COLORS = ['#4dabf7', '#ff6b6b', '#51cf66', '#cc5de8', '#ff922b', '#22b8cf', '#fcc419', '#f06595'];

  // 1, 2 or 5 × 10^k: a round step giving about `target` intervals over `range`.
  function niceStep(range, target = 6) {
    const raw = Math.abs(range) / target || 1;
    const p = 10 ** Math.floor(Math.log10(raw));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function ticks(lo, hi, target = 6) {
    const step = niceStep(hi - lo, target);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { step, values: out };
  }
  const tickLabel = (v, step) => {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, Math.min(6, -Math.floor(Math.log10(step)) + Math.floor(Math.log10(a))))).replace('e+', 'e');
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(Math.min(10, d));
  };

  // Sizes a canvas to its CSS box at device resolution; returns a 2D context in CSS pixels.
  function setup(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  // Axes, grid and tick labels for a data range. Returns { ctx, X, Y, x0, x1, y0, y1 } (plot box in px).
  function frame(cv, { xmin, xmax, ymin, ymax, xlabel = '', ylabel = '', xticks = true, discreteX = false }) {
    const { ctx, w, h } = setup(cv);
    if (!(xmax > xmin)) { xmin -= 1; xmax += 1; }
    if (!(ymax > ymin)) { ymin -= 1; ymax += 1; }
    const pad = { l: 52, r: 14, t: 12, b: xlabel ? 40 : 28 };
    const x0 = pad.l, x1 = w - pad.r, y0 = pad.t, y1 = h - pad.b;
    const X = (v) => x0 + ((v - xmin) / (xmax - xmin)) * (x1 - x0);
    const Y = (v) => y1 - ((v - ymin) / (ymax - ymin)) * (y1 - y0);
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    const muted = css('--muted') || '#8a90a0', line = css('--line') || '#262a35';
    const yt = ticks(ymin, ymax, Math.max(2, Math.round((y1 - y0) / 45)));
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt.values) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(tickLabel(v, yt.step), x0 - 6, y);
    }
    if (xticks) {
      const xt = ticks(xmin, xmax, Math.max(2, Math.round((x1 - x0) / 80)));
      if (discreteX && xt.step < 1) { xt.step = 1; xt.values = xt.values.filter(Number.isInteger); }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of xt.values) {
        const x = Math.round(X(v)) + 0.5;
        ctx.strokeStyle = line;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        ctx.fillStyle = muted;
        ctx.fillText(tickLabel(v, xt.step), x, y1 + 6);
      }
    }
    ctx.strokeStyle = Theme.frame;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    ctx.fillStyle = muted;
    if (xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(xlabel, (x0 + x1) / 2, h - 4); }
    if (ylabel) {
      ctx.save(); ctx.translate(12, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ylabel, 0, 0); ctx.restore();
    }
    return { ctx, X, Y, x0, x1, y0, y1, w, h };
  }

  // Draws y = f(x) over the frame's x range, breaking the line at gaps and jumps.
  function curve(fr, f, xmin, xmax, color, width = 2) {
    const { ctx, X, Y, x0, x1, y0, y1 } = fr;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let pen = false;
    const n = Math.max(2, Math.round(x1 - x0));
    for (let i = 0; i <= n; i++) {
      const x = xmin + ((xmax - xmin) * i) / n, y = f(x);
      if (!isFinite(y)) { pen = false; continue; }
      const py = U.clamp(Y(y), -1e5, 1e5);
      if (pen) ctx.lineTo(X(x), py); else ctx.moveTo(X(x), py);
      pen = true;
    }
    ctx.stroke();
    ctx.restore();
  }

  return { COLORS, niceStep, ticks, tickLabel, setup, frame, curve, css };
})();

// Clips: records what a section shows (a simulation, an animated graph, a turning 3D surface) as an MP4,
// with the same encoder as the fractal zoom videos (js/video.js). Frames are made one by one and carry
// exact timestamps, so the clip plays at the right speed however long each frame takes to draw.
//   Clips.dialog({ title, intro, fields, secs, finish })  -> Promise<{ secs, fps, size, fromStart, untilDone }>
//   Clips.record({ name, secs, fps, size, frame(i, t), onEnd })   frame returns a canvas (null ends early)
//   Clips.snapshot(root)  -> one canvas with every canvas inside `root`, laid out as on screen, plus counters
const Clips = (() => {
  const { el } = U;
  const SIZES = { '720': [1280, 720], '1080': [1920, 1080], '1440': [2560, 1440] };
  let job = null;

  // ---------------------------------------------------------------- frames
  const visible = (c) => c.clientWidth > 0 && c.clientHeight > 0 && c.width > 0 && c.getClientRects().length > 0;
  const ownBg = (node) => { const c = getComputedStyle(node).backgroundColor; return c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c) ? c : null; };
  const bgOf = (node) => {
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) { const c = ownBg(n); if (c) return c; }
    return Theme.bg;
  };
  const snapCanvas = document.createElement('canvas');
  function snapshot(root) {
    const cvs = [...root.querySelectorAll('canvas')].filter(visible);
    if (!cvs.length) return null;
    const rects = cvs.map((c) => c.getBoundingClientRect());
    const x0 = Math.min(...rects.map((r) => r.left)), y0 = Math.min(...rects.map((r) => r.top));
    const x1 = Math.max(...rects.map((r) => r.right)), y1 = Math.max(...rects.map((r) => r.bottom));
    const s = Math.max(...cvs.map((c, i) => c.width / Math.max(1, rects[i].width)));
    // counters ("generation 120", "living cells 431") are page text: draw them in a strip underneath
    const stats = [...root.querySelectorAll('.pl-stat')].filter((n) => n.getClientRects().length)
      .map((n) => [n.querySelector('span'), n.querySelector('b')]).filter(([a, b]) => a && b).map(([a, b]) => [a.textContent.trim(), b.textContent.trim()]);
    const strip = stats.length ? Math.round(34 * s) : 0;
    const W = Math.round((x1 - x0) * s), H = Math.round((y1 - y0) * s);
    if (snapCanvas.width !== W || snapCanvas.height !== H + strip) { snapCanvas.width = W; snapCanvas.height = H + strip; }
    const ctx = snapCanvas.getContext('2d');
    ctx.fillStyle = bgOf(root);
    ctx.fillRect(0, 0, W, H + strip);
    cvs.forEach((c, i) => {
      const r = rects[i], x = (r.left - x0) * s, y = (r.top - y0) * s, w = r.width * s, h = r.height * s;
      // only a canvas's own CSS background goes under it: overlays stacked on another canvas stay see-through
      const bg = ownBg(c);
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
      ctx.drawImage(c, x, y, w, h);
    });
    if (strip) {
      ctx.textBaseline = 'middle';
      let x = 6 * s;
      const y = H + strip / 2;
      for (const [label, value] of stats) {
        ctx.font = `${11 * s}px system-ui, "Segoe UI", sans-serif`;
        ctx.fillStyle = Theme.muted;
        ctx.fillText(label, x, y);
        x += ctx.measureText(label).width + 6 * s;
        ctx.font = `600 ${14 * s}px system-ui, "Segoe UI", sans-serif`;
        ctx.fillStyle = Theme.text;
        ctx.fillText(value, x, y);
        x += ctx.measureText(value).width + 20 * s;
        if (x > W) break;
      }
    }
    return snapCanvas;
  }

  // Fits `src` into the video frame, centred, with the background colour around it.
  function fitInto(out, src, bg) {
    const ctx = out.getContext('2d');
    const k = Math.min(out.width / src.width, out.height / src.height);
    const w = src.width * k, h = src.height * k;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (out.width - w) / 2, (out.height - h) / 2, w, h);
  }

  // ---------------------------------------------------------------- settings dialog
  // fields: [[label, input, hint?]]; finish: show "end when it finishes"; start: show "start from the beginning"
  function dialog({ title, intro, fields = [], secs = 10, finish = false, start = true }) {
    if (!Video.supported()) { U.toast('Clips need the desktop app, Chrome or Edge'); return Promise.resolve(null); }
    if (job) { U.toast('A clip is already recording'); return Promise.resolve(null); }
    return new Promise((resolve) => {
      const f = {
        secs: el('input', { type: 'number', min: 1, max: 600, step: 1, value: secs }),
        fps: el('select', {}, [24, 30, 60].map((v) => el('option', { value: v }, v + ' fps'))),
        size: el('select', {}, [['1080', '1920 × 1080'], ['720', '1280 × 720'], ['1440', '2560 × 1440'], ['screen', 'As on screen']].map(([v, l]) => el('option', { value: v }, l))),
        fromStart: el('input', { type: 'checkbox' }),
        untilDone: el('input', { type: 'checkbox', checked: true }),
      };
      f.fps.value = '30';
      const row = (label, input, hint) => el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, label), input, hint ? el('span', { class: 'hint' }, hint) : null);
      const back = el('div', { class: 'modal-back' });
      const close = (v) => { back.remove(); resolve(v); };
      const form = el('form', {
        class: 'modal wide',
        onsubmit: (e) => {
          e.preventDefault();
          close({ secs: U.clamp(+f.secs.value || 10, 1, 600), fps: +f.fps.value, size: f.size.value, fromStart: f.fromStart.checked, untilDone: finish && f.untilDone.checked });
        },
        onkeydown: (e) => { if (e.key === 'Escape') close(null); },
      },
        el('div', { class: 'modal-title' }, '🎬 ', title),
        intro ? el('p', { class: 'hint' }, intro) : null,
        el('div', { class: 'grid2' }, row('Length (seconds)', f.secs), row('Frame rate', f.fps)),
        row('Size', f.size),
        ...fields.map(([label, input, hint]) => (input.type === 'checkbox' ? el('label', { class: 'check' }, input, el('span', {}, label)) : row(label, input, hint))),
        start ? el('label', { class: 'check' }, f.fromStart, el('span', {}, 'Reset first (otherwise it carries on from what you see now)')) : null,
        finish ? el('label', { class: 'check' }, f.untilDone, el('span', {}, 'End the clip shortly after it finishes')) : null,
        el('p', { class: 'hint' }, 'Saved as an MP4 video (H.264, plays almost anywhere). It plays at the speed you would see, however long the frames take to make.'),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', onclick: () => close(null) }, 'Cancel'), el('button', { type: 'submit', class: 'primary' }, 'Record')));
      back.append(form);
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
      document.body.append(back);
      f.secs.focus();
    });
  }

  // ---------------------------------------------------------------- recording
  function jobBox(name) {
    const bar = el('i'), text = el('div', { class: 'vj-text' }, 'Starting…');
    const shield = el('div', { class: 'clip-shield' }); // nothing on the page changes while it records
    const box = el('div', { class: 'clip-job' },
      el('div', { class: 'vj-title' }, '🎬 ', name),
      el('div', { class: 'bar' }, bar), text,
      el('div', { class: 'vj-row' }, el('span', { class: 'vj-where' }, 'Esc cancels'), U.el('button', { type: 'button', class: 'small', onclick: () => box.onCancel() }, 'Cancel')));
    document.body.append(shield, box);
    box.set = (t, frac) => { text.textContent = t; bar.style.width = Math.round(frac * 100) + '%'; };
    box.close = () => { shield.remove(); box.remove(); };
    return box;
  }

  const desktop = (k, v) => { try { const d = window.fractalsimDesktop; if (d && d[k]) d[k](v); } catch { /* not the desktop app */ } };

  async function record({ name, secs, fps, size, frame, onEnd }) {
    if (job) return U.toast('A clip is already recording');
    const frames = Math.max(2, Math.round(secs * fps));
    let cancelled = false;
    const box = jobBox(name);
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); cancelled = true; } };
    window.addEventListener('keydown', esc, true);
    box.onCancel = () => { cancelled = true; };
    job = { cancel: () => { cancelled = true; } };
    desktop('keepAwake', true);
    let blob = null, err = null;
    try {
      const first = await frame(0, 0);
      if (!first) throw new Error('nothing to record');
      let [W, H] = SIZES[size] || [first.width, first.height];
      if (!SIZES[size]) { const k = Math.min(1, 3840 / W, 2160 / H); W = Math.round(W * k); H = Math.round(H * k); }
      W &= ~1; H &= ~1;
      const out = Video.makeCanvas(W, H), bg = Theme.bg;
      const t0 = performance.now();
      blob = await Video.record({
        width: W, height: H, fps, frames,
        drawFrame: async (i, t) => {
          const src = i === 0 ? first : await frame(i, t);
          if (!src) return null;
          fitInto(out, src, bg);
          await U.yieldNow(); // let the progress box and the page repaint
          return out;
        },
        isCancelled: () => cancelled,
        onProgress: (frac, i) => {
          const el2 = (performance.now() - t0) / 1000, eta = frac > 0 ? el2 / frac - el2 : 0;
          box.set(`Frame ${i + 1} / ${frames} · about ${eta > 90 ? Math.round(eta / 60) + ' min' : Math.round(eta) + ' s'} left`, frac);
        },
      });
    } catch (e) {
      err = e && e.message ? e.message : String(e);
    } finally {
      window.removeEventListener('keydown', esc, true);
      box.close();
      job = null;
      desktop('keepAwake', false);
      desktop('taskDone');
      try { if (onEnd) onEnd(); } catch { /* restoring must not hide the result */ }
    }
    if (blob) {
      U.download(blob, `${U.safeName(name.replace(/π/g, 'pi'))}.mp4`);
      U.toast('Clip saved');
    } else if (err) U.toast(err === 'cancelled' ? 'Clip cancelled' : 'Clip failed: ' + err);
  }

  return { dialog, record, snapshot, get busy() { return !!job; }, cancel: () => job && job.cancel() };
})();

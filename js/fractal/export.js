// Fractal explorer — export and sharing, the mini-map, bookmarks and the vector generator preview.

// ---------------------------------------------------------------- export / share
function exportSize() {
  const presets = { '1080': [1920, 1080], '1440': [2560, 1440], '4k': [3840, 2160], '8k': [7680, 4320], square: [4096, 4096] };
  if (S.exportPreset === 'screen') {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return [Math.round(stage.clientWidth * dpr), Math.round(stage.clientHeight * dpr)];
  }
  if (S.exportPreset === 'custom') return [U.clamp(Math.round(S.exportW), 16, 16384), U.clamp(Math.round(S.exportH), 16, 16384)];
  return presets[S.exportPreset];
}

function setProgress(frac, label) {
  const p = $('#progress');
  if (frac == null) { p.hidden = true; return; }
  p.hidden = false;
  p.querySelector('.bar > i').style.width = Math.round(frac * 100) + '%';
  p.querySelector('span').textContent = label || `Rendering… ${Math.round(frac * 100)}%`;
}

function exportSVG() {
  const [w, h] = exportSize();
  const svg = Vec.toSVG(S.def, HP.approx(S.pv), w, h, h / Math.max(1, stage.clientHeight));
  U.download(new Blob([svg], { type: 'image/svg+xml' }), `${U.safeName(S.def.name)}.svg`);
  U.toast('Saved SVG');
}

let exporting = false;
async function exportPNG() {
  if (exporting) return;
  exporting = true;
  const [w, h] = exportSize();
  const def = clone(S.def);
  const name = `${U.safeName(def.name)}-${w}x${h}.png`;
  setProgress(0);
  desktop.keepAwake(true);
  try {
    let cv;
    if (def.type === '3d') {
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const r = new F3D.Renderer(cv, { preserve: true });
      try {
        await F3D.drawStrips(r, def, def.camera, (f) => setProgress(f));
        setProgress(1, 'Encoding PNG…');
        await U.yieldNow();
        const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
        if (!blob) throw new Error('image too large for this browser');
        U.download(blob, name);
      } finally {
        r.dispose();
      }
    } else if (def.type === 'vector') {
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      setProgress(0.5, 'Drawing arcs…');
      await U.yieldNow();
      // Line widths scale with the image so it looks like the screen, just sharper.
      Vec.draw(cv.getContext('2d'), def, HP.approx(S.pv), w, h, h / Math.max(1, stage.clientHeight));
      setProgress(1, 'Encoding PNG…');
      await U.yieldNow();
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (!blob) throw new Error('image too large for this browser');
      U.download(blob, name);
    } else if (def.type === 'escape') {
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const r = new EscapeGL.EscapeRenderer(cv, true);
      try {
        const maxDim = r.gl.getParameter(r.gl.MAX_VIEWPORT_DIMS);
        if (w > maxDim[0] || h > maxDim[1]) throw new Error(`this GPU supports up to ${maxDim[0]}×${maxDim[1]}`);
        const aa = S.exportAA;
        const maxIter = effIter();
        if (S.pv.L < EscapeGL.DEEP_L) {
          setProgress(0, 'Computing reference orbit…');
          await U.yieldNow();
        }
        await r.drawFull(def, S.pv, { aa, time: S.time, maxIter, adaptive: S.smartAA, onProgress: (f) => setProgress(f) });
        setProgress(1, 'Encoding PNG…');
        await U.yieldNow();
        const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
        if (!blob) throw new Error('image too large for this browser');
        U.download(blob, name);
      } finally {
        r.dispose();
      }
    } else {
      if (w * h > 3840 * 2160 * 1.05) throw new Error('IFS and attractor exports are limited to 4K (memory)');
      const st = IFS.createAccum(w, h);
      IFS.reset(st, def.view, IFS.prepare(def));
      const target = w * h * Math.max(S.ifsQuality, 40);
      while (st.total < target) {
        const t0 = performance.now();
        while (performance.now() - t0 < 40 && st.total < target) IFS.iterate(st, 50000);
        setProgress(st.total / target);
        await U.yieldNow();
      }
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(w, h);
      IFS.toImage(st, def, img);
      ctx.putImageData(img, 0, 0);
      setProgress(1, 'Encoding PNG…');
      await U.yieldNow();
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      U.download(blob, name);
    }
    U.toast(`Saved ${name}`);
  } catch (e) {
    U.toast('Export failed: ' + e.message);
  } finally {
    setProgress(null);
    exporting = false;
    desktop.keepAwake(false);
    desktop.taskDone();
  }
}

const encodeDef = (def) => btoa(unescape(encodeURIComponent(JSON.stringify(def))));

function decodeShare(text) {
  const m = /(?:#f=|fractalsim:|mathsim:)([A-Za-z0-9+/=]+)/.exec(String(text || '').trim()) || /^([A-Za-z0-9+/=]{20,})$/.exec(String(text || '').trim());
  if (!m) return null;
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    return d && KNOWN_TYPES.includes(d.type) ? d : null;
  } catch {
    return null;
  }
}

function shareLink() {
  const code = encodeDef(S.def);
  // In the desktop app a file:// link is useless to others, so share a paste-able code instead.
  const text = DESKTOP ? 'mathsim:' + code : location.href.split('#')[0] + '#f=' + code;
  if (!DESKTOP) history.replaceState(null, '', text);
  const what = DESKTOP ? 'Share code' : 'Link';
  const fallback = () => U.ask(`Copy this ${what.toLowerCase()}`, text);
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => U.toast(`${what} copied — paste it into Library › Open code`), fallback);
  else fallback();
}

async function openCode() {
  const text = await U.ask('Paste a share code or link', '');
  if (text == null) return;
  const d = decodeShare(text);
  if (!d) return U.toast('That is not a valid Mathsim code');
  loadDef(d);
}

const readHash = () => decodeShare(location.hash);

// ---------------------------------------------------------------- mini-map
const mm = { base: null, timer: 0, hp: null, hpKey: '' };

function minimapBase() {
  clearTimeout(mm.timer);
  mm.base = null;
  minimapOverlay();
  if (!S.def || isThree()) return;
  mm.timer = setTimeout(() => {
    const url = Thumbs.make(Defs.normalize(Object.assign({}, S.def, { view: S.homeView })));
    if (!url) return;
    const img = new Image();
    img.onload = () => { mm.base = img; minimapOverlay(); };
    img.src = url;
  }, 300);
}

function minimapOverlay() {
  const box = $('#minimap'), cv = $('#minimap-canvas');
  const show = !!(S.showMinimap && S.def && !isThree() && mm.base && S.homeView);
  box.hidden = !show;
  if (!show) return;
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
  const key = JSON.stringify(S.homeView);
  if (mm.hpKey !== key) { mm.hp = HP.fromView(S.homeView); mm.hpKey = key; }
  const hp = mm.hp;
  ctx.drawImage(mm.base, 0, 0, W, H);
  const d = HP.diff(S.pv, hp); // current centre relative to the home view, in home units
  const ch = Math.cos(hp.rot), sh = Math.sin(hp.rot);
  const toMM = (x, y) => [W / 2 + (x * ch + y * sh) * (H / 2), H / 2 - (-x * sh + y * ch) * (H / 2)];
  const k = 2 ** (S.pv.L - hp.L), a = aspect();
  const cr = Math.cos(S.pv.rot), sr = Math.sin(S.pv.rot);
  const pts = [[-a, -1], [a, -1], [a, 1], [-a, 1]].map(([x, y]) => toMM(d[0] + (x * cr - y * sr) * k, d[1] + (x * sr + y * cr) * k));
  const size = Math.max(...pts.map((p) => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])));
  const dpr = W / 200;
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3 * dpr;
  ctx.beginPath();
  if (size < 8 * dpr) {
    // Too deep to draw the rectangle: mark the spot instead.
    const [x, y] = toMM(d[0], d[1]);
    ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2);
    ctx.moveTo(x - 10 * dpr, y); ctx.lineTo(x - 3 * dpr, y); ctx.moveTo(x + 3 * dpr, y); ctx.lineTo(x + 10 * dpr, y);
    ctx.moveTo(x, y - 10 * dpr); ctx.lineTo(x, y - 3 * dpr); ctx.moveTo(x, y + 3 * dpr); ctx.lineTo(x, y + 10 * dpr);
  } else {
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  $('#minimap-label').textContent = 'zoom ×' + HP.magString(S.pv.L);
}

function bindMinimap() {
  const cv = $('#minimap-canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(200 * dpr);
  cv.height = Math.round(125 * dpr);
  cv.addEventListener('pointerdown', (e) => {
    if (!mm.hp) return;
    const r = cv.getBoundingClientRect();
    const qx = ((e.clientX - r.left) / r.width * 2 - 1) * (r.width / r.height), qy = -((e.clientY - r.top) / r.height * 2 - 1);
    const p = HP.pointAt(mm.hp, qx, qy);
    HP.setP(p, S.pv.P);
    S.pv.x = p.x;
    S.pv.y = p.y;
    viewChanged();
  });
}

// ---------------------------------------------------------------- bookmarks (spots inside the current fractal)
// Saved automatically, per fractal: built-ins by name, library items by id, anything else by the shape
// of its formula/rules. Library items also get the bookmarks written into their entry.
const BM_KEY = 'fractalsim.bookmarks.v1';
const bmStore = () => { try { return JSON.parse(localStorage.getItem(BM_KEY)) || {}; } catch { return {}; } };

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function bookmarkKey(d, libId, activeId) {
  if (libId) return 'lib:' + libId;
  if (activeId) return activeId;
  const core = d.type === 'ifs' ? d.transforms.map((t) => [t.a, t.b, t.c, t.d, t.e, t.f])
    : d.type === 'vector' ? [d.kind, d.split, d.circle, d.star, d.motif, d.bulge, d.seeds, d.rules]
      : d.type === '3d' ? [d.kind, d.power, d.julia, d.juliaC, d.boxScale, d.cW, d.kScale, d.kAngle]
        : d.type === 'attractor' ? [d.kind, d.a, d.b, d.c, d.d, d.yaw, d.pitch]
        : [d.formula, d.init, d.julia, d.juliaC, d.k];
  return 'def:' + d.type + ':' + hashStr(JSON.stringify(core));
}

// On load: stored bookmarks for this fractal, plus any carried inside its definition (e.g. from an
// imported library file) that aren't already stored.
function restoreBookmarks(d) {
  const stored = bmStore()[S.bmKey] || [];
  const key = (b) => JSON.stringify([b.name, b.view || b.camera]);
  const have = new Set(stored.map(key));
  d.bookmarks = [...stored, ...(d.bookmarks || []).filter((b) => !have.has(key(b)))];
}

function persistBookmarks() {
  if (!S.def || !S.bmKey) return;
  const st = bmStore();
  if (S.def.bookmarks.length) st[S.bmKey] = S.def.bookmarks;
  else delete st[S.bmKey];
  try {
    localStorage.setItem(BM_KEY, JSON.stringify(st));
  } catch {
    U.toast('Could not save bookmarks — browser storage is full');
  }
  if (S.libId) {
    const items = Library.load();
    const it = items.find((x) => x.id === S.libId);
    if (it) { it.def.bookmarks = clone(S.def.bookmarks); Library.save(items); }
  }
}

// Small JPEG thumbnail (keeps storage use low: ~3 KB per bookmark).
function shrinkThumb(url, cb) {
  if (!url) return cb(null);
  const img = new Image();
  img.onload = () => {
    const c = el('canvas', { width: 96, height: 60 });
    c.getContext('2d').drawImage(img, 0, 0, 96, 60);
    cb(c.toDataURL('image/jpeg', 0.75));
  };
  img.onerror = () => cb(null);
  img.src = url;
}

function addBookmark() {
  if (!S.def) return;
  const n = S.def.bookmarks.length + 1;
  const b = isThree() ? { name: `Spot ${n}`, camera: clone(S.def.camera) } : { name: `Spot ${n}`, view: clone(S.def.view) };
  const def = S.def;
  S.def.bookmarks.push(b);
  persistBookmarks();
  renderBookmarks();
  U.toast('Bookmarked — saved automatically');
  shrinkThumb(Thumbs.make(Defs.normalize(Object.assign({}, S.def, isThree() ? { camera: b.camera } : { view: b.view }))), (t) => {
    b.thumb = t;
    if (S.def === def) { persistBookmarks(); renderBookmarks(); }
  });
}

function gotoBookmark(b) {
  stopTour();
  if (b.camera) { S.def.camera = clone(b.camera); C.sync('cam'); mark3d(); return; }
  setView(b.view);
  viewChanged();
}

function renderBookmarks() {
  const list = $('#bm-list');
  if (!list || !S.def) return;
  const bms = S.def.bookmarks;
  list.replaceChildren(...(bms.length ? bms.map((b, i) => el('div', { class: 'bm' },
    el('img', { src: b.thumb || '', alt: '', onclick: () => gotoBookmark(b), title: 'Go there' }),
    el('button', { type: 'button', class: 'bm-name', onclick: () => gotoBookmark(b) }, b.name),
    btn('✎', async () => { const v = await U.ask('Bookmark name', b.name); if (v) { b.name = v; persistBookmarks(); renderBookmarks(); } }, 'icon', 'Rename'),
    btn('×', () => { bms.splice(i, 1); persistBookmarks(); renderBookmarks(); }, 'icon danger', 'Remove'))) : [el('p', { class: 'hint' }, 'No bookmarks yet. Press B or the button above to remember the current spot.')]));
}

// ---------------------------------------------------------------- vector generator editor
function drawGenPreview() {
  const cv = $('#gen-preview');
  if (!cv || !isRules()) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cv.clientWidth * dpr) || 600, h = Math.round(cv.clientHeight * dpr) || 240;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  Vec.drawGenerator(cv.getContext('2d'), S.def, w, h);
}

function rulesEditor() {
  const seedsList = el('div', { class: 'rule-list' }), rulesList = el('div', { class: 'rule-list' });
  const numIn = (obj, key) => {
    const inp = el('input', { type: 'number', step: '0.05', class: 'num', value: U.fmtNum(obj[key], 6) });
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) { obj[key] = v; changed('vector'); } });
    return inp;
  };
  function rebuild() {
    if (!isRules()) return;
    seedsList.replaceChildren(...S.def.seeds.map((s, i) => el('div', { class: 'rule-row' },
      el('span', { class: 'rule-i' }, i + 1), numIn(s, 0), numIn(s, 1), el('span', { class: 'rule-arrow' }, '→'), numIn(s, 2), numIn(s, 3),
      btn('×', () => { if (S.def.seeds.length <= 1) return; S.def.seeds.splice(i, 1); rebuild(); changed('vector'); }, 'icon danger', 'Remove'))));
    rulesList.replaceChildren(...S.def.rules.map((r, i) => {
      const flip = el('input', { type: 'checkbox' });
      flip.checked = !!r.flip;
      flip.addEventListener('change', () => { r.flip = flip.checked; changed('vector'); });
      return el('div', { class: 'rule-row' },
        el('span', { class: 'rule-i' }, i + 1), numIn(r, 'x0'), numIn(r, 'y0'), el('span', { class: 'rule-arrow' }, '→'), numIn(r, 'x1'), numIn(r, 'y1'),
        el('label', { class: 'rule-flip', title: 'Mirror this child to the other side' }, flip, 'flip'),
        btn('×', () => { S.def.rules.splice(i, 1); rebuild(); changed('vector'); }, 'icon danger', 'Remove'));
    }));
  }
  C.add({ sync: rebuild });
  return {
    seeds: el('div', {}, el('p', { class: 'hint' }, 'Starting pieces, as start → end points (x, y).'), seedsList,
      el('div', { class: 'btn-row' }, btn('+ Add piece', () => { S.def.seeds.push([-1, -0.5, 1, -0.5]); rebuild(); changed('vector'); }))),
    rules: el('div', {}, el('p', { class: 'hint' }, 'Each piece runs from (0,0) to (1,0); y points to its left. A rule places one smaller copy by its start → end point. Children must be shorter than 1 or the fractal grows forever.'), rulesList,
      el('div', { class: 'btn-row' }, btn('+ Add rule', () => { S.def.rules.push({ x0: 0, y0: 0, x1: 0.5, y1: 0.3, flip: false }); rebuild(); changed('vector'); }))),
  };
}

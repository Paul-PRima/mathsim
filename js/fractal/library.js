// Fractal explorer — zoom videos and the fractal library (saving, importing, thumbnails, cards).

// ---------------------------------------------------------------- zoom video
function videoDialog() {
  if (!Video.supported()) return U.toast('Video export needs the desktop app, Chrome or Edge');
  if (videoJob) return U.toast('A video is already rendering — see the box in the corner');
  const three = isThree();
  const homeL = HP.parseLog2(S.homeView ? S.homeView.scale : 1.5);
  const f = {
    secs: el('input', { type: 'number', min: 1, max: 600, step: 1, value: 12 }),
    fps: el('select', {}, [24, 30, 60].map((v) => el('option', { value: v }, v + ' fps'))),
    size: el('select', {}, [['720', '1280 × 720'], ['1080', '1920 × 1080'], ['1440', '2560 × 1440'], ['4k', '3840 × 2160 (slow)'], ['screen', 'Screen size']].map(([v, l]) => el('option', { value: v }, l))),
    start: el('input', { type: 'text', class: 'mono', value: three ? '5' : HP.magString(Math.max(homeL, S.pv.L + 1)) }),
    spin: el('input', { type: 'number', step: 5, value: three ? 120 : 0 }),
    smooth: el('input', { type: 'checkbox' }),
    aa: el('select', {}, [[1, 'Off (faster)'], [2, '2×2']].map(([v, l]) => el('option', { value: v }, l))),
    detail: el('select', {}, [[1, 'Full'], [0.75, '75% — about 1.8× faster'], [0.5, '50% — about 4× faster (softer)']].map(([v, l]) => el('option', { value: v }, l))),
  };
  f.fps.value = '30';
  f.size.value = '1080';
  f.smooth.checked = true;
  const row = (label, input, hint) => el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, label), input, hint ? el('span', { class: 'hint' }, hint) : null);
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  const form = el('form', { class: 'modal wide', onsubmit: (e) => {
    e.preventDefault();
    const [w, h] = { '720': [1280, 720], '1080': [1920, 1080], '1440': [2560, 1440], '4k': [3840, 2160] }[f.size.value] || exportSize();
    const opts = { secs: U.clamp(+f.secs.value || 10, 1, 600), fps: +f.fps.value, w, h, start: f.start.value, spin: +f.spin.value || 0, smooth: f.smooth.checked, aa: +f.aa.value, detail: +f.detail.value || 1 };
    close();
    recordVideo(opts);
  } },
    el('div', { class: 'modal-title' }, '🎬 Zoom video'),
    el('p', { class: 'hint' }, three
      ? 'Flies in from far away to the current camera, optionally orbiting around the fractal.'
      : 'Zooms from the start zoom into exactly what you see now. Go to the spot you want to end on first.'),
    el('div', { class: 'grid2' }, row('Length (seconds)', f.secs), row('Frame rate', f.fps)),
    row('Size', f.size),
    three ? row('Start this many times farther away', f.start) : row('Start at zoom ×', f.start, 'Ends at ×' + HP.magString(S.pv.L)),
    row(three ? 'Orbit during the video (°)' : 'Rotate during the video (°)', f.spin),
    el('label', { class: 'check' }, f.smooth, el('span', {}, 'Ease in and out')),
    isEsc() ? row('Anti-aliasing', f.aa) : null,
    isEsc() || three ? row('Render detail', f.detail, 'Frames are rendered smaller and scaled up to the video size') : null,
    el('p', { class: 'hint' }, 'Saved as an MP4 video (H.264, plays almost anywhere). Deep zooms can take a while — you can cancel at any time.'),
    el('div', { class: 'btn-row' }, el('button', { type: 'button', onclick: close }, 'Cancel'), el('button', { type: 'submit', class: 'primary' }, 'Record')));
  back.append(form);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
}

// Videos render in the background: in a worker with an OffscreenCanvas when possible (the app stays
// fully usable), otherwise on this page in small chunks. Progress shows in a small corner box.
let videoJob = null;

function videoJobBox(name) {
  const bar = el('i');
  const text = el('div', { class: 'vj-text' }, 'Starting…');
  const box = el('div', { id: 'video-job' },
    el('div', { class: 'vj-title' }, '🎬 ', name),
    el('div', { class: 'bar' }, bar), text,
    el('div', { class: 'vj-row' }, el('span', { class: 'vj-where' }), btn('Cancel', () => box.onCancel && box.onCancel(), 'small')));
  stage.append(box);
  box.set = (t, frac) => {
    text.textContent = t;
    if (frac != null) bar.style.width = Math.round(frac * 100) + '%';
  };
  box.where = (t) => { box.querySelector('.vj-where').textContent = t; };
  return box;
}

function recordVideo(o) {
  if (videoJob) return U.toast('A video is already rendering');
  stopTour();
  const def = clone(S.def);
  const job = {
    def, view: HP.toView(S.pv), o,
    autoIter: S.autoIter, smartAA: S.smartAA, time: S.time,
    pxScale: o.h / Math.max(1, stage.clientHeight),
  };
  const box = videoJobBox(def.name || 'Zoom video');
  let cancelled = false, worker = null;
  videoJob = { box };
  desktop.keepAwake(true); // keep going if the window is minimized or the PC is left alone
  const finish = (blob, err) => {
    if (worker) worker.terminate();
    box.remove();
    videoJob = null;
    desktop.keepAwake(false);
    desktop.taskDone();
    if (blob) {
      U.download(blob, `${U.safeName(def.name)}-zoom.mp4`);
      U.toast('Video saved');
    } else if (err) U.toast(err === 'cancelled' ? 'Video cancelled' : 'Video failed: ' + err);
  };
  // Fallback: same renderer on this page, yielding regularly so the UI keeps working.
  const runHere = async () => {
    if (worker) { worker.terminate(); worker = null; }
    box.where('on this page');
    box.onCancel = () => { cancelled = true; };
    try {
      const blob = await Video.renderZoom(job, { onStatus: box.set, isCancelled: () => cancelled });
      finish(blob);
    } catch (e) {
      finish(null, e.message);
    }
  };
  try {
    worker = new Worker('js/videoworker.js');
  } catch {
    worker = null;
  }
  if (!worker) return runHere();
  box.where('in the background');
  box.onCancel = () => { cancelled = true; worker.postMessage({ cmd: 'cancel' }); };
  worker.onerror = (ev) => { ev.preventDefault(); if (!cancelled) runHere(); else finish(null, 'cancelled'); };
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'progress') box.set(m.text, m.frac);
    else if (m.type === 'done') finish(m.blob);
    else if (m.type === 'unsupported') runHere();
    else if (m.type === 'error') finish(null, m.message);
  };
  worker.postMessage({ cmd: 'start', job });
}

// ---------------------------------------------------------------- library
function allItems() {
  // Ids are name-based so favourites survive new presets being added.
  const builtins = Defs.BUILTINS.map((d) => ({ id: 'b:' + d.name, name: d.name, def: d, builtin: true, thumb: builtinThumbs['b:' + d.name] }));
  return { builtins, mine: Library.load() };
}

function saveToLibrary(asNew) {
  const items = Library.load();
  const def = clone(S.def);
  const thumb = Thumbs.make(Defs.normalize(def));
  if (!asNew && S.libId) {
    const it = items.find((x) => x.id === S.libId);
    if (it) {
      Object.assign(it, { def, name: def.name, thumb, updated: Date.now() });
      if (Library.save(items)) U.toast(`Updated “${def.name}”`);
      renderLibrary();
      return;
    }
  }
  const it = { id: U.uid(), name: def.name, def, thumb, created: Date.now(), updated: Date.now() };
  items.unshift(it);
  if (Library.save(items)) {
    S.libId = it.id;
    S.activeId = it.id;
    S.bmKey = 'lib:' + it.id; // bookmarks now follow the library entry
    persistBookmarks();
    U.toast(`Saved “${def.name}” to your library`);
  }
  C.sync('save');
  renderLibrary();
}

function exportLibrary() {
  const items = Library.load();
  if (!items.length) return U.toast('Your library is empty');
  const blob = new Blob([JSON.stringify({ app: 'mathsim', version: 1, items }, null, 1)], { type: 'application/json' });
  U.download(blob, 'mathsim-library.json');
}

async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    let list = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [data];
    list = list.map((x) => (x && x.def ? x : { def: x })).filter((x) => x.def && KNOWN_TYPES.includes(x.def.type));
    if (!list.length) throw new Error('no fractals found');
    const items = Library.load();
    for (const x of list.reverse()) {
      const def = Defs.normalize(x.def);
      items.unshift({ id: U.uid(), name: x.name || def.name, def, thumb: x.thumb || null, created: Date.now(), updated: Date.now() });
    }
    Library.save(items);
    U.toast(`Imported ${list.length} fractal${list.length > 1 ? 's' : ''}`);
    S.libFilter = 'mine';
    C.sync('lib');
    renderLibrary();
  } catch (e) {
    U.toast('Import failed: ' + e.message);
  }
}

const thumbQueue = [];
const queued = new Set();
let thumbBusy = false;
function queueThumbs(items) {
  for (const it of items) if (!it.thumb && !queued.has(it.id)) { queued.add(it.id); thumbQueue.push(it); }
  pumpThumbs();
}
function pumpThumbs() {
  if (thumbBusy || !thumbQueue.length) return;
  thumbBusy = true;
  setTimeout(() => {
    const it = thumbQueue.shift();
    queued.delete(it.id);
    const url = Thumbs.make(Defs.normalize(it.def));
    if (url) {
      if (it.builtin) builtinThumbs[it.id] = url;
      else {
        const items = Library.load();
        const found = items.find((x) => x.id === it.id);
        if (found) { found.thumb = url; Library.save(items); }
      }
      const t = document.querySelector(`.card[data-id="${it.id}"] .thumb`);
      if (t) t.replaceChildren(el('img', { src: url, alt: '' }));
    }
    thumbBusy = false;
    pumpThumbs();
  }, 20);
}

function libCard(item) {
  const typeLabel = TYPE_LABEL[item.def.type] || (item.def.julia ? 'Julia' : 'Escape-time');
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const fav = Library.favs().has(item.id);
  const favBtn = el('button', {
    type: 'button', class: 'fav' + (fav ? ' on' : ''), title: fav ? 'Remove from favourites' : 'Add to favourites',
    onclick: stop(() => { Library.toggleFav(item.id); renderLibrary(); }),
  }, fav ? '★' : '☆');
  const tags = item.tags && item.tags.length ? el('div', { class: 'card-tags' }, item.tags.map((t) => '#' + t).join(' ')) : null;
  const actions = item.builtin ? null : el('div', { class: 'card-actions' },
    btn('#', stop(async () => {
      const v = await U.ask('Tags, separated by commas (e.g. favourite spots, blue, deep)', (item.tags || []).join(', '));
      if (v == null) return;
      const items = Library.load();
      const f = items.find((x) => x.id === item.id);
      if (f) { f.tags = [...new Set(v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]; Library.save(items); }
      renderLibrary();
    }), 'icon', 'Tags'),
    btn('✎', stop(async () => {
      const name = await U.ask('Rename fractal', item.name);
      if (!name) return;
      const items = Library.load();
      const f = items.find((x) => x.id === item.id);
      if (f) { f.name = name; f.def.name = name; Library.save(items); }
      if (S.libId === item.id) { S.def.name = name; updateHeader(); C.sync('name'); }
      renderLibrary();
    }), 'icon', 'Rename'),
    btn('⧉', stop(() => {
      const items = Library.load();
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx < 0) return;
      const copy = clone(items[idx]);
      copy.id = U.uid();
      copy.name += ' copy';
      copy.def.name = copy.name;
      items.splice(idx + 1, 0, copy);
      Library.save(items);
      renderLibrary();
    }), 'icon', 'Duplicate'),
    btn('🗑', stop(() => {
      if (!window.confirm(`Delete “${item.name}” from your library?`)) return;
      Library.save(Library.load().filter((x) => x.id !== item.id));
      if (S.libId === item.id) { S.libId = null; C.sync('save'); }
      renderLibrary();
    }), 'icon danger', 'Delete'));
  const open = () => loadDef(item.def, { libId: item.builtin ? null : item.id, activeId: item.id });
  return el('div', {
    class: 'card' + (S.activeId === item.id ? ' active' : ''), 'data-id': item.id, tabindex: 0, role: 'button',
    onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); },
  },
    el('div', { class: 'thumb' }, item.thumb ? el('img', { src: item.thumb, alt: '' }) : el('div', { class: 'thumb-ph' })),
    el('div', { class: 'card-body' }, el('div', { class: 'card-name', title: item.name }, item.name), el('div', { class: 'card-meta' }, typeLabel), tags),
    favBtn,
    actions);
}

function renderLibrary() {
  if (!S.libBuilt) return;
  const grid = $('#lib-grid');
  const { builtins, mine } = allItems();
  const favs = Library.favs();
  const q = S.libSearch;
  const text = (it) => [it.name, it.def.formula || '', (it.tags || []).join(' '), Defs.categoryOf(it.def), TYPE_LABEL[it.def.type] || ''].join(' ').toLowerCase();
  const match = (it) => (!q || text(it).includes(q)) && (!S.libTag || (it.tags || []).includes(S.libTag));
  // tag chips (from your saved fractals)
  const allTags = [...new Set(mine.flatMap((x) => x.tags || []))].sort();
  if (S.libTag && !allTags.includes(S.libTag)) S.libTag = '';
  $('#lib-tags').replaceChildren(...(allTags.length ? [el('span', { class: 'hint' }, 'Tags'),
    ...allTags.map((t) => btn('#' + t, () => { S.libTag = S.libTag === t ? '' : t; renderLibrary(); }, 'chip' + (S.libTag === t ? ' on' : '')))] : []));
  const kids = [];
  const shown = [];
  const section = (title, list, emptyMsg) => {
    const l = list.filter(match);
    if (!l.length && !emptyMsg) return;
    kids.push(el('div', { class: 'lib-section' }, title, el('span', {}, String(l.length))));
    if (!l.length) kids.push(el('p', { class: 'lib-empty' }, q || S.libTag ? 'No matches.' : emptyMsg));
    l.forEach((it) => { kids.push(libCard(it)); shown.push(it); });
  };
  if (S.libFilter === 'fav') {
    section('★ Favourites', [...mine, ...builtins].filter((it) => favs.has(it.id)), 'No favourites yet — click the ☆ on any fractal.');
  } else {
    if (S.libFilter !== 'builtin') section('My fractals', mine, 'Nothing saved yet — use “Save to library” in the Render or Maker tab.');
    if (S.libFilter !== 'mine' && !S.libTag) {
      for (const cat of Defs.CATEGORY_ORDER) section(cat, builtins.filter((b) => Defs.categoryOf(b.def) === cat), '');
    }
  }
  if (!kids.length) kids.push(el('p', { class: 'lib-empty' }, 'No matches.'));
  grid.replaceChildren(...kids);
  queueThumbs(shown);
}

function markLibraryActive() {
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('active', c.dataset.id === S.activeId));
}

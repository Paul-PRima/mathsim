// App shell: the navigation rail, the home page, settings (language, theme, size), the command palette and
// switching between modules (calculator, grapher, …). Modules register themselves with Shell.register(); each
// builds its page the first time it is opened. Modules can offer functions to each other through Shell.api.

// Colours for drawings on <canvas>, following the light / dark theme.
const Theme = (() => {
  const DARK = { light: false, bg: '#0c0e13', grid: 'rgba(255,255,255,0.035)', gridMajor: 'rgba(255,255,255,0.09)', axis: 'rgba(255,255,255,0.55)', text: '#e8eaf0', label: 'rgba(232,234,240,0.7)', muted: '#8a90a0', frame: '#3d4353', halo: '#0c0e13', panel: 'rgba(16,18,24,0.92)' };
  const LIGHT = { light: true, bg: '#ffffff', grid: 'rgba(0,0,0,0.05)', gridMajor: 'rgba(0,0,0,0.13)', axis: 'rgba(0,0,0,0.6)', text: '#1b1f27', label: 'rgba(27,31,39,0.75)', muted: '#5f6676', frame: '#b9bfcb', halo: '#ffffff', panel: 'rgba(255,255,255,0.95)' };
  const listeners = [];
  const T = Object.assign({}, DARK);
  T.set = (light) => { Object.assign(T, light ? LIGHT : DARK); listeners.forEach((f) => f()); };
  T.onChange = (f) => listeners.push(f);
  return T;
})();

const Shell = (() => {
  const { el } = U;
  const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICONS = {
    home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3" rx="0.5"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>'),
    graph: svg('<path d="M4 3v18h17"/><path d="M6 17c3-9 6-11 8-6s4 3 6-4"/>'),
    stats: svg('<path d="M4 20h17"/><rect x="5" y="12" width="3" height="8"/><rect x="10.5" y="6" width="3" height="14"/><rect x="16" y="9" width="3" height="11"/>'),
    matrix: svg('<path d="M7 4H4v16h3M17 4h3v16h-3"/><path d="M8.5 9h.01M12 9h.01M15.5 9h.01M8.5 15h.01M12 15h.01M15.5 15h.01"/>'),
    tools: svg('<path d="M4 7h7M7.5 3.5v7"/><path d="M14 6h6"/><path d="M4.5 15.5l5 5M9.5 15.5l-5 5"/><path d="M14 16h6M14 20h6"/>'),
    surface: svg('<path d="M3 15c3-1 4-6 9-6s6 5 9 6"/><path d="M3 15l9 5 9-5"/><path d="M12 9v11"/>'),
    geometry: svg('<path d="M4 19 12 4l8 15z"/><circle cx="12" cy="13.5" r="4.2"/><circle cx="12" cy="4" r="1.2"/>'),
    probability: svg('<rect x="3.5" y="8" width="10" height="10" rx="2"/><path d="M7 11h.01M10 15h.01"/><rect x="11" y="4" width="9" height="9" rx="2"/><path d="M14 7h.01M17 10h.01"/>'),
    practice: svg('<path d="M4 5h12v14H4z"/><path d="M7 9h6M7 12.5h4"/><path d="m13 17 2 2 5-6"/>'),
    simulations: svg('<rect x="4" y="4" width="4" height="4"/><rect x="10" y="4" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/><rect x="4" y="16" width="4" height="4"/><rect x="10" y="16" width="4" height="4"/>'),
    fractals: svg('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  };

  const mods = new Map();
  let current = null;
  const KEY = 'mathsim.module';
  const api = {}; // functions sections offer each other, e.g. api.graph.add(['y = x^2'])

  const pendingCmds = {};
  function register(id, m) {
    mods.set(id, Object.assign({ id, icon: ICONS[id] || ICONS.tools, built: false, order: mods.size, commands: [] }, m));
    if (pendingCmds[id]) mods.get(id).commands = mods.get(id).commands.concat(pendingCmds[id]);
  }
  // extra palette commands for a section (it may register later)
  function addCommands(id, list) {
    if (mods.has(id)) mods.get(id).commands = mods.get(id).commands.concat(list);
    else pendingCmds[id] = (pendingCmds[id] || []).concat(list);
  }
  const ordered = () => [...mods.values()].sort((a, b) => a.order - b.order);

  function open(id) {
    const m = mods.get(id) || mods.get('home');
    if (current === m.id) return m;
    const prev = current && mods.get(current);
    if (prev && prev.onHide) prev.onHide();
    for (const x of mods.values()) x.root().hidden = x !== m;
    document.querySelectorAll('#rail .rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === m.id));
    current = m.id;
    if (!m.built) {
      m.built = true;
      if (m.init) m.init(m.root());
      if (typeof C !== 'undefined') C.sync(); // show the current settings in the controls just created
    }
    if (m.onShow) m.onShow();
    if (m.id !== 'fractals') document.title = I18n.t(m.label) + ' · Mathsim';
    try { localStorage.setItem(KEY, m.id); } catch { /* storage blocked */ }
    return m;
  }
  const isActive = (id) => current === id;

  // ---------------------------------------------------------------- settings
  const SKEY = 'mathsim.settings';
  const settings = { lang: 'en', theme: 'dark', scale: 1 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY)) || {}); } catch { /* defaults */ }
  const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* storage blocked */ } };
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const light = settings.theme === 'light' || (settings.theme === 'system' && darkQuery && !darkQuery.matches);
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    Theme.set(light);
  }
  function applyScale() {
    const z = U.clamp(+settings.scale || 1, 0.7, 1.6);
    const desk = window.fractalsimDesktop && window.fractalsimDesktop.setZoom;
    if (desk) window.fractalsimDesktop.setZoom(z); // real page zoom in the desktop app
    else document.documentElement.style.zoom = z === 1 ? '' : String(z);
  }
  function applyAll() {
    applyTheme();
    applyScale();
    I18n.setLang(settings.lang);
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => settings.theme === 'system' && applyTheme());

  function openSettings() {
    const seg = (options, key, after) => {
      const box = el('div', { class: 'seg' });
      const paint = () => box.replaceChildren(...options.map(([v, l]) => el('button', { type: 'button', class: settings[key] === v ? 'on' : '', onclick: () => { settings[key] = v; saveSettings(); after(); paint(); } }, l)));
      paint();
      return box;
    };
    const size = el('input', { type: 'range', min: 0.8, max: 1.5, step: 0.05, value: settings.scale });
    const sizeLabel = el('span', { class: 'mono' }, Math.round(settings.scale * 100) + ' %');
    size.addEventListener('input', () => { settings.scale = +size.value; sizeLabel.textContent = Math.round(settings.scale * 100) + ' %'; saveSettings(); applyScale(); });
    const back = el('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) back.remove(); } },
      el('div', { class: 'modal wide settings' },
        el('div', { class: 'modal-title' }, 'Settings'),
        el('div', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Language'), seg([['en', 'English'], ['de', 'Deutsch']], 'lang', () => I18n.setLang(settings.lang))),
        el('div', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Theme'), seg([['dark', 'Dark'], ['light', 'Light'], ['system', 'Like the system']], 'theme', applyTheme)),
        el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, 'Text and button size'), sizeLabel), size),
        el('p', { class: 'hint' }, 'Formulas, function names and numbers stay as they are in every language.'),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'primary', onclick: () => back.remove() }, 'Done'))));
    document.body.append(back);
  }

  // ---------------------------------------------------------------- command palette (Ctrl+K)
  // Every section and the commands sections register; also evaluates a calculation typed into the box.
  function allCommands() {
    const out = [];
    for (const m of ordered()) {
      out.push({ label: I18n.t(m.label), sub: I18n.t('Open section'), keywords: `${m.label} ${m.short || ''} ${(m.features || []).join(' ')}`, run: () => open(m.id), icon: m.icon });
      for (const c of m.commands || []) out.push({ label: I18n.t(c.label), sub: I18n.t(m.label), keywords: `${c.label} ${c.keywords || ''} ${m.label}`, run: () => { open(m.id); c.run(); }, icon: m.icon });
    }
    out.push({ label: I18n.t('Settings'), sub: I18n.t('Language, theme, size'), keywords: 'settings language theme dark light size einstellungen sprache', run: openSettings, icon: ICONS.settings });
    return out;
  }
  // subsequence match with a score: start-of-word and consecutive hits count most
  function score(q, text) {
    q = q.toLowerCase(); text = text.toLowerCase();
    if (!q) return 1;
    const i = text.indexOf(q);
    if (i >= 0) return 100 - i + (i === 0 || text[i - 1] === ' ' ? 50 : 0);
    let s = 0, pos = 0;
    for (const ch of q) {
      const j = text.indexOf(ch, pos);
      if (j < 0) return 0;
      s += j === pos ? 3 : 1;
      pos = j + 1;
    }
    return s;
  }
  let palette = null;
  function openPalette() {
    if (palette && palette.isConnected) return;
    const input = el('input', { type: 'text', class: 'cp-input', placeholder: I18n.t('Search sections and tools, or type a calculation…'), spellcheck: 'false', autocomplete: 'off' });
    const list = el('div', { class: 'cp-list' });
    let items = [], sel = 0;
    const close = () => { back.remove(); palette = null; };
    function render() {
      const q = input.value.trim();
      items = [];
      // a calculation: show its value right here
      if (q && /[\d)]/.test(q) && typeof MX !== 'undefined') {
        try {
          MX.M.af = 1;
          const v = MX.evaluate(q);
          if (typeof v === 'number' && !Number.isNaN(v)) items.push({ label: `= ${MX.fmt(v)}`, sub: I18n.t('Open in the calculator'), run: () => { open('calc'); if (api.calc) api.calc.run(q); }, calc: true });
        } catch { /* not a calculation */ }
      }
      const cmds = allCommands().map((c) => ({ c, s: Math.max(score(q, c.label) * 2, score(q, c.keywords)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 14).map((x) => x.c);
      items.push(...cmds);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren(...(items.length ? items.map((c, i) => {
        const row = el('button', { type: 'button', class: 'cp-item' + (i === sel ? ' on' : '') + (c.calc ? ' calc' : ''), onmousemove: () => { if (sel !== i) { sel = i; paintSel(); } }, onclick: () => { close(); c.run(); } });
        const ic = el('span', { class: 'cp-ic' });
        if (c.icon) ic.innerHTML = c.icon;
        row.append(ic, el('span', { class: 'cp-label' }, c.label), el('span', { class: 'cp-sub' }, c.sub || ''));
        return row;
      }) : [el('div', { class: 'cp-empty' }, I18n.t('Nothing found'))]));
    }
    const paintSel = () => list.querySelectorAll('.cp-item').forEach((b, i) => b.classList.toggle('on', i === sel));
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paintSel(); list.querySelectorAll('.cp-item')[sel]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paintSel(); list.querySelectorAll('.cp-item')[sel]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); const c = items[sel]; if (c) { close(); c.run(); } }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    const back = el('div', { class: 'modal-back cp-back', onmousedown: (e) => { if (e.target === back) close(); } },
      el('div', { class: 'cp' }, el('div', { class: 'cp-head' }, el('span', { class: 'cp-ic' }), input), list,
        el('div', { class: 'cp-foot' }, I18n.t('↑ ↓ to choose · Enter to open · Esc to close'))));
    back.querySelector('.cp-head .cp-ic').innerHTML = ICONS.search;
    palette = back;
    document.body.append(back);
    render();
    input.focus();
  }

  // ---------------------------------------------------------------- printing
  // Saves an HTML page as PDF (desktop app: real PDF file; browser: the print dialog, where PDF is an option).
  async function savePDF(html, name) {
    const d = window.fractalsimDesktop;
    if (d && d.savePDF) {
      try { const p = await d.savePDF(html, name); if (p) U.toast(I18n.t('Saved') + ': ' + p); } catch (e) { U.toast('PDF failed: ' + e.message); }
      return;
    }
    const w = window.open('', '_blank');
    if (!w) return U.toast('Allow pop-ups to print');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  // ---------------------------------------------------------------- rail and home page
  function buildRail() {
    const rail = document.getElementById('rail');
    rail.append(el('div', { class: 'rail-logo', title: 'Mathsim' }));
    for (const m of ordered()) {
      const b = el('button', { type: 'button', class: 'rail-btn', 'data-id': m.id, title: `${m.label}${m.key ? ' (Ctrl+' + m.key + ')' : ''}`, onclick: () => open(m.id) });
      b.innerHTML = m.icon;
      b.append(el('span', {}, m.short || m.label));
      rail.append(b);
    }
    const tools = el('div', { class: 'rail-bottom' });
    const search = el('button', { type: 'button', class: 'rail-btn', title: 'Search (Ctrl+K)', onclick: openPalette });
    search.innerHTML = ICONS.search;
    search.append(el('span', {}, 'Search'));
    const gear = el('button', { type: 'button', class: 'rail-btn', title: 'Settings', onclick: openSettings });
    gear.innerHTML = ICONS.settings;
    gear.append(el('span', {}, 'Settings'));
    tools.append(search, gear);
    rail.append(tools);
  }

  function buildHome(root) {
    const cards = ordered().filter((m) => m.id !== 'home').map((m) => {
      const c = el('button', { type: 'button', class: 'home-card', onclick: () => open(m.id) });
      const ic = el('div', { class: 'home-icon' });
      ic.innerHTML = m.icon;
      c.append(ic, el('div', { class: 'home-title' }, m.label), el('div', { class: 'home-desc' }, m.desc || ''),
        m.features ? el('div', { class: 'home-tags' }, m.features.map((f) => el('span', {}, f))) : null);
      return c;
    });
    root.append(el('div', { class: 'page home' },
      el('div', { class: 'home-hero' },
        el('div', { class: 'home-logo' }),
        el('div', {}, el('h1', {}, 'Mathsim'), el('p', {}, 'A workbench for mathematics — calculate, graph in 2D and 3D, construct, analyse data, simulate, practise and explore fractals.'))),
      el('button', { type: 'button', class: 'home-search', onclick: openPalette }, el('span', { class: 'cp-ic' }), el('span', {}, 'Search sections and tools…'), el('kbd', {}, 'Ctrl K')),
      el('div', { class: 'home-grid' }, cards),
      el('p', { class: 'hint home-foot' }, 'Tip: Ctrl+1 … Ctrl+9 open the first nine sections. Everything you type is kept between sessions.')));
    root.querySelector('.home-search .cp-ic').innerHTML = ICONS.search;
  }

  register('home', { label: 'Home', key: 1, order: 0, root: () => document.getElementById('mod-home'), init: buildHome });

  function start() {
    // the fractal explorer is the existing #app; it goes last in the rail
    register('fractals', {
      label: 'Fractals', order: 12, root: () => document.getElementById('app'), init: () => FractalExplorer.start(),
      desc: 'Escape-time fractals with unlimited deep zoom, complex functions, strange attractors, IFS flames, vector and 3D fractals.',
      features: ['Mandelbrot & Julia', 'Deep zoom', 'Attractors', '3D', 'Zoom videos'],
    });
    buildRail();
    applyAll();
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() === 'k' && !e.shiftKey) { e.preventDefault(); openPalette(); return; }
      if (e.shiftKey) return;
      const m = [...mods.values()].find((x) => String(x.key) === e.key);
      if (m) { e.preventDefault(); open(m.id); }
    });
    let first = null;
    try { first = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (/^#f=/.test(location.hash)) first = 'fractals'; // a shared fractal link
    if (/^#g=/.test(location.hash)) first = 'graph'; // a shared graph link
    open(mods.has(first) ? first : 'home');
  }

  return { register, open, start, isActive, ICONS, api, settings, openPalette, openSettings, savePDF, addCommands };
})();

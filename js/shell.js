// App shell: the navigation rail, the home page, and switching between modules (calculator, grapher, …).
// Modules register themselves with Shell.register(); each builds its page the first time it is opened.
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
  };

  const mods = new Map();
  let current = null;
  const KEY = 'mathsim.module';

  function register(id, m) {
    mods.set(id, Object.assign({ id, icon: ICONS[id] || ICONS.tools, built: false, order: mods.size }, m));
  }
  const ordered = () => [...mods.values()].sort((a, b) => a.order - b.order);

  function open(id) {
    const m = mods.get(id) || mods.get('home');
    if (current === m.id) return;
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
    if (m.id !== 'fractals') document.title = m.label + ' · Mathsim';
    try { localStorage.setItem(KEY, m.id); } catch { /* storage blocked */ }
  }

  const isActive = (id) => current === id;

  function buildRail() {
    const rail = document.getElementById('rail');
    rail.append(el('div', { class: 'rail-logo', title: 'Mathsim' }));
    for (const m of ordered()) {
      const b = el('button', { type: 'button', class: 'rail-btn', 'data-id': m.id, title: `${m.label}${m.key ? ' (Ctrl+' + m.key + ')' : ''}`, onclick: () => open(m.id) });
      b.innerHTML = m.icon;
      b.append(el('span', {}, m.short || m.label));
      rail.append(b);
    }
  }

  // ---------------------------------------------------------------- home page
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
      el('div', { class: 'home-grid' }, cards),
      el('p', { class: 'hint home-foot' }, 'Tip: Ctrl+1 … Ctrl+9 open the first nine sections. Everything you type is kept between sessions.')));
  }

  register('home', { label: 'Home', key: 1, order: 0, root: () => document.getElementById('mod-home'), init: buildHome });

  function start() {
    // the fractal explorer is the existing #app; it goes last in the rail
    register('fractals', {
      label: 'Fractals', order: 12, root: () => document.getElementById('app'),
      desc: 'Escape-time fractals with unlimited deep zoom, complex functions, strange attractors, IFS flames, vector and 3D fractals.',
      features: ['Mandelbrot & Julia', 'Deep zoom', 'Attractors', '3D', 'Zoom videos'],
    });
    buildRail();
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const m = [...mods.values()].find((x) => String(x.key) === e.key);
      if (m) { e.preventDefault(); open(m.id); }
    });
    let first = null;
    try { first = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (/^#f=/.test(location.hash)) first = 'fractals'; // a shared fractal link
    if (/^#g=/.test(location.hash)) first = 'graph'; // a shared graph link
    open(mods.has(first) ? first : 'home');
  }

  return { register, open, start, isActive, ICONS };
})();

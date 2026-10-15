// Declarative-ish UI controls. Every control registers a sync() that pulls its value from app state.
const C = (() => {
  const { el, fmtNum } = U;
  const reg = [];

  function add(ctl, tag) {
    ctl.tag = tag;
    reg.push(ctl);
    return ctl;
  }

  function sync(tag) {
    for (const c of reg) {
      if (tag && c.tag !== tag) continue;
      try { c.sync(); } catch (e) { /* control not applicable to current fractal */ }
    }
  }

  const busy = (input) => document.activeElement === input;

  function group(title, kids, show) {
    const g = el('div', { class: 'group' }, title ? el('h3', {}, title) : null, kids);
    if (show) add({ sync() { g.hidden = !show(); } }, 'vis');
    return g;
  }

  function show(node, pred) {
    add({ sync() { node.hidden = !pred(); } }, 'vis');
    return node;
  }

  function slider({ label, min, max, step = 0, log = false, get, set, prec = 4, tag }) {
    const range = el('input', { type: 'range', min: 0, max: 1000, step: 1 });
    const num = el('input', { type: 'number', step: 'any', class: 'num' });
    const lmin = Math.log(min), lmax = Math.log(max);
    const toPos = (v) => {
      const t = log ? (Math.log(Math.max(v, min)) - lmin) / (lmax - lmin) : (v - min) / (max - min);
      return Math.round(U.clamp(t, 0, 1) * 1000);
    };
    const fromPos = (p) => {
      const t = p / 1000;
      let v = log ? Math.exp(lmin + t * (lmax - lmin)) : min + t * (max - min);
      if (step) v = Math.round(v / step) * step;
      return +v.toPrecision(prec + 1);
    };
    range.addEventListener('input', () => {
      const v = fromPos(+range.value);
      num.value = fmtNum(v, prec);
      set(v);
    });
    num.addEventListener('change', () => {
      let v = parseFloat(num.value);
      if (!isFinite(v)) return;
      if (step) v = Math.round(v / step) * step;
      range.value = toPos(v);
      set(v);
    });
    const root = el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, label), num), range);
    return add({
      el: root,
      sync() {
        const v = get();
        if (v == null) return;
        if (!busy(num)) num.value = fmtNum(v, prec);
        range.value = toPos(v);
      },
    }, tag);
  }

  function number({ label, get, set, prec = 10, step = 'any', tag }) {
    const inp = el('input', { type: 'number', step, class: 'num wide' });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (isFinite(v)) set(v);
    });
    const root = el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, label), inp);
    return add({ el: root, input: inp, sync() { const v = get(); if (v != null && !busy(inp)) inp.value = fmtNum(v, prec); } }, tag);
  }

  function select({ label, options, get, set, tag }) {
    const sel = el('select', {}, options.map(([v, l]) => el('option', { value: v }, l)));
    sel.addEventListener('change', () => set(sel.value));
    const root = el('label', { class: 'ctl' }, label ? el('span', { class: 'ctl-label' }, label) : null, sel);
    return add({ el: root, sync() { const v = get(); if (v != null) sel.value = String(v); } }, tag);
  }

  function seg({ options, get, set, tag }) {
    const btns = options.map(([v, l]) => el('button', { type: 'button', 'data-v': v, onclick: () => { set(v); sync(); } }, l));
    const root = el('div', { class: 'seg' }, btns);
    return add({ el: root, sync() { const cur = String(get()); btns.forEach((b) => b.classList.toggle('on', b.dataset.v === cur)); } }, tag);
  }

  function check({ label, get, set, tag, title }) {
    const inp = el('input', { type: 'checkbox' });
    inp.addEventListener('change', () => set(inp.checked));
    const root = el('label', { class: 'check', title }, inp, el('span', {}, label));
    return add({ el: root, sync() { inp.checked = !!get(); } }, tag);
  }

  function color({ label, get, set, tag }) {
    const inp = el('input', { type: 'color' });
    inp.addEventListener('input', () => set(inp.value));
    const root = el('label', { class: 'ctl color-ctl' }, el('span', { class: 'ctl-label' }, label), inp);
    return add({ el: root, sync() { const v = get(); if (v) inp.value = v; } }, tag);
  }

  function text({ label, get, set, mono = false, placeholder = '', tag, onInput }) {
    const inp = el('input', { type: 'text', class: mono ? 'mono' : '', placeholder, spellcheck: 'false', autocomplete: 'off' });
    inp.addEventListener('input', () => (onInput || set)(inp.value));
    inp.addEventListener('change', () => set(inp.value));
    const root = el('label', { class: 'ctl' }, label ? el('span', { class: 'ctl-label' }, label) : null, inp);
    return add({ el: root, input: inp, sync() { const v = get(); if (v != null && !busy(inp)) inp.value = v; } }, tag);
  }

  function btn(label, onclick, cls = '', title) {
    return el('button', { type: 'button', class: cls, onclick, title }, label);
  }

  // Colour-stop gradient editor bound to a palette array.
  function paletteEditor({ get, set, onChange, cyclic = true }) {
    const strip = el('div', { class: 'pal-strip' });
    const stops = el('div', { class: 'pal-stops' });
    const presetSel = el('select', { class: 'pal-preset' },
      el('option', { value: '' }, 'Preset…'),
      Object.keys(PALETTES).map((k) => el('option', { value: k }, k)));
    const paint = () => {
      const pal = get();
      if (!pal) return;
      strip.style.background = `linear-gradient(90deg, ${(cyclic ? [...pal, pal[0]] : pal).join(', ')})`;
    };
    const rebuild = () => {
      const pal = get();
      if (!pal) return;
      paint();
      stops.replaceChildren(...pal.map((col, i) => {
        const inp = el('input', { type: 'color', value: col, title: 'Stop ' + (i + 1) });
        inp.addEventListener('input', () => { pal[i] = inp.value; paint(); onChange(); });
        const rm = pal.length > 2 ? el('button', { type: 'button', class: 'x', title: 'Remove stop', onclick: () => { pal.splice(i, 1); rebuild(); onChange(); } }, '×') : null;
        return el('div', { class: 'stop' }, inp, rm);
      }));
      addBtn.disabled = pal.length >= EscapeGL.MAX_STOPS;
    };
    presetSel.addEventListener('change', () => {
      if (!presetSel.value) return;
      set(PALETTES[presetSel.value].slice());
      presetSel.value = '';
      rebuild();
      onChange();
    });
    const addBtn = btn('+ Stop', () => {
      const pal = get();
      if (pal.length >= EscapeGL.MAX_STOPS) return;
      pal.push(U.hslToHex(Math.random() * 360, 0.7, 0.55));
      rebuild();
      onChange();
    }, 'small');
    const root = el('div', { class: 'pal-editor' },
      strip, stops,
      el('div', { class: 'btn-row' },
        presetSel,
        addBtn,
        btn('Reverse', () => { get().reverse(); rebuild(); onChange(); }, 'small'),
        btn('Random', () => { set(randomPalette()); rebuild(); onChange(); }, 'small')));
    return add({ el: root, sync: rebuild });
  }

  return { add, sync, group, show, slider, number, select, seg, check, color, text, btn, paletteEditor };
})();

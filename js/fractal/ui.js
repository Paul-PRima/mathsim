// Fractal explorer — building the side panel: Render, Maker and Library tabs.

// ---------------------------------------------------------------- UI construction
function saveButtons() {
  const saveBtn = btn('Save to library', () => saveToLibrary(false), 'primary');
  C.add({ sync() { saveBtn.textContent = S.libId ? 'Update in library' : 'Save to library'; } }, 'save');
  return el('div', { class: 'btn-row' }, saveBtn, btn('Save as new', () => saveToLibrary(true)), btn(DESKTOP ? 'Copy share code' : 'Copy link', shareLink, '', 'Copy something you can send to someone else'));
}

function autoZoomControls() {
  const toggle = btn('▶ Automatic zoom', () => (S.auto.on ? stopAuto() : startAuto()), '', 'Endless dive towards detail (A) — any click or scroll stops it');
  C.add({ sync() { toggle.textContent = S.auto.on ? '⏹ Stop automatic zoom' : '▶ Automatic zoom'; toggle.classList.toggle('primary', !!S.auto.on); } }, 'auto');
  return el('div', {},
    el('div', { class: 'btn-row' }, toggle),
    C.slider({ label: 'Zoom speed (halvings per second)', min: 0.1, max: 4, log: true, get: () => S.auto.speed, set: (v) => (S.auto.speed = v) }).el,
    C.check({ label: 'Steer towards detail', get: () => S.auto.steer, set: (v) => { S.auto.steer = v; if (v && S.auto.on) requestSteer(); } }).el,
    el('p', { class: 'hint' }, 'Renders one image per halving and smoothly magnifies it while the next renders. If rendering can’t keep up, the zoom waits instead of going blurry.'));
}

// Full-precision coordinate field (may hold hundreds of digits at deep zoom).
function coordText(label, axis) {
  return C.text({
    label, tag: 'view', mono: true, onInput: () => {},
    get: () => HP.toDecimal(S.pv[axis], S.pv.P, Math.max(6, Math.ceil((-S.pv.L + 12) / HP.LOG2_10))),
    set: (v) => {
      const n = HP.fromDecimal(v, S.pv.P);
      if (n == null) return U.toast('Not a number');
      S.pv[axis] = n;
      viewChanged();
    },
  }).el;
}

function buildRenderTab() {
  const t = $('#tab-render');
  const deg = 180 / Math.PI;
  const exportCustom = el('div', { class: 'grid2' },
    C.number({ label: 'Width', get: () => S.exportW, set: (v) => (S.exportW = v), step: 1 }).el,
    C.number({ label: 'Height', get: () => S.exportH, set: (v) => (S.exportH = v), step: 1 }).el);
  t.append(
    el('div', { class: 'current' }, el('div', { class: 'current-name', id: 'cur-name' }), el('div', { class: 'current-meta', id: 'cur-meta' })),
    C.group('Camera', [
      el('div', { class: 'grid2' },
        C.number({ label: 'Yaw °', tag: 'cam', prec: 5, get: () => S.def.camera.yaw, set: (v) => { S.def.camera.yaw = v; mark3d(); } }).el,
        C.number({ label: 'Pitch °', tag: 'cam', prec: 5, get: () => S.def.camera.pitch, set: (v) => { S.def.camera.pitch = U.clamp(v, -89, 89); mark3d(); } }).el),
      C.slider({ label: 'Distance', tag: 'cam', min: 0.001, max: 60, log: true, get: () => S.def.camera.dist, set: (v) => { S.def.camera.dist = v; mark3d(); } }).el,
      C.slider({ label: 'Field of view °', tag: 'cam', min: 10, max: 100, step: 1, get: () => S.def.camera.fov, set: (v) => { S.def.camera.fov = v; mark3d(); } }).el,
      el('div', { class: 'btn-row' }, btn('Reset camera', resetView, '', 'R'), btn('Back', goBack, '', 'Previous fractal (Backspace)')),
      el('p', { class: 'hint' }, 'Drag to orbit · ', el('b', {}, 'Shift+drag'), ' or right-drag to pan · scroll to fly in and out'),
    ], isThree),
    C.group('View', [
      coordText('Center X (real)', 'x'),
      coordText('Center Y (imaginary)', 'y'),
      el('div', { class: 'grid2' },
        C.text({ label: 'Zoom ×', tag: 'view', mono: true, onInput: () => {},
          get: () => HP.magString(S.pv.L),
          set: (v) => { const L = HP.parseMag(v); if (L != null && isFinite(L)) { S.pv.L = isEsc() ? L : Math.max(-40, L); viewChanged(); } } }).el,
        C.number({ label: 'Rotation °', tag: 'view', prec: 5, get: () => S.pv.rot * deg, set: (v) => { S.pv.rot = v / deg; viewChanged(); } }).el),
      el('div', { class: 'btn-row' },
        btn('Reset view', resetView, '', 'R'),
        C.show(btn('Fit', fitView, '', 'Frame the whole attractor'), isDensity),
        btn('Back', goBack, '', 'Previous fractal (Backspace)')),
      el('p', { class: 'hint' }, 'Drag to pan · scroll or pinch to zoom · double-click to zoom in · ', el('b', {}, 'Shift+click'), ' opens the Julia set at that point · ', el('b', {}, 'H'), ' hides this panel'),
    ], is2D),
    C.group('Quality', [
      C.show(C.slider({ label: 'Ray steps (more = finer detail, slower)', min: 40, max: 1000, step: 1, log: true, get: () => S.def.maxSteps, set: (v) => { S.def.maxSteps = v; mark3d(); } }).el, isThree),
      C.show(C.slider({ label: 'Surface detail (lower = sharper)', min: 0.1, max: 8, log: true, get: () => S.def.detail, set: (v) => { S.def.detail = v; mark3d(); } }).el, isThree),
      C.show(C.slider({ label: 'Iterations', tag: 'iter', min: 16, max: 20000, step: 1, log: true, prec: 5, get: () => S.def.maxIter, set: (v) => { S.def.maxIter = v; C.sync('iter'); changed(); } }).el, isEsc),
      C.show(C.select({ label: 'Anti-aliasing', options: [[1, 'Off'], [2, '2×2 samples'], [3, '3×3 samples'], [4, '4×4 samples']], get: () => S.aa, set: (v) => { S.aa = +v; updateHud(); } }).el, isEsc),
      C.show(C.check({ label: 'Smart iterations (measures each view; the slider is used when this is off)', get: () => S.autoIter, set: (v) => { S.autoIter = v; S.smart = null; updateHud(); } }).el, isEsc),
      C.show(C.check({ label: 'Anti-alias edges only (much faster, same look)', get: () => S.smartAA, set: (v) => { S.smartAA = v; updateHud(); } }).el, isEsc),
      C.show(C.check({ label: 'Fast manual zoom (rough full-screen preview while zooming)', get: () => S.fastZoom, set: (v) => { S.fastZoom = v; } }).el, isEsc),
      C.check({ label: 'Smooth zoom animation', get: () => S.smoothZoom, set: (v) => { S.smoothZoom = v; if (!v && S.zoomAnim) { const z = S.zoomAnim; S.zoomAnim = null; zoomAt(z.x, z.y, Math.exp(z.rem)); } } }).el,
      C.show(C.check({
        label: 'Skip iterations at deep zoom (much faster; exact for z^n + c style formulas)',
        get: () => EscapeGL.blaSettings.enabled,
        set: (v) => { EscapeGL.blaSettings.enabled = v; updateHud(); },
      }).el, isEsc),
      C.show(C.slider({ label: 'Samples per pixel', min: 2, max: 400, step: 1, log: true, get: () => S.ifsQuality, set: (v) => { S.ifsQuality = v; if (ifsState) ifsState.target = ifsState.w * ifsState.h * v; updateHud(); } }).el, isDensity),
      C.select({ label: 'Resolution', options: [[0.5, 'Half (fast)'], [0.75, '75%'], [1, 'Full']], get: () => S.resScale, set: (v) => { S.resScale = +v; resize(); } }).el,
    ]),
    C.group('Animation', [
      C.show(C.check({ label: 'Play time (formula uses t)', tag: 'anim', get: () => S.playing, set: (v) => (S.playing = v) }).el, () => S.animated),
      C.check({ label: 'Cycle colours', get: () => S.cycle, set: (v) => { S.cycle = v; if (!v) C.sync('offset'); } }).el,
      C.slider({ label: 'Cycle speed', min: 0.01, max: 2, log: true, get: () => S.cycleSpeed, set: (v) => (S.cycleSpeed = v) }).el,
    ], isEsc),
    C.group('Explore', [
      C.show(el('div', {},
        el('div', { class: 'btn-row' }, btn('✨ Find an interesting spot', findSpot, 'primary', 'Zooms towards the most detailed nearby point (F)')),
        autoZoomControls()), isEsc),
      C.show(el('div', {},
        C.check({ label: 'Julia preview under cursor', get: () => S.juliaPreview, set: (v) => { S.juliaPreview = v; if (!v) juliaBox.hidden = true; } }).el,
        el('p', { class: 'hint' }, 'Shows the Julia set for the point under your mouse. Shift+click (or press J) to open it.')), () => isEsc() && !S.def.julia),
      C.check({ tag: 'minimap', label: 'Mini-map (M) — click it to jump', get: () => S.showMinimap, set: (v) => { S.showMinimap = v; minimapOverlay(); } }).el,
    ], is2D),
    C.group('Bookmarks', [
      el('div', { class: 'btn-row' }, btn('★ Bookmark this spot', addBookmark, '', 'B')),
      el('div', { id: 'bm-list', class: 'bm-list' }),
    ]),
    C.group('Export image', [
      C.select({ label: 'Size', options: [['screen', 'Screen size'], ['1080', '1920 × 1080'], ['1440', '2560 × 1440'], ['4k', '3840 × 2160 (4K)'], ['8k', '7680 × 4320 (8K)'], ['square', '4096 × 4096'], ['custom', 'Custom…']], get: () => S.exportPreset, set: (v) => { S.exportPreset = v; C.sync('vis'); } }).el,
      C.show(exportCustom, () => S.exportPreset === 'custom'),
      C.show(C.select({ label: 'Export anti-aliasing', options: [[1, 'Off'], [2, '2×2'], [3, '3×3'], [4, '4×4']], get: () => S.exportAA, set: (v) => (S.exportAA = +v) }).el, isEsc),
      el('div', { class: 'btn-row' },
        btn('Save PNG', exportPNG, 'primary'),
        C.show(btn('Save SVG', exportSVG, '', 'Vector file — scales to any size'), isVec)),
    ]),
    C.group('Library', [saveButtons()]),
  );
}

function insertAtCaret(input, snippet) {
  const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
  input.value = input.value.slice(0, s) + snippet + input.value.slice(e);
  const caret = snippet.endsWith('()') ? s + snippet.length - 1 : s + snippet.length;
  input.focus();
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('change'));
}

function ifsEditor() {
  const list = el('div', { class: 'ifs-list' });
  let pctEls = [];
  const updatePct = () => {
    const tot = S.def.transforms.reduce((s, t) => s + Math.max(0, +t.weight || 0), 0) || 1;
    pctEls.forEach((p, i) => (p.textContent = Math.round((Math.max(0, +S.def.transforms[i].weight || 0) / tot) * 100) + '%'));
  };
  const mapChanged = () => { updatePct(); changed('ifs'); };
  function card(tr, i) {
    const numIn = (key, label) => {
      const inp = el('input', { type: 'number', step: '0.01', class: 'num', value: U.fmtNum(tr[key], 6) });
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if (isFinite(v)) { tr[key] = v; mapChanged(); }
      });
      return el('label', { class: 'mcell' }, el('span', {}, label), inp);
    };
    const color = el('input', { type: 'color', value: tr.color, title: 'Map colour' });
    color.addEventListener('input', () => { tr.color = color.value; changed('ifs'); });
    const vsel = el('select', { title: 'Variation (non-linear warp)' }, IFS.VARIATIONS.map((v) => el('option', { value: v }, v)));
    vsel.value = tr.variation;
    vsel.addEventListener('change', () => { tr.variation = vsel.value; changed('ifs'); });
    const pct = el('span', { class: 'map-p' });
    pctEls.push(pct);
    return el('div', { class: 'map-card' },
      el('div', { class: 'map-head' }, color, el('strong', {}, 'Map ' + (i + 1)), vsel,
        btn('⧉', () => { S.def.transforms.splice(i + 1, 0, clone(tr)); rebuild(); changed('ifs'); }, 'icon', 'Duplicate map'),
        btn('×', () => { if (S.def.transforms.length <= 1) return; S.def.transforms.splice(i, 1); rebuild(); changed('ifs'); }, 'icon danger', 'Remove map')),
      el('div', { class: 'map-grid' }, numIn('a', 'a'), numIn('b', 'b'), numIn('e', 'e'), numIn('c', 'c'), numIn('d', 'd'), numIn('f', 'f')),
      el('div', { class: 'map-foot' }, numIn('weight', 'weight'), el('span', { class: 'hint' }, 'chance'), pct));
  }
  function rebuild() {
    if (!isIFS()) return;
    pctEls = [];
    list.replaceChildren(...S.def.transforms.map(card));
    updatePct();
  }
  C.add({ sync: rebuild });
  return el('div', {},
    el('p', { class: 'hint formula-hint' }, "x′ = a·x + b·y + e     y′ = c·x + d·y + f"),
    list,
    el('div', { class: 'btn-row' },
      btn('+ Add map', () => {
        S.def.transforms.push({ a: 0.5, b: 0, c: 0, d: 0.5, e: U.rand(-0.5, 0.5), f: U.rand(-0.5, 0.5), weight: 1, variation: 'linear', color: U.hslToHex(Math.random() * 360, 0.8, 0.6) });
        rebuild(); changed('ifs');
      }),
      btn('Auto weights', () => {
        S.def.transforms.forEach((t) => (t.weight = +Math.max(0.01, Math.abs(t.a * t.d - t.b * t.c)).toFixed(3)));
        rebuild(); changed('ifs');
      }, '', 'Weight each map by the area it covers (|ad − bc|)'),
      btn('Fit view', fitView)));
}

// Maker controls for strange attractors and bifurcation diagrams.
function attractorGroups() {
  const K = () => Attr.KINDS[S.def.kind];
  const kindOpts = Object.keys(Attr.GROUPS).flatMap((g) =>
    Object.entries(Attr.KINDS).filter(([, k]) => k.group === g).map(([id, k]) => [id, `${Attr.GROUPS[g]} — ${k.label}`]));
  const eq = el('p', { class: 'hint formula-hint' });
  C.add({ sync() { if (isAttr()) eq.textContent = K().eq; } });
  const refit = () => { setView(IFS.fit(S.def, aspect())); S.homeView = clone(S.def.view); viewChanged(); };
  // Sliders whose range follows the selected kind.
  const params = ['a', 'b', 'c', 'd'].map((name) => {
    const holder = el('div');
    let builtFor = null;
    C.add({
      sync() {
        if (!isAttr()) return;
        const spec = K().params[name];
        holder.hidden = !spec;
        if (!spec || builtFor === S.def.kind) return;
        builtFor = S.def.kind;
        const ctl = C.slider({ label: name, prec: 5, min: spec[1], max: spec[2], get: () => S.def[name], set: (v) => { S.def[name] = v; changed('attractor'); } });
        holder.replaceChildren(ctl.el);
        ctl.sync && ctl.sync();
      },
    });
    return holder;
  });
  return [
    C.group('Attractor', [
      C.select({ label: 'System', options: kindOpts, get: () => S.def.kind, set: (v) => {
        const keep = { name: Attr.defaults(v).name, palette: S.def.palette, colorMode: S.def.colorMode, gamma: S.def.gamma, brightness: S.def.brightness, background: S.def.background };
        loadDef(Object.assign(Attr.defaults(v), keep));
      } }).el,
      eq,
      ...params,
      C.show(el('div', { class: 'grid2' },
        C.slider({ label: 'Turn °', min: -180, max: 180, step: 1, get: () => S.def.yaw, set: (v) => { S.def.yaw = v; changed('attractor'); } }).el,
        C.slider({ label: 'Tilt °', min: -90, max: 90, step: 1, get: () => S.def.pitch, set: (v) => { S.def.pitch = v; changed('attractor'); } }).el), () => isAttr() && K().group === 'flow'),
      el('div', { class: 'btn-row' },
        btn('Fit view', refit, '', 'Frame the whole attractor'),
        btn('Reset parameters', () => { const d = Attr.defaults(S.def.kind); for (const k of ['a', 'b', 'c', 'd', 'yaw', 'pitch']) S.def[k] = d[k]; C.sync(); changed('attractor'); refit(); })),
      el('p', { class: 'hint' }, 'A single point is moved by the equations millions of times; brightness shows how often it visits each pixel. Small parameter changes can turn a cloud into a few dots — that is chaos.'),
    ], isAttr),
    C.group('Colouring', [
      C.seg({ options: [['speed', 'By speed'], ['palette', 'By density']], get: () => S.def.colorMode, set: (v) => { S.def.colorMode = v; changed('attractor'); } }).el,
      C.slider({ label: 'Gamma', min: 0.5, max: 6, get: () => S.def.gamma, set: (v) => { S.def.gamma = v; changed('ifs-color'); } }).el,
      C.slider({ label: 'Brightness', min: 0.2, max: 6, log: true, get: () => S.def.brightness, set: (v) => { S.def.brightness = v; changed('ifs-color'); } }).el,
      C.color({ label: 'Background', get: () => S.def.background, set: (v) => { S.def.background = v; changed('ifs-color'); } }).el,
      el('p', { class: 'hint' }, 'By speed: slow parts take the first colours, fast jumps the last. By density: rarely visited → first colour, busiest → last.'),
      C.paletteEditor({ cyclic: false, get: () => S.def.palette, set: (p) => (S.def.palette = p), onChange: () => changed(S.def.colorMode === 'palette' ? 'ifs-color' : 'attractor') }).el,
    ], isAttr),
  ];
}

function buildMakerTab() {
  const t = $('#tab-maker');
  const complexPair = (label, getArr, tag) => el('div', { class: 'grid2' },
    C.slider({ label: label + ' (re)', tag, min: -2, max: 2, prec: 6, get: () => getArr()[0], set: (v) => { getArr()[0] = v; changed(); } }).el,
    C.slider({ label: label + ' (im)', tag, min: -2, max: 2, prec: 6, get: () => getArr()[1], set: (v) => { getArr()[1] = v; changed(); } }).el);

  const debouncedFormula = U.debounce((v) => { S.def.formula = v; changed(); }, 220);
  const formulaCtl = C.text({ label: 'Iteration  z →', mono: true, placeholder: 'z^2 + c', get: () => S.def.formula, set: (v) => { S.def.formula = v; changed(); }, onInput: debouncedFormula });
  const debouncedInit = U.debounce((v) => { S.def.init = v; changed(); }, 220);
  const initCtl = C.text({ label: 'Start value  z₀ =', mono: true, placeholder: '0', get: () => S.def.init, set: (v) => { S.def.init = v; changed(); }, onInput: debouncedInit });
  errEls.formula = el('div', { class: 'err', hidden: true });
  errEls.init = el('div', { class: 'err', hidden: true });
  const chips = ['z^2', 'z^3', 'c', 'zp', 'k', 't', 'i', 'abs()', 'conj()', 'sin()', 'exp()', 'log()', 're()', 'im()', 'sqrt()']
    .map((s) => btn(s, () => insertAtCaret(formulaCtl.input, s), 'chip'));

  const help = el('details', { class: 'help' },
    el('summary', {}, 'Formula syntax'),
    el('div', { html: `
      <p><b>Variables</b></p>
      <ul>
        <li><code>z</code> current value · <code>zp</code> previous value</li>
        <li><code>c</code> pixel (Mandelbrot mode) or the constant (Julia mode)</li>
        <li><code>p</code> pixel position · <code>n</code> iteration number</li>
        <li><code>k</code> free parameter (sliders below) · <code>t</code> time in seconds (animates)</li>
        <li><code>x</code>, <code>y</code> real / imaginary part of z · <code>i</code>, <code>pi</code>, <code>e</code></li>
      </ul>
      <p><b>Operators</b> <code>+ - * / ^</code>, brackets, <code>|z|</code>, implicit multiply <code>2z</code></p>
      <p><b>Functions</b> ${Object.keys(Formula.FUNCS).map((f) => `<code>${f}</code>`).join(' ')}</p>
      <p><b>Try</b></p>
      <ul>
        <li><code>abs(z)^2 + conj(c)</code> Burning Ship</li>
        <li><code>z - (z^3 - 1)/(3z^2)</code> Newton (z₀ = p, convergence on)</li>
        <li><code>z^2 + c + k*zp</code> Phoenix</li>
        <li><code>z^2 + 0.7885*exp(i*t)</code> animated Julia</li>
      </ul>` }));

  const fnHelp = el('p', { class: 'hint' }, 'Complex function mode: each pixel z is coloured by w = f(z). Hue shows the angle of w (red → yellow → green… goes once around the colour wheel), brightness bands show |w| doubling. Zeros are where every colour meets counter-clockwise, poles where they meet clockwise. Raise the iterations to see f applied several times.');
  t.append(
    C.group('Make', [
      C.text({ label: 'Name', tag: 'name', get: () => S.def.name, set: (v) => { S.def.name = v; updateHeader(); } }).el,
      el('div', { class: 'seg-wrap' }, C.seg({
        options: [['escape', 'Escape-time'], ['function', 'Complex function'], ['attractor', 'Attractor'], ['ifs', 'IFS'], ['vector', 'Vector'], ['3d', '3D']],
        get: makerType, set: (v) => { if (v !== makerType()) loadDef(TYPE_DEFAULTS[v]()); },
      }).el),
      el('div', { class: 'btn-row' },
        btn('New blank', () => loadDef(TYPE_DEFAULTS[makerType()]())),
        btn('🎲 Surprise me', () => loadDef(TYPE_RANDOM[makerType()]()), 'primary')),
    ]),

    // ---- escape-time
    C.group('Formula', [
      C.show(fnHelp, isFn),
      formulaCtl.el, errEls.formula,
      el('div', { class: 'chips' }, chips),
      C.show(el('div', {}, initCtl.el, errEls.init), () => isEsc() && !isFn()),
      help,
    ], isEsc),
    C.group('Mode', [
      C.seg({ options: [['mandel', 'Mandelbrot  (c = pixel)'], ['julia', 'Julia  (z₀ = pixel)']], get: () => (S.def.julia ? 'julia' : 'mandel'), set: (v) => {
        S.def.julia = v === 'julia';
        setView(S.def.julia ? { cx: 0, cy: 0, scale: 1.5, rot: 0 } : { cx: -0.5, cy: 0, scale: 1.4, rot: 0 });
        S.homeView = clone(S.def.view);
        changed();
        viewChanged();
      } }).el,
      C.show(complexPair('Julia c', () => S.def.juliaC, 'juliac'), () => isEsc() && S.def.julia),
      complexPair('k', () => S.def.k),
      el('p', { class: 'hint' }, 'k does nothing unless your formula uses it.'),
    ], () => isEsc() && !isFn()),
    C.group('Iteration', [
      C.slider({ label: 'Max iterations', tag: 'iter', min: 16, max: 20000, step: 1, log: true, prec: 5, get: () => S.def.maxIter, set: (v) => { S.def.maxIter = v; C.sync('iter'); changed(); } }).el,
      C.show(el('div', {},
      C.check({ label: 'Stop when |z| escapes', get: () => S.def.escape, set: (v) => { S.def.escape = v; C.sync('vis'); changed(); } }).el,
      C.show(C.slider({ label: 'Escape radius', min: 2, max: 1e6, log: true, get: () => S.def.bailout, set: (v) => { S.def.bailout = v; changed(); } }).el, () => isEsc() && S.def.escape),
      C.check({ label: 'Stop when z converges (Newton-style)', get: () => S.def.converge, set: (v) => { S.def.converge = v; C.sync('vis'); changed(); } }).el,
      C.show(C.slider({ label: 'Convergence ε', min: 1e-14, max: 1e-2, log: true, prec: 3, get: () => S.def.epsilon, set: (v) => { S.def.epsilon = v; changed(); } }).el, () => isEsc() && S.def.converge),
      ), () => isEsc() && !isFn()),
    ], isEsc),
    C.group('Colouring', [
      C.select({ label: 'Method', options: [['smooth', 'Smooth iteration count'], ['trap-point', 'Orbit trap — point'], ['trap-cross', 'Orbit trap — cross'], ['angle', 'Final angle (roots)'], ['stripe', 'Stripe average'], ['domain', 'Domain colouring (complex function)']], get: () => S.def.coloring, set: (v) => { S.def.coloring = v; C.sync('vis'); changed(); } }).el,
      C.select({ label: 'Mapping', options: [['linear', 'Linear'], ['sqrt', 'Square root'], ['log', 'Logarithmic']], get: () => S.def.mapping, set: (v) => { S.def.mapping = v; changed(); } }).el,
      C.slider({ label: 'Colour density', min: 0.02, max: 50, log: true, get: () => S.def.density, set: (v) => { S.def.density = v; changed(); } }).el,
      C.slider({ label: 'Colour offset', tag: 'offset', min: 0, max: 1, get: () => ((S.def.offset % 1) + 1) % 1, set: (v) => { S.def.offset = v; changed(); } }).el,
      C.slider({ label: 'Iteration shading (size bands for functions)', min: 0, max: 1, get: () => S.def.shade, set: (v) => { S.def.shade = v; changed(); } }).el,
      C.show(C.slider({ label: 'Stripe frequency', min: 1, max: 20, step: 1, get: () => S.def.stripeFreq, set: (v) => { S.def.stripeFreq = v; changed(); } }).el, () => isEsc() && S.def.coloring === 'stripe'),
      C.show(C.slider({ label: 'Phase lines (0 = off)', min: 0, max: 24, step: 1, get: () => S.def.stripeFreq, set: (v) => { S.def.stripeFreq = v; changed(); } }).el, isFn),
      C.show(C.color({ label: 'Inside colour', get: () => S.def.interior, set: (v) => { S.def.interior = v; changed(); } }).el, () => isEsc() && !isFn()),
      C.paletteEditor({ get: () => S.def.palette, set: (p) => (S.def.palette = p), onChange: () => changed() }).el,
    ], isEsc),

    // ---- vector
    C.group('Vector type', [
      C.seg({ options: [['kuschnig', 'Kuschnig'], ['rules', 'Custom generator']], get: () => S.def.kind, set: (v) => {
        if (v === S.def.kind) return;
        loadDef(v === 'rules' ? Vec.fromTemplate('Koch snowflake') : Vec.defaults());
      } }).el,
      C.check({ label: 'Infinite detail (keep splitting down to pixel size — zoom in forever)', get: () => S.def.auto, set: (v) => { S.def.auto = v; C.sync('vis'); changed('vector'); } }).el,
      C.show(C.slider({ label: 'Iterations', min: 0, max: 20, step: 1, get: () => S.def.depth, set: (v) => { S.def.depth = v; changed('vector'); } }).el, () => isVec() && !S.def.auto),
    ], isVec),
    C.group('Kuschnig structure', [
      el('p', { class: 'hint' }, 'A circle of four 90° arcs plus the same arcs mirrored into a star. Every arc spawns two smaller arcs with the same orientation that meet on its chord.'),
      C.slider({ label: 'Split point along the chord', min: 0.05, max: 0.95, get: () => S.def.split, set: (v) => { S.def.split = v; changed('vector'); } }).el,
      C.check({ label: 'Circle arcs', get: () => S.def.circle, set: (v) => { S.def.circle = v; changed('vector'); } }).el,
      C.check({ label: 'Mirrored star arcs', get: () => S.def.star, set: (v) => { S.def.star = v; changed('vector'); } }).el,
    ], isKusch),
    ...(() => {
      const ed = rulesEditor();
      const tpl = el('select', {}, el('option', { value: '' }, 'Start from a template…'), Object.keys(Vec.TEMPLATES).map((n) => el('option', { value: n }, n)));
      tpl.addEventListener('change', () => { if (tpl.value) loadDef(Vec.fromTemplate(tpl.value)); tpl.value = ''; });
      return [
        C.group('Generator', [
          el('div', { class: 'btn-row' }, tpl),
          el('canvas', { id: 'gen-preview', class: 'gen-preview', title: 'One step: grey = the piece, orange = its children, dots = where each child starts' }),
          C.seg({ options: [['line', 'Straight lines'], ['arc', 'Arcs']], get: () => S.def.motif, set: (v) => { S.def.motif = v; C.sync('vis'); changed('vector'); } }).el,
          C.show(C.slider({ label: 'Arc bulge °', min: -300, max: 300, step: 1, get: () => S.def.bulge, set: (v) => { S.def.bulge = v; changed('vector'); } }).el, () => isRules() && S.def.motif === 'arc'),
          el('h4', {}, 'Rules'), ed.rules,
          el('h4', {}, 'Starting pieces'), ed.seeds,
        ], isRules),
      ];
    })(),
    C.group('Style', [
      C.check({ label: 'Show every level (off = only the smallest arcs)', get: () => S.def.showAll, set: (v) => { S.def.showAll = v; changed('vector'); } }).el,
      C.slider({ label: 'Line width', min: 0.2, max: 8, log: true, get: () => S.def.lineWidth, set: (v) => { S.def.lineWidth = v; changed('vector'); } }).el,
      C.slider({ label: 'Width per level', min: 0.4, max: 1, get: () => S.def.widthFalloff, set: (v) => { S.def.widthFalloff = v; changed('vector'); } }).el,
      C.color({ label: 'Background', get: () => S.def.background, set: (v) => { S.def.background = v; changed('vector'); } }).el,
      el('p', { class: 'hint' }, 'Colours run from the first stop (outer arcs) to the last (smallest arcs).'),
      C.paletteEditor({ cyclic: false, get: () => S.def.palette, set: (p) => (S.def.palette = p), onChange: () => changed('vector') }).el,
    ], isVec),

    // ---- 3D
    C.group('Shape', [
      C.select({ label: 'Shape', options: [['mandelbulb', 'Mandelbulb'], ['mandelbox', 'Mandelbox'], ['menger', 'Menger sponge'], ['sierpinski', 'Sierpinski tetrahedron'], ['quatjulia', 'Quaternion Julia'], ['kifs', 'Kaleidoscopic IFS']], get: () => S.def.kind, set: (v) => {
        S.def.kind = v;
        S.def.iterations = F3D.ITER_DEFAULT[v] || 10;
        if (v === 'quatjulia' && !S.def.julia) { S.def.juliaC = [-0.291, -0.399, 0.339]; S.def.cW = 0.437; }
        S.def.camera.dist = v === 'mandelbox' ? Math.max(8, 2 * (Math.abs(S.def.boxScale) + 1) / Math.max(Math.abs(S.def.boxScale) - 1, 0.2) * 1.4) : v === 'menger' ? 3.6 : v === 'kifs' ? 4.5 : 3;
        S.homeCam = clone(S.def.camera);
        C.sync(); changed('3d');
      } }).el,
      C.slider({ label: 'Iterations', min: 1, max: 30, step: 1, get: () => S.def.iterations, set: (v) => { S.def.iterations = v; changed('3d'); } }).el,
      C.show(C.slider({ label: 'Power', min: 2, max: 16, get: () => S.def.power, set: (v) => { S.def.power = v; changed('3d'); } }).el, () => isThree() && S.def.kind === 'mandelbulb'),
      C.show(C.slider({ label: 'Box scale', min: -3, max: 3, get: () => S.def.boxScale, set: (v) => { S.def.boxScale = Math.abs(v) < 1.05 ? Math.sign(v || 1) * 1.05 : v; changed('3d'); } }).el, () => isThree() && S.def.kind === 'mandelbox'),
      C.show(el('div', {},
        C.slider({ label: 'Scale per fold', min: 1.2, max: 4, get: () => S.def.kScale, set: (v) => { S.def.kScale = v; changed('3d'); } }).el,
        C.slider({ label: 'Twist per fold °', min: -90, max: 90, get: () => S.def.kAngle, set: (v) => { S.def.kAngle = v; changed('3d'); } }).el,
        el('p', { class: 'hint' }, 'Scale 3 with no twist is the Menger sponge; small changes give very different crystals.')), () => isThree() && S.def.kind === 'kifs'),
      C.show(el('div', {},
        el('p', { class: 'hint' }, 'z → z² + c with z and c quaternions (4D), sliced through 3D space.'),
        [0, 1, 2].map((i) => C.slider({ label: 'c ' + 'xyz'[i], min: -1, max: 1, prec: 4, get: () => S.def.juliaC[i], set: (v) => { S.def.juliaC[i] = v; changed('3d'); } }).el),
        C.slider({ label: 'c w', min: -1, max: 1, prec: 4, get: () => S.def.cW, set: (v) => { S.def.cW = v; changed('3d'); } }).el), () => isThree() && S.def.kind === 'quatjulia'),
      C.show(el('div', {},
        C.check({ label: 'Julia mode (fixed c instead of the position)', get: () => S.def.julia, set: (v) => { S.def.julia = v; C.sync('vis'); changed('3d'); } }).el,
        C.show(el('div', {}, [0, 1, 2].map((i) => C.slider({ label: 'c ' + 'xyz'[i], min: -1.5, max: 1.5, prec: 4, get: () => S.def.juliaC[i], set: (v) => { S.def.juliaC[i] = v; changed('3d'); } }).el)), () => isThree() && S.def.julia)),
      () => isThree() && (S.def.kind === 'mandelbulb' || S.def.kind === 'mandelbox')),
    ], isThree),
    C.group('Look', [
      C.paletteEditor({ get: () => S.def.palette, set: (p) => (S.def.palette = p), onChange: () => changed('3d') }).el,
      C.slider({ label: 'Colour density', min: 0.1, max: 10, log: true, get: () => S.def.density, set: (v) => { S.def.density = v; changed('3d'); } }).el,
      C.slider({ label: 'Colour offset', min: 0, max: 1, get: () => S.def.offset, set: (v) => { S.def.offset = v; changed('3d'); } }).el,
      el('div', { class: 'grid2' },
        C.color({ label: 'Sky', get: () => S.def.bgTop, set: (v) => { S.def.bgTop = v; changed('3d'); } }).el,
        C.color({ label: 'Ground', get: () => S.def.bgBottom, set: (v) => { S.def.bgBottom = v; changed('3d'); } }).el),
      el('div', { class: 'grid2' },
        C.slider({ label: 'Light direction °', min: -180, max: 180, step: 1, get: () => S.def.lightYaw, set: (v) => { S.def.lightYaw = v; changed('3d'); } }).el,
        C.slider({ label: 'Light height °', min: -10, max: 90, step: 1, get: () => S.def.lightPitch, set: (v) => { S.def.lightPitch = v; changed('3d'); } }).el),
      C.slider({ label: 'Ambient occlusion', min: 0, max: 2, get: () => S.def.ao, set: (v) => { S.def.ao = v; changed('3d'); } }).el,
      C.slider({ label: 'Fog', min: 0, max: 2, get: () => S.def.fog, set: (v) => { S.def.fog = v; changed('3d'); } }).el,
      C.check({ label: 'Soft shadows (slower)', get: () => S.def.shadows, set: (v) => { S.def.shadows = v; changed('3d'); } }).el,
    ], isThree),

    ...attractorGroups(),

    C.group('Maps', [ifsEditor()], isIFS),
    C.group('Colouring', [
      C.seg({ options: [['transform', 'Map colours'], ['palette', 'Density gradient']], get: () => S.def.colorMode, set: (v) => { S.def.colorMode = v; changed('ifs-color'); } }).el,
      C.slider({ label: 'Gamma', min: 0.5, max: 6, get: () => S.def.gamma, set: (v) => { S.def.gamma = v; changed('ifs-color'); } }).el,
      C.slider({ label: 'Brightness', min: 0.2, max: 6, log: true, get: () => S.def.brightness, set: (v) => { S.def.brightness = v; changed('ifs-color'); } }).el,
      C.color({ label: 'Background', get: () => S.def.background, set: (v) => { S.def.background = v; changed('ifs-color'); } }).el,
      C.show(C.paletteEditor({ cyclic: false, get: () => S.def.palette, set: (p) => (S.def.palette = p), onChange: () => changed('ifs-color') }).el, () => isIFS() && S.def.colorMode === 'palette'),
    ], isIFS),

    C.group('Library', [saveButtons()]),
  );
}

function buildLibraryTab() {
  const t = $('#tab-library');
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Search name or formula…' });
  search.addEventListener('input', () => { S.libSearch = search.value.trim().toLowerCase(); renderLibrary(); });
  const importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  importInput.addEventListener('change', () => { if (importInput.files[0]) importFile(importInput.files[0]); importInput.value = ''; });
  t.append(
    el('div', { class: 'lib-top' },
      search,
      C.seg({ tag: 'lib', options: [['all', 'All'], ['fav', '★ Favourites'], ['mine', 'Mine'], ['builtin', 'Built-in']], get: () => S.libFilter, set: (v) => { S.libFilter = v; renderLibrary(); } }).el,
      el('div', { id: 'lib-tags', class: 'chips' })),
    el('div', { class: 'btn-row' },
      btn('Save current', () => saveToLibrary(false), 'primary'),
      btn('Import…', () => importInput.click(), '', 'Import a .json library file'),
      btn('Export mine', exportLibrary, '', 'Download your saved fractals as .json'),
      btn('Open code…', openCode, '', 'Open a share code or link someone sent you')),
    el('div', { id: 'lib-grid', class: 'lib-grid' }),
    importInput);
  S.libBuilt = true;
}

function bindTabs() {
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === 'tab-' + b.dataset.tab));
      if (b.dataset.tab === 'library') renderLibrary();
    }));
}

// Fractal explorer — shared state, canvases, type helpers and state changes (loading a fractal, the view, the header).
// These files are plain scripts that share one scope (top-level const / let / function are visible to the
// files loaded after them); see index.html for the order.

const { el, clone } = U;
const $ = (s) => document.querySelector(s);
const btn = C.btn;

const S = {
  def: null, homeView: null, libId: null, activeId: null, history: [],
  aa: 2, resScale: 1, juliaPreview: false, playing: true, time: 0, animated: false,
  cycle: false, cycleSpeed: 0.1, ifsQuality: 25,
  exportPreset: 'screen', exportW: 3840, exportH: 2160, exportAA: 3,
  interacting: false, mouse: null, juliaPending: null, errorShown: false,
  libFilter: 'all', libSearch: '', libBuilt: false,
  pv: null, autoIter: true, panAcc: [0, 0],
  homeCam: null, showMinimap: true, tour: false, tourWaitFrom: 0, libTag: '',
  smart: null, smartAA: true,
  fastZoom: true, smoothZoom: true, zoomAnim: null, zoomAnchor: null, zoomAnchorAt: 0,
};
const DESKTOP = /Electron/i.test(navigator.userAgent);
// Desktop-shell hooks (electron/preload.js); harmless no-ops in a browser.
const desktop = {
  keepAwake: (on) => { try { window.fractalsimDesktop && window.fractalsimDesktop.keepAwake(on); } catch { /* ignore */ } },
  taskDone: () => { try { window.fractalsimDesktop && window.fractalsimDesktop.taskDone(); } catch { /* ignore */ } },
};

const app = $('#app');
const stage = $('#stage');
const glCanvas = $('#gl-canvas');
const ifsCanvas = $('#ifs-canvas');
const juliaBox = $('#julia-inset');
const juliaCanvas = $('#julia-canvas');
const vecCanvas = $('#vec-canvas');
const ifsCtx = ifsCanvas.getContext('2d');
const vecCtx = vecCanvas.getContext('2d');
let viewer = null, juliaR = null;
let ifsState = null, ifsImage = null, ifsNeedsImage = false;
let vecDirty = true, vecInfo = null;
let interactTimer = 0, lastTs = 0;
// 3D: a low-res canvas redrawn on every camera change, with a full-res canvas filled in strips on top.
const c3lo = $('#c3-lo'), c3hi = $('#c3-hi');
let r3lo = null, r3hi = null;
const s3 = { dirty: true, hiY: 0, changedAt: 0, strip: 16 };
let anim = null; // animated zoom (explore)
// Iterations: fixed (slider) or smart — measured per view by a tiny probe render (updateSmartIter).
// Until a view has been measured, the last measurement for this formula (or a depth rule) is used.
const ruleIter = () => Defs.effIter(S.def, S.pv.L, true);
const smartDefKey = () => JSON.stringify([S.def.formula, S.def.init, S.def.julia, S.def.juliaC, S.def.k, S.def.bailout, S.def.escape, S.def.converge, S.def.epsilon]);
const effIter = () => {
  if (!S.autoIter || isFn()) return Math.max(1, Math.round(S.def.maxIter));
  return S.smart && S.smart.defKey === smartDefKey() ? S.smart.iter : ruleIter();
};

function updateSmartIter() {
  if (!S.autoIter || !isEsc() || isFn() || !viewer || S.interacting || anim || S.zoomAnim || (S.playing && S.animated) || S.cycle) return;
  const defKey = smartDefKey();
  const viewKey = defKey + JSON.stringify(S.def.view);
  if (S.smart && S.smart.viewKey === viewKey) return;
  // A slow probe (deep spot, heavy formula) gets a cool-down so repeated pans don't stutter.
  if (performance.now() < (S.probeCooldown || 0)) return;
  const prev = S.smart && S.smart.defKey === defKey ? S.smart.iter : 0;
  const cap = Math.min(60000, Math.max(ruleIter() * 2, prev * 2, 2000));
  const t0 = performance.now();
  const r = viewer.probeIter(S.def, S.pv, cap, aspect(), S.time);
  const took = performance.now() - t0;
  if (took > 40) S.probeCooldown = performance.now() + Math.min(3000, took * 10);
  if (r == null) return; // deep view still waiting for its reference orbit
  // Sticky limit: every change re-renders the view and flips boundary pixels between black and
  // coloured (visible flicker), so only raise it when clearly needed — with headroom, so it doesn't
  // creep up in small steps — and only lower it when it's far too high.
  const iter = !prev ? r : r > prev * 1.25 ? Math.min(cap, Math.round(r * 1.3)) : r < prev * 0.4 ? r : prev;
  S.smart = { defKey, viewKey, iter };
  updateHud();
}
const builtinThumbs = {};
const errEls = {};

const isEsc = () => !!S.def && S.def.type === 'escape';
const isIFS = () => !!S.def && S.def.type === 'ifs';
const isAttr = () => !!S.def && S.def.type === 'attractor';
const isDensity = () => isIFS() || isAttr(); // drawn as a point density (ifs.js accumulator)
const isFn = () => isEsc() && S.def.coloring === 'domain';
const isVec = () => !!S.def && S.def.type === 'vector';
const isRules = () => isVec() && S.def.kind === 'rules';
const isKusch = () => isVec() && S.def.kind !== 'rules';
const isThree = () => !!S.def && S.def.type === '3d';
const is2D = () => !!S.def && S.def.type !== '3d';
const KNOWN_TYPES = ['escape', 'ifs', 'vector', '3d', 'attractor'];
// 'function' is not a stored type: it's an escape-time definition plotted by domain colouring.
const TYPE_DEFAULTS = { escape: () => Defs.escapeDefaults(), function: () => Defs.functionDefaults(), ifs: () => Defs.ifsDefaults(), vector: () => Vec.defaults(), '3d': () => F3D.defaults(), attractor: () => Attr.defaults() };
const TYPE_RANDOM = { escape: () => Defs.randomEscape(), function: () => Defs.randomFunction(), ifs: () => Defs.randomIFS(), vector: () => Vec.random(), '3d': () => F3D.random(), attractor: () => Attr.random() };
const TYPE_LABEL = { ifs: 'IFS', vector: 'Vector', '3d': '3D', attractor: 'Attractor' };
const makerType = () => (isFn() ? 'function' : S.def.type);
const aspect = () => (stage.clientWidth && stage.clientHeight ? stage.clientWidth / stage.clientHeight : 1.6);

// ---------------------------------------------------------------- state changes
function computeAnimated() {
  return isEsc() && (Formula.usesVar(S.def.formula, 't') || (!S.def.julia && Formula.usesVar(S.def.init, 't')));
}

function changed(kind = 'escape') {
  if (kind === 'escape') {
    S.animated = computeAnimated();
    C.sync('anim');
    C.sync('vis');
  } else if (kind === 'vector') { vecDirty = true; drawGenPreview(); }
  else if (kind === '3d') mark3d();
  else if (kind === 'ifs' || kind === 'attractor') restartIFS();
  else if (kind === 'ifs-color') ifsNeedsImage = true;
  updateHeader();
}

function setView(view) {
  S.pv = HP.fromView(view);
  commitView();
}

function commitView() {
  HP.ensureP(S.pv);
  S.def.view = HP.toView(S.pv);
}

function loadDef(def, { libId = null, activeId = null, push = true } = {}) {
  if (S.auto && S.auto.on) stopAuto();
  if (push && S.def) {
    S.history.push({ def: clone(S.def), home: clone(S.homeView), libId: S.libId, activeId: S.activeId });
    if (S.history.length > 40) S.history.shift();
  }
  const d = Defs.normalize(def);
  if ((d.type === 'ifs' || d.type === 'attractor') && !d.view) d.view = IFS.fit(d, aspect());
  S.def = d;
  setView(d.view);
  S.homeView = clone(d.view);
  S.libId = libId;
  S.activeId = activeId;
  S.bmKey = bookmarkKey(d, libId, activeId);
  restoreBookmarks(d);
  glCanvas.hidden = d.type !== 'escape';
  ifsCanvas.hidden = d.type !== 'ifs' && d.type !== 'attractor';
  vecCanvas.hidden = d.type !== 'vector';
  c3lo.hidden = c3hi.hidden = d.type !== '3d';
  if (d.type === '3d') { S.homeCam = clone(d.camera); mark3d(); }
  anim = null;
  S.zoomAnim = null;
  juliaBox.hidden = true;
  S.animated = computeAnimated();
  S.lastGood = null;
  setError(null);
  C.sync();
  if (d.type === 'ifs' || d.type === 'attractor') restartIFS();
  vecDirty = true;
  updateHeader();
  updateHud();
  markLibraryActive();
  minimapBase();
  renderBookmarks();
  drawGenPreview();
}

function goBack() {
  const h = S.history.pop();
  if (!h) return U.toast('Nothing to go back to');
  loadDef(h.def, { libId: h.libId, activeId: h.activeId, push: false });
  S.homeView = h.home;
}

function resetView() {
  anim = null;
  S.zoomAnim = null;
  if (isThree()) {
    S.def.camera = clone(S.homeCam);
    C.sync('cam');
    mark3d();
    return;
  }
  setView(S.homeView);
  viewChanged();
}

function fitView() {
  if (!isDensity()) return;
  setView(IFS.fit(S.def, aspect()));
  S.homeView = clone(S.def.view);
  viewChanged();
}

function updateHeader() {
  const d = S.def;
  $('#cur-name').textContent = d.name || 'Untitled';
  $('#cur-meta').textContent = d.type === 'ifs'
    ? `IFS · ${d.transforms.length} map${d.transforms.length === 1 ? '' : 's'}`
    : d.type === 'attractor'
      ? `${Attr.GROUPS[Attr.KINDS[d.kind].group]} · ${Attr.KINDS[d.kind].label}`
    : d.coloring === 'domain'
      ? `Complex function · w = ${d.formula}${d.maxIter > 1 ? ` (${Math.round(d.maxIter)} steps)` : ''}`
    : d.type === 'vector'
      ? (d.kind === 'rules'
        ? `Vector generator · ${d.rules.length} rule${d.rules.length === 1 ? '' : 's'} · ${d.auto ? 'infinite detail' : d.depth + ' levels'}`
        : `Vector · ${d.auto ? 'infinite detail' : d.depth + ' levels'} · split ${U.fmtNum(d.split, 3)}`)
      : d.type === '3d'
        ? `3D · ${d.kind}${d.julia ? ' Julia' : ''}${d.kind === 'mandelbulb' ? ' · power ' + U.fmtNum(d.power, 3) : ''}`
        : `${d.julia ? 'Julia' : 'Escape-time'} · z → ${d.formula}`;
  if (!app.hidden) document.title = (d.name || 'Untitled') + ' · Mathsim';
}

function setError(e) {
  const banner = $('#error-banner');
  for (const k of Object.keys(errEls)) errEls[k].hidden = true;
  if (!e) {
    banner.hidden = true;
    S.errorShown = false;
    return;
  }
  S.errorShown = true;
  const target = e.field === 'init' ? errEls.init : errEls.formula;
  if (target) {
    target.textContent = e.message;
    target.hidden = false;
  }
  banner.textContent = (e.field === 'init' ? 'Start value: ' : 'Formula: ') + e.message;
  banner.hidden = false;
}

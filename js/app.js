(() => {
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

  // ---------------------------------------------------------------- rendering
  function drawMain() {
    if (!viewer) return;
    updateSmartIter();
    viewer.adaptive = S.smartAA;
    viewer.fastZoom = S.fastZoom;
    const auto = S.auto.on && S.auto.targetPv;
    viewer.keepPreview = !!auto;
    viewer.hidePartial = !!auto;
    // Render where the motion is going (automatic-zoom keyframe, end of a flight, end of a smooth
    // zoom); the screen shows the current in-between position by rescaling finished images.
    const renderPv = auto ? S.auto.targetPv
      : anim ? anim.endPv
        : S.zoomAnim ? S.zoomAnim.dest
          : S.pv;
    const scene = {
      def: S.def, pv: renderPv, aa: S.aa, interacting: S.interacting || !!auto, time: S.time,
      iter: auto ? S.auto.iter : effIter(),
      animate: (S.playing && S.animated) || S.cycle,
      // the point being zoomed towards, for placing the deep-zoom reference
      anchor: auto ? S.auto.P : S.zoomAnchor && performance.now() - S.zoomAnchorAt < 1500 ? S.zoomAnchor : null,
    };
    viewer.update(scene);
    if (viewer.error) {
      setError(viewer.error);
      // Keep showing the last formula that compiled while the user is mid-edit.
      if (S.lastGood) viewer.update(Object.assign({}, scene, { def: Object.assign({}, S.def, S.lastGood) }));
    } else {
      S.lastGood = { formula: S.def.formula, init: S.def.init };
      if (S.errorShown) setError(null);
    }
    const before = viewer.progress;
    viewer.work(S.interacting || auto ? 10 : 12);
    viewer.present(S.pv);
    if (before !== viewer.progress || viewer.waitingRef) updateHud();
  }

  function drawJulia(c) {
    if (!juliaR) return;
    const d = Object.assign({}, S.def, { julia: true, juliaC: c, maxIter: Math.min(S.def.maxIter, 400) });
    try {
      juliaR.draw(d, { cx: 0, cy: 0, scale: 1.6, rot: 0 }, { aa: 1, time: S.time });
      $('#julia-label').textContent = `c = ${U.fmtNum(c[0], 5)} ${c[1] < 0 ? '−' : '+'} ${U.fmtNum(Math.abs(c[1]), 5)}i`;
    } catch { /* main view shows the error */ }
  }

  function restartIFS() {
    if (!isDensity()) return;
    const w = ifsCanvas.width, h = ifsCanvas.height;
    if (!w || !h) return;
    if (!ifsState || ifsState.w !== w || ifsState.h !== h) {
      ifsState = IFS.createAccum(w, h);
      ifsImage = ifsCtx.createImageData(w, h);
    }
    IFS.reset(ifsState, HP.approx(S.pv), IFS.prepare(S.def));
    ifsState.target = w * h * S.ifsQuality;
    ifsNeedsImage = true;
  }

  function stepIFS() {
    if (!ifsState) return;
    let worked = false;
    if (ifsState.prep && ifsState.total < ifsState.target) {
      const t0 = performance.now();
      const budget = S.interacting ? 6 : 14;
      do IFS.iterate(ifsState, 20000);
      while (performance.now() - t0 < budget && ifsState.total < ifsState.target);
      worked = true;
    }
    if (worked || ifsNeedsImage) {
      IFS.toImage(ifsState, S.def, ifsImage);
      ifsCtx.putImageData(ifsImage, 0, 0);
      ifsNeedsImage = false;
      updateHud();
    }
  }

  // ---------------------------------------------------------------- 3D
  function mark3d() {
    s3.dirty = true;
    s3.hiY = 0;
    s3.changedAt = performance.now();
    if (r3hi) r3hi.clear();
  }

  function step3d() {
    if (!r3lo || !r3hi) return;
    if (s3.dirty) {
      s3.dirty = false;
      try { r3lo.draw(S.def, S.def.camera); setError(null); } catch (e) { setError(e); }
      updateHud();
    }
    const H = c3hi.height, W = c3hi.width;
    if (s3.hiY >= H || performance.now() - s3.changedAt < 180) return; // wait until the camera settles
    const t0 = performance.now();
    while (s3.hiY < H && performance.now() - t0 < 12) {
      const h = Math.min(s3.strip, H - s3.hiY);
      const ts = performance.now();
      r3hi.draw(S.def, S.def.camera, { scissor: [0, H - s3.hiY - h, W, h] });
      r3hi.gl.finish();
      const dt = performance.now() - ts;
      s3.hiY += h;
      if (dt < 4 && s3.strip < 256) s3.strip *= 2;
      else if (dt > 16 && s3.strip > 2) s3.strip = Math.max(2, s3.strip >> 1);
    }
    updateHud();
  }

  function orbit(dx, dy) {
    const cam = S.def.camera;
    cam.yaw = (cam.yaw - dx * 0.35) % 360;
    cam.pitch = U.clamp(cam.pitch + dy * 0.35, -89, 89);
    C.sync('cam');
    mark3d();
  }

  function panCam(dx, dy) {
    const cam = S.def.camera;
    const b = F3D.camBasis(cam);
    const k = (cam.dist * Math.tan(((cam.fov || 45) * Math.PI) / 360) * 2) / Math.max(1, stage.clientHeight);
    cam.tx += (-b.right[0] * dx + b.up[0] * dy) * k;
    cam.ty += (-b.right[1] * dx + b.up[1] * dy) * k;
    cam.tz += (-b.right[2] * dx + b.up[2] * dy) * k;
    C.sync('cam');
    mark3d();
  }

  // ---------------------------------------------------------------- explore: animated zoom + tour
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

  function animateZoom(qx, qy, zoomFactor, dur = 1500) {
    const from = HP.clone(S.pv);
    // where the flight ends — that's what gets rendered; the frames in between just rescale it
    const endPv = HP.clone(from);
    const cr = Math.cos(from.rot), sr = Math.sin(from.rot);
    HP.move(endPv, qx * cr - qy * sr, qx * sr + qy * cr);
    endPv.L = from.L - Math.log2(zoomFactor);
    HP.ensureP(endPv);
    anim = { from, qx, qy, L1: endPv.L, endPv, t0: performance.now(), dur, target: HP.pointAt(S.pv, qx, qy) };
  }

  function stepAnim() {
    const p = Math.min(1, (performance.now() - anim.t0) / anim.dur), e = ease(p);
    const pv = HP.clone(anim.from);
    const cr = Math.cos(pv.rot), sr = Math.sin(pv.rot);
    HP.move(pv, (anim.qx * cr - anim.qy * sr) * e, (anim.qx * sr + anim.qy * cr) * e);
    pv.L = anim.from.L + (anim.L1 - anim.from.L) * e;
    S.pv = p >= 1 ? anim.endPv : pv; // land exactly on the rendered destination
    if (anim.L1 < anim.from.L) { S.zoomAnchor = anim.target; S.zoomAnchorAt = performance.now(); }
    viewChanged(true);
    if (p >= 1) { anim = null; S.tourWaitFrom = performance.now(); }
  }

  function findSpot() {
    if (!isEsc()) return;
    stopAuto();
    const from = HP.clone(S.pv);
    U.toast('Looking for detail…');
    searchSpot(from, Math.min(effIter(), from.L > -44 ? 20000 : 4000), from.L > -44 ? 400 : 160, (point) => {
      if (!HP.same(S.pv, from)) return; // the view moved while searching: drop the result
      if (!point) {
        U.toast('Nothing but the inside of the set here — zooming out a bit');
        animateZoom(0, 0, 1 / 4, 900);
        return;
      }
      // the point as a screen offset from the centre (normalized, y up)
      const d = HP.diff(Object.assign({}, point, { L: from.L }), from);
      const c = Math.cos(from.rot), s = Math.sin(from.rot);
      animateZoom(c * d[0] + s * d[1], -s * d[0] + c * d[1], U.rand(10, 40));
    });
  }

  function stopTour() {
    anim = null;
    stopAuto();
  }

  // ---------------------------------------------------------------- automatic zoom (endless dive)
  // Keyframe pipeline: one full image is rendered per halving of the scale. The screen smoothly
  // magnifies the last finished keyframe (at most 2×) while the next, deeper one renders; if rendering
  // can't keep up, the zoom waits rather than showing mush. The path homes in on a target point that a
  // background worker keeps re-picking from the most detailed area ahead.
  S.auto = { on: false, speed: 1, steer: true };
  let exploreWorker = null, exploreSeq = 0;

  function pathAt(L) {
    const a = S.auto;
    const g = (2 ** Math.min(0, L - a.L0)) ** 1.5; // how much of the offset from the target remains
    const P = Object.assign(HP.clone(a.P), { L: a.L0, rot: a.C0.rot });
    HP.setP(P, Math.max(P.P, a.C0.P));
    const d = HP.diff(a.C0, P); // start centre relative to the target, in units of the start scale
    const pv = HP.clone(P);
    HP.move(pv, d[0] * g, d[1] * g);
    pv.L = L;
    HP.ensureP(pv);
    return pv;
  }

  function keyframeIter(pv) {
    const a = S.auto;
    if (!S.autoIter || isFn()) return Math.max(1, Math.round(S.def.maxIter));
    const rule = Defs.effIter(S.def, pv.L, true);
    const prev = a.iter || 0;
    // grow by at most 1.6× per keyframe, never drop sharply (avoids flicker between keyframes)
    const cap = Math.min(60000, Math.max(prev ? prev * 1.6 : rule * 2, 1000));
    const r = viewer.probeIter(S.def, pv, cap, aspect(), S.time);
    const m = r ?? Math.min(rule, cap);
    // sticky between keyframes (a change flips boundary pixels between black and coloured):
    // only raise when clearly needed, with headroom so the next few keyframes can keep it
    if (!prev) return m;
    return m > prev * 1.2 ? Math.min(60000, Math.round(m * 1.3)) : prev;
  }

  function startAuto() {
    if (!isEsc() || !viewer) return U.toast('Automatic zoom works on escape-time fractals');
    anim = null;
    S.zoomAnim = null;
    Object.assign(S.auto, {
      on: true, P: HP.clone(S.pv), C0: HP.clone(S.pv), L0: S.pv.L,
      targetPv: null, doneL: null, keys: 0, iter: effIter(), searching: false, misses: 0, waiting: false, uiAt: 0,
    });
    if (S.auto.steer) requestSteer();
    C.sync('auto');
    updateHud();
  }

  function stopAuto() {
    if (!S.auto.on) return;
    S.auto.on = false;
    S.auto.targetPv = null;
    if (viewer) viewer.keepPreview = false;
    commitView();
    C.sync('view');
    C.sync('auto');
    updateHud();
  }

  // Most detailed spot in a view, searched in a background worker (falls back to this page).
  // cb(point | null) with point = { x, y, P } (precise).
  function searchSpot(view, iter, samples, cb) {
    const job = { def: clone(S.def), view: HP.toView(view), aspect: aspect(), iter, samples };
    const id = ++exploreSeq;
    const done = (point) => { if (id === exploreSeq) cb(point); };
    const here = () => setTimeout(() => {
      const pv = HP.fromView(job.view);
      const s = Explore.findSpot(job.def, pv, job.aspect, job.iter, Math.min(job.samples, 160));
      done(s ? HP.pointAt(pv, s.qx, s.qy) : null);
    }, 0);
    if (exploreWorker === null) {
      try { exploreWorker = new Worker('js/exploreworker.js'); } catch { exploreWorker = false; }
      if (exploreWorker) exploreWorker.onerror = (ev) => { ev.preventDefault(); exploreWorker = false; here(); };
    }
    if (!exploreWorker) return here();
    exploreWorker.onmessage = (ev) => { if (ev.data.id === id) done(ev.data.point); };
    exploreWorker.postMessage(Object.assign({ id }, job));
  }

  // Looks ahead along the dive for the most detailed spot and bends the path towards it.
  function requestSteer() {
    const a = S.auto;
    if (!a.on || a.searching) return;
    a.searching = true;
    const view = pathAt((a.targetPv || S.pv).L - 1.5);
    searchSpot(view, Math.min(Math.round((a.iter || 500) * 1.5), 30000), view.L > -44 ? 300 : 120, steerTo);
  }

  function steerTo(point) {
    const a = S.auto;
    a.searching = false;
    if (!a.on) return;
    if (!point) {
      if (++a.misses >= 3) { U.toast('Automatic zoom reached the inside of the set — stopping'); stopAuto(); }
      return;
    }
    a.misses = 0;
    // restart the path from where the screen is now, heading for the new point
    a.C0 = HP.clone(S.pv);
    a.L0 = S.pv.L;
    a.P = { x: point.x, y: point.y, P: point.P, L: S.pv.L, rot: S.pv.rot };
  }

  function stepAuto(dt) {
    const a = S.auto;
    if (!viewer || !isEsc()) return stopAuto();
    const D = viewer.D;
    if (!a.targetPv) { a.targetPv = pathAt(S.pv.L); a.iter = keyframeIter(a.targetPv); }
    const done = D && HP.same(D.view, a.targetPv) && !D.queue.length && !viewer.waitingRef;
    if (done) a.doneL = a.targetPv.L;
    // next keyframe once the screen has caught up with the finished one (so it fully covers the view)
    if (done && S.pv.L <= a.targetPv.L + 0.15) {
      a.keys++;
      a.targetPv = pathAt(a.targetPv.L - 1);
      a.iter = keyframeIter(a.targetPv);
      if (a.steer && a.keys % 3 === 0) requestSteer();
    }
    const want = S.pv.L - a.speed * dt;
    const limit = a.doneL == null ? S.pv.L : a.doneL - 0.95; // magnify a finished keyframe ≤ ~2×
    const L = Math.max(want, limit);
    a.waiting = want < limit - 1e-9;
    if (L < S.pv.L - 1e-12) {
      S.pv = pathAt(L);
      commitView();
      // text fields/minimap/HUD are refreshed a few times a second, not every frame
      const now = performance.now();
      if (now - (a.uiAt || 0) > 150) { a.uiAt = now; C.sync('view'); updateHud(); minimapOverlay(); }
    }
  }

  function frame(ts) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    // another section of the app is showing: render nothing (exports and videos run separately)
    if (app.hidden) { requestAnimationFrame(frame); return; }
    if (S.zoomAnim) stepZoom(dt);
    if (anim) stepAnim();
    if (S.auto.on) stepAuto(dt);
    if (isThree()) step3d();
    else if (isEsc()) {
      if (S.playing && S.animated) S.time += dt;
      if (S.cycle) S.def.offset = (((S.def.offset + dt * S.cycleSpeed) % 1) + 1) % 1;
      drawMain();
      if (S.juliaPending) { drawJulia(S.juliaPending); S.juliaPending = null; }
    } else if (isDensity()) stepIFS();
    else if (isVec() && vecDirty) drawVec();
    requestAnimationFrame(frame);
  }

  function drawVec() {
    vecDirty = false;
    const px = vecCanvas.height / Math.max(1, stage.clientHeight);
    vecInfo = Vec.draw(vecCtx, S.def, HP.approx(S.pv), vecCanvas.width, vecCanvas.height, px);
    updateHud();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(stage.clientWidth * dpr * S.resScale));
    const h = Math.max(1, Math.round(stage.clientHeight * dpr * S.resScale));
    if (viewer && (viewer.W !== w || viewer.H !== h)) viewer.resize(w, h);
    const iw = Math.max(1, Math.round(stage.clientWidth * Math.min(dpr, 1.5) * S.resScale));
    const ih = Math.max(1, Math.round(stage.clientHeight * Math.min(dpr, 1.5) * S.resScale));
    if (ifsCanvas.width !== iw || ifsCanvas.height !== ih) { ifsCanvas.width = iw; ifsCanvas.height = ih; restartIFS(); }
    if (vecCanvas.width !== w || vecCanvas.height !== h) { vecCanvas.width = w; vecCanvas.height = h; vecDirty = true; }
    const lw = Math.max(1, Math.round(w / 3)), lh = Math.max(1, Math.round(h / 3));
    if (c3hi.width !== w || c3hi.height !== h || c3lo.width !== lw) {
      c3hi.width = w; c3hi.height = h; c3lo.width = lw; c3lo.height = lh;
      mark3d();
    }
    minimapOverlay();
    const js = Math.round(200 * dpr);
    if (juliaCanvas.width !== js) { juliaCanvas.width = js; juliaCanvas.height = js; }
  }

  // ---------------------------------------------------------------- view / interaction
  // Normalized screen coordinates (y up, 1 = half the viewport height).
  function screenQ(x, y) {
    const w = stage.clientWidth, h = stage.clientHeight;
    return [(x - w / 2) / (h / 2), -(y - h / 2) / (h / 2)];
  }

  // Approximate plane point (doubles) under a screen position.
  function toPlane(x, y) {
    const v = HP.approx(S.pv);
    const [qx, qy] = screenQ(x, y);
    const cr = Math.cos(v.rot), sr = Math.sin(v.rot);
    return [v.cx + (qx * cr - qy * sr) * v.scale, v.cy + (qx * sr + qy * cr) * v.scale];
  }

  function markInteract() {
    S.interacting = true;
    clearTimeout(interactTimer);
    interactTimer = setTimeout(() => { S.interacting = false; }, 200);
  }

  function viewChanged(fromAnim) {
    if (fromAnim !== true && (anim || S.auto.on)) stopTour();
    markInteract();
    commitView();
    if (isDensity()) restartIFS();
    vecDirty = true;
    C.sync('view');
    updateHud();
    minimapOverlay();
  }

  function zoomAt(x, y, f) {
    if (isThree()) {
      S.def.camera.dist = U.clamp(S.def.camera.dist * f, 1e-5, 200);
      C.sync('cam');
      mark3d();
      return;
    }
    if (f < 1) { const [qx, qy] = screenQ(x, y); S.zoomAnchor = HP.pointAt(S.pv, qx, qy); S.zoomAnchorAt = performance.now(); }
    S.pv = zoomedPv(S.pv, x, y, f);
    viewChanged();
  }

  // pv zoomed by f around screen position (x, y) (that point stays put). Returns a new view.
  function zoomedPv(pv0, x, y, f) {
    const pv = HP.clone(pv0);
    const minL = isEsc() ? -1e7 : -40; // IFS and vector fractals use doubles (~1e-12 zoom limit)
    const L2 = U.clamp(pv.L + Math.log2(f), minL, 12);
    const k = 1 - 2 ** (L2 - pv.L);
    const [qx, qy] = screenQ(x, y);
    const cr = Math.cos(pv.rot), sr = Math.sin(pv.rot);
    HP.move(pv, (qx * cr - qy * sr) * k, (qx * sr + qy * cr) * k);
    pv.L = L2;
    HP.ensureP(pv);
    return pv;
  }

  // Smooth zoom: wheel/keyboard/double-click steps are queued and eased in over ~150 ms.
  function queueZoom(x, y, f) {
    if (!S.smoothZoom) return zoomAt(x, y, f);
    let z = S.zoomAnim;
    if (z && Math.hypot(z.x - x, z.y - y) < 40) { z.rem += Math.log(f); z.x = x; z.y = y; }
    else {
      if (z) finishZoom(z);
      z = S.zoomAnim = { x, y, rem: Math.log(f) };
    }
    // The destination is fixed once per step (recomputing it every frame would drift by rounding and
    // restart the render); it's what gets rendered, and where the glide lands exactly.
    z.dest = zoomedPv(S.pv, z.x, z.y, Math.exp(z.rem));
    if (f < 1) { const [qx, qy] = screenQ(x, y); S.zoomAnchor = HP.pointAt(S.pv, qx, qy); S.zoomAnchorAt = performance.now(); }
  }

  function stepZoom(dt) {
    const z = S.zoomAnim;
    let step = z.rem * (1 - Math.exp(-dt / 0.05));
    if (Math.abs(z.rem) < 0.003 || Math.abs(step) >= Math.abs(z.rem)) {
      S.zoomAnim = null;
      finishZoom(z);
      return;
    }
    z.rem -= step;
    zoomAt(z.x, z.y, Math.exp(step));
  }

  function finishZoom(z) {
    if (isThree()) return zoomAt(z.x, z.y, Math.exp(z.rem)); // 3D zooms the camera, not the 2D view
    S.pv = z.dest;
    viewChanged();
  }

  // Pan by CSS pixels. Moves are snapped to whole render pixels so the viewer can reuse what it drew.
  function panPixels(dx, dy) {
    const ratio = glCanvas.width / Math.max(1, stage.clientWidth);
    const halfH = glCanvas.height / 2;
    S.panAcc[0] += dx * ratio;
    S.panAcc[1] += dy * ratio;
    const ix = Math.trunc(S.panAcc[0]), iy = Math.trunc(S.panAcc[1]);
    if (!ix && !iy) return;
    S.panAcc[0] -= ix;
    S.panAcc[1] -= iy;
    const qx = -ix / halfH, qy = iy / halfH;
    const cr = Math.cos(S.pv.rot), sr = Math.sin(S.pv.rot);
    HP.move(S.pv, qx * cr - qy * sr, qx * sr + qy * cr);
    viewChanged();
  }

  function panBy(dxPx, dyPx) {
    if (isThree()) return orbit(-dxPx * 0.3, -dyPx * 0.3);
    panPixels(-dxPx, -dyPx);
  }

  function openJuliaAt(pos) {
    if (!isEsc()) return;
    const c = toPlane(pos.x, pos.y);
    const d = clone(S.def);
    d.julia = true;
    d.juliaC = [+c[0].toPrecision(12), +c[1].toPrecision(12)];
    d.name = String(S.def.name).replace(/ Julia.*$/, '') + ' Julia';
    d.view = { cx: 0, cy: 0, scale: 1.5, rot: 0 };
    loadDef(d);
    U.toast('Opened Julia set — Backspace to go back');
  }

  function stagePos(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bindStage() {
    const pointers = new Map();
    let downPos = null, moved = false, pinch = null;

    const onCanvas = (e) => e.target.classList && e.target.classList.contains('main-canvas');
    stage.addEventListener('pointerdown', (e) => {
      if (!onCanvas(e)) return;
      stopTour();
      stage.setPointerCapture(e.pointerId);
      const pos = stagePos(e);
      pointers.set(e.pointerId, pos);
      if (pointers.size === 1) { downPos = pos; moved = false; }
      pinch = null;
    });

    stage.addEventListener('pointermove', (e) => {
      const pos = stagePos(e);
      S.mouse = pos;
      updateHud();
      if (S.juliaPreview && isEsc() && !S.def.julia && !pointers.size) {
        juliaBox.hidden = false;
        S.juliaPending = toPlane(pos.x, pos.y);
      }
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, pos);
      if (pointers.size === 1) {
        if (!moved && Math.hypot(pos.x - downPos.x, pos.y - downPos.y) > 3) moved = true;
        if (moved) {
          stage.classList.add('dragging');
          if (!isThree()) panPixels(pos.x - prev.x, pos.y - prev.y);
          else if (e.shiftKey || e.buttons === 2 || e.buttons === 4) panCam(pos.x - prev.x, pos.y - prev.y);
          else orbit(pos.x - prev.x, pos.y - prev.y);
        }
      } else if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const dist = Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y));
        if (pinch) {
          if (isThree()) panCam(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
          else panPixels(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
          zoomAt(mid.x, mid.y, pinch.dist / dist);
        }
        pinch = { mid, dist };
        moved = true;
      }
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      stage.classList.remove('dragging');
      if (e.type === 'pointerup' && !moved && !pointers.size && e.shiftKey) openJuliaAt(stagePos(e));
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('pointerleave', () => { S.mouse = null; juliaBox.hidden = true; updateHud(); });

    stage.addEventListener('contextmenu', (e) => { if (onCanvas(e)) e.preventDefault(); });
    stage.addEventListener('wheel', (e) => {
      if (!onCanvas(e)) return;
      e.preventDefault();
      stopTour();
      const pos = stagePos(e);
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      queueZoom(pos.x, pos.y, Math.exp(U.clamp(dy, -300, 300) * 0.0015));
    }, { passive: false });

    stage.addEventListener('dblclick', (e) => {
      if (!onCanvas(e)) return;
      const pos = stagePos(e);
      queueZoom(pos.x, pos.y, 0.4);
    });

    $('#btn-show').addEventListener('click', togglePanel);
  }

  function togglePanel() {
    app.classList.toggle('panel-hidden');
  }

  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (app.hidden) return;
      if ((e.target.closest && e.target.closest('input, textarea, select, .modal')) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!'fFaA'.includes(e.key)) stopTour();
      const w = stage.clientWidth, h = stage.clientHeight;
      switch (e.key) {
        case 'h': case 'H': togglePanel(); break;
        case 'r': case 'R': resetView(); break;
        case '+': case '=': queueZoom(w / 2, h / 2, 0.8); break;
        case '-': case '_': queueZoom(w / 2, h / 2, 1.25); break;
        case 'ArrowLeft': panBy(-w * 0.1, 0); break;
        case 'ArrowRight': panBy(w * 0.1, 0); break;
        case 'ArrowUp': panBy(0, -h * 0.1); break;
        case 'ArrowDown': panBy(0, h * 0.1); break;
        case 'j': case 'J': if (S.mouse) openJuliaAt(S.mouse); break;
        case 'm': case 'M': S.showMinimap = !S.showMinimap; C.sync('minimap'); minimapOverlay(); break;
        case 'f': case 'F': findSpot(); break;
        case 'a': case 'A': if (S.auto.on) stopAuto(); else startAuto(); break;
        case 'b': case 'B': addBookmark(); break;
        case 'Backspace': goBack(); break;
        case ' ': S.playing = !S.playing; C.sync('anim'); break;
        default: return;
      }
      e.preventDefault();
    });
  }

  function updateHud() {
    if (!S.def) return;
    if (isThree()) {
      const cam = S.def.camera, H = c3hi.height || 1;
      $('#hud-coords').textContent = `yaw ${Math.round(cam.yaw)}° · pitch ${Math.round(cam.pitch)}°`;
      $('#hud-zoom').textContent = 'distance ' + U.fmtNum(cam.dist, 4);
      $('#hud-info').textContent = s3.hiY < H ? `rendering ${Math.floor((s3.hiY / H) * 100)}%` : 'drag to orbit · shift+drag to pan · scroll to fly in';
      return;
    }
    const pv = S.pv;
    let coords = '';
    if (S.mouse) {
      const [qx, qy] = screenQ(S.mouse.x, S.mouse.y);
      const p = HP.pointAt(pv, qx, qy);
      const digits = Math.max(4, Math.ceil((-pv.L + 6) / HP.LOG2_10));
      const fmt = (n) => {
        const s = HP.toDecimal(n, p.P, digits);
        return s.length > 26 ? s.slice(0, 12) + '…' + s.slice(-10) : s;
      };
      coords = `${fmt(p.x)}, ${p.y >= 0n ? '+' : ''}${fmt(p.y)}i`;
    }
    $('#hud-coords').textContent = coords;
    $('#hud-zoom').textContent = 'zoom ×' + HP.magString(pv.L);
    let info = '';
    if (isEsc() && viewer) {
      info = `${effIter()} iter · AA ${S.aa}×`;
      if (viewer.deepActive) {
        const skip = EscapeGL.blaSettings.enabled && !viewer.core.noBla && Deep.analyze(S.def).bla && (S.def.coloring === 'smooth' || S.def.coloring === 'angle');
        info += skip ? ' · deep zoom (fast skipping)' : ' · deep zoom';
      }
      else if (viewer.deepReason) info += ` · ⚠ pixelated: deep zoom unavailable because ${viewer.deepReason}`;
      if (S.auto.on) info += S.auto.waiting ? ' · automatic zoom (waiting for detail to render)' : ' · automatic zoom';
      if (viewer.waitingRef) info += ' · computing reference orbit…';
      else if (viewer.progress < 1) info += ` · rendering ${Math.floor(viewer.progress * 100)}%`;
    } else if (isVec() && vecInfo) {
      info = `${U.fmtBig(vecInfo.drawn)} arcs · ${vecInfo.deepest + 1} levels visible${vecInfo.truncated ? ' · capped' : ''}`;
    } else if (isDensity() && ifsState) {
      info = `${U.fmtBig(ifsState.total)} / ${U.fmtBig(ifsState.target)} points`;
    }
    $('#hud-info').textContent = info;
  }

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

  // ---------------------------------------------------------------- boot
  function init() {
    try {
      viewer = new EscapeGL.Viewer(glCanvas);
      juliaR = new EscapeGL.EscapeRenderer(juliaCanvas);
      r3lo = new F3D.Renderer(c3lo);
      r3hi = new F3D.Renderer(c3hi, { alpha: true, preserve: true });
    } catch (e) {
      const b = $('#error-banner');
      b.textContent = 'WebGL2 is unavailable, so escape-time, complex function and 3D views cannot render. Attractors, IFS and vector fractals still work.';
      b.hidden = false;
    }
    bindMinimap();
    $('#btn-video').addEventListener('click', videoDialog);
    buildRenderTab();
    buildMakerTab();
    buildLibraryTab();
    bindTabs();
    bindStage();
    bindKeys();
    new ResizeObserver(resize).observe(stage);
    resize();
    loadDef(readHash() || Defs.BUILTINS[0], { activeId: readHash() ? null : 'b:' + Defs.BUILTINS[0].name, push: false });
    requestAnimationFrame(frame);
    Shell.addCommands('fractals', Defs.BUILTINS.map((d) => ({ label: `Fractal: ${d.name}`, keywords: `fractal preset ${d.type || ''}`, run: () => loadDef(d, { activeId: 'b:' + d.name }) })));
  }

  init();
})();

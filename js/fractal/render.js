// Fractal explorer — rendering: the main view, Julia preview, IFS / attractor density, 3D, animated zoom and the automatic zoom.

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

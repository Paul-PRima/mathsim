// Fractal explorer — view and interaction: resizing, zooming and panning, mouse / touch / keyboard, the heads-up display.

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

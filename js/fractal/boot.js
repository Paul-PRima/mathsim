// Fractal explorer — start-up. Loaded last: the files before it only declare things.

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

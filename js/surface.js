// 3D graphing: surfaces z = f(x, y) and parametric surfaces (x(u,v), y(u,v), z(u,v)), drawn with WebGL2.
(() => {
  const { el } = U;
  const KEY = 'mathsim.surface.v1';
  const COLORS = ['#4dabf7', '#ff922b', '#51cf66', '#cc5de8', '#ff6b6b', '#22b8cf', '#fcc419'];
  const st = {
    items: [{ text: 'z = sin(x)·cos(y)', color: COLORS[0], hidden: false }],
    range: 6, res: 110, heightColors: true, contours: true, wire: false, box: true,
    cam: { yaw: 35, pitch: 28, dist: 3.6 },
  };
  let cv, overlay, gl, prog, lineProg, listEl, infoEl;
  let meshes = [], bounds = null, queued = false;

  // ---------------------------------------------------------------- small matrix helpers (column-major)
  const mat = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o; },
    look(eye, tgt, up) {
      const sub = (a, b) => a.map((v, i) => v - b[i]), nz = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
      const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const z = nz(sub(eye, tgt)), x = nz(cr(up, z)), y = cr(z, x), d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x, eye), -d(y, eye), -d(z, eye), 1]);
    },
  };
  // math z is "up"; GL y is up — the model matrix swaps them
  const SWAP = new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  function camera() {
    const W = cv.clientWidth || 1, H = cv.clientHeight || 1;
    const yaw = (st.cam.yaw * Math.PI) / 180, pitch = (st.cam.pitch * Math.PI) / 180, d = st.cam.dist;
    const eye = [d * Math.cos(pitch) * Math.sin(yaw), d * Math.sin(pitch), d * Math.cos(pitch) * Math.cos(yaw)];
    const view = mat.look(eye, [0, 0, 0], [0, 1, 0]);
    return { mvp: mat.mul(mat.persp(0.75, W / H, 0.05, 100), mat.mul(view, SWAP)), eye, W, H };
  }
  // project a point in model space (x, y, z ∈ [-1, 1]) to CSS pixels
  function project(m, p) {
    const x = p[0], y = p[1], z = p[2];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [((cx / cw + 1) / 2) * cv.clientWidth, ((1 - cy / cw) / 2) * cv.clientHeight, cw];
  }

  // ---------------------------------------------------------------- shaders
  const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in float aH; layout(location=3) in float aOk;
uniform mat4 uMVP; out vec3 vNor; out float vH; out float vOk; out vec3 vPos;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); vNor = aNor; vH = aH; vOk = aOk; vPos = aPos; }`;
  const FS = `#version 300 es
precision highp float;
in vec3 vNor; in float vH; in float vOk; in vec3 vPos; out vec4 o;
uniform vec3 uColor; uniform bool uHeight; uniform bool uContours; uniform vec3 uEye;
vec3 ramp(float t) { // blue → cyan → green → yellow → red
  t = clamp(t, 0.0, 1.0);
  return clamp(vec3(1.5 - abs(4.0*t - 3.0), 1.5 - abs(4.0*t - 2.0), 1.5 - abs(4.0*t - 1.0)), 0.0, 1.0);
}
void main() {
  if (vOk < 0.999) discard;
  vec3 n = normalize(vNor);
  vec3 eyeDir = normalize(uEye - vec3(vPos.x, vPos.z, -vPos.y));
  vec3 nGL = vec3(n.x, n.z, -n.y);
  if (dot(nGL, eyeDir) < 0.0) nGL = -nGL; // light both sides
  vec3 L = normalize(vec3(0.4, 0.9, 0.5));
  float dif = max(dot(nGL, L), 0.0), spec = pow(max(dot(reflect(-L, nGL), eyeDir), 0.0), 24.0);
  vec3 base = uHeight ? mix(uColor, ramp(vH), 0.75) : uColor;
  vec3 c = base * (0.28 + 0.75 * dif) + vec3(0.25) * spec;
  if (uContours) { float f = fract(vH * 12.0); float w = fwidth(vH * 12.0); c *= mix(0.55, 1.0, smoothstep(0.0, 1.5 * w, min(f, 1.0 - f))); }
  o = vec4(c, 1.0);
}`;
  const LVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uMVP; void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;
  const LFS = `#version 300 es
precision highp float; uniform vec4 uColor; out vec4 o; void main() { o = uColor; }`;
  function program(vs, fs) {
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.loc = (n) => gl.getUniformLocation(p, n);
    return p;
  }

  // ---------------------------------------------------------------- building meshes
  // Classify an item: z = f(x, y), plain f(x, y), or (x(u,v), y(u,v), z(u,v)).
  function compileItem(it, scope) {
    let src = it.text.trim();
    if (!src) return null;
    src = src.replace(/^\s*z\s*=\s*/i, '');
    const ast = MX.parse(src);
    if (ast.t === 'tuple') {
      if (ast.items.length !== 3) throw new Error('Parametric surfaces need three coordinates: (x(u,v), y(u,v), z(u,v))');
      const f = ast.items.map((a) => MX.compile(a, ['u', 'v'], scope));
      const free = f.flatMap((c) => [...c.free]);
      if (free.length) throw new Error('Unknown: ' + [...new Set(free)].join(', '));
      return { kind: 'param', f: f.map((c) => c.fn) };
    }
    if (ast.t === 'cmp') throw new Error('Write the surface as z = f(x, y)');
    const c = MX.compile(ast, ['x', 'y'], scope);
    if (c.free.size) throw new Error('Unknown: ' + [...c.free].join(', ') + (c.free.has('z') ? ' (write z = f(x, y))' : ''));
    return { kind: 'graph', f: c.fn };
  }

  function build() {
    MX.M.af = 1;
    const scope = { vars: {}, funcs: {} };
    // constants first ("a = 2"), so surfaces can use them
    for (const it of st.items) {
      const m = /^\s*([A-Za-z]\w*)\s*=\s*(.+)$/.exec(it.text);
      it.err = null; it.isVar = false;
      if (m && !/^[xyzuv]$/.test(m[1])) {
        try { scope.vars[m[1]] = MX.evaluate(m[2], scope); it.isVar = true; } catch (e) { it.err = e.message; }
      }
    }
    const N = st.res, R = st.range;
    const raw = [];
    for (const it of st.items) {
      if (it.isVar || it.err || it.hidden) continue;
      let c;
      try { c = compileItem(it, scope); } catch (e) { it.err = e.message; continue; }
      if (!c) continue;
      const P = new Float64Array((N + 1) * (N + 1) * 3);
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const k = (j * (N + 1) + i) * 3;
        if (c.kind === 'graph') {
          const x = -R + (2 * R * i) / N, y = -R + (2 * R * j) / N;
          P[k] = x; P[k + 1] = y; P[k + 2] = c.f(x, y);
        } else {
          const u = (2 * Math.PI * i) / N, v = (2 * Math.PI * j) / N;
          P[k] = c.f[0](u, v); P[k + 1] = c.f[1](u, v); P[k + 2] = c.f[2](u, v);
        }
      }
      raw.push({ it, P, kind: c.kind });
    }
    // common bounds: x, y from the range (or the parametric extent), z from the values (outliers trimmed)
    const zs = [], ext = { x: [Infinity, -Infinity], y: [Infinity, -Infinity] };
    for (const r of raw) for (let k = 0; k < r.P.length; k += 3) {
      const z = r.P[k + 2];
      if (isFinite(z)) zs.push(z);
      if (r.kind === 'param' && isFinite(r.P[k]) && isFinite(r.P[k + 1])) {
        ext.x[0] = Math.min(ext.x[0], r.P[k]); ext.x[1] = Math.max(ext.x[1], r.P[k]);
        ext.y[0] = Math.min(ext.y[0], r.P[k + 1]); ext.y[1] = Math.max(ext.y[1], r.P[k + 1]);
      }
    }
    zs.sort((a, b) => a - b);
    let zlo = zs.length ? zs[Math.floor(zs.length * 0.01)] : -1, zhi = zs.length ? zs[Math.ceil(zs.length * 0.99) - 1] : 1;
    if (zs.length && zs[0] >= zlo - (zhi - zlo) * 0.15) zlo = zs[0];
    if (zs.length && zs[zs.length - 1] <= zhi + (zhi - zlo) * 0.15) zhi = zs[zs.length - 1];
    if (!(zhi > zlo)) { zlo -= 1; zhi += 1; }
    const onlyParam = raw.length && raw.every((r) => r.kind === 'param');
    const xr = onlyParam ? ext.x : [-R, R], yr = onlyParam ? ext.y : [-R, R];
    // parametric shapes keep their true proportions; graphs squeeze z into the box
    const span = onlyParam ? Math.max(xr[1] - xr[0], yr[1] - yr[0], zhi - zlo) : null;
    const sx = onlyParam ? 2 / span : 2 / (xr[1] - xr[0]), sy = onlyParam ? 2 / span : 2 / (yr[1] - yr[0]), sz = onlyParam ? 2 / span : 1.4 / (zhi - zlo);
    const cxm = (xr[0] + xr[1]) / 2, cym = (yr[0] + yr[1]) / 2, czm = (zlo + zhi) / 2;
    bounds = { xr, yr, zr: [zlo, zhi], sx, sy, sz, cxm, cym, czm, half: [(xr[1] - xr[0]) * sx / 2, (yr[1] - yr[0]) * sy / 2, (zhi - zlo) * sz / 2] };

    for (const m of meshes) { gl.deleteVertexArray(m.vao); m.bufs.forEach((b) => gl.deleteBuffer(b)); }
    meshes = [];
    for (const r of raw) {
      const n = (N + 1) * (N + 1);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), hgt = new Float32Array(n), ok = new Float32Array(n);
      const zcap = (zhi - zlo) * 0.02;
      for (let i = 0; i < n; i++) {
        const x = r.P[i * 3], y = r.P[i * 3 + 1], z = r.P[i * 3 + 2];
        const good = isFinite(x) && isFinite(y) && isFinite(z) && (r.kind === 'param' || (z >= zlo - zcap && z <= zhi + zcap));
        ok[i] = good ? 1 : 0;
        pos[i * 3] = ((x - cxm) * sx) || 0; pos[i * 3 + 1] = ((y - cym) * sy) || 0; pos[i * 3 + 2] = ((U.clamp(z, zlo - zcap, zhi + zcap) - czm) * sz) || 0;
        hgt[i] = (z - zlo) / (zhi - zlo);
      }
      // normals from neighbouring grid points (in the scaled space actually drawn)
      const at = (i, j) => (U.clamp(j, 0, N) * (N + 1) + U.clamp(i, 0, N)) * 3;
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
        const du = [pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]], dv = [pos[c] - pos[d], pos[c + 1] - pos[d + 1], pos[c + 2] - pos[d + 2]];
        const nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0];
        const l = Math.hypot(nx, ny, nz) || 1, k = at(i, j);
        nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      }
      const tri = [], lines = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        if (ok[a] && ok[b] && ok[c]) tri.push(a, b, c);
        if (ok[b] && ok[d] && ok[c]) tri.push(b, d, c);
      }
      const every = Math.max(1, Math.round(N / 24));
      for (let j = 0; j <= N; j += every) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; if (ok[a] && ok[a + 1]) lines.push(a, a + 1); }
      for (let i = 0; i <= N; i += every) for (let j = 0; j < N; j++) { const a = j * (N + 1) + i; if (ok[a] && ok[a + N + 1]) lines.push(a, a + N + 1); }
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bufs = [];
      const attr = (loc, data, size) => { const b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
      attr(0, pos, 3); attr(1, nor, 3); attr(2, hgt, 1); attr(3, ok, 1);
      const ib = gl.createBuffer(); bufs.push(ib);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array([...tri, ...lines]), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      meshes.push({ it: r.it, vao, bufs, nTri: tri.length, nLines: lines.length });
    }
    renderList();
    requestDraw();
  }

  // ---------------------------------------------------------------- drawing
  function requestDraw() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } }
  function draw() {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    for (const c of [cv, overlay]) if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    gl.viewport(0, 0, cv.width, cv.height);
    if (Theme.light) gl.clearColor(1, 1, 1, 1); else gl.clearColor(0.047, 0.055, 0.075, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const cam = camera();
    gl.useProgram(prog);
    gl.uniformMatrix4fv(prog.loc('uMVP'), false, cam.mvp);
    gl.uniform3fv(prog.loc('uEye'), cam.eye);
    gl.uniform1i(prog.loc('uHeight'), st.heightColors ? 1 : 0);
    gl.uniform1i(prog.loc('uContours'), st.contours ? 1 : 0);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    for (const m of meshes) {
      gl.uniform3fv(prog.loc('uColor'), U.hexToRgb(m.it.color));
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.nTri, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(lineProg.loc('uMVP'), false, cam.mvp);
    if (st.wire) {
      gl.uniform4f(lineProg.loc('uColor'), 0, 0, 0, 0.55);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const m of meshes) { gl.bindVertexArray(m.vao); gl.drawElements(gl.LINES, m.nLines, gl.UNSIGNED_INT, m.nTri * 4); }
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
    drawBox(cam);
  }

  let boxBuf = null, boxVao = null;
  function drawBox(cam) {
    const ctx = overlay.getContext('2d');
    const dpr = overlay.width / Math.max(1, overlay.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
    if (!bounds || !st.box) return;
    const [hx, hy, hz] = bounds.half;
    const c = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const data = new Float32Array(E.flatMap(([a, b]) => [...c[a], ...c[b]]));
    if (!boxBuf) { boxVao = gl.createVertexArray(); boxBuf = gl.createBuffer(); }
    gl.bindVertexArray(boxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.useProgram(lineProg);
    gl.uniform4f(lineProg.loc('uColor'), 0.55, 0.57, 0.63, 1);
    gl.drawArrays(gl.LINES, 0, E.length * 2);
    gl.bindVertexArray(null);
    // tick labels on three edges facing the viewer
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = Theme.label;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const toModel = (x, y, z) => [(x - bounds.cxm) * bounds.sx, (y - bounds.cym) * bounds.sy, (z - bounds.czm) * bounds.sz];
    const axis = (name, r, place) => {
      const t = Charts.ticks(r[0], r[1], 5);
      for (const v of t.values) { const [px, py] = project(cam.mvp, place(v)); ctx.fillText(Charts.tickLabel(v, t.step), px, py); }
      const [px, py] = project(cam.mvp, place((r[0] + r[1]) / 2).map((q, i) => q * (i === 2 ? 1 : 1.18)));
      ctx.fillStyle = '#ffc078'; ctx.font = '600 13px system-ui, sans-serif'; ctx.fillText(name, px, py);
      ctx.fillStyle = Theme.label; ctx.font = '11px system-ui, sans-serif';
    };
    // pick the box corner nearest the camera's opposite side for the labels
    const sxs = cam.eye[0] > 0 ? -1 : 1, sys = cam.eye[2] > 0 ? 1 : -1;
    axis('x', bounds.xr, (v) => { const p = toModel(v, 0, bounds.zr[0]); return [p[0], sys * hy * 1.12, -hz]; });
    axis('y', bounds.yr, (v) => { const p = toModel(0, v, bounds.zr[0]); return [sxs * hx * 1.12, p[1], -hz]; });
    axis('z', bounds.zr, (v) => { const p = toModel(0, 0, v); return [-sxs * hx * 1.1, sys * hy * 1.1, p[2]]; });
  }

  // ---------------------------------------------------------------- UI
  const save = U.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } }, 300);
  const rebuild = U.debounce(() => { try { build(); } catch (e) { infoEl.textContent = e.message; } save(); }, 120);

  function renderList() {
    for (const [i, it] of st.items.entries()) {
      const row = listEl.children[i];
      if (!row) continue;
      const info = row.querySelector('.gx-info');
      info.textContent = it.err || (it.isVar ? 'constant' : it.text.trim() ? '' : '');
      info.className = 'gx-info' + (it.err ? ' err-text' : '');
      info.hidden = !info.textContent;
    }
  }
  function rows() {
    listEl.replaceChildren(...st.items.map((it, i) => {
      const input = el('input', { type: 'text', class: 'mono gx-input', value: it.text, spellcheck: 'false', placeholder: 'z = …' });
      input.addEventListener('input', () => { it.text = input.value; rebuild(); });
      const color = el('input', { type: 'color', class: 'gx-color', value: it.color });
      color.addEventListener('input', () => { it.color = color.value; save(); requestDraw(); });
      const eye = U.el('button', { type: 'button', class: 'icon gx-eye', title: 'Show / hide', onclick: () => { it.hidden = !it.hidden; rows(); rebuild(); } }, it.hidden ? '○' : '●');
      eye.style.color = it.color;
      const del = U.el('button', { type: 'button', class: 'icon danger', title: 'Delete', onclick: () => { st.items.splice(i, 1); if (!st.items.length) st.items.push(newItem('')); rows(); rebuild(); } }, '×');
      return el('div', { class: 'gx-item' }, el('div', { class: 'gx-row' }, eye, input, color, del), el('div', { class: 'gx-info', hidden: true }));
    }));
    renderList();
  }
  const newItem = (text) => ({ text, color: COLORS.find((c) => !st.items.some((i) => i.color === c)) || COLORS[st.items.length % COLORS.length], hidden: false });

  const EXAMPLES = [
    ['Waves', ['z = sin(x)·cos(y)'], 6],
    ['Saddle', ['z = x^2 - y^2'], 3],
    ['Ripple', ['z = sin(sqrt(x^2 + y^2) * 2) / (1 + sqrt(x^2 + y^2))'], 10],
    ['Gaussian bell', ['z = exp(-(x^2 + y^2) / 4)'], 6],
    ['Monkey saddle', ['z = x^3 - 3x y^2'], 2],
    ['Egg crate', ['z = sin(x) + sin(y)'], 8],
    ['Paraboloid and plane', ['z = x^2 + y^2', 'z = 2x + 3'], 4],
    ['Peaks', ['z = 3(1-x)^2·exp(-x^2 - (y+1)^2) - 10(x/5 - x^3 - y^5)·exp(-x^2 - y^2) - exp(-(x+1)^2 - y^2)/3'], 3],
    ['Sphere (parametric)', ['(cos(u)·sin(v/2), sin(u)·sin(v/2), cos(v/2))'], 6],
    ['Torus (parametric)', ['((2 + cos(v))·cos(u), (2 + cos(v))·sin(u), sin(v))'], 6],
    ['Möbius strip (parametric)', ['((1 + (v/pi - 1)/2·cos(u/2))·cos(u), (1 + (v/pi - 1)/2·cos(u/2))·sin(u), (v/pi - 1)/2·sin(u/2))'], 6],
    ['With a constant', ['z = a·sin(x)·sin(y)', 'a = 2'], 6],
  ];

  function savePNG() {
    draw(); // the GL buffer is only valid right after drawing
    const out = document.createElement('canvas');
    out.width = cv.width; out.height = cv.height;
    const c = out.getContext('2d');
    c.drawImage(cv, 0, 0);
    c.drawImage(overlay, 0, 0);
    out.toBlob((b) => b && U.download(b, 'surface.png'), 'image/png');
  }

  function init(root) {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.items)) Object.assign(st, s); } catch { /* fresh */ }
    cv = el('canvas', { class: 'sf-canvas' });
    overlay = el('canvas', { class: 'sf-overlay' });
    listEl = el('div', { class: 'gx-list' });
    infoEl = el('div', { class: 'gx-coords mono' });
    gl = cv.getContext('webgl2', { antialias: true, preserveDrawingBuffer: false });
    if (!gl) { root.append(el('div', { class: 'page' }, el('p', { class: 'err-text' }, 'WebGL2 is not available, so 3D graphs cannot be drawn.'))); return; }
    prog = program(VS, FS);
    lineProg = program(LVS, LFS);
    const exSel = el('select', {}, el('option', { value: '' }, 'Examples…'), EXAMPLES.map(([n], i) => el('option', { value: i }, n)));
    exSel.addEventListener('change', () => {
      const ex = EXAMPLES[+exSel.value];
      exSel.value = '';
      if (!ex) return;
      st.items = [];
      ex[1].forEach((t) => st.items.push(newItem(t)));
      st.range = ex[2];
      syncControls(); rows(); rebuild();
    });
    const rng = C.slider({ label: 'x and y from −r to r', min: 0.5, max: 50, log: true, get: () => st.range, set: (v) => { st.range = v; rebuild(); } });
    const res = C.slider({ label: 'Detail (grid points per side)', min: 20, max: 250, step: 1, get: () => st.res, set: (v) => { st.res = Math.round(v); rebuild(); } });
    const chk = (label, key) => C.check({ label, get: () => st[key], set: (v) => { st[key] = v; save(); requestDraw(); } }).el;
    const syncControls = () => { rng.sync(); res.sync(); };
    root.append(el('div', { class: 'gx' },
      el('aside', { class: 'gx-panel' },
        el('div', { class: 'gx-head' }, el('h2', {}, '3D graphs'), el('div', { class: 'btn-row' },
          U.el('button', { type: 'button', class: 'primary small', onclick: () => { st.items.push(newItem('')); rows(); listEl.lastChild.querySelector('input').focus(); } }, '+ Surface'),
          exSel)),
        listEl,
        el('div', { class: 'sf-controls' }, rng.el, res.el, chk('Colour by height', 'heightColors'), chk('Contour lines', 'contours'), chk('Grid lines', 'wire'), chk('Axes box', 'box'),
          el('details', { class: 'help' }, el('summary', {}, 'What can I type?'), el('ul', { class: 'hint' },
            el('li', {}, el('code', {}, 'z = x^2 - y^2'), ' or just ', el('code', {}, 'x^2 - y^2'), ' — a surface over the x-y plane'),
            el('li', {}, el('code', {}, '(cos(u), sin(u), v/3)'), ' — parametric, u and v from 0 to 2π'),
            el('li', {}, el('code', {}, 'a = 2'), ' — a constant to use in other lines'),
            el('li', {}, 'Drag to rotate · scroll to zoom'))))),
      el('div', { class: 'gx-stage' }, cv, overlay,
        el('div', { class: 'gx-tools' },
          U.el('button', { type: 'button', title: 'Zoom in', onclick: () => { st.cam.dist = Math.max(1.2, st.cam.dist * 0.85); save(); requestDraw(); } }, '+'),
          U.el('button', { type: 'button', title: 'Zoom out', onclick: () => { st.cam.dist = Math.min(20, st.cam.dist / 0.85); save(); requestDraw(); } }, '−'),
          U.el('button', { type: 'button', title: 'Reset view', onclick: () => { st.cam = { yaw: 35, pitch: 28, dist: 3.6 }; save(); requestDraw(); } }, '⌂'),
          U.el('button', { type: 'button', title: 'Save as PNG', onclick: savePNG }, '⤓')),
        infoEl)));
    // orbit with the mouse
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      st.cam.yaw -= (e.clientX - drag.x) * 0.4;
      st.cam.pitch = U.clamp(st.cam.pitch + (e.clientY - drag.y) * 0.4, -89, 89);
      drag = { x: e.clientX, y: e.clientY };
      save(); requestDraw();
    });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); st.cam.dist = U.clamp(st.cam.dist * Math.exp(e.deltaY * 0.001), 1.2, 20); save(); requestDraw(); }, { passive: false });
    new ResizeObserver(requestDraw).observe(cv);
    Theme.onChange(requestDraw);
    rows();
    build();
  }

  Shell.register('surface', {
    label: '3D graphs', short: '3D', key: 4, order: 4, root: () => document.getElementById('mod-surface'), init,
    onShow: () => requestDraw(),
    desc: 'Plot surfaces z = f(x, y) and parametric surfaces in 3D. Rotate, zoom, colour by height and contour lines.',
    features: ['z = f(x, y)', 'Parametric surfaces', 'Contours', 'Rotate & zoom'],
  });
})();

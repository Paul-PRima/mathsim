// 3D fractals, ray-marched on the GPU with distance estimators.
const F3D = (() => {
  const KINDS = { mandelbulb: 0, mandelbox: 1, menger: 2, sierpinski: 3, quatjulia: 4, kifs: 5 };
  const MAX_STOPS = 8;

  function defaults() {
    return {
      type: '3d',
      kind: 'mandelbulb',
      name: 'Mandelbulb',
      power: 8,
      julia: false,
      juliaC: [0.35, 0.35, -0.25],
      iterations: 10,
      boxScale: -1.8,
      cW: 0,          // quaternion Julia: 4th component of c
      kScale: 2,      // kaleidoscopic IFS: scale per fold
      kAngle: 0,      // kaleidoscopic IFS: rotation per fold (degrees)
      kOffset: [1, 1, 1],
      detail: 1,
      maxSteps: 220,
      density: 1,
      offset: 0,
      palette: ['#0b132b', '#3a506b', '#5bc0be', '#f4d35e', '#ee964b'],
      bgTop: '#1b2033',
      bgBottom: '#05060a',
      lightYaw: 40,
      lightPitch: 50,
      ao: 0.8,
      shadows: true,
      fog: 0.15,
      camera: { yaw: 35, pitch: 20, dist: 3, tx: 0, ty: 0, tz: 0, fov: 45 },
    };
  }

  const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalfFov;
uniform int uKind;
uniform float uPower;
uniform int uIter;
uniform bool uJulia;
uniform vec3 uJuliaC;
uniform float uBoxScale;
uniform float uCW;
uniform float uKScale;
uniform mat3 uKRot;
uniform vec3 uKOffset;
uniform float uDetail;
uniform int uMaxSteps;
uniform vec3 uStops[${MAX_STOPS}];
uniform int uStopCount;
uniform float uDensity, uOffset;
uniform vec3 uBgTop, uBgBottom;
uniform vec3 uLight;
uniform float uAO, uFog;
uniform bool uShadows;
out vec4 o;

float trap;

float deBulb(vec3 p) {
  vec3 z = p; float dr = 1.0, r = 0.0;
  vec3 c = uJulia ? uJuliaC : p;
  trap = 1e9;
  for (int i = 0; i < 64; i++) {
    if (i >= uIter) break;
    r = length(z);
    if (r > 2.0) break;
    trap = min(trap, r);
    if (r < 1e-7) { z = c; continue; }
    float th = acos(clamp(z.z / r, -1.0, 1.0)) * uPower;
    float ph = atan(z.y, z.x) * uPower;
    dr = pow(r, uPower - 1.0) * uPower * dr + (uJulia ? 0.0 : 1.0);
    z = pow(r, uPower) * vec3(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + c;
  }
  r = length(z);
  trap = trap / 1.2;
  return 0.5 * log(max(r, 1e-7)) * r / max(dr, 1e-7);
}

float deBox(vec3 p) {
  vec3 z = p; float dr = 1.0;
  vec3 c = uJulia ? uJuliaC : p;
  float s = uBoxScale;
  trap = 1e9;
  for (int i = 0; i < 64; i++) {
    if (i >= uIter) break;
    z = clamp(z, -1.0, 1.0) * 2.0 - z;
    float r2 = dot(z, z);
    trap = min(trap, r2);
    if (r2 < 0.25) { z *= 4.0; dr *= 4.0; }
    else if (r2 < 1.0) { z /= r2; dr /= r2; }
    z = s * z + c;
    dr = dr * abs(s) + 1.0;
  }
  trap = sqrt(trap);
  return length(z) / abs(dr);
}

float sdBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0)); }

float deMenger(vec3 p) {
  float d = sdBox(p, vec3(1.0));
  float s = 1.0;
  trap = 0.0;
  for (int m = 0; m < 12; m++) {
    if (m >= uIter) break;
    vec3 a = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));
    float da = max(r.x, r.y), db = max(r.y, r.z), dc = max(r.z, r.x);
    float c = (min(da, min(db, dc)) - 1.0) / s;
    if (c > d) { d = c; trap = float(m + 1) / float(uIter); }
  }
  return d;
}

float deTetra(vec3 z) {
  float s = 2.0;
  int n = 0;
  trap = 1e9;
  for (int i = 0; i < 40; i++) {
    if (i >= uIter) break;
    if (z.x + z.y < 0.0) z.xy = -z.yx;
    if (z.x + z.z < 0.0) z.xz = -z.zx;
    if (z.y + z.z < 0.0) z.zy = -z.yz;
    z = z * s - vec3(1.0) * (s - 1.0);
    trap = min(trap, length(z));
    n++;
  }
  trap = trap / 2.0;
  return (length(z) - 1.5) * pow(s, -float(n));
}

// Quaternion Julia set: z -> z² + c in 4D, sliced at w = 0.
float deQuat(vec3 p) {
  vec4 z = vec4(p, 0.0), c = vec4(uJuliaC, uCW);
  float md2 = 1.0, mz2 = dot(z, z);
  trap = 1e9;
  for (int i = 0; i < 64; i++) {
    if (i >= uIter) break;
    md2 *= 4.0 * mz2;
    z = vec4(z.x * z.x - dot(z.yzw, z.yzw), 2.0 * z.x * z.yzw) + c;
    mz2 = dot(z, z);
    trap = min(trap, mz2);
    if (mz2 > 16.0) break;
  }
  trap = sqrt(trap) * 0.6;
  return 0.25 * sqrt(mz2 / md2) * log(max(mz2, 1.000001));
}

// Kaleidoscopic IFS (Knighty): fold into one octant, sort the axes, rotate, scale away from a corner.
float deKifs(vec3 z) {
  float s = uKScale;
  int n = 0;
  trap = 1e9;
  for (int i = 0; i < 40; i++) {
    if (i >= uIter) break;
    z = uKRot * z;
    z = abs(z);
    if (z.x < z.y) z.xy = z.yx;
    if (z.x < z.z) z.xz = z.zx;
    if (z.y < z.z) z.yz = z.zy;
    z = z * s - uKOffset * (s - 1.0);
    if (z.z < -0.5 * uKOffset.z * (s - 1.0)) z.z += uKOffset.z * (s - 1.0);
    trap = min(trap, length(z));
    n++;
  }
  trap = trap / (s + 1.0);
  return sdBox(z, vec3(1.0)) * pow(s, -float(n));
}

float de(vec3 p) {
  if (uKind == 0) return deBulb(p);
  if (uKind == 1) return deBox(p);
  if (uKind == 2) return deMenger(p);
  if (uKind == 4) return deQuat(p);
  if (uKind == 5) return deKifs(p);
  return deTetra(p);
}

vec3 palette(float t) {
  t = fract(t);
  float x = t * float(uStopCount);
  int i = int(floor(x));
  int j = i + 1; if (j >= uStopCount) j = 0;
  return mix(uStops[i], uStops[j], fract(x));
}

vec3 normalAt(vec3 p, float h) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * de(p + k.xyy * h) + k.yyx * de(p + k.yyx * h) + k.yxy * de(p + k.yxy * h) + k.xxx * de(p + k.xxx * h));
}

float softShadow(vec3 ro, vec3 rd, float tmin) {
  float res = 1.0, t = tmin;
  for (int i = 0; i < 48; i++) {
    float h = de(ro + rd * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.002, 0.25);
    if (res < 0.005 || t > 6.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(uCamFwd + (q.x * uCamRight + q.y * uCamUp) * uTanHalfFov);
  vec3 ro = uCamPos;
  vec3 bg = mix(uBgBottom, uBgTop, clamp(0.5 + 0.5 * rd.y, 0.0, 1.0));
  float as = abs(uBoxScale);
  float R = uKind == 1 ? min(2.0 * (as + 1.0) / max(as - 1.0, 0.2) + 0.5, 40.0) : (uKind == 2 ? 1.8 : (uKind == 3 ? 2.2 : (uKind == 4 ? 2.0 : (uKind == 5 ? 3.0 : 1.6))));
  vec2 bs = sphere(ro, rd, R);
  if (bs.y < 0.0) { o = vec4(bg, 1.0); return; }
  float pix = uTanHalfFov / (0.5 * uRes.y);
  float t = max(bs.x, 0.0), d = 0.0, eps = 0.0;
  bool hit = false;
  for (int i = 0; i < 2000; i++) {
    if (i >= uMaxSteps) break;
    vec3 p = ro + rd * t;
    d = de(p);
    eps = max(t * pix * uDetail, 1e-6);
    if (d < eps) { hit = true; break; }
    t += d * 0.9;
    if (t > bs.y) break;
  }
  if (!hit) { o = vec4(bg, 1.0); return; }
  vec3 p = ro + rd * t;
  de(p);
  float tr = trap;
  vec3 n = normalAt(p, eps * 0.5);
  vec3 base = palette(tr * uDensity + uOffset);
  float dif = max(dot(n, uLight), 0.0);
  if (uShadows && dif > 0.0) dif *= softShadow(p + n * eps * 2.0, uLight, eps * 4.0);
  float occ = 0.0, sc = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.01 + 0.03 * float(i);
    occ += (h - de(p + n * h)) * sc;
    sc *= 0.7;
  }
  occ = clamp(1.0 - uAO * 3.0 * occ, 0.0, 1.0);
  vec3 hlf = normalize(uLight - rd);
  float spe = pow(max(dot(n, hlf), 0.0), 32.0) * dif;
  vec3 col = base * (0.18 + 0.9 * dif) * (0.35 + 0.65 * occ) + vec3(0.9, 0.85, 0.8) * spe * 0.35;
  col += base * 0.25 * max(0.0, -n.y) * occ; // bounce light from below
  col = mix(col, bg, 1.0 - exp(-uFog * t * t * 0.15));
  o = vec4(col, 1.0);
}`;

  function camBasis(cam) {
    const yaw = (cam.yaw * Math.PI) / 180, pitch = (U.clamp(cam.pitch, -89, 89) * Math.PI) / 180;
    const dir = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const pos = [cam.tx + dir[0] * cam.dist, cam.ty + dir[1] * cam.dist, cam.tz + dir[2] * cam.dist];
    const fwd = [-dir[0], -dir[1], -dir[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const nz = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const right = nz(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return { pos, fwd, right, up };
  }

  // Rotation for the kaleidoscopic IFS: the angle about a fixed tilted axis (column-major for GLSL).
  function kifsRot(deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    const l = Math.hypot(1, 0.6, 0.3), x = 1 / l, y = 0.6 / l, z = 0.3 / l;
    return new Float32Array([
      t * x * x + c, t * x * y + s * z, t * x * z - s * y,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c,
    ]);
  }

  class Renderer {
    constructor(canvas, { alpha = false, preserve = false } = {}) {
      this.canvas = canvas;
      this.lost = false;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); });
      this.gl = canvas.getContext('webgl2', { antialias: false, alpha, premultipliedAlpha: true, preserveDrawingBuffer: preserve, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!this.gl) throw new Error('WebGL2 is not available.');
      this.init();
    }

    init() {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('3D shader error: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('3D link error: ' + gl.getProgramInfoLog(prog));
      this.prog = prog;
      this.loc = {};
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }

    clear() {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // o: { scissor: [x, y, w, h] }
    draw(def, cam, o = {}) {
      if (this.lost) return;
      const gl = this.gl;
      const L = (n) => (n in this.loc ? this.loc[n] : (this.loc[n] = gl.getUniformLocation(this.prog, n)));
      const W = this.canvas.width, H = this.canvas.height;
      gl.useProgram(this.prog);
      gl.viewport(0, 0, W, H);
      const b = camBasis(cam);
      gl.uniform2f(L('uRes'), W, H);
      gl.uniform3fv(L('uCamPos'), b.pos);
      gl.uniform3fv(L('uCamFwd'), b.fwd);
      gl.uniform3fv(L('uCamRight'), b.right);
      gl.uniform3fv(L('uCamUp'), b.up);
      gl.uniform1f(L('uTanHalfFov'), Math.tan(((cam.fov || 45) * Math.PI) / 360));
      gl.uniform1i(L('uKind'), KINDS[def.kind] ?? 0);
      gl.uniform1f(L('uPower'), def.power);
      gl.uniform1i(L('uIter'), Math.max(1, Math.round(def.iterations)));
      gl.uniform1i(L('uJulia'), def.julia ? 1 : 0);
      gl.uniform3fv(L('uJuliaC'), def.juliaC);
      gl.uniform1f(L('uBoxScale'), def.boxScale);
      gl.uniform1f(L('uCW'), +def.cW || 0);
      gl.uniform1f(L('uKScale'), +def.kScale || 2);
      gl.uniformMatrix3fv(L('uKRot'), false, kifsRot(+def.kAngle || 0));
      gl.uniform3fv(L('uKOffset'), (def.kOffset || [1, 1, 1]).map(Number));
      gl.uniform1f(L('uDetail'), def.detail);
      gl.uniform1i(L('uMaxSteps'), Math.round(def.maxSteps));
      const arr = new Float32Array(MAX_STOPS * 3);
      const pal = (def.palette || ['#fff', '#000']).slice(0, MAX_STOPS);
      pal.forEach((h, i) => arr.set(U.hexToRgb(h), i * 3));
      gl.uniform3fv(L('uStops'), arr);
      gl.uniform1i(L('uStopCount'), pal.length);
      gl.uniform1f(L('uDensity'), def.density);
      gl.uniform1f(L('uOffset'), def.offset);
      gl.uniform3fv(L('uBgTop'), U.hexToRgb(def.bgTop));
      gl.uniform3fv(L('uBgBottom'), U.hexToRgb(def.bgBottom));
      const ly = (def.lightYaw * Math.PI) / 180, lp = (def.lightPitch * Math.PI) / 180;
      gl.uniform3f(L('uLight'), Math.cos(lp) * Math.sin(ly), Math.sin(lp), Math.cos(lp) * Math.cos(ly));
      gl.uniform1f(L('uAO'), def.ao);
      gl.uniform1i(L('uShadows'), def.shadows ? 1 : 0);
      gl.uniform1f(L('uFog'), def.fog);
      if (o.scissor) { gl.enable(gl.SCISSOR_TEST); gl.scissor(...o.scissor); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (o.scissor) gl.disable(gl.SCISSOR_TEST);
    }

    dispose() {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  // Draws a full image in horizontal strips (keeps each GPU submission short). Returns a promise.
  // Strips are sized to ~40 ms of GPU work; the UI gets a turn every ~100 ms rather than after each strip.
  async function drawStrips(r, def, cam, onProgress) {
    const W = r.canvas.width, H = r.canvas.height;
    let y = 0, rows = r.stripRows || 16, lastYield = performance.now();
    while (y < H) {
      const h = Math.min(rows, H - y);
      const t0 = performance.now();
      r.draw(def, cam, { scissor: [0, y, W, h] });
      r.gl.finish();
      const dt = performance.now() - t0;
      y += h;
      rows = U.clamp(Math.round(rows * U.clamp(40 / Math.max(dt, 0.5), 0.25, 4)), 1, H);
      if (onProgress) onProgress(y / H);
      if (performance.now() - lastYield > 100) { await U.yieldNow(); lastYield = performance.now(); }
    }
    r.stripRows = rows;
  }

  const ITER_DEFAULT = { mandelbulb: 10, mandelbox: 12, menger: 5, sierpinski: 14, quatjulia: 11, kifs: 10 };

  function random() {
    const kind = U.pick(Object.keys(KINDS));
    const d = defaults();
    return Object.assign(d, {
      kind,
      name: 'Random ' + kind,
      power: U.pick([3, 4, 5, 6, 8, 9, 12]),
      julia: (kind === 'mandelbulb' || kind === 'mandelbox') && Math.random() < 0.4,
      juliaC: kind === 'quatjulia'
        ? [+U.rand(-0.6, 0.2).toFixed(3), +U.rand(-0.6, 0.6).toFixed(3), +U.rand(-0.4, 0.4).toFixed(3)]
        : [+U.rand(-0.8, 0.8).toFixed(3), +U.rand(-0.8, 0.8).toFixed(3), +U.rand(-0.8, 0.8).toFixed(3)],
      cW: +U.rand(-0.4, 0.4).toFixed(3),
      kScale: +U.rand(1.8, 3).toFixed(3),
      kAngle: +U.rand(-40, 40).toFixed(1),
      boxScale: +U.pick([U.rand(-2.5, -1.4), U.rand(1.6, 3)]).toFixed(3),
      iterations: ITER_DEFAULT[kind],
      palette: Math.random() < 0.5 ? randomPalette() : PALETTES[U.pick(Object.keys(PALETTES))].slice(),
      camera: Object.assign(d.camera, { yaw: U.rand(0, 360), pitch: U.rand(-30, 50), dist: kind === 'mandelbox' ? 9 : kind === 'kifs' ? 4.5 : 3.2 }),
    });
  }

  return { defaults, Renderer, drawStrips, camBasis, random, KINDS, ITER_DEFAULT };
})();

// WebGL2 renderer for escape-time fractals.
//  - Float path: plain float32 iteration, used at shallow zoom and for formulas perturbation can't handle.
//  - Deep path: perturbation against a BigInt reference orbit (see deep.js) — unlimited zoom.
//  - Viewer: progressive, tiled rendering of the viewport plus a margin, reusing pixels while panning.
const EscapeGL = (() => {
  const COLORING = { smooth: 0, 'trap-point': 1, 'trap-cross': 2, angle: 3, stripe: 4, domain: 5 };
  const MAPPING = { linear: 0, sqrt: 1, log: 2 };
  const MAX_STOPS = 8;
  const DEEP_L = -10; // switch to perturbation below scale 2^-10 (≈1e-3)
  const MARGIN = 0.12; // extra render area around the viewport, per side

  const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec2 uRes;
uniform float uHalfH;
uniform float uRot;
uniform int uMaxIter;
uniform float uBailout;
uniform float uEps;
uniform bool uEscape;
uniform bool uConverge;
uniform bool uJulia;
uniform vec2 uJuliaC;
uniform vec2 uK;
uniform float uTime;
uniform int uColoring;
uniform int uMapping;
uniform float uDensity;
uniform float uOffset;
uniform float uShade;
uniform float uStripeFreq;
uniform vec3 uStops[${MAX_STOPS}];
uniform int uStopCount;
uniform vec3 uInterior;
uniform int uAA;
uniform bool uPeriodic;
out vec4 outColor;
`;

  const LIB = `
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b); return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / d; }
vec2 csqr(vec2 a) { return vec2(a.x*a.x - a.y*a.y, 2.0*a.x*a.y); }
vec2 ccube(vec2 a) { return cmul(csqr(a), a); }
vec2 cinv(vec2 a) { return vec2(a.x, -a.y) / dot(a, a); }
vec2 cconj(vec2 a) { return vec2(a.x, -a.y); }
vec2 cabsc(vec2 a) { return abs(a); }
vec2 cre(vec2 a) { return vec2(a.x, 0.0); }
vec2 cim(vec2 a) { return vec2(a.y, 0.0); }
vec2 carg(vec2 a) { return vec2(atan(a.y, a.x), 0.0); }
vec2 cmag(vec2 a) { return vec2(length(a), 0.0); }
vec2 cnorm(vec2 a) { return vec2(dot(a, a), 0.0); }
vec2 cflip(vec2 a) { return a.yx; }
vec2 cfloor(vec2 a) { return floor(a); }
vec2 cround(vec2 a) { return floor(a + 0.5); }
vec2 cexp(vec2 a) { return exp(a.x) * vec2(cos(a.y), sin(a.y)); }
vec2 clog(vec2 a) { return vec2(0.5*log(dot(a, a)), atan(a.y, a.x)); }
vec2 csqrt(vec2 a) { float r = length(a); return vec2(sqrt(max(0.0, 0.5*(r + a.x))), (a.y < 0.0 ? -1.0 : 1.0) * sqrt(max(0.0, 0.5*(r - a.x)))); }
vec2 cpow(vec2 a, vec2 b) { if (dot(a, a) == 0.0) return vec2(0.0); return cexp(cmul(b, clog(a))); }
vec2 cpowr(vec2 a, float b) { float r = length(a); if (r == 0.0) return vec2(0.0); float th = atan(a.y, a.x) * b; return pow(r, b) * vec2(cos(th), sin(th)); }
vec2 cpowi(vec2 a, int n) {
  vec2 r = vec2(1.0, 0.0); vec2 b = a; int m = n < 0 ? -n : n;
  while (m > 0) { if ((m & 1) == 1) r = cmul(r, b); b = csqr(b); m >>= 1; }
  return n < 0 ? cinv(r) : r;
}
vec2 csin(vec2 a) { return vec2(sin(a.x)*cosh(a.y), cos(a.x)*sinh(a.y)); }
vec2 ccos(vec2 a) { return vec2(cos(a.x)*cosh(a.y), -sin(a.x)*sinh(a.y)); }
vec2 ctan(vec2 a) { return cdiv(csin(a), ccos(a)); }
vec2 csinh(vec2 a) { return vec2(sinh(a.x)*cos(a.y), cosh(a.x)*sin(a.y)); }
vec2 ccosh(vec2 a) { return vec2(cosh(a.x)*cos(a.y), sinh(a.x)*sin(a.y)); }
vec2 ctanh(vec2 a) { return cdiv(csinh(a), ccosh(a)); }
vec2 casin(vec2 a) { vec2 iz = vec2(-a.y, a.x); vec2 w = clog(iz + csqrt(vec2(1.0, 0.0) - csqr(a))); return vec2(w.y, -w.x); }
vec2 cacos(vec2 a) { vec2 s = csqrt(vec2(1.0, 0.0) - csqr(a)); vec2 w = clog(a + vec2(-s.y, s.x)); return vec2(w.y, -w.x); }
vec2 catan(vec2 a) { vec2 w = clog(cdiv(vec2(0.0, 1.0) + a, vec2(0.0, 1.0) - a)); return 0.5 * vec2(-w.y, w.x); }

vec3 palette(float t) {
  t = fract(t);
  float x = t * float(uStopCount);
  int i = int(floor(x));
  int j = i + 1; if (j >= uStopCount) j = 0;
  return mix(uStops[i], uStops[j], fract(x));
}

int gState = 0; // last pixel's outcome, read by the iteration probe
int gN = 0;
vec3 finish(int state, int n, vec2 z, vec2 zp, float trap, float stripe, float stripePrev) {
  gState = state;
  gN = n;
  if (uColoring == 5) {
    // Domain colouring: hue from the angle of w = f(z), brightness bands from log2 |w|, and thin lines
    // where the angle crosses a multiple of 2π / stripe frequency.
    float ph = atan(z.y, z.x) / 6.2831853 + 0.5;
    vec3 col = palette(ph * uDensity + uOffset);
    float lm = log2(max(length(z), 1e-30));
    col *= mix(1.0, 0.6 + 0.4 * fract(lm), uShade);
    float line = 1.0 - smoothstep(0.01, 0.025, abs(fract(ph * uStripeFreq + 0.5) - 0.5));
    return mix(col, col * 0.35, line * step(1.5, uStripeFreq) * 0.8);
  }
  if (state == 0) return uInterior;
  float fn = float(n);
  float nu = fn;
  if (state == 1) {
    float lz = 0.5*log(max(dot(z, z), 1.0000001));
    float lzp = 0.5*log(max(dot(zp, zp), 1e-30));
    float d = lzp > 0.7 ? clamp(lz / lzp, 1.05, 64.0) : 2.0;
    nu = fn + 1.0 - log(max(lz / log(max(uBailout, 1.0001)), 1e-6)) / log(d);
  } else {
    float d2 = max(dot(z - zp, z - zp), 1e-37);
    nu = fn + 1.0 - clamp(log2(max(log(d2) / log(uEps), 1e-6)), 0.0, 1.0);
  }
  float fr = clamp(nu - fn, 0.0, 1.0);
  float v;
  if (uColoring == 0) v = nu / 20.0;
  else if (uColoring == 1) v = sqrt(trap);
  else if (uColoring == 2) v = trap;
  else if (uColoring == 3) v = atan(z.y, z.x) / 6.2831853 + 0.5;
  else v = mix(stripePrev / max(fn, 1.0), stripe / (fn + 1.0), fr);
  if (uMapping == 1) v = sqrt(max(v, 0.0));
  else if (uMapping == 2) v = log(1.0 + max(v, 0.0));
  vec3 col = palette(v * uDensity + uOffset);
  return col * mix(1.0, exp(-0.08 * nu), uShade);
}
`;

  // Per-iteration bookkeeping shared by both paths (expects z, zp, trap, stripe…, state, B2).
  const TRACK = `
    float m2 = dot(z, z);
    if (isnan(m2) || isinf(m2)) { state = 1; z = zp; break; }
    if (uColoring == 1) trap = min(trap, m2);
    else if (uColoring == 2) trap = min(trap, min(abs(z.x), abs(z.y)));
    else if (uColoring == 4) { stripePrev = stripe; stripe += 0.5 + 0.5*sin(uStripeFreq * atan(z.y, z.x)); }
    if (uEscape && m2 > B2) { state = 1; break; }`;

  const MAIN = `
uniform bool uProbe;       // write the iteration count instead of a colour
uniform bool uRefine;      // second anti-aliasing pass: only re-sample pixels on edges
uniform sampler2D uPrev;   // first-pass image (one sample per pixel)
uniform float uEdge;       // colour difference that counts as an edge
void main() {
  if (uProbe) {
    fractalColor((gl_FragCoord.xy - 0.5*uRes) / uHalfH);
    outColor = vec4(float(gN & 255), float((gN >> 8) & 255), float((gN >> 16) & 255), float(gState)) / 255.0;
    return;
  }
  if (uRefine) {
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 lim = textureSize(uPrev, 0) - 1;
    vec3 c0 = texelFetch(uPrev, p, 0).rgb;
    float diff = 0.0;
    for (int dy = -1; dy <= 1; dy++)
      for (int dx = -1; dx <= 1; dx++) {
        vec3 c = texelFetch(uPrev, clamp(p + ivec2(dx, dy), ivec2(0), lim), 0).rgb;
        diff = max(diff, abs(c.r - c0.r) + abs(c.g - c0.g) + abs(c.b - c0.b));
      }
    if (diff < uEdge) { outColor = vec4(c0, 1.0); return; }
  }
  vec3 col = vec3(0.0);
  for (int sx = 0; sx < uAA; sx++)
    for (int sy = 0; sy < uAA; sy++) {
      vec2 off = (vec2(float(sx), float(sy)) + 0.5) / float(uAA) - 0.5;
      col += fractalColor((gl_FragCoord.xy + off - 0.5*uRes) / uHalfH);
    }
  outColor = vec4(col / float(uAA * uAA), 1.0);
}`;

  function floatBody(formula, init) {
    return `
uniform vec2 uCenter;
uniform float uScale;
vec3 fractalColor(vec2 q) {
  float cr = cos(uRot), sr = sin(uRot);
  vec2 p = uCenter + vec2(q.x*cr - q.y*sr, q.x*sr + q.y*cr) * uScale;
  vec2 c = uJulia ? uJuliaC : p;
  vec2 z = uJulia ? p : ${init};
  vec2 zp = z;
  float trap = 1e20, stripe = 0.0, stripePrev = 0.0;
  int state = 0;
  int n;
  float B2 = uBailout * uBailout;
  vec2 zper = vec2(1e30);
  int perNext = 16;
  for (n = 0; n < uMaxIter; n++) {
    vec2 zn = ${formula};
    zp = z; z = zn;
    ${TRACK}
    if (uConverge && dot(z - zp, z - zp) < uEps) { state = 2; break; }
    // Periodicity check: interior orbits settle into an exact cycle, so stop early instead of
    // burning through every remaining iteration.
    if (uPeriodic) {
      if (dot(z - zper, z - zper) < 1e-24) { state = 0; break; }
      if (n == perNext) { zper = z; perNext *= 2; }
    }
  }
  return finish(state, n, z, zp, trap, stripe, stripePrev);
}`;
  }

  // BLA: skip many iterations at once while the pixel's delta is tiny (see Deep.buildBLA).
  const BLA_GLSL = `
    if (uBlaOn && m > 0 && (w.x != 0.0 || w.y != 0.0)) {
      float ld = log2(length(w)) + float(se) + log2(sm);
      bool did = false;
      for (int l = 23; l >= 0; l--) {
        if (l >= uBlaLevels) continue;
        int span = 1 << l;
        if (((m - 1) & (span - 1)) != 0) continue;
        if (m + span >= uRefLen || n + span >= uMaxIter) continue;
        int g = uBlaOff[l] + ((m - 1) >> l);
        vec4 ex = blaAt(g * 3 + 2); // (exponent of A, exponent of B, log2 of validity radius)
        if (!(ld < ex.z)) continue;
        vec4 ma = blaAt(g * 3), mb = blaAt(g * 3 + 1); // 2x2 matrices A and B, row-major
        vec2 t1 = vec2(ma.x * w.x + ma.y * w.y, ma.z * w.x + ma.w * w.y);
        vec2 t2 = vec2(mb.x * d.x + mb.y * d.y, mb.z * d.x + mb.w * d.y);
        float l1 = log2(max(max(abs(t1.x), abs(t1.y)), 1e-38)) + ex.x;
        float l2 = log2(max(max(abs(t2.x), abs(t2.y)), 1e-38)) + ex.y;
        int E = int(floor(max(l1, l2)));
        w = t1 * ex2(int(ex.x) - E) + t2 * ex2(int(ex.y) - E);
        se += E;
        if (d.x != 0.0 || d.y != 0.0) d *= ex2(-E);
        m += span;
        n += span - 1;
        did = true;
        break;
      }
      if (did) {
        R = refAt(m);
        zp = z;
        z = feFloat(R) + ldx(sm, se) * w;
        continue;
      }
    }`;

  function deepBody(code, withBla) {
    return `
uniform sampler2D uRef;
uniform sampler2D uBla;
uniform bool uBlaOn;
uniform int uBlaLevels;
uniform int uBlaOff[24];
vec4 blaAt(int p) { return texelFetch(uBla, ivec2(p & 4095, p >> 12), 0); }
float ex2(int k) { return k < -126 ? 0.0 : (k > 126 ? 1e38 : exp2(float(k))); }
uniform int uRefLen;
uniform vec2 uOff;
uniform float uSm;
uniform int uSe;
uniform vec2 uCref;
uniform vec3 uZ0;
uniform bool uZ0Zero;
uniform bool uInitPixel;

float ldx(float m, int e) { return e < -126 ? 0.0 : (e > 126 ? m * 1e38 : m * exp2(float(e))); }
vec2 feFloat(vec3 R) { return R.z < -126.0 ? vec2(0.0) : R.xy * exp2(R.z); }
// (m * 2^e) / (sm * 2^se) as a float, clamped
vec2 feDivS(vec2 m, float e, float sm, int se) {
  if (m.x == 0.0 && m.y == 0.0) return vec2(0.0);
  int k = int(e) - se;
  if (k > 60) return m / sm * 1e18;
  if (k < -126) return vec2(0.0);
  return m / sm * exp2(float(k));
}
vec2 divS(vec2 R, float sm, int se) {
  float mx = max(abs(R.x), abs(R.y));
  if (mx < 1e-37) return vec2(0.0);
  int er = int(floor(log2(mx)));
  int k = er - se;
  if (k > 60) return R / mx * 1e18;
  if (k < -126) return vec2(0.0);
  return R * exp2(float(-er)) * exp2(float(k)) / sm;
}
// |X + x| - |X|, computed without cancellation
float diffabs(float X, float x) {
  if (X >= 0.0) return (X + x >= 0.0) ? x : -(2.0*X + x);
  return (X + x > 0.0) ? 2.0*X + x : -x;
}
vec3 refAt(int m) { return texelFetch(uRef, ivec2(m & 4095, m >> 12), 0).xyz; }

vec3 fractalColor(vec2 q) {
  float cr = cos(uRot), sr = sin(uRot);
  vec2 dq = uOff + vec2(q.x*cr - q.y*sr, q.x*sr + q.y*cr);
  vec2 d, w;
  if (uJulia) { d = vec2(0.0); w = dq; } else { d = dq; w = uInitPixel ? dq : vec2(0.0); }
  float sm = uSm;
  int se = uSe;
  int m = 0;
  vec3 R = refAt(0);
  vec2 z = feFloat(R) + ldx(sm, se) * w;
  vec2 zp = z;
  float trap = 1e20, stripe = 0.0, stripePrev = 0.0;
  int state = 0;
  int n;
  float B2 = uBailout * uBailout;
  for (n = 0; n < uMaxIter; n++) {
    ${withBla ? BLA_GLSL : ''}
    float Sf = ldx(sm, se);
    vec2 Zs = feDivS(R.xy, R.z, sm, se);
    vec2 zzr = feFloat(R); vec2 zzw = w;
    vec2 ccr = uCref; vec2 ccw = d;
    vec2 kkr = uK; vec2 kkw = vec2(0.0);
    ${code.code}
    w = ${code.out};
    m++;
    R = refAt(m);
    zp = z;
    z = feFloat(R) + Sf * w;
    ${TRACK}
    // Rebase onto the start of the reference when that's closer. With Z0 = 0 this can only happen
    // when |Z| is within a few powers of two of |δ|, so the costly test is skipped otherwise.
    if (m >= uRefLen || !uZ0Zero || int(R.z) <= se + 18) {
      vec2 wr = feDivS(R.xy, R.z, sm, se) - feDivS(uZ0.xy, uZ0.z, sm, se) + w;
      if (m >= uRefLen || dot(wr, wr) < dot(w, w)) { w = wr; m = 0; R = refAt(0); }
    }
    // keep w near 1 by moving powers of two into the exponent of S
    float mw = max(abs(w.x), abs(w.y));
    if (mw > 1e4 || (mw < 1e-4 && mw > 0.0)) {
      int ks = int(floor(log2(mw)));
      float f = exp2(float(-ks));
      w *= f; d *= f; se += ks;
    }
  }
  return finish(state, n, z, zp, trap, stripe, stripePrev);
}`;
  }

  function compileParts(def) {
    let formula, init;
    try { formula = Formula.compile(def.formula, Formula.FORMULA_VARS); } catch (e) { e.field = 'formula'; throw e; }
    try { init = Formula.compile(def.init || '0', Formula.INIT_VARS); } catch (e) { e.field = 'init'; throw e; }
    return { formula, init };
  }

  function buildFragment(def) {
    const { formula, init } = compileParts(def);
    return HEADER + LIB + floatBody(formula, init) + MAIN;
  }

  function buildDeep(def, an, withBla) {
    compileParts(def); // surface syntax errors the same way as the float path
    return HEADER + LIB + deepBody(an.code, withBla) + MAIN;
  }

  // Iteration skipping can be switched off (e.g. to compare) and is dropped automatically if a GPU
  // driver refuses to compile it.
  const blaSettings = { enabled: true };
  const blaColoring = (def) => def.coloring === 'smooth' || def.coloring === 'angle';

  const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTarget;
uniform vec2 uBuf;
uniform float uHalf;    // half view height in target pixels
uniform float uHalfSrc; // half view height in source pixels (smaller for the low-res preview)
uniform mat2 uM;
uniform vec2 uT;
uniform float uAlpha;   // fade-in of a newly finished image
out vec4 o;
void main() {
  vec2 q = (gl_FragCoord.xy - 0.5*uTarget) / uHalf;
  vec2 px = (uM * q + uT) * uHalfSrc + 0.5*uBuf;
  if (px.x < 0.0 || px.y < 0.0 || px.x > uBuf.x || px.y > uBuf.y) { o = vec4(0.0); return; }
  o = texture(uTex, px / uBuf) * uAlpha;
}`;

  const COPY = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform ivec2 uShift;
uniform ivec2 uSize;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + uShift;
  if (p.x < 0 || p.y < 0 || p.x >= uSize.x || p.y >= uSize.y) { o = vec4(0.0); return; }
  o = texelFetch(uTex, p, 0);
}`;

  function paletteArray(pal) {
    const arr = new Float32Array(MAX_STOPS * 3);
    const list = (pal && pal.length ? pal : ['#000000', '#ffffff']).slice(0, MAX_STOPS);
    list.forEach((h, i) => arr.set(U.hexToRgb(h), i * 3));
    return { arr, count: list.length };
  }

  // Iteration limit from a probe: the slowest-escaping pixels (99.8th percentile) plus 40% headroom.
  // If nothing escapes the view is all inside, so a modest limit suffices; if many pixels hit the cap
  // while escapes run close to it, more are genuinely needed and the cap is used.
  function pickIter(esc, stuck, total, cap) {
    if (esc.length < Math.max(4, total * 0.005)) return Math.min(cap, 300);
    esc.sort((a, b) => a - b);
    // 99.5th percentile: the very slowest few boundary pixels are outliers not worth thousands of
    // extra iterations for every pixel.
    const p = esc[Math.min(esc.length - 1, Math.floor(esc.length * 0.995))];
    if (p > cap * 0.7 && stuck > total * 0.03) return cap;
    return U.clamp(Math.round(p * 1.3 + 64), 100, cap);
  }

  // Periodicity checking is only valid when the next z depends on z alone (not on zp, n or p).
  const periodicCache = new Map();
  function periodicOK(def) {
    const key = def.formula;
    if (!periodicCache.has(key)) {
      periodicCache.set(key, !['zp', 'n', 'p'].some((v) => Formula.usesVar(def.formula, v)));
      if (periodicCache.size > 100) periodicCache.clear();
    }
    return periodicCache.get(key);
  }

  const toPv = (view) => (view && typeof view.L === 'number' && typeof view.x === 'bigint' ? view : HP.fromView(view));
  const fkey = (def) => [def.formula, def.init, def.julia, def.juliaC, def.k, def.bailout].join('|');
  // Reference offset from the view centre, in units of the view's scale.
  const refOffset = (pv, ref) => HP.diff(pv, { x: ref.x, y: ref.y, P: ref.P, L: pv.L });

  // ---------------------------------------------------------------- GL core shared by all renderers
  class Core {
    constructor(canvas, preserve) {
      this.canvas = canvas;
      this.lost = false;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); if (this.onRestore) this.onRestore(); });
      this.gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: false, stencil: false,
        preserveDrawingBuffer: preserve, powerPreference: 'high-performance',
      });
      if (!this.gl) throw new Error('WebGL2 is not available.');
      this.init();
    }

    init() {
      const gl = this.gl;
      this.cache = new Map();
      this.refTex = null;
      this.blaTex = null;
      this.probeFbo = null;
      this.ref = null;
      // 1×1 stand-in for the "previous pass" sampler when not refining (a sampler must never point at
      // the texture being rendered into).
      this.dummyTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      this.vs = this.shader(gl.VERTEX_SHADER, VERT);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }

    shader(type, src) {
      const gl = this.gl;
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        const err = new Error('Shader error: ' + (log || 'unknown').split('\n')[0]);
        err.field = 'glsl';
        throw err;
      }
      return s;
    }

    program(src) {
      let e = this.cache.get(src);
      if (e) { if (e.error) throw e.error; return e; }
      const gl = this.gl;
      try {
        const fs = this.shader(gl.FRAGMENT_SHADER, src);
        const prog = gl.createProgram();
        gl.attachShader(prog, this.vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          const err = new Error('Link error: ' + gl.getProgramInfoLog(prog));
          err.field = 'glsl';
          throw err;
        }
        e = { prog, loc: {} };
      } catch (err) {
        this.cache.set(src, { error: err });
        throw err;
      }
      if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(src, e);
      return e;
    }

    use(e) {
      this.gl.useProgram(e.prog);
      return (n) => (n in e.loc ? e.loc[n] : (e.loc[n] = this.gl.getUniformLocation(e.prog, n)));
    }

    // Returns the compiled program; for deep views it prefers the variant with iteration skipping.
    fractalProgram(def, deep) {
      if (!deep) return this.program(buildFragment(def));
      if (deep.bla && blaSettings.enabled && !this.noBla) {
        try {
          const e = this.program(buildDeep(def, deep, true));
          e.bla = true;
          return e;
        } catch (err) {
          if (err.field !== 'glsl') throw err;
          this.noBla = true; // this GPU can't compile it: fall back to plain perturbation
          console.warn('Iteration skipping disabled:', err.message);
        }
      }
      return this.program(buildDeep(def, deep, false));
    }

    setRef(orbit, job) {
      const gl = this.gl;
      if (!this.refTex) this.refTex = gl.createTexture();
      const tex = (t, unit, rows, data) => {
        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4096, rows, 0, gl.RGBA, gl.FLOAT, data);
      };
      tex(this.refTex, gl.TEXTURE0, orbit.rows, orbit.data);
      let bla = null;
      if (orbit.bla && orbit.bla.data) {
        if (!this.blaTex) this.blaTex = gl.createTexture();
        tex(this.blaTex, gl.TEXTURE1, orbit.bla.rows, orbit.bla.data);
        bla = { offsets: Int32Array.from({ length: 24 }, (_, i) => orbit.bla.offsets[i] || 0), levels: orbit.bla.levels, ldc: orbit.bla.ldc };
      }
      this.ref = {
        x: job.x, y: job.y, P: job.P, fkey: job.fkey, len: orbit.len, escaped: orbit.escaped,
        maxIter: orbit.maxIter, z0: orbit.z0, cApprox: orbit.cApprox, bla, zd: orbit.zd,
      };
      return this.ref;
    }

    // Rebuilds just the BLA table (not the orbit) when the current view needs a different |δc| bound.
    // Used by export/video, where one orbit serves frames at many zoom levels.
    ensureBla(def, an, need) {
      const ref = this.ref;
      if (!ref || !ref.zd || !an.bla) return;
      const t = ref.bla;
      if (t && (def.julia || (need <= t.ldc && need > t.ldc - 16))) return;
      const ldc = need + 1;
      const b = Deep.buildBLA(an, def, ref.zd, ref.len, ref.cApprox, ldc);
      if (!b) return;
      const gl = this.gl;
      if (!this.blaTex) this.blaTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.blaTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4096, b.rows, 0, gl.RGBA, gl.FLOAT, b.data);
      gl.activeTexture(gl.TEXTURE0);
      ref.bla = { offsets: Int32Array.from({ length: 24 }, (_, i) => b.offsets[i] || 0), levels: b.levels, ldc };
    }

    refUsable(ref, def, pv, iter) {
      if (!ref || ref.fkey !== fkey(def) || ref.P < HP.neededP(pv.L) || !(ref.escaped || ref.maxIter >= iter)) return 0;
      const o = refOffset(pv, ref);
      const d = Math.hypot(o[0], o[1]);
      return d < 4 ? 2 : d < 500 ? 1 : 0; // 2 = ideal, 1 = usable
    }

    // Renders a tiny image that reports each pixel's escape iteration, and picks an iteration limit just
    // above what the view actually needs. Returns null when a deep view has no reference yet.
    probeIter(def, pv, { cap, aspect = 16 / 9, time = 0, deep = null } = {}) {
      if (this.lost) return null;
      const ref = deep ? this.ref : null;
      if (deep) {
        if (!ref || ref.fkey !== fkey(def) || ref.P < HP.neededP(pv.L)) return null;
        const off = refOffset(pv, ref);
        if (Math.hypot(off[0], off[1]) > 500) return null;
      }
      const gl = this.gl;
      const PH = 36, PW = Math.max(16, Math.round(PH * aspect));
      if (!this.probeFbo || this.probeW !== PW) {
        if (this.probeTex) gl.deleteTexture(this.probeTex);
        this.probeTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.probeTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PW, PH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.probeFbo = this.probeFbo || gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.probeTex, 0);
        this.probeW = PW;
      }
      this.drawFractal(def, pv, { deep, ref, aa: 1, time, iter: cap, fbo: this.probeFbo, w: PW, h: PH, halfH: PH / 2, probe: true });
      const px = new Uint8Array(PW * PH * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeFbo);
      gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const esc = [];
      let stuck = 0;
      for (let i = 0; i < px.length; i += 4) {
        const n = px[i] + px[i + 1] * 256 + px[i + 2] * 65536, state = px[i + 3];
        if (state) esc.push(n);
        else if (n >= cap - 1) stuck++;
      }
      return pickIter(esc, stuck, PW * PH, cap);
    }

    // Synchronous reference (thumbnails / export).
    syncRef(def, an, pv, iter) {
      if (this.refUsable(this.ref, def, pv, iter) === 2) return this.ref;
      const job = Deep.makeJob(def, an, pv, Math.ceil(iter * 1.25));
      job.fkey = fkey(def);
      return this.setRef(Deep.computeWithBla(job), job);
    }

    // o: { deep, ref, aa, time, iter, fbo, w, h, halfH, scissor }
    drawFractal(def, pv, o) {
      if (this.lost) return;
      const gl = this.gl;
      const prog = this.fractalProgram(def, o.deep);
      const L = this.use(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbo || null);
      gl.viewport(0, 0, o.w, o.h);
      gl.disable(gl.BLEND);
      gl.uniform2f(L('uRes'), o.w, o.h);
      gl.uniform1f(L('uHalfH'), o.halfH);
      gl.uniform1f(L('uRot'), pv.rot || 0);
      gl.uniform1i(L('uMaxIter'), Math.max(1, Math.round(o.iter || def.maxIter)));
      gl.uniform1f(L('uBailout'), def.bailout);
      gl.uniform1f(L('uEps'), def.epsilon);
      gl.uniform1i(L('uEscape'), def.escape ? 1 : 0);
      gl.uniform1i(L('uConverge'), def.converge ? 1 : 0);
      gl.uniform1i(L('uJulia'), def.julia ? 1 : 0);
      gl.uniform2f(L('uJuliaC'), def.juliaC[0], def.juliaC[1]);
      gl.uniform2f(L('uK'), def.k[0], def.k[1]);
      gl.uniform1f(L('uTime'), o.time || 0);
      gl.uniform1i(L('uColoring'), COLORING[def.coloring] ?? 0);
      gl.uniform1i(L('uMapping'), MAPPING[def.mapping] ?? 0);
      gl.uniform1f(L('uDensity'), def.density);
      gl.uniform1f(L('uOffset'), def.offset);
      gl.uniform1f(L('uShade'), def.shade);
      gl.uniform1f(L('uStripeFreq'), def.stripeFreq);
      const pal = paletteArray(def.palette);
      gl.uniform3fv(L('uStops'), pal.arr);
      gl.uniform1i(L('uStopCount'), pal.count);
      gl.uniform3fv(L('uInterior'), U.hexToRgb(def.interior));
      gl.uniform1i(L('uAA'), U.clamp(o.aa || 1, 1, 4));
      gl.uniform1i(L('uProbe'), o.probe ? 1 : 0);
      gl.uniform1i(L('uRefine'), o.refine ? 1 : 0);
      gl.uniform1f(L('uEdge'), o.edge ?? 0.1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, o.refine || this.dummyTex);
      gl.uniform1i(L('uPrev'), 2);
      gl.activeTexture(gl.TEXTURE0);
      if (o.deep) {
        const ref = o.ref;
        const se = Math.floor(pv.L);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.refTex);
        gl.uniform1i(L('uRef'), 0);
        gl.uniform1i(L('uRefLen'), ref.len);
        const off = refOffset(pv, ref);
        gl.uniform2f(L('uOff'), off[0], off[1]);
        gl.uniform1f(L('uSm'), 2 ** (pv.L - se));
        gl.uniform1i(L('uSe'), se);
        const cref = def.julia ? def.juliaC : ref.cApprox;
        gl.uniform2f(L('uCref'), cref[0], cref[1]);
        gl.uniform3f(L('uZ0'), ref.z0[0], ref.z0[1], ref.z0[2]);
        gl.uniform1i(L('uZ0Zero'), !def.julia && ref.z0[0] === 0 && ref.z0[1] === 0 ? 1 : 0);
        gl.uniform1i(L('uInitPixel'), o.deep.initPixel ? 1 : 0);
        if (prog.bla) {
          // The table is only valid for |δc| up to the bound it was built for (viewport + margin
          // around a nearby reference). Otherwise skip BLA for this draw; a closer reference follows.
          const need = pv.L + Math.log2(Math.hypot(off[0], off[1]) + Math.hypot(o.w, o.h) / 2 / o.halfH + 1e-9);
          if (o.blaSync && blaColoring(def)) this.ensureBla(def, o.deep, need);
          const bla = ref.bla;
          const on = !!bla && (def.julia || need <= bla.ldc) && blaColoring(def);
          gl.uniform1i(L('uBlaOn'), on ? 1 : 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, on ? this.blaTex : this.refTex);
          gl.uniform1i(L('uBla'), 1);
          if (on) {
            gl.uniform1i(L('uBlaLevels'), bla.levels);
            gl.uniform1iv(L('uBlaOff'), bla.offsets);
          }
          gl.activeTexture(gl.TEXTURE0);
        }
      } else {
        const a = HP.approx(pv);
        gl.uniform2f(L('uCenter'), a.cx, a.cy);
        gl.uniform1f(L('uScale'), a.scale);
        gl.uniform1i(L('uPeriodic'), periodicOK(def) ? 1 : 0);
      }
      if (o.scissor) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(...o.scissor);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (o.scissor) gl.disable(gl.SCISSOR_TEST);
    }

    dispose() {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  function deepFor(def, pv) {
    if (pv.L >= DEEP_L) return { deep: null, reason: null };
    const an = Deep.analyze(def);
    return an.ok ? { deep: an, reason: null } : { deep: null, reason: an.reason };
  }

  // ---------------------------------------------------------------- one-shot renderer (thumbnails, export, julia inset)
  class EscapeRenderer {
    constructor(canvas, preserve = false) {
      this.canvas = canvas;
      this.core = new Core(canvas, preserve);
      this.gl = this.core.gl;
    }

    // view: serialized view ({cx, cy, scale, rot}) or a precise view; o: { aa, time, maxIter, scissor }
    draw(def, view, o = {}) {
      const pv = toPv(view);
      const iter = o.maxIter || def.maxIter;
      const { deep } = deepFor(def, pv);
      const ref = deep ? this.core.syncRef(def, deep, pv, iter) : null;
      const W = this.canvas.width, H = this.canvas.height;
      this.core.drawFractal(def, pv, {
        deep, ref, aa: o.aa, time: o.time, iter, w: W, h: H, halfH: H / 2, scissor: o.scissor, blaSync: true,
        fbo: o.fbo, refine: o.refine, edge: o.edge,
      });
    }

    // Smart iteration limit for a view (see Core.probeIter). Reuses the current reference orbit when it
    // fits, so video frames don't trigger new orbit computations.
    probe(def, view, cap, aspect, fallback) {
      const pv = toPv(view);
      const { deep } = deepFor(def, pv);
      if (deep) {
        const r = this.core.ref;
        const fits = r && this.core.refUsable(Object.assign({}, r, { maxIter: Infinity }), def, pv, 0);
        if (!fits) this.core.syncRef(def, deep, pv, fallback);
      }
      return this.core.probeIter(def, pv, { cap, aspect, deep });
    }

    // Renders the whole canvas in strips sized to ~40 ms of GPU work each (keeps the driver happy),
    // yielding to the UI only every ~100 ms instead of after every strip.
    // With anti-aliasing on (and o.adaptive !== false) it renders one sample per pixel first, then
    // re-renders with full anti-aliasing only the pixels that sit on an edge.
    async drawFull(def, view, o = {}) {
      const W = this.canvas.width, H = this.canvas.height;
      const strips = async (extra, p0, p1) => {
        let y = 0, rows = this.stripRows || 32, lastYield = performance.now();
        while (y < H) {
          const h = Math.min(rows, H - y);
          const t0 = performance.now();
          this.draw(def, view, Object.assign({}, o, extra, { scissor: [0, y, W, h] }));
          this.gl.finish();
          const dt = performance.now() - t0;
          y += h;
          rows = U.clamp(Math.round(rows * U.clamp(40 / Math.max(dt, 0.5), 0.25, 4)), 1, H);
          if (o.onProgress) o.onProgress(p0 + (p1 - p0) * (y / H));
          if (performance.now() - lastYield > 100) { await U.yieldNow(); lastYield = performance.now(); }
        }
        this.stripRows = rows;
      };
      if ((o.aa || 1) > 1 && o.adaptive !== false) {
        const gl = this.gl;
        if (!this.passTex || this.passW !== W || this.passH !== H) {
          if (this.passTex) gl.deleteTexture(this.passTex);
          this.passTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, this.passTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          this.passFbo = this.passFbo || gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.passFbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.passTex, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          this.passW = W;
          this.passH = H;
        }
        await strips({ aa: 1, fbo: this.passFbo }, 0, 0.4);
        await strips({ fbo: null, refine: this.passTex, edge: o.edge ?? 0.1 }, 0.4, 1);
      } else {
        await strips({}, 0, 1);
      }
    }

    dispose() { this.core.dispose(); }
  }

  // ---------------------------------------------------------------- progressive viewer for the main canvas
  class Viewer {
    constructor(canvas) {
      this.canvas = canvas;
      this.core = new Core(canvas, false);
      this.gl = this.core.gl;
      this.core.onRestore = () => { this.pool = []; if (this.W) this.resize(this.W, this.H); };
      this.tile = 128;
      this.targetAA = 1;
      this.adaptive = true; // edge-only anti-aliasing
      this.fastZoom = true; // quarter-resolution preview while zooming
      this.keepPreview = false; // automatic zoom: keep the previous keyframe on screen
      this.hidePartial = false; // automatic zoom: show a keyframe only once complete (cross-faded)
      this.coarse = null;
      this.pool = [];
      this.Pb = null; // preview buffer (older image shown underneath while D renders)
      this.D = null; // buffer being rendered for the current view
      this.scene = null;
      this.pending = null;
      this.error = null;
      this.deepReason = null;
      this.deepActive = false;
      this.waitingRef = false;
      this.needPresent = true;
    }

    resize(W, H) {
      const gl = this.gl;
      this.W = W; this.H = H;
      this.canvas.width = W; this.canvas.height = H;
      this.mx = Math.round(W * MARGIN);
      this.my = Math.round(H * MARGIN);
      this.Wb = W + 2 * this.mx;
      this.Hb = H + 2 * this.my;
      this.halfH = H / 2;
      for (const b of this.pool) { gl.deleteTexture(b.tex); gl.deleteFramebuffer(b.fbo); }
      this.pool = [0, 1, 2].map(() => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.Wb, this.Hb, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.Pb = null;
      this.D = null;
      this.needPresent = true;
    }

    spare(...busy) { return this.pool.find((b) => !busy.includes(b)); }

    get progress() {
      const D = this.D;
      return D ? 1 - D.queue.length / D.done.length : 1;
    }

    // scene: { def, pv, aa, time, iter, animate }
    update(scene) {
      if (!this.pool.length) return;
      const { deep, reason } = deepFor(scene.def, scene.pv);
      try {
        this.core.fractalProgram(scene.def, deep);
        this.error = null;
      } catch (e) {
        this.error = e;
        return;
      }
      this.deepActive = !!deep;
      this.deepReason = reason;
      const s = Object.assign({}, scene, { deep });
      const key = JSON.stringify(Object.assign({}, s.def, { view: 0, name: 0 })) + '|' + s.iter + '|' + (deep ? 'deep' : 'float') + (blaSettings.enabled ? '|bla' : '') + (s.animate ? '|' + s.time : '');
      this.scene = s;
      const D = this.D;
      if (!D) return this.fresh(s, key, true);
      // Anti-aliasing isn't part of the key: views always render one sample per pixel first, and
      // work() adds an edge-refining pass afterwards (see startRefine).
      this.targetAA = s.aa;
      const sameParams = key === D.key;
      if (sameParams && HP.same(s.pv, D.view)) return;
      if (s.animate) return this.fresh(s, key, true);
      if (sameParams && s.pv.L === D.view.L && s.pv.rot === D.view.rot) {
        const sh = this.shiftFor(D.view, s.pv);
        if (sh) return this.shift(sh, s);
      }
      if (sameParams && s.pv.rot === D.view.rot && s.pv.L - D.view.L > Math.log2(1.25)) this.zoomOutReuse(s);
      else this.fresh(s, key, false);
      // (not in automatic zoom: the magnified previous keyframe is already a better stand-in)
      if (s.interacting && this.fastZoom && !this.hidePartial) this.renderCoarse(s, key);
    }

    // Zooming out: the old image becomes the middle of the new view. Copy it in (shrunk) and only
    // queue the tiles it doesn't fully cover.
    zoomOutReuse(s) {
      const old = this.D;
      const b = this.spare(this.Pb, old);
      this.newBuffer(b, s, old.key);
      // finer tiles than usual, so more of the shrunken old image counts as fully covered
      b.T = Math.min(b.T, 32);
      b.tx = Math.ceil(this.Wb / b.T);
      b.ty = Math.ceil(this.Hb / b.T);
      b.done = new Uint8Array(b.tx * b.ty);
      this.composite(old, b, b.fbo, this.Wb, this.Hb, false);
      const k = 2 ** (s.pv.L - old.view.L);
      const d = HP.diff(s.pv, old.view);
      const c = Math.cos(old.view.rot), sn = Math.sin(old.view.rot);
      const ox = (c * d[0] + sn * d[1]) * this.halfH + this.Wb / 2, oy = (-sn * d[0] + c * d[1]) * this.halfH + this.Hb / 2;
      const toOld = (u, v) => [k * (u - this.Wb / 2) + ox, k * (v - this.Hb / 2) + oy];
      for (let ty = 0; ty < b.ty; ty++) {
        for (let tx = 0; tx < b.tx; tx++) {
          const [u0, v0] = toOld(tx * b.T, ty * b.T);
          const [u1, v1] = toOld(Math.min(this.Wb, (tx + 1) * b.T), Math.min(this.Hb, (ty + 1) * b.T));
          if (u0 < 0 || v0 < 0 || u1 > this.Wb || v1 > this.Hb) continue;
          let ok = true;
          for (let oty = Math.floor(v0 / old.T); ok && oty <= Math.min(old.ty - 1, Math.floor((v1 - 1e-6) / old.T)); oty++)
            for (let otx = Math.floor(u0 / old.T); ok && otx <= Math.min(old.tx - 1, Math.floor((u1 - 1e-6) / old.T)); otx++)
              if (!old.done[oty * old.tx + otx]) ok = false;
          if (ok) { b.done[ty * b.tx + tx] = 1; b.doneCount++; }
        }
      }
      this.sortQueue(b);
      this.D = b;
      this.needPresent = true;
    }

    // "Fast manual zoom": a quarter-resolution render of the whole view (1/16 of the work), shown
    // behind the full-resolution tiles while they fill in.
    // It adapts to cost: if a preview takes too long it drops to 1/8 or 1/16 resolution, and it's
    // never redrawn more often than ~3× its own cost, so it can't eat the whole frame.
    renderCoarse(s, key) {
      const now = performance.now();
      this.coarseF = this.coarseF || 4;
      if (now - (this.coarseAt || 0) < Math.max(33, (this.coarseCost || 0) * 3)) return;
      const gl = this.gl, F = this.coarseF;
      const cw = Math.ceil(this.Wb / F), ch = Math.ceil(this.Hb / F);
      if (!this.coarse || this.coarse.w !== cw || this.coarse.h !== ch) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (this.coarse) { gl.deleteTexture(this.coarse.tex); gl.deleteFramebuffer(this.coarse.fbo); }
        this.coarse = { tex, fbo, w: cw, h: ch, halfH: this.halfH / F };
      }
      let ref = null;
      if (s.deep) {
        ref = this.ensureRef(s, s.pv);
        if (!ref) return;
      }
      const t0 = performance.now();
      this.core.drawFractal(s.def, s.pv, {
        deep: s.deep, ref, aa: 1, time: s.time, iter: s.iter,
        fbo: this.coarse.fbo, w: cw, h: ch, halfH: this.halfH / F,
      });
      gl.finish();
      const dt = performance.now() - t0;
      this.coarseCost = dt;
      this.coarseAt = performance.now();
      this.frameSpent = (this.frameSpent || 0) + dt;
      if (dt > 10 && this.coarseF < 16) this.coarseF *= 2;
      else if (dt < 2.5 && this.coarseF > 4) this.coarseF /= 2;
      this.coarse.view = HP.clone(s.pv);
      this.coarse.key = key;
      this.needPresent = true;
    }

    newBuffer(b, s, key) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      b.view = HP.clone(s.pv);
      b.key = key;
      b.aa = s.animate ? s.aa : 1; // animated scenes can't wait for a refine pass
      b.isRefine = false;
      b.base = null;
      b.T = this.tile;
      b.tx = Math.ceil(this.Wb / b.T);
      b.ty = Math.ceil(this.Hb / b.T);
      b.done = new Uint8Array(b.tx * b.ty);
      b.doneCount = 0;
      b.doneAt = 0;
    }

    // Second pass over a finished one-sample image: re-render with anti-aliasing only where
    // neighbouring pixels differ (or everywhere, when adaptive AA is off).
    startRefine() {
      const base = this.D.isRefine ? this.D.base : this.D;
      this.Pb = null;
      const b = this.spare(base);
      this.newBuffer(b, this.scene, base.key);
      b.aa = this.targetAA;
      b.isRefine = true;
      b.base = base;
      b.edge = this.adaptive ? 0.1 : -1;
      this.sortQueue(b);
      this.Pb = base; // shown underneath until the refine pass covers it
      this.D = b;
      this.needPresent = true;
    }

    sortQueue(b) {
      const cx = this.Wb / 2, cy = this.Hb / 2;
      const q = [];
      for (let i = 0; i < b.done.length; i++) if (!b.done[i]) q.push(i);
      const dist = (i) => {
        const x = ((i % b.tx) + 0.5) * b.T - cx, y = (Math.floor(i / b.tx) + 0.5) * b.T - cy;
        return x * x + y * y;
      };
      q.sort((a, c) => dist(a) - dist(c));
      b.queue = q;
    }

    // Start a new render for this scene. The old partial image becomes the preview underneath.
    fresh(s, key, noPreview) {
      const old = this.D;
      if (noPreview) this.Pb = null;
      else if (old && old.doneCount > 0) {
        if (this.Pb) this.composite(this.Pb, old, old.fbo, this.Wb, this.Hb, true);
        this.Pb = old;
      }
      const b = this.spare(this.Pb);
      this.newBuffer(b, s, key);
      this.sortQueue(b);
      this.D = b;
      this.needPresent = true;
    }

    // Integer buffer-pixel offset between two views with equal scale and rotation, or null.
    shiftFor(from, to) {
      const d = HP.diff(to, from);
      const c = Math.cos(from.rot), sn = Math.sin(from.rot);
      const sx = (c * d[0] + sn * d[1]) * this.halfH;
      const sy = (-sn * d[0] + c * d[1]) * this.halfH;
      const rx = Math.round(sx), ry = Math.round(sy);
      if (Math.abs(sx - rx) > 1e-3 || Math.abs(sy - ry) > 1e-3) return null;
      if (Math.abs(rx) >= this.Wb || Math.abs(ry) >= this.Hb) return null;
      return [rx, ry];
    }

    // Pan: move already-rendered pixels and only queue the newly exposed tiles.
    shift([sx, sy], s) {
      const gl = this.gl;
      const old = this.D;
      const b = this.spare(this.Pb, old);
      const e = this.core.program(COPY);
      const L = this.core.use(e);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.viewport(0, 0, this.Wb, this.Hb);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, old.tex);
      gl.uniform1i(L('uTex'), 0);
      gl.uniform2i(L('uShift'), sx, sy);
      gl.uniform2i(L('uSize'), this.Wb, this.Hb);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const key = old.key;
      b.view = HP.clone(s.pv);
      b.key = key;
      // Newly exposed strips render at one sample; the refine pass then re-checks edges everywhere.
      b.aa = s.animate ? s.aa : 1;
      b.isRefine = false;
      b.base = null;
      b.T = this.tile;
      b.tx = Math.ceil(this.Wb / b.T);
      b.ty = Math.ceil(this.Hb / b.T);
      b.done = new Uint8Array(b.tx * b.ty);
      b.doneCount = 0;
      b.doneAt = 0;
      for (let ty = 0; ty < b.ty; ty++) {
        for (let tx = 0; tx < b.tx; tx++) {
          const x0 = tx * b.T + sx, x1 = Math.min(this.Wb, (tx + 1) * b.T) - 1 + sx;
          const y0 = ty * b.T + sy, y1 = Math.min(this.Hb, (ty + 1) * b.T) - 1 + sy;
          if (x0 < 0 || y0 < 0 || x1 >= this.Wb || y1 >= this.Hb) continue;
          let ok = true;
          for (let oy = Math.floor(y0 / old.T); ok && oy <= Math.floor(y1 / old.T); oy++)
            for (let ox = Math.floor(x0 / old.T); ok && ox <= Math.floor(x1 / old.T); ox++)
              if (!old.done[oy * old.tx + ox]) ok = false;
          if (ok) { b.done[ty * b.tx + tx] = 1; b.doneCount++; }
        }
      }
      this.sortQueue(b);
      this.D = b;
      this.needPresent = true;
    }

    // Draw buffer src (rendered for src.view) into a target whose centre is the current view.
    composite(src, viewOf, fbo, tw, th, under, alpha = 1) {
      const gl = this.gl;
      const e = this.core.program(COMPOSITE);
      const L = this.core.use(e);
      const cur = viewOf.view;
      const k = 2 ** (cur.L - src.view.L);
      const r = cur.rot - src.view.rot;
      const cr = Math.cos(r) * k, sr = Math.sin(r) * k;
      const d = HP.diff(cur, src.view);
      const c2 = Math.cos(-src.view.rot), s2 = Math.sin(-src.view.rot);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, tw, th);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(L('uTex'), 0);
      gl.uniform2f(L('uTarget'), tw, th);
      gl.uniform2f(L('uBuf'), src.w || this.Wb, src.h || this.Hb);
      gl.uniform1f(L('uHalf'), this.halfH);
      gl.uniform1f(L('uHalfSrc'), src.halfH || this.halfH);
      gl.uniform1f(L('uAlpha'), alpha);
      gl.uniformMatrix2fv(L('uM'), false, [cr, sr, -sr, cr]);
      gl.uniform2f(L('uT'), c2 * d[0] - s2 * d[1], s2 * d[0] + c2 * d[1]);
      gl.enable(gl.BLEND);
      if (under) gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }

    // Reference orbit for the current deep view: returns a usable one or null (and requests a better one).
    ensureRef(s, pv) {
      const core = this.core;
      const have = core.refUsable(core.ref, s.def, pv, s.iter);
      const p = this.pending;
      // Don't cancel an in-flight orbit that will still be usable when it lands (e.g. mid zoom gesture).
      const pendingOk = p && p.fkey === fkey(s.def) && p.P >= HP.neededP(pv.L) && p.maxIter >= s.iter;
      const pendingDist = pendingOk ? Math.hypot(...refOffset(pv, p)) : Infinity;
      const keepPending = have === 0 ? pendingDist < 500 : pendingDist < 4;
      if (have < 2 && !keepPending) {
        // Put the reference at the point being zoomed towards (it stays on screen for the whole
        // gesture, so the reference stays valid) and give it extra precision so it lasts ~64 more
        // halvings of scale before a new one is needed.
        let at = pv;
        if (s.anchor) {
          const o = HP.diff(s.anchor, pv);
          if (Math.hypot(o[0], o[1]) < 3) { at = HP.clone(s.anchor); at.L = pv.L; HP.setP(at, Math.max(at.P, pv.P)); }
        }
        const job = Deep.makeJob(s.def, s.deep, at, Math.ceil(s.iter * 1.25), 96);
        job.fkey = fkey(s.def);
        this.pending = { fkey: job.fkey, x: job.x, y: job.y, P: job.P, maxIter: job.maxIter };
        Deep.requestOrbit(job, (orbit) => {
          if (this.core.lost) return;
          this.core.setRef(orbit, job);
          this.pending = null;
          this.needPresent = true;
        });
      }
      return have ? core.ref : null;
    }

    // Smart iteration limit for a view; null while a deep view is still waiting for its reference.
    probeIter(def, pv, cap, aspect, time) {
      const { deep } = deepFor(def, pv);
      try {
        this.core.fractalProgram(def, deep);
      } catch {
        return null;
      }
      return this.core.probeIter(def, pv, { cap, aspect, time, deep });
    }

    // Render tiles until the time budget runs out (or everything, when animating).
    work(budgetMs) {
      // anything already spent this frame (the fast-zoom preview) comes out of the tile budget
      budgetMs = Math.max(2, budgetMs - (this.frameSpent || 0));
      this.frameSpent = 0;
      let D = this.D;
      const s = this.scene;
      this.waitingRef = false;
      if (!D || !s || this.error) return;
      if (!D.queue.length) {
        // Finished a pass: add (or redo) the anti-aliasing refine pass once the view is at rest.
        if (s.animate || s.interacting) return;
        const want = this.targetAA || 1;
        if (!D.isRefine && want > 1) this.startRefine();
        else if (D.isRefine && (D.aa !== want || D.edge !== (this.adaptive ? 0.1 : -1))) {
          if (want > 1) this.startRefine();
          else { this.D = D.base; this.Pb = null; this.needPresent = true; }
          return;
        } else return;
        D = this.D;
      }
      let ref = null;
      if (s.deep) {
        ref = this.ensureRef(s, D.view);
        if (!ref) { this.waitingRef = true; return; }
      }
      const gl = this.gl;
      const t0 = performance.now();
      while (D.queue.length) {
        const i = D.queue.shift();
        const x = (i % D.tx) * D.T, y = Math.floor(i / D.tx) * D.T;
        const ts = performance.now();
        this.core.drawFractal(s.def, D.view, {
          deep: s.deep, ref, aa: D.aa, time: s.time, iter: s.iter,
          fbo: D.fbo, w: this.Wb, h: this.Hb, halfH: this.halfH,
          scissor: [x, y, Math.min(D.T, this.Wb - x), Math.min(D.T, this.Hb - y)],
          refine: D.isRefine ? D.base.tex : null, edge: D.edge,
        });
        D.done[i] = 1;
        D.doneCount++;
        if (s.animate) continue;
        gl.finish();
        const dt = performance.now() - ts;
        if (dt > 30 && this.tile > 32) this.tile /= 2;
        else if (dt < 2 && this.tile < 256) this.tile *= 2;
        if (performance.now() - t0 > budgetMs) break;
      }
      // finished: the preview is no longer needed (except in keyframe mode, where the screen may still
      // be looking at a wider area than the finished buffer covers)
      if (!D.queue.length && !D.doneAt) D.doneAt = performance.now();
      if (!D.queue.length && this.Pb && !this.keepPreview) this.Pb = null;
      this.needPresent = true;
    }

    // Draws the buffers to the screen as seen from displayPv. That can differ from the view being
    // rendered: during animated zooms the destination (or next keyframe) renders while the screen
    // shows the finished images magnified or shrunk to the current in-between position.
    present(displayPv) {
      if (!this.D || this.core.lost) return;
      const dv = displayPv || this.D.view;
      const dk = dv.x + ',' + dv.y + ',' + dv.L + ',' + dv.rot;
      if (dk !== this.lastDisplayKey) { this.lastDisplayKey = dk; this.needPresent = true; }
      if (!this.needPresent) return;
      const gl = this.gl;
      const at = { view: dv };
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.W, this.H);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const D = this.D;
      this.needPresent = false;
      // Bottom to top: the rough fast-zoom preview only fills gaps (it never covers the sharper previous
      // image, so the view doesn't pump between blurry and sharp), then the previous image, then the
      // new one.
      const c = this.coarse;
      if (c && c.view && c.key === D.key && D.queue.length) this.composite(c, at, null, this.W, this.H, false);
      if (this.Pb) this.composite(this.Pb, at, null, this.W, this.H, false);
      if (this.hidePartial && this.Pb) {
        // automatic zoom: a new keyframe appears only once complete, cross-faded in (no tile pop-in).
        // (With nothing underneath yet, it's drawn progressively as usual instead of leaving black.)
        if (!D.queue.length && !D.doneAt) D.doneAt = performance.now();
        if (!D.queue.length) {
          const a = Math.min(1, (performance.now() - D.doneAt) / 250);
          this.composite(D, at, null, this.W, this.H, false, a);
          if (a < 1) this.needPresent = true;
        }
      } else {
        this.composite(D, at, null, this.W, this.H, false);
      }
    }
  }

  return { EscapeRenderer, Viewer, buildFragment, COLORING, MAPPING, MAX_STOPS, DEEP_L, blaSettings };
})();

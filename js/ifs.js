// Iterated Function System renderer (chaos game) with log-density tone mapping and flame-style variations.
const IFS = (() => {
  const VARIATIONS = ['linear', 'sinusoidal', 'spherical', 'swirl', 'horseshoe', 'polar', 'heart', 'disc', 'fisheye', 'bubble',
    'spiral', 'hyperbolic', 'diamond', 'ex', 'julia', 'cylinder', 'tangent', 'cross'];

  function prepare(def) {
    const T = (def.transforms || []).filter((t) => t && +t.weight > 0);
    const n = T.length;
    if (!n) return null;
    const P = {
      n,
      A: new Float64Array(n), B: new Float64Array(n), C: new Float64Array(n),
      D: new Float64Array(n), E: new Float64Array(n), F: new Float64Array(n),
      V: new Uint8Array(n), R: new Float32Array(n), G: new Float32Array(n), Bl: new Float32Array(n),
      cum: new Float64Array(n),
    };
    let tot = 0;
    T.forEach((t, i) => {
      P.A[i] = +t.a || 0; P.B[i] = +t.b || 0; P.C[i] = +t.c || 0;
      P.D[i] = +t.d || 0; P.E[i] = +t.e || 0; P.F[i] = +t.f || 0;
      P.V[i] = Math.max(0, VARIATIONS.indexOf(t.variation || 'linear'));
      const [r, g, b] = U.hexToRgb(t.color || '#ffffff');
      P.R[i] = r; P.G[i] = g; P.Bl[i] = b;
      tot += +t.weight;
      P.cum[i] = tot;
    });
    for (let i = 0; i < n; i++) P.cum[i] /= tot;
    P.cum[n - 1] = 1;
    return P;
  }

  // Applies map i to (x, y); result in ox, oy.
  let ox = 0, oy = 0;
  function apply(P, i, x, y) {
    let nx = P.A[i] * x + P.B[i] * y + P.E[i];
    let ny = P.C[i] * x + P.D[i] * y + P.F[i];
    switch (P.V[i]) {
      case 1: nx = Math.sin(nx); ny = Math.sin(ny); break;
      case 2: { const r2 = nx * nx + ny * ny + 1e-12; nx /= r2; ny /= r2; break; }
      case 3: {
        const r2 = nx * nx + ny * ny, s = Math.sin(r2), c = Math.cos(r2);
        const tx = nx * s - ny * c; ny = nx * c + ny * s; nx = tx; break;
      }
      case 4: { const r = Math.sqrt(nx * nx + ny * ny) + 1e-12; const tx = ((nx - ny) * (nx + ny)) / r; ny = (2 * nx * ny) / r; nx = tx; break; }
      case 5: { const r = Math.sqrt(nx * nx + ny * ny); const th = Math.atan2(nx, ny); nx = th / Math.PI; ny = r - 1; break; }
      case 6: { const r = Math.sqrt(nx * nx + ny * ny); const th = Math.atan2(nx, ny); nx = r * Math.sin(th * r); ny = -r * Math.cos(th * r); break; }
      case 7: { const r = Math.sqrt(nx * nx + ny * ny); const th = Math.atan2(nx, ny) / Math.PI; nx = th * Math.sin(Math.PI * r); ny = th * Math.cos(Math.PI * r); break; }
      case 8: { const r = Math.sqrt(nx * nx + ny * ny); const k = 2 / (r + 1); const tx = k * ny; ny = k * nx; nx = tx; break; }
      case 9: { const k = 4 / (nx * nx + ny * ny + 4); nx *= k; ny *= k; break; }
      case 10: { const r = Math.sqrt(nx * nx + ny * ny) + 1e-12; const sa = nx / r, ca = ny / r; nx = (ca + Math.sin(r)) / r; ny = (sa - Math.cos(r)) / r; break; }
      case 11: { const r = Math.sqrt(nx * nx + ny * ny) + 1e-12; const sa = nx / r, ca = ny / r; nx = sa / r; ny = ca * r; break; }
      case 12: { const r = Math.sqrt(nx * nx + ny * ny) + 1e-12; const sa = nx / r, ca = ny / r; nx = sa * Math.cos(r); ny = ca * Math.sin(r); break; }
      case 13: {
        const r = Math.sqrt(nx * nx + ny * ny), th = Math.atan2(nx, ny);
        const m0 = Math.sin(th + r) ** 3, m1 = Math.cos(th - r) ** 3;
        nx = r * (m0 + m1); ny = r * (m0 - m1); break;
      }
      case 14: {
        const r = Math.sqrt(Math.sqrt(nx * nx + ny * ny)), a = 0.5 * Math.atan2(ny, nx) + (Math.random() < 0.5 ? 0 : Math.PI);
        nx = r * Math.cos(a); ny = r * Math.sin(a); break;
      }
      case 15: nx = Math.sin(nx); break;
      case 16: { const tx = Math.sin(nx) / Math.cos(ny); ny = Math.tan(ny); nx = tx; break; }
      case 17: { const q = nx * nx - ny * ny, k = Math.sqrt(1 / (q * q + 1e-12)); nx *= k; ny *= k; break; }
    }
    ox = nx; oy = ny;
  }

  function pickMap(P) {
    const r = Math.random();
    let i = 0;
    while (i < P.n - 1 && r > P.cum[i]) i++;
    return i;
  }

  function createAccum(w, h) {
    const N = w * h;
    return { w, h, count: new Uint32Array(N), cr: new Float32Array(N), cg: new Float32Array(N), cb: new Float32Array(N), total: 0, max: 0, target: 0 };
  }

  function reset(st, view, prep) {
    st.count.fill(0); st.cr.fill(0); st.cg.fill(0); st.cb.fill(0);
    st.total = 0; st.max = 0; st.prep = prep;
    st.k = st.h / 2 / view.scale;
    st.cos = Math.cos(view.rot || 0); st.sin = Math.sin(view.rot || 0);
    st.cx = view.cx; st.cy = view.cy;
    st.x = Math.random() * 2 - 1; st.y = Math.random() * 2 - 1;
    st.r = st.g = st.b = 0.5;
    st.warm = 30;
    if (prep && prep.init) prep.init(st);
  }

  function iterate(st, N) {
    const P = st.prep;
    if (!P) return;
    if (P.iterate) return P.iterate(st, N); // attractors (attractor.js)
    const { R, G, Bl } = P;
    const w = st.w, h = st.h, hw = w / 2, hh = h / 2, k = st.k, co = st.cos, si = st.sin, cx = st.cx, cy = st.cy;
    const count = st.count, CR = st.cr, CG = st.cg, CB = st.cb;
    let x = st.x, y = st.y, r = st.r, g = st.g, b = st.b, max = st.max, warm = st.warm;
    for (let it = 0; it < N; it++) {
      const i = pickMap(P);
      apply(P, i, x, y);
      if (!(ox > -1e9 && ox < 1e9 && oy > -1e9 && oy < 1e9)) {
        x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; warm = 20;
        continue;
      }
      x = ox; y = oy;
      r = (r + R[i]) * 0.5; g = (g + G[i]) * 0.5; b = (b + Bl[i]) * 0.5;
      if (warm > 0) { warm--; continue; }
      const dx = x - cx, dy = y - cy;
      const fx = hw + (dx * co + dy * si) * k;
      const fy = hh - (dy * co - dx * si) * k;
      if (fx >= 0 && fx < w && fy >= 0 && fy < h) {
        const idx = (fy | 0) * w + (fx | 0);
        const c = ++count[idx];
        if (c > max) max = c;
        CR[idx] += r; CG[idx] += g; CB[idx] += b;
      }
    }
    st.x = x; st.y = y; st.r = r; st.g = g; st.b = b; st.max = max; st.warm = warm;
    st.total += N;
  }

  function paletteLUT(pal) {
    const lut = new Uint8Array(256 * 3);
    const cols = (pal && pal.length ? pal : ['#000', '#fff']).map(U.hexToRgb);
    // Non-cyclic here: density maps low -> high across the stops.
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * (cols.length - 1);
      const a = Math.floor(x), f = x - a;
      const c0 = cols[a], c1 = cols[Math.min(a + 1, cols.length - 1)];
      for (let j = 0; j < 3; j++) lut[i * 3 + j] = Math.round((c0[j] + (c1[j] - c0[j]) * f) * 255);
    }
    return lut;
  }

  function toImage(st, def, img) {
    const data = img.data;
    const N = st.w * st.h;
    const [bR, bG, bB] = U.hexToRgb(def.background).map((v) => v * 255);
    const max = st.max;
    const count = st.count, CR = st.cr, CG = st.cg, CB = st.cb;
    if (!max) {
      for (let j = 0; j < N * 4; j += 4) { data[j] = bR; data[j + 1] = bG; data[j + 2] = bB; data[j + 3] = 255; }
      return;
    }
    const lm = Math.log(1 + max), invG = 1 / (def.gamma || 2.2), br = def.brightness || 1;
    const usePal = def.colorMode === 'palette';
    const lut = usePal ? paletteLUT(def.palette) : null;
    const TL = Math.min(max + 1, 65536);
    const tab = new Float32Array(TL);
    for (let c = 1; c < TL; c++) tab[c] = Math.pow(Math.log(1 + c) / lm, invG);
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const c = count[i];
      if (c === 0) { data[j] = bR; data[j + 1] = bG; data[j + 2] = bB; data[j + 3] = 255; continue; }
      const t = c < TL ? tab[c] : Math.pow(Math.log(1 + c) / lm, invG);
      const a = Math.min(1, t * br);
      let r, g, b;
      if (usePal) {
        const li = Math.min(255, (t * 255) | 0) * 3;
        r = lut[li]; g = lut[li + 1]; b = lut[li + 2];
      } else {
        const s = 255 / c;
        r = CR[i] * s; g = CG[i] * s; b = CB[i] * s;
      }
      data[j] = bR + (r - bR) * a;
      data[j + 1] = bG + (g - bG) * a;
      data[j + 2] = bB + (b - bB) * a;
      data[j + 3] = 255;
    }
  }

  // Estimates a view that frames the attractor.
  function fit(def, aspect = 1.6) {
    const P = prepareAny(def);
    if (!P) return { cx: 0, cy: 0, scale: 1, rot: 0 };
    const M = 40000;
    let xs = new Float64Array(M), ys = new Float64Array(M);
    let m = 0;
    if (P.sample) ({ xs, ys, m } = P.sample(M));
    else {
      let x = 0.1, y = 0.1;
      for (let it = 0; it < M + 50 && m < M; it++) {
        apply(P, pickMap(P), x, y);
        if (!isFinite(ox) || !isFinite(oy) || Math.abs(ox) > 1e6 || Math.abs(oy) > 1e6) { x = Math.random(); y = Math.random(); continue; }
        x = ox; y = oy;
        if (it >= 50) { xs[m] = x; ys[m] = y; m++; }
      }
    }
    if (m < 100) return { cx: 0, cy: 0, scale: 1, rot: 0 };
    const sx = xs.subarray(0, m).sort(), sy = ys.subarray(0, m).sort();
    const q = (arr, f) => arr[Math.min(m - 1, Math.max(0, Math.floor(f * m)))];
    const x0 = q(sx, 0.002), x1 = q(sx, 0.998), y0 = q(sy, 0.002), y1 = q(sy, 0.998);
    const scale = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect) * 1.1 || 1;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale, rot: 0 };
  }

  // IFS maps or, for type 'attractor', the attractor's point generator.
  const prepareAny = (def) => (def.type === 'attractor' ? Attr.prepare(def) : prepare(def));

  return { VARIATIONS, prepare: prepareAny, createAccum, reset, iterate, toImage, fit, paletteLUT };
})();

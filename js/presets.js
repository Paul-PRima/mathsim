// Default definitions, built-in library entries and random generators.
const Defs = (() => {
  function escapeDefaults() {
    return {
      type: 'escape',
      name: 'Untitled',
      formula: 'z^2 + c',
      init: '0',
      julia: false,
      juliaC: [-0.8, 0.156],
      k: [0, 0],
      maxIter: 300,
      bailout: 256,
      escape: true,
      converge: false,
      epsilon: 1e-6,
      coloring: 'smooth',
      mapping: 'linear',
      density: 1,
      offset: 0,
      shade: 0,
      stripeFreq: 5,
      interior: '#000000',
      palette: PALETTES.Ultra.slice(),
      view: { cx: -0.5, cy: 0, scale: 1.3, rot: 0 },
    };
  }

  // A complex function f plotted by domain colouring: one step of z -> f(z) from z = pixel.
  function functionDefaults() {
    return Object.assign(escapeDefaults(), {
      name: 'Complex function',
      formula: '(z^2 - 1)*(z - 2 - i)^2/(z^2 + 2 + 2i)',
      init: 'p', maxIter: 1, escape: false, converge: false,
      coloring: 'domain', density: 1, offset: 0, shade: 0.45, stripeFreq: 0,
      palette: PALETTES.Rainbow.slice(),
      view: { cx: 0, cy: 0, scale: 3, rot: 0 },
    });
  }

  function ifsDefaults() {
    return {
      type: 'ifs',
      name: 'Untitled IFS',
      transforms: [
        { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0, weight: 1, variation: 'linear', color: '#ff5d8f' },
        { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.5, f: 0, weight: 1, variation: 'linear', color: '#5dd6ff' },
        { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.25, f: 0.433, weight: 1, variation: 'linear', color: '#ffd35d' },
      ],
      colorMode: 'transform',
      palette: PALETTES.Fire.slice(),
      gamma: 2.2,
      brightness: 1.2,
      background: '#05060a',
      view: null,
    };
  }

  function normalize(d) {
    const type = d && d.type;
    const base = type === 'ifs' ? ifsDefaults() : type === 'vector' ? Vec.defaults() : type === '3d' ? F3D.defaults()
      : type === 'attractor' ? Attr.defaults(d.kind) : escapeDefaults();
    const out = Object.assign(base, U.clone(d || {}));
    out.bookmarks = Array.isArray(out.bookmarks) ? out.bookmarks : [];
    if (out.type === '3d') {
      out.camera = Object.assign(F3D.defaults().camera, d.camera || {});
      out.juliaC = Array.isArray(out.juliaC) ? out.juliaC.map(Number) : [0, 0, 0];
      out.view = { cx: 0, cy: 0, scale: 1, rot: 0 }; // unused in 3D, kept so shared view code stays simple
    } else if (out.type === 'vector') {
      out.view = Object.assign({ cx: 0, cy: 0, scale: 1.15, rot: 0 }, d.view || base.view);
    } else if (out.type === 'attractor') {
      if (!Attr.KINDS[out.kind]) out.kind = 'clifford';
      out.view = d.view ? Object.assign({ cx: 0, cy: 0, scale: 1, rot: 0 }, d.view) : null;
    } else if (out.type === 'escape') {
      out.view = Object.assign({ cx: 0, cy: 0, scale: 1.5, rot: 0 }, d.view || base.view);
      out.juliaC = Array.isArray(out.juliaC) ? out.juliaC.map(Number) : [0, 0];
      out.k = Array.isArray(out.k) ? out.k.map(Number) : [0, 0];
    } else {
      out.view = d.view ? Object.assign({ cx: 0, cy: 0, scale: 1, rot: 0 }, d.view) : null;
      out.transforms = (out.transforms || []).map((t) =>
        Object.assign({ a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0, weight: 1, variation: 'linear', color: '#ffffff' }, t)
      );
    }
    if (!Array.isArray(out.palette) || out.palette.length < 2) out.palette = base.palette;
    return out;
  }

  const E = (o) => Object.assign(escapeDefaults(), o);
  const Fn = (o) => Object.assign(functionDefaults(), o);
  const A = (kind, o) => Object.assign(Attr.defaults(kind), o);
  const B3 = (o) => Object.assign(F3D.defaults(), o);
  const I = (o) => Object.assign(ifsDefaults(), o);
  const T = (a, b, c, d, e, f, weight, color, variation = 'linear') => ({ a, b, c, d, e, f, weight, color, variation });
  const s3 = Math.sqrt(3);

  const BUILTINS = [
    E({ name: 'Mandelbrot', maxIter: 500, view: { cx: -0.6, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Seahorse Valley', maxIter: 1200, palette: PALETTES.Ocean.slice(), density: 1.6, view: { cx: -0.7453, cy: 0.1127, scale: 0.0065, rot: 0 } }),
    E({ name: 'Elephant Valley', maxIter: 1000, palette: PALETTES.Copper.slice(), density: 1.3, view: { cx: 0.2855, cy: 0.0115, scale: 0.012, rot: 0 } }),
    E({ name: 'Mandelbrot Orbit Trap', coloring: 'trap-point', mapping: 'sqrt', density: 1.4, palette: PALETTES.Neon.slice(), interior: '#0d0221', maxIter: 400, view: { cx: -0.6, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Mandelbrot Stripes', coloring: 'stripe', bailout: 1000, stripeFreq: 5, density: 1, palette: PALETTES.Aurora.slice(), maxIter: 600, view: { cx: -0.6, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Classic Julia', julia: true, juliaC: [-0.8, 0.156], palette: PALETTES.Sunset.slice(), maxIter: 500, density: 0.8, view: { cx: 0, cy: 0, scale: 1.1, rot: 0 } }),
    E({ name: 'Douady Rabbit', julia: true, juliaC: [-0.123, 0.745], palette: PALETTES.Candy.slice(), maxIter: 400, interior: '#2a0f3d', view: { cx: 0, cy: 0, scale: 1.3, rot: 0 } }),
    E({ name: 'Dendrite', julia: true, juliaC: [0, 1], coloring: 'trap-cross', mapping: 'sqrt', density: 1.5, palette: PALETTES.Ice.slice(), interior: '#0a1f44', maxIter: 300, view: { cx: 0, cy: 0, scale: 1.4, rot: 0 } }),
    E({ name: 'Siegel Disk', julia: true, juliaC: [-0.390541, -0.586788], coloring: 'trap-point', mapping: 'sqrt', density: 2, palette: PALETTES.Forest.slice(), interior: '#07130b', maxIter: 600, view: { cx: 0, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Burning Ship', formula: 'abs(z)^2 + conj(c)', palette: PALETTES.Fire.slice(), maxIter: 400, density: 0.8, view: { cx: -0.2, cy: 0.7, scale: 1.4, rot: 0 } }),
    E({ name: 'Burning Ship Armada', formula: 'abs(z)^2 + conj(c)', palette: PALETTES.Fire.slice(), maxIter: 800, density: 1.2, view: { cx: -1.762, cy: 0.028, scale: 0.045, rot: 0 } }),
    E({ name: 'Tricorn', formula: 'conj(z)^2 + c', palette: PALETTES.Midnight.slice(), maxIter: 400, view: { cx: -0.3, cy: 0, scale: 1.4, rot: 0 } }),
    E({ name: 'Multibrot z³', formula: 'z^3 + c', palette: PALETTES.Aurora.slice(), maxIter: 400, view: { cx: 0, cy: 0, scale: 1.3, rot: 0 } }),
    E({ name: 'Multibrot z⁵', formula: 'z^5 + c', palette: PALETTES.Rainbow.slice(), density: 0.6, maxIter: 300, view: { cx: 0, cy: 0, scale: 1.3, rot: 0 } }),
    E({ name: 'Celtic', formula: 'abs(re(z^2)) + i*im(z^2) + c', palette: PALETTES.Forest.slice(), maxIter: 400, view: { cx: -0.5, cy: 0, scale: 1.3, rot: 0 } }),
    E({ name: 'Phoenix', formula: 'z^2 + c + k*zp', julia: true, juliaC: [0.5667, 0], k: [-0.5, 0], palette: PALETTES.Fire.slice(), maxIter: 400, density: 0.7, view: { cx: 0, cy: 0, scale: 1.3, rot: Math.PI / 2 } }),
    E({ name: 'Newton z³ − 1', formula: 'z - (z^3 - 1)/(3*z^2)', init: 'p', escape: false, converge: true, epsilon: 1e-8, coloring: 'angle', shade: 0.6, offset: -1 / 6, palette: PALETTES.Roots.slice(), maxIter: 100, view: { cx: 0, cy: 0, scale: 1.5, rot: 0 } }),
    E({ name: 'Newton Star', formula: 'z - (z^8 + 15*z^4 - 16)/(8*z^7 + 60*z^3)', init: 'p', escape: false, converge: true, epsilon: 1e-8, coloring: 'angle', shade: 0.5, palette: PALETTES.Rainbow.slice(), maxIter: 100, view: { cx: 0, cy: 0, scale: 2.2, rot: 0 } }),
    E({ name: 'Nova', formula: 'z - (z^3 - 1)/(3*z^2) + c', init: '1', escape: true, bailout: 1e4, converge: true, epsilon: 1e-7, palette: PALETTES.Sunset.slice(), density: 2.5, maxIter: 200, interior: '#1a0b2e', view: { cx: -0.3, cy: 0, scale: 1.4, rot: 0 } }),
    E({ name: 'Magnet I', formula: '((z^2 + c - 1)/(2*z + c - 2))^2', bailout: 100, converge: true, epsilon: 1e-7, palette: PALETTES.Ice.slice(), density: 1.5, maxIter: 300, interior: '#0a1f44', view: { cx: 1.3, cy: 0, scale: 2.2, rot: 0 } }),
    E({ name: 'Lambda', formula: 'c*z*(1 - z)', init: '0.5', palette: PALETTES.Aurora.slice(), maxIter: 400, view: { cx: 1, cy: 0, scale: 1.9, rot: 0 } }),
    E({ name: 'Sine Julia', formula: 'c*sin(z)', julia: true, juliaC: [1, 0.3], bailout: 50, palette: PALETTES.Fire.slice(), maxIter: 200, density: 1.5, view: { cx: 0, cy: 0, scale: 3, rot: 0 } }),
    E({ name: 'Breathing Julia ✦', formula: 'z^2 + 0.7885*exp(i*(t*0.25 + 2.2))', julia: true, palette: PALETTES.Neon.slice(), maxIter: 300, density: 0.8, view: { cx: 0, cy: 0, scale: 1.3, rot: 0 } }),

    I({
      name: 'Barnsley Fern', colorMode: 'palette', palette: ['#07130b', '#1f6b35', '#7ddc5a', '#e9ffc8'], brightness: 1.4,
      transforms: [
        T(0, 0, 0, 0.16, 0, 0, 0.01, '#6b4f2b'),
        T(0.85, 0.04, -0.04, 0.85, 0, 1.6, 0.85, '#7ddc5a'),
        T(0.2, -0.26, 0.23, 0.22, 0, 1.6, 0.07, '#2fae5b'),
        T(-0.15, 0.28, 0.26, 0.24, 0, 0.44, 0.07, '#b6f36b'),
      ],
    }),
    I({ name: 'Sierpinski Triangle' }),
    I({
      name: 'Sierpinski Carpet', colorMode: 'palette', palette: PALETTES.Ice.slice(1, 4).reverse(),
      transforms: [0, 1, 2, 3, 5, 6, 7, 8].map((k) => T(1 / 3, 0, 0, 1 / 3, (k % 3) / 3, Math.floor(k / 3) / 3, 1, U.hslToHex(k * 40, 0.8, 0.6))),
    }),
    I({
      name: 'Heighway Dragon',
      transforms: [T(0.5, -0.5, 0.5, 0.5, 0, 0, 1, '#ff6b6b'), T(-0.5, -0.5, 0.5, -0.5, 1, 0, 1, '#ffd166')],
    }),
    I({
      name: 'Lévy C Curve',
      transforms: [T(0.5, -0.5, 0.5, 0.5, 0, 0, 1, '#4cc9f0'), T(0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 1, '#f72585')],
    }),
    I({
      name: 'Koch Curve', brightness: 1.6,
      transforms: [
        T(1 / 3, 0, 0, 1 / 3, 0, 0, 1, '#a0c4ff'),
        T(1 / 6, -s3 / 6, s3 / 6, 1 / 6, 1 / 3, 0, 1, '#bdb2ff'),
        T(1 / 6, s3 / 6, -s3 / 6, 1 / 6, 0.5, s3 / 6, 1, '#ffc6ff'),
        T(1 / 3, 0, 0, 1 / 3, 2 / 3, 0, 1, '#9bf6ff'),
      ],
    }),
    I({
      name: 'Maple Leaf',
      transforms: [
        T(0.14, 0.01, 0, 0.51, -0.08, -1.31, 0.1, '#7a2e0e'),
        T(0.43, 0.52, -0.45, 0.5, 1.49, -0.75, 0.35, '#e85d04'),
        T(0.45, -0.49, 0.47, 0.47, -1.62, -0.74, 0.35, '#dc2f02'),
        T(0.49, 0, 0, 0.51, 0.02, 1.62, 0.2, '#ffba08'),
      ],
    }),
    I({
      name: 'Fractal Tree',
      transforms: [
        T(0, 0, 0, 0.5, 0, 0, 0.05, '#8d6e63'),
        T(0.42, -0.42, 0.42, 0.42, 0, 0.2, 0.4, '#81c784'),
        T(0.42, 0.42, -0.42, 0.42, 0, 0.2, 0.4, '#aed581'),
        T(0.1, 0, 0, 0.1, 0, 0.2, 0.15, '#6d4c41'),
      ],
    }),
    I({
      name: 'Golden Spiral', colorMode: 'palette', palette: ['#1b0e08', '#b8860b', '#ffd700', '#fff8dc'],
      transforms: [
        T(0.787879, -0.424242, 0.242424, 0.859848, 1.758647, 1.408065, 0.9, '#ffd700'),
        T(-0.121212, 0.257576, 0.151515, 0.05303, -6.721654, 1.377236, 0.05, '#ff8c00'),
        T(0.181818, -0.136364, 0.090909, 0.181818, 6.086107, 1.568035, 0.05, '#fff8dc'),
      ],
    }),
    I({
      name: 'Swirl Flame', brightness: 1.8, gamma: 2.8,
      transforms: [
        T(0.5, 0, 0, 0.5, 0, 0, 1, '#ff006e', 'swirl'),
        T(0.5, 0, 0, 0.5, 0.5, 0, 1, '#3a86ff', 'swirl'),
        T(0.5, 0, 0, 0.5, 0.25, 0.433, 1, '#ffbe0b', 'swirl'),
      ],
    }),
    Object.assign(Vec.defaults(), { name: 'Kuschnig Fractal' }),
    Object.assign(Vec.defaults(), {
      name: 'Kuschnig Fractal — infinite detail', auto: true, lineWidth: 1.2, widthFalloff: 0.92,
      palette: ['#3a86ff', '#3a86ff'], background: '#0b0f1a',
    }),
    Object.assign(Vec.defaults(), {
      name: 'Kuschnig Lace', depth: 11, showAll: false, lineWidth: 1.4, split: 0.5,
      palette: ['#3a86ff', '#3a86ff'],
    }),
    I({
      name: 'Polar Knot', brightness: 2, gamma: 3,
      transforms: [
        T(0.8, 0, 0, 0.8, 0, 0, 1, '#b5179e', 'polar'),
        T(0.5, 0.2, -0.2, 0.5, 0.3, 0.2, 1, '#4895ef', 'sinusoidal'),
        T(0.4, 0, 0, 0.4, -0.4, 0, 1, '#f9c74f', 'linear'),
      ],
    }),
    I({
      name: 'Bubble Crescent', brightness: 2, gamma: 3,
      transforms: [
        T(0.6, 0, 0, 0.6, 0, 0, 1, '#ffbe0b', 'bubble'),
        T(0.5, -0.5, 0.5, 0.5, 0.4, 0, 1, '#fb5607', 'linear'),
        T(0.5, 0.5, -0.5, 0.5, -0.4, 0, 1, '#3a86ff', 'linear'),
      ],
    }),
  ];

  // ---------- extended library ----------
  const star = (n, dist, scale, colorFn) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    return T(scale, 0, 0, scale, dist * Math.cos(a), dist * Math.sin(a), 1, colorFn(i));
  });
  BUILTINS.push(
    // deep zoom showcase (coordinates verified against exact arithmetic)
    E({
      name: 'Seahorse Spiral ×10¹⁰', category: 'Deep zoom', maxIter: 3000, palette: PALETTES.Ultra.slice(), density: 1,
      view: { cx: '-0.743643887037158704752191506114774', cy: '0.131825904205311970493132056385139', scale: 1e-10, rot: 0 },
    }),
    E({
      name: 'Seahorse Spiral ×10⁶', category: 'Deep zoom', maxIter: 2000, palette: PALETTES.Ocean.slice(), density: 1.4,
      view: { cx: '-0.743643887037158704752191506114774', cy: '0.131825904205311970493132056385139', scale: 1e-6, rot: 0 },
    }),
    // more escape-time sets
    E({ name: 'Mandelbrot Heart', formula: '(abs(re(z)) + i*im(z))^2 + c', palette: PALETTES.Candy.slice(), interior: '#2a0f3d', maxIter: 400, view: { cx: -0.2, cy: 0, scale: 0.9, rot: 0 } }),
    E({ name: 'Buffalo', formula: 'abs(z)^2 - abs(z) + c', palette: PALETTES.Copper.slice(), maxIter: 400, view: { cx: -0.3, cy: 0.3, scale: 1.5, rot: 0 } }),
    E({ name: 'Inverted Mandelbrot', formula: 'z^2 + inv(c)', palette: PALETTES.Midnight.slice(), maxIter: 400, view: { cx: 1.5, cy: 0, scale: 2.4, rot: 0 } }),
    E({ name: 'Cosine Mandelbrot', formula: 'cos(z) + c', bailout: 50, palette: PALETTES.Aurora.slice(), maxIter: 200, density: 1.4, view: { cx: 0, cy: 0, scale: 4, rot: 0 } }),
    E({ name: 'Spiral Julia', julia: true, juliaC: [-0.7269, 0.1889], palette: PALETTES.Ocean.slice(), maxIter: 600, view: { cx: 0, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Airplane Julia', julia: true, juliaC: [-1.7549, 0], coloring: 'trap-cross', mapping: 'sqrt', density: 1.5, palette: PALETTES.Ice.slice(), interior: '#0a1f44', maxIter: 400, view: { cx: 0, cy: 0, scale: 1.2, rot: 0 } }),
    // more IFS
    I({ name: 'Hexaflake', colorMode: 'palette', palette: ['#0b132b', '#5bc0be', '#f4d35e'], transforms: [T(1 / 3, 0, 0, 1 / 3, 0, 0, 1, '#f4d35e'), ...star(6, 2 / 3, 1 / 3, (i) => U.hslToHex(i * 60, 0.8, 0.6))] }),
    I({ name: 'Vicsek Cross', transforms: [T(1 / 3, 0, 0, 1 / 3, 0, 0, 1, '#ffffff'), ...star(4, 2 / 3, 1 / 3, (i) => U.hslToHex(i * 90 + 20, 0.85, 0.6))] }),
    I({ name: 'Cantor Dust', colorMode: 'palette', palette: ['#1b0e08', '#d98c4a', '#ffd9a8'], transforms: [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, y], i) => T(1 / 3, 0, 0, 1 / 3, (2 / 3) * x, (2 / 3) * y, 1, U.hslToHex(i * 90, 0.8, 0.6))) }),
    // vector generators
    ...Object.keys(Vec.TEMPLATES).filter((n) => n !== 'Kuschnig (as rules)').map((n) => Vec.fromTemplate(n)),
    // 3D
    Object.assign(F3D.defaults(), { name: 'Mandelbulb' }),
    Object.assign(F3D.defaults(), { name: 'Mandelbulb (power 3)', power: 3, palette: PALETTES.Sunset.slice(), camera: { yaw: 120, pitch: 15, dist: 2.8, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    Object.assign(F3D.defaults(), { name: 'Julia Bulb', julia: true, juliaC: [0.35, 0.35, -0.25], palette: PALETTES.Aurora.slice() }),
    Object.assign(F3D.defaults(), { name: 'Mandelbox', kind: 'mandelbox', boxScale: -1.8, iterations: 12, palette: PALETTES.Copper.slice(), camera: { yaw: 30, pitch: 25, dist: 9, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    Object.assign(F3D.defaults(), { name: 'Mandelbox (scale 2)', kind: 'mandelbox', boxScale: 2, iterations: 12, palette: PALETTES.Ice.slice(), camera: { yaw: 45, pitch: 30, dist: 14, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    Object.assign(F3D.defaults(), { name: 'Menger Sponge', kind: 'menger', iterations: 5, palette: ['#3a506b', '#5bc0be', '#f4d35e', '#ee964b', '#f95738'], camera: { yaw: 40, pitch: 30, dist: 3.6, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    Object.assign(F3D.defaults(), { name: 'Sierpinski Tetrahedron', kind: 'sierpinski', iterations: 14, palette: PALETTES.Neon.slice(), camera: { yaw: 25, pitch: 20, dist: 4, tx: 0, ty: 0, tz: 0, fov: 45 } }),
  );

  const RB = () => PALETTES.Rainbow.slice();
  BUILTINS.push(
    // more escape-time fractals
    E({ name: 'Perpendicular Burning Ship', formula: '(re(z) - i*abs(im(z)))^2 + c', palette: PALETTES.Fire.slice(), maxIter: 500, view: { cx: -0.5, cy: 0, scale: 1.4, rot: 0 } }),
    E({ name: 'Perpendicular Mandelbrot', formula: '(abs(re(z)) - i*im(z))^2 + c', palette: PALETTES.Ocean.slice(), maxIter: 500, view: { cx: -0.5, cy: 0, scale: 1.4, rot: 0 } }),
    E({ name: 'Burning Ship z³', formula: 'abs(z)^3 + conj(c)', palette: PALETTES.Copper.slice(), maxIter: 400, view: { cx: 0, cy: 0, scale: 1.4, rot: 0 } }),
    E({ name: 'Manowar', formula: 'z^2 + zp + c', init: 'c', palette: PALETTES.Neon.slice(), maxIter: 500, view: { cx: -0.2, cy: 0, scale: 0.6, rot: 0 } }),
    E({ name: 'Feather', formula: 'z^3/(1 + re(z)^2 + i*im(z)^2) + c', bailout: 1000, palette: PALETTES.Ice.slice(), interior: '#0a1f44', maxIter: 300, view: { cx: -0.4, cy: 0, scale: 2.2, rot: 0 } }),
    E({ name: 'Mandelbrot z⁴ − z + c', formula: 'z^4 - z + c', palette: PALETTES.Sunset.slice(), maxIter: 400, view: { cx: 0, cy: 0, scale: 1.3, rot: 0 } }),
    E({ name: 'Inverse Julia z² + c/z', formula: 'z^2 + c/z', palette: PALETTES.Midnight.slice(), maxIter: 300, view: { cx: 0, cy: 0, scale: 1.6, rot: 0 } }),
    E({ name: 'Thorn', formula: 're(z)/cos(im(z)) + i*im(z)/sin(re(z)) + c', julia: true, juliaC: [0.102, -0.04], bailout: 1e4, coloring: 'trap-cross', mapping: 'log', density: 2, palette: PALETTES.Fire.slice(), interior: '#050000', maxIter: 200, view: { cx: 0, cy: 0, scale: 3, rot: 0 } }),
    E({ name: 'Collatz', formula: '(2 + 7z - (2 + 5z)*cos(pi*z))/4', init: 'p', bailout: 1e4, palette: PALETTES.Aurora.slice(), maxIter: 120, density: 1.5, view: { cx: 0, cy: 0, scale: 2.6, rot: 0 } }),
    E({ name: 'Exponential Julia', formula: 'c*exp(z)', julia: true, juliaC: [0.38, 0], bailout: 50, palette: PALETTES.Sunset.slice(), maxIter: 200, density: 1.4, view: { cx: 1, cy: 0, scale: 3, rot: 0 } }),
    E({ name: 'Basilica', julia: true, juliaC: [-1, 0], palette: PALETTES.Copper.slice(), maxIter: 500, view: { cx: 0, cy: 0, scale: 1.1, rot: 0 } }),
    E({ name: 'San Marco', julia: true, juliaC: [-0.75, 0], palette: PALETTES.Midnight.slice(), maxIter: 600, view: { cx: 0, cy: 0, scale: 1.1, rot: 0 } }),
    E({ name: 'Hairy Julia', julia: true, juliaC: [0.285, 0.01], palette: PALETTES.Aurora.slice(), maxIter: 800, density: 1.2, view: { cx: 0, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Seahorse Julia', julia: true, juliaC: [-0.835, -0.2321], palette: PALETTES.Ocean.slice(), maxIter: 600, view: { cx: 0, cy: 0, scale: 1.2, rot: 0 } }),
    E({ name: 'Cubic Julia', formula: 'z^3 + c', julia: true, juliaC: [0.4, 0.1], palette: PALETTES.Candy.slice(), interior: '#2a0f3d', maxIter: 400, view: { cx: 0, cy: 0, scale: 1.3, rot: 0 } }),
    E({ name: 'Halley z³ − 1', formula: 'z - 2*(z^3 - 1)*3z^2/(18z^4 - 6z*(z^3 - 1))', init: 'p', escape: false, converge: true, epsilon: 1e-8, coloring: 'angle', shade: 0.6, offset: -1 / 6, palette: PALETTES.Roots.slice(), maxIter: 60, view: { cx: 0, cy: 0, scale: 1.5, rot: 0 } }),
    E({ name: 'Newton z⁵ − 1', formula: 'z - (z^5 - 1)/(5z^4)', init: 'p', escape: false, converge: true, epsilon: 1e-8, coloring: 'angle', shade: 0.6, palette: RB(), maxIter: 100, view: { cx: 0, cy: 0, scale: 1.5, rot: 0 } }),
    E({ name: 'Magnet II', formula: '((z^3 + 3(c - 1)z + (c - 1)(c - 2))/(3z^2 + 3(c - 2)z + (c - 1)(c - 2) + 1))^2', bailout: 100, converge: true, epsilon: 1e-7, palette: PALETTES.Forest.slice(), density: 1.5, maxIter: 300, interior: '#07130b', view: { cx: 1, cy: 0, scale: 2.4, rot: 0 } }),

    // complex functions (domain colouring)
    Fn({ name: 'Zeros & poles' }),
    Fn({ name: 'Roots of unity z⁵ − 1', formula: 'z^5 - 1', view: { cx: 0, cy: 0, scale: 1.6, rot: 0 } }),
    Fn({ name: 'Sine', formula: 'sin(z)', stripeFreq: 6, view: { cx: 0, cy: 0, scale: 4, rot: 0 } }),
    Fn({ name: 'Tangent', formula: 'tan(z)', view: { cx: 0, cy: 0, scale: 3, rot: 0 } }),
    Fn({ name: 'Essential singularity e^(1/z)', formula: 'exp(1/z)', shade: 0.6, view: { cx: 0, cy: 0, scale: 0.6, rot: 0 } }),
    Fn({ name: 'Square root (branch cut)', formula: 'sqrt(z)', stripeFreq: 8, view: { cx: 0, cy: 0, scale: 2, rot: 0 } }),
    Fn({ name: 'Logarithm', formula: 'log(z)', stripeFreq: 12, view: { cx: 0, cy: 0, scale: 2, rot: 0 } }),
    Fn({ name: 'Cayley transform', formula: '(z - i)/(z + i)', stripeFreq: 8, view: { cx: 0, cy: 0, scale: 2.5, rot: 0 } }),
    Fn({ name: 'z to the z', formula: 'pow(z, z)', view: { cx: 0, cy: 0, scale: 3, rot: 0 } }),
    Fn({ name: 'Iterated sine (sin∘sin∘sin)', formula: 'sin(z)', maxIter: 3, view: { cx: 0, cy: 0, scale: 4, rot: 0 } }),
    Fn({ name: 'Julia set by phase (z² − 1, 12 steps)', formula: 'z^2 - 1', maxIter: 12, shade: 0.2, palette: PALETTES.Neon.slice(), view: { cx: 0, cy: 0, scale: 1.6, rot: 0 } }),

    // strange attractors and bifurcation diagrams
    A('clifford', { name: 'Clifford attractor' }),
    A('clifford', { name: 'Clifford — silk', a: 1.7, b: 1.7, c: 0.06, d: 1.2, palette: PALETTES.Sunset.slice(1) }),
    A('dejong', { name: 'De Jong attractor', palette: PALETTES.Fire.slice(1) }),
    A('dejong', { name: 'De Jong — veil', a: -2.24, b: 0.43, c: -0.65, d: -2.43, palette: PALETTES.Aurora.slice(1) }),
    A('svensson', { name: 'Svensson attractor', palette: PALETTES.Neon.slice(1) }),
    A('bedhead', { name: 'Bedhead attractor', palette: PALETTES.Candy.slice() }),
    A('henon', { name: 'Hénon attractor', colorMode: 'palette', palette: ['#05060a', '#5a4fcf', '#c9c3ff', '#ffffff'] }),
    A('ikeda', { name: 'Ikeda attractor', palette: PALETTES.Ice.slice().reverse() }),
    A('tinkerbell', { name: 'Tinkerbell attractor', palette: PALETTES.Copper.slice(1) }),
    A('hopalong', { name: 'Hopalong', colorMode: 'palette', palette: ['#05060a', '#1b998b', '#9dfcaa', '#ffffff'], brightness: 1.8 }),
    A('gumowski', { name: 'Gumowski–Mira', palette: PALETTES.Forest.slice(1) }),
    A('gingerbread', { name: 'Gingerbread man', colorMode: 'palette', palette: ['#1b0e08', '#d98c4a', '#ffd9a8'] }),
    A('popcorn', { name: 'Pickover popcorn', palette: PALETTES.Sunset.slice(1), brightness: 2 }),
    A('lorenz', { name: 'Lorenz butterfly' }),
    A('rossler', { name: 'Rössler attractor', palette: PALETTES.Fire.slice(1) }),
    A('aizawa', { name: 'Aizawa attractor', palette: PALETTES.Neon.slice(1) }),
    A('thomas', { name: 'Thomas attractor', palette: PALETTES.Aurora.slice(1) }),
    A('halvorsen', { name: 'Halvorsen attractor', palette: PALETTES.Candy.slice() }),
    A('chen', { name: 'Chen attractor', palette: PALETTES.Copper.slice(1) }),
    A('logistic', { name: 'Logistic map bifurcation', colorMode: 'palette', palette: ['#05060a', '#206bcb', '#edffff'], brightness: 1.8 }),
    A('logistic', { name: 'Logistic map — period-3 window', a: 3.82, b: 3.86, colorMode: 'palette', palette: ['#05060a', '#7a1c5c', '#f9d56e'], brightness: 1.8 }),
    A('gauss', { name: 'Gauss map bifurcation', colorMode: 'palette', palette: ['#05060a', '#1b998b', '#e0f2e9'], brightness: 1.8 }),
    A('sine', { name: 'Sine map bifurcation', colorMode: 'palette', palette: ['#05060a', '#c7300f', '#ffe98a'], brightness: 1.8 }),

    // more 3D
    B3({ name: 'Quaternion Julia', kind: 'quatjulia', iterations: 11, juliaC: [-0.291, -0.399, 0.339], cW: 0.437, palette: PALETTES.Ice.slice(), camera: { yaw: 30, pitch: 20, dist: 3.2, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    B3({ name: 'Quaternion Julia — coral', kind: 'quatjulia', iterations: 12, juliaC: [-0.2, 0.6, 0.2], cW: 0.2, palette: PALETTES.Sunset.slice(), camera: { yaw: 70, pitch: 10, dist: 3, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    B3({ name: 'Kaleidoscopic Menger', kind: 'kifs', iterations: 6, kScale: 3, kAngle: 0, palette: PALETTES.Copper.slice(), camera: { yaw: 40, pitch: 30, dist: 4.2, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    B3({ name: 'Kaleidoscopic IFS — twisted', kind: 'kifs', iterations: 10, kScale: 2.6, kAngle: 18, palette: PALETTES.Neon.slice(), camera: { yaw: 25, pitch: 20, dist: 4.5, tx: 0, ty: 0, tz: 0, fov: 45 } }),
    B3({ name: 'Kaleidoscopic IFS — crystal', kind: 'kifs', iterations: 12, kScale: 2.2, kAngle: -32, palette: PALETTES.Aurora.slice(), camera: { yaw: 60, pitch: 35, dist: 4.5, tx: 0, ty: 0, tz: 0, fov: 45 } }),

    // flames using the new variations
    I({
      name: 'Spiral Flame', brightness: 2, gamma: 3,
      transforms: [
        T(0.6, -0.3, 0.3, 0.6, 0, 0, 1, '#ff006e', 'spiral'),
        T(0.5, 0, 0, 0.5, 0.5, 0.2, 1, '#8338ec', 'julia'),
        T(0.4, 0.2, -0.2, 0.4, -0.4, -0.3, 1, '#ffbe0b', 'linear'),
      ],
    }),
    I({
      name: 'Diamond Ex Flame', brightness: 2.2, gamma: 3,
      transforms: [
        T(0.7, 0.1, -0.1, 0.7, 0, 0, 1, '#3a86ff', 'ex'),
        T(0.5, -0.4, 0.4, 0.5, 0.3, 0.3, 1, '#4cc9f0', 'diamond'),
        T(0.3, 0, 0, 0.3, -0.5, 0.4, 0.5, '#f72585', 'julia'),
      ],
    }),
  );

  function categoryOf(def) {
    if (def.category) return def.category;
    if (def.type === 'ifs') return 'IFS';
    if (def.type === 'vector') return def.kind === 'rules' ? 'Vector generators' : 'Kuschnig';
    if (def.type === '3d') return '3D';
    if (def.type === 'attractor') return Attr.KINDS[def.kind] && Attr.KINDS[def.kind].group === 'bif' ? 'Bifurcation diagrams' : 'Strange attractors';
    if (def.coloring === 'domain') return 'Complex functions';
    return def.julia ? 'Julia sets' : 'Escape-time';
  }
  const CATEGORY_ORDER = ['Escape-time', 'Julia sets', 'Deep zoom', 'Complex functions', 'Strange attractors', 'Bifurcation diagrams', 'Kuschnig', 'Vector generators', 'IFS', '3D'];

  // ---------- random generators for the Maker ----------
  function randomEscape() {
    const N = 2 + Math.floor(Math.random() * 4);
    const templates = [
      [`z^${N} + c`, 256],
      [`abs(z)^${N} + conj(c)`, 256],
      [`conj(z)^${N} + c`, 256],
      ['z^2 + c + k*zp', 256],
      ['c*sin(z)', 50],
      [`z^${N} - z + c`, 256],
      [`z^${N + 1} + k*z^${N} + c`, 256],
      ['sqr(abs(re(z)) + i*im(z)) + c', 256],
      ['z^2 + c/z', 256],
      ['exp(z^2) + c', 64],
    ];
    const [formula, bailout] = U.pick(templates);
    const julia = Math.random() < 0.55;
    const th = Math.random() * Math.PI * 2;
    const r = U.rand(0.55, 0.8);
    return Object.assign(escapeDefaults(), {
      name: 'Random ' + (julia ? 'Julia' : 'Set'),
      formula,
      bailout,
      julia,
      juliaC: [+(r * Math.cos(th)).toFixed(4), +(r * Math.sin(th)).toFixed(4)],
      k: [+U.rand(-0.6, 0.6).toFixed(3), +U.rand(-0.4, 0.4).toFixed(3)],
      coloring: U.pick(['smooth', 'smooth', 'smooth', 'trap-point', 'trap-cross', 'stripe']),
      mapping: U.pick(['linear', 'sqrt']),
      density: +U.rand(0.5, 2).toFixed(2),
      palette: Math.random() < 0.5 ? randomPalette() : PALETTES[U.pick(Object.keys(PALETTES))].slice(),
      interior: U.pick(['#000000', '#05060a', '#0d0221', '#ffffff']),
      view: { cx: julia ? 0 : -0.3, cy: 0, scale: 1.6, rot: 0 },
    });
  }

  function randomFunction() {
    const N = 2 + Math.floor(Math.random() * 5);
    const r = () => `${U.rand(-1.5, 1.5).toFixed(2)}${Math.random() < 0.5 ? '+' : '-'}${U.rand(0, 1.5).toFixed(2)}i`;
    const formula = U.pick([
      `(z^${N} - 1)/(z^${Math.max(1, N - 2)} + (${r()}))`,
      `(z - (${r()}))*(z - (${r()}))^2/(z - (${r()}))`,
      `sin(z^${Math.min(N, 3)})/(z - (${r()}))`,
      `exp(z) - z^${N}`,
      `z^${N} + (${r()})*z`,
      `log(z^${N} - 1)`,
      `cos(1/(z - (${r()})))`,
    ]);
    return Object.assign(functionDefaults(), {
      name: 'Random function', formula,
      shade: +U.rand(0.2, 0.7).toFixed(2),
      stripeFreq: U.pick([0, 0, 6, 8, 12]),
      palette: Math.random() < 0.6 ? PALETTES.Rainbow.slice() : randomPalette(),
    });
  }

  function randomIFS() {
    const n = 2 + Math.floor(Math.random() * 4);
    const hue = Math.random() * 360;
    const transforms = [];
    for (let i = 0; i < n; i++) {
      const th = U.rand(-Math.PI, Math.PI);
      const s1 = U.rand(0.3, 0.75), s2 = s1 * U.rand(0.7, 1.1) * (Math.random() < 0.25 ? -1 : 1);
      const sh = U.rand(-0.15, 0.15);
      const r3 = (v) => +v.toFixed(3);
      transforms.push({
        a: r3(s1 * Math.cos(th)), b: r3(-s2 * Math.sin(th) + sh), c: r3(s1 * Math.sin(th)), d: r3(s2 * Math.cos(th)),
        e: r3(U.rand(-1, 1)), f: r3(U.rand(-1, 1)),
        weight: r3(Math.max(0.05, Math.abs(s1 * s2))),
        variation: Math.random() < 0.65 ? 'linear' : U.pick(IFS.VARIATIONS.slice(1)),
        color: U.hslToHex(hue + i * U.rand(40, 120), 0.85, 0.6),
      });
    }
    return Object.assign(ifsDefaults(), { name: 'Random IFS', transforms, gamma: U.rand(2, 3.2), brightness: U.rand(1.2, 2) });
  }

  // Deeper zooms need more iterations to resolve detail; L = log2(scale).
  function effIter(def, L, auto = true) {
    const base = Math.max(1, Math.round(def.maxIter || 1));
    return auto && def.coloring !== 'domain' ? base + Math.round(Math.max(0, -L - 8) * 60) : base;
  }

  return { escapeDefaults, functionDefaults, ifsDefaults, normalize, effIter, BUILTINS, categoryOf, CATEGORY_ORDER, randomEscape, randomFunction, randomIFS };
})();

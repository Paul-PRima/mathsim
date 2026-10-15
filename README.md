# Mathsim

A workbench for mathematics. Sections (switch with the rail on the left, or Ctrl+1 … Ctrl+7):

- **Calculator** — scientific calculator with history, degrees/radians, fractions and exact forms (3/4, 3π/4, √2/2),
  variables (`a = 5`), your own functions (`f(x) = x^2 + 1`), equation solving (`2x + 3 = 11`), integrals, sums,
  derivatives and 60+ functions.
- **Graphing** — `y = f(x)`, `x = f(y)`, polar `r = f(θ)`, parametric `(x(t), y(t))`, implicit equations, inequalities
  and points; sliders (with animation), tracing, roots / extrema / intersections, value tables, PNG export.
- **Statistics** — descriptive statistics with histogram and box plot; regression (linear, polynomial, exponential,
  power, logarithmic, logistic) with R² and residuals; distributions (normal, t, χ², F, exponential, uniform,
  binomial, Poisson, geometric); t-tests and a proportion z-test.
- **Matrices** — arithmetic, determinant, inverse, transpose, rank, trace, RREF, powers, eigenvalues and
  eigenvectors, solving A·x = B; entries can be expressions and results can show as fractions.
- **Algebra & tools** — equation solver, polynomial roots (complex too), symbolic derivatives with tangent line and
  integrals, triangle solver, number facts (primality, factorization of big numbers, divisors, φ, σ), GCD/LCM with
  Bézout, sequences & series, base converter, unit converter.
- **Fractals** — escape-time fractals with unlimited deep zoom, complex functions (domain colouring), strange
  attractors and bifurcation diagrams, IFS flames, vector fractals, ray-marched 3D fractals, zoom videos.

Everything you type is saved between sessions. (Formerly *Fractalsim*; the saved fractal library carries over.)

## Run

- **Desktop app:** `dist/Mathsim-win32-x64/Mathsim.exe`
- **Browser:** open `index.html` directly (Chrome or Edge)

## Rebuild the desktop app

Requires [Node.js](https://nodejs.org).

```
npm install
npm start          # run from source
npm run package    # build dist/Mathsim-win32-x64/
```

## How deep zoom works

- Above ~1000× zoom the GPU iterates in plain 32-bit floats.
- Below that, a single high-precision reference orbit is computed on the CPU (BigInt, in a worker) and each
  pixel only iterates its tiny difference from that orbit on the GPU (perturbation theory, with rescaling and
  rebasing). View coordinates are stored as arbitrary-precision decimals, so zoom depth has no fixed limit;
  deeper just needs more iterations and a slightly longer reference computation.
- Deep zoom works for formulas built from `+ − × ÷`, whole-number powers, `conj`, `abs`, `re`, `im`
  (Mandelbrot, Multibrots, Burning Ship, Tricorn, Celtic, Lambda, their Julia sets and your own
  combinations). Formulas using `sin`, `exp`, `zp`, convergence stopping, etc. still render but pixelate past ~10⁴×.

## Rendering pipeline

The main view renders into a buffer 12% larger than the window on each side, in tiles, centre first, within a
per-frame time budget so the UI never freezes. Panning shifts the already-rendered pixels and only renders the
newly exposed strips; zooming shows the previous image stretched until the new tiles arrive.

| File | Purpose |
| --- | --- |
| `js/shell.js` | Navigation rail, home page, switching sections |
| `js/mathexpr.js` | Real-number expression engine (parser → JS), special functions, distributions, numeric calculus |
| `js/calc.js`, `js/graph.js`, `js/stats.js`, `js/matrix.js`, `js/tools.js` | The math sections |
| `js/charts.js` | Small canvas chart helpers |
| `js/symbolic.js` | Symbolic differentiation and simplification (tools page) |
| `electron/main.js` | Desktop window |
| `js/formula.js` | Fractal formula parser → GLSL |
| `js/hp.js` | Arbitrary-precision view coordinates |
| `js/deep.js` | Perturbation code generator + reference orbit |
| `js/escape.js` | WebGL renderers and the progressive tiled viewer |
| `js/ifs.js` | IFS / chaos-game renderer (also accumulates attractor points) |
| `js/attractor.js` | Strange attractors, chaotic flows and bifurcation diagrams |
| `js/vector.js` | Vector fractals: Kuschnig + custom generators, drawn as true arcs, SVG export |
| `js/fractal3d.js` | Ray-marched 3D fractals (Mandelbulb, Mandelbox, Menger, Sierpinski, quaternion Julia, kaleidoscopic IFS) |
| `js/explore.js` | “Find an interesting spot” (CPU sampling, with perturbation at deep zoom) |
| `js/video.js` | Zoom video export (WebCodecs + built-in MP4 muxer) |
| `js/videoworker.js` | Renders zoom videos in the background on an OffscreenCanvas |
| `js/presets.js` | Built-in library |

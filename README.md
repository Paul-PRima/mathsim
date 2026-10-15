# Mathsim

A workbench for mathematics. Sections (switch with the rail on the left; Ctrl+1 … Ctrl+9 open the first nine):

- **Calculator** — scientific calculator with history, degrees/radians, variables (`a = 5`), your own functions
  (`f(x) = x^2 + 1`), equation solving (`2x + 3 = 11`, complex roots when there are no real ones), integrals, sums,
  derivatives and 60+ functions. **Exact arithmetic** (`30!`, `2^200`, `1/3 + 1/6 = 1/2`), **complex numbers**
  (`sqrt(-4)`, `(2 + 3i)(1 − i)`, `e^(iπ)`) and **units** (`5 km/h in m/s`, `3 ft + 20 cm`, `100 °F in °C`).
- **Graphing** — `y = f(x)`, `x = f(y)`, polar, parametric, implicit equations, inequalities and points; sliders,
  tracing, roots / extrema / intersections, value tables; **slope fields** for `y' = f(x, y)` with click-to-draw
  solutions; **areas** (`between(f, g)`, `int(f, x, a, b)`); PNG and **SVG export**; **share links**; **undo/redo**.
- **3D graphs** — surfaces `z = f(x, y)` and parametric surfaces, colour by height, contour lines, rotate and zoom.
- **Geometry** — GeoGebra-style constructions: points (also on lines and circles), segments, lines, rays, circles,
  midpoints, perpendiculars, parallels, perpendicular bisectors, intersections, angles and polygons; drag points
  and everything follows; lengths, angles and areas measured live; undo/redo.
- **Statistics** — descriptive statistics with histogram and box plot; regression (six models) with R² and
  residuals; nine probability distributions; t-tests and a proportion z-test.
- **Probability lab** — dice sums, coin flips, a Galton board and Monte Carlo π, live next to the theory.
- **Matrices** — arithmetic, determinant, inverse, rank, RREF, eigenvalues and eigenvectors, linear systems.
- **Algebra & tools** — equation and polynomial solvers, symbolic derivatives, integrals, triangle solver, number
  theory, GCD/LCM, sequences, base and unit converters.
- **Practice** — endless generated exercises on 10 topics (English or German) with answer checking, scores and
  worked solutions.
- **Simulations** — Game of Life (six rules), 1D cellular automata, L-systems, Gray–Scott reaction–diffusion and
  the Ulam prime spiral.
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
npm test           # run the automated tests (tests/*.test.js)
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
| `js/calcx.js` | Exact (BigInt), complex and unit-aware evaluation for the calculator |
| `js/surface.js`, `js/geometry.js`, `js/probability.js`, `js/practice.js`, `js/simulations.js` | 3D graphs, geometry, probability lab, practice, simulations |
| `tests/` | Automated tests (`npm test`) |
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

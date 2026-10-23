# Mathsim

A workbench for mathematics. Sections (switch with the rail on the left; Ctrl+1 … Ctrl+9 open the first nine):

- **Calculator** — scientific calculator with history, degrees/radians, variables (`a = 5`), your own functions
  (`f(x) = x^2 + 1`), equation solving (`2x + 3 = 11`, complex roots when there are no real ones), integrals, sums,
  derivatives and 60+ functions. **Exact arithmetic** (`30!`, `2^200`, `1/3 + 1/6 = 1/2`), **complex numbers**
  (`sqrt(-4)`, `(2 + 3i)(1 − i)`, `e^(iπ)`), **units** (`5 km/h in m/s`, `100 °F in °C`), **algebra**
  (`expand`, `factor`, `simplify`, `derive`, `integrate`) and **vectors / matrices** (`[1, 2, 3] cross [4, 5, 6]`,
  `det(M)`, `inv(M)`, `eig(M)`). 📈 sends a function straight to Graphing.
- **Graphing** — `y = f(x)`, `x = f(y)`, polar, parametric, implicit equations, inequalities and points; sliders,
  tracing, roots / extrema / intersections, value tables; **slope fields**; **areas**; **data tables with fitted
  curves** (linear … power, with R²); Fourier series examples; PNG / SVG export, **print / PDF with notes**;
  share links; undo/redo; **🎬 animated clips** that move a slider and save the graph as an MP4 video.
- **3D graphs** — surfaces `z = f(x, y)` and parametric surfaces, colour by height, contour lines, rotate and zoom;
  **🎬 turntable clips** (MP4).
- **Geometry** — constructions with points, lines, circles, perpendiculars, bisectors, intersections, angles and
  polygons; **reflect, rotate, translate, enlarge**; **loci and traces**; drag and everything follows; send the
  construction to Graphing as equations.
- **Statistics** — descriptive statistics, regression (six models), nine distributions, t-tests, z-test,
  **χ² goodness-of-fit and independence tests, one-way ANOVA**, a **confidence-interval demo**, and
  **CSV / Excel (.xlsx) import**.
- **Probability lab** — dice, coins, Galton board, Monte Carlo π, **Monty Hall** (simulate or play), the
  **birthday paradox**, **random walks** (1D / 2D) and **Markov chains** (editable matrix, stationary distribution).
- **Matrices** — arithmetic, determinant, inverse, rank, RREF, eigenvalues and eigenvectors, linear systems.
- **Algebra & tools** — equation and polynomial solvers, symbolic derivatives, integrals, triangle solver, number
  theory, GCD/LCM, sequences, base and unit converters.
- **Practice** — endless generated exercises on 15 topics (incl. trigonometry, logarithms, integrals, vectors and
  word problems) in English or German, with worked solutions, a progress chart, **review of weak topics** and
  **printable worksheets with answer keys** (PDF).
- **Simulations** (23) — patterns (Game of Life, 1D automata, L-systems, reaction–diffusion, Ulam spiral, **flocking
  birds, Langton's ant, sandpile avalanches, crystal growth by diffusion**), physics (pendulums, projectile, Kepler
  orbits, **n-body gravity with the figure-eight and Lagrange points, a ripple tank with double-slit interference, an
  ideal gas with Maxwell–Boltzmann speeds and Brownian motion**, Fourier epicycles), models (**SIR epidemic,
  predator & prey, the logistic map with cobweb and bifurcation diagram**) and algorithms (sorting — **animated step by step, or billions of values at full speed in the background, with a measured
  cost estimate when they don’t fit in memory** —, path finding,
  **travelling salesman with 2-opt / simulated annealing, convex hull**). **ⓘ Explain** opens a panel for each one
  (what you see, how it works, what to look for, things to try, where it shows up). **🎬 Clip** records any simulation
  or probability experiment as an MP4 video, counters included — a sorting run, Game of Life, a Galton board, … —
  rendered frame by frame like the fractal zoom videos, so it plays at the right speed; sorting, path finding, crystal
  growth and convex hulls can end the clip by themselves when they finish.
- **π viewer** — up to 100 000 digits of π, computed in the app, shown as digits, **base-26 letters**, pixels, RGB
  pixels, the **π walk**, a **circle of chords** and digit frequencies; **find your birthday or a word in π**; Run streams
  the digits in, 🎬 Clip records it, ⓘ Explain tells you what you are looking at.
- **Fractals** — escape-time fractals with unlimited deep zoom, complex functions (domain colouring), strange
  attractors and bifurcation diagrams, IFS flames, vector fractals, ray-marched 3D fractals, zoom videos.

**Ctrl+K** opens a command palette: jump to any section, tool, example or fractal preset, or type a calculation.
**Settings** (bottom of the rail): German or English interface, dark / light / system theme, text size.

Everything you type is saved between sessions. (Formerly *Fractalsim*; the saved fractal library carries over.)

## Run

- **Install:** run `dist/installer/Mathsim-Setup-5.0.0.exe` — installs for the current user (no admin rights), with a
  Start-menu entry, a desktop shortcut and an uninstaller (Settings › Apps). Your saved data is kept on uninstall.
- **Without installing:** `dist/Mathsim-win32-x64/Mathsim.exe`
- **Browser:** open `index.html` directly (Chrome or Edge)

## Rebuild the desktop app

Requires [Node.js](https://nodejs.org).

```
npm install
npm start          # run from source
npm run package    # build dist/Mathsim-win32-x64/
npm run installer  # package, then build dist/installer/Mathsim-Setup-<version>.exe (settings: package.json › build)
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
| `js/shell.js` | Navigation rail, home page, settings, command palette, theme, PDF printing |
| `js/i18n.js`, `js/i18n-de.js` | Interface language: translates the page from a German dictionary (with patterns for text containing numbers) |
| `js/algebra.js` | Exact polynomial algebra (expand / factor / simplify) and vectors / matrices for the calculator |
| `js/datafile.js` | CSV and .xlsx reading for Statistics |
| `js/fractal/*.js` | The fractal explorer UI (state, rendering, interaction, export, library, side panel, start-up) |
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

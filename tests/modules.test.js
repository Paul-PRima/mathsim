// Geometry, probability, practice generator and simulations.
module.exports = (t) => {
  const { Geo, ProbLab, Practice, Sims } = t.ctx;

  // ---- geometry
  const objs = [
    { id: 1, type: 'point', x: -3, y: -2 }, { id: 2, type: 'point', x: 4, y: -1.5 }, { id: 3, type: 'point', x: 0.5, y: 3.5 },
    { id: 4, type: 'bisector', a: 1, b: 2 }, { id: 5, type: 'bisector', a: 2, b: 3 },
    { id: 6, type: 'intersection', a: 4, b: 5, which: 0 }, { id: 7, type: 'circle', c: 6, p: 1 },
    { id: 8, type: 'angle', a: 2, b: 1, c: 3 }, { id: 9, type: 'angle', a: 3, b: 2, c: 1 }, { id: 10, type: 'angle', a: 1, b: 3, c: 2 },
    { id: 11, type: 'polygon', pts: [1, 2, 3] },
    { id: 12, type: 'circleR', c: 1, r: 1 }, { id: 13, type: 'segment', a: 1, b: 2 }, { id: 14, type: 'intersection', a: 12, b: 13, which: 1 }, { id: 15, type: 'intersection', a: 12, b: 13, which: 0 },
  ];
  const G = Geo.solve(objs);
  const M = G.get(6).pt;
  t.near('circumcentre equidistant (A, B)', Geo.dist(M, G.get(1).pt), Geo.dist(M, G.get(2).pt), 1e-9);
  t.near('circumcentre equidistant (A, C)', Geo.dist(M, G.get(1).pt), Geo.dist(M, G.get(3).pt), 1e-9);
  t.near('angle sum is 180°', G.get(8).deg + G.get(9).deg + G.get(10).deg, 180, 1e-9);
  t.near('triangle area (shoelace)', G.get(11).area, 0.5 * Math.abs((4 + 3) * (3.5 + 2) - (0.5 + 3) * (-1.5 + 2)), 1e-9);
  t.near('segment ∩ unit circle around A lies on the segment', Geo.dist(G.get(14).pt, G.get(1).pt), 1, 1e-9);
  t.eq('the other intersection is off the segment', G.get(15), null);
  { // a point on a circle keeps the Thales angle at exactly 90° wherever it is
    const th = [{ id: 1, type: 'point', x: -4, y: 0 }, { id: 2, type: 'point', x: 4, y: 0 }, { id: 3, type: 'midpoint', a: 1, b: 2 },
      { id: 4, type: 'circle', c: 3, p: 2 }, { id: 5, type: 'onObj', on: 4, t: 0.3 }, { id: 6, type: 'angle', a: 1, b: 5, c: 2 }];
    for (const tt of [0.3, 1.2, 2.5, 4]) { th[4].t = tt; t.near('Thales with point on circle, t = ' + tt, Geo.solve(th).get(6).deg, 90, 1e-9); }
  }
  t.eq('parallel lines do not meet', Geo.intersect({ p: { x: 0, y: 0 }, d: { x: 1, y: 1 }, kind: 'line' }, { p: { x: 0, y: 1 }, d: { x: 2, y: 2 }, kind: 'line' }).length, 0);
  t.eq('two circles meet twice', Geo.intersect({ c: { x: 0, y: 0 }, r: 2 }, { c: { x: 3, y: 0 }, r: 2 }).length, 2);
  t.eq('separate circles do not meet', Geo.intersect({ c: { x: 0, y: 0 }, r: 1 }, { c: { x: 5, y: 0 }, r: 1 }).length, 0);
  t.near("Thales: angle in a semicircle", Geo.angleAt({ x: -4, y: 0 }, { x: 4 * Math.cos(1), y: 4 * Math.sin(1) }, { x: 4, y: 0 }), 90, 1e-9);

  // ---- probability
  const two = ProbLab.diceSum(2, 6);
  t.near('2d6: P(7) = 1/6', two[5], 1 / 6, 1e-12);
  t.near('2d6 sums to 1', two.reduce((a, b) => a + b, 0), 1, 1e-12);
  t.near('3d6: P(10) = 27/216', ProbLab.diceSum(3, 6)[7], 27 / 216, 1e-12);
  t.near('birthday paradox: 23 people', ProbLab.birthday(23), 0.5072972, 1e-6);
  t.near('birthday paradox: 1 person', ProbLab.birthday(1), 0, 1e-12);
  const pi = ProbLab.stationary([[0.7, 0.2, 0.1], [0.3, 0.4, 0.3], [0.2, 0.4, 0.4]]);
  t.near('stationary distribution is invariant', pi.reduce((s, p, i) => s + p * [0.7, 0.3, 0.2][i], 0), pi[0], 1e-9);
  t.near('stationary distribution of a periodic cycle', ProbLab.stationary([[0, 1, 0], [0, 0, 1], [1, 0, 0]])[1], 1 / 3, 1e-9);

  // ---- simulations
  const rule = Sims.parseRule('B3/S23');
  const w = 6, h = 6, blinker = new Uint8Array(w * h);
  [[1, 2], [2, 2], [3, 2]].forEach(([x, y]) => (blinker[y * w + x] = 1));
  const g1 = Sims.lifeStep(blinker, w, h, rule), g2 = Sims.lifeStep(g1, w, h, rule);
  t.eq('blinker turns vertical', [g1[1 * w + 2], g1[2 * w + 2], g1[3 * w + 2], g1[2 * w + 1]], [1, 1, 1, 0]);
  t.eq('blinker has period 2', [...g2], [...blinker]);
  t.eq('rule 90 from one cell', [...Sims.rowStep(Uint8Array.from([0, 0, 1, 0, 0]), 90)], [0, 1, 0, 1, 0]);
  t.eq('Koch L-system length', Sims.expand('F', { F: 'F+F--F+F' }, 3).s.split('F').length - 1, 64);
  t.eq('sieve', [...Sims.sieve(20)].map((v, i) => (v ? i : 0)).filter(Boolean), [2, 3, 5, 7, 11, 13, 17, 19]);
  const seen = new Set();
  let adjacent = true;
  for (let n = 1; n <= 2500; n++) {
    const [x, y] = Sims.ulamXY(n);
    seen.add(x + ',' + y);
    if (n > 1) { const [px, py] = Sims.ulamXY(n - 1); if (Math.abs(px - x) + Math.abs(py - y) !== 1) adjacent = false; }
  }
  t.eq('Ulam spiral: every number has its own cell', seen.size, 2500);
  t.ok('Ulam spiral: consecutive numbers are neighbours', adjacent);

  // ---- practice: every generated exercise accepts its own answer and rejects a wrong one
  let tried = 0, accepted = 0, rejected = 0;
  const bad = [];
  for (const topic of Object.keys(Practice.TOPICS)) for (const level of [0, 1, 2]) for (const lang of ['en', 'de']) for (let k = 0; k < 25; k++) {
    const ex = Practice.generate(topic, level, lang);
    tried++;
    const r = ex.check(ex.show);
    if (r.ok) accepted++; else if (bad.length < 5) bad.push(`${topic}/${level}/${lang}: "${ex.show}" for ${ex.math || ex.q}`);
    const wrong = ex.check('12345.678');
    if (!wrong.ok) rejected++;
    if (!ex.steps.length) bad.push(`${topic}: no solution steps`);
  }
  t.eq('practice: correct answers accepted', accepted, tried);
  t.eq('practice: wrong answers rejected', rejected, tried);
  if (bad.length) console.log('    e.g. ' + bad.join('\n    e.g. '));
  t.eq('practice: German decimal comma', Practice.readNumbers('0,75'), [0.75]);
  t.eq('practice: units are ignored', Practice.readNumbers('603.19 cm³'), [603.19]);
  t.eq('practice: several answers', Practice.readNumbers('x = -2 oder x = 3'), [-2, 3]);

  // ---- physics, Fourier, sorting and path finding
  t.near('pendulum period, small angle', Sims.pendulumPeriod(9.81, 1, 1e-6), 2 * Math.PI * Math.sqrt(1 / 9.81), 1e-9);
  t.near('pendulum period at 90° (factor 1.18034)', Sims.pendulumPeriod(9.81, 1, Math.PI / 2) / (2 * Math.PI * Math.sqrt(1 / 9.81)), 1.1803406, 1e-6);
  {
    let y = [1, 0];
    const f = Sims.pendulum({ g: 9.81, L: 1 }), T = Sims.pendulumPeriod(9.81, 1, 1), h = T / 2000;
    for (let i = 0; i < 2000; i++) y = Sims.rk4(f, y, h);
    t.near('RK4 pendulum returns after one exact period', y[0], 1, 1e-6);
    const p = { g: 9.81, L1: 1, L2: 1, m1: 1, m2: 1 };
    let d = [2, 2.5, 0, 0];
    const E0 = Sims.doubleEnergy(p, d), fd = Sims.doublePendulum(p);
    for (let i = 0; i < 5000; i++) d = Sims.rk4(fd, d, 1e-3);
    t.near('double pendulum conserves energy', Sims.doubleEnergy(p, d), E0, 1e-4);
    let s = [0, 0, 20 * Math.cos(Math.PI / 6), 20 * Math.sin(Math.PI / 6)];
    const fp = Sims.projectile({ g: 9.81 });
    for (let i = 0; i < 1000; i++) s = Sims.rk4(fp, s, (2 * 10) / 9.81 / 1000);
    t.near('projectile lands at v²·sin2α/g', s[0], (400 * Math.sin(Math.PI / 3)) / 9.81, 1e-9);
    const o = Sims.orbitElements(1, [1, 0], [0, 1]);
    t.near('circular orbit: e = 0', o.e, 0, 1e-12);
    t.near('circular orbit: T = 2π', o.T, 2 * Math.PI, 1e-12);
    t.ok('escape at √2', Sims.orbitElements(1, [1, 0], [0, Math.SQRT2 + 1e-9]).E >= 0);
  }
  {
    const pts = Array.from({ length: 64 }, (_, i) => [Math.cos((2 * Math.PI * i) / 64) * 2 + 0.3, Math.sin((2 * Math.PI * i) / 64) * 2]);
    const terms = Sims.dft(pts);
    t.near('DFT of a circle: one big term of radius 2', terms[0].amp, 2, 1e-9);
    t.eq('… turning once per round', terms[0].f, 1);
    const q = Sims.epicycleAt(terms, 5 / 64);
    t.near('epicycles reproduce the points', Math.hypot(q[0] - pts[5][0], q[1] - pts[5][1]), 0, 1e-9);
    const sq = Sims.resample([[0, 0], [1, 0], [1, 1], [0, 1]], 8);
    t.near('resample: equal spacing', Math.hypot(sq[3][0] - sq[2][0], sq[3][1] - sq[2][1]), 0.5, 1e-12);
  }
  for (const [name, gen] of Object.entries(Sims.SORTS)) {
    const a = Array.from({ length: 97 }, (_, i) => (i * 37) % 97), b = a.slice();
    let ops = 0;
    for (const _ of gen(a)) ops++;
    t.eq(`${name} sort sorts`, a.join(), b.sort((x, y) => x - y).join());
    t.ok(`${name} sort yields steps`, ops > 0);
    const c = [3, 1, 2, 3, 1, 1, 2];
    for (const _ of gen(c)) { /* run */ }
    t.eq(`${name} sort with duplicates`, c.join(), '1,1,1,2,2,3,3');
  }
  {
    const W = 7, H = 5, grid = new Uint8Array(W * H);
    for (let y = 0; y < 4; y++) grid[y * W + 3] = 1; // wall with a gap at the bottom
    grid[4 * W + 1] = 2; // mud
    const run = (algo) => { let s; for (s of Sims.gridSearch(grid, W, H, 0, 6, algo)); return s; };
    const dj = run('dijkstra'), as = run('astar'), bf = run('bfs');
    t.eq('Dijkstra: cheapest path cost', dj.cost, 14);
    t.eq('A* finds the same cost', as.cost, 14);
    t.ok('A* explores no more than Dijkstra', as.expanded <= dj.expanded);
    t.eq('BFS: fewest steps', bf.path.length - 1, 14);
    const blocked = grid.slice(); blocked[4 * W + 3] = 1;
    let s; for (s of Sims.gridSearch(blocked, W, H, 0, 6, 'astar'));
    t.eq('no path when walled off', s.path.length, 0);
    const m = Sims.maze(21, 15, (() => { let x = 1; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })());
    let ms; for (ms of Sims.gridSearch(m, 21, 15, 22, 21 * 13 + 19, 'bfs'));
    t.ok('maze: corners connected', ms.path.length > 0);
  }
};

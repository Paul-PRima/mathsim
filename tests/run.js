// Automated tests for Mathsim's math code (no browser needed).
// Run:  node tests/run.js        (or, without Node installed:  set ELECTRON_RUN_AS_NODE=1 and run electron.exe tests/run.js)
// Each file in tests/ named *.test.js exports a function (t) => { … } using t.eq / t.near / t.ok / t.throws.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// Browser-only bits the math modules touch when they load: a stub shell and document.
const ctx = vm.createContext({
  console, Math, setTimeout, clearTimeout, performance: { now: () => Date.now() },
  Shell: { register() {}, isActive: () => false },
  C: {},
  document: { getElementById: () => null, createElement: () => ({ getContext: () => null }) },
  window: {},
});
const MODULES = ['util.js', 'mathexpr.js', 'calcx.js', 'symbolic.js', 'matrix.js', 'charts.js'];
for (const f of MODULES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
for (const name of ['U', 'MX', 'CalcX', 'Sym', 'LinAlg', 'Charts']) ctx[name] = vm.runInContext(name, ctx);
// Optional modules (they register themselves on load and expose testable parts on window).
for (const f of ['practice.js', 'simulations.js', 'probability.js', 'geometry.js', 'surface.js']) {
  const p = path.join(ROOT, 'js', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
for (const name of ['Geo', 'ProbLab', 'Practice', 'Sims']) { try { ctx[name] = vm.runInContext(name, ctx); } catch { /* module not present */ } }

let passed = 0, failed = 0;
const fail = (name, msg) => { failed++; console.log(`  ✗ ${name}: ${msg}`); };
const t = {
  ctx,
  eq(name, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) passed++; else fail(name, `got ${a}, expected ${e}`);
  },
  near(name, actual, expected, tol = 1e-9) {
    const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
    if (ok) passed++; else fail(name, `got ${actual}, expected ${expected}`);
  },
  ok(name, cond, msg = 'condition is false') { if (cond) passed++; else fail(name, msg); },
  throws(name, fn) { try { fn(); fail(name, 'did not throw'); } catch { passed++; } },
};

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
for (const f of files) {
  console.log(f);
  try { require(path.join(__dirname, f))(t); } catch (e) { fail(f, 'crashed: ' + (e && e.stack || e)); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

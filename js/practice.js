// Practice mode: generated exercises with answer checking and worked solutions (English / German).
// Each generator returns { q (question text), math (optional formula line), answer, check(input) → result,
// steps: [{ text, math }], show (answer as text) }.
const Practice = (() => {
  let lang = 'en';
  const T = (en, de) => (lang === 'de' ? de : en);
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const nz = (a, b) => { let v; do v = ri(a, b); while (v === 0); return v; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const dec = (s) => (lang === 'de' ? String(s).replace(/(\d)\.(\d)/g, '$1,$2') : String(s));
  const fm = (v) => dec(MX.fmt(+(+v).toPrecision(10)));
  const frac = (n, d) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); n /= g; d /= g; return d === 1 ? String(n) : `${n}/${d}`; };
  const S = (text, math) => ({ text, math });
  const sgn = (v) => (v < 0 ? `− ${Math.abs(v)}` : `+ ${v}`);
  const lin = (a, b, v = 'x') => `${a === 1 ? '' : a === -1 ? '−' : a}${v} ${b === 0 ? '' : sgn(b)}`.trim();

  // ---------------------------------------------------------------- reading answers
  // numbers from the user's text: "3/4", "0,75", "-2 and 5", "x = 3; y = -1", "25 %"
  function readNumbers(text) {
    const parts = String(text).replace(/(\d),(\d)/g, '$1.$2').split(/\s*(?:;|,|\bor\b|\boder\b|\band\b|\bund\b|\n)\s*/i).map((s) => s.replace(/^\s*[a-z]\s*[=:]\s*/i, '').replace(/\s*(%|€|\$|°|(?:mm|cm|dm|km|m)(?:²|³|\^?[23])?|km\/h|m\/s|kg|g|ml|l|h|min|s|euros?|cent)\s*$/i, '').trim()).filter(Boolean);
    return parts.map((p) => { try { MX.M.af = 1; return MX.evaluate(p); } catch { return NaN; } });
  }
  const close = (a, b, tol) => Math.abs(a - b) <= (tol != null ? tol : 1e-6 * Math.max(1, Math.abs(b)));
  // one number expected
  const checkNum = (expected, tol) => (input) => {
    const v = readNumbers(input);
    if (v.length !== 1 || !isFinite(v[0])) return { ok: false, msg: T('Enter one number (fractions like 3/4 are fine).', 'Gib eine Zahl ein (Brüche wie 3/4 sind erlaubt).') };
    return { ok: close(v[0], expected, tol) };
  };
  // a set of numbers in any order
  const checkSet = (expected, tol) => (input) => {
    const v = readNumbers(input).filter(isFinite).sort((a, b) => a - b);
    const e = expected.slice().sort((a, b) => a - b);
    if (v.length !== e.length) return { ok: false, msg: T(`Give ${e.length} value${e.length > 1 ? 's' : ''}, separated by commas.`, `Gib ${e.length} Wert${e.length > 1 ? 'e' : ''} an, durch Kommas getrennt.`) };
    return { ok: v.every((x, i) => close(x, e[i], tol)) };
  };
  // an expression in x that must equal f at several points
  const checkFn = (f) => (input) => {
    let g;
    try {
      const src = String(input).replace(/^\s*(?:f'\(x\)|f′\(x\)|y'|y′)\s*=\s*/i, '');
      MX.M.af = 1;
      const c = MX.compile(MX.parse(src), ['x'], {});
      if (c.free.size) return { ok: false, msg: T(`Unknown: ${[...c.free].join(', ')}`, `Unbekannt: ${[...c.free].join(', ')}`) };
      g = c.fn;
    } catch (e) { return { ok: false, msg: e.message }; }
    const xs = [-1.7, -0.6, 0.3, 1.1, 2.4];
    return { ok: xs.every((x) => close(g(x), f(x), 1e-6 * Math.max(1, Math.abs(f(x))))) };
  };

  // ---------------------------------------------------------------- generators
  const G = {};
  G.arith = (lv) => {
    const forms = [
      () => { const a = ri(2, 9), b = ri(2, 9), c = ri(2, 9); return [`${a} + ${b} · ${c}`, [[`${b} · ${c} = ${b * c}`, T('Multiplication before addition.', 'Punkt vor Strich: zuerst multiplizieren.')], [`${a} + ${b * c} = ${a + b * c}`, T('Then add.', 'Dann addieren.')]], a + b * c]; },
      () => { const a = ri(2, 9), b = ri(2, 9), c = ri(2, 9); return [`(${a} + ${b}) · ${c}`, [[`${a} + ${b} = ${a + b}`, T('Brackets first.', 'Zuerst die Klammer.')], [`${a + b} · ${c} = ${(a + b) * c}`, T('Then multiply.', 'Dann multiplizieren.')]], (a + b) * c]; },
      () => { const a = ri(2, 6), b = ri(2, 5), c = ri(1, 9); return [`${a}² − ${b} · ${c}`, [[`${a}² = ${a * a}`, T('Powers first.', 'Zuerst die Potenz.')], [`${b} · ${c} = ${b * c}`, T('Then multiplication.', 'Dann die Multiplikation.')], [`${a * a} − ${b * c} = ${a * a - b * c}`, T('Finally subtract.', 'Zum Schluss subtrahieren.')]], a * a - b * c]; },
      () => { const c = ri(2, 6), q = ri(2, 9), a = ri(1, 20); return [`${a} + ${c * q} : ${c} − ${ri(0, 0) + q}`, [[`${c * q} : ${c} = ${q}`, T('Division before addition and subtraction.', 'Punkt vor Strich: zuerst dividieren.')], [`${a} + ${q} − ${q} = ${a}`, T('Then left to right.', 'Dann von links nach rechts.')]], a]; },
      () => { const a = ri(2, 9), b = ri(2, 9), c = ri(2, 5), d = ri(1, 9); return [`${a} · (${b} − ${c})² + ${d}`, [[`${b} − ${c} = ${b - c}`, T('Brackets first.', 'Zuerst die Klammer.')], [`(${b - c})² = ${(b - c) ** 2}`, T('Then the power.', 'Dann die Potenz.')], [`${a} · ${(b - c) ** 2} + ${d} = ${a * (b - c) ** 2 + d}`, T('Multiply, then add.', 'Multiplizieren, dann addieren.')]], a * (b - c) ** 2 + d]; },
    ];
    const f = forms[Math.min(forms.length - 1, lv === 0 ? ri(0, 1) : lv === 1 ? ri(0, 3) : ri(2, 4))]();
    return { q: T('Calculate:', 'Berechne:'), math: f[0], check: checkNum(f[2]), show: fm(f[2]), steps: f[1].map(([m, t]) => S(t, m)) };
  };
  G.fractions = (lv) => {
    const op = pick(lv === 0 ? ['+', '−'] : ['+', '−', '·', ':']);
    const max = [6, 10, 15][lv];
    let a = ri(1, max), b = ri(2, max), c = ri(1, max), d = ri(2, max);
    if (a % b === 0) a++;
    const steps = [];
    let n, m;
    if (op === '+' || op === '−') {
      const l = (b * d) / gcd(b, d);
      steps.push(S(T(`Common denominator: lcm(${b}, ${d}) = ${l}.`, `Hauptnenner: kgV(${b}, ${d}) = ${l}.`)));
      steps.push(S(T('Expand both fractions.', 'Beide Brüche erweitern.'), `${a}/${b} = ${a * (l / b)}/${l},   ${c}/${d} = ${c * (l / d)}/${l}`));
      n = op === '+' ? a * (l / b) + c * (l / d) : a * (l / b) - c * (l / d); m = l;
      steps.push(S(T(`${op === '+' ? 'Add' : 'Subtract'} the numerators.`, `Zähler ${op === '+' ? 'addieren' : 'subtrahieren'}.`), `${a * (l / b)}/${l} ${op} ${c * (l / d)}/${l} = ${n}/${l}`));
    } else if (op === '·') {
      n = a * c; m = b * d;
      steps.push(S(T('Numerator times numerator, denominator times denominator.', 'Zähler mal Zähler, Nenner mal Nenner.'), `${a}/${b} · ${c}/${d} = ${n}/${m}`));
    } else {
      n = a * d; m = b * c;
      steps.push(S(T('Multiply by the reciprocal of the second fraction.', 'Mit dem Kehrwert des zweiten Bruchs multiplizieren.'), `${a}/${b} : ${c}/${d} = ${a}/${b} · ${d}/${c} = ${n}/${m}`));
    }
    const g = gcd(n, m);
    if (g > 1) steps.push(S(T(`Simplify by ${g}.`, `Mit ${g} kürzen.`), `${n}/${m} = ${frac(n, m)}`));
    const val = n / m;
    return {
      q: T('Calculate and simplify:', 'Berechne und kürze:'), math: `${a}/${b} ${op} ${c}/${d}`, show: frac(n, m), steps,
      check: (input) => {
        const r = checkNum(val)(input);
        if (r.ok && /\//.test(input)) { const [p, q] = input.split('/').map((s) => parseInt(s, 10)); if (gcd(p, q) > 1) return { ok: true, msg: T('Correct — but it can still be simplified.', 'Richtig — aber du kannst noch kürzen.') }; }
        return r;
      },
    };
  };
  G.percent = (lv) => {
    const kind = ri(0, lv === 0 ? 1 : 3);
    const p = pick([5, 10, 12, 15, 20, 25, 30, 40, 50, 75]), G0 = pick([40, 60, 80, 120, 150, 200, 240, 360, 480, 500, 800, 1200]);
    const W = (G0 * p) / 100;
    if (kind === 0) return { q: T(`What is ${p}% of ${G0}?`, `Wie viel sind ${p} % von ${G0}?`), check: checkNum(W), show: fm(W), steps: [S(T('Part = whole · p/100.', 'Prozentwert W = G · p/100.'), `${G0} · ${p}/100 = ${fm(W)}`)] };
    if (kind === 1) return { q: T(`${fm(W)} is what percent of ${G0}?`, `Wie viel Prozent sind ${fm(W)} von ${G0}?`), check: checkNum(p), show: `${p} %`, steps: [S(T('Percentage = part / whole · 100.', 'Prozentsatz p = W / G · 100.'), `${fm(W)} / ${G0} · 100 = ${p} %`)] };
    if (kind === 2) {
      const up = Math.random() < 0.5, res = G0 * (1 + (up ? p : -p) / 100);
      return { q: up ? T(`A price of ${G0} € rises by ${p}%. What is the new price?`, `Ein Preis von ${G0} € steigt um ${p} %. Wie hoch ist der neue Preis?`) : T(`A price of ${G0} € is reduced by ${p}%. What is the new price?`, `Ein Preis von ${G0} € wird um ${p} % gesenkt. Wie hoch ist der neue Preis?`),
        check: checkNum(res, 0.005), show: `${fm(res)} €`,
        steps: [S(T(`Growth factor: 1 ${up ? '+' : '−'} ${p}/100 = ${fm(1 + (up ? p : -p) / 100)}.`, `${up ? 'Wachstums' : 'Abnahme'}faktor: 1 ${up ? '+' : '−'} ${p}/100 = ${fm(1 + (up ? p : -p) / 100)}.`)), S(T('Multiply.', 'Multiplizieren.'), `${G0} · ${fm(1 + (up ? p : -p) / 100)} = ${fm(res)} €`)] };
    }
    return { q: T(`${p}% of a number is ${fm(W)}. What is the number?`, `${p} % einer Zahl sind ${fm(W)}. Wie heißt die Zahl?`), check: checkNum(G0), show: fm(G0),
      steps: [S(T('1% is the part divided by the rate.', '1 % = Prozentwert durch Prozentsatz.'), `1 % = ${fm(W)} / ${p} = ${fm(W / p)}`), S(T('100% is a hundred times that.', '100 % sind das Hundertfache.'), `${fm(W / p)} · 100 = ${G0}`)] };
  };
  G.linear = (lv) => {
    const x = nz(-9, 9);
    let a = nz(-6, 6), c = lv === 0 ? 0 : nz(-6, 6);
    if (a === c) a = c + 2;
    const b = ri(-12, 12), d = (a - c) * x + b;
    const left = lin(a, b), right = c ? lin(c, d) : String(d);
    const steps = [];
    if (c) steps.push(S(T(`${c < 0 ? 'Add' : 'Subtract'} ${lin(Math.abs(c), 0)} on both sides.`, `Auf beiden Seiten ${lin(Math.abs(c), 0)} ${c < 0 ? 'addieren' : 'subtrahieren'}.`), `${lin(a - c, b)} = ${d}`));
    if (b) steps.push(S(T(`${b < 0 ? 'Add' : 'Subtract'} ${Math.abs(b)} on both sides.`, `Auf beiden Seiten ${Math.abs(b)} ${b < 0 ? 'addieren' : 'subtrahieren'}.`), `${lin(a - c, 0)} = ${d - b}`));
    if (a - c !== 1) steps.push(S(T(`Divide by ${a - c}.`, `Durch ${a - c} teilen.`), `x = ${d - b} / ${a - c < 0 ? `(${a - c})` : a - c} = ${x}`));
    steps.push(S(T('Check:', 'Probe:'), `${a}·${x < 0 ? `(${x})` : x} ${sgn(b)} = ${a * x + b}   ${c ? `${c}·${x < 0 ? `(${x})` : x} ${sgn(d)} = ${c * x + d}` : ''}`));
    return { q: T('Solve for x:', 'Löse nach x auf:'), math: `${left} = ${right}`, check: checkNum(x), show: `x = ${x}`, steps };
  };
  G.quadratic = (lv) => {
    let r1 = nz(-8, 8), r2 = ri(-8, 8);
    if (lv === 0) r2 = -r1;
    const a = lv === 2 ? pick([1, 2, -1]) : 1;
    const b = -a * (r1 + r2), c = a * r1 * r2;
    const poly = `${a === 1 ? '' : a === -1 ? '−' : a}x² ${b ? sgn(b) + 'x' : ''} ${c ? sgn(c) : ''}`.replace(/\s+/g, ' ').trim();
    const D = b * b - 4 * a * c;
    const steps = [S(T('Read off a, b, c.', 'a, b, c ablesen.'), `a = ${a}, b = ${b}, c = ${c}`),
      S(T('Discriminant D = b² − 4ac.', 'Diskriminante D = b² − 4ac.'), `D = ${b < 0 ? `(${b})` : b}² − 4·${a < 0 ? `(${a})` : a}·${c < 0 ? `(${c})` : c} = ${D}`),
      S(T('Quadratic formula x = (−b ± √D) / (2a).', 'Mitternachtsformel x = (−b ± √D) / (2a).'), `x = (${-b} ± ${Math.sqrt(D)}) / ${2 * a}`),
      S(T('The two solutions:', 'Die beiden Lösungen:'), `x₁ = ${Math.min(r1, r2)},  x₂ = ${Math.max(r1, r2)}`)];
    if (r1 === r2) steps.splice(3, 1, S(T('D = 0: one double solution.', 'D = 0: eine doppelte Lösung.'), `x = ${r1}`));
    if (r1 === -r2 && b === 0) steps.splice(0, 3, S(T('No x-term: solve for x² directly.', 'Kein x-Term: direkt nach x² auflösen.'), `x² = ${-c / a}`), S(T('Square root — both signs.', 'Wurzel ziehen — beide Vorzeichen.'), `x = ±${Math.abs(r1)}`));
    const sols = r1 === r2 ? [r1] : [r1, r2];
    return { q: T('Solve:', 'Löse:'), math: `${poly} = 0`, check: checkSet(sols), show: sols.map((s) => `x = ${s}`).join(T(' or ', ' oder ')), steps };
  };
  G.system = (lv) => {
    const x = nz(-6, 6), y = nz(-6, 6);
    let a, b, c, d;
    do { a = nz(-5, 5); b = nz(-5, 5); c = nz(-5, 5); d = nz(-5, 5); } while (a * d - b * c === 0 || (lv === 0 && b !== 1 && b !== -1));
    const e = a * x + b * y, f = c * x + d * y;
    const eq = (p, q, r) => `${p === 1 ? '' : p === -1 ? '−' : p}x ${q < 0 ? '−' : '+'} ${Math.abs(q) === 1 ? '' : Math.abs(q)}y = ${r}`;
    // elimination: multiply to match the x coefficients
    const m1 = c, m2 = a;
    const steps = [
      S(T(`Multiply (1) by ${m1} and (2) by ${m2} so x has the same coefficient.`, `(1) mit ${m1} und (2) mit ${m2} multiplizieren, damit x denselben Koeffizienten hat.`), `${eq(a * m1, b * m1, e * m1)}\n${eq(c * m2, d * m2, f * m2)}`),
      S(T('Subtract the equations: x cancels.', 'Gleichungen subtrahieren: x fällt weg.'), `${b * m1 - d * m2}y = ${e * m1 - f * m2}`),
      S(T('Solve for y.', 'Nach y auflösen.'), `y = ${e * m1 - f * m2} / ${b * m1 - d * m2} = ${y}`),
      S(T('Put y into (1) and solve for x.', 'y in (1) einsetzen und nach x auflösen.'), `${a}x ${sgn(b * y)} = ${e}  ⇒  x = ${x}`),
    ];
    return {
      q: T('Solve the system (answer as x, y):', 'Löse das Gleichungssystem (Antwort: x, y):'), math: `(1)  ${eq(a, b, e)}\n(2)  ${eq(c, d, f)}`,
      check: (input) => { const v = readNumbers(input); if (v.length !== 2) return { ok: false, msg: T('Give x and y, e.g. “3, -2”.', 'Gib x und y an, z. B. „3, -2“.') }; return { ok: close(v[0], x) && close(v[1], y) }; },
      show: `x = ${x}, y = ${y}`, steps,
    };
  };
  G.powers = (lv) => {
    const kinds = [
      () => { const b = ri(2, 5), m = ri(2, 6), n = ri(2, 6); return [`${b}^${m} · ${b}^${n}`, T('Same base: add the exponents.', 'Gleiche Basis: Exponenten addieren.'), `${b}^${m + n}`, b ** (m + n)]; },
      () => { const b = ri(2, 4), m = ri(5, 9), n = ri(1, 4); return [`${b}^${m} : ${b}^${n}`, T('Same base: subtract the exponents.', 'Gleiche Basis: Exponenten subtrahieren.'), `${b}^${m - n}`, b ** (m - n)]; },
      () => { const b = ri(2, 3), m = ri(2, 3), n = ri(2, 3); return [`(${b}^${m})^${n}`, T('Power of a power: multiply the exponents.', 'Potenz einer Potenz: Exponenten multiplizieren.'), `${b}^${m * n}`, b ** (m * n)]; },
      () => { const r = ri(2, 15); return [`√${r * r}`, T(`${r} · ${r} = ${r * r}.`, `${r} · ${r} = ${r * r}.`), String(r), r]; },
      () => { const b = ri(2, 5), n = ri(1, 3); return [`${b}^(−${n})`, T('A negative exponent means the reciprocal.', 'Negativer Exponent bedeutet Kehrwert.'), `1/${b}^${n} = 1/${b ** n}`, 1 / b ** n]; },
      () => { const r = ri(2, 5); return [`∛${r ** 3}`, T(`${r}³ = ${r ** 3}.`, `${r}³ = ${r ** 3}.`), String(r), r]; },
    ];
    const k = kinds[lv === 0 ? ri(0, 3) : ri(0, 5)]();
    return { q: T('Calculate:', 'Berechne:'), math: k[0], check: checkNum(k[3]), show: k[3] < 1 ? frac(1, Math.round(1 / k[3])) : String(k[3]), steps: [S(k[1], `${k[0]} = ${k[2]}${k[2] === String(k[3]) ? '' : ' = ' + (k[3] < 1 ? frac(1, Math.round(1 / k[3])) : k[3])}`)] };
  };
  G.derivative = (lv) => {
    const pools = [
      [() => { const a = nz(-5, 5), n = ri(2, 5), b = ri(-9, 9); return [`${a}x^${n} ${sgn(b)}x`.replace('+ 0x', ''), (x) => a * n * x ** (n - 1) + b, `${a * n}x^${n - 1} ${b ? sgn(b) : ''}`, T('Power rule: (xⁿ)′ = n·xⁿ⁻¹, constants factors stay.', 'Potenzregel: (xⁿ)′ = n·xⁿ⁻¹, konstante Faktoren bleiben.')]; },
        () => { const a = ri(1, 4), b = ri(-5, 5), c = ri(-9, 9); return [`${a}x^3 ${sgn(b)}x^2 ${sgn(c)}`, (x) => 3 * a * x * x + 2 * b * x, `${3 * a}x^2 ${sgn(2 * b)}x`, T('Differentiate term by term; the constant disappears.', 'Summandenweise ableiten; die Konstante fällt weg.')]; }],
      [() => { const a = nz(2, 5); return [`sin(${a}x)`, (x) => a * Math.cos(a * x), `${a}cos(${a}x)`, T('Chain rule: outer derivative cos, times inner derivative.', 'Kettenregel: äußere Ableitung cos mal innere Ableitung.')]; },
        () => { const a = nz(2, 4); return [`e^(${a}x)`, (x) => a * Math.exp(a * x), `${a}e^(${a}x)`, T('(e^(ax))′ = a·e^(ax).', '(e^(ax))′ = a·e^(ax).')]; },
        () => { const a = ri(2, 5), b = ri(1, 5); return [`(${a}x + ${b})^3`, (x) => 3 * a * (a * x + b) ** 2, `${3 * a}(${a}x + ${b})^2`, T('Chain rule: 3·(inner)² times the inner derivative.', 'Kettenregel: 3·(innen)² mal innere Ableitung.')]; }],
      [() => { const n = ri(2, 3); return [`x^${n}·sin(x)`, (x) => n * x ** (n - 1) * Math.sin(x) + x ** n * Math.cos(x), `${n}x^${n - 1}·sin(x) + x^${n}·cos(x)`, T("Product rule: (u·v)′ = u′v + uv′.", "Produktregel: (u·v)′ = u′v + uv′.")]; },
        () => [`x·e^x`, (x) => Math.exp(x) * (1 + x), `e^x + x·e^x`, T("Product rule: (u·v)′ = u′v + uv′.", "Produktregel: (u·v)′ = u′v + uv′.")],
        () => [`ln(x^2 + 1)`, (x) => (2 * x) / (x * x + 1), `2x/(x^2 + 1)`, T('Chain rule: (ln u)′ = u′/u.', 'Kettenregel: (ln u)′ = u′/u.')],
        () => [`x/(x + 1)`, (x) => 1 / (x + 1) ** 2, `1/(x + 1)^2`, T('Quotient rule: (u/v)′ = (u′v − uv′)/v².', 'Quotientenregel: (u/v)′ = (u′v − uv′)/v².')]],
    ];
    const d = pick(pools[Math.min(lv, 2)])();
    return { q: T('Find the derivative f′(x):', 'Bestimme die Ableitung f′(x):'), math: `f(x) = ${d[0]}`, check: checkFn(d[1]), show: `f′(x) = ${d[2]}`, steps: [S(d[3], `f′(x) = ${d[2]}`)] };
  };
  G.geometry = (lv) => {
    const triples = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25]];
    const kind = ri(0, lv === 0 ? 1 : 3);
    if (kind <= 1) {
      const [a, b, c] = pick(triples);
      if (kind === 0) return { q: T(`A right triangle has legs ${a} cm and ${b} cm. How long is the hypotenuse?`, `Ein rechtwinkliges Dreieck hat die Katheten ${a} cm und ${b} cm. Wie lang ist die Hypotenuse?`), check: checkNum(c), show: `${c} cm`,
        steps: [S(T('Pythagoras: c² = a² + b².', 'Pythagoras: c² = a² + b².'), `c² = ${a}² + ${b}² = ${a * a + b * b}`), S(T('Square root.', 'Wurzel ziehen.'), `c = √${a * a + b * b} = ${c} cm`)] };
      return { q: T(`A right triangle has hypotenuse ${c} cm and one leg ${a} cm. How long is the other leg?`, `Ein rechtwinkliges Dreieck hat die Hypotenuse ${c} cm und eine Kathete ${a} cm. Wie lang ist die andere Kathete?`), check: checkNum(b), show: `${b} cm`,
        steps: [S(T('Pythagoras rearranged: b² = c² − a².', 'Pythagoras umgestellt: b² = c² − a².'), `b² = ${c}² − ${a}² = ${c * c - a * a}`), S(T('Square root.', 'Wurzel ziehen.'), `b = ${b} cm`)] };
    }
    const r = ri(2, 12);
    if (kind === 2) return { q: T(`A circle has radius ${r} cm. What is its area? (2 decimals)`, `Ein Kreis hat den Radius ${r} cm. Wie groß ist sein Flächeninhalt? (2 Nachkommastellen)`), check: checkNum(Math.PI * r * r, 0.01), show: `${fm(+(Math.PI * r * r).toFixed(2))} cm²`, steps: [S('A = π·r²', `A = π·${r}² ≈ ${fm(+(Math.PI * r * r).toFixed(2))} cm²`)] };
    const h = ri(2, 15);
    return { q: T(`A cylinder has radius ${r} cm and height ${h} cm. What is its volume? (2 decimals)`, `Ein Zylinder hat den Radius ${r} cm und die Höhe ${h} cm. Wie groß ist sein Volumen? (2 Nachkommastellen)`), check: checkNum(Math.PI * r * r * h, 0.01), show: `${fm(+(Math.PI * r * r * h).toFixed(2))} cm³`, steps: [S('V = π·r²·h', `V = π·${r}²·${h} ≈ ${fm(+(Math.PI * r * r * h).toFixed(2))} cm³`)] };
  };
  G.probability = (lv) => {
    const kind = ri(0, lv === 0 ? 1 : 3);
    if (kind === 0) { const k = ri(1, 6); return { q: T(`A fair die is rolled once. What is the probability of rolling a ${k} or higher? (as a fraction)`, `Ein fairer Würfel wird einmal geworfen. Wie groß ist die Wahrscheinlichkeit, mindestens eine ${k} zu würfeln? (als Bruch)`), check: checkNum((7 - k) / 6), show: frac(7 - k, 6), steps: [S(T(`Favourable outcomes: ${k} … 6, that is ${7 - k}. All outcomes: 6.`, `Günstige Ergebnisse: ${k} … 6, also ${7 - k}. Mögliche Ergebnisse: 6.`), `P = ${7 - k}/6 = ${frac(7 - k, 6)}`)] }; }
    if (kind === 1) { const n = ri(2, 4); return { q: T(`A coin is flipped ${n} times. What is the probability of getting heads every time?`, `Eine Münze wird ${n}-mal geworfen. Wie groß ist die Wahrscheinlichkeit, jedes Mal Kopf zu werfen?`), check: checkNum(1 / 2 ** n), show: `1/${2 ** n}`, steps: [S(T('The flips are independent: multiply.', 'Die Würfe sind unabhängig: multiplizieren.'), `P = (1/2)^${n} = 1/${2 ** n}`)] }; }
    if (kind === 2) {
      const s = ri(2, 12), ways = 6 - Math.abs(7 - s);
      return { q: T(`Two dice are rolled. What is the probability that the sum is ${s}?`, `Zwei Würfel werden geworfen. Wie groß ist die Wahrscheinlichkeit für die Augensumme ${s}?`), check: checkNum(ways / 36), show: frac(ways, 36),
        steps: [S(T(`Count the pairs with sum ${s}: there are ${ways}.`, `Paare mit Summe ${s} zählen: es sind ${ways}.`)), S(T('There are 6 · 6 = 36 equally likely pairs.', 'Es gibt 6 · 6 = 36 gleich wahrscheinliche Paare.'), `P = ${ways}/36 = ${frac(ways, 36)}`)] };
    }
    const n = ri(4, 8), k = ri(1, n - 1), p = MX.S.nCr(n, k) / 2 ** n;
    return { q: T(`A coin is flipped ${n} times. What is the probability of exactly ${k} heads? (as a fraction)`, `Eine Münze wird ${n}-mal geworfen. Wie groß ist die Wahrscheinlichkeit für genau ${k}-mal Kopf? (als Bruch)`), check: checkNum(p), show: frac(MX.S.nCr(n, k), 2 ** n),
      steps: [S(T(`Number of ways to choose which ${k} flips are heads: C(${n}, ${k}).`, `Anzahl der Möglichkeiten, welche ${k} Würfe Kopf sind: C(${n}, ${k}).`), `C(${n}, ${k}) = ${MX.S.nCr(n, k)}`), S(T(`Each sequence has probability 1/2^${n} = 1/${2 ** n}.`, `Jede Folge hat die Wahrscheinlichkeit 1/2^${n} = 1/${2 ** n}.`), `P = ${MX.S.nCr(n, k)}/${2 ** n} = ${frac(MX.S.nCr(n, k), 2 ** n)}`)] };
  };


  // an expression F(x) whose derivative equals f (any constant C is fine)
  const checkAntiderivative = (f) => (input) => {
    let F;
    try {
      const src = String(input).replace(/^\s*F\(x\)\s*=\s*/i, '').replace(/\+\s*C\s*$/i, '');
      MX.M.af = 1;
      const c = MX.compile(MX.parse(src), ['x'], {});
      if (c.free.size) return { ok: false, msg: T(`Unknown: ${[...c.free].join(', ')}`, `Unbekannt: ${[...c.free].join(', ')}`) };
      F = c.fn;
    } catch (e) { return { ok: false, msg: e.message }; }
    const xs = [-1.3, -0.4, 0.7, 1.6, 2.2];
    return { ok: xs.every((x) => close((F(x + 1e-4) - F(x - 1e-4)) / 2e-4, f(x), 1e-4 * Math.max(1, Math.abs(f(x))))) };
  };
  G.trig = (lv) => {
    const kind = ri(0, lv === 0 ? 0 : lv === 1 ? 1 : 2);
    if (kind === 0) {
      const table = { 0: ['0', '1', '0'], 30: ['1/2', 'sqrt(3)/2', 'sqrt(3)/3'], 45: ['sqrt(2)/2', 'sqrt(2)/2', '1'], 60: ['sqrt(3)/2', '1/2', 'sqrt(3)'], 90: ['1', '0', null] };
      let a, f;
      do { a = pick([0, 30, 45, 60, 90]); f = ri(0, 2); } while (!table[a][f]);
      const name = ['sin', 'cos', 'tan'][f], exact = table[a][f], val = [Math.sin, Math.cos, Math.tan][f]((a * Math.PI) / 180);
      return { q: T(`Give the exact value (fractions and sqrt() are fine):`, `Gib den exakten Wert an (Brüche und sqrt() sind erlaubt):`), math: `${name}(${a}°)`, check: checkNum(Math.abs(val) < 1e-12 ? 0 : val), show: exact.replace(/sqrt\((\d)\)/g, '√$1'),
        steps: [S(T(`Remember the special angles: in a 30-60-90 triangle the sides are 1, √3, 2; in a 45-45-90 triangle 1, 1, √2.`, `Merke die besonderen Winkel: im 30-60-90-Dreieck sind die Seiten 1, √3, 2; im 45-45-90-Dreieck 1, 1, √2.`), `${name}(${a}°) = ${exact.replace(/sqrt\((\d)\)/g, '√$1')}`)] };
    }
    if (kind === 1) {
      const c = ri(5, 20), a = pick([20, 25, 30, 35, 40, 50, 55, 60, 70]), want = pick(['opp', 'adj']);
      const v = want === 'opp' ? c * Math.sin((a * Math.PI) / 180) : c * Math.cos((a * Math.PI) / 180);
      return { q: T(`A right triangle has hypotenuse ${c} cm and an angle of ${a}°. How long is the side ${want === 'opp' ? 'opposite' : 'next to (adjacent to)'} that angle? (2 decimals)`, `Ein rechtwinkliges Dreieck hat die Hypotenuse ${c} cm und einen Winkel von ${a}°. Wie lang ist die ${want === 'opp' ? 'Gegenkathete' : 'Ankathete'} dieses Winkels? (2 Nachkommastellen)`),
        check: checkNum(v, 0.01), show: `${fm(+v.toFixed(2))} cm`,
        steps: [S(want === 'opp' ? T('sin = opposite / hypotenuse, so opposite = hypotenuse · sin(angle).', 'sin = Gegenkathete / Hypotenuse, also Gegenkathete = Hypotenuse · sin(Winkel).') : T('cos = adjacent / hypotenuse, so adjacent = hypotenuse · cos(angle).', 'cos = Ankathete / Hypotenuse, also Ankathete = Hypotenuse · cos(Winkel).'),
          `${c} · ${want === 'opp' ? 'sin' : 'cos'}(${a}°) ≈ ${fm(+v.toFixed(2))} cm`)] };
    }
    const o = ri(3, 12), adj = ri(3, 12), ang = (Math.atan(o / adj) * 180) / Math.PI;
    return { q: T(`A right triangle has legs ${o} cm (opposite) and ${adj} cm (adjacent). What is the angle? (degrees, 1 decimal)`, `Ein rechtwinkliges Dreieck hat die Katheten ${o} cm (gegenüber) und ${adj} cm (anliegend). Wie groß ist der Winkel? (Grad, 1 Nachkommastelle)`),
      check: checkNum(ang, 0.06), show: `${fm(+ang.toFixed(1))}°`,
      steps: [S(T('tan = opposite / adjacent; take the inverse tangent.', 'tan = Gegenkathete / Ankathete; dann Arkustangens.'), `α = tan⁻¹(${o}/${adj}) ≈ ${fm(+ang.toFixed(1))}°`)] };
  };
  G.logs = (lv) => {
    const kind = ri(0, lv === 0 ? 1 : 3);
    const b = pick([2, 3, 5, 10]), k = ri(lv === 0 ? 1 : -2, lv === 0 ? 4 : 5);
    if (kind === 0) return { q: T('Calculate:', 'Berechne:'), math: `log_${b}(${b ** k < 1 ? `1/${b ** -k}` : b ** k})`, check: checkNum(k), show: String(k),
      steps: [S(T(`log_b(x) asks: b to which power gives x?`, `log_b(x) fragt: b hoch wie viel ergibt x?`), `${b}^${k} = ${b ** k < 1 ? `1/${b ** -k}` : b ** k}  ⇒  log_${b}(…) = ${k}`)] };
    if (kind === 1) { const n = ri(1, 4); return { q: T('Calculate:', 'Berechne:'), math: `ln(e^${n})`, check: checkNum(n), show: String(n), steps: [S(T('ln and e^ undo each other.', 'ln und e^ heben sich auf.'), `ln(e^${n}) = ${n}`)] }; }
    if (kind === 2) {
      const m = ri(1, 4), n = ri(1, 4);
      return { q: T('Calculate:', 'Berechne:'), math: `log_2(${2 ** m}) + log_2(${2 ** n})`, check: checkNum(m + n), show: String(m + n),
        steps: [S(T('log rule: log(a) + log(b) = log(a·b).', 'Logarithmusgesetz: log(a) + log(b) = log(a·b).'), `log_2(${2 ** m} · ${2 ** n}) = log_2(${2 ** (m + n)}) = ${m + n}`)] };
    }
    const c = b ** Math.abs(k || 2);
    return { q: T('Solve for x:', 'Löse nach x auf:'), math: `${b}^x = ${c}`, check: checkNum(Math.abs(k || 2)), show: `x = ${Math.abs(k || 2)}`,
      steps: [S(T('Take the logarithm to base ' + b + '.', 'Logarithmus zur Basis ' + b + ' nehmen.'), `x = log_${b}(${c}) = ${Math.abs(k || 2)}`)] };
  };
  G.integrals = (lv) => {
    if (lv === 0 || Math.random() < 0.5) {
      const a = ri(0, 2), b = a + ri(1, 3), c = nz(1, 4), n = ri(1, 3);
      const F = (x) => (c * x ** (n + 1)) / (n + 1), val = F(b) - F(a);
      return { q: T('Calculate the definite integral:', 'Berechne das bestimmte Integral:'), math: `∫ from ${a} to ${b} of ${c === 1 ? '' : c}x${n === 1 ? '' : '^' + n} dx`, check: checkNum(val), show: Number.isInteger(val) ? String(val) : frac(Math.round(val * (n + 1)), n + 1),
        steps: [S(T('Antiderivative by the power rule: xⁿ → xⁿ⁺¹/(n+1).', 'Stammfunktion mit der Potenzregel: xⁿ → xⁿ⁺¹/(n+1).'), `F(x) = ${c === 1 ? '' : c}x^${n + 1}/${n + 1}`),
          S(T('Upper limit minus lower limit.', 'Obere Grenze minus untere Grenze.'), `F(${b}) − F(${a}) = ${fm(F(b))} − ${fm(F(a))} = ${fm(val)}`)] };
    }
    const pools = [
      () => { const a = ri(1, 5), b = ri(1, 9); return [`${2 * a}x + ${b}`, (x) => 2 * a * x + b, `${a}x^2 + ${b}x + C`]; },
      () => { const a = ri(1, 3); return [`${3 * a}x^2`, (x) => 3 * a * x * x, `${a}x^3 + C`]; },
      () => [`cos(x)`, Math.cos, 'sin(x) + C'],
      () => { const a = ri(2, 4); return [`e^(${a}x)`, (x) => Math.exp(a * x), `e^(${a}x)/${a} + C`]; },
      () => [`1/x`, (x) => 1 / x, 'ln|x| + C'],
    ];
    const [fs, f, ans] = pick(pools)();
    return { q: T('Find an antiderivative F(x):', 'Bestimme eine Stammfunktion F(x):'), math: `f(x) = ${fs}`, check: (input) => (/ln\s*\|?\s*x\s*\|?/i.test(input) && fs === '1/x' ? { ok: true } : checkAntiderivative(f)(input)), show: `F(x) = ${ans}`,
      steps: [S(T('Reverse the derivative rules; check by differentiating the answer.', 'Ableitungsregeln umkehren; zur Probe die Antwort ableiten.'), `F(x) = ${ans}`)] };
  };
  G.vectors = (lv) => {
    const v = () => [nz(-5, 5), nz(-5, 5), ...(lv === 2 ? [ri(-4, 4)] : [])];
    const a = v(), b = v(), str = (u) => `(${u.join(', ')})`;
    const kind = ri(0, lv === 0 ? 1 : 3);
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    if (kind === 0) { const s = a.map((x, i) => x + b[i]); return { q: T('Add the vectors (answer as components separated by commas):', 'Addiere die Vektoren (Antwort: Komponenten durch Kommas getrennt):'), math: `${str(a)} + ${str(b)}`, show: s.join(', '), steps: [S(T('Add component by component.', 'Komponentenweise addieren.'), `${str(s)}`)],
      check: (input) => { const n = readNumbers(input); return { ok: n.length === s.length && n.every((x, i) => close(x, s[i])), msg: n.length !== s.length ? T(`Give ${s.length} components.`, `Gib ${s.length} Komponenten an.`) : undefined }; } }; }
    if (kind === 1) return { q: T('Calculate the dot product:', 'Berechne das Skalarprodukt:'), math: `${str(a)} · ${str(b)}`, check: checkNum(dot), show: String(dot), steps: [S(T('Multiply matching components and add.', 'Passende Komponenten multiplizieren und addieren.'), `${a.map((x, i) => `${x}·${b[i] < 0 ? `(${b[i]})` : b[i]}`).join(' + ')} = ${dot}`)] };
    if (kind === 2) { const l = Math.hypot(...a); return { q: T('How long is the vector? (exact, e.g. sqrt(13), or 2 decimals)', 'Wie lang ist der Vektor? (exakt, z. B. sqrt(13), oder 2 Nachkommastellen)'), math: `|${str(a)}|`, check: (i) => checkNum(l, 0.006)(String(i).split('≈').pop()), show: Number.isInteger(l) ? String(l) : `√${a.reduce((s, x) => s + x * x, 0)} ≈ ${fm(+l.toFixed(2))}`, steps: [S(T('Length = √(sum of squared components).', 'Länge = √(Summe der Quadrate der Komponenten).'), `√(${a.map((x) => `${x}²`).join(' + ')}) = √${a.reduce((s, x) => s + x * x, 0)}`)] }; }
    const ang = (Math.acos(dot / (Math.hypot(...a) * Math.hypot(...b))) * 180) / Math.PI;
    return { q: T('What is the angle between the vectors? (degrees, 1 decimal)', 'Wie groß ist der Winkel zwischen den Vektoren? (Grad, 1 Nachkommastelle)'), math: `${str(a)}, ${str(b)}`, check: checkNum(ang, 0.06), show: `${fm(+ang.toFixed(1))}°`,
      steps: [S(T('cos α = (a · b) / (|a| · |b|).', 'cos α = (a · b) / (|a| · |b|).'), `cos α = ${dot} / (${fm(+Math.hypot(...a).toFixed(4))} · ${fm(+Math.hypot(...b).toFixed(4))})  ⇒  α ≈ ${fm(+ang.toFixed(1))}°`)] };
  };
  G.word = () => {
    const kinds = [
      () => { const n1 = ri(3, 8), p = ri(2, 6) * 0.5, n2 = ri(9, 20), each = p / n1, res = each * n2;
        return { q: T(`${n1} notebooks cost ${fm(p)} €. How much do ${n2} notebooks cost?`, `${n1} Hefte kosten ${fm(p)} €. Wie viel kosten ${n2} Hefte?`), check: checkNum(res, 0.006), show: `${fm(+res.toFixed(2))} €`,
          steps: [S(T('Find the price of one notebook.', 'Preis für ein Heft berechnen.'), `${fm(p)} € : ${n1} = ${fm(+each.toFixed(4))} €`), S(T(`Multiply by ${n2}.`, `Mit ${n2} multiplizieren.`), `${fm(+each.toFixed(4))} € · ${n2} ≈ ${fm(+res.toFixed(2))} €`)] }; },
      () => { const w = ri(2, 6), d = ri(6, 24), w2 = ri(2, 8); const res = (w * d) / w2;
        return { q: T(`${w} painters need ${d} hours to paint a house. How long do ${w2} painters need (working at the same speed)?`, `${w} Maler brauchen ${d} Stunden für ein Haus. Wie lange brauchen ${w2} Maler (gleich schnell)?`), check: checkNum(res, 0.01), show: `${fm(+res.toFixed(2))} h`,
          steps: [S(T('More painters, less time: the work w·d stays the same.', 'Mehr Maler, weniger Zeit: die Arbeit Maler · Stunden bleibt gleich.'), `${w} · ${d} = ${w * d} painter-hours`), S(T(`Divide by ${w2}.`, `Durch ${w2} teilen.`), `${w * d} : ${w2} = ${fm(+res.toFixed(2))} h`)] }; },
      () => { const v = ri(4, 12) * 10, t = ri(2, 9) * 0.5, s = v * t;
        return { q: T(`A train travels at ${v} km/h for ${fm(t)} hours. How far does it go?`, `Ein Zug fährt ${fm(t)} Stunden lang mit ${v} km/h. Wie weit kommt er?`), check: checkNum(s), show: `${fm(s)} km`, steps: [S(T('Distance = speed · time.', 'Strecke = Geschwindigkeit · Zeit.'), `${v} · ${fm(t)} = ${fm(s)} km`)] }; },
      () => { const pr = ri(4, 30) * 10, p = pick([10, 15, 20, 25, 30]), res = pr * (1 - p / 100);
        return { q: T(`A jacket costs ${pr} €. In the sale it is ${p}% cheaper. What is the sale price?`, `Eine Jacke kostet ${pr} €. Im Sale ist sie ${p} % billiger. Wie viel kostet sie jetzt?`), check: checkNum(res, 0.006), show: `${fm(res)} €`, steps: [S(T(`Pay ${100 - p}% of the price.`, `Man zahlt ${100 - p} % des Preises.`), `${pr} € · ${fm(1 - p / 100)} = ${fm(res)} €`)] }; },
      () => { const age = ri(8, 15), k = ri(3, 4), yrs = ri(2, 6); const father = age * k;
        return { q: T(`Ben is ${age}. His father is ${k} times as old. How old will his father be in ${yrs} years?`, `Ben ist ${age}. Sein Vater ist ${k}-mal so alt. Wie alt ist der Vater in ${yrs} Jahren?`), check: checkNum(father + yrs), show: String(father + yrs),
          steps: [S(T("Father's age now.", 'Alter des Vaters jetzt.'), `${k} · ${age} = ${father}`), S(T(`Add ${yrs} years.`, `${yrs} Jahre addieren.`), `${father} + ${yrs} = ${father + yrs}`)] }; },
      () => { const K = ri(5, 40) * 100, p = pick([2, 3, 4, 5]), n = ri(2, 5), Z = (K * p * n) / 100;
        return { q: T(`${K} € earn ${p}% simple interest per year. How much interest after ${n} years?`, `${K} € werden ${n} Jahre lang zu ${p} % (ohne Zinseszins) verzinst. Wie viel Zinsen gibt es?`), check: checkNum(Z, 0.006), show: `${fm(Z)} €`, steps: [S(T('Interest = capital · rate · years.', 'Zinsen = Kapital · Zinssatz · Jahre.'), `${K} · ${p}/100 · ${n} = ${fm(Z)} €`)] }; },
    ];
    return pick(kinds)();
  };

  const TOPICS = {
    arith: ['Order of operations', 'Rechenregeln'], fractions: ['Fractions', 'Brüche'], percent: ['Percentages', 'Prozente'], powers: ['Powers & roots', 'Potenzen & Wurzeln'],
    linear: ['Linear equations', 'Lineare Gleichungen'], quadratic: ['Quadratic equations', 'Quadratische Gleichungen'], system: ['Systems of equations', 'Gleichungssysteme'],
    derivative: ['Derivatives', 'Ableitungen'], integrals: ['Integrals', 'Integrale'], trig: ['Trigonometry', 'Trigonometrie'], logs: ['Logarithms', 'Logarithmen'],
    vectors: ['Vectors', 'Vektoren'], geometry: ['Geometry', 'Geometrie'], probability: ['Probability', 'Wahrscheinlichkeit'], word: ['Word problems', 'Textaufgaben'],
  };
  function generate(topic, level, language) {
    lang = language;
    const ex = G[topic](level);
    ex.lang = language;
    ex.topic = topic;
    return ex;
  }
  return { generate, TOPICS, readNumbers, setLang: (l) => { lang = l; }, T: (en, de) => T(en, de) };
})();

(() => {
  const { el } = U;
  const KEY = 'mathsim.practice.v1';
  const st = { topic: 'linear', level: 1, lang: null, stats: {}, log: [] };
  let card, cur = null, tries = 0, solved = false, scoreEl, input, feedback, stepsEl;
  const T = (en, de) => (st.lang === 'de' ? de : en);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } };

  // review mode: topics you get wrong more often come up more often; untried topics count as average
  function reviewTopic() {
    const keys = Object.keys(Practice.TOPICS);
    const w = keys.map((k) => { const s = st.stats[k]; return s && s.done ? 0.15 + (s.done - s.right + 1) / (s.done + 2) : 0.5; });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) { r -= w[i]; if (r <= 0) return keys[i]; }
    return keys[0];
  }
  function next() {
    cur = Practice.generate(st.topic === 'review' ? reviewTopic() : st.topic, st.level, st.lang);
    tries = 0; solved = false;
    render();
    setTimeout(() => input && input.focus(), 0);
  }
  function stat() { const k = (cur && cur.topic) || st.topic; return st.stats[k] || (st.stats[k] = { done: 0, right: 0, streak: 0, best: 0 }); }
  const today = () => new Date().toISOString().slice(0, 10);
  function logResult(ok) {
    st.log = (st.log || []).concat([{ d: today(), t: cur.topic, ok }]).slice(-3000);
    renderProgress();
  }
  function renderScore() {
    const s = stat();
    scoreEl.replaceChildren(
      el('span', {}, T('Solved: ', 'Gelöst: '), el('b', {}, `${s.right} / ${s.done}`)),
      el('span', {}, T('Streak: ', 'Serie: '), el('b', {}, String(s.streak))),
      el('span', {}, T('Best streak: ', 'Beste Serie: '), el('b', {}, String(s.best))));
  }
  function check() {
    if (!cur || solved) return next();
    if (!input.value.trim()) return;
    const r = cur.check(input.value);
    const s = stat();
    if (r.ok) {
      solved = true;
      if (tries === 0) { s.right++; s.streak++; s.best = Math.max(s.best, s.streak); }
      s.done++;
      logResult(tries === 0);
      feedback.className = 'pr-feedback ok';
      feedback.textContent = (r.msg || T('Correct!', 'Richtig!')) + (tries ? T(` (after ${tries + 1} tries)`, ` (nach ${tries + 1} Versuchen)`) : '');
      showSteps();
    } else {
      tries++;
      if (!r.msg) s.streak = 0;
      feedback.className = 'pr-feedback bad';
      feedback.textContent = r.msg || (tries >= 2 ? T('Not quite. Look at the solution, or try once more.', 'Noch nicht. Schau dir die Lösung an oder versuch es noch einmal.') : T('Not quite — try again.', 'Noch nicht — versuch es noch einmal.'));
    }
    save();
    renderScore();
    btnCheck.textContent = solved ? T('Next exercise →', 'Nächste Aufgabe →') : T('Check', 'Prüfen');
  }
  function showSteps() {
    stepsEl.hidden = false;
    stepsEl.replaceChildren(
      el('div', { class: 'pr-steps-title' }, T('Solution', 'Lösung')),
      el('ol', { class: 'ex-steps' }, cur.steps.map((s) => el('li', {}, el('div', { class: 'ex-text' }, s.text), s.math ? el('pre', { class: 'ex-math' }, s.math) : null))),
      el('div', { class: 'ex-answer' }, el('span', {}, T('Answer', 'Antwort')), cur.show));
  }
  let btnCheck;
  function render() {
    input = el('input', { type: 'text', class: 'mono pr-input', placeholder: T('Your answer', 'Deine Antwort'), autocomplete: 'off', spellcheck: 'false' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    feedback = el('div', { class: 'pr-feedback' });
    stepsEl = el('div', { class: 'pr-steps', hidden: true });
    btnCheck = U.el('button', { type: 'button', class: 'primary', onclick: check }, T('Check', 'Prüfen'));
    card.replaceChildren(
      st.topic === 'review' ? el('div', { class: 'pr-topic-tag' }, Practice.TOPICS[cur.topic][st.lang === 'de' ? 1 : 0]) : '',
      el('div', { class: 'pr-q' }, cur.q),
      cur.math ? el('pre', { class: 'pr-math' }, cur.math) : '',
      el('div', { class: 'pr-answer-row' }, input, btnCheck,
        U.el('button', { type: 'button', onclick: () => { if (!solved) { stat().streak = 0; stat().done++; solved = true; logResult(false); save(); renderScore(); btnCheck.textContent = T('Next exercise →', 'Nächste Aufgabe →'); } showSteps(); } }, T('Show solution', 'Lösung zeigen')),
        U.el('button', { type: 'button', onclick: next, title: T('Skip to a new exercise', 'Neue Aufgabe') }, T('New', 'Neu'))),
      feedback, stepsEl);
    renderScore();
  }

  // ---- progress: the last 14 days and accuracy per topic
  let progEl;
  function renderProgress() {
    if (!progEl) return;
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10));
    const per = days.map((d) => { const e = (st.log || []).filter((x) => x.d === d); return [e.filter((x) => x.ok).length, e.filter((x) => !x.ok).length]; });
    const max = Math.max(1, ...per.map(([a, b]) => a + b));
    const bars = el('div', { class: 'pr-bars' }, days.map((d, i) => el('div', { class: 'pr-bar', title: `${d}: ${per[i][0]} ${T('right', 'richtig')}, ${per[i][1]} ${T('wrong', 'falsch')}` },
      el('div', { class: 'pr-bar-stack' }, el('i', { class: 'bad', style: `height:${(per[i][1] / max) * 100}%` }), el('i', { class: 'ok', style: `height:${(per[i][0] / max) * 100}%` })),
      el('span', {}, d.slice(8)))));
    const topics = Object.entries(Practice.TOPICS).map(([k, [en, de]]) => {
      const s = st.stats[k];
      const acc = s && s.done ? s.right / s.done : null;
      return el('div', { class: 'pr-acc' }, el('span', {}, st.lang === 'de' ? de : en),
        el('div', { class: 'pr-acc-bar' }, el('i', { style: `width:${acc == null ? 0 : acc * 100}%; background:${acc == null ? 'transparent' : acc > 0.75 ? '#51cf66' : acc > 0.45 ? '#fcc419' : '#ff6b6b'}` })),
        el('b', {}, acc == null ? '—' : `${Math.round(acc * 100)} % (${s.right}/${s.done})`));
    });
    progEl.replaceChildren(el('h4', {}, T('Last 14 days', 'Letzte 14 Tage')), bars, el('h4', {}, T('Right on the first try, per topic', 'Beim ersten Versuch richtig, je Thema')), el('div', { class: 'pr-accs' }, topics),
      el('div', { class: 'btn-row' }, U.el('button', { type: 'button', class: 'small danger', onclick: () => { if (window.confirm(T('Reset all scores and history?', 'Alle Punkte und den Verlauf zurücksetzen?'))) { st.stats = {}; st.log = []; save(); renderProgress(); renderScore(); } } }, T('Reset progress', 'Fortschritt zurücksetzen'))));
  }

  // ---- worksheets: printable exercises with an answer key (PDF in the desktop app)
  function worksheetDialog() {
    const picks = new Set([st.topic === 'review' ? 'linear' : st.topic]);
    const boxes = Object.entries(Practice.TOPICS).map(([k, [en, de]]) => {
      const b = el('input', { type: 'checkbox' }); b.checked = picks.has(k);
      b.addEventListener('change', () => (b.checked ? picks.add(k) : picks.delete(k)));
      return el('label', { class: 'check' }, b, el('span', {}, st.lang === 'de' ? de : en));
    });
    const count = el('select', {}, [6, 10, 15, 20, 30].map((n) => el('option', { value: n }, String(n))));
    count.value = 10;
    const level = el('select', {}, [[0, T('Easy', 'Leicht')], [1, T('Medium', 'Mittel')], [2, T('Hard', 'Schwer')]].map(([v, l]) => el('option', { value: v }, l)));
    level.value = st.level;
    const key = el('input', { type: 'checkbox' }); key.checked = true;
    const steps = el('input', { type: 'checkbox' }); steps.checked = false;
    const back = el('div', { class: 'modal-back', 'data-no-i18n': '', onmousedown: (e) => { if (e.target === back) back.remove(); } },
      el('div', { class: 'modal wide' }, el('div', { class: 'modal-title' }, T('Worksheet', 'Arbeitsblatt')),
        el('div', { class: 'pr-ws-topics' }, boxes),
        el('div', { class: 'grid2' }, el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, T('Exercises', 'Aufgaben')), count), el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, T('Level', 'Niveau')), level)),
        el('label', { class: 'check' }, key, el('span', {}, T('Answer key on a separate page', 'Lösungen auf einer eigenen Seite'))),
        el('label', { class: 'check' }, steps, el('span', {}, T('Include worked solutions', 'Mit Lösungswegen'))),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', onclick: () => back.remove() }, T('Cancel', 'Abbrechen')),
          el('button', { type: 'button', class: 'primary', onclick: () => {
            if (!picks.size) return U.toast(T('Choose at least one topic', 'Wähle mindestens ein Thema'));
            back.remove();
            const list = [...picks];
            const exs = Array.from({ length: +count.value }, (_, i) => Practice.generate(list[i % list.length], +level.value, st.lang));
            Shell.savePDF(worksheetHTML(exs, key.checked, steps.checked), (st.lang === 'de' ? 'Arbeitsblatt' : 'Worksheet') + '.pdf');
          } }, T('Create PDF', 'PDF erstellen')))));
    document.body.append(back);
  }
  function worksheetHTML(exs, withKey, withSteps) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const date = new Date().toLocaleDateString(st.lang === 'de' ? 'de-DE' : 'en-GB');
    const title = T('Mathematics worksheet', 'Mathematik-Arbeitsblatt');
    const items = exs.map((e, i) => `<li><div class="q">${esc(e.q)}</div>${e.math ? `<pre>${esc(e.math)}</pre>` : ''}<div class="ans">${T('Answer', 'Antwort')}: ______________________</div></li>`).join('');
    const keyHtml = withKey ? `<section class="key"><h2>${T('Answers', 'Lösungen')}</h2><ol>${exs.map((e) => `<li><b>${esc(e.show)}</b>${withSteps ? `<div class="steps">${e.steps.map((s) => `<div>${esc(s.text)}${s.math ? `<pre>${esc(s.math)}</pre>` : ''}</div>`).join('')}</div>` : ''}</li>`).join('')}</ol></section>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body { font: 12pt/1.45 "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; }
      header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 6px; margin-bottom: 14px; }
      h1 { font-size: 17pt; margin: 0; } .meta { color: #555; font-size: 10pt; text-align: right; }
      ol { padding-left: 22px; } li { margin: 0 0 14px; break-inside: avoid; }
      pre { font: 13pt Consolas, monospace; margin: 4px 0; white-space: pre-wrap; }
      .ans { color: #777; margin-top: 6px; } .key { break-before: page; } .steps { font-size: 10pt; color: #333; margin-top: 3px; } .steps pre { font-size: 10pt; }
    </style></head><body><header><h1>${title}</h1><div class="meta">${T('Name', 'Name')}: ____________________<br>${date} · Mathsim</div></header><ol>${items}</ol>${keyHtml}</body></html>`;
  }

  function init(root) {
    try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* fresh */ }
    if (!st.lang) st.lang = Shell.settings.lang === 'de' ? 'de' : 'en'; // first visit: the app's language
    card = el('div', { class: 'pane pr-card' });
    scoreEl = el('div', { class: 'pr-score' });
    const topics = el('div', { class: 'pr-topics' });
    const levels = el('div', { class: 'seg pr-levels' });
    const langSeg = el('div', { class: 'seg pr-lang' });
    const paint = () => {
      topics.replaceChildren(...Object.entries(Practice.TOPICS).map(([k, [en, de]]) => U.el('button', { type: 'button', class: 'chip' + (st.topic === k ? ' on' : ''), onclick: () => { st.topic = k; save(); paint(); next(); } }, st.lang === 'de' ? de : en)),
        U.el('button', { type: 'button', class: 'chip pr-review' + (st.topic === 'review' ? ' on' : ''), title: T('Mixed exercises — more of the topics you find hard', 'Gemischte Aufgaben — mehr von den Themen, die dir schwerfallen'), onclick: () => { st.topic = 'review'; save(); paint(); next(); } }, T('★ Review weak topics', '★ Schwächen üben')));
      renderProgress();
      levels.replaceChildren(...[T('Easy', 'Leicht'), T('Medium', 'Mittel'), T('Hard', 'Schwer')].map((l, i) => el('button', { type: 'button', class: st.level === i ? 'on' : '', onclick: () => { st.level = i; save(); paint(); next(); } }, l)));
      langSeg.replaceChildren(...[['en', 'English'], ['de', 'Deutsch']].map(([k, l]) => el('button', { type: 'button', class: st.lang === k ? 'on' : '', onclick: () => { st.lang = k; save(); paint(); next(); } }, l)));
      wsBtn.textContent = T('🖨 Worksheet / PDF…', '🖨 Arbeitsblatt / PDF…');
      progSummary.textContent = T('Progress', 'Fortschritt');
      hintEl.textContent = T('Answers can be numbers, fractions (3/4) or expressions; separate several answers with commas. Derivatives and antiderivatives are checked by value, so any equivalent form counts.',
        'Antworten können Zahlen, Brüche (3/4) oder Ausdrücke sein; mehrere Antworten durch Kommas trennen. Ableitungen und Stammfunktionen werden über Werte geprüft, jede gleichwertige Form zählt.');
    };
    // the exercises have their own language (above), so the interface dictionary leaves this part alone
    const wsBtn = U.el('button', { type: 'button', onclick: worksheetDialog }), progSummary = el('summary'), hintEl = el('p', { class: 'hint' });
    paint();
    root.append(el('div', { class: 'page pr-page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Practice'), el('p', {}, 'New exercises every time — answer, check, and see the worked solution. Works offline.')),
      el('div', { 'data-no-i18n': '' },
        el('div', { class: 'pane pr-setup' }, topics, el('div', { class: 'pr-setup-row' }, levels, langSeg, scoreEl)),
        card,
        el('div', { class: 'btn-row' }, wsBtn),
        el('details', { class: 'pane pr-progress' }, progSummary, progEl = el('div')),
        hintEl)));
    renderProgress();
    next();
  }

  const topicCmd = (k) => () => { st.topic = k; save(); document.querySelectorAll('#mod-practice .pr-topics .chip').forEach((b, i) => b.classList.toggle('on', Object.keys(Practice.TOPICS)[i] === k)); next(); };
  Shell.register('practice', {
    commands: [
      { label: 'Create a worksheet (PDF)', keywords: 'print worksheet pdf arbeitsblatt drucken', run: () => worksheetDialog() },
      { label: 'Review weak topics', keywords: 'review mixed wiederholen', run: topicCmd('review') },
      ...Object.entries(Practice.TOPICS).map(([k, [en, de]]) => ({ label: `Practise: ${en}`, keywords: de, run: topicCmd(k) })),
    ],
    label: 'Practice', order: 10, root: () => document.getElementById('mod-practice'), init,
    desc: 'Endless generated exercises on 15 topics with answer checking, progress, review of weak topics, worksheets and worked solutions — in English or German.',
    features: ['15 topics', 'Worked solutions', 'Progress & review', 'Worksheets (PDF)'],
  });
})();

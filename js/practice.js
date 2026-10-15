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

  const TOPICS = {
    arith: ['Order of operations', 'Rechenregeln'], fractions: ['Fractions', 'Brüche'], percent: ['Percentages', 'Prozente'], powers: ['Powers & roots', 'Potenzen & Wurzeln'],
    linear: ['Linear equations', 'Lineare Gleichungen'], quadratic: ['Quadratic equations', 'Quadratische Gleichungen'], system: ['Systems of equations', 'Gleichungssysteme'],
    derivative: ['Derivatives', 'Ableitungen'], geometry: ['Geometry', 'Geometrie'], probability: ['Probability', 'Wahrscheinlichkeit'],
  };
  function generate(topic, level, language) {
    lang = language;
    const ex = G[topic](level);
    ex.lang = language;
    return ex;
  }
  return { generate, TOPICS, readNumbers, setLang: (l) => { lang = l; }, T: (en, de) => T(en, de) };
})();

(() => {
  const { el } = U;
  const KEY = 'mathsim.practice.v1';
  const st = { topic: 'linear', level: 1, lang: 'en', stats: {} };
  let card, cur = null, tries = 0, solved = false, scoreEl, input, feedback, stepsEl;
  const T = (en, de) => (st.lang === 'de' ? de : en);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } };

  function next() {
    cur = Practice.generate(st.topic, st.level, st.lang);
    tries = 0; solved = false;
    render();
    setTimeout(() => input && input.focus(), 0);
  }
  function stat() { return st.stats[st.topic] || (st.stats[st.topic] = { done: 0, right: 0, streak: 0, best: 0 }); }
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
      el('div', { class: 'pr-q' }, cur.q),
      cur.math ? el('pre', { class: 'pr-math' }, cur.math) : null,
      el('div', { class: 'pr-answer-row' }, input, btnCheck,
        U.el('button', { type: 'button', onclick: () => { if (!solved) { stat().streak = 0; stat().done++; solved = true; save(); renderScore(); btnCheck.textContent = T('Next exercise →', 'Nächste Aufgabe →'); } showSteps(); } }, T('Show solution', 'Lösung zeigen')),
        U.el('button', { type: 'button', onclick: next, title: T('Skip to a new exercise', 'Neue Aufgabe') }, T('New', 'Neu'))),
      feedback, stepsEl);
    renderScore();
  }

  function init(root) {
    try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* fresh */ }
    card = el('div', { class: 'pane pr-card' });
    scoreEl = el('div', { class: 'pr-score' });
    const topics = el('div', { class: 'pr-topics' });
    const levels = el('div', { class: 'seg pr-levels' });
    const langSeg = el('div', { class: 'seg pr-lang' });
    const paint = () => {
      topics.replaceChildren(...Object.entries(Practice.TOPICS).map(([k, [en, de]]) => U.el('button', { type: 'button', class: 'chip' + (st.topic === k ? ' on' : ''), onclick: () => { st.topic = k; save(); paint(); next(); } }, st.lang === 'de' ? de : en)));
      levels.replaceChildren(...[T('Easy', 'Leicht'), T('Medium', 'Mittel'), T('Hard', 'Schwer')].map((l, i) => el('button', { type: 'button', class: st.level === i ? 'on' : '', onclick: () => { st.level = i; save(); paint(); next(); } }, l)));
      langSeg.replaceChildren(...[['en', 'English'], ['de', 'Deutsch']].map(([k, l]) => el('button', { type: 'button', class: st.lang === k ? 'on' : '', onclick: () => { st.lang = k; save(); paint(); next(); } }, l)));
    };
    paint();
    root.append(el('div', { class: 'page pr-page' },
      el('div', { class: 'page-head' }, el('h2', {}, 'Practice'), el('p', {}, 'New exercises every time — answer, check, and see the worked solution. Works offline.')),
      el('div', { class: 'pane pr-setup' }, topics, el('div', { class: 'pr-setup-row' }, levels, langSeg, scoreEl)),
      card,
      el('p', { class: 'hint' }, 'Answers can be numbers, fractions (3/4) or expressions; separate several answers with commas. Derivatives are checked by value, so any equivalent form counts.')));
    next();
  }

  Shell.register('practice', {
    label: 'Practice', order: 10, root: () => document.getElementById('mod-practice'), init,
    desc: 'Endless generated exercises on 10 topics with answer checking, scores and worked solutions — in English or German.',
    features: ['Equations', 'Fractions & percent', 'Derivatives', 'Worked solutions'],
  });
})();

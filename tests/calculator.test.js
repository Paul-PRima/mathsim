// Expression engine, exact arithmetic, complex numbers and units.
module.exports = (t) => {
  const { MX, CalcX } = t.ctx;
  const ev = (s) => MX.evaluate(s);

  // core engine
  t.eq('precedence', ev('2 + 3 * 4'), 14);
  t.eq('right-assoc power', ev('2^3^2'), 512);
  t.eq('unary minus vs power', ev('-2^2'), -4);
  t.eq('implicit multiplication', ev('2(3 + 4)'), 14);
  t.eq('factorial', ev('5!'), 120);
  t.near('degrees symbol', (MX.M.af = 1, ev('sin(30°)')), 0.5);
  t.eq('odd root of negative', ev('(-8)^(1/3)'), -2);
  t.near('integral to infinity', ev('int(exp(-x^2), x, -inf, inf)'), Math.sqrt(Math.PI), 1e-8);
  t.near('derivative', ev('diff(x^3, x, 2)'), 12, 1e-7);
  t.near('solve', ev('solve(cos(x) = x, x)'), 0.7390851332151607);
  t.near('normal cdf', ev('normcdf(1.96)'), 0.9750021048517795, 1e-12);
  t.eq('sum', ev('sum(k^2, k, 1, 10)'), 385);
  t.throws('unknown name', () => ev('foo + 1'));
  t.eq('no real roots of x²+4', MX.findRoots((x) => x * x + 4, -1e6, 1e6, 4000).length, 0);
  t.eq('no real roots of x²+2x+5', MX.findRoots((x) => x * x + 2 * x + 5, -1000, 1000, 20000).length, 0);
  t.near('double root (x-1)²', MX.findRoots((x) => (x - 1) ** 2, -10, 10, 2000)[0], 1, 1e-6);
  t.eq('simple roots', MX.findRoots((x) => x * x - 1, -3, 3).map(Math.round), [-1, 1]);

  // exact arithmetic
  const ex = (s) => { const q = CalcX.exact(MX.parse(s), {}); return q && CalcX.qString(q); };
  t.eq('30! exact', ex('30!'), '265252859812191058636308480000000');
  t.eq('2^100 exact', ex('2^100'), '1267650600228229401496703205376');
  t.eq('fraction sum', ex('1/3 + 1/6'), '1/2');
  t.eq('decimal literal is exact', ex('0.1 + 0.2'), '3/10');
  t.eq('perfect power root', ex('8^(2/3)'), '4');
  t.eq('nCr big', ex('nCr(100, 50)'), '100891344545564193334812497256');
  t.eq('gcd', ex('gcd(84, 126)'), '42');
  t.eq('inexact → null', ex('sqrt(2)'), null);
  t.eq('pi → null', ex('2pi'), null);
  t.eq('big literal kept', ex('12345678901234567890 + 1'), '12345678901234567891');

  // complex numbers
  const cx = (s) => CalcX.cString(CalcX.complex(MX.parse(s), {}));
  t.eq('sqrt(-4)', cx('sqrt(-4)'), '2i');
  t.eq('product', cx('(2 + 3i)(1 - i)'), '5 + i');
  t.eq('euler', cx('e^(i pi)'), '-1');
  t.eq('i squared', cx('i^2'), '-1');
  t.eq('ln(-1)', cx('ln(-1)').replace('3.14159265359', 'π'), 'πi');
  t.eq('abs', cx('abs(3 + 4i)'), '5');
  t.eq('conj', cx('conj(1 + 2i)'), '1 − 2i');
  t.eq('division', cx('(1 + i)/(1 - i)'), 'i');

  // units
  const un = (s) => CalcX.units(s, { vars: {} });
  t.eq('speed conversion', un('36 km/h in m/s').text, '10 m/s');
  t.eq('mixed lengths', un('3 ft + 12 inch').text, '4 ft');
  t.eq('distance from speed', un('60 mph * 2 h in km').text, '193.12128 km');
  t.eq('temperature', un('100 °F in °C').text, '37.77777778 °C');
  t.eq('energy', un('1 kWh in J').text, '3600000 J');
  t.eq('force (derived unit)', un('70 kg * 9.81 m/s^2').text, '686.7 N');
  t.eq('data', un('1 GiB in MB').text, '1073.741824 MB');
  t.throws('adding metres and seconds', () => un('3 m + 2 s'));
  t.throws('incompatible conversion', () => un('5 kg in m'));
  t.eq('plain math is not units', un('2 + 3'), null);
};

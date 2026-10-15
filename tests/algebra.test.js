// Computer algebra (expand / factor / simplify / derive / integrate) and vectors & matrices.
module.exports = (t) => {
  const { MX, Algebra } = t.ctx;
  const run = (s) => Algebra.run(MX.parse(s));

  t.eq('expand cube', run('expand((x + 2)^3)'), 'x^3 + 6x^2 + 12x + 8');
  t.eq('expand two variables', run('expand((x + y)^2)'), 'x^2 + 2xy + y^2');
  t.eq('expand difference of squares', run('expand((a - b)(a + b))'), 'a^2 - b^2');
  t.eq('expand with fractions', run('expand((x/2 + 1)^2)'), '(1/4)x^2 + x + 1');
  t.eq('factor quadratic', run('factor(x^2 - 5x + 6)'), '(x - 2)(x - 3)');
  t.eq('factor with leading coefficient', run('factor(2x^2 + 7x + 3)'), '(2x + 1)(x + 3)');
  t.eq('factor x^4 - 1', run('factor(x^4 - 1)'), '(x - 1)(x + 1)(x^2 + 1)');
  t.eq('factor repeated root', run('factor(x^3 - 3x^2 + 3x - 1)'), '(x - 1)^3');
  t.eq('factor common monomial', run('factor(6x^2 y + 9x y^2)'), '3xy(2x + 3y)');
  t.eq('factor negative leading', run('factor(-x^2 + 4)'), '-(x - 2)(x + 2)');
  t.eq('factor with x out', run('factor(x^3 - x)'), 'x(x - 1)(x + 1)');
  t.eq('factor an integer', run('factor(360)'), '2^3 · 3^2 · 5');
  t.eq('simplify cancels', run('simplify((x^2 - 1)/(x - 1))'), 'x + 1');
  t.eq('simplify keeps a real fraction', run('simplify((x + 1)/(x^2 - 1))'), '1/(x - 1)');
  t.eq('simplify sums of fractions', run('simplify(1/x + 1/(x + 1))'), '(2x + 1)/(x^2 + x)');
  t.eq('derive', run('derive(x^3 + 2x)'), '3x^2 + 2');
  t.eq('integrate polynomial', run('integrate(3x^2 + 2x)'), 'x^3 + x^2 + C');
  t.throws('factor needs a polynomial', () => run('factor(sin(x))'));

  // vectors and matrices
  const lin = (s, lvars = {}) => Algebra.fmtLin(Algebra.linalg(MX.parse(s), { vars: {}, lvars }));
  t.eq('dot product', lin('dot([1, 2, 3], [4, 5, 6])'), '32');
  t.eq('cross product', lin('cross([1, 0, 0], [0, 1, 0])'), '[0, 0, 1]');
  t.eq('vector sum', lin('[1, 2] + 3[1, 1]'), '[4, 5]');
  t.eq('matrix product', lin('[[1, 2], [3, 4]] * [[5, 6], [7, 8]]'), '[[19, 22], [43, 50]]');
  t.eq('matrix times vector', lin('[[1, 2], [3, 4]] * [1, 1]'), '[3, 7]');
  t.eq('determinant', lin('det([[1, 2], [3, 4]])'), '-2');
  t.eq('inverse', lin('inv([[1, 2], [3, 4]])'), '[[-2, 1], [3/2, -1/2]]');
  t.eq('matrix power', lin('[[1, 1], [1, 0]]^10'), '[[89, 55], [55, 34]]');
  t.eq('norm', lin('norm([3, 4])'), '5');
  t.eq('stored variable', lin('M * M', { M: [[0, 1], [1, 0]] }), '[[1, 0], [0, 1]]');
  t.throws('shape mismatch', () => lin('[1, 2] + [1, 2, 3]'));
  t.ok('detects vector input', Algebra.usesLinalg(MX.parse('[1, 2] * 3'), {}));
  t.ok('plain numbers are not linear algebra', !Algebra.usesLinalg(MX.parse('2 * 3'), {}));
};

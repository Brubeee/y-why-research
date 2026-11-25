// Exact solution-set comparison for a deliberately bounded affine grammar.
// Input is confirmed transcription, never automatically trusted OCR.
const LIMIT = 1n << 512n;
const abs = n => n < 0n ? -n : n;
const gcd = (x, y) => {
  x = abs(x); y = abs(y);
  while (y) [x, y] = [y, x % y];
  return x || 1n;
};
function rational(n, d = 1n) {
  if (!d) throw new Error('Division by zero is unsupported.');
  const g = gcd(n, d) * (d < 0n ? -1n : 1n);
  n /= g; d /= g;
  if (abs(n) >= LIMIT || d >= LIMIT) throw new Error('Exact arithmetic exceeded the size limit.');
  return { n, d };
}
const ZERO = rational(0n), ONE = rational(1n);
const add = (x, y) => rational(x.n * y.d + y.n * x.d, x.d * y.d);
const neg = x => rational(-x.n, x.d);
const mul = (x, y) => rational(x.n * y.n, x.d * y.d);
const div = (x, y) => rational(x.n * y.d, x.d * y.n);
const str = x => x.d === 1n ? String(x.n) : `${x.n}/${x.d}`;
const scale = (x, k) => ({ a: mul(x.a, k), b: mul(x.b, k), symbolic: x.symbolic });
function plus(x, y) {
  return { a: add(x.a, y.a), b: add(x.b, y.b), symbolic: x.symbolic || y.symbolic };
}
function tokenize(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 256) throw new Error('Use a nonempty line of at most 256 characters.');
  const s = text.replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/');
  const tokens = [];
  const re = /\s+|(?:\d+(?:\.\d+)?|\.\d+)|[A-Za-z]|[=+*/()-]/gy;
  while (re.lastIndex < s.length) {
    const m = re.exec(s);
    if (!m) throw new Error('Unsupported character or notation.');
    if (/^\s/.test(m[0])) continue;
    if (tokens.length === 120) throw new Error('Too many tokens.');
    tokens.push(m[0]);
  }
  return tokens;
}
const numeric = t => !!t && /^[\d.]/.test(t);
const letter = t => !!t && /^[A-Za-z]$/.test(t);
function parse(text, equation, includeSides = false) {
  const t = tokenize(text);
  let pos = 0;
  let variable = null;
  const take = () => t[pos++];
  function atom(depth) {
    if (depth > 20) throw new Error('Expressions are nested too deeply.');
    const x = take();
    if (x === '+' || x === '-') {
      const y = atom(depth + 1);
      return x === '+' ? y : scale(y, neg(ONE));
    }
    if (x === '(') {
      const y = sum(depth + 1);
      if (take() !== ')') throw new Error('Unbalanced parentheses.');
      return y;
    }
    if (letter(x)) {
      if (variable !== null && variable !== x) throw new Error('Only one variable can occur in the work.');
      variable = x;
      return { a: ONE, b: ZERO, symbolic: true };
    }
    if (numeric(x)) {
      const [whole = '', frac = ''] = x.split('.');
      const digits = whole + frac;
      if (digits.length > 30) throw new Error('Number literals are limited to 30 digits.');
      return { a: ZERO, b: rational(BigInt(digits), 10n ** BigInt(frac.length)), symbolic: false };
    }
    throw new Error('Expected a number, variable, or parenthesized expression.');
  }
  function product(depth) {
    let x = atom(depth);
    const implicit = () => {
      const last = t[pos-1], next = t[pos];
      return (numeric(last) && letter(next)) ||
        ((numeric(last) || last === ')') && next === '(');
    };
    while (t[pos] === '*' || t[pos] === '/' || implicit()) {
      const op = (t[pos] === '*' || t[pos] === '/') ? take() : '*';
      const y = atom(depth);
      if (op === '/') {
        if (implicit()) throw new Error('Parenthesize multiplication next to a denominator.');
        if (y.symbolic) throw new Error('Variable denominators are unsupported.');
        x = scale(x, div(ONE, y.b));
      } else {
        if (x.symbolic && y.symbolic) throw new Error('Products of variable expressions are unsupported.');
        x = x.symbolic ? scale(x, y.b) : scale(y, x.b);
      }
    }
    return x;
  }
  function sum(depth) {
    let x = product(depth);
    while (t[pos] === '+' || t[pos] === '-') {
      const op = take(), y = product(depth);
      x = plus(x, op === '+' ? y : scale(y, neg(ONE)));
    }
    return x;
  }
  const left = sum(0);
  if (!equation) {
    if (pos !== t.length) throw new Error('Unsupported expression or missing operator.');
    return { variable, coefficient: str(left.a), constant: str(left.b) };
  }
  if (take() !== '=') throw new Error('Use exactly one equality between two supported expressions.');
  const right = sum(0);
  if (pos !== t.length) throw new Error('Use one equality; chains, inequalities and trailing notation are unsupported.');
  const x = plus(left, scale(right, neg(ONE)));
  const root = x.a.n ? div(neg(x.b), x.a) : null;
  const solution = root
    ? { kind: 'unique', value: str(root) }
    : { kind: x.b.n ? 'none' : 'all', value: null };
  return includeSides
    ? { variable, solution, root, left: { a: left.a, b: left.b }, right: { a: right.a, b: right.b } }
    : { variable, solution };
}
function result(text, equation, includeSides = false) {
  try { return { ok: true, ...parse(text, equation, includeSides) }; }
  catch (e) { return { ok: false, reason: e.message }; }
}
export const parseEquation = text => result(text, true);
export const parseExpression = text => result(text, false);
const equationSides = form => ({
  left: add(mul(form.left.a, form.value), form.left.b),
  right: add(mul(form.right.a, form.value), form.right.b),
});
const sameRational = (a, b) => a.n === b.n && a.d === b.d;
const sameSolution = (a, b) => a.kind === b.kind && (a.kind !== 'unique' || a.value === b.value);
const substitution = (form, value) => {
  const sides = equationSides({ ...form, value });
  return {
    left: str(sides.left),
    right: str(sides.right),
    satisfies: sameRational(sides.left, sides.right),
  };
};

/** Return a rational witness only after exact evaluation of both original equations.
 * The changed line's root is preferred so a normal wrong step does not reveal
 * the preceding equation's answer. Ambiguous unique-to-identity/contradiction
 * transitions abstain instead of exposing that preceding root by construction.
 */
export function findEquationWitness(beforeText, afterText) {
  const before = result(beforeText, true, true), after = result(afterText, true, true);
  if (!before.ok || !after.ok) return { status: 'unsupported', reason: before.reason || after.reason };
  if (before.variable && after.variable && before.variable !== after.variable)
    return { status: 'unsupported', reason: 'A different variable cannot be compared to the preceding equation.' };
  if (sameSolution(before.solution, after.solution))
    return { status: 'equivalent', reason: 'The equations have the same solution set.' };

  try {
    let value;
    if (after.solution.kind === 'unique') {
      value = after.root;
      // An identity before this line accepts the changed line's root too; move
      // one exact unit away so the substitution actually separates the pair.
      if (before.solution.kind === 'all') value = add(value, ONE);
    } else if (after.solution.kind === 'all') {
      if (before.solution.kind === 'unique')
        return { status: 'abstain', reason: 'A predictable witness could disclose the preceding equation\'s answer.' };
      value = ZERO;
    } else if (before.solution.kind === 'unique') {
      return { status: 'abstain', reason: 'Showing the only value that satisfies the preceding equation would reveal its answer.' };
    } else {
      // Identity versus contradiction: zero is exact and has no unique answer to reveal.
      value = ZERO;
    }

    const beforeCheck = substitution({ ...before, value }, value);
    const afterCheck = substitution({ ...after, value }, value);
    if (beforeCheck.satisfies === afterCheck.satisfies)
      return { status: 'abstain', reason: 'No verified separating value was found.' };
    return {
      status: 'witness',
      variable: before.variable || after.variable || 'x',
      value: str(value),
      before: beforeCheck,
      after: afterCheck,
    };
  } catch {
    return { status: 'abstain', reason: 'Exact witness arithmetic exceeded the supported size.' };
  }
}
const solutionText = (s, v) => s.kind === 'unique' ? `${v} = ${s.value}` :
  s.kind === 'all' ? 'all real values (identity)' : 'no solutions (contradiction)';
export function verifyRows({ anchor, rows } = {}) {
  const inputRows = Array.isArray(rows) ? rows.slice(0, 100) : [];
  const a = anchor?.confirmed === true ? parseEquation(anchor.text) : null;
  const anchorResult = !a ? { status: 'unconfirmed', message: 'Confirm the original equation before checking any rows.' }
    : !a.ok ? { status: 'unsupported', message: a.reason }
    : { status: 'confirmed', solution: a.solution, message: `Confirmed starting equation: ${solutionText(a.solution, a.variable)}.` };
  let stopped = anchorResult.status !== 'confirmed', firstIssue = null;
  let retainedVariable = a?.variable;
  const output = inputRows.map((row, i) => {
    if (stopped) return { status: 'not-considered', message: 'An earlier issue must be resolved first.' };
    function stop(status, message, solution) {
      stopped = true; firstIssue = i;
      return solution ? { status, message, solution } : { status, message };
    }
    if (row?.confirmed !== true) return stop('unconfirmed', 'Confirm this transcription before checking it.');
    const r = parseEquation(row.text);
    if (!r.ok) return stop('unsupported', r.reason);
    if (r.variable && retainedVariable && r.variable !== retainedVariable) return stop('unsupported', 'A different variable cannot be compared to the earlier work.', r.solution);
    if (r.variable) retainedVariable = r.variable;
    const s = r.solution, base = a.solution;
    if (s.kind !== base.kind || s.value !== base.value) {
      return stop('changed', `This row changes the solution set from ${solutionText(base, a.variable)} to ${solutionText(s, r.variable)}.`, s);
    }
    return { status: 'equivalent', solution: s,
      message: `This row preserves the solution set: ${solutionText(s, r.variable)}. That does not verify the reasoning between lines.` };
  });
  return { anchor: anchorResult, rows: output, firstIssue };
}

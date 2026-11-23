import {parseExpression} from './verify.mjs';

const VARIABLE = '[A-Za-z]';
const INTEGER = '\\d+';
const MONOMIAL = `(?:${INTEGER}\\s*)?${VARIABLE}`;
const SIGN = '[+-]';
const simplified = new RegExp(`^\\s*(?:${SIGN}\\s*)?(?:${MONOMIAL}\\s*${SIGN}\\s*${INTEGER}|${INTEGER}\\s*${SIGN}\\s*${MONOMIAL})\\s*$`);
const integerText = /^-?\d+$/;
const same = (a,b) => a.variable === b.variable && a.coefficient === b.coefficient && a.constant === b.constant;
const result = (status,message) => ({status,message});

/** Check one written expansion; this makes no inference about learner intent. */
export function gradeExpansion(answer, sourceExpression) {
  const goal = parseExpression(sourceExpression);
  if (!goal.ok || !goal.variable || !integerText.test(goal.coefficient) || !integerText.test(goal.constant) ||
      goal.coefficient === '0' || goal.constant === '0')
    return result('unsupported','This check needs a source expression with one nonzero integer variable term and one nonzero integer constant.');
  const work = parseExpression(answer);
  if (!work.ok)
    return result('unsupported','Enter one supported expression, without an equals sign.');
  if (work.variable !== goal.variable)
    return result('unsupported','Keep the variable from the original expression.');
  const written = answer.replaceAll('−','-');
  const exact = same(work,goal);
  if (simplified.test(written)) {
    return exact
      ? result('expanded','Correct: the expression is equivalent and written as two simplified terms.')
      : result('wrong','This expanded expression is not equivalent to the original.');
  }
  if (!exact)
    return result('unsupported','Write one integer variable term and one integer constant so this check can evaluate the expansion.');
  // Parentheses around individual numbers (e.g. -3 × (-2)) are still
  // arithmetic. A bracket with a sum/difference is not yet expanded.
  const groupWithAddition = /\(\s*[+-]?\s*[^()]*?[\dA-Za-z)]\s*[+-]\s*[^()]+\)/;
  if (groupWithAddition.test(written) ||
      (/[()]/.test(written) && simplified.test(written.replace(/[()]/g,''))))
    return result('finish_expansion','Equivalent so far. Write the two terms without brackets.');
  return result('finish_arithmetic','Equivalent so far. Finish the arithmetic and combine like terms.');
}

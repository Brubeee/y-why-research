// A separate, conditional form check. Exact solution-set results are never changed.
import { gradeExpansion } from './expansion_form.mjs';
import { parseExpression, verifyRows } from './verify.mjs';

const SOURCE = /^([+-]?[1-9][0-9]{0,2})\s*\(\s*([A-Za-z])\s*([+-])\s*([1-9][0-9]{0,2})\s*\)$/;
const INTEGER = /^[+-]?[0-9]{1,5}$/;
const normalizeMinus = (s) => s.replaceAll('−', '-');
const sides = (row) => normalizeMinus(row.text).split('=').map(part => part.trim());

export function checkOperationClaim({before, after, claim} = {}) {
  const unassessed = {status:'unassessed', exact:null};
  if (claim !== 'expand-left-only' ||
      ![before,after].every(row => row?.confirmed === true && typeof row.text === 'string' && row.text.length <= 180))
    return unassessed;

  // Preserve the checker's own answer; claim fit never upgrades or downgrades it.
  const exact = verifyRows({anchor:before, rows:[after]}).rows[0].status;
  const result = (status) => ({status,exact});
  if (exact !== 'equivalent' && exact !== 'changed') return result('unsupported');
  const [srcLeft,srcRight] = sides(before), [dstLeft,dstRight] = sides(after);
  const source = SOURCE.exec(srcLeft);
  if (!source || Math.abs(Number(source[1])) < 2 || !INTEGER.test(srcRight))
    return result('unsupported');
  if (exact === 'changed') return result('solution-changed');
  // Literal comparison detects a RHS rewrite even when it computes the same value.
  if (srcRight !== dstRight) return result('right-side-rewritten');
  const form = gradeExpansion(dstLeft,srcLeft).status;
  if (form === 'expanded') return result('fits-written-claim');
  if (form === 'finish_expansion' || form === 'finish_arithmetic') return result('unfinished');
  return result('unsupported');
}

const CLAIM_OPERATORS = Object.freeze({ add:'+', subtract:'-', multiply:'*', divide:'/' });

function equationSides(text) {
  const parts = typeof text === 'string' ? text.replaceAll('−','-').split('=') : [];
  return parts.length === 2 ? parts.map(part => part.trim()) : null;
}

function exactConstant(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) return null;
  const parsed = parseExpression(value.trim());
  if (!parsed.ok || parsed.variable !== null || parsed.coefficient !== '0') return null;
  return { text:value.trim(), value:parsed.constant };
}

function sameAffine(left, right) {
  if (!left.ok || !right.ok || left.coefficient !== right.coefficient || left.constant !== right.constant) return false;
  return left.coefficient === '0' || left.variable === right.variable;
}

function appliedExpression(side, claim) {
  return `(${side})${CLAIM_OPERATORS[claim.kind]}(${claim.constant.trim()})`;
}

/**
 * Compare a declared two-sided arithmetic action with each exact side.
 * This is supplemental writing evidence only: `exact` always comes from
 * verifyRows(), and this function never changes a solution-set verdict.
 */
export function checkTwoSidedOperationClaim({before, after, claim} = {}) {
  const unassessed = { status:'unassessed', exact:null };
  if (![before,after].every(row => row?.confirmed === true && typeof row.text === 'string' && row.text.length <= 180))
    return unassessed;

  const exact = verifyRows({anchor:before,rows:[after]}).rows[0].status;
  const result = (status, extra = {}) => ({ status, exact, ...extra });
  if (exact !== 'equivalent' && exact !== 'changed') return result('blocked');
  if (claim?.kind === 'other') return result('abstain');
  if (!Object.hasOwn(CLAIM_OPERATORS, claim?.kind)) return result('unsupported');

  const constant = exactConstant(claim.constant);
  if (!constant) return result('unsupported');
  if ((claim.kind === 'multiply' || claim.kind === 'divide') && constant.value === '0')
    return result('unsupported');

  const sourceSides = equationSides(before.text), writtenSides = equationSides(after.text);
  if (!sourceSides || !writtenSides) return result('blocked');
  const effectiveClaim = { ...claim, constant:constant.text };
  const leftExpected = parseExpression(appliedExpression(sourceSides[0],effectiveClaim));
  const rightExpected = parseExpression(appliedExpression(sourceSides[1],effectiveClaim));
  const leftWritten = parseExpression(writtenSides[0]);
  const rightWritten = parseExpression(writtenSides[1]);
  if (![leftExpected,rightExpected,leftWritten,rightWritten].every(form => form.ok))
    return result('abstain');

  const leftMatches = sameAffine(leftExpected,leftWritten);
  const rightMatches = sameAffine(rightExpected,rightWritten);
  if (leftMatches && rightMatches)
    return result('consistent',{ comparison:{left:true,right:true} });

  // Start with the left when it fails; otherwise point to the right only after
  // exactly verifying that the declared operation fits the left side.
  const side = leftMatches ? 'right' : 'left';
  const sideIndex = side === 'left' ? 0 : 1;
  return result(side + '-mismatch',{
    focusSide:side,
    focusExpression:appliedExpression(sourceSides[sideIndex],effectiveClaim),
    writtenSide:writtenSides[sideIndex],
    comparison:{left:leftMatches,right:rightMatches},
  });
}

export function formatOperationExpression(side, claim) {
  const source = String(side ?? '').trim().replaceAll('-','−');
  const value = String(claim?.constant ?? '').trim().replaceAll('-','−');
  if (!source || !value || !Object.hasOwn(CLAIM_OPERATORS,claim?.kind)) return '';
  const numeric = text => /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text);
  const left = numeric(source) ? source : `(${source})`;
  const right = numeric(value) ? value : `(${value})`;
  const symbol = {add:'+',subtract:'−',multiply:'×',divide:'÷'}[claim.kind];
  return claim.kind === 'add' || claim.kind === 'subtract'
    ? `${left}${symbol}${right}`
    : `${left} ${symbol} ${right}`;
}

// Offline research only. The application and its exact checker do not use this.
import { gradeExpansion } from './expansion_form.mjs';
import { verifyRows } from './verify.mjs';

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

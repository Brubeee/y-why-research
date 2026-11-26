// A separate, conditional form check. Exact solution-set results are never changed.
import { gradeExpansion } from './expansion_form.mjs';
import { parseEquation, parseExpression, verifyRows } from './verify.mjs';

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

function exactActionTerm(value, kind, variable) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) return null;
  const parsed = parseExpression(value.trim());
  if (!parsed.ok || (parsed.variable && variable && parsed.variable !== variable)) return null;
  if ((kind === 'multiply' || kind === 'divide') &&
      (parsed.variable !== null || parsed.coefficient !== '0' || parsed.constant === '0')) return null;
  return { text:value.trim(), parsed };
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

  const sourceSides = equationSides(before.text), writtenSides = equationSides(after.text);
  if (!sourceSides || !writtenSides) return result('blocked');
  const sourceEquation = parseEquation(before.text);
  if (!sourceEquation.ok) return result('blocked');
  const actionTerm = exactActionTerm(claim.constant,claim.kind,sourceEquation.variable);
  if (!actionTerm) return result('unsupported');
  const effectiveClaim = { ...claim, constant:actionTerm.text };
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

  if (!leftMatches && !rightMatches)
    return result('both-mismatch',{ comparison:{left:false,right:false} });

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

// Typed-only repair helpers live in this already-routed shared module so the
// OCR server's existing static allowlist does not need to change.
const typedRepair = (() => {
  const BALANCE = new Set(['add','subtract','multiply','divide']);
  const DISTRIBUTION = new Set(['distribution-left','distribution-right']);

  function equationSides(text) {
    if (typeof text !== 'string') return null;
    const parts = text.replaceAll('−','-').split('=');
    return parts.length === 2 && parts.every(part => part.trim()) ? parts.map(part => part.trim()) : null;
  }
  function affine(text) {
    const parsed = parseExpression(text);
    return parsed.ok ? parsed : null;
  }
  function sameAffine(leftText, rightText) {
    const left = affine(leftText), right = affine(rightText);
    if (!left || !right || left.coefficient !== right.coefficient || left.constant !== right.constant) return false;
    return left.coefficient === '0' || left.variable === right.variable;
  }
  function sameWrittenSide(left, right) {
    const normalize = text => text.replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/').replace(/\s+/g,'');
    return normalize(left) === normalize(right);
  }
  function binomialProducts(text) {
    if (typeof text !== 'string') return [];
    const source = text.replaceAll('−','-').replaceAll('×','*');
    const out = [];
    const matchingOpen = close => {
      let depth=0;
      for (let index=close;index>=0;index--) {
        if (source[index]===')') depth++;
        else if (source[index]==='(' && --depth===0) return index;
      }
      return -1;
    };
    const trailingFactor = prefix => {
      const end=prefix.length;
      if (!end) return '';
      if (prefix[end-1]===')') {
        const open=matchingOpen(end-1);
        return open<0?'':prefix.slice(open,end);
      }
      let start=end-1;
      while (start>=0 && /[A-Za-z0-9./]/.test(prefix[start])) start--;
      if (start>=0 && /[+\-]/.test(prefix[start])) {
        const prior=prefix.slice(0,start).trimEnd().at(-1);
        if (!prior || /[=+\-*/(]/.test(prior)) start--;
      }
      return prefix.slice(start+1,end);
    };
    for (let open=0;open<source.length;open++) {
      if (source[open]!=='(') continue;
      let depth=1,close=open+1;
      for (;close<source.length&&depth>0;close++) {
        if (source[close]==='(') depth++;
        else if (source[close]===')') depth--;
      }
      if (depth!==0) continue;
      close--;
      const inner=source.slice(open+1,close);
      if (!/[A-Za-z]/.test(inner) || !/[+\-]/.test(inner)) continue;
      const prefix=source.slice(0,open).trimEnd();
      if (!prefix) continue;
      const last=prefix.at(-1);
      let factorText='';
      if (last==='*') factorText=trailingFactor(prefix.slice(0,-1).trimEnd());
      else if (last===')' || /[A-Za-z0-9.]$/.test(last)) factorText=trailingFactor(prefix);
      else if (last==='-') {
        const prior=prefix.slice(0,-1).trimEnd().at(-1);
        if (!prior || /[=+\-*/(]/.test(prior)) out.push(source.slice(open,close+1));
      }
      if (factorText) {
        const factor=parseExpression(factorText);
        if (factor.ok && factor.variable===null && factor.coefficient==='0')
          out.push(source.slice(open,close+1));
      }
      open=close;
    }
    return out;
  }
  function changedSides(beforeText, afterText) {
    const before = equationSides(beforeText), after = equationSides(afterText);
    if (!before || !after) return null;
    return before.map((side,index) => !sameAffine(side,after[index]));
  }
  function checkedPair(before, candidate) {
    if (![before,candidate].every(row => row?.confirmed === true && typeof row.text === 'string'))
      return {status:'unconfirmed',row:null};
    const result = verifyRows({anchor:before,rows:[candidate]});
    return {status:result.rows[0]?.status ?? 'unsupported',row:result.rows[0] ?? null};
  }

  function classifyTypedStep({before, observed, claim}={}) {
    const exact = checkedPair(before,observed).status;
    if (exact !== 'changed') return {status:'blocked',reason:exact,exact};
    if (claim?.kind === 'other' || claim?.kind === 'combined')
      return {status:'neutral',reason:claim.kind,exact};

    if (BALANCE.has(claim?.kind)) {
      const check = checkTwoSidedOperationClaim({before,after:observed,claim});
      const comparison = check.comparison;
      if (comparison && comparison.left !== comparison.right) {
        return {status:'actionable',reason:'one-side-mismatch',exact,focusSide:check.focusSide,
          comparison,operation:claim.kind};
      }
      if (check.status === 'both-mismatch')
        return {status:'neutral',reason:'both-sides-mismatch',exact,comparison};
      return {status:'neutral',reason:check.status,exact,comparison};
    }

    if (DISTRIBUTION.has(claim?.kind)) {
      const side = claim.kind === 'distribution-left' ? 'left' : 'right';
      const index = side === 'left' ? 0 : 1;
      const beforeSides = equationSides(before.text);
      const changed = changedSides(before.text,observed.text);
      if (beforeSides && changed?.filter(Boolean).length === 1 && changed[index] &&
          binomialProducts(beforeSides[index]).length === 1)
        return {status:'actionable',reason:'single-distribution-side',exact,focusSide:side,operation:claim.kind};
      return {status:'neutral',reason:'ambiguous-distribution-step',exact};
    }

    return {status:'neutral',reason:'unsupported-action',exact};
  }

  function checkTypedRepair({before, candidate, claim}={}) {
    const pair = checkedPair(before,candidate);
    if (pair.status !== 'equivalent') {
      return {status:pair.status === 'changed' ? 'not-equivalent' : 'blocked',exact:pair.status};
    }

    if (BALANCE.has(claim?.kind)) {
      const operation = checkTwoSidedOperationClaim({before,after:candidate,claim});
      if (['unsupported','blocked','unassessed'].includes(operation.status))
        return {status:'blocked',exact:'equivalent',operation:operation.status};
      return operation.status === 'consistent'
        ? {status:'supported',exact:'equivalent',operation:'consistent'}
        : {status:'equivalent-other',exact:'equivalent',operation:operation.status,
            comparison:operation.comparison};
    }

    if (DISTRIBUTION.has(claim?.kind)) {
      const side = claim.kind === 'distribution-left' ? 'left' : 'right';
      const targetIndex = side === 'left' ? 0 : 1, otherIndex = 1 - targetIndex;
      const sourceSides = equationSides(before.text), candidateSides = equationSides(candidate?.text);
      if (!sourceSides || !candidateSides) return {status:'blocked',exact:'equivalent'};
      const source = parseEquation(before.text);
      const targetExpanded = sameAffine(sourceSides[targetIndex],candidateSides[targetIndex]) &&
        binomialProducts(candidateSides[targetIndex]).length === 0;
      const otherKept = sameWrittenSide(sourceSides[otherIndex],candidateSides[otherIndex]);
      return targetExpanded && otherKept
        ? {status:'supported',exact:'equivalent',operation:'distribution'}
        : {status:'equivalent-other',exact:'equivalent',operation:'not-demonstrated',
            sourceSupported:source.ok && binomialProducts(sourceSides[targetIndex]).length === 1};
    }

    return {status:'neutral-equivalent',exact:'equivalent'};
  }

  function checkNeutralIntermediate({before,candidate}={}) {
    const pair = checkedPair(before,candidate);
    return pair.status === 'equivalent'
      ? {status:'equivalent-unattributed',exact:'equivalent'}
      : {status:pair.status === 'changed' ? 'not-equivalent' : 'blocked',exact:pair.status};
  }

  return {classifyTypedStep,checkTypedRepair,checkNeutralIntermediate,
    hasUnexpandedBinomialProduct:text => binomialProducts(text).length > 0};
})();

export const classifyTypedStep = typedRepair.classifyTypedStep;
export const checkTypedRepair = typedRepair.checkTypedRepair;
export const checkNeutralIntermediate = typedRepair.checkNeutralIntermediate;
export const hasUnexpandedBinomialProduct = typedRepair.hasUnexpandedBinomialProduct;

// Transfer attempts stay local to the active page and store verdict metadata,
// never the student's response string.
const typedRetry = (() => {
  const freeze = task => Object.freeze({...task,claim:Object.freeze({...task.claim})});
  const tasks = Object.freeze({
    distribution:freeze({
      id:'distribution-outside-addend-v1',
      source:'3−5(2z+1)=8', target:'-10z-2=8',
      claim:{kind:'distribution-left'},
      instruction:'Fresh equation: distribute the factor on the left and simplify one intermediate line.',
      hint:'Multiply −5 by both terms inside the brackets, then combine with the outside 3.',
    }),
    balance:freeze({
      id:'balance-variable-both-sides-v1',
      source:'3m+5=2m+11', target:'m+5=11',
      claim:{kind:'subtract',constant:'2m'},
      instruction:'Fresh equation: subtract 2m from both sides and write one intermediate equation.',
      hint:'Subtract 2m from each complete side. Keep the constants on their current sides.',
    }),
    fraction:freeze({
      id:'fraction-variable-both-sides-v1',
      source:'2(r+4)/3=r+1', target:'2(r+4)=3(r+1)',
      claim:{kind:'multiply',constant:'3'},
      instruction:'Fresh equation: multiply both sides by 3 and write one intermediate equation.',
      hint:'Multiply the full left and right expressions by 3, including the grouped terms.',
    }),
  });
  const byClaim = Object.freeze({
    'distribution-left':'distribution','distribution-right':'distribution',
    add:'balance',subtract:'balance',multiply:'fraction',divide:'fraction',
  });
  const maxEvents = 120;

  const alternates = Object.freeze({
    distribution:freeze({
      id:'distribution-right-from-difference-v1',
      source:'11=8−2(3−q)', target:'11=2+2q',
      claim:{kind:'distribution-right'},
      instruction:'Distribute the factor on the right and simplify one intermediate line.',
      hint:'Distribute −2 to both terms inside the bracket; then combine the constants on the right.',
    }),
    balance:freeze({
      id:'balance-constant-grouped-right-v1',
      source:'19=2+3(2−k)+k', target:'17=3(2−k)+k',
      claim:{kind:'subtract',constant:'2'},
      instruction:'Subtract 2 from both sides and write one intermediate equation.',
      hint:'Subtract 2 from each complete side, including the right side with the bracket.',
    }),
    fraction:freeze({
      id:'fraction-variable-grouped-right-v1',
      source:'9+u=(u−2)/2', target:'2(9+u)=u−2',
      claim:{kind:'multiply',constant:'2'},
      instruction:'Multiply both sides by 2 and write one intermediate equation.',
      hint:'Multiply the entire left side and the entire fraction on the right by 2.',
    }),
  });
  const bank = [...Object.values(tasks),...Object.values(alternates)];
  // A deliberately conservative written-template exclusion. This is not
  // algebraic equivalence: sharing an answer does not make two tasks the same.
  function templateKey(text) {
    return text.replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/')
      .replace(/\s+/g,'').replace(/[A-Za-z]/g,'v').replace(/(?:\d+\.?\d*|\.\d+)/g,'#')
      .replace(/(#[*])(?=[v(])/g,'#').split('=').sort().join('=');
  }
  function freshTaskForClaim(claim,{confirmedRows,repair,seenIds=[]}={}) {
    const key = byClaim[claim?.kind];
    if (!key || !Array.isArray(confirmedRows) || confirmedRows.length < 2 ||
        !confirmedRows.every(row => row?.confirmed && typeof row.text==='string' && parseEquation(row.text).ok) ||
        typeof repair !== 'string' || !parseEquation(repair).ok) return null;
    const excluded = new Set([...confirmedRows.map(row=>templateKey(row.text)),templateKey(repair)]);
    return [tasks[key],alternates[key]].find(task=>!seenIds.includes(task.id) &&
      !excluded.has(templateKey(task.source)) && !excluded.has(templateKey(task.target))) ?? null;
  }
  function createTypedRetry(task) {
    if (!task || !bank.some(item => item.id === task.id)) return null;
    return {taskId:task.id,hintExposed:false,firstResponse:null,firstParseable:null,
      firstSuccess:null,lastEvent:null,events:[]};
  }
  function taskFor(state) {
    const task = bank.find(item => item.id === state?.taskId);
    if (!task || !Array.isArray(state?.events)) throw new TypeError('A supported typed retry state is required.');
    return task;
  }
  function exposeTypedRetryHint(state) {
    taskFor(state);
    if (state.hintExposed || !state.firstResponse || state.events.length >= maxEvents) return state;
    const event={kind:'hint',sequence:state.events.length+1,status:'hint-exposed'};
    return {...state,hintExposed:true,lastEvent:event,events:[...state.events,event]};
  }
  function recordTypedRetry(state,{text}={}) {
    const task=taskFor(state);
    if (typeof text !== 'string' || !text.trim() || state.events.length >= maxEvents) return state;
    const candidate={text:text.trim(),confirmed:true};
    const result=typedRepair.checkTypedRepair({before:{text:task.source,confirmed:true},candidate,claim:task.claim});
    const parseable = parseEquation(candidate.text).ok;
    const event={kind:'attempt',sequence:state.events.length+1,status:result.status,
      exact:result.exact,parseable,
      mode:state.hintExposed?'hint-aided':state.firstResponse?'after-feedback':'no-hint'};
    const success=result.status==='supported';
    return {
      ...state,
      firstResponse:state.firstResponse??(event.parseable?event:null),
      firstParseable:state.firstParseable??(event.parseable?event:null),
      firstSuccess:state.firstSuccess??(success?event:null),
      lastEvent:event,
      events:[...state.events,event],
    };
  }

  return {tasks,freshTaskForClaim,createTypedRetry,exposeTypedRetryHint,recordTypedRetry};
})();

export const TYPED_RETRY_TASKS = typedRetry.tasks;
export const freshTaskForClaim = typedRetry.freshTaskForClaim;
export const createTypedRetry = typedRetry.createTypedRetry;
export const exposeTypedRetryHint = typedRetry.exposeTypedRetryHint;
export const recordTypedRetry = typedRetry.recordTypedRetry;

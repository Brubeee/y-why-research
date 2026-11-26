import {gradeExpansion} from './expansion_form.mjs';
import {checkTypedRepair, delayedTaskById} from './operation_claim.mjs';
import {parseEquation, parseExpression} from './verify.mjs';

export const REVIEW_KEY = 'ywhy.paper-lab.delayed-review';
export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;
const ITEM = 'negative-distribution-delayed-w-v1';
const PROMPT = '3−5(3w−4)';
const VERSION = 1;
const OUTCOMES = ['correct','not-yet','unfinished','outside-supported-form'];
const EQ_OUTCOMES = ['correct','not-yet','equivalent-other','outside-supported-form'];
const BLOCKED = Object.freeze({status:'unavailable'});
const time = now => {
  const v = now();
  if (!Number.isSafeInteger(v) || v < 0 || v > 8.64e15 - REVIEW_DELAY_MS)
    throw new Error('Invalid clock');
  return v;
};
const valid = x => x && typeof x === 'object' &&
  Object.keys(x).sort().join(',') === 'dueAt,item,outcome,version' &&
  Number.isSafeInteger(x.dueAt) && x.dueAt >= REVIEW_DELAY_MS && x.dueAt <= 8.64e15 &&
  ((x.version === VERSION && x.item === ITEM && (x.outcome === null || OUTCOMES.includes(x.outcome))) ||
   (x.version === 2 && delayedTaskById(x.item) !== null && (x.outcome === null || EQ_OUTCOMES.includes(x.outcome))));
const keyFor = x => x.version+':'+x.item+':'+x.dueAt;
const view = (x, t) => x.outcome !== null
  ? {status:'complete', outcome:x.outcome, ...(x.version===2 ? {format:'equation'} : {})}
  : t < x.dueAt
    ? {status:'waiting', dueAt:x.dueAt}
    : x.version === VERSION
      ? {status:'ready', prompt:PROMPT}
      : {status:'ready', format:'equation', prompt:delayedTaskById(x.item).source,
        instruction:delayedTaskById(x.item).instruction};

export function createDelayedReview({store, now = Date.now} = {}) {
  const read = () => {
    const raw = store().getItem(REVIEW_KEY);
    if (raw === null) return null;
    if (typeof raw !== 'string' || raw.length > 256) throw new Error('Invalid record');
    const record = JSON.parse(raw);
    if (!valid(record)) throw new Error('Unsupported record');
    return record;
  };
  const write = x => {
    const value = JSON.stringify(x);
    store().setItem(REVIEW_KEY,value);
    if (store().getItem(REVIEW_KEY)!==value) throw new Error('Save failed');
  };
  const safe = fn => {
    try { return fn(); } catch { return BLOCKED; }
  };
  return Object.freeze({
    inspect: ({includeKey=false}={}) => safe(() => {
      const x=read();
      if (!x) return {status:'empty'};
      const state=view(x,time(now));
      return includeKey && state.status==='ready' ? {...state,key:keyFor(x)} : state;
    }),
    optIn: ({consent,item=ITEM} = {}) => {
      if (consent !== true) return {status:'not-consented'};
      return safe(() => {
        const x=read(), t=time(now);
        if (x) return view(x,t);
        if (item!==ITEM && !delayedTaskById(item)) return BLOCKED;
        const next={version:item===ITEM ? VERSION : 2,item,dueAt:t+REVIEW_DELAY_MS,outcome:null};
        write(next);
        return view(next,t);
      });
    },
    submit: (text,{expectedKey}={}) => safe(() => {
      const x=read();
      if (!x) return {status:'empty'};
      const t=time(now), state=view(x,t);
      if (state.status!=='ready') return state;
      if (expectedKey!==undefined && expectedKey!==keyFor(x))
        return {...state,stale:true};
      const equation=x.version===2;
      if (typeof text!=='string' || !(equation?parseEquation(text):parseExpression(text)).ok)
        return {...state,needsReadable:true};
      let outcome;
      if (equation) {
        const task=delayedTaskById(x.item);
        const grade=checkTypedRepair({before:{confirmed:true,text:task.source},candidate:{confirmed:true,text},claim:task.claim}).status;
        outcome=({supported:'correct','not-equivalent':'not-yet','equivalent-other':'equivalent-other'})[grade] ?? 'outside-supported-form';
      } else {
        const grade=gradeExpansion(text,PROMPT).status;
        outcome = grade==='expanded' ? 'correct' : grade==='wrong' ? 'not-yet'
          : grade.startsWith('finish_') ? 'unfinished' : 'outside-supported-form';
      }
      const next={...x,outcome};
      // Never give post-answer feedback unless the first outcome was saved.
      if (JSON.stringify(read())!==JSON.stringify(x)) return BLOCKED;
      write(next);
      return view(next,t);
    }),
    clear: () => safe(() => {
      store().removeItem(REVIEW_KEY);
      if (store().getItem(REVIEW_KEY)!==null) throw new Error('Clear failed');
      return {status:'empty'};
    }),
  });
}

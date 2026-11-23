import {gradeExpansion} from './expansion_form.mjs';
import {parseExpression} from './verify.mjs';

export const REVIEW_KEY = 'ywhy.paper-lab.delayed-review';
export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;
const ITEM = 'negative-distribution-delayed-w-v1';
const PROMPT = '3−5(3w−4)';
const VERSION = 1;
const OUTCOMES = ['correct','not-yet','unfinished','outside-supported-form'];
const BLOCKED = Object.freeze({status:'unavailable'});
const time = now => {
  const v = now();
  if (!Number.isSafeInteger(v) || v < 0 || v > 8.64e15 - REVIEW_DELAY_MS)
    throw new Error('Invalid clock');
  return v;
};
const valid = x => x && typeof x === 'object' &&
  Object.keys(x).sort().join(',') === 'dueAt,item,outcome,version' &&
  x.version === VERSION && x.item === ITEM && Number.isSafeInteger(x.dueAt) &&
  x.dueAt >= REVIEW_DELAY_MS && x.dueAt <= 8.64e15 &&
  (x.outcome === null || OUTCOMES.includes(x.outcome));
const view = (x, t) => x.outcome !== null
  ? {status:'complete', outcome:x.outcome}
  : t < x.dueAt
    ? {status:'waiting', dueAt:x.dueAt}
    : {status:'ready', prompt:PROMPT};

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
    inspect: () => safe(() => { const x=read(); return x ? view(x,time(now)) : {status:'empty'}; }),
    optIn: ({consent} = {}) => {
      if (consent !== true) return {status:'not-consented'};
      return safe(() => {
        const x=read(), t=time(now);
        if (x) return view(x,t);
        const next={version:VERSION,item:ITEM,dueAt:t+REVIEW_DELAY_MS,outcome:null};
        write(next);
        return view(next,t);
      });
    },
    submit: text => safe(() => {
      const x=read();
      if (!x) return {status:'empty'};
      const t=time(now), state=view(x,t);
      if (state.status!=='ready') return state;
      if (typeof text!=='string' || !parseExpression(text).ok)
        return {...state,needsReadable:true};
      const grade=gradeExpansion(text,PROMPT).status;
      const outcome = grade==='expanded' ? 'correct' : grade==='wrong' ? 'not-yet'
        : grade.startsWith('finish_') ? 'unfinished' : 'outside-supported-form';
      const next={...x,outcome};
      // Never give post-answer feedback unless the first outcome was saved.
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

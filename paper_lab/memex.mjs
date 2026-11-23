/** In-memory mistake-to-retry chronology. No raw entered expressions retained. */
import {gradeExpansion} from './expansion_form.mjs';
import {parseExpression} from './verify.mjs';

export const RETRY_TASK = Object.freeze({
  id:'negative-distribution-outside-constant-v1',
  prompt:'2−4(2z−3)',
  instruction:'Expand and simplify without an equals sign.',
  hint:'Treat the multiplier as negative. Apply it to every term inside the brackets, then combine the constants.',
});
const CANDIDATES = ['first_term_only','negative_product_sign_error'];
const AT_LIMIT = 120;

function takeTime(now, previous=null) {
  if (typeof now!=='function') throw new TypeError('Expected a clock function.');
  const ms=now();
  if(!Number.isSafeInteger(ms)||ms<0) throw new TypeError('Expected a nonnegative timestamp in milliseconds.');
  // Device clocks can move backwards. Order remains explicit via sequence.
  return Math.max(ms,previous??0);
}

export function createRetry({diagnostic,now=Date.now}={}) {
  // The caller supplies only diagnostics for a confirmed, verifier-flagged step.
  const p=diagnostic?.probe;
  if (diagnostic?.status!=='ambiguous'||!p||
      !Array.isArray(diagnostic.candidates)||diagnostic.candidates.length!==CANDIDATES.length||
      !CANDIDATES.every(id=>diagnostic.candidates.includes(id) && typeof p.predictions?.[id]==='string')||
      typeof p.input!=='string'||typeof p.correct!=='string'||
      new Set([p.correct,...CANDIDATES.map(id=>p.predictions[id])]).size!==3)
    return null;
  return {
    taskId:RETRY_TASK.id, createdAt:takeTime(now), hintExposedAt:null,
    firstParseable:null, firstSuccess:null, lastEvent:null, events:[],
  };
}

function requireState(state) {
  if (state?.taskId!==RETRY_TASK.id || !Array.isArray(state.events))
    throw new TypeError('A supported retry state is required.');
}

export function exposeRetryHint(state,{now=Date.now}={}) {
  requireState(state);
  if (state.hintExposedAt!==null || state.events.length>=AT_LIMIT) return state;
  const at=takeTime(now,state.lastEvent?.at??state.createdAt);
  const event={kind:'hint',sequence:state.events.length+1,at,
    status:'hint_exposed',message:RETRY_TASK.hint};
  return {...state,hintExposedAt:at,lastEvent:event,events:[...state.events,event]};
}

export function recordRetry(state,{text}={}, {now=Date.now}={}) {
  requireState(state);
  if(typeof text!=='string'||!text.trim()||state.events.length>=AT_LIMIT) return state;
  const parsed=parseExpression(text).ok;
  const grade=gradeExpansion(text,RETRY_TASK.prompt);
  const success=grade.status==='expanded';
  const assisted=state.hintExposedAt!==null;
  const at=takeTime(now,state.lastEvent?.at??state.createdAt);
  const event={kind:'attempt',sequence:state.events.length+1,at,status:grade.status,
    message:grade.message,parseable:parsed,hintExposed:assisted,
    mode:success?(assisted?'hint-aided':'independent'):null};
  return {
    ...state,
    firstParseable:state.firstParseable??(parsed?event:null),
    firstSuccess:state.firstSuccess??(success?event:null),
    lastEvent:event, events:[...state.events,event],
  };
}

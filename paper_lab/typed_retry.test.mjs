import test from 'node:test';
import assert from 'node:assert/strict';
import {TYPED_RETRY_TASKS,freshTaskForClaim,createTypedRetry,exposeTypedRetryHint,recordTypedRetry} from './operation_claim.mjs';

const attempt=(state,text)=>recordTypedRetry(state,{text});

test('fresh tasks use different structures and are selected only after a supported repair family',()=>{
  assert.equal(freshTaskForClaim({kind:'distribution-left'}),TYPED_RETRY_TASKS.distribution);
  assert.equal(freshTaskForClaim({kind:'subtract',constant:'6'}),TYPED_RETRY_TASKS.balance);
  assert.equal(freshTaskForClaim({kind:'divide',constant:'2'}),TYPED_RETRY_TASKS.fraction);
  assert.equal(freshTaskForClaim({kind:'combined'}),null);
  assert.equal(createTypedRetry({id:'unknown'}),null);
  const ids=Object.values(TYPED_RETRY_TASKS).map(task=>task.id);
  assert.equal(new Set(ids).size,3);
  assert.match(TYPED_RETRY_TASKS.distribution.source,/^3.*5\(2z\+1\)=8$/);
  assert.match(TYPED_RETRY_TASKS.balance.source,/3m\+5=2m\+11/);
  assert.match(TYPED_RETRY_TASKS.fraction.source,/2\(r\+4\)\/3=r\+1/);
});

test('first response is recorded before help and a later fix stays hint-aided',()=>{
  let state=createTypedRetry(TYPED_RETRY_TASKS.balance);
  assert.equal(exposeTypedRetryHint(state),state,'help is closed until an attempt exists');
  state=attempt(state,'m+5=10');
  assert.equal(state.firstResponse.status,'not-equivalent');
  assert.equal(state.firstResponse.mode,'no-hint');
  assert.equal(state.firstSuccess,null);
  state=exposeTypedRetryHint(state);
  state=attempt(state,'m+5=11');
  assert.equal(state.firstResponse.status,'not-equivalent');
  assert.equal(state.firstSuccess.status,'supported');
  assert.equal(state.firstSuccess.mode,'hint-aided');
  assert.deepEqual(state.events.map(event=>event.kind),['attempt','hint','attempt']);
  assert.doesNotMatch(JSON.stringify(state),/m\+5=10|m\+5=11/);
});

test('later help cannot relabel an independent correct response',()=>{
  let state=createTypedRetry(TYPED_RETRY_TASKS.balance);
  state=attempt(state,'m+5=11');
  state=exposeTypedRetryHint(state);
  state=attempt(state,'m+5=11');
  assert.equal(state.firstResponse.mode,'no-hint');
  assert.equal(state.firstSuccess.mode,'no-hint');
  assert.equal(state.lastEvent.mode,'hint-aided');
});

test('a later correction before a hint is labeled after feedback, not as independent',()=>{
  let state=createTypedRetry(TYPED_RETRY_TASKS.balance);
  state=attempt(state,'m+5=10');
  assert.equal(state.firstResponse.mode,'no-hint');
  state=attempt(state,'m+5=11');
  assert.equal(state.firstResponse.status,'not-equivalent');
  assert.equal(state.firstSuccess.mode,'after-feedback');
  assert.equal(state.lastEvent.mode,'after-feedback');
  state=exposeTypedRetryHint(state);
  state=attempt(state,'m+5=11');
  assert.equal(state.firstSuccess.mode,'after-feedback');
  assert.equal(state.lastEvent.mode,'hint-aided');
});

test('an unparseable retry line is visible but cannot unlock a hint or replace the first evaluable response',()=>{
  let state=createTypedRetry(TYPED_RETRY_TASKS.fraction);
  state=attempt(state,'x^2=4');
  assert.equal(state.firstResponse,null);
  assert.equal(state.firstParseable,null);
  assert.equal(state.lastEvent.status,'blocked');
  assert.equal(exposeTypedRetryHint(state),state,'an unparseable line cannot unlock help');
  state=attempt(state,'2(r+4)=3(r+1)');
  assert.equal(state.firstResponse.status,'supported');
  assert.equal(state.firstResponse.mode,'no-hint');
  assert.equal(state.firstParseable.status,'supported');
  assert.equal(state.firstSuccess.mode,'no-hint');
  assert.doesNotMatch(JSON.stringify(state),/x\^2=4|2\(r\+4\)=3\(r\+1\)/);
});

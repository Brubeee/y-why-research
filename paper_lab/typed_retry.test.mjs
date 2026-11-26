import test from 'node:test';
import assert from 'node:assert/strict';
import {TYPED_RETRY_TASKS,freshTaskForClaim,delayedTaskForClaim,checkTypedRepair,createTypedRetry,exposeTypedRetryHint,recordTypedRetry} from './operation_claim.mjs';

const attempt=(state,text)=>recordTypedRetry(state,{text});

test('fresh tasks use different structures and are selected only after a supported repair family',()=>{
  const context={confirmedRows:[{text:'2x=8',confirmed:true},{text:'x=3',confirmed:true}],repair:'x=4'};
  assert.equal(freshTaskForClaim({kind:'distribution-left'},context),TYPED_RETRY_TASKS.distribution);
  assert.equal(freshTaskForClaim({kind:'subtract',constant:'6'},context),TYPED_RETRY_TASKS.balance);
  assert.equal(freshTaskForClaim({kind:'divide',constant:'2'},context),TYPED_RETRY_TASKS.fraction);
  assert.equal(freshTaskForClaim({kind:'combined'},context),null);
  assert.equal(freshTaskForClaim({kind:'subtract'}),null);
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

test('retries exclude exact, renamed and number-swapped written templates and already exposed tasks',()=>{
  for (const [kind,rows,repair,answer,alternate] of [
    ['subtract',[' 8 n + 4 = 5 n + 10','3n+4=9'],'3n+4=10','17=3(2−k)+k','balance-constant-grouped-right-v1'],
    ['multiply',['2(r+4)/3=r+1','2(r+4)=3r+1'],'2(r+4)=3(r+1)','2(9+u)=u−2','fraction-variable-grouped-right-v1'],
    ['distribution-left',['3−5(2z+1)=8','3−10z+5=8'],'−10z−2=8','11=2+2q','distribution-right-from-difference-v1'],
  ]) {
    const context={confirmedRows:rows.map(text=>({text,confirmed:true})),repair};
    const task=freshTaskForClaim({kind},context);
    assert.equal(task?.id,alternate);
    assert.equal(attempt(createTypedRetry(task),answer).firstSuccess?.mode,'no-hint');
    assert.equal(freshTaskForClaim({kind},{...context,seenIds:[alternate]}),null);
    assert.equal(freshTaskForClaim({kind},{...context,confirmedRows:[...context.confirmedRows,{text:task.source,confirmed:true}]}),null);
  }
});

test('one delayed item per family is distinct from both the prior work and immediate practice',()=>{
  for(const [kind,practiceId,answer] of [
    ['subtract','balance-variable-both-sides-v1','4(2s+3)+12=3s'],
    ['distribution-left','distribution-outside-addend-v1','a+4=16−6a'],
    ['divide','fraction-variable-both-sides-v1','5h−7=2(h+3)'],
  ]){
    const context={confirmedRows:[{text:'2x=8',confirmed:true},{text:'x=3',confirmed:true}],repair:'x=4',practiceId};
    const task=delayedTaskForClaim({kind},context);
    assert.ok(task);
    assert.equal(checkTypedRepair({before:{text:task.source,confirmed:true},candidate:{text:answer,confirmed:true},claim:task.claim}).status,'supported');
    assert.equal(delayedTaskForClaim({kind},{...context,practiceId:'unknown'}),null);
    assert.equal(delayedTaskForClaim({kind},{...context,
      confirmedRows:[...context.confirmedRows,{text:task.source,confirmed:true}]}),null);
  }
});

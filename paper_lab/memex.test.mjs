import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseStep} from './diagnostic.mjs';
import {createRetry,recordRetry,exposeRetryHint,RETRY_TASK} from './memex.mjs';

const dose=()=>diagnoseStep('−(x−4)=12','−x−4=12');
const seed=(ms=0)=>createRetry({diagnostic:dose(),now:()=>ms});
const answer=(s,text,ms)=>recordRetry(s,{text},{now:()=>ms});

test('only a supported ambiguous distribution collision opens a fresh retry',()=>{
  assert.equal(createRetry({diagnostic:diagnoseStep('x=1','x=2')}),null);
  assert.equal(createRetry({diagnostic:diagnoseStep('−(x−4)=12','−x+4=12')}),null);
  assert.equal(createRetry({diagnostic:{status:'ambiguous',candidates:[],probe:{}}}),null);
  assert.ok(seed());
  assert.equal(RETRY_TASK.prompt,'2−4(2z−3)');
});

test('rejected text and parseable unfinished work do not count as success',()=>{
  const s=seed(100);
  const typed=answer(s,'2+==3',120);
  assert.equal(typed.lastEvent.status,'unsupported');
  assert.equal(typed.lastEvent.parseable,false);
  assert.equal(typed.firstParseable,null);
  const half=answer(typed,'2-8z+12',130);
  assert.equal(half.firstParseable.status,'finish_arithmetic');
  assert.equal(half.firstParseable.at,130);
  assert.equal(half.firstSuccess,null);
  const done=answer(half,'14-8z',150);
  assert.equal(done.firstSuccess.mode,'independent');
  assert.equal(done.firstSuccess.at,150);
  assert.equal(done.firstParseable,half.firstParseable);
  assert.equal(s.events.length,0);
  assert.doesNotMatch(JSON.stringify(done),/14-8z|2-8z\+12|2\+==3/);
});

test('hint timestamp and attempt ordering preserve the aided first success',()=>{
  const wrong=answer(seed(),'13-8z',12);
  assert.equal(wrong.firstParseable.status,'wrong');
  const hinted=exposeRetryHint(wrong,{now:()=>17});
  assert.equal(hinted.hintExposedAt,17);
  assert.equal(hinted.lastEvent.kind,'hint');
  assert.doesNotMatch(hinted.lastEvent.message,/8z|14/);
  assert.equal(exposeRetryHint(hinted,{now:()=>20}),hinted);
  const fixed=answer(hinted,'-8z+14',24);
  const again=answer(fixed,'14-8z',26);
  assert.deepEqual(again.events.map(e=>e.sequence),[1,2,3,4]);
  assert.deepEqual(again.events.map(e=>e.at),[12,17,24,26]);
  assert.equal(again.firstSuccess.mode,'hint-aided');
  assert.equal(again.firstSuccess.at,24);
  assert.equal(again.lastEvent.mode,'hint-aided');
});

test('later hint cannot retroactively relabel earlier independent success',()=>{
  let s=answer(seed(100),'-8z+14',105);
  s=exposeRetryHint(s,{now:()=>102});
  s=answer(s,'14-8z',107);
  assert.equal(s.hintExposedAt,105);
  assert.equal(s.firstSuccess.mode,'independent');
  assert.equal(s.lastEvent.mode,'hint-aided');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDelayedReview, REVIEW_DELAY_MS, REVIEW_KEY} from './delayed_review.mjs';
function harness() {
  let now=100, value=null, writeCount=0, fail=false;
  const storage={getItem(key){assert.equal(key,REVIEW_KEY); return value;},
    setItem(key,newValue){assert.equal(key,REVIEW_KEY); if(fail)throw Error('Storage full'); value=newValue;writeCount++;},
    removeItem(key){assert.equal(key,REVIEW_KEY);if(fail)throw Error('Cannot clear'); value=null;}};
  return {load:()=>createDelayedReview({store:()=>storage,now:()=>now}),
    time:t=>now=t, data:()=>value, replace:v=>value=v, writes:()=>writeCount, fail:()=>fail=true};
}

test('no storage writes before consent; exactly one delayed item; no prompt until the due timestamp', () => {
  const h=harness(), r=h.load(), due=100+REVIEW_DELAY_MS;
  assert.deepEqual(r.inspect(),{status:'empty'});
  assert.deepEqual(r.optIn(),{status:'not-consented'});
  assert.equal(h.writes(),0);
  assert.deepEqual(r.optIn({consent:true}),{status:'waiting',dueAt:due});
  h.time(due-1);
  assert.deepEqual(h.load().inspect(),{status:'waiting',dueAt:due});
  assert.deepEqual(h.load().submit('23-15w'),{status:'waiting',dueAt:due});
  assert.deepEqual(h.load().optIn({consent:true}),{status:'waiting',dueAt:due});
  assert.equal(h.writes(),1);
  h.time(due);
  assert.deepEqual(h.load().inspect(),{status:'ready',prompt:'3−5(3w−4)'});
});

test('records the first parseable result before feedback; reload and repeated submissions never overwrite it', () => {
  const h=harness(), r=h.load();
  r.optIn({consent:true}); h.time(REVIEW_DELAY_MS+100);
  assert.equal(h.load().submit('oops =').needsReadable,true);
  assert.equal(h.writes(),1);
  assert.deepEqual(h.load().submit('-17-15w'),{status:'complete',outcome:'not-yet'});
  assert.deepEqual(h.load().submit('23-15w'),{status:'complete',outcome:'not-yet'});
  assert.deepEqual(h.load().optIn({consent:true}),{status:'complete',outcome:'not-yet'});
  assert.equal(h.writes(),2);
  assert.deepEqual(JSON.parse(h.data()),{version:1,item:'negative-distribution-delayed-w-v1',dueAt:REVIEW_DELAY_MS+100,outcome:'not-yet'});
  assert.doesNotMatch(h.data(),/17|23-15w|3w−4|photo/);
});

test('written form gate distinguishes exact simplified, exact unfinished, and both modeled errors', () => {
  for(const [answer,outcome] of [['23-15w','correct'],['−15w+23','correct'],['3−5(3w−4)','unfinished'],['−1−15w','not-yet'],['−17−15w','not-yet'],['x+3','outside-supported-form']]) {
    const h=harness(), r=h.load(); r.optIn({consent:true});h.time(REVIEW_DELAY_MS+100);
    assert.deepEqual(r.submit(answer),{status:'complete',outcome});
  }
});

test('when consent cannot be stored or outcome/delete fails, no success is reported', () => {
  const no=createDelayedReview({store:()=>{throw new Error('No storage');}});
  assert.deepEqual(no.optIn({consent:true}),{status:'unavailable'});
  const h=harness(),r=h.load();r.optIn({consent:true});h.time(REVIEW_DELAY_MS+100);h.fail();
  assert.deepEqual(r.submit('23-15w'),{status:'unavailable'});
  assert.deepEqual(r.clear(),{status:'unavailable'});
  assert.equal(JSON.parse(h.data()).outcome,null);
});

test('strict version/key validation fails closed until explicitly cleared', () => {
  const h=harness(),r=h.load(); r.optIn({consent:true});
  for(const patch of [{version:2},{item:'future-item'},{outcome:'raw answer'},{extra:'unexpected'}]) {
    h.replace(JSON.stringify({version:1,item:'negative-distribution-delayed-w-v1',dueAt:REVIEW_DELAY_MS+100,outcome:null,...patch}));
    assert.deepEqual(r.inspect(),{status:'unavailable'});
    assert.deepEqual(r.optIn({consent:true}),{status:'unavailable'});
  }
  assert.deepEqual(r.clear(),{status:'empty'});
  assert.equal(h.data(),null);
  assert.deepEqual(h.load().inspect(),{status:'empty'});
});

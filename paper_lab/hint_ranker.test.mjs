import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES} from './hint_ranker_cases.mjs';
import {benchmark} from './hint_ranker.mjs';
test('frozen structural groups never straddle partitions',()=>{
 const d=benchmark();
 assert.deepEqual(d.splitCounts,{fit:10,dev:6,held:14});
 assert.ok(CASES.every(Object.isFrozen));
 for(const a of CASES)for(const b of CASES)
  if(a.group===b.group)assert.equal(a.split,b.split);
 assert.equal(d.calibratedOnDev.total,6);
});
test('verified eligible held cases and guard blocks agree with frozen labels',()=>{
 const d=benchmark();
 for(const r of d.rows){
  assert.equal(r.label==='blocked',!r.eligible,r.id);
  if(!r.eligible)assert.deepEqual([r.strong_rule,r.thresholded,r.abstain],Array(3).fill('blocked'),r.id);
 }
 for(const id of ['h13','h14'])assert.equal(d.rows.find(r=>r.id===id).eligible,false);
 assert.deepEqual(d.metrics.thresholded,{eligible:6,correct:4,acted:4,wrong:0,abstained:2,blocked:8,gate_errors:0});
 assert.equal(d.metrics.strong_rule.correct,6);
});

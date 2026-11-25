import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseStep } from './diagnostic.mjs';
import { FROZEN_DIAGNOSTIC_CASES } from './diagnostic_studio_cases.mjs';
import { verifyRows } from './verify.mjs';

const actionFor = item => {
  const checked = verifyRows({ anchor:item.anchor, rows:item.rows });
  const changed = checked.rows.findIndex(row => row.status === 'changed');
  if (changed < 0) return { action:'abstain', diagnosis:null };
  const chain = [item.anchor,...item.rows];
  const diagnosis = diagnoseStep(chain[changed].text,chain[changed+1].text);
  return { action:diagnosis.status === 'ambiguous' && diagnosis.probe ? 'retry' : 'clarify', diagnosis };
};

test('frozen synthetic families keep number-swapped siblings together',()=>{
  const siblings=FROZEN_DIAGNOSTIC_CASES.filter(item => item.family==='negative-distribution-collision');
  assert.equal(siblings.length,3);
  assert.ok(siblings.every(item => item.expected==='retry'));
  assert.ok(FROZEN_DIAGNOSTIC_CASES.every(Object.isFrozen));
  assert.ok(FROZEN_DIAGNOSTIC_CASES.every(item => Object.isFrozen(item.anchor) && Object.isFrozen(item.rows)));
});

test('frozen cases count useful prompts, wrong prompts, and hard-gated abstentions',()=>{
  const outcomes=FROZEN_DIAGNOSTIC_CASES.map(item => ({item,...actionFor(item)}));
  for(const outcome of outcomes) assert.equal(outcome.action,outcome.item.expected,outcome.item.id);
  for(const {item,diagnosis} of outcomes.filter(x=>x.action==='retry')) {
    assert.equal(diagnosis.status,'ambiguous',item.id);
    assert.ok(diagnosis.probe.input.includes('='),item.id);
    assert.equal(new Set([diagnosis.probe.correct,...Object.values(diagnosis.probe.predictions)]).size,3,item.id);
  }
  assert.equal(outcomes.filter(x=>x.item.expected!=='abstain' && x.action===x.item.expected).length,6);
  assert.equal(outcomes.filter(x=>x.action!=='abstain' && x.action!==x.item.expected).length,0);
  assert.equal(outcomes.filter(x=>x.action==='abstain').length,4);
  assert.equal(outcomes.filter(x=>x.item.expected!=='abstain' && x.action==='abstain').length,0);
});

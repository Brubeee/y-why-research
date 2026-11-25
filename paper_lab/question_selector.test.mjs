import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {QUESTION_SELECTOR_CASES} from './question_selector_cases.mjs';
import {benchmarkQuestionSelectors} from './question_selector.mjs';

const fixturePath=fileURLToPath(new URL('./question_selector_cases.mjs',import.meta.url));
const frozenFixtureHash='0B69454631598141A6564C4286F8B2BC5E573A0C64720BB4C81320A7C537C87C';

test('question-selector groups do not cross frozen partitions',()=>{
  const groups=new Map();
  for(const row of QUESTION_SELECTOR_CASES) {
    assert.ok(['fit','dev','held'].includes(row.split));
    const prior=groups.get(row.group);
    assert.ok(!prior||prior===row.split,`${row.group} crosses partitions`);
    groups.set(row.group,row.split);
  }
  assert.equal(createHash('sha256').update(readFileSync(fixturePath)).digest('hex').toUpperCase(),frozenFixtureHash);
  assert.deepEqual(Object.fromEntries(['fit','dev','held'].map(split=>[
    split,{rows:QUESTION_SELECTOR_CASES.filter(row=>row.split===split).length,
      groups:new Set(QUESTION_SELECTOR_CASES.filter(row=>row.split===split).map(row=>row.group)).size},
  ])),{
    fit:{rows:15,groups:5},
    dev:{rows:4,groups:4},
    held:{rows:14,groups:11},
  });
});

test('frozen held comparison reproduces the documented go/no-go evidence',()=>{
  const result=benchmarkQuestionSelectors();
  assert.equal(result.fixtureSha256,frozenFixtureHash);
  assert.equal(result.fixedThreshold,0.75);
  assert.equal(result.heldEligibleGroups,10);
  assert.deepEqual(result.heldExactVerdictAgreement,{count:14,denominator:14});
  assert.deepEqual(result.exactCheckerVerdictChanges,{
    rule:{count:0,denominator:14},learned:{count:0,denominator:14},
  });
  assert.deepEqual(result.metrics.rule.usefulQuestionSelections,{count:12,denominator:12});
  assert.deepEqual(result.metrics.rule.confidentWrongQuestions,{count:0,denominator:12});
  assert.deepEqual(result.metrics.learned.usefulQuestionSelections,{count:5,denominator:12});
  assert.deepEqual(result.metrics.learned.confidentWrongQuestions,{count:1,denominator:12});
  assert.deepEqual(result.metrics.learned.missedExpectedQuestions,{count:7,denominator:12});
  assert.ok(result.failures.some(row=>row.id==='held-neutral-combined-distribution'
    &&row.expected==='intermediate'&&row.learned==='distribute'));
  assert.equal(result.controlAbstentions.length,2);
  assert.ok(result.controlAbstentions.every(row=>row.rule==='abstain'&&row.learned==='abstain'));
});

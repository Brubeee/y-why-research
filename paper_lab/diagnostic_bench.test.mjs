import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,runDiagnosticBenchmark} from './diagnostic_bench.mjs';

import {diagnoseStep} from "./diagnostic.mjs";
import {verifyRows} from "./verify.mjs";
test('all frozen full equations agree with manual solution-set labels',()=>{
  const {rows}=runDiagnosticBenchmark();
  assert.equal(rows.length,24);
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  assert.ok(Object.isFrozen(CASES)&&CASES.every(Object.isFrozen));
  for(const row of rows)assert.equal(row.observedExact,row.exact,row.id);
});

test('full-row confirmation guard retains scoped candidates; LHS-only selection fires on four known traps',()=>{
  const {metrics,rows,actions}=runDiagnosticBenchmark();
  assert.deepEqual(metrics.authored.exact_candidate_sets,[24,24]);
  assert.deepEqual(metrics.full_row_gate.exact_candidate_sets,[24,24]);
  assert.deepEqual(metrics.lhs_only.exact_candidate_sets,[20,24]);
  assert.deepEqual(metrics.lhs_only.supported_candidate_cases_retained,[7,7]);
  assert.deepEqual(metrics.lhs_only.false_candidate_cases,[4,17]);
  assert.deepEqual(metrics.lhs_only.equivalent_cases_with_candidate,[2,7]);
  assert.deepEqual(rows.filter(r=>!r.candidates.length&&r.policies.lhs_only.length).map(r=>r.id),
    ['rhs-mismatch','rhs-compensated','negative-five-compensation','negative-five-near-compensation']);
  assert.deepEqual(metrics.lhs_after_verifier.exact_candidate_sets,[22,24]);
  assert.deepEqual(metrics.lhs_after_verifier.false_candidate_cases,[2,17]);
  assert.deepEqual(metrics.lhs_after_verifier.equivalent_cases_with_candidate,[0,7]);
  assert.deepEqual(actions,{separating_probe:1,no_cause:10,not_eligible:13});
  for(const p of Object.values(metrics))assert.deepEqual(p.confirmation_required_cases_with_candidate,[0,2]);
});

test('later first change must use immediate confirmed preceding row, not anchor',()=>{
  const confirmed=text=>({text,confirmed:true});
  const anchor=confirmed('−3(x−4)=12');
  const divisor=confirmed('x−4=−4');
  const later=confirmed('−3x−12=12');
  const rows=[divisor,later];
  const exact=verifyRows({anchor,rows});
  assert.deepEqual(exact.rows.map(r=>r.status),['equivalent','changed']);
  assert.equal(exact.firstIssue,1);
  assert.deepEqual(diagnoseStep(anchor.text,later.text).candidates,['negative_product_sign_error']);
  assert.deepEqual(diagnoseStep(rows[exact.firstIssue-1].text,later.text).candidates,[]);
});

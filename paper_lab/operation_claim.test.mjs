import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOperationClaim } from './operation_claim.mjs';
import { verifyRows } from './verify.mjs';

const confirmed = text => ({text,confirmed:true});
const cases = [
  ['2(x+3)=10','2x+6=10','fits-written-claim','equivalent'],
  ['2(x+3)=10','6+2x=10','fits-written-claim','equivalent'],
  ['2(x+3)=10','2x+3=7','right-side-rewritten','equivalent'],
  ['2(x+3)=10','2x+3=10','solution-changed','changed'],
  ['2(x+3)=10','x*x=4','unsupported','unsupported'],
  ['4(z−2)=16','4(z−2)=16','unfinished','equivalent'],
  ['−3(y−2)=12','−3y+6=6+6','right-side-rewritten','equivalent'],
  ['−3(y−2)=12','(−3)*y+(−3)*(−2)=12','unfinished','equivalent'],
  ['−3(y−2)=−12','6−3y = -12','fits-written-claim','equivalent'],
  ['2(x+3)=10','10=2x+6','right-side-rewritten','equivalent'],
  ['2(x+3)=2+8','2x+6=2+8','unsupported','equivalent'],
  ['x+3=5','x+3=5','unsupported','equivalent'],
];
test('written claim results are distinct from actual solution-set results', () => {
  for (const [start,finish,status,exact] of cases) {
    const before=confirmed(start), after=confirmed(finish);
    assert.equal(verifyRows({anchor:before,rows:[after]}).rows[0].status,exact,finish);
    assert.deepEqual(checkOperationClaim({claim:'expand-left-only',before,after}),{status,exact},finish);
  }
});
test('unclaimed or unconfirmed transitions do not produce claim evidence', () => {
  const before=confirmed('2(x+3)=10'),after=confirmed('2x+6=10');
  for (const request of [{before,after},{claim:'expand-right-only',before,after},
    {claim:'expand-left-only',before,after:{...after,confirmed:false}}])
    assert.deepEqual(checkOperationClaim(request),{status:'unassessed',exact:null});
});

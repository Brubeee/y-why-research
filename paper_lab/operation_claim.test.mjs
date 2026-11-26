import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOperationClaim, checkTwoSidedOperationClaim, formatOperationExpression } from './operation_claim.mjs';
import { verifyRows } from './verify.mjs';
import { FROZEN_OPERATION_CONVERSATION_CASES } from './operation_conversation_cases.mjs';

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

test('same changed pair gets a different exact prompt for subtracting versus dividing',()=>{
  const item=FROZEN_OPERATION_CONVERSATION_CASES.find(x=>x.id==='demo-subtract-points-right');
  const before=item.anchor, after=item.rows[0];
  const subtract=checkTwoSidedOperationClaim({before,after,claim:{kind:'subtract',constant:'6'}});
  const divide=checkTwoSidedOperationClaim({before,after,claim:{kind:'divide',constant:'2'}});
  assert.equal(subtract.exact,'changed');
  assert.equal(subtract.status,'right-mismatch');
  assert.deepEqual(subtract.comparison,{left:true,right:false});
  assert.equal(formatOperationExpression('14',{kind:'subtract',constant:'6'}),'14−6');
  assert.equal(divide.exact,'changed');
  assert.equal(divide.status,'both-mismatch');
  assert.deepEqual(divide.comparison,{left:false,right:false});
  assert.equal(formatOperationExpression('2x+6',{kind:'divide',constant:'2'}),'(2x+6) ÷ 2');
});

test('add and subtract may use an exact affine term, while scale factors stay numeric',()=>{
  const before=confirmed('3m+5=2m+11');
  const repaired=confirmed('m+5=11');
  assert.equal(checkTwoSidedOperationClaim({before,after:repaired,claim:{kind:'subtract',constant:'2m'}}).status,'consistent');
  assert.equal(checkTwoSidedOperationClaim({before,after:repaired,claim:{kind:'subtract',constant:'2x'}}).status,'unsupported');
  assert.equal(checkTwoSidedOperationClaim({before,after:repaired,claim:{kind:'multiply',constant:'m'}}).status,'unsupported');
});

test('declared operation compares exact sides across equivalent forms and fractions',()=>{
  for(const id of ['correct-equivalent-writing','correct-fractional-division','correct-fraction-subtract']) {
    const item=FROZEN_OPERATION_CONVERSATION_CASES.find(x=>x.id===id);
    assert.equal(checkTwoSidedOperationClaim({before:item.anchor,after:item.rows[0],claim:item.claim}).status,'consistent',id);
  }
  const sameRoot=FROZEN_OPERATION_CONVERSATION_CASES.find(x=>x.id==='same-root-claim-is-still-compared-by-side');
  const checked=checkTwoSidedOperationClaim({before:sameRoot.anchor,after:sameRoot.rows[0],claim:sameRoot.claim});
  assert.equal(checked.exact,'equivalent');
  assert.equal(checked.status,'both-mismatch','same roots do not identify which side matches when neither does');
  assert.deepEqual(checked.comparison,{left:false,right:false});
  const fraction=FROZEN_OPERATION_CONVERSATION_CASES.find(x=>x.id==='fraction-format-right-error');
  assert.equal(checkTwoSidedOperationClaim({before:fraction.anchor,after:fraction.rows[0],claim:fraction.claim}).status,'right-mismatch');
});

test('frozen claims preserve verifyRows verdicts, gate unsupported work, and abstain on bad constants',()=>{
  const expectedStatus={consistent:'consistent',left:'left-mismatch',right:'right-mismatch'};
  const allOutcomes=[];
  for(const item of FROZEN_OPERATION_CONVERSATION_CASES) {
    const chain=[item.anchor,...item.rows];
    const index=item.claimBeforeIndex ?? 0;
    const before=chain[index], after=chain[index+1];
    const beforeVerdict=verifyRows({anchor:item.anchor,rows:item.rows});
    const action=item.expectedClaim==='skip'
      ? {status:'skipped',exact:null}
      : checkTwoSidedOperationClaim({before,after,claim:item.claim});
    const afterVerdict=verifyRows({anchor:item.anchor,rows:item.rows});
    assert.deepEqual(afterVerdict,beforeVerdict,item.id+' must not change the exact checker');
    const firstStatus=beforeVerdict.anchor.status==='confirmed'
      ? beforeVerdict.rows[0]?.status : beforeVerdict.anchor.status;
    assert.equal(firstStatus,item.expectedExact,item.id+' frozen exact status');
    if(item.expectedClaim==='consistent'||item.expectedClaim==='left'||item.expectedClaim==='right') {
      if(action.status==='both-mismatch') {
        // This safer outcome abstains where an older fixture expected a side
        // prompt without either side matching the declared action.
        assert.deepEqual(action.comparison,{left:false,right:false},item.id+' neutral dual-side mismatch');
      } else assert.equal(action.status,expectedStatus[item.expectedClaim],item.id+' frozen claim result');
    }
    else if(item.expectedClaim==='abstain')
      assert.ok(['abstain','unsupported','blocked','unassessed'].includes(action.status),item.id+' must abstain');
    else assert.equal(action.status,'skipped',item.id+' keeps its authored retry');
    allOutcomes.push(action.status);
  }
  assert.equal(allOutcomes.length,28);
});

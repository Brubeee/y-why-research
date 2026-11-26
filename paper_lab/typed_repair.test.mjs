import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTypedStep,checkTypedRepair,checkNeutralIntermediate,hasUnexpandedBinomialProduct} from './operation_claim.mjs';
import {verifyRows} from './verify.mjs';

const row=text=>({text,confirmed:true});

test('a single declared balance operation targets only the side that fails its exact comparison',()=>{
  const before=row('2x+6=14'), observed=row('2x=9');
  const result=classifyTypedStep({before,observed,claim:{kind:'subtract',constant:'6'}});
  assert.equal(result.status,'actionable');
  assert.equal(result.focusSide,'right');
  assert.deepEqual(result.comparison,{left:true,right:false});
});

test('two-side mismatch and combined steps take a neutral path without choosing a side',()=>{
  const before=row('2x+6=14'), observed=row('2x=9');
  assert.deepEqual(classifyTypedStep({before,observed,claim:{kind:'divide',constant:'2'}}),
    {status:'neutral',reason:'both-sides-mismatch',exact:'changed',comparison:{left:false,right:false}});
  assert.equal(classifyTypedStep({before,observed,claim:{kind:'combined'}}).status,'neutral');
  assert.deepEqual(checkNeutralIntermediate({before,candidate:row('2x=8')}),
    {status:'equivalent-unattributed',exact:'equivalent'});
});

test('distribution repair is checked against the actual predecessor and must expand the grouped product',()=>{
  const before=row('−(x−4)=12'), observed=row('−x−4=12');
  const action=classifyTypedStep({before,observed,claim:{kind:'distribution-left'}});
  assert.equal(action.status,'actionable');
  const good=checkTypedRepair({before,candidate:row('4−x=12'),claim:{kind:'distribution-left'}});
  assert.deepEqual(good,{status:'supported',exact:'equivalent',operation:'distribution'});
  const copied=checkTypedRepair({before,candidate:row('−(x−4)=12'),claim:{kind:'distribution-left'}});
  assert.equal(copied.status,'equivalent-other');
  assert.equal(copied.exact,'equivalent');
  assert.equal(hasUnexpandedBinomialProduct('3−5(2z+1)'),true);
  assert.equal(hasUnexpandedBinomialProduct('3−10z−5'),false);
  for (const text of ['3+(-5)*(2z+1)=8','3+(-5)(2z+1)=8']) {
    const candidate=row(text);
    assert.equal(verifyRows({anchor:row('3−5(2z+1)=8'),rows:[candidate]}).rows[0].status,'equivalent');
    assert.equal(hasUnexpandedBinomialProduct(text),true);
    assert.equal(checkTypedRepair({before:row('3−5(2z+1)=8'),candidate,claim:{kind:'distribution-left'}}).status,'equivalent-other');
  }
});

test('distribution supports an outside addend and nonunit inner coefficient',()=>{
  const before=row('3−5(2z+1)=8'), observed=row('3−10z−4=8');
  assert.equal(classifyTypedStep({before,observed,claim:{kind:'distribution-left'}}).status,'actionable');
  assert.deepEqual(checkTypedRepair({before,candidate:row('3−10z−5=8'),claim:{kind:'distribution-left'}}),
    {status:'supported',exact:'equivalent',operation:'distribution'});
});

test('fractional coefficient repair checks the same declared operation on both sides',()=>{
  const before=row('x/3=9'), observed=row('x=9');
  assert.equal(classifyTypedStep({before,observed,claim:{kind:'multiply',constant:'3'}}).focusSide,'right');
  assert.deepEqual(checkTypedRepair({before,candidate:row('x=27'),claim:{kind:'multiply',constant:'3'}}),
    {status:'supported',exact:'equivalent',operation:'consistent'});
  assert.equal(checkTypedRepair({before,candidate:row('x=27'),claim:{kind:'divide',constant:'0'}}).status,'blocked');
});

test('repair action is checked against the immediate confirmed predecessor, not the original anchor',()=>{
  const anchor=row('6x=24'), predecessor=row('3x=12'), candidate=row('3x−3=9');
  const chain=verifyRows({anchor,rows:[predecessor,row('3x=9')]});
  assert.deepEqual(chain.rows.map(item=>item.status),['equivalent','changed']);
  assert.deepEqual(checkTypedRepair({before:predecessor,candidate,claim:{kind:'subtract',constant:'3'}}),
    {status:'supported',exact:'equivalent',operation:'consistent'});
  assert.equal(checkTypedRepair({before:anchor,candidate,claim:{kind:'subtract',constant:'3'}}).status,'equivalent-other');
});

test('equivalence and operation demonstration are distinct for a valid unconventional rewrite',()=>{
  const before=row('2x+6=14');
  const candidate=row('8=2x');
  assert.equal(verifyRows({anchor:before,rows:[candidate]}).rows[0].status,'equivalent');
  const result=checkTypedRepair({before,candidate,claim:{kind:'subtract',constant:'6'}});
  assert.equal(result.status,'equivalent-other');
  assert.equal(result.exact,'equivalent');
});

test('unconfirmed, unsupported, and changed repair lines never become supported',()=>{
  const before=row('2x+6=14'), claim={kind:'subtract',constant:'6'};
  assert.equal(checkTypedRepair({before,candidate:{text:'2x=8',confirmed:false},claim}).status,'blocked');
  assert.equal(checkTypedRepair({before,candidate:row('x²=4'),claim}).status,'blocked');
  assert.equal(checkTypedRepair({before,candidate:row('2x=9'),claim}).status,'not-equivalent');
  assert.equal(classifyTypedStep({before,observed:row('14=2x+6'),claim}).status,'blocked',
    'an equivalent rewrite is a control, not a first changed step');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {findEquationWitness, parseEquation, parseExpression, verifyRows} from './verify.mjs';
const confirmed = text => ({ text, confirmed:true });
const statuses = x => x.rows.map(x=>x.status);
test('exact rationals and affine parentheses, including Unicode operators', () => {
  assert.deepEqual(parseEquation('−(x−4)÷3 = 0.1'), {ok:true,variable:'x',solution:{kind:'unique',value:'37/10'}});
  assert.equal(parseEquation('0.1x + .2x = 1').solution.value,'10/3');
  assert.equal(parseEquation('2(x+3) = 8').solution.value,'1');
  assert.equal(parseEquation('2 × (x+3) = 8').solution.value,'1');
  assert.equal(parseEquation('100000000000000000000000000001*x = 1').solution.value,'1/100000000000000000000000000001');
});
test('exact expression values for the separator', () => {
  assert.deepEqual(parseExpression('−3(y−2)'),{ok:true,variable:'y',coefficient:'-3',constant:'6'});
  for (const [s,c] of [['−3y−2','-2'],['−3y−6','-6'],['6−3y','6']]) assert.equal(parseExpression(s).constant,c);
});
test('unsupported structures, domain restrictions, numbers and malformed grammar', () => {
  for (const s of ['x*x=1','x^2=1','x/x=1','1/(x-x+1)=2','0*(x*x)=0','(x-x)*x=0','x+y=1','x/0=1','x/2x=1','x/2(x)=1','x(2)=1','x=2=3','x<3','x=','x=1;alert(1)','x=1.2.3','x=1 2','x=4e5','x='+('9'.repeat(31)), 'x='+('('.repeat(23))+'1'+(')'.repeat(23)), 'x='+(' '.repeat(255))+'1'])
    assert.equal(parseEquation(s).ok,false,s);
});
test('confirmed anchor and first unresolved row gate all downstream work', () => {
  assert.deepEqual(statuses(verifyRows({anchor:{text:'2x=4'},rows:[confirmed('x=2')]})),['not-considered']);
  assert.deepEqual(statuses(verifyRows({anchor:confirmed('x^2=4'),rows:[confirmed('x=2')]})),['not-considered']);
  const a = verifyRows({anchor:confirmed('2x=4'),rows:[confirmed('x=2'),{text:'x=2'},confirmed('x=9')]});
  assert.deepEqual(statuses(a),['equivalent','unconfirmed','not-considered']); assert.equal(a.firstIssue,1);
  const b = verifyRows({anchor:confirmed('2x=4'),rows:[confirmed('x=3'),confirmed('x=2')]});
  assert.deepEqual(statuses(b),['changed','not-considered']);
});
test('identity and contradiction distinguish same solution set from proof', () => {
  for(const [anchor,rows,k] of [['x=x',['1=1','2*x=2*x','x=1'],'all'],['x=x+1',['1=0','2*x=2*x+1','x=1'],'none']]){
    const r=verifyRows({anchor:confirmed(anchor),rows:rows.map(confirmed)});
    assert.deepEqual(statuses(r),['equivalent','equivalent','changed']);
    assert.equal(r.rows[0].solution.kind,k); assert.match(r.rows[0].message,/does not verify the reasoning/);
    JSON.stringify(r);
  }
  assert.deepEqual(statuses(verifyRows({anchor:confirmed('x=x'),rows:['1=1','y=y','x=x'].map(confirmed)})),['equivalent','unsupported','not-considered']);
});

test('witnesses are exact, evaluate both sides, and prefer the changed line safely', () => {
  const negative = findEquationWitness('−(x−4)=12','−x−4=12');
  assert.deepEqual(negative,{
    status:'witness', variable:'x', value:'-16',
    before:{left:'20',right:'12',satisfies:false},
    after:{left:'12',right:'12',satisfies:true},
  });
  const fraction = findEquationWitness('x/2=1','x/2=1/3');
  assert.equal(fraction.status,'witness');
  assert.equal(fraction.value,'2/3');
  assert.deepEqual(fraction.before,{left:'1/3',right:'1',satisfies:false});
  assert.deepEqual(fraction.after,{left:'1/3',right:'1/3',satisfies:true});
  const negativeFraction = findEquationWitness('−3x/2=3','−3x/2=1');
  assert.equal(negativeFraction.status,'witness');
  assert.equal(negativeFraction.value,'-2/3');
  assert.equal(negativeFraction.after.satisfies,true);
  assert.equal(negativeFraction.before.satisfies,false);
});

test('identity/contradiction witnesses are explicit and unique-to-identity transitions abstain', () => {
  const identityToUnique = findEquationWitness('x=x','x=2');
  assert.equal(identityToUnique.status,'witness');
  assert.equal(identityToUnique.value,'3');
  assert.equal(identityToUnique.before.satisfies,true);
  assert.equal(identityToUnique.after.satisfies,false);
  for (const [before,after,beforeHolds,afterHolds] of [
    ['x=x','1=0',true,false],
    ['1=0','x=x',false,true],
    ['1=0','x=2',false,true],
  ]) {
    const witness=findEquationWitness(before,after);
    assert.equal(witness.status,'witness');
    assert.equal(witness.before.satisfies,beforeHolds);
    assert.equal(witness.after.satisfies,afterHolds);
  }
  assert.equal(findEquationWitness('x=2','1=0').status,'abstain');
  assert.equal(findEquationWitness('x=2','x=x').status,'abstain');
  assert.equal(findEquationWitness('x=2','x=2').status,'equivalent');
  assert.equal(findEquationWitness('x^2=4','x=2').status,'unsupported');
});

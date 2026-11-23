import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseStep, interpretProbe} from './diagnostic.mjs';

test('initial collision has a fresh probe distinct from both wrong predictions',()=>{
 const d=diagnoseStep('−(x−4)=12','−x−4=12');
 assert.equal(d.status,'ambiguous');
 assert.equal(d.probe.input,'-3(y-2)=12');
 assert.equal(d.probe.correct,'-3y+6=12');
 assert.deepEqual(d.probe.predictions,{first_term_only:'-3y-2=12',negative_product_sign_error:'-3y-6=12'});
 assert.equal(new Set([d.probe.correct,...Object.values(d.probe.predictions)]).size,3);
 assert.deepEqual(d.probe.exactOverlap,[]);
 assert.equal(interpretProbe(d,d.probe.correct).status,'correct');
 assert.deepEqual(interpretProbe(d,d.probe.correct).candidates,[]);
 for(const [id,out] of Object.entries(d.probe.predictions)){
   assert.equal(interpretProbe(d,out).status,'rule_consistent');
   assert.deepEqual(interpretProbe(d,out).candidates,[id]);
 }
});
test('unrelated and malformed reject; exact case bypasses model',()=>{
 assert.equal(diagnoseStep('-(x-4)=12','-x+4=12').status,'correct');
 assert.equal(diagnoseStep('-2(x-4)=12','-2x+8=12').status,'correct');
 assert.equal(diagnoseStep('-(x-4)=12','-x-4=11').status,'unsupported');
 assert.equal(diagnoseStep('-6(x-4)=12','-x-4=12').status,'unsupported');
 assert.equal(diagnoseStep('-(x-4)=12','x-4=12').status,'unresolved');
 const d=diagnoseStep('-(x-4)=12','-x-4=12');
 assert.equal(interpretProbe(d,'-x-99=12').status,'unresolved');
 assert.equal(interpretProbe(d,'not sure').status,'unresolved');
});
test('independent integer witnesses verify all generated expressions',()=>{
 for(let n=1;n<10;n++){
  const d=diagnoseStep(`-(y-${n})=-2`,`-y-${n}=-2`);
  assert.equal(d.status,'ambiguous');
  const [,k,x,c]=d.probe.input.match(/^(-\d)\(([a-z])-(\d+)\)=/);
  const [,l,v,b]=d.probe.correct.match(/^(-\d)([a-z])\+(\d+)=/);
  assert.equal(x,v);
  for(const y of [-10,0,10]) assert.equal(+k*(y-c),+l*y+Number(b));
  assert.equal(new Set([d.probe.correct,...Object.values(d.probe.predictions)]).size,3);
 }
});

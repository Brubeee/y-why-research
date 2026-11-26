import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { affineReference } from './affine_scope.mjs';
import { literal,verifyFull,scoreArm,scoreBundle,scoreCohort } from './phone_score.mjs';

const rows=['2x+6=14','2x=9','x=9/2'];
const box=i=>[10,10+i*30,80,30+i*30];
const ref=rows.map((literal,i)=>({literal,box:box(i)}));
const crops=(lines=rows)=>lines.map((raw,i)=>({raw,padded:box(i)}));
test('literal comparison preserves visible meaning and notation',()=>{
  assert.equal(literal(String.raw`\[\left(−2n\right)=8\]`),'(-2n)=8');
  assert.equal(literal(String.raw`\dfrac{1}{2}=x`),String.raw`\frac{1}{2}=x`);
  assert.notEqual(literal('x=1/2'),literal(String.raw`x=\frac{1}{2}`));
  assert.notEqual(literal('x=1  3'),literal('x=13'));
  assert.notEqual(literal('x=4'),literal('x=-4'));
});

test('same index is not evidence of a preserved pair or exact chain',()=>{
  const good=scoreArm(ref,crops());
  assert.ok(good.comparable && good.issuePairPreserved && good.exact);
  const bad=scoreArm(ref,crops(['2x+6=24',...rows.slice(1)]));
  assert.ok(bad.firstIssueAgreement && !bad.issuePairPreserved && !bad.exact);
  for (const tail of ['x^2=81/4','z=9/2','']) {
    const missing=scoreArm(ref,crops([...rows.slice(0,2),tail]));
    assert.ok(!missing.comparable && !missing.firstIssueAgreement && !missing.exact);
  }
});

test('geometry refuses missing, duplicate, merged, clipped, extra and reordered crops',()=>{
  const [a,b,c]=crops();
  const clips=[
    [[a,b],'missingRows'],[[a,b,b,c],'repeatedRows'],[[a,{...b,padded:[10,40,80,90]}],'mergedCrops'],
    [[a,b,{...c,padded:[10,70,30,90]}],null],
    [[a,b,c,{raw:'',padded:[100,100,110,110]}],'extraCrops'],
    [[a,c,b],null]
  ];
  for (const [variant,metric] of clips) {
    const r=scoreArm(ref,variant);
    assert.ok(!r.geometryExact && !r.comparable && !r.exact);
    if (metric) assert.ok(r[metric]>0);
  }
});

test('repair erased, moved, ambiguous, false issue, and one-row intake are distinct',()=>{
  const moved=scoreArm(ref,crops([rows[0],'2x=8',rows[2]]));
  assert.ok(moved.partialRepair && !moved.completeRepair && moved.observedFirstChanged===3);
  const fixed=scoreArm(ref,crops([rows[0],'2x=8','x=4']));
  assert.ok(fixed.completeRepair && !fixed.partialRepair);
  const changedAnchor=scoreArm(ref,crops(['2x+6=24','2x=18','x=9']));
  assert.ok(!changedAnchor.completeRepair);
  const correct=ref.map((r,i)=>({...r,literal:[rows[0],'2x=8','x=4'][i]}));
  assert.ok(scoreArm(correct,crops()).introducedIssue);
  const one=scoreArm(ref.slice(0,1),crops().slice(0,1));
  assert.ok(one.exact && !one.comparable);
});

test('bundle verifies original ordered bytes/metadata and ledger keeps failures',()=>{
  const d=mkdtempSync(join(tmpdir(),'ywhy-score-'));
  try {
    const dir=join(d,'crops'); mkdirSync(dir);
    const digest=b=>createHash('sha256').update(b).digest('hex');
    const manifest=crops().map((c,i)=>{
      const name=`oracle-0${i+1}.png`, body=String(i);
      writeFileSync(join(dir,name),body);
      return {arm:'oracle',name,box:c.padded,padded:c.padded,crop_sha256:digest(body)};
    });
    const m=JSON.stringify([{key:'private-capture',crops:manifest}]);
    const frozen=JSON.stringify({intake:{raster_sha256:'fixed',original_sha256:'a'.repeat(64)},rows:ref});
    writeFileSync(join(d,'frozen.json'),frozen);
    writeFileSync(join(dir,'manifest.json'),m);
    writeFileSync(join(dir,'binding.json'),JSON.stringify({frozen_sha256:digest(frozen),
      raster_sha256:'fixed',manifest_sha256:digest(m),counts:{oracle:3,detector:0,rule_mask_detector:0}}));
    const result=join(d,'results.json');
    const called=() => scoreBundle(d,dir,result);
    const ordered=manifest.map((c,i)=>({...c,raw:rows[i]}));
    const writeResult=x=>writeFileSync(result,JSON.stringify([{key:'private-capture',crops:x}]));
    writeResult(ordered);
    assert.ok(called().oracle.exact);
    const receipts=[{id:'a',status:'scored',bundle:d,crops:dir,result},
      {id:'b',status:'intake-rejected'},{id:'c',status:'illegible'}];
    const report=scoreCohort(['a','b','c','d'],receipts);
    assert.equal(report.plannedCaptures,4);
    assert.deepEqual(report.outcomes,{scored:1,'intake-rejected':1,'inference-failed':0,illegible:1,pending:1});
    assert.equal(report.metrics.oracle.exactChains,1);
    assert.throws(()=>scoreCohort(['a','b','c','d'],[...receipts,receipts[1]]),/unique/);
    assert.throws(()=>scoreCohort(['a','b'],[receipts[0],{...receipts[0],id:'b'}]),/distinct/);
    writeResult([...ordered].reverse());
    assert.throws(called,/order mismatch/);
    writeResult(ordered);
    writeFileSync(join(dir,'manifest.json'),m+'\n');
    assert.throws(called,/binding mismatch/);
    writeFileSync(join(dir,'manifest.json'),m);
    writeFileSync(join(dir,manifest[0].name),'changed');
    assert.throws(called,/hash/);
  } finally { rmSync(d,{recursive:true,force:true}); }
});


test('cancellation is supported in a suffix but cannot hide a literal OCR error',()=>{
  const run=(truth,observed=truth)=>scoreArm(
    truth.map((literal,i)=>({literal,box:box(i)})),crops(observed));
  const clean=['0.4q−1.2=2','0.4q=3.2','q=8'];
  assert.ok(run(clean).firstIssueAgreement);
  const wrong=run(clean,[clean[0],'0.49=3.2',clean[2]]);
  assert.ok(wrong.comparable && wrong.introducedIssue && !wrong.exact);
  assert.equal(wrong.observedFirstChanged,2);
  for (const chain of [
    ['2q+0.49=2q+3.2','0.49=3.2','0=2.71'],
    ['2q+0.49=2q+0.49','0.49=0.49','0=0']
  ]) {
    const exact=run(chain);
    assert.ok(exact.comparable && exact.exact && exact.firstIssueAgreement);
    assert.equal(exact.expectedFirstChanged,null);
  }
  const actualError=run(['2q+3=11','3=11','0=8']);
  assert.ok(actualError.issuePairPreserved && actualError.firstIssueAgreement);
  assert.equal(actualError.expectedFirstChanged,2);
  assert.equal(verifyFull(['1=1','q=q']).supported,false);
  assert.deepEqual(affineReference('0.49=3.2'),{reason:'no-variable'});
  assert.equal(verifyFull(['2q+3=11','3=11','9r=9']).supported,false);
  assert.equal(verifyFull(['q=q',...Array(101).fill('0=0')]).supported,false);
});

test('repair metrics support a constant predecessor within an attested variable context',()=>{
  const truth=['2q+3=2q+7','3=7','0=0','0=0'];
  const run=actual=>scoreArm(truth.map((literal,i)=>({literal,box:box(i)})),crops(actual));
  const later=run([truth[0],truth[1],'0=4',truth[3]]);
  assert.ok(later.partialRepair && !later.completeRepair);
  assert.equal(later.expectedFirstChanged,3);
  assert.equal(later.observedFirstChanged,4);
  assert.ok(run([truth[0],truth[1],'0=4','1=5']).completeRepair);
  assert.ok(!run([truth[0].replaceAll('q','r'),truth[1],'0=4','1=5']).completeRepair);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmark} from './ocr_verdict.mjs';

const good=['x-2=2','x=4','2x=8'];
const bad=['x-2=2','x=2','2x=4'];
const one=(reference,observed,expect='ok')=>benchmark([{id:'a',reference,observed,expect}]).cases[0];

test('independent verdict; different transcript is not confirmed even when exact math passes',()=>{
 const r=one(good,['x − 2 = 2','4=x','2x=8']);
 assert.equal(r.transcription,'different');assert(r.sameVerdictDifferentTranscript);assert(r.requiresConfirmation);assert(!r.verdictFlip);
 assert.equal(one(good,['x − 2 = 2','x=4','2x=8']).transcription,'same');
});
test('safety vs false accusation',()=>{
 assert(one(bad,good,'changed').safetyFlip);
 const r=one(good,bad);assert(r.verdictFlip);assert(!r.safetyFlip);
 assert.equal(r.observed.firstIssue.line,2);
});
test('later null or malformed row prevents whole-chain classification even following early change',()=>{
 for(const last of [null,'no equation','y=2']){
  const r=one(good,[bad[0],bad[1],last]);
  assert.equal(r.observed.verdict,'unresolved');assert.equal(r.observed.firstIssue.line,2);
  assert(!r.verdictFlip);assert(r.requiresConfirmation);assert.equal(r.observed.unresolvedLines[0].line,3);
 }
});
test('label mismatch, duplicate and wrong row count',()=>{
 const r=one(good,bad,'changed');assert(!r.referenceMatchesExpected);assert(!r.comparable);
 assert.throws(()=>one(good,good.slice(1)));
 const x={id:'one',reference:good,observed:good,expect:'ok'};
 assert.throws(()=>benchmark([x,x]));
});

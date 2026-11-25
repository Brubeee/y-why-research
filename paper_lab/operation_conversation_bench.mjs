// Deterministic score on the frozen author-written fixture set; not learner data.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkTwoSidedOperationClaim } from './operation_claim.mjs';
import { diagnoseStep } from './diagnostic.mjs';
import { verifyRows } from './verify.mjs';
import { FROZEN_OPERATION_CONVERSATION_CASES } from './operation_conversation_cases.mjs';

const expectedFixtureSha256='D6DD5B6BDCCB3692CE7E6CF7119FB7C76B143E509322FE5B4129E3DA01251222';
const fixturePath=fileURLToPath(new URL('./operation_conversation_cases.mjs',import.meta.url));
const fixtureSha256=createHash('sha256').update(readFileSync(fixturePath)).digest('hex').toUpperCase();
const outcome = status => {
  if(status==='consistent') return 'consistent';
  if(status==='left-mismatch') return 'left';
  if(status==='right-mismatch') return 'right';
  return 'abstain';
};

function exactLabel(item, verified) {
  if(verified.anchor.status!=='confirmed') return verified.anchor.status;
  return verified.rows[0]?.status ?? 'none';
}

function directClaim(item) {
  if(item.expectedClaim==='skip') return {status:'skipped',exact:null};
  const chain=[item.anchor,...item.rows], index=item.claimBeforeIndex ?? 0;
  return checkTwoSidedOperationClaim({before:chain[index],after:chain[index+1],claim:item.claim});
}

function flowOutcome(item) {
  const verified=verifyRows({anchor:item.anchor,rows:item.rows});
  const index=verified.rows.findIndex(row=>row.status==='changed');
  if(index<0) return 'abstain';
  const chain=[item.anchor,...item.rows];
  const diagnosis=diagnoseStep(chain[index].text,chain[index+1].text);
  if(diagnosis.status==='ambiguous'&&diagnosis.probe) return 'retry';
  const claimed=checkTwoSidedOperationClaim({before:chain[index],after:chain[index+1],claim:item.claim});
  return outcome(claimed.status);
}

const scored=FROZEN_OPERATION_CONVERSATION_CASES.map(item=>{
  const before=verifyRows({anchor:item.anchor,rows:item.rows});
  const claim=directClaim(item);
  const after=verifyRows({anchor:item.anchor,rows:item.rows});
  return {
    id:item.id,
    family:item.family,
    expectedExact:item.expectedExact,
    actualExact:exactLabel(item,before),
    expectedClaim:item.expectedClaim,
    actualClaim:outcome(claim.status),
    expectedFlow:item.expectedFlow,
    actualFlow:flowOutcome(item),
    checkerVerdictChanged:JSON.stringify(before)!==JSON.stringify(after),
  };
});

const expectedTargets=scored.filter(x=>x.expectedFlow==='left'||x.expectedFlow==='right');
const targetMatches=expectedTargets.filter(x=>x.actualFlow===x.expectedFlow).length;
const wrongConfident=scored.filter(x=>(x.actualFlow==='left'||x.actualFlow==='right')&&x.actualFlow!==x.expectedFlow).length;
const abstentions=scored.filter(x=>x.actualFlow==='abstain').length;
const missedTargets=expectedTargets.filter(x=>x.actualFlow!==x.expectedFlow).length;
const expectedCorrectClaims=scored.filter(x=>x.expectedClaim==='consistent');
const matchedCorrectClaims=expectedCorrectClaims.filter(x=>x.actualClaim==='consistent').length;
const checkerChanges=scored.filter(x=>x.checkerVerdictChanged).length;
const exactMismatches=scored.filter(x=>x.expectedExact!==x.actualExact).length;
const fraction=(count,denominator)=>({count,denominator});

console.log(JSON.stringify({
  basis:'frozen synthetic fixtures; author-written expected actions; no learner data or effectiveness measure',
  fixtureIntegrity:{sha256:fixtureSha256,expected:expectedFixtureSha256,matches:fixtureSha256===expectedFixtureSha256},
  fixtures:scored.length,
  correctClaimsMatched:fraction(matchedCorrectClaims,expectedCorrectClaims.length),
  correctTargetedPrompts:fraction(targetMatches,expectedTargets.length),
  wrongConfidentPrompts:fraction(wrongConfident,scored.length),
  missedTargetedPrompts:fraction(missedTargets,expectedTargets.length),
  abstentions:fraction(abstentions,scored.length),
  changedCheckerVerdicts:fraction(checkerChanges,scored.length),
  exactLabelMismatches:fraction(exactMismatches,scored.length),
  matchedFlowCases:fraction(scored.filter(x=>x.actualFlow===x.expectedFlow).length,scored.length),
  outcomes:scored,
},null,2));

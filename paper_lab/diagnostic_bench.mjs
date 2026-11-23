import {pathToFileURL} from 'node:url';
import {diagnoseStep} from './diagnostic.mjs';
import {verifyRows} from './verify.mjs';

const V='first_term_only', S='negative_product_sign_error';
const X='−3(x−4)=12', Z='−5(z−3)=10';
// Frozen manually solved equations; labels denote matching simulated outputs,
// not a learner's reason. All cases are invented, not telemetry or OCR images.
const raw=[
 ['variable-only',X,'−3x−4=12','changed',[V]], // x=0 → -16/3
 ['wrong-sign',X,'−3x−12=12','changed',[S]], // x=-8
 ['none',X,'−3x+4=12','changed',[]], // x=-8/3
 ['rhs-mismatch',X,'−3x−12=13','changed',[]], // x=-25/3
 ['rhs-compensated',X,'−3x−12=−12','equivalent',[]],
 ['divide',X,'x−4=−4','equivalent',[]],
 ['collision','−(x−4)=12','−x−4=12','changed',[V,S]], // x=-8 → -16
 ['negative-five-compensation',Z,'−5z−15=−20','equivalent',[]], // z=1
 ['negative-five-near-compensation',Z,'−5z−15=−19','changed',[]], // z=4/5
 ['unconfirmed-ocr',X,'−3x−12=12','unknown',[],false],
 ['correct',X,'−3x+12=12','equivalent',[]],
 ['two-variable-only','−2(q−7)=0','−2q−7=0','changed',[V]], // q=7 → -7/2
 ['two-wrong-sign','−2(q−7)=0','−2q−14=0','changed',[S]],
 ['four-variable-only','−4(t+3)=8','−4t+3=8','changed',[V]], // t=-5 → -5/4
 ['four-correct','−4(t+3)=8','−4t−12=8','equivalent',[]],
 ['five-wrong-sign',Z,'−5z−15=10','changed',[S]],
 ['fresh-coefficient','−6(q−2)=0','−6q−12=0','changed',[]], // outside diagnostic scope
 ['solution-only',X,'x=0','equivalent',[]],
 ['other-variable',X,'−3y−12=12','unsupported',[]],
 ['square',X,'−3x²−12=12','unsupported',[]],
 ['chain',X,'−3x−12=12=x','unsupported',[]],
 ['unexpanded-equivalent',X,'−3(x−4)=12','equivalent',[]],
 ['unconfirmed-anchor',X,'−3x−4=12','unknown',[],true,false],
 ['mixed-variable',X,'−3x−12y=12','unsupported',[]],
];
export const CASES=Object.freeze(raw.map(([id,before,after,exact,candidates,confirmed=true,anchorConfirmed=true])=>
  Object.freeze({id,before,after,exact,candidates:Object.freeze(candidates),confirmed,anchorConfirmed})));

const eq=text=>{
  const parts=text.split('=');
  return parts.length===2?parts:null;
};
const label=status=>status==='unconfirmed'||status==='not-considered'?'unknown':status;
function exactStatus(c){
  const check=verifyRows({anchor:{text:c.before,confirmed:c.anchorConfirmed},rows:[{text:c.after,confirmed:c.confirmed}]});
  return label(check.rows[0].status);
}
function baseline(c){
  if(!c.confirmed||!c.anchorConfirmed)return [];
  return diagnoseStep(c.before,c.after).candidates;
}
function lhsOnly(c){
  if(!c.confirmed||!c.anchorConfirmed)return [];
  const before=eq(c.before),after=eq(c.after);
  if(!before||!after)return [];
  // Intentionally discard what is actually written to the right of equality.
  return diagnoseStep(c.before,`${after[0]}=${before[1]}`).candidates;
}
function strict(c,status){
  return status==='changed'?baseline(c):[];
}
const equal=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function runDiagnosticBenchmark(){
  const rows=CASES.map(c=>{
    const exact=exactStatus(c);
    const authored=baseline(c), left=lhsOnly(c);
    // Match the current app's eligibility/ambiguity check, not an intent label.
    const diagnosis=exact==='changed'?diagnoseStep(c.before,c.after):null;
    const authoredAction=diagnosis?.status==='ambiguous'&&diagnosis.probe?'separating_probe':exact==='changed'?'no_cause':'not_eligible';
    return {...c,observedExact:exact,authoredAction,
      policies:{authored,lhs_only:left,lhs_after_verifier:exact==='changed'?left:[],full_row_gate:strict(c,exact)}};
  });
  const metrics={};
  for(const policy of Object.keys(rows[0].policies)){
    const count=f=>rows.filter(r=>f(r,r.policies[policy])).length;
    metrics[policy]={
      exact_candidate_sets:[count((r,p)=>equal(r.candidates,p)),rows.length],
      supported_candidate_cases_retained:[count((r,p)=>r.candidates.length&&equal(r.candidates,p)),count(r=>r.candidates.length)],
      false_candidate_cases:[count((r,p)=>!r.candidates.length&&p.length),count(r=>!r.candidates.length)],
      equivalent_cases_with_candidate:[count((r,p)=>r.exact==='equivalent'&&p.length),count(r=>r.exact==='equivalent')],
      confirmation_required_cases_with_candidate:[count((r,p)=>r.exact==='unknown'&&p.length),count(r=>r.exact==='unknown')]
    };
  }
  const actions=Object.fromEntries(['separating_probe','no_cause','not_eligible'].map(k=>[k,rows.filter(r=>r.authoredAction===k).length]));
  return {scope:'Frozen synthetic regression challenge; no learner intent or learning outcomes observed. Comparator policies are not deployed.',rows,metrics,actions};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(runDiagnosticBenchmark(),null,2));

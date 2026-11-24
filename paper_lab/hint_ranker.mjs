/** Research-only transparent next-action ranker; not loaded by the app. */
import {pathToFileURL} from 'node:url';
import {CASES} from './hint_ranker_cases.mjs';
import {verifyRows} from './verify.mjs';
import {diagnoseStep} from './diagnostic.mjs';

const ACTIONS=['inspect_sign','ask_operation','compare_sides'];
const clean=s=>s.replaceAll('−','-').replace(/\s/g,'');
function properties(row) {
 const [a,b]=clean(row.before).split('='),[c,d]=clean(row.after).split('=');
 const changed=[a!==c,b!==d];
 const remove=s=>s.replace(/[+-]/g,'');
 const signOnly=changed.filter(Boolean).length===1 && remove(a)===remove(c) && remove(b)===remove(d);
 return [changed.filter(Boolean).length,Number(signOnly)];
}
function gate(row) {
 const r=verifyRows({anchor:{text:row.before,confirmed:row.anchorConfirmed},rows:[...row.prior,{text:row.after,confirmed:row.confirmed}]});
 return r.rows.at(-1).status==='changed';
}
function probe(row) {
 const r=diagnoseStep(row.before,row.after);
 return r.status==='ambiguous' && !!r.probe;
}
function authored(row) {
 if(!gate(row))return 'blocked';
 return probe(row)?'separating_probe':'ask_operation';
}
function strongerRule(row) {
 const base=authored(row);
 if(base!=='ask_operation')return base;
 const [changed,signOnly]=properties(row);
 return changed===2?'compare_sides':signOnly?'inspect_sign':'ask_operation';
}
function train(fit) {
 const rows=fit.filter(row=>gate(row)&&!probe(row)).map(row=>({features:properties(row),label:row.label}));
 const counts=Object.fromEntries(ACTIONS.map(label=>[label,0])), likelihood={};
 for(const label of ACTIONS)likelihood[label]=[[1,1],[1,1]];
 for(const row of rows){
   counts[row.label]++;
   likelihood[row.label][0][row.features[0]-1]++;
   likelihood[row.label][1][row.features[1]]++;
 }
 return row=>{
   const features=properties(row);
   const scores=ACTIONS.map(label=>[label,(counts[label]+1)*likelihood[label][0][features[0]-1]*
      likelihood[label][1][features[1]]/(counts[label]+2)**2]);
   const total=scores.reduce((v,[,s])=>v+s,0);
   scores.sort((a,b)=>b[1]-a[1]);
   return {action:scores[0][0],confidence:scores[0][1]/total};
 };
}
function choose(model, dev) {
 // Fit may produce a rank score, not a calibrated probability. An operating
 // threshold is selected only from dev, with a fixed error-first ordering.
 const candidates=[.50,.58,.66,.74,.82,.9,1];
 const rows=dev.filter(row=>gate(row)&&!probe(row));
 return candidates.map(threshold=>{
  const accepted=rows.map(row=>[row,model(row)]).filter(([,p])=>p.confidence>=threshold);
  return {threshold,wrong:accepted.filter(([row,p])=>row.label!==p.action).length,coverage:accepted.length,total:rows.length};
 }).sort((a,b)=>a.wrong-b.wrong||b.coverage-a.coverage||b.threshold-a.threshold)[0];
}
export function benchmark() {
 const fit=CASES.filter(r=>r.split==='fit'),dev=CASES.filter(r=>r.split==='dev'),held=CASES.filter(r=>r.split==='held');
 const groups=new Map();
 for(const r of CASES){
  if(groups.has(r.group)&&groups.get(r.group)!==r.split)throw new Error('group leakage');
  groups.set(r.group,r.split);
 }
 const model=train(fit), op=choose(model,dev);
 const rows=held.map(r=>{
  const eligible=gate(r), rule=authored(r), forced=probe(r);
  const p=eligible&&!forced?model(r):null;
  return {id:r.id,group:r.group,label:r.label,eligible,score:p?.confidence??null,
    authored:rule,strong_rule:strongerRule(r),thresholded:eligible?
      forced?'separating_probe':p.confidence>=op.threshold?p.action:'abstain':'blocked',
    abstain:eligible?'abstain':'blocked'};
 });
 const metrics={};
 for(const name of ['authored','strong_rule','thresholded','abstain']){
  const available=rows.filter(r=>r.eligible), out=available.filter(r=>r[name]!=='abstain'&&r[name]!=='blocked');
  metrics[name]={eligible:available.length,correct:out.filter(r=>r[name]===r.label).length,
   acted:out.length,wrong:out.filter(r=>r[name]!==r.label).length,abstained:available.length-out.length,
   blocked:rows.filter(r=>r[name]==='blocked').length,gate_errors:rows.filter(r=>!r.eligible&&r[name]!=='blocked').length};
 }
 return {scope:'Frozen synthetic author preferences; no diagnosed misconceptions, no measured learning.',splitCounts:{fit:fit.length,dev:dev.length,held:held.length},
   calibratedOnDev:op,heldHighConfidenceWrong:metrics.thresholded.wrong,metrics,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(benchmark(),null,2));

/** Offline comparison of a fixed rule and one small rank-only selector. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyRows,parseExpression} from './verify.mjs';
import {checkTwoSidedOperationClaim,classifyTypedStep,hasUnexpandedBinomialProduct} from './operation_claim.mjs';
import {QUESTION_SELECTOR_CASES} from './question_selector_cases.mjs';

export const QUESTION_BANK=Object.freeze({
  distribute:'Which terms did the factor multiply on this side?',
  balance:'Which single operation did you apply to both sides?',
  coefficient:'Which exact nonzero factor did you use to change the coefficient?',
  intermediate:'Can you show one intermediate equation after a single move?',
});
export const ABSTAIN='abstain';
export const FIXED_THRESHOLD=0.75;
const QUESTION_IDS=Object.freeze(Object.keys(QUESTION_BANK));
const FEATURE_VALUES=Object.freeze({
  claimKind:['add','subtract','multiply','divide','distribution-left','distribution-right','other','combined','none'],
  changedSides:['0','1','2'],
  groupedBefore:['0','1'],
  fractional:['0','1'],
  variablesBothSides:['0','1'],
  comparison:['left-only','right-only','both','neither','unavailable'],
});
const CASES_PATH=fileURLToPath(new URL('./question_selector_cases.mjs',import.meta.url));
const normalize=text=>text.replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/');

function splitSides(text) {
  const parts=typeof text==='string'?normalize(text).split('='):[];
  return parts.length===2?parts.map(x=>x.trim()):null;
}
function sameAffine(a,b) {
  const x=parseExpression(a),y=parseExpression(b);
  if(!x.ok||!y.ok||x.coefficient!==y.coefficient||x.constant!==y.constant)return false;
  return x.coefficient==='0'||x.variable===y.variable;
}
function selectedTransition(item,verified) {
  const index=verified.rows.findIndex(row=>row.status==='changed');
  if(index<0)return null;
  const chain=[item.anchor,...item.prior,...item.rows];
  return {before:chain[index],observed:chain[index+1],index};
}
function inspect(item) {
  const verified=verifyRows({anchor:item.anchor,rows:[...item.prior,...item.rows]});
  const transition=selectedTransition(item,verified);
  const exactStatus=verified.anchor.status!=='confirmed'?verified.anchor.status:
    verified.rows[0]?.status??'none';
  const eligible=!!transition&&exactStatus==='changed';
  const before=transition?.before?.text??item.anchor.text;
  const observed=transition?.observed?.text??item.rows[0]?.text??'';
  const beforeSides=splitSides(before),afterSides=splitSides(observed);
  const changedSides=beforeSides&&afterSides
    ? beforeSides.reduce((count,side,index)=>count+Number(!sameAffine(side,afterSides[index])),0)
    : 0;
  const parsedSides=beforeSides?.map(parseExpression)??[];
  let comparison='unavailable';
  if(eligible&&item.claim&&['add','subtract','multiply','divide'].includes(item.claim.kind)) {
    const checked=checkTwoSidedOperationClaim({before:transition.before,after:transition.observed,claim:item.claim});
    if(checked.comparison?.left===true&&checked.comparison?.right===false)comparison='left-only';
    else if(checked.comparison?.left===false&&checked.comparison?.right===true)comparison='right-only';
    else if(checked.comparison?.left===true&&checked.comparison?.right===true)comparison='both';
    else if(checked.comparison?.left===false&&checked.comparison?.right===false)comparison='neither';
  }
  const features={
    claimKind:item.claim?.kind??'none',
    changedSides:String(changedSides),
    groupedBefore:String(Number(beforeSides?.some(hasUnexpandedBinomialProduct)??false)),
    fractional:String(Number(/[0-9]\s*\/\s*[0-9]|\d+\.\d/.test(before))),
    variablesBothSides:String(Number(parsedSides.length===2&&parsedSides.every(x=>x.ok&&x.variable!==null))),
    comparison,
  };
  return {verified,exactStatus,transition,eligible,features};
}

function ruleSelect(item,inspected) {
  if(!inspected.eligible)return ABSTAIN;
  const action=classifyTypedStep({before:inspected.transition.before,
    observed:inspected.transition.observed,claim:item.claim});
  if(action.status==='actionable') {
    if(item.claim.kind.startsWith('distribution-'))return 'distribute';
    if(item.claim.kind==='add'||item.claim.kind==='subtract')return 'balance';
    if(item.claim.kind==='multiply'||item.claim.kind==='divide')return 'coefficient';
  }
  return action.status==='neutral'?'intermediate':ABSTAIN;
}

function trainNaiveBayes(rows) {
  const examples=rows.filter(row=>row.inspected.eligible&&QUESTION_IDS.includes(row.item.expected));
  const counts=Object.fromEntries(QUESTION_IDS.map(id=>[id,0]));
  const tables=Object.fromEntries(QUESTION_IDS.map(id=>[id,
    Object.fromEntries(Object.entries(FEATURE_VALUES).map(([feature,values])=>[
      feature,Object.fromEntries(values.map(value=>[value,0]))
    ]))]));
  for(const row of examples) {
    const label=row.item.expected;counts[label]++;
    for(const [feature,value] of Object.entries(row.inspected.features))
      tables[label][feature][value]=(tables[label][feature][value]??0)+1;
  }
  return features=>{
    const total=examples.length;
    const ranked=QUESTION_IDS.map(label=>{
      let logScore=Math.log((counts[label]+1)/(total+QUESTION_IDS.length));
      for(const [feature,value] of Object.entries(features)) {
        const vocab=FEATURE_VALUES[feature];
        const count=tables[label][feature][value]??0;
        logScore+=Math.log((count+1)/(counts[label]+vocab.length));
      }
      return {label,logScore};
    });
    const max=Math.max(...ranked.map(row=>row.logScore));
    const weights=ranked.map(row=>Math.exp(row.logScore-max));
    const denominator=weights.reduce((a,b)=>a+b,0);
    ranked.forEach((row,index)=>row.score=weights[index]/denominator);
    ranked.sort((a,b)=>b.score-a.score);
    return ranked[0];
  };
}

function selectionMetrics(rows,key) {
  const eligible=rows.filter(row=>row.inspected.eligible);
  const actionable=eligible.filter(row=>row.item.expected!==ABSTAIN);
  const selected=rows.filter(row=>row[key]!==ABSTAIN);
  const correct=actionable.filter(row=>row[key]===row.item.expected).length;
  const wrong=eligible.filter(row=>row[key]!==ABSTAIN&&row[key]!==row.item.expected).length;
  const abstainedEligible=eligible.filter(row=>row[key]===ABSTAIN).length;
  const safeControls=rows.filter(row=>!row.inspected.eligible&&row[key]===ABSTAIN).length;
  return {
    eligible:{count:eligible.length,denominator:rows.length},
    usefulQuestionSelections:{count:correct,denominator:actionable.length},
    confidentWrongQuestions:{count:wrong,denominator:eligible.length},
    missedExpectedQuestions:{count:actionable.length-correct,denominator:actionable.length},
    abstentions:{count:rows.filter(row=>row[key]===ABSTAIN).length,denominator:rows.length},
    eligibleAbstentions:{count:abstainedEligible,denominator:eligible.length},
    safeControlAbstentions:{count:safeControls,denominator:rows.length-eligible.length},
    selectedQuestionCount:{count:selected.length,denominator:rows.length},
  };
}

export function benchmarkQuestionSelectors() {
  const source=readFileSync(CASES_PATH);
  const rows=QUESTION_SELECTOR_CASES.map(item=>({item,inspected:inspect(item)}));
  const model=trainNaiveBayes(rows.filter(row=>row.item.split==='fit'));
  for(const row of rows) {
    const beforeRule=verifyRows({anchor:row.item.anchor,rows:[...row.item.prior,...row.item.rows]});
    row.rule=ruleSelect(row.item,row.inspected);
    const afterRule=verifyRows({anchor:row.item.anchor,rows:[...row.item.prior,...row.item.rows]});
    row.ruleCheckerVerdictChanged=JSON.stringify(beforeRule)!==JSON.stringify(afterRule);
    const beforeModel=verifyRows({anchor:row.item.anchor,rows:[...row.item.prior,...row.item.rows]});
    if(!row.inspected.eligible) {row.learned=ABSTAIN;row.confidence=null;}
    else {
      const ranked=model(row.inspected.features);
      row.confidence=ranked.score;
      row.learned=ranked.score>=FIXED_THRESHOLD?ranked.label:ABSTAIN;
    }
    const afterModel=verifyRows({anchor:row.item.anchor,rows:[...row.item.prior,...row.item.rows]});
    row.learnedCheckerVerdictChanged=JSON.stringify(beforeModel)!==JSON.stringify(afterModel);
    row.actualExact=row.inspected.exactStatus;
  }
  const splitCounts=Object.fromEntries(['fit','dev','held'].map(split=>{
    const set=rows.filter(row=>row.item.split===split);
    return [split,{rows:set.length,groups:new Set(set.map(row=>row.item.group)).size}];
  }));
  const held=rows.filter(row=>row.item.split==='held');
  const actionable=held.filter(row=>row.inspected.eligible&&row.item.expected!==ABSTAIN);
  const failures=held.filter(row=>row.inspected.eligible&&row.item.expected!==ABSTAIN&&
    (row.learned!==row.item.expected||row.rule!==row.item.expected)).map(row=>({
      id:row.item.id,group:row.item.group,family:row.item.family,expected:row.item.expected,
      rule:row.rule,learned:row.learned,confidence:row.confidence,
    }));
  const controlAbstentions=held.filter(row=>!row.inspected.eligible).map(row=>({
    id:row.item.id,group:row.item.group,exact:row.actualExact,rule:row.rule,learned:row.learned,
  }));
  return {
    basis:'Synthetic author-written question preferences; no student data, diagnosis, or learning-effect measure.',
    fixtureSha256:createHash('sha256').update(source).digest('hex').toUpperCase(),
    fixedThreshold:FIXED_THRESHOLD,
    questions:QUESTION_BANK,
    splitCounts,
    heldIndependentGroups:splitCounts.held.groups,
    heldEligibleGroups:new Set(actionable.map(row=>row.item.group)).size,
    heldExactVerdictAgreement:{count:held.filter(row=>row.actualExact===row.item.expectedExact).length,denominator:held.length},
    exactCheckerVerdictChanges:{
      rule:{count:held.filter(row=>row.ruleCheckerVerdictChanged).length,denominator:held.length},
      learned:{count:held.filter(row=>row.learnedCheckerVerdictChanged).length,denominator:held.length},
    },
    metrics:{rule:selectionMetrics(held,'rule'),learned:selectionMetrics(held,'learned')},
    failures,
    controlAbstentions,
    heldOutcomes:held.map(row=>({id:row.item.id,group:row.item.group,exact:row.actualExact,
      expected:row.item.expected,rule:row.rule,learned:row.learned,confidence:row.confidence,
      features:row.inspected.features})),
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(benchmarkQuestionSelectors(),null,2));

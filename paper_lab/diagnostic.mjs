/** Narrow R&D diagnostic: unary negative outside a two-term bracket.
 * Labels denote simulated rules, never the learner's latent intent. */
const RE=/^-(?:([2-5]))?\(([a-z])([+-])([1-9]\d?)\)=(-?(?:0|[1-9]\d?))$/;
const OUT=/^(-?)([2-5])?([a-z])([+-])([1-9]\d?)=(-?(?:0|[1-9]\d?))$/;
const clean=s=>typeof s==='string'&&s.length<=80&&!/\d\s+\d/.test(s)?s.toLowerCase().replaceAll('−','-').replaceAll(/\s+/g,''):'';
const modelInput = s => {
  const m=RE.exec(clean(s));
  return m ? {coefficient:-Number(m[1]||1),variable:m[2],constant:Number(m[3]+m[4]),rhs:Number(m[5])} : null;
};
const parsedOutput = s => {
  const m=OUT.exec(clean(s));
  return m ? {coefficient:(m[1]?-1:1)*Number(m[2]||1),variable:m[3],constant:Number(m[4]+m[5]),rhs:Number(m[6])} : null;
};
const signed=n=>n<0?String(n):'+'+n;
const coef=n=>n===-1?'-':n===1?'':String(n);
const serial=s=>coef(s.coefficient)+s.variable+signed(s.constant)+'='+s.rhs;
const apply=(input, rule)=>serial({...input,constant:rule(input.constant,input.coefficient)});
const inputString=i=>coef(i.coefficient)+'('+i.variable+signed(i.constant)+')='+i.rhs;
const exact=(n,k)=>k*n;
const rules=Object.freeze([
  {id:'first_term_only',description:'Multiply the variable term only and leave the written constant unchanged.',apply:n=>n},
  {id:'negative_product_sign_error',description:'Multiply both terms but treat negative times negative as negative.',apply:(n,k)=>n<0?-Math.abs(n*k):n*k}
]);

function bestProbe(input,candidates) {
  const options=[];
  for(const k of [-2,-3,-4,-5]) for(const n of [2,3,4,5,6,7,8]) {
    if(n===Math.abs(input.constant))continue;
    const model={variable:input.variable==='y'?'x':'y',constant:-n,coefficient:k,rhs:input.rhs};
    const predictions=candidates.map(id=>[id,apply(model,rules.find(r=>r.id===id).apply)]);
    const correct=apply(model,exact);
    if(new Set([correct,...predictions.map(p=>p[1])]).size!==candidates.length+1) continue;
    // Prefer the smallest fresh constant, and factors that are neither trivial
    // nor arithmetic distractions. Refuse an equal-ranked winner.
    options.push({input:inputString(model),correct,predictions:Object.fromEntries(predictions),exactOverlap:[],
      score:100 - 5*n - Math.abs(k+3),change:'new variable, external factor and constant magnitude'});
  }
  options.sort((a,b)=>b.score-a.score||a.input.localeCompare(b.input,'en'));
  if(!options.length||options[1]?.score===options[0].score)return null;
  return options[0];
}

export function diagnoseStep(before,after) {
  const i=modelInput(before),o=parsedOutput(after);
  const result={status:'unsupported',candidates:[],probe:null,reason:'Confirm an equation of the form -m(x±n)=k (m from 1 to 5) and the resulting expanded equation.'};
  if(!i||!o||i.variable!==o.variable||i.rhs!==o.rhs)return result;
  const response=serial(o), expected=apply(i,exact);
  if(response===expected)return {...result,status:'correct',reason:'Both terms were multiplied by the outer factor; this expansion is exact.'};
  const matching=rules.filter(r=>apply(i,r.apply)===response);
  if(matching.length<2) return {...result,status:'unresolved',candidates:matching.map(r=>r.id),reason:'This response is not a supported two-rule collision. Ask for the operation or try a new step; do not infer a cause.'};
  const candidates=matching.map(r=>r.id),probe=bestProbe(i,candidates);
  return {...result,status:probe?'ambiguous':'unresolved',candidates,probe,
    definitions:Object.fromEntries(matching.map(r=>[r.id,r.description])),
    reason:probe?'Two different rules predict your same written step; try a fresh one without a hint.':'No uniquely ranked separating probe.'};
}

export function interpretProbe(diagnosis,answer) {
  const unsupported={status:'unresolved',candidates:[],reason:'No usable separating evidence.'};
  if(diagnosis?.status!=='ambiguous'||!diagnosis.probe)return unsupported;
  const out=parsedOutput(answer), p=diagnosis.probe;
  if(!out)return {...unsupported,reason:'Confirm your expanded equation before checking.'};
  const response=serial(out);
  if(response===p.correct)return {status:'correct',candidates:[],
    reason:'This new step is correct. It does not identify why the earlier step went wrong.',
    followUp:'Try another sign pattern to check the rule: multiply every term inside the bracket by the signed outer factor.'};
  const matches=diagnosis.candidates.filter(id=>p.predictions[id]===response);
  if(matches.length!==1)return {...unsupported,reason:'Neither supported rule uniquely explains this new answer. Show which terms you multiplied.'};
  return {status:'rule_consistent',candidates:matches,
    reason:'This response matches one simulated rule. It is evidence about this response, not a confirmed misconception.',
    followUp:'Distribute the signed outer factor to each term separately. Keep the sign produced by each multiplication.'};
}

/** Evaluation only: compare human reference and hypothetical OCR chains.
 * Passing math checks do not authorize an observed transcript. */
import { parseEquation, verifyRows } from './verify.mjs';

const limited = s => typeof s==='string' && s.length>0 && s.length<=300;
const cosmetic = s => s.trim().replaceAll('−','-')
  .replace(/(?<!\d)\s+|\s+(?!\d)/gu,''); // do not erase whitespace between digits

function chain(rows) {
  const issueLocations=[];
  for(const [i,row] of rows.entries()) {
    if(row===null) issueLocations.push({index:i,line:i+1,status:'unconfirmed'});
    else {
      const p=parseEquation(row);
      if(!p.ok) issueLocations.push({index:i,line:i+1,status:'unsupported',message:p.reason});
    }
  }
  const toRow=text=>({text:text??'',confirmed:text!==null});
  const result=verifyRows({anchor:toRow(rows[0]),rows:rows.slice(1).map(toRow)});
  const step=result.firstIssue;
  const firstIssue=result.anchor.status!=='confirmed'?
    {index:0,line:1,status:result.anchor.status,message:result.anchor.message}:
    step===null ? null : {index:step+1,line:step+2,status:result.rows[step].status,message:result.rows[step].message};
  const firstVerdict=firstIssue?.status??'ok';
  let verdict=['ok','changed'].includes(firstVerdict)?firstVerdict:'unresolved';
  if(issueLocations.length)verdict='unresolved';
  if(verdict==='changed'){
    const variable=parseEquation(rows[0]).variable ?? rows.map(parseEquation).find(r=>r.variable)?.variable;
    const foreign=rows.findIndex(s=>{const p=parseEquation(s);return p.variable&&variable&&p.variable!==variable;});
    if(foreign>=0){
      verdict='unresolved';
      issueLocations.push({index:foreign,line:foreign+1,status:'unsupported_variable'});
    }
  }
  return {verdict,firstIssue,allLinesParsed:issueLocations.length===0,unresolvedLines:issueLocations};
}

export function benchmark(cases){
  if(!Array.isArray(cases)||cases.length>1000)throw new Error('Expected at most 1,000 cases');
  const used=new Set();
  const results=cases.map(({id,reference,observed,expect})=>{
    if(!limited(id)||used.has(id)||!['ok','changed'].includes(expect)
      ||!Array.isArray(reference)||!Array.isArray(observed)||reference.length<2||reference.length>100
      ||observed.length!==reference.length||!reference.every(limited)||!observed.every(s=>s===null||limited(s)))
      throw new Error('Invalid or duplicate case: '+String(id));
    used.add(id);
    const ref=chain(reference),obs=chain(observed);
    const affected=observed.flatMap((s,i)=>s===null||cosmetic(reference[i])!==cosmetic(s)?[i+1]:[]);
    const transcription=observed.includes(null)?'unresolved':affected.length?'different':'same';
    const referenceMatchesExpected=ref.verdict===expect;
    const comparable=referenceMatchesExpected&&obs.verdict!=='unresolved';
    const verdictFlip=comparable&&ref.verdict!==obs.verdict;
    const safetyFlip=verdictFlip&&ref.verdict==='changed'&&obs.verdict==='ok';
    const firstChangedLineShift=comparable&&ref.verdict==='changed'&&obs.verdict==='changed'
      &&ref.firstIssue.index!==obs.firstIssue.index;
    return {id,expect,transcription,affectedLines:affected,requiresConfirmation:transcription!=='same'||obs.verdict==='unresolved',
      reference:ref,observed:obs,referenceMatchesExpected,comparable,verdictFlip,safetyFlip,firstChangedLineShift,
      sameVerdictDifferentTranscript:comparable&&!verdictFlip&&transcription==='different'};
  });
  const n=f=>results.filter(f).length;
  return {cases:results,counts:{total:results.length,referenceMismatch:n(x=>!x.referenceMatchesExpected),
    exactOrCosmetic:n(x=>x.transcription==='same'),different:n(x=>x.transcription==='different'),unresolved:n(x=>x.observed.verdict==='unresolved'),
    comparable:n(x=>x.comparable),verdictFlips:n(x=>x.verdictFlip),safetyFlips:n(x=>x.safetyFlip),
    firstChangedLineShifts:n(x=>x.firstChangedLineShift),sameVerdictDifferentTranscript:n(x=>x.sameVerdictDifferentTranscript)}};
}

if(typeof process!=='undefined'&&process.argv[1]){
  const {pathToFileURL}=await import('node:url');
  if(import.meta.url===pathToFileURL(process.argv[1]).href){
    try{
      const {readFileSync}=await import('node:fs');
      const raw=readFileSync(0,'utf8');
      if(raw.length>10_000_000)throw new Error('Input exceeds limit');
      process.stdout.write(JSON.stringify(benchmark(JSON.parse(raw)))+'\n');
    }catch(e){process.stderr.write(e.message+'\n');process.exitCode=2;}
  }
}

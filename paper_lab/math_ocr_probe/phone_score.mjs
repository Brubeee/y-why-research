// Local aggregate audit only. No recognition, network, or product behavior.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { affineReference } from './affine_scope.mjs';
import { verifyRows } from '../verify.mjs';

export const ARMS = ['oracle', 'detector', 'rule_mask_detector'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const unwrap = (s) => s.trim().replace(/^\\\[([\s\S]*)\\\]$/, '$1');

export function literal(text) {
  const s=unwrap(text).replaceAll('−','-').replace(/\\(?:left|right)(?=[()])/g,'')
    .replace(/\\[dt]frac\{/g,'\\frac{');
  // One run at a time: never combine two digit groups.
  return s.replace(/\s+/g, (run,i) => /[0-9]/.test(s[i-1]??'') &&
    /[0-9]/.test(s[i+run.length]??'') ? ' ' : '');
}

const area = ([l,t,r,b]) => (r-l)*(b-t);
function cover([l,t,r,b], [L,T,R,B]) {
  return Math.max(0,Math.min(r,R)-Math.max(l,L))*
    Math.max(0,Math.min(b,B)-Math.max(t,T))/area([L,T,R,B]);
}

export function verifyFull(lines) {
  if (lines.length < 2) return {supported:false};
  // Refuse unsupported suffixes even if the product checker would stop earlier.
  const all = lines.map(s=>affineReference(unwrap(s)));
  if (all.some(x=>!x.parsed) || new Set(all.map(x=>x.parsed.variable)).size !== 1)
    return {supported:false};
  const [anchor,...rows] = all.map(x=>({text:x.text,confirmed:true}));
  const v=verifyRows({anchor,rows});
  return {supported:true,firstChanged:v.firstIssue===null ? null : v.firstIssue+2};
}

export function scoreArm(ref, crops) {
  const expected = ref.map(r=>r.literal);
  const actual = crops.map(c=>c.raw);
  // Padded crop is what reaches recognition. Any substantial match to a
  // second reference row is ambiguous. Both thresholds are box proxies,
  // not independent observations of visible ink.
  const links=crops.map(c=>ref.flatMap((r,i)=>cover(c.padded,r.box)>=.10 ? [i] : []));
  const geometryExact=actual.length===ref.length &&
    links.every((ids,i)=>ids.length===1 && ids[0]===i && cover(crops[i].padded,ref[i].box)>=.90);
  const truth=verifyFull(expected), observed=geometryExact ? verifyFull(actual) : {supported:false};
  const same=(i)=>literal(expected[i])===literal(actual[i]);
  const exact=geometryExact && expected.every((_,i)=>same(i));
  const comparable=truth.supported && observed.supported;
  const firstIssueAgreement=comparable && truth.firstChanged===observed.firstChanged;
  const k=truth.firstChanged===null || !truth.supported ? null : truth.firstChanged-1;
  const issuePairPreserved=k!==null && firstIssueAgreement && same(k-1) && same(k);
  const pair=k!==null && comparable && same(k-1) && !same(k) ?
    verifyFull([actual[k-1],actual[k]]) : null;
  const repair=pair?.supported && pair.firstChanged===null;
  return {
    expectedRows:ref.length, returnedRows:crops.length, geometryExact, exact,
    missingRows:ref.filter((_,i)=>!links.some(ids=>ids.includes(i))).length,
    repeatedRows:ref.filter((_,i)=>links.filter(ids=>ids.includes(i)).length>1).length,
    extraCrops:links.filter(ids=>!ids.length).length,
    mergedCrops:links.filter(ids=>ids.length>1).length,
    expectedFirstChanged:truth.firstChanged??null, observedFirstChanged:observed.firstChanged??null,
    comparable, firstIssueAgreement, issuePairPreserved,
    completeRepair:!!repair && observed.firstChanged===null,
    partialRepair:!!repair && observed.firstChanged>truth.firstChanged,
    introducedIssue:comparable && truth.firstChanged===null && observed.firstChanged!==null
  };
}

export function scoreBundle(bundle,dir,resultPath) {
  const frozen=readFileSync(join(bundle,'frozen.json'));
  const manifest=readFileSync(join(dir,'manifest.json'));
  const binding=JSON.parse(readFileSync(join(dir,'binding.json')));
  const f=JSON.parse(frozen), m=JSON.parse(manifest), result=JSON.parse(readFileSync(resultPath));
  if (binding.frozen_sha256!==sha(frozen) || binding.manifest_sha256!==sha(manifest) ||
      binding.raster_sha256!==f.intake.raster_sha256)
    throw Error('Reference/manifest binding mismatch');
  if (m.length!==1 || result.length!==1 || m[0].key!=='private-capture' ||
      !Array.isArray(m[0].crops) || !Array.isArray(result[0].crops))
    throw Error('Expected one frozen capture');
  const [{crops: expected}]=m;
  const [{crops: received,...page}]=result;
  if (!isDeepStrictEqual(page,{key:'private-capture'}) || expected.length!==received.length)
    throw Error('Expected exact frozen manifest metadata');
  const names = new Set();
  for (let i=0;i<expected.length;i++) {
    const a=expected[i], {raw,...metadata}=received[i];
    if (typeof raw!=='string' || !isDeepStrictEqual(a,metadata) || !ARMS.includes(a.arm) ||
        !/^[a-z_]+-[0-9]+\.png$/.test(a.name) || basename(a.name)!==a.name ||
        names.has(a.name) || sha(readFileSync(join(dir,a.name)))!==a.crop_sha256)
      throw Error('Crop hash, metadata or order mismatch');
    names.add(a.name);
  }
  return Object.fromEntries(ARMS.map(arm=>{
    const crops=received.filter(c=>c.arm===arm);
    if (crops.length!==binding.counts[arm]) throw Error('Arm count diverges from binding');
    return [arm,scoreArm(f.rows,crops)];
  }));
}

export function scoreCohort(planned, receipts) {
  if (!Array.isArray(planned) || !Array.isArray(receipts)) throw Error('Expected ledger arrays');
  const ids=new Set(planned);
  if (!planned.length || ids.size!==planned.length ||
      planned.some(id=>typeof id!=='string'||!id)) throw Error('Expected unique planned IDs');
  const seen=new Set(), sources=new Set();
  const counts={scored:0,'intake-rejected':0,'inference-failed':0,illegible:0,pending:0};
  const metrics=Object.fromEntries(ARMS.map(arm=>[arm,{exactChains:0,comparableChains:0,indexMatches:0,issuePairs:0,completeRepairs:0,partialRepairs:0,introducedIssues:0}]));
  for (const r of receipts) {
    if (!ids.has(r.id) || seen.has(r.id) || !Object.hasOwn(counts,r.status) || r.status==='pending')
      throw Error('Receipt does not match unique planned capture');
    seen.add(r.id);
    let got=null;
    if (r.status==='scored') {
      const original=JSON.parse(readFileSync(join(r.bundle,'frozen.json'))).intake.original_sha256;
      if (!/^[0-9a-f]{64}$/.test(original??'') || sources.has(original))
        throw Error('A scored capture must have a distinct original file hash');
      sources.add(original);
      got=scoreBundle(r.bundle,r.crops,r.result);
    }
    counts[r.status]++;
    if (got) for (const arm of ARMS) {
      metrics[arm].exactChains+=Number(got[arm].exact && got[arm].expectedRows>=2);
      metrics[arm].comparableChains+=Number(got[arm].comparable);
      metrics[arm].indexMatches+=Number(got[arm].firstIssueAgreement);
      metrics[arm].issuePairs+=Number(got[arm].issuePairPreserved);
      metrics[arm].completeRepairs+=Number(got[arm].completeRepair);
      metrics[arm].partialRepairs+=Number(got[arm].partialRepair);
      metrics[arm].introducedIssues+=Number(got[arm].introducedIssue);
    }
  }
  counts.pending=planned.length-seen.size;
  return {plannedCaptures:planned.length,outcomes:counts,metrics};
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [, , a,b,c]=process.argv;
  const input=p=>JSON.parse(readFileSync(p,'utf8'));
  const report=c ? scoreBundle(a,b,c) : scoreCohort(input(a),input(b));
  console.log(JSON.stringify(report,null,2));
}

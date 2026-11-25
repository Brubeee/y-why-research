// Production app handlers, DOM/decode shim, and real HTTP OCR response bodies.
// Confirmations are a reference annotator simulation, not actual UI users.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

class Node {
  constructor(){this.nodes=[];this.events={};this.value='';this.style={};this.hidden=false;this.textContent='';}
  append(...nodes){this.nodes.push(...nodes);}
  replaceChildren(...nodes){this.nodes=nodes;}
  addEventListener(type,fn){this.events[type]=fn;}
  dispatch(type){return this.events[type]?.({preventDefault(){}});}
  setAttribute(){}
  removeAttribute(key){delete this[key];}
  async decode(){}
  words(){return [this.textContent,...this.nodes.map(n=>typeof n==='string'?n:n.words())].join(' ');}
}
const expectedIssues={'t-invalid':2,'linear-photo-like':3,'fraction-rotated':null};
const tidy=s=>s.replaceAll('−','-').replace(/(?<!\d)\s+|\s+(?!\d)/gu,'');
const overlap=(a,b)=>Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
const output=[];
const packets=JSON.parse(readFileSync(0,'utf8'));
assert.deepEqual(packets.map(p=>p.id),Object.keys(expectedIssues));
for(const {id,mime,ocr,labels} of packets){
  const elements = new Map();
  const get=id=>elements.get(id)??elements.set(id,new Node()).get(id);
  globalThis.document={getElementById:get,createElement:()=>new Node(),createTextNode:s=>s};
  globalThis.window={};
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'/api/ocr');
    assert.equal(options.headers['Content-Type'],mime);
    return {ok:true,json:async()=>ocr};
  };
  // The Python driver already uploaded the actual raster to the real endpoint.
  // This Blob is only a picker shim; no decoder pixels or geometry are mocked as OCR.
  Object.assign(get('image'),{naturalWidth:ocr.image.width,naturalHeight:ocr.image.height});
  await import('./app.mjs?fixture='+id);
  get('photo').files=[new Blob(['picker shim'],{type:mime})];
  await get('photo').dispatch('change');
  const rows=get('rows').nodes;
  assert.deepEqual(rows.map(r=>r.nodes[1].value),ocr.lines.map(l=>l.text));
  const truth=labels.filter(r=>r.status==='active');
  // Independent annotated pixel boxes provide correspondence. Do not force a
  // mapping onto omitted, split or merged detections; record these as unresolved.
  const indices=truth.map(row=>{
    const candidates=ocr.lines.flatMap((line,i)=>overlap(row.box,line.box)>row.box.height/2?[i]:[]);
    return candidates.length===1?candidates[0]:null;
  });
  const exact=truth.map((r,i)=>indices[i]!==null && tidy(ocr.lines[indices[i]].text)===tidy(r.text));
  const result={id,mime,activeRows:truth.length,detectedRows:ocr.lines.length,exactRows:exact.filter(Boolean).length,
    matchedIndices:indices,expectedFirstChangedActiveLine:expectedIssues[id]};
  const available=indices.every((v,i)=>v!==null&&(i===0||indices[i-1]+1===v));
  if (!available){
    output.push({...result,status:'unresolved OCR row mapping'});
    get('clear').dispatch('click');
    continue;
  }
  const use=row=>{
    const include=row.nodes[0], conf=row.nodes[2].nodes[0];
    include.checked=true;include.dispatch('change');
    conf.checked=true;conf.dispatch('change');
  };
  for(const i of indices){
    const include=rows[i].nodes[0]; include.checked=true;include.dispatch('change');
  }
  get('verify').dispatch('click');
  assert.doesNotMatch(get('verdict').words(),/First verified change|Same solution set/);
  for(const i of indices) use(rows[i]);
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/No verdict was issued/);
  assert.equal(get('probe').hidden,true);
  // Model a careful reader checking the source, never auto-accepting raw OCR.
  for(const [j,i] of indices.entries()){
    if(!exact[j]){
      const input=rows[i].nodes[1];
      input.value=truth[j].text;input.dispatch('input');
      use(rows[i]);
    }
  }
  get('anchor-check').checked=true;get('anchor-check').dispatch('change');
  get('verify').dispatch('click');
  const report=get('verdict').words();
  const actual=report.match(/Line (\d+) · First verified change/);
  const expected=result.expectedFirstChangedActiveLine;
  assert.equal(actual?Number(actual[1]):null,expected?indices[expected-1]+1:null,id);
  if(expected){
    for(const i of indices.slice(expected)) assert.match(report,new RegExp('Line '+(i+1)+' · Not checked'));
  }else{
    for(const i of indices.slice(1)) assert.match(report,new RegExp('Line '+(i+1)+' · Same solution set'));
  }
  output.push({...result,status:'confirmed selected-work result',simulatedCorrections:exact.filter(v=>!v).length,
    verdictBeforeConfirmation:'withheld',reportedFirstChangedPhotoRow:actual?Number(actual[1]):null});
  get('clear').dispatch('click');
}
console.log(JSON.stringify(output));

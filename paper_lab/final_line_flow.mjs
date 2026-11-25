// Real local HTTP and application handlers; simulate only the DOM and canvas.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

class Element {
  constructor(){this.nodes=[];this.handlers={};this.value='';this.style={};this.hidden=false;this.textContent='';}
  append(...nodes){this.nodes.push(...nodes);}
  replaceChildren(...nodes){this.nodes=nodes;}
  addEventListener(type,fn){this.handlers[type]=fn;}
  dispatch(type,event={}){return this.handlers[type]?.(event);}
  setAttribute(){}
  removeAttribute(key){delete this[key];}
  async decode(){}
  focus(){this.dispatch('focus');document.activeElement=this;}
  words(){return [this.textContent,...this.nodes.map(n=>typeof n==='string'?n:n.words())].join(' ');}
}
const {port,window:bounds,cases}=JSON.parse(readFileSync(0,'utf8'));
const loopbackFetch=globalThis.fetch;
const [x,y,r,b]=bounds,w=r-x,h=b-y;
const outputs=[];
for(const [fixtureIndex,c] of cases.entries()){
  let drawn=false;
  const requested=[];
  const elements=new Map();
  const get=id=>elements.get(id)??elements.set(id,new Element()).get(id);
  const image=get('image');
  Object.assign(image,{naturalWidth:c.width,naturalHeight:c.height,
    getBoundingClientRect:()=>({left:0,top:0,width:c.width,height:c.height})});
  const asBlob=name=>new Blob([Buffer.from(c[name],'base64')],{type:'image/png'});
  globalThis.window={};
  globalThis.document={getElementById:get,createTextNode:s=>s,createElement:tag=>tag!=='canvas'?new Element():{
    getContext:()=>({drawImage(...args){
      assert.deepEqual(args,[image,x,y,w,h,0,0,w,h]);
      drawn=true;
    }}),
    toBlob(cb,mime){assert.equal(mime,'image/png');assert.ok(drawn);cb(asBlob('crop'));},
  }};
  globalThis.fetch=async(path,init)=>{
    assert.equal(path,'/api/ocr');
    const response=await loopbackFetch('http://127.0.0.1:'+port+path,init);
    assert.equal(response.status,200);
    requested.push(await response.clone().json());
    return response;
  };
  await import('./app.mjs?final-line='+fixtureIndex);
  get('photo').files=[asBlob('full')];
  await get('photo').dispatch('change');
  assert.equal(get('photo-view').hidden,false);
  assert.equal(get('select-region').disabled,false);
  get('select-region').dispatch('click');
  image.dispatch('click',{clientX:x,clientY:y});
  image.dispatch('click',{clientX:r,clientY:b});
  await get('read-region').dispatch('click');
  assert.equal(requested.length,2);
  assert.deepEqual(requested[0].image,{width:c.width,height:c.height});
  assert.deepEqual(requested[1].image,{width:w,height:h});
  const draft=requested[1].lines.map(row=>row.text);
  assert.deepEqual(draft,c.rows.slice(0,2),'This control requires an actual omitted last row');
  assert.deepEqual(get('rows').nodes.map(row=>row.nodes[1].value),draft);
  const check=()=>get('verify').dispatch('click');
  const verdict=()=>get('verdict').words();
  const confirm=row=>{const n=row.nodes[2].nodes[0];n.checked=true;n.dispatch('change');};
  const attest=()=>{get('anchor-check').checked=true;get('anchor-check').dispatch('change');};
  for(const row of get('rows').nodes){
    row.nodes[0].checked=true;row.nodes[0].dispatch('change');confirm(row);
  }
  attest();check();
  assert.match(verdict(),/Selected steps only.*Line 2 · Same solution set/);
  assert.doesNotMatch(verdict(),/Line 3/);
  get('add').dispatch('click');
  const appended=get('rows').nodes[2],field=appended.nodes[1];
  assert.equal(document.activeElement,field);
  assert.equal(get('crop').hidden,true);
  assert.match(appended.words(),/Typed from photo; no detected highlight/);
  field.value=c.rows[2];field.dispatch('input');
  check();assert.match(verdict(),/No verdict was issued/);
  attest();check();
  assert.match(verdict(),/Line 3 · Needs transcription confirmation/);
  confirm(appended);check();
  assert.match(verdict(),/Selected steps only/);
  const first=verdict().match(/Line (\d+) · First verified change/);
  assert.equal(first?Number(first[1]):null,c.first_error);
  if(c.first_error===null)assert.match(verdict(),/Line 3 · Same solution set/);
  outputs.push({sourceSha256:c.raw_sha256,ocrDraft:draft,typedPhotoLine:c.rows[2],
    firstChangedSelectedLine:c.first_error,verifiedScope:'selected steps only'});
  get('clear').dispatch('click');
}
console.log(JSON.stringify(outputs));

import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor() { this.children=[]; this.events={}; this.textContent=''; this.value=''; this.hidden=false; this.style={}; this.attributes={}; }
  append(...v) { this.children.push(...v); }
  replaceChildren(...v) { this.children=[...v]; }
  addEventListener(k,f) { this.events[k]=f; }
  setAttribute(k,v) { this.attributes[k]=v; }
  removeAttribute(k) { delete this[k]; }
  dispatch(k, arg={preventDefault(){}}) { return this.events[k]?.(arg); }
  words() { return [this.textContent,...this.children.map(x=>typeof x==='string'?x:x.words())].join(' '); }
}
const ids = new Map();
const get = id => ids.get(id) || (ids.set(id,new Element()), ids.get(id));
globalThis.document = {getElementById:get,createElement:()=>new Element(),createTextNode:s=>s};
const img=get('image');
img.naturalWidth=img.naturalHeight=100;
img.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
const createElement=globalThis.document.createElement;
globalThis.document.createElement=tag=>tag === 'canvas' ? {
  getContext:()=>({drawImage(){}}),
  toBlob(cb){cb(new Blob(['mocked-crop'],{type:'image/png'}));},
} : createElement(tag);
let sentCropped=false;
globalThis.fetch = async (url,init) => {
  assert.equal(url,'/api/ocr'); assert.equal(init.method,'POST'); assert.equal(init.headers['Content-Type'],'image/png');
  const isCropped=(await init.body.text()) === 'mocked-crop';
  sentCropped = isCropped;
  if (isCropped) return {ok:true,json:async()=>({status:'draft',image:{width:90,height:50},lines:[
    {text:'-x-4=12',box:{x:0,y:2,width:85,height:12},words:[]},
    {text:'x=-16',box:{x:0,y:18,width:85,height:12},words:[]},
  ]})};
  return {
    ok:true, json:async()=>({status:'draft',image:{width:100,height:100},lines:[
      {text:'-(x-4)=12',box:{x:0,y:0,width:85,height:12}},
      {text:'-x-4=12',box:{x:0,y:14,width:85,height:12}},
      {text:'x=-16',box:{x:0,y:28,width:85,height:12}},
    ]}),
  };
};
get('course').value='cbse';
await import('./app.mjs');

test('OCR draft cannot mark; confirmation exposes first changed step, a separating probe, and edit invalidation', async () => {
  get('photo').files=[new Blob(['synthetic-image-fixture-for-UI-only'],{type:'image/png'})];
  await get('photo').dispatch('change');
  assert.match(get('scan-status').textContent,/Draft ready: 3 detected lines/);
  const rr=get('rows').children;
  for (const row of rr) {
    const include=row.children[0]; include.checked=true; include.dispatch('change');
  }
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/Confirm the original equation/);
  assert.equal(get('probe').hidden,true);
  for (const row of rr) {
    const confirm=row.children[2].children[0];
    confirm.checked=true; confirm.dispatch('change');
  }
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/No verdict was issued/);
  get('anchor-check').checked=true;get('anchor-check').dispatch('change');
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/Line 2 · First verified change/);
  assert.match(get('verdict').words(),/Line 3 · Not checked/);
  assert.match(get('probe-question').textContent,/−3\(y−2\)/);
  assert.equal(get('probe').hidden,false);
  get('answer').value='-3y-6'; get('probe-form').dispatch('submit');
  assert.match(get('probe-result').words(),/not a confirmed misconception/);
  assert.match(get('probe-result').words(),/Exact expansion: −3y\+6/);
  rr[1].children[1].value='-x+4=12'; rr[1].children[1].dispatch('input');
  get('verify').dispatch('click');
  assert.equal(get('anchor-check').checked,false);
  assert.match(get('verdict').words(),/No verdict was issued/);
  assert.equal(get('probe').hidden,true);
  get('clear').dispatch('click');
});

test('partial crop keeps the source visible, maps boxes, withholds a whole-question verdict, and clears consent on reread', async () => {
  get('photo').files=[new Blob(['synthetic-page'],{type:'image/png'})];
  await get('photo').dispatch('change');
  get('select-region').dispatch('click');
  img.dispatch('click',{clientX:5,clientY:20});
  img.dispatch('click',{clientX:95,clientY:70});
  assert.equal(get('region').style.left,'5%');
  await get('read-region').dispatch('click');
  assert.equal(sentCropped,true);
  assert.equal(get('photo-view').hidden,false);
  const rr=get('rows').children;
  assert.equal(rr.length,2);
  rr[0].children[1].dispatch('focus');
  assert.equal(get('crop').style.top,'22%');
  for (const row of rr) {
    row.children[0].checked=true;row.children[0].dispatch('change');
    row.children[2].children[0].checked=true;row.children[2].children[0].dispatch('change');
  }
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/No verdict was issued/);
  get('anchor-check').checked=true; get('anchor-check').dispatch('change');get('verify').dispatch('click');
  assert.match(get('verdict').words(),/Selected steps only.*not a pass/);
  await get('read-full').dispatch('click');
  assert.equal(get('anchor-check').checked,false);
  assert.equal(get('region').hidden,true);
  assert.equal(sentCropped,false);
});

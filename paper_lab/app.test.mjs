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
let clockMs=100;
const systemNow=Date.now;
Date.now=()=>clockMs;
const local=new Map();
globalThis.window={localStorage:{
  getItem:key=>local.get(key)??null,
  setItem:(key,value)=>local.set(key,value),
  removeItem:key=>local.delete(key),
}};
test.after(()=>{Date.now=systemNow;});
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

test('verified distribution opens a fresh task, separates form from correctness, and keeps hint evidence after recheck', () => {
  get('example').dispatch('click');
  assert.equal(get('retry').hidden,true);
  const rr=get('rows').children;
  rr[0].children[2].children[0].checked=true;rr[0].children[2].children[0].dispatch('change');
  get('verify').dispatch('click');
  assert.equal(get('retry').hidden,true);
  rr[1].children[2].children[0].checked=true;rr[1].children[2].children[0].dispatch('change');
  get('verify').dispatch('click');
  assert.equal(get('retry').hidden,false);
  assert.match(get('retry-question').textContent,/2−4\(2z−3\)/);
  assert.match(get('curriculum').words(),/We Distribute/);
  get('answer').value='-3(y-2)';get('probe-form').dispatch('submit');
  assert.match(get('probe-result').words(),/Equivalent so far/);
  assert.doesNotMatch(get('probe-result').words(),/Exact expansion/);
  get('answer').value='6-3y';get('probe-form').dispatch('submit');
  assert.match(get('probe-result').words(),/This new step is correct/);
  get('retry-answer').value='2−4(2z−3)';get('retry-form').dispatch('submit');
  assert.match(get('retry-result').textContent,/Equivalent so far/);
  assert.match(get('retry-evidence').textContent,/fully correct response is not recorded/);
  get('retry-hint').dispatch('click');
  get('verify').dispatch('click');
  assert.equal(get('retry-hint-text').hidden,false);
  get('retry-answer').value='14-8z';get('retry-form').dispatch('submit');
  assert.match(get('retry-evidence').textContent,/First readable response: Equivalent so far/);
  assert.match(get('retry-evidence').textContent,/fully correct response followed a hint/);
});

test('delayed review UI requires opt-in, hides prompt before the real due time, and locks the first readable result', async () => {
  assert.equal(local.size,0);
  assert.equal(get('delayed-save').hidden,false);
  get('delayed-save').dispatch('click');
  assert.equal(local.size,1);
  assert.equal(get('delayed-form').hidden,true);
  assert.equal(get('delayed-prompt').textContent,'');
  get('clear').dispatch('click');
  assert.equal(local.size,1,'clearing the photo does not clear explicitly saved practice');
  const card1=get('delayed-status').textContent;
  await import('./app.mjs?early-reload');
  assert.equal(get('delayed-status').textContent,card1);
  assert.equal(get('delayed-prompt').textContent,'');
  clockMs+=86400000;
  await import('./app.mjs?due-reload');
  assert.equal(get('delayed-form').hidden,false);
  assert.match(get('delayed-prompt').textContent,/3−5\(3w−4\)/);
  get('delayed-answer').value='??';get('delayed-form').dispatch('submit');
  assert.match(get('delayed-status').textContent,/No response was recorded/);
  get('delayed-answer').value='-1-15w';get('delayed-form').dispatch('submit');
  assert.match(get('delayed-status').textContent,/not equivalent/);
  assert.equal(get('delayed-answer').value,'');
  await import('./app.mjs?post-result');
  assert.equal(get('delayed-form').hidden,true);
  assert.equal(get('delayed-prompt').textContent,'');
  assert.match(get('delayed-status').textContent,/not equivalent/);
  get('delayed-clear').dispatch('click');
  assert.equal(local.size,0);
  assert.equal(get('delayed').hidden,true);
});

const savedFetch = globalThis.fetch;
const photo = name => new Blob([name],{type:'image/png'});
const loadPhoto = name => {
  get('photo').files=[photo(name)];
  return get('photo').dispatch('change');
};
const response = (lines=[], image={width:100,height:100})=>({
  ok:true,json:async()=>({status:'draft',image,lines})
});
const replyLine = text => ({text,box:{x:1,y:1,width:80,height:10}});
const defer = () => {
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {resolve,promise};
};
async function correctedDraft() {
  globalThis.fetch=savedFetch;
  await loadPhoto('synthetic A');
  const rows=get('rows').children;
  rows[1].children[1].value='-x-4 = 12';
  rows[1].children[1].dispatch('input');
  for(const row of rows.slice(0,2)) {
    const [pick,,label]=row.children;
    pick.checked=true;pick.dispatch('change');
    label.children[0].checked=true;label.children[0].dispatch('change');
  }
  get('anchor-check').checked=true;
  get('anchor-check').dispatch('change');
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/First verified change/);
  return rows;
}

test('unsuccessful rereads keep the existing rows, their confirmations, region, and verdict',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  const rows=await correctedDraft(), verdict=get('verdict').words();
  get('select-region').dispatch('click');
  img.dispatch('click',{clientX:5,clientY:20});
  img.dispatch('click',{clientX:95,clientY:70});
  const failures=[
    () => ({ok:false,json:async()=>({error:'Offline'})}),
    () => ({ok:true,json:async()=>{throw new Error('malformed JSON');}}),
    () => response([]),
    () => response([replyLine('  ')]),
    () => response([replyLine('x=17')],{width:101,height:100}),
    () => response([replyLine('x=17'),{text:'x=12',box:{x:99,y:1,width:5,height:10}}]),
  ];
  for(const failure of failures) {
    globalThis.fetch=async()=>failure();
    await get('read-full').dispatch('click');
    assert.equal(get('rows').children,rows);
    assert.equal(rows[1].children[1].value,'-x-4 = 12');
    assert.equal(rows[1].children[2].children[0].checked,true);
    assert.equal(get('anchor-check').checked,true);
    assert.equal(get('region').hidden,false);
    assert.equal(get('verdict').words(),verdict);
    assert.match(get('scan-status').textContent,/Kept your current work/);
  }
  const create = document.createElement;
  try {
    document.createElement=tag=>tag==='canvas'?{getContext:()=>null}:create(tag);
    globalThis.fetch=async()=>{assert.fail('failed crop encoding must not fetch');};
    await get('read-region').dispatch('click');
  } finally {document.createElement=create;}
  assert.equal(get('rows').children,rows);
  globalThis.fetch=async()=>response([replyLine('x=17'),replyLine('x=17')]);
  await get('read-full').dispatch('click');
  assert.notEqual(get('rows').children,rows);
  assert.ok(get('rows').children.every(r=>!r.children[0].checked&&!r.children[2].children[0].checked));
  assert.equal(get('anchor-check').checked,false);
  assert.equal(get('region').hidden,true);
  assert.doesNotMatch(get('verdict').words(),/First verified change/);
});

test('an edit or region change wins against a delayed result, including after fetch resolves',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  const rows=await correctedDraft();
  const body=defer(), entered=defer();
  globalThis.fetch=async()=>({ok:true,json:()=>{entered.resolve();return body.promise;}});
  const pending=get('read-full').dispatch('click');
  await entered.promise;
  assert.equal(get('rows').children,rows);
  rows[1].children[1].value='x=99';
  rows[1].children[1].dispatch('input');
  body.resolve(await response([replyLine('x=10')]).json());
  await pending;
  assert.equal(rows[1].children[1].value,'x=99');
  assert.equal(get('rows').children,rows);
  assert.match(get('scan-status').textContent,/not applied/);

  const later=defer();
  globalThis.fetch=()=>later.promise;
  const reread=get('read-full').dispatch('click');
  get('select-region').dispatch('click');
  img.dispatch('click',{clientX:5,clientY:20});
  img.dispatch('click',{clientX:95,clientY:70});
  later.resolve(response([replyLine('x=11')]));
  await reread;
  assert.equal(get('rows').children,rows);
  assert.equal(get('region').hidden,false);
});

test('latest request and photo win even if stale fetch ignores abort, and Clear wins too',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  await correctedDraft();
  const older=defer(), newer=defer();
  globalThis.fetch=()=>older.promise;
  const stale=get('read-full').dispatch('click');
  globalThis.fetch=()=>newer.promise;
  const current=get('read-full').dispatch('click');
  newer.resolve(response([replyLine('x=20')]));
  await current;
  const newRows=get('rows').children;
  older.resolve(response([replyLine('x=10')]));
  await stale;
  assert.equal(get('rows').children,newRows);
  assert.equal(newRows[0].children[1].value,'x=20');

  const oldPhoto=defer();
  globalThis.fetch=()=>oldPhoto.promise;
  const old=get('read-full').dispatch('click');
  globalThis.fetch=async()=>response([replyLine('x=30')]);
  await loadPhoto('synthetic B');
  oldPhoto.resolve(response([replyLine('x=12')]));
  await old;
  assert.equal(get('rows').children[0].children[1].value,'x=30');

  const clearPending=defer();globalThis.fetch=()=>clearPending.promise;
  const finishing=get('read-full').dispatch('click');
  get('clear').dispatch('click');
  clearPending.resolve(response([replyLine('x=50')]));
  await finishing;
  assert.deepEqual(get('rows').children.map(r=>r.children[1].value),['','']);
  assert.match(get('scan-status').textContent,/No photo loaded/);
});

test('initial empty draft retains typing and enables crop via valid image metadata',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  globalThis.fetch=async()=>response();
  await loadPhoto('synthetic initial blank');
  assert.deepEqual(get('rows').children.map(r=>r.children[1].value),['','']);
  assert.equal(get('select-region').disabled,false);
  assert.match(get('scan-status').textContent,/No text detected/);
});

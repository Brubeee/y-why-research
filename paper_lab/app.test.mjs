import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEW_KEY,REVIEW_DELAY_MS} from './delayed_review.mjs';

let decodeCandidate = () => Promise.resolve();
class Element {
  constructor() { this.children=[]; this.events={}; this.textContent=''; this.value=''; this.hidden=false; this.style={}; this.attributes={}; }
  append(...v) { this.children.push(...v); }
  replaceChildren(...v) { this.children=[...v]; }
  addEventListener(k,f) { this.events[k]=f; }
  setAttribute(k,v) { this.attributes[k]=v; }
  removeAttribute(k) { delete this[k]; }
  focus() { globalThis.document.activeElement=this; }
  decode() { return decodeCandidate(this); }
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
const windowEvents = new Map();
// Cache-busting reload tests reuse the fake DOM; retain the latest document's listener.
globalThis.addEventListener=(type, callback)=>windowEvents.set(type,callback);
const storageEvent=(key,storageArea,newValue=null)=>windowEvents.get('storage')?.({key,storageArea,newValue});
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
get('course').value='';
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

test('verified distribution opens a fresh task, separates form from correctness, and keeps hint evidence after recheck', async () => {
  await import('./app.mjs?fresh-separator-correct');
  get('example').dispatch('click');
  assert.equal(get('retry').hidden,true);
  const rr=get('rows').children;
  rr[0].children[2].children[0].checked=true;rr[0].children[2].children[0].dispatch('change');
  get('verify').dispatch('click');
  assert.equal(get('retry').hidden,true);
  rr[1].children[2].children[0].checked=true;rr[1].children[2].children[0].dispatch('change');
  get('verify').dispatch('click');
  assert.equal(get('retry').hidden,true,'practice waits until the separator closes');
  assert.doesNotMatch(get('curriculum').words(),/Chapter 6/);
  get('course').value='ncert-g8-p1';get('course').dispatch('change');
  assert.match(get('curriculum').words(),/We Distribute/);
  get('course').value='';get('course').dispatch('change');
  get('answer').value='-3(y-2)';get('probe-form').dispatch('submit');
  assert.match(get('probe-result').words(),/No response was recorded/);
  assert.doesNotMatch(get('probe-result').words(),/Equivalent|Exact expansion/);
  assert.equal(get('retry').hidden,true);
  get('answer').value='6-3y';get('probe-form').dispatch('submit');
  assert.match(get('probe-result').words(),/This new step is correct/);
  assert.equal(get('retry').hidden,false);
  assert.match(get('retry-question').textContent,/2−4\(2z−3\)/);
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

test('isolated source-confirmed canceled row is skipped, not erased; later real error keeps its displayed line number',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  function source(text,y,height=12) {return {text,box:{x:1,y,width:80,height}};}
  const lines=[source('3x+9=0',1),source('x=3',19),source('x=-3',37),source('x=5',55)];
  const act=row=>{
    row.children[0].checked=true;row.children[0].dispatch('change');
    row.children[2].children[0].checked=true;row.children[2].children[0].dispatch('change');
  };
  const attest=()=>{get('anchor-check').checked=true;get('anchor-check').dispatch('change');};
  globalThis.fetch=async()=>response(lines);
  await loadPhoto('synthetic strike fixture');
  let rows=get('rows').children;
  [0,2,3].forEach(i=>act(rows[i]));
  attest();get('verify').dispatch('click');
  assert.match(get('verdict').words(),/gap can be skipped only/);
  const canceled=rows[1].children[3].children[0];
  assert.equal(canceled.disabled,false);
  canceled.dispatch('focus');
  assert.equal(get('crop').style.top,'19%');
  canceled.checked=true;canceled.dispatch('change');
  assert.equal(get('anchor-check').checked,false);
  attest();get('verify').dispatch('click');
  assert.match(get('verdict').words(),/not checked: line 2/);
  assert.match(get('verdict').words(),/Line 3 · Same solution set/);
  assert.match(get('verdict').words(),/Line 4 · First verified change/);
  assert.equal(rows[1].children[1].value,'x=3');
  globalThis.fetch=async()=>response();
  await get('read-full').dispatch('click');
  assert.equal(canceled.checked,true);
  assert.match(get('verdict').words(),/Line 4 · First verified change/);

  rows[1].children[1].value='x=4';rows[1].children[1].dispatch('input');
  assert.equal(canceled.checked,false);
  assert.equal(get('anchor-check').checked,false);
  attest();get('verify').dispatch('click');
  assert.match(get('verdict').words(),/gap can be skipped only/);
  canceled.checked=true;canceled.dispatch('change');
  rows[1].children[0].checked=true;rows[1].children[0].dispatch('change');
  assert.equal(canceled.checked,false);
  assert.equal(rows[1].children[2].children[0].checked,false);

  globalThis.fetch=async()=>response(lines);
  await get('read-full').dispatch('click');
  assert.equal(get('rows').children[1].children[3].children[0].checked,false);
  assert.equal(get('anchor-check').checked,false);
  globalThis.fetch=async()=>response([lines[0],source('x=3 x=-3',18,30),lines[2],lines[3]]);
  await get('read-full').dispatch('click');
  rows=get('rows').children;
  const overlap=rows[1].children[3].children[0];
  assert.equal(overlap.disabled,true);
  [0,2,3].forEach(i=>act(rows[i]));
  overlap.checked=true;overlap.dispatch('change'); // even a scripted change fails the guard
  assert.equal(overlap.checked,false);
  attest();get('verify').dispatch('click');
  assert.match(get('verdict').words(),/gap can be skipped only/);
  get('example').dispatch('click');
  assert.ok(get('rows').children.every(row=>row.children.length===3));
});

test('full JPEG shows usable text but never assigns source row geometry even when dimensions match',async t=>{
  const original=[img.naturalWidth,img.naturalHeight];
  t.after(()=>{
    [img.naturalWidth,img.naturalHeight]=original;
    globalThis.fetch=savedFetch;get('clear').dispatch('click');
  });
  globalThis.fetch=async (url,req)=>{
    assert.equal(url,'/api/ocr');
    assert.equal(req.headers['Content-Type'],'image/jpeg');
    return {ok:true,json:async()=>({status:'draft',image:{width:640,height:440},lines:[
      {text:'3x+12=24',box:{x:87,y:98,width:211,height:43}},
      {text:'3x=12',box:{x:87,y:158,width:108,height:43}},
      {text:'x=4',box:{x:87,y:218,width:81,height:43}},
    ]})};
  };
  // Mocked observed browser dimensions, not a native EXIF decoder result.
  // Mirror/180° variants can have the same dimensions despite different pixels.
  for (const [width,height,cropEnabled] of [[640,440,true],[440,640,false]]) {
    [img.naturalWidth,img.naturalHeight]=[width,height];
    get('photo').files=[new Blob(['mock jpeg orientation'],{type:'image/jpeg'})];
    await get('photo').dispatch('change');
    img.dispatch('load');
    assert.match(get('scan-status').textContent,/Draft ready: 3 detected lines/);
    assert.equal(get('select-region').disabled,!cropEnabled);
    const rows=get('rows').children;
    assert.equal(rows[1].children[1].value,'3x=12');
    assert.equal(rows[1].children.length,3,'No checkbox may be backed by an untrusted JPEG box');
    rows[1].children[1].dispatch('focus');
    assert.equal(get('crop').hidden,true,'Raw server JPEG coordinates cannot produce a visible highlight');
  }
});

test('relevant cross-tab localStorage events refresh review UI and invalidate only its unsubmitted draft', t=>{
  const store=window.localStorage;
  const sessionStorage={};
  const ans=get('delayed-answer'), form=get('delayed-form'), prompt=get('delayed-prompt'), status=get('delayed-status');
  const oldClock=clockMs;
  clockMs=REVIEW_DELAY_MS+100;
  t.after(()=>{
    local.clear();clockMs=oldClock;
    windowEvents.get('focus')?.();document.activeElement=null;
  });
  const record={version:1,item:'negative-distribution-delayed-w-v1',dueAt:REVIEW_DELAY_MS,outcome:null};
  const set=(r)=>{const serialized=JSON.stringify(r);store.setItem(REVIEW_KEY,serialized);return serialized;};
  const due=set(record);
  storageEvent(REVIEW_KEY,store,due);
  assert.equal(form.hidden,false,'another tab makes a due review immediately visible');
  assert.match(prompt.textContent,/3−5\(3w−4\)/);
  ans.value='unsent';
  ans.focus();
  store.setItem('unrelated','true');
  storageEvent('unrelated',store,'true');
  storageEvent(REVIEW_KEY,sessionStorage);
  storageEvent(null,sessionStorage);
  assert.equal(ans.value,'unsent','unrelated localStorage and all sessionStorage events preserve the draft');
  assert.equal(document.activeElement,ans);

  const readyReplacement=set({...record,dueAt:REVIEW_DELAY_MS+1});
  storageEvent(REVIEW_KEY,store,readyReplacement);
  assert.equal(form.hidden,false);
  assert.equal(ans.value,'','even a ready→ready external replacement invalidates the old draft');
  assert.equal(document.activeElement,ans,'no focus reset when readiness remains unchanged');

  ans.value='another unsent draft';
  const completed=set({...record,outcome:'unfinished'});
  storageEvent(REVIEW_KEY,store,readyReplacement); // queued event payload is stale; the store is authoritative
  assert.equal(form.hidden,true);
  assert.equal(ans.value,'');
  assert.equal(prompt.textContent,'');
  assert.match(status.textContent,/equivalent but not fully simplified/);
  assert.equal(store.getItem(REVIEW_KEY),completed);

  store.removeItem(REVIEW_KEY);
  storageEvent(REVIEW_KEY,store);
  assert.equal(get('delayed-clear').hidden,true);
  const future=set({...record,dueAt:clockMs+REVIEW_DELAY_MS});
  storageEvent(REVIEW_KEY,store,future);
  assert.match(status.textContent,/Available after/);
  assert.equal(prompt.textContent,'');
  assert.equal(get('delayed-refresh').hidden,false);

  storageEvent(REVIEW_KEY,store,set(record));
  assert.equal(form.hidden,false);
  ans.value='unsubmitted at clear';
  get('probe-question').focus();
  local.clear();
  storageEvent(null,store);
  assert.equal(form.hidden,true);
  assert.equal(ans.value,'');
  assert.equal(prompt.textContent,'');
  assert.equal(get('delayed-refresh').hidden,true);
  assert.equal(get('delayed-clear').hidden,true);
  assert.equal(document.activeElement,get('probe-question'),'never steals focus elsewhere in the app');
  form.dispatch('submit');
  assert.equal(store.getItem(REVIEW_KEY),null,'clear and stale form submission cannot recreate a review');
});

async function startSeparator(name){
  await import('./app.mjs?'+name);
  get('example').dispatch('click');
  const rows=get('rows').children;
  for(const row of rows.slice(0,2)){
    const confirm=row.children[2].children[0];confirm.checked=true;confirm.dispatch('change');
  }
  get('verify').dispatch('click');
  return rows;
}
const sendProbe=value=>{get('answer').value=value;get('probe-form').dispatch('submit');};
test('hidden practice events cannot coach; neutral retries do not consume; an unmodeled first answer consumes without evidence',async()=>{
  await startSeparator('separator-unmodeled');
  const probe=get('probe-form'), retry=get('retry'), result=get('probe-result');
  assert.equal(probe.hidden,false);
  assert.equal(retry.hidden,true);
  get('retry-hint').dispatch('click');
  get('retry-answer').value='14-8z';get('retry-form').dispatch('submit');
  assert.equal(retry.hidden,true);
  for(const text of ['', '-3(y-2)', '6-3z', 'log(y)']) {
    sendProbe(text);
    assert.equal(probe.hidden,false);
    assert.match(result.words(),/No response was recorded/);
    assert.doesNotMatch(result.words(),/Exact expansion|Equivalent/);
  }
  sendProbe('-3y-7');
  assert.equal(probe.hidden,true);
  assert.equal(retry.hidden,false);
  assert.equal(get('retry-hint-text').hidden,true);
  assert.match(get('retry-evidence').textContent,/No readable response yet/);
  assert.match(result.words(),/No diagnostic evidence/);
  const first=result.words();
  sendProbe('-3y-6');get('probe-skip').dispatch('click');
  assert.equal(result.words(),first);
  get('verify').dispatch('click');
  assert.equal(result.words(),first);
});
test('skip unlocks practice only and the hint and skip survive exact recheck and same-page edits',async()=>{
  const rows=await startSeparator('separator-skip');
  const result=get('probe-result');
  get('probe-skip').dispatch('click');
  assert.match(result.words(),/No diagnostic evidence|no diagnostic evidence/);
  assert.equal(get('probe-form').hidden,true);
  get('retry-hint').dispatch('click');
  assert.equal(get('retry-hint-text').hidden,false);
  sendProbe('-3y-6');
  assert.doesNotMatch(result.words(),/matches one simulated rule/);
  const field=rows[1].children[1];
  field.value='-x-2=12';field.dispatch('input');
  assert.equal(get('probe').hidden,true);
  assert.equal(get('retry').hidden,true);
  get('probe-skip').dispatch('click');sendProbe('-3y-6');
  assert.equal(result.words().trim(),'');
  field.value='-x-4=12';field.dispatch('input');
  const confirm=rows[1].children[2].children[0];confirm.checked=true;confirm.dispatch('change');
  get('verify').dispatch('click');
  assert.equal(get('probe-form').hidden,true);
  assert.equal(get('retry-hint-text').hidden,false);
  assert.match(result.words(),/Separator skipped/);
  get('retry-answer').value='14-8z';get('retry-form').dispatch('submit');
  assert.match(get('retry-evidence').textContent,/followed a hint/);
});
test('first modeled evidence is immutable and never attached to a newly verified pair after editing',async()=>{
  const rows=await startSeparator('separator-modeled');
  sendProbe('-3y-6');
  const result=get('probe-result'),first=result.words();
  assert.match(first,/not a confirmed misconception/);
  assert.match(first,/Exact expansion: −3y\+6/);
  sendProbe('6-3y');
  assert.equal(result.words(),first);
  get('verify').dispatch('click');
  assert.equal(result.words(),first);
  for (const [i,text] of ['-(x-5)=12','-x-5=12'].entries()){
    const field=rows[i].children[1];field.value=text;field.dispatch('input');
    const c=rows[i].children[2].children[0];c.checked=true;c.dispatch('change');
  }
  assert.equal(get('probe').hidden,true);
  sendProbe('-3y-6');
  assert.equal(result.words().trim(),'');
  get('verify').dispatch('click');
  assert.equal(get('probe-form').hidden,true);
  assert.match(result.words(),/no evidence was recorded for this source/i);
  assert.doesNotMatch(result.words(),/Exact expansion|matches one simulated rule/);
});

test('a cancelled picker or rejected MIME, empty, or oversize selection preserves confirmed photo work',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  const rows=await correctedDraft(), verdict=get('verdict').words(), src=img.src, picker=get('photo');
  get('select-region').dispatch('click');
  img.dispatch('click',{clientX:5,clientY:20});img.dispatch('click',{clientX:95,clientY:70});
  rows[1].children[1].dispatch('focus');
  const before=get('scan-status').textContent;
  globalThis.fetch=async()=>assert.fail('cancelled and rejected picks must not reach OCR');
  picker.files=[];await picker.dispatch('change');
  assert.equal(get('scan-status').textContent,before);
  const limit=6*1024*1024;
  for(const file of [
    new Blob(['synthetic unsupported file'],{type:'application/pdf'}),
    new Blob([],{type:'image/jpeg'}),
    new Blob([new Uint8Array(limit+1)],{type:'image/jpeg'}),
  ]){
    picker.files=[file];picker.value='mock selected filename';await picker.dispatch('change');
    assert.equal(picker.value,'');
    assert.equal(img.src,src);
    assert.equal(get('photo-view').hidden,false);
    assert.equal(get('region').hidden,false);
    assert.equal(get('region').style.left,'5%');
    assert.equal(get('crop').hidden,false);
    assert.equal(get('rows').children,rows);
    assert.equal(rows[1].children[1].value,'-x-4 = 12');
    assert.equal(rows[1].children[0].checked,true);
    assert.equal(rows[1].children[2].children[0].checked,true);
    assert.equal(get('anchor-check').checked,true);
    assert.equal(get('verdict').words(),verdict);
    assert.match(get('scan-status').textContent,/Choose a nonempty PNG or JPEG no larger than 6 MiB/);
  }
});

test('a rejected pick leaves the current OCR owner and edit guard intact; a real PNG replacement wins',async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  await correctedDraft();
  const picker=get('photo');
  async function rejectPick(){
    picker.files=[new Blob([],{type:'image/jpeg'})];
    picker.value='empty JPEG';
    await picker.dispatch('change');
    assert.equal(picker.value,'');
  }
  function pendingReread(){
    const d=defer();let signal;
    globalThis.fetch=(url,opts)=>{signal=opts.signal;return d.promise;};
    const task=get('read-full').dispatch('click');
    assert.ok(signal);
    return {signal,task,done:d.resolve};
  }
  const unchanged=pendingReread();
  await rejectPick();assert.equal(unchanged.signal.aborted,false);
  unchanged.done(response([replyLine('x=10')]));await unchanged.task;
  assert.equal(get('rows').children[0].children[1].value,'x=10','still-current OCR may commit');

  const changed=pendingReread();
  const row=get('rows').children[0].children[1];
  row.value='x=99';row.dispatch('input');
  await rejectPick();assert.equal(changed.signal.aborted,false);
  changed.done(response([replyLine('x=11')]));await changed.task;
  assert.equal(get('rows').children[0].children[1],row);
  assert.equal(row.value,'x=99','prior edit remains authoritative');
  assert.match(get('scan-status').textContent,/not applied/);

  const old=pendingReread(), oldSource=img.src;
  await rejectPick();assert.equal(old.signal.aborted,false);
  const replacement=photo('new valid PNG');
  globalThis.fetch=async(url,opts)=>{
    assert.equal(opts.body,replacement);
    assert.equal(opts.headers['Content-Type'],'image/png');
    return response([replyLine('x=30')]);
  };
  picker.files=[replacement];await picker.dispatch('change');
  assert.equal(old.signal.aborted,true);
  assert.notEqual(img.src,oldSource);
  assert.equal(get('anchor-check').checked,false);
  assert.equal(get('region').hidden,true);
  const rows=get('rows').children;
  assert.equal(rows[0].children[1].value,'x=30');
  old.done(response([replyLine('x=12')]));await old.task; // mocked transport ignores abort
  assert.equal(get('rows').children,rows);
  assert.equal(rows[0].children[1].value,'x=30');
});

test('server rejection of a nominal replacement keeps the verified active photo', async t=>{
  t.after(()=>{globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  const rows=await correctedDraft(), source=img.src, verdict=get('verdict').words();
  get('select-region').dispatch('click');
  img.dispatch('click',{clientX:5,clientY:20});img.dispatch('click',{clientX:95,clientY:70});
  rows[1].children[1].dispatch('focus');
  globalThis.fetch=async()=>({ok:false,status:422,json:async()=>({status:'error',error:'The local OCR engine could not decode this image.'})});
  await loadPhoto('synthetic nominal replacement');
  assert.equal(img.src,source);
  assert.equal(get('rows').children,rows);
  assert.equal(get('anchor-check').checked,true);
  assert.equal(get('region').hidden,false);
  assert.equal(get('crop').hidden,false);
  assert.equal(get('verdict').words(),verdict);
  assert.match(get('scan-status').textContent,/could not decode.*not replaced/i);
});

test('transient OCR and detached preview failures keep the checked source; a blank replacement remains crop-ready', async t=>{
  const decode=decodeCandidate, revoke=URL.revokeObjectURL, abandoned=[];
  URL.revokeObjectURL=(url)=>{abandoned.push(url);revoke(url);};
  t.after(()=>{decodeCandidate=decode;URL.revokeObjectURL=revoke;globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  const rows=await correctedDraft(), source=img.src, verdict=get('verdict').words();
  globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({status:'error',error:'The local OCR engine is busy. Try again.'})});
  await loadPhoto('unavailable');
  assert.equal(img.src,source);assert.equal(get('rows').children,rows);
  assert.match(get('scan-status').textContent,/temporarily unavailable.*not replaced/i);
  let detached;
  decodeCandidate=node=>{detached=node;return Promise.reject(new Error('invalid test image'));};
  globalThis.fetch=async()=>response([replyLine('x=18')]);
  await loadPhoto('unopenable preview');
  assert.equal(img.src,source);assert.equal(get('rows').children,rows);
  assert.equal(get('verdict').words(),verdict);
  assert.match(get('scan-status').textContent,/not replaced.*could not be opened/i);
  assert.equal(detached.src,undefined);assert.equal(abandoned.length,1);assert.notEqual(abandoned[0],source);
  decodeCandidate=decode;globalThis.fetch=async()=>response();
  await loadPhoto('valid blank');
  assert.notEqual(img.src,source);assert.ok(abandoned.includes(source));
  assert.deepEqual(get('rows').children.map(r=>r.children[1].value),['','']);
  assert.equal(get('select-region').disabled,false);
  assert.equal(get('anchor-check').checked,false);
  assert.match(get('scan-status').textContent,/No text detected in the new photo/);
});

test('staged photo cannot override old-work edits or rereads, a newer eligible pick, Clear, or Example',async t=>{
  const decode=decodeCandidate;
  t.after(()=>{decodeCandidate=decode;globalThis.fetch=savedFetch;get('clear').dispatch('click');});
  const rows=await correctedDraft(), source=img.src;
  function staged(name='pending candidate'){
    const net=defer();let signal;
    globalThis.fetch=(_path,opts)=>{signal=opts.signal;return net.promise;};
    const task=loadPhoto(name);
    return {net,task,signal};
  }
  const edited=staged();
  const field=rows[1].children[1];
  field.value='x=99';field.dispatch('input');
  edited.net.resolve(response([replyLine('x=70')]));await edited.task;
  assert.equal(img.src,source);assert.equal(field.value,'x=99');
  assert.match(get('scan-status').textContent,/selected photo was not applied/);

  const existing=staged();
  globalThis.fetch=async()=>response([replyLine('x=22')]);
  await get('read-full').dispatch('click');
  assert.equal(existing.signal.aborted,true);
  existing.net.resolve(response([replyLine('x=71')]));await existing.task;
  assert.equal(img.src,source);assert.equal(get('rows').children[0].children[1].value,'x=22');

  // Candidate one is in preview decode, not fetch. Cancellation must still
  // detach its staged resource, and a late decode must not alter the new work.
  const decodeStage=defer(), entered=defer();
  let preview;
  decodeCandidate=node=>{preview=node;entered.resolve();return decodeStage.promise;};
  globalThis.fetch=async()=>response([replyLine('x=72')]);
  const late=loadPhoto('decode in progress');await entered.promise;
  decodeCandidate=decode;
  globalThis.fetch=async()=>response([replyLine('x=33')]);
  await loadPhoto('current replacement');
  assert.equal(preview.src,undefined);
  decodeStage.resolve();await late;
  assert.equal(get('rows').children[0].children[1].value,'x=33');

  for (const action of ['clear','example']){
    const c=staged();
    get(action).dispatch('click');
    assert.equal(c.signal.aborted,true);
    c.net.resolve(response([replyLine('x=73')]));await c.task;
    assert.equal(get('photo-view').hidden,true);
    assert.doesNotMatch(get('rows').children.map(r=>r.children[1].value).join(),/x=73/);
  }
});

test('course choice changes only the review reference and a draft edit clears it', async () => {
  await import('./app.mjs?fresh-course-reference');
  const course = get('course'), output = get('curriculum');
  course.value='ncert-g7-p2'; course.dispatch('change');
  const rr=get('rows').children;
  for (const [i,value] of ['2x+3=9','x=3'].entries()) {
    rr[i].children[1].value=value; rr[i].children[1].dispatch('input');
  }
  get('verify').dispatch('click');
  assert.match(output.words(),/Check a supported equation/);
  for (const row of rr) {
    row.children[2].children[0].checked=true; row.children[2].children[0].dispatch('change');
  }
  get('verify').dispatch('click');
  assert.match(output.words(),/Chapter 7: Finding the Unknown/);
  const verdict = get('verdict').words();
  assert.match(verdict,/Same solution set/);
  for (const profile of ['', 'ncert-g8-p1', 'cbse', 'myp']) {
    course.value=profile; course.dispatch('change');
    assert.doesNotMatch(output.words(),/Chapter [67]/);
    assert.equal(get('verdict').words(),verdict);
  }
  course.value='ncert-g7-p2'; course.dispatch('change');
  assert.match(output.words(),/Chapter 7/);
  rr[0].children[1].value='x^2=9'; rr[0].children[1].dispatch('input');
  assert.doesNotMatch(output.words(),/Chapter 7/);
  rr[0].children[2].children[0].checked=true; rr[0].children[2].children[0].dispatch('change');
  get('verify').dispatch('click');
  assert.match(output.words(),/Check a supported equation/);
});

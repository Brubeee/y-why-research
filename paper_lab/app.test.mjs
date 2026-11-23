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
globalThis.fetch = async (url,init) => {
  assert.equal(url,'/api/ocr'); assert.equal(init.method,'POST'); assert.equal(init.headers['Content-Type'],'image/png');
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
  assert.match(get('verdict').words(),/Line 2 · First verified change/);
  assert.match(get('verdict').words(),/Line 3 · Not checked/);
  assert.match(get('probe-question').textContent,/−3\(y−2\)/);
  assert.equal(get('probe').hidden,false);
  get('answer').value='-3y-6'; get('probe-form').dispatch('submit');
  assert.match(get('probe-result').words(),/not a confirmed misconception/);
  assert.match(get('probe-result').words(),/Exact expansion: −3y\+6/);
  rr[1].children[1].value='-x+4=12'; rr[1].children[1].dispatch('input');
  get('verify').dispatch('click');
  assert.match(get('verdict').words(),/Line 2 · Needs transcription confirmation/);
  assert.equal(get('probe').hidden,true);
  get('clear').dispatch('click');
});

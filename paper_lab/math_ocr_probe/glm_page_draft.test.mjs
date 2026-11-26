import test from 'node:test';
import assert from 'node:assert/strict';
import {draftGlmFormulaPage,GLM_FORMULA_MODE} from './glm_page_draft.mjs';
import {parseEquation,verifyRows} from '../verify.mjs';

const page = lines => '$$\n\\begin{array}{l}\n'+lines.join(' \\\\\n')+' \\\\\n\\end{array}\n$$';
const good = (raw,more={}) => draftGlmFormulaPage({raw,mode:GLM_FORMULA_MODE,limitHit:false,...more});
const check = draft => {
  const [anchor,...rows] = draft.rows.map(row=>({...row,confirmed:true}));
  return verifyRows({anchor,rows});
};

test('math transport keeps raw, numeric display, stacked grouping and order without a verdict',()=>{
  const raw=page(['5 q + 3 = 4 5','5 q = 4 1', 'q = \\frac {4 1}{5}','q = 8. 2']);
  const d=good(raw,{expectedRows:4});
  assert.equal(d.status,'review-required');
  assert.equal(d.rowCountEvidence,'matches-independent-count');
  assert.equal(d.raw,raw);
  assert.equal(d.rows.length,4);
  assert.ok(d.rows.every(x=>!x.confirmed));
  assert.equal(d.rows[1].rawLatex,'5 q = 4 1');
  assert.deepEqual(d.rows.map(x=>parseEquation(x.text).solution.value),['42/5','41/5','41/5','41/5']);
  assert.equal(check(d).firstIssue,0);
  assert.notEqual(parseEquation('5q=4 1').ok,true);
});

test('grouped numerator cannot be replaced by a flattened equation with the same error index',()=>{
  const both = [good(page(['3(x+2)=30','\\frac{x+2}{3}=4'])),
                good(page(['3(x+2)=30','x+2/3=4']))];
  assert.deepEqual(both.map(d=>check(d).firstIssue),[0,0]);
  assert.deepEqual(both.map(d=>check(d).rows[0].solution.value),['10','10/3']);
  const product=good(page(['3x=9','\\frac{2}{3}\\cdot x=4']));
  assert.equal(check(product).rows[0].solution.value,'6');
  const cancel=good(page(['3x+2=3x+3','2=3','0=1']));
  assert.equal(check(cancel).firstIssue,null);
});

test('does not fix or drop a transient error; count evidence and confirmation are separate',()=>{
  const input=page(['7x+4=53','7x=48','x=7']);
  assert.equal(check(good(input)).firstIssue,0);
  const omitted=page(['7x+4=53','x=7']);
  const d=good(omitted);
  assert.equal(d.status,'review-required');
  assert.equal(d.rowCountEvidence,'not-checked');
  assert.equal(good(omitted,{expectedRows:3}).reason,'independent-count-mismatch');
  const altered=good(page(['7x+4=53','7x=49','x=7']),{expectedRows:3});
  assert.equal(altered.status,'review-required');
  assert.ok(altered.rows.every(row=>row.confirmed===false));
});

test('rejects unknown arrays, prose, nested structure, empty rows and unsupported glyphs',()=>{
  const goodRaw=page(['x+2=4','x=3']);
  const broken=[goodRaw.replace('{l}','{ll}'),
    'notes\n'+goodRaw,goodRaw.replace('x=3','& x=3'),
    goodRaw.replace('x=3','\\begin{array}{l}x=3\\end{array}'),
    goodRaw.replace('x=3','\\frac{x\\\\2}{3}=4'),
    page(['x+2=4','','x=3']),
    ...['x=\\frac{6\\,4}{5}','x=6\t4','x=6\n4','x=\\sqrt{4}',
      'x=..4','x=\\ldots','x=2^3','\\frac{2}{3}x=4','2\\frac{1}{3}x=14',
      '\\frac{2}{3x}=4','y=3'].map(text=>page(['x+2=4',text]))
  ];
  for(const raw of broken) {
    const d=good(raw);
    assert.equal(d.status,'unavailable',raw);
    assert.equal(d.raw,raw);
    assert.deepEqual(d.rows,[]);
  }
  assert.equal(good(page(['1=1','x=x'])).reason,'outside-exact-grammar');
  assert.equal(good(page(Array(13).fill('x=x'))).reason,'unusable-row-structure');
  assert.equal(good(goodRaw,{limitHit:true}).reason,'unverified-generation');
  assert.equal(good(goodRaw,{limitHit:undefined}).reason,'unverified-generation');
  assert.equal(good(goodRaw,{mode:'typed'}).reason,'unverified-generation');
});

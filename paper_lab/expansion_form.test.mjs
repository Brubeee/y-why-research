import assert from 'node:assert/strict';
import test from 'node:test';
import {gradeExpansion} from './expansion_form.mjs';

const source = '−3(y−2)';
const grade = (answer, original = source) => gradeExpansion(answer, original).status;

test('checks exact expanded monomial and integer in either order', () => {
  for (const answer of ['-3y+6','6−3y','−3 y + 6','+6 - 3y'])
    assert.equal(grade(answer),'expanded',answer);
  assert.equal(grade('-q+5','-(q-5)'),'expanded');
  assert.equal(grade('-7+3q','3(q-2)-1'),'expanded');
});

test('separates bracketed equivalence, unfinished arithmetic, and genuine mismatch', () => {
  for (const answer of [source,'−3(y−2)','(-(3y-6))','(-3y+6)'])
    assert.equal(grade(answer),'finish_expansion',answer);
  for (const answer of ['-3y+3*2','-3y+6/1','-3y-3×(-2)','-3y+2+4','-1y-2y+6'])
    assert.equal(grade(answer),'finish_arithmetic',answer);
  for (const answer of ['-3y-2','-3y-6','6+3y','-4y+6'])
    assert.equal(grade(answer),'wrong',answer);
});

test('fresh outside-constant probe cannot be passed by copying or by distributing without combining', () => {
  const fresh='2−4(2z−3)';
  assert.equal(grade(fresh,fresh),'finish_expansion');
  assert.equal(grade('2-8z+12',fresh),'finish_arithmetic');
  assert.equal(grade('14-8z',fresh),'expanded');
  assert.equal(grade('-8z+14',fresh),'expanded');
  assert.equal(grade('-8z-10',fresh),'wrong');
});

test('defers unsupported syntax, wrong variable, non-equivalent unfinished, and scope violations', () => {
  for (const answer of ['','-3y+6=0','6−3x','−3(y+2)','-3y+4 2','6−3Y','y²+6'])
    assert.equal(grade(answer),'unsupported',answer);
  for (const src of ['y','y+0','x+y+1','y/2+6'])
    assert.equal(grade('−3y+6',src),'unsupported',src);
});

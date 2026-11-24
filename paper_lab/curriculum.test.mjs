import test from 'node:test';
import assert from 'node:assert/strict';
import {curriculumReference} from './curriculum.mjs';

test('known textbook-part references map only to their supported skills', () => {
  assert.match(curriculumReference('ncert-g7-p2','linear').reference.label,/Part II, Chapter 7: Finding the Unknown/);
  assert.match(curriculumReference('ncert-g8-p1','distribution').reference.label,/Part I, Chapter 6: We Distribute/);
  assert.equal(curriculumReference('ncert-g7-p2','distribution').reference,null);
  assert.equal(curriculumReference('ncert-g8-p1','linear').reference,null);
});
test('unknown book, unsupported work and IB do not manufacture a chapter', () => {
  for (const skill of ['linear','distribution']) {
    for (const profile of ['', 'cbse', 'other', 'ncert-g8-p2', 'constructor']) {
      assert.equal(curriculumReference(profile,skill).reference,null);
    }
    assert.match(curriculumReference('myp',skill).text,/No year or chapter inferred/);
    assert.match(curriculumReference('myp',skill).reference.label,/framework/);
  }
  for (const profile of ['ncert-g7-p2','ncert-g8-p1','myp']) {
    for (const skill of [null,'unsupported']) assert.equal(curriculumReference(profile,skill).reference,null);
  }
});

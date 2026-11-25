import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { affineReference } from './affine_scope.mjs';
import { verifyRows } from '../verify.mjs';

const cases = JSON.parse(readFileSync(new URL('./phone-affine-cases.json', import.meta.url),'utf8'));
const verify = (literalRows) => {
  const [anchor, ...rows] = literalRows.map(label => {
    const adapted = affineReference(label);
    assert.ok(adapted.parsed, adapted.reason);
    return { text: adapted.text, confirmed: true };
  });
  return verifyRows({anchor,rows});
};

for (const { correct, changed } of cases) {
  assert.equal(correct[0],changed[0]);
  assert.equal(correct.length,changed.length);
  const clean = verify(correct), wrong = verify(changed), suffix = verify(changed.slice(1));
  assert.equal(clean.anchor.status, 'confirmed');
  assert.equal(clean.firstIssue,null);
  assert.ok(clean.rows.every(r => r.status === 'equivalent'));
  assert.equal(wrong.firstIssue,0);
  assert.equal(wrong.rows[0].status,'changed');
  assert.ok(wrong.rows.slice(1).every(r => r.status === 'not-considered'));
  assert.equal(suffix.anchor.status,'confirmed');
  assert.equal(suffix.firstIssue,null);
  assert.ok(suffix.rows.every(r => r.status === 'equivalent'));
}
console.log(`Validated ${cases.length} correct chains, ${cases.length} first errors on written line 2, and ${cases.length} self-consistent changed suffixes. No images or OCR evidence.`);

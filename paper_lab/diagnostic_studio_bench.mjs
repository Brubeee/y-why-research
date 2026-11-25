// Count outcomes on the frozen synthetic fixtures. No learned selector is used.
import { verifyRows } from './verify.mjs';
import { diagnoseStep } from './diagnostic.mjs';
import { FROZEN_DIAGNOSTIC_CASES } from './diagnostic_studio_cases.mjs';

function actionFor(item) {
  const verified = verifyRows({ anchor: item.anchor, rows: item.rows });
  const changed = verified.rows.findIndex(row => row.status === 'changed');
  if (changed < 0) return 'abstain';
  const chain = [item.anchor, ...item.rows];
  const diagnosis = diagnoseStep(chain[changed].text, chain[changed + 1].text);
  return diagnosis.status === 'ambiguous' && diagnosis.probe ? 'retry' : 'clarify';
}

const outcomes = FROZEN_DIAGNOSTIC_CASES.map(item => ({
  id: item.id,
  family: item.family,
  expected: item.expected,
  actual: actionFor(item),
}));
const usefulPrompts = outcomes.filter(x => x.expected !== 'abstain' && x.actual === x.expected).length;
const wrongPrompts = outcomes.filter(x => x.actual !== 'abstain' && x.actual !== x.expected).length;
const abstentions = outcomes.filter(x => x.actual === 'abstain').length;
const missedPrompts = outcomes.filter(x => x.expected !== 'abstain' && x.actual === 'abstain').length;
const matchedActions = outcomes.filter(x => x.actual === x.expected).length;

console.log(JSON.stringify({
  basis: 'frozen author-written synthetic fixtures; not learner data or an effectiveness measure',
  learnedSelector: 'not tried',
  fixtures: outcomes.length,
  usefulPrompts,
  wrongPrompts,
  missedPrompts,
  abstentions,
  matchedActions,
  outcomes,
}, null, 2));

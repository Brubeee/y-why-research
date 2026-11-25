// Frozen synthetic cases for the typed diagnostic studio prototype.
// Families and number-swapped siblings stay together; this is not learner data.
const freezeCase = item => Object.freeze({
  ...item,
  anchor: Object.freeze({ ...item.anchor }),
  rows: Object.freeze(item.rows.map(row => Object.freeze({ ...row }))),
});

export const FROZEN_DIAGNOSTIC_CASES = Object.freeze([
  freezeCase({
    id: 'negative-collision-base', family: 'negative-distribution-collision', expected: 'retry',
    anchor: { text: '−(x−4)=12', confirmed: true },
    rows: [{ text: '−x−4=12', confirmed: true }],
  }),
  freezeCase({
    id: 'negative-collision-number-sibling', family: 'negative-distribution-collision', expected: 'retry',
    anchor: { text: '−(x−7)=5', confirmed: true },
    rows: [{ text: '−x−7=5', confirmed: true }],
  }),
  freezeCase({
    id: 'negative-collision-variable-sibling', family: 'negative-distribution-collision', expected: 'retry',
    anchor: { text: '−(y−3)=−2', confirmed: true },
    rows: [{ text: '−y−3=−2', confirmed: true }],
  }),
  freezeCase({
    id: 'positive-distribution-low-evidence', family: 'positive-two-side-change', expected: 'clarify',
    anchor: { text: '2(x+3)=14', confirmed: true },
    rows: [{ text: '2x+3=7', confirmed: true }],
  }),
  freezeCase({
    id: 'positive-distribution-number-sibling', family: 'positive-two-side-change', expected: 'clarify',
    anchor: { text: '3(y+2)=15', confirmed: true },
    rows: [{ text: '3y+2=7', confirmed: true }],
  }),
  freezeCase({
    id: 'positive-distribution-variable-sibling', family: 'positive-two-side-change', expected: 'clarify',
    anchor: { text: '4(x−2)=8', confirmed: true },
    rows: [{ text: '4x−2=2', confirmed: true }],
  }),
  freezeCase({
    id: 'equivalent-control', family: 'hard-gates', expected: 'abstain',
    anchor: { text: '2(x+3)=14', confirmed: true },
    rows: [{ text: '2x+6=14', confirmed: true }],
  }),
  freezeCase({
    id: 'unconfirmed-anchor-control', family: 'hard-gates', expected: 'abstain',
    anchor: { text: '2x=8', confirmed: false },
    rows: [{ text: 'x=3', confirmed: true }],
  }),
  freezeCase({
    id: 'unsupported-anchor-control', family: 'hard-gates', expected: 'abstain',
    anchor: { text: 'x^2=4', confirmed: true },
    rows: [{ text: 'x=2', confirmed: true }],
  }),
  freezeCase({
    id: 'unresolved-prefix-control', family: 'hard-gates', expected: 'abstain',
    anchor: { text: '2x=8', confirmed: true },
    rows: [
      { text: 'x^2=16', confirmed: true },
      { text: 'x=7', confirmed: true },
    ],
  }),
]);

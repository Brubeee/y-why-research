// Frozen before implementation scoring on 2026-11-26.
// These are author-written synthetic cases, not student data.
const freezeCase = item => Object.freeze({
  ...item,
  anchor: Object.freeze({ ...item.anchor }),
  rows: Object.freeze(item.rows.map(row => Object.freeze({ ...row }))),
  claim: item.claim ? Object.freeze({ ...item.claim }) : null,
});

export const FROZEN_OPERATION_CONVERSATION_CASES = Object.freeze([
  freezeCase({ id:'correct-subtract', family:'correct-claims', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=8',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'correct-add', family:'correct-claims', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'x−4=5',confirmed:true}, rows:[{text:'x=9',confirmed:true}], claim:{kind:'add',constant:'4'} }),
  freezeCase({ id:'correct-multiply', family:'correct-claims', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'x/2=3/2',confirmed:true}, rows:[{text:'x=3',confirmed:true}], claim:{kind:'multiply',constant:'2'} }),
  freezeCase({ id:'correct-divide', family:'correct-claims', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'x+3=7',confirmed:true}], claim:{kind:'divide',constant:'2'} }),
  freezeCase({ id:'correct-fraction-subtract', family:'correct-claims-and-fractions', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'x+1/2=3/2',confirmed:true}, rows:[{text:'x=1',confirmed:true}], claim:{kind:'subtract',constant:'1/2'} }),
  freezeCase({ id:'correct-equivalent-writing', family:'equivalent-written-forms', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2*x=8',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'correct-fractional-division', family:'correct-claims-and-fractions', expectedExact:'equivalent', expectedClaim:'consistent', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'4x+12=28',confirmed:true}], claim:{kind:'divide',constant:'1/2'} }),

  freezeCase({ id:'demo-subtract-points-right', family:'same-pair-different-claims', expectedExact:'changed', expectedClaim:'right', expectedFlow:'right', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'demo-divide-points-left', family:'same-pair-different-claims', expectedExact:'changed', expectedClaim:'left', expectedFlow:'left', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'divide',constant:'2'} }),
  freezeCase({ id:'left-only-subtract-error', family:'one-sided-error', expectedExact:'changed', expectedClaim:'left', expectedFlow:'left', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x+6=8',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'right-only-add-error', family:'one-sided-error', expectedExact:'changed', expectedClaim:'right', expectedFlow:'right', anchor:{text:'x−4=5',confirmed:true}, rows:[{text:'x=10',confirmed:true}], claim:{kind:'add',constant:'4'} }),
  freezeCase({ id:'left-only-multiply-error', family:'one-sided-error', expectedExact:'changed', expectedClaim:'left', expectedFlow:'left', anchor:{text:'x+3=5',confirmed:true}, rows:[{text:'2x+3=10',confirmed:true}], claim:{kind:'multiply',constant:'2'} }),
  freezeCase({ id:'fraction-right-error', family:'one-sided-error-and-fractions', expectedExact:'changed', expectedClaim:'right', expectedFlow:'right', anchor:{text:'x+1/2=3/2',confirmed:true}, rows:[{text:'x=3/2',confirmed:true}], claim:{kind:'subtract',constant:'1/2'} }),
  freezeCase({ id:'fraction-format-right-error', family:'equivalent-written-forms', expectedExact:'changed', expectedClaim:'right', expectedFlow:'right', anchor:{text:'x+1/2=3/2',confirmed:true}, rows:[{text:'x=3/2',confirmed:true}], claim:{kind:'subtract',constant:'2/4'} }),
  freezeCase({ id:'fraction-multiply-right-error', family:'one-sided-error-and-fractions', expectedExact:'changed', expectedClaim:'right', expectedFlow:'right', anchor:{text:'x/2=3/2',confirmed:true}, rows:[{text:'x=4',confirmed:true}], claim:{kind:'multiply',constant:'2'} }),
  freezeCase({ id:'explicit-multiplication-right-error', family:'equivalent-written-forms', expectedExact:'changed', expectedClaim:'right', expectedFlow:'right', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2*x=9',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'same-root-claim-is-still-compared-by-side', family:'same-root-control', expectedExact:'equivalent', expectedClaim:'left', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'x+3=7',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'negative-exact-constant', family:'exact-constant-forms', expectedExact:'changed', expectedClaim:'left', expectedFlow:'left', anchor:{text:'x−4=5',confirmed:true}, rows:[{text:'x=10',confirmed:true}], claim:{kind:'add',constant:'−4'} }),

  freezeCase({ id:'other-not-sure', family:'abstentions', expectedExact:'changed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'other',constant:''} }),
  freezeCase({ id:'unsupported-operation-kind', family:'abstentions', expectedExact:'changed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'square',constant:'2'} }),
  freezeCase({ id:'variable-is-not-a-constant', family:'ambiguous-written-forms', expectedExact:'changed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'divide',constant:'1/2x'} }),
  freezeCase({ id:'zero-multiplier', family:'definite-abstentions', expectedExact:'changed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'multiply',constant:'0'} }),
  freezeCase({ id:'zero-divisor', family:'definite-abstentions', expectedExact:'changed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'divide',constant:'0'} }),
  freezeCase({ id:'invalid-fraction-constant', family:'definite-abstentions', expectedExact:'changed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'subtract',constant:'1/0'} }),
  freezeCase({ id:'unconfirmed-pair', family:'definite-abstentions', expectedExact:'unconfirmed', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:false}, rows:[{text:'2x=9',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'unsupported-line', family:'definite-abstentions', expectedExact:'unsupported', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x+6=14',confirmed:true}, rows:[{text:'x^2=4',confirmed:true}], claim:{kind:'subtract',constant:'6'} }),
  freezeCase({ id:'unresolved-prefix', family:'definite-abstentions', expectedExact:'unsupported', expectedClaim:'abstain', expectedFlow:'abstain', anchor:{text:'2x=8',confirmed:true}, rows:[{text:'x^2=16',confirmed:true},{text:'x=7',confirmed:true}], claim:{kind:'subtract',constant:'2'}, claimBeforeIndex:1 }),
  freezeCase({ id:'negative-distribution-keeps-authored-retry', family:'retry-preservation', expectedExact:'changed', expectedClaim:'skip', expectedFlow:'retry', anchor:{text:'−(x−4)=12',confirmed:true}, rows:[{text:'−x−4=12',confirmed:true}], claim:{kind:'other',constant:''} }),
]);

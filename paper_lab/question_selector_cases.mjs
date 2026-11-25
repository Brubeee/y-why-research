// Frozen synthetic question-preference cases. Every structural sibling stays
// in its named group and every group belongs to exactly one split.
const freezeCase = item => Object.freeze({
  ...item,
  anchor:Object.freeze({...item.anchor}),
  rows:Object.freeze(item.rows.map(row=>Object.freeze({...row}))),
  claim:item.claim ? Object.freeze({...item.claim}) : null,
  prior:Object.freeze((item.prior ?? []).map(row=>Object.freeze({...row}))),
});

export const QUESTION_SELECTOR_CASES=Object.freeze([
  // Fit groups: simple distribution; one-variable balancing; coefficient scaling.
  freezeCase({id:'fit-dist-negative-a',split:'fit',group:'fit-simple-distribution',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'−(x−4)=12',confirmed:true},rows:[{text:'−x−4=12',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'fit-dist-negative-b',split:'fit',group:'fit-simple-distribution',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'−2(y+3)=10',confirmed:true},rows:[{text:'−2y+3=10',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'fit-dist-positive',split:'fit',group:'fit-simple-distribution',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'3(x+2)=18',confirmed:true},rows:[{text:'3x+2=18',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'fit-balance-subtract-a',split:'fit',group:'fit-balance-one-variable',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'2x+6=14',confirmed:true},rows:[{text:'2x=9',confirmed:true}],claim:{kind:'subtract',constant:'6'}}),
  freezeCase({id:'fit-balance-add',split:'fit',group:'fit-balance-one-variable',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'x−4=5',confirmed:true},rows:[{text:'x=10',confirmed:true}],claim:{kind:'add',constant:'4'}}),
  freezeCase({id:'fit-balance-divide-ambiguous',split:'fit',group:'fit-balance-one-variable',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'2x+6=14',confirmed:true},rows:[{text:'2x=9',confirmed:true}],claim:{kind:'divide',constant:'2'}}),
  freezeCase({id:'fit-balance-combined',split:'fit',group:'fit-balance-one-variable',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'2x+6=14',confirmed:true},rows:[{text:'x=1',confirmed:true}],claim:{kind:'combined'}}),
  freezeCase({id:'fit-balance-valid-rewrite',split:'fit',group:'fit-balance-one-variable',family:'equivalent-control',expectedExact:'equivalent',expected:'abstain',anchor:{text:'2x+6=14',confirmed:true},rows:[{text:'8=2x',confirmed:true}],claim:{kind:'subtract',constant:'6'}}),
  freezeCase({id:'fit-balance-variable-a',split:'fit',group:'fit-variable-both-sides',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'3m+5=2m+11',confirmed:true},rows:[{text:'m+5=10',confirmed:true}],claim:{kind:'subtract',constant:'2m'}}),
  freezeCase({id:'fit-balance-variable-b',split:'fit',group:'fit-variable-both-sides',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'4q+7=3q+12',confirmed:true},rows:[{text:'q+7=6',confirmed:true}],claim:{kind:'subtract',constant:'3q'}}),
  freezeCase({id:'fit-coefficient-divide',split:'fit',group:'fit-integer-coefficient',family:'coefficient',expectedExact:'changed',expected:'coefficient',anchor:{text:'6z=24',confirmed:true},rows:[{text:'z=3',confirmed:true}],claim:{kind:'divide',constant:'6'}}),
  freezeCase({id:'fit-coefficient-fraction-a',split:'fit',group:'fit-fraction-coefficient',family:'coefficient',expectedExact:'changed',expected:'coefficient',anchor:{text:'x/3=9',confirmed:true},rows:[{text:'x=9',confirmed:true}],claim:{kind:'multiply',constant:'3'}}),
  freezeCase({id:'fit-coefficient-fraction-b',split:'fit',group:'fit-fraction-coefficient',family:'coefficient',expectedExact:'changed',expected:'coefficient',anchor:{text:'x/2=5',confirmed:true},rows:[{text:'x=4',confirmed:true}],claim:{kind:'multiply',constant:'2'}}),
  freezeCase({id:'fit-neutral-other',split:'fit',group:'fit-balance-one-variable',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'2x+6=14',confirmed:true},rows:[{text:'2x=9',confirmed:true}],claim:{kind:'other'}}),
  freezeCase({id:'fit-unconfirmed',split:'fit',group:'fit-balance-one-variable',family:'gate-control',expectedExact:'unconfirmed',expected:'abstain',anchor:{text:'2x+6=14',confirmed:true},rows:[{text:'2x=9',confirmed:false}],claim:{kind:'subtract',constant:'6'}}),

  // Development groups: novel grouped sides and fractional variable layouts.
  freezeCase({id:'dev-distribution-left-variable-right',split:'dev',group:'dev-distribution-variable-right',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'2(x+3)=3x+8',confirmed:true},rows:[{text:'2x+3=3x+8',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'dev-balance-fractional-offset',split:'dev',group:'dev-fraction-coefficient-offset',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'3x/4+2=5',confirmed:true},rows:[{text:'x/4=3',confirmed:true}],claim:{kind:'subtract',constant:'2'}}),
  freezeCase({id:'dev-coefficient-grouped',split:'dev',group:'dev-grouped-fraction',family:'coefficient',expectedExact:'changed',expected:'coefficient',anchor:{text:'2(r+4)/3=r+1',confirmed:true},rows:[{text:'2(r+4)=3r+2',confirmed:true}],claim:{kind:'multiply',constant:'3'}}),
  freezeCase({id:'dev-neutral-combined',split:'dev',group:'dev-fraction-offset',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'x/2+4=10',confirmed:true},rows:[{text:'x=3',confirmed:true}],claim:{kind:'combined'}}),

  // Held groups: equation structures absent from fit and development.
  freezeCase({id:'held-dist-outside-a',split:'held',group:'held-outside-addend-distribution',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'7−4(3q−2)=9',confirmed:true},rows:[{text:'7−12q+7=9',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'held-dist-outside-b',split:'held',group:'held-outside-addend-distribution',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'4−2(3p+5)=6',confirmed:true},rows:[{text:'4−6p−4=6',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'held-dist-mirrored',split:'held',group:'held-mirrored-distribution',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'12=5(x−2)',confirmed:true},rows:[{text:'12=5x−2',confirmed:true}],claim:{kind:'distribution-right'}}),
  freezeCase({id:'held-dist-two-grouped',split:'held',group:'held-two-grouped-sides',family:'distribution',expectedExact:'changed',expected:'distribute',anchor:{text:'2(x+3)=3(x+2)',confirmed:true},rows:[{text:'2x+3=3x+6',confirmed:true}],claim:{kind:'distribution-left'}}),
  freezeCase({id:'held-balance-mirrored',split:'held',group:'held-mirrored-linear-equation',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'12=5x+2',confirmed:true},rows:[{text:'12=5x',confirmed:true}],claim:{kind:'subtract',constant:'2'}}),
  freezeCase({id:'held-balance-fractional-layout',split:'held',group:'held-fractional-variable-sides',family:'balancing',expectedExact:'changed',expected:'balance',anchor:{text:'5x/6+2=x/3+7',confirmed:true},rows:[{text:'x/2+2=3',confirmed:true}],claim:{kind:'subtract',constant:'x/3'}}),
  freezeCase({id:'held-coefficient-fraction-both-sides',split:'held',group:'held-scaled-grouped-sides',family:'coefficient',expectedExact:'changed',expected:'coefficient',anchor:{text:'3(s+5)/4=2s+1',confirmed:true},rows:[{text:'3(s+5)=8s+2',confirmed:true}],claim:{kind:'multiply',constant:'4'}}),
  freezeCase({id:'held-coefficient-negative-group',split:'held',group:'held-negative-fraction-group',family:'coefficient',expectedExact:'changed',expected:'coefficient',anchor:{text:'−(x+4)/2=3',confirmed:true},rows:[{text:'x+4=6',confirmed:true}],claim:{kind:'multiply',constant:'−2'}}),
  freezeCase({id:'held-neutral-both-sides',split:'held',group:'held-grouped-both-mismatch',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'3(x+2)=2x+15',confirmed:true},rows:[{text:'2x=9',confirmed:true}],claim:{kind:'divide',constant:'3'}}),
  freezeCase({id:'held-neutral-combined-distribution',split:'held',group:'held-outside-addend-distribution',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'7−4(3q−2)=9',confirmed:true},rows:[{text:'q=9',confirmed:true}],claim:{kind:'combined'}}),
  freezeCase({id:'held-neutral-fraction-offset',split:'held',group:'held-fraction-offset',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'x/2+3=5',confirmed:true},rows:[{text:'x=1',confirmed:true}],claim:{kind:'subtract',constant:'3'}}),
  freezeCase({id:'held-neutral-identity-contradiction',split:'held',group:'held-identity-contradiction',family:'ambiguous',expectedExact:'changed',expected:'intermediate',anchor:{text:'2x=2x',confirmed:true},rows:[{text:'1=0',confirmed:true}],claim:{kind:'other'}}),
  freezeCase({id:'held-unsupported-quadratic',split:'held',group:'held-unsupported-quadratic',family:'gate-control',expectedExact:'unsupported',expected:'abstain',anchor:{text:'x^2=4',confirmed:true},rows:[{text:'x=2',confirmed:true}],claim:{kind:'subtract',constant:'1'}}),
  freezeCase({id:'held-unconfirmed-row',split:'held',group:'held-outside-addend-distribution',family:'gate-control',expectedExact:'unconfirmed',expected:'abstain',anchor:{text:'5−3(x+2)=8',confirmed:true},rows:[{text:'−3x−6=8',confirmed:false}],claim:{kind:'distribution-left'}}),
]);

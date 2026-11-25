# Typed question-selector experiment

## Frozen protocol

Frozen before scoring on 2026-11-26. Fixture: `question_selector_cases.mjs`. SHA-256: `0B69454631598141A6564C4286F8B2BC5E573A0C64720BB4C81320A7C537C87C`.

| Partition | Rows | Template groups |
|---|---:|---:|
| Fit | 15 | 5 |
| Development | 4 | 4 |
| Held | 14 | 11 |

Each group stays in one split. Group siblings include alternate coefficients, variables, or claims for the same equation template. Held templates cover an outside-addend distribution, mirrored and two-grouped-side forms, a mirrored equation, fractional variable sides, grouped fractional coefficients, ambiguous claims, identity-to-contradiction, and exact-check controls. The small split is deliberate R&D; counts of rows are not independent learner observations.

### Same vetted questions

The selectors can return only these fixed question IDs or `abstain`:

| ID | Vetted prompt |
|---|---|
| `distribute` | Which terms did the factor multiply on this side? |
| `balance` | Which single operation did you apply to both sides? |
| `coefficient` | Which exact nonzero factor did you use to change the coefficient? |
| `intermediate` | Can you show one intermediate equation after a single move? |

The fixed rule first gates on the exact `verifyRows()` result, then uses the declared action and exact side comparison. A one-sided distribution selects `distribute`; a supported add/subtract mismatch selects `balance`; a supported multiply/divide mismatch selects `coefficient`; ambiguous but checkable changes select `intermediate`; equivalent, unconfirmed, unsupported, or unresolved lines abstain.

The learned candidate is add-one-smoothed categorical naïve Bayes. It trains on the fit partition only and ranks the same four IDs. Its fixed score threshold is **0.75**, set before scoring; the score is not a calibrated probability. The feature list, class list, and candidate text are fixed in `question_selector.mjs`. The development split is reported separately and does not choose or adjust the threshold. No text is generated and no model is wired into the app.

### Scoring rules

- Eligible question cases are confirmed first-changed steps that pass the same exact checker gate. Report their row and template-group counts.
- A useful question is an output that exactly matches the frozen author-written expected question ID, divided by eligible cases with an expected question.
- A confident wrong question is any non-abstaining output that differs from the frozen expected ID, divided by eligible cases.
- A miss is an abstention or wrong ID on an expected-question case, divided by expected-question cases.
- Report total and eligible abstentions separately, plus correct abstentions on hard controls.
- Report exact status agreement with each frozen checker label and verify that selector evaluation changes zero `verifyRows()` verdicts.
- Include held failure examples and the actual question IDs. Keep held labels unchanged after scoring.

### Predeclared go/no-go rule

Keep learned ranking off unless it produces strictly more useful held questions than the strongest fixed rule, with zero confident wrong questions, zero checker-verdict changes, no suggestions on gated controls, and at least 20 independent eligible held template groups. The 20-group floor is a practical minimum for this branch, not a statistical guarantee. Synthetic agreement alone cannot establish learning gains or justify integration.

## Results

The frozen run used the SHA-256 above and threshold 0.75. No case, label, feature, model, or threshold was changed after scoring.

### Held partition

| Measure | Fixed rule | Learned ranker |
|---|---:|---:|
| Exact checker-label agreement | 14/14 | 14/14 |
| Checker verdict changes | 0/14 | 0/14 |
| Eligible cases | 12/14 across 10 independent groups | 12/14 across 10 independent groups |
| Useful expected-question selections | 12/12 | 5/12 |
| Confident wrong questions | 0/12 | 1/12 |
| Missed expected questions | 0/12 | 7/12 |
| Abstentions | 2/14 | 8/14 |
| Eligible-case abstentions | 0/12 | 6/12 |
| Correct abstentions on gated controls | 2/2 | 2/2 |

The fixed rule selected every authored expected question. The learned ranker selected five correctly, abstained on six expected-question cases, and gave one confident but inappropriate suggestion. It suggested `distribute` for `held-neutral-combined-distribution`, whose expected neutral prompt was `intermediate` (confidence 0.883). Other misses included `held-balance-mirrored` (`balance`, learned abstention), `held-coefficient-fraction-both-sides` (`coefficient`, abstention), `held-neutral-both-sides` (`intermediate`, abstention), and `held-neutral-identity-contradiction` (`intermediate`, abstention). The complete machine-readable outcome list is produced by `node paper_lab/question_selector.mjs`.

### Decision

**No-go: keep the learned selector out of the app.** It does not beat the fixed rule, has one confident wrong suggestion, and the held set has only 10 eligible independent groups versus the predeclared 20-group minimum. The fixed rule is the appropriate current choice for these authored cases. These synthetic results measure agreement with the author-written preferences only; they do not establish student benefit or learning gains.

No cases, labels, feature list, model, or threshold were tuned after the held results.

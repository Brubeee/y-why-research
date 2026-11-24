# Offline next-action ranking probe (synthetic only)

`node paper_lab/hint_ranker.mjs` reports all results; `node --test
paper_lab/hint_ranker.test.mjs` checks splits/guard. No import by the UI.

Rows were authored around next-action preferences, not learner diagnoses:
inspect a sign, compare both equation sides, ask for the operation, or use the
existing authored separator where it actually exists. The current app's lack of
specific advice outside a separator is mapped to the generic ask-operation
fallback for comparison. A fixed strong rule uses the same action vocabulary
and two visible features: which sides changed and a sign-only edit. The small
Laplace-smoothed naive Bayes scorer uses those same two features. Exact rational
checker logic comes first; only a confirmed changed step after a confirmed
valid prefix is eligible. The ranker does not generate probes, transcriptions,
or new grading logic, and cannot override a valid authored separator.

Groups are structural, not coefficient-swap splits: 10 fit rows (explicit
distribution, move addend, unary variable), 6 development (denominator and
two-sided equations), and 14 held (mirrored equations, outside-addend
distribution, unsupported and confirmation/earlier-row controls). These
are related algebra tasks and synthetic author choices, not statistically
independent learner data. Scores are not calibrated probabilities. Frozen
threshold grid chooses fewest wrong, then highest coverage, only on 6
development rows; threshold 0.58 accepted 4/6 with zero wrong.

| Held policy (6 eligible of 14) | Correct / acted | Wrong | Abstained | Hard-gated |
|---|---:|---:|---:|---:|
| Current authored diagnostic + generic fallback | 2/6 | 4 | 0 | 8 |
| Same-vocabulary fixed feature rule | 6/6 | 0 | 0 | 8 |
| Thresholded learned ranker | 4/4 | 0 | 2 | 8 |
| Always abstain on eligible rows | 0/0 | 0 | 6 | 8 |

No high-score wrong suggestion was observed, but the learned model achieved
4/6 eligible coverage, below the strong rule's 6/6. These labels deliberately
reflect author judgments based on visible features, so strong-rule agreement
is not independent educational evidence. There is no held eligible separator
in this split and no evidence about learners, diagnosis, gains, or real-world
confidence. Keep the current app behavior.

The held surface groups reuse broad algebra operations and features, not
unseen skills or courses. Zero errors among four accepted suggestions is
not an accuracy assurance. The two prefix controls verify suppression when
an earlier row is unresolved, not arbitrary pair selection: this research
runner does not choose adjacent rows from a real chain, enforce photo
attestation/row selection, or replace the app's upstream guards.

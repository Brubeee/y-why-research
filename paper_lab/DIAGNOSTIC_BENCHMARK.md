# Do not infer the cause from half an equation

This authored regression uses 24 frozen fictional, manually classified examples.
The expected labels describe which of two simulated rules predicts the written
transition, not which rule a learner used. The exact verifier matched the
expected equation status in 24/24 cases. Eleven lines change the solution set,
seven preserve it, four are unsupported, and two lack confirmation.

| Candidate selection | Exact candidate sets | Retained supported sets | Candidates on cases with no supported explanation |
| --- | ---: | ---: | ---: |
| Existing full-row matcher, with confirmation | 24/24 | 7/7 | 0/17 |
| Deliberately ignore RHS, with confirmation | 20/24 | 7/7 | 4/17 |
| Deliberately ignore RHS, only after verifier flags a change | 22/24 | 7/7 | 2/17 |
| Existing full-row matcher, only after verifier flags a change | 24/24 | 7/7 | 0/17 |

From `−3(x−4)=12`, the line `−3x−12=13` changes the solution set but its right side
is not predicted by the sign-error model. In contrast, `−3x−12=−12` keeps the
original solution and must not be treated as an error. Both have the same left
side, so matching only that side would invent a candidate. A separate regression
checks that a later changed row uses its immediately preceding confirmed row,
not the original anchor as the diagnosis input.

**What the app currently shows:** One of the 11 changed cases gets a separating
probe for two matching rules; ten get no attributed cause. Six of those ten
match one simulated rule across the full equation. Those internal candidates
are not learner-facing diagnoses. No new hint policy was enabled. A follow-on
experiment can compare a tentative one-rule check with the generic feedback on
new frozen templates and include a disclosure-safe case where the best answer
is still to ask what operation was used.

Run `node paper_lab/diagnostic_bench.mjs` for case-level results. This is a small
designed challenge, not an estimate of student error frequencies, accuracy on
real photos, or learning benefit.

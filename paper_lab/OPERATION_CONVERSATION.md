# Declared-operation conversation R&D

## Scope

The typed fallback asks the student to choose add, subtract, multiply, divide,
or “Something else / Not sure,” then provide an exact constant. The checker
compares the result of that declared action with the actual left and right
sides of the exact preceding equation. It uses `parseExpression()` for exact
rational affine comparison and `verifyRows()` for the authoritative chain
gate. It does not parse free-text explanations or infer an action from the
written lines. Zero multipliers/divisors, unsupported constants and unsupported
operations cannot produce a side-specific prompt.

The result can identify a side only when the whole exact comparison is
supported. It points first to the left side when that side does not match the
claim; otherwise it can point to a mismatching right side after verifying the
left side matches. If both sides mismatch, comparison is unavailable, or the
action is combined/uncertain, it asks for one neutral intermediate equation or
abstains. This is evidence about the selected action and written lines, not a
claim about the student's intent.

The new form appears only for the typed fallback. The existing negative
distribution retry stays on its authored path, and the photo/OCR flow is not
given this claim interaction.

## Frozen synthetic protocol

- Fixture file: `operation_conversation_cases.mjs`.
- Frozen: 2026-11-26, before running the score script.
- SHA-256: `D6DD5B6BDCCB3692CE7E6CF7119FB7C76B143E509322FE5B4129E3DA01251222`.
- Cases: 28 author-written synthetic interactions in fixed families covering
  correct claims, one-sided errors, the same written pair with two different
  claims, equivalent written forms, exact fractions, same-root controls,
  unsupported/ambiguous claims, no-claim choices, unconfirmed and unresolved
  gates, and the preserved negative-distribution retry.
- Unit of analysis: one frozen interaction fixture. Number-swapped or
  representation-swapped cases stay in their named family.
- Expected comparison and flow outcomes are fixed in the fixture file. Do not
  revise those expectations after seeing the score; explain any failure
  instead.

Metrics use the frozen fixtures as denominators: correct targeted prompts are
expected left/right prompts matched by the observed side, divided by fixtures
whose frozen expectation is a targeted prompt; wrong confident prompts are
observed side-specific prompts that disagree with the expected side or appear
on an expected abstention, divided by all fixtures; abstentions are observed
abstain outcomes divided by all fixtures. Correctly matched claims and missed
targeted prompts are reported separately. Checker verdict changes count a
difference in the full `verifyRows()` result before versus after action
evaluation, divided by all fixtures.

These fixtures measure deterministic agreement with author-written expected
actions only. They are not learner data, an independent educational study, or
evidence of learning gains.

## Recorded results (2026-11-26)

The fixture checksum matched before scoring. The full Paper Lab Node suite
passed 74/74 tests; both `diagnostic_studio_bench.mjs` and
`operation_conversation_bench.mjs` completed successfully.

| Measure | Result |
|---|---:|
| Correct claims matched by the helper | 7/7 expected consistent claims |
| Correct side-targeted prompts | 10/10 expected prompts |
| Wrong confident prompts | 0/28 fixtures |
| Missed targeted prompts | 0/10 expected prompts |
| Flow abstentions | 17/28 fixtures |
| Checker verdict changes | 0/28 fixtures |
| Exact-status mismatches | 0/28 fixtures |

The seven consistent-claim fixtures are equivalent equation pairs. The helper
checks them directly, while the actual interaction stays closed because
`verifyRows()` found no changed row. A same-root control also confirms that the
helper compares the declared action by side but does not open a user-facing
flow for equivalent lines. One further fixture preserves the authored
negative-distribution retry.

Real-browser verification: in a local Chromium browser at a desktop viewport,
I confirmed the full typed chain and both prompts for the same written pair:
subtracting 6 targeted the right side, and dividing by 2 targeted every term
on the left. At 390 px, the real page rendered one-column workbench and
comparison layout with no horizontal overflow. I could not complete the phone
interaction because a browser consent-reminder overlay covered the controls;
the phone action-response path is not verified.

## Demo

1. Type and confirm `2x+6=14` then `2x=9`.
2. In the follow-up, choose **Subtract** and enter `6`. The left comparison
   matches; the follow-up points to the right and asks what `14−6` is.
3. Change the declared action to **Divide** by `2`. The previous action feedback
   clears. The follow-up now asks what dividing every term on the left,
   `(2x+6) ÷ 2`, would produce.
4. Try **Something else / Not sure**. The app does not guess; it suggests
   adding one intermediate equation or abstaining.

## Ownership and integration

Codex implemented this deterministic prototype with synthetic fixtures; no
real student data was used. Manan and Vihan own the decision to keep this
interaction, its wording and abstention boundary, and any later adaptation.
They should review the side comparisons in `operation_claim.mjs`, run the
fixtures, and decide what to implement or explain for the finale. This is not a
learned AI upgrade and makes no learning-gain claim.

This is a follow-up on `diagnostic-studio-rnd` after
`ae08792fdbfcc1eed7bc20a162fc35876c812811`. It changes only shared Paper Lab
UI/operation-claim code and tests/docs on this branch. For later integration,
compare `app.mjs`, `operation_claim.mjs`, `index.html`, styles and tests against
the other research branch; port selectively after Manan and Vihan review the
overlap. Do not replace the whole Paper Lab directory or overwrite the OCR
worker's changes. No site, deployment, main branch, or other branch is part of
this R&D change.

## Verification limits

The phone action-response path was unverified at the time of the first browser
rehearsal because the browser overlay blocked the controls. The later typed
tutoring iteration below records a completed 390 × 844 CSS-pixel Chrome
viewport rehearsal; no physical handset or learner/effectiveness claim is in
scope.

## Later safety classification (2026-11-26)

The frozen 28 interactions and their labels were kept unchanged. A later
classifier revision stopped identifying a side when both sides failed the
student's declared single action. The frozen script was rerun against the same
fixture checksum after this safety change:

| Measure | Later result |
|---|---:|
| Fixture checksum | matches the frozen SHA-256 |
| Correct claims matched | 7/7 |
| Correct side-targeted prompts | 8/10 expected prompts |
| Wrong confident prompts | 0/28 |
| Missed targeted prompts | 2/10 expected prompts |
| Flow abstentions | 19/28 |
| Checker verdict changes | 0/28 |
| Exact-status mismatches | 0/28 |

The two misses, `demo-divide-points-left` and `negative-exact-constant`, have
`comparison: {left:false,right:false}`. They now take the neutral/abstain route
instead of receiving a guessed side prompt. The earlier 10/10 target result
above records the behavior before this safety change; use the later result for
the current branch. These remain authored synthetic agreement counts, not
student evidence.

The full typed repair, retry, reset, and ambiguity rehearsal and the confirmed
ordered-lines boundary are documented in
[`TYPED_TUTORING_TRACK.md`](TYPED_TUTORING_TRACK.md). The separately frozen
learned-selector comparison and no-go decision are in
[`QUESTION_SELECTOR_EXPERIMENT.md`](QUESTION_SELECTOR_EXPERIMENT.md).

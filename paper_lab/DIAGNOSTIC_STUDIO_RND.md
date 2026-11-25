# Typed Diagnostic Studio R&D

This prototype starts from research commit `8c20183d50a8791658e16b8b5f7eb53e77e22cd5` on `diagnostic-studio-rnd`. It is local research code, not the original Y? notebook, a competition submission, or a claim about learner outcomes.

## What the typed flow does

- Accepts 2–12 one-variable equation lines. The user confirms the typed chain before it is checked.
- Sends the confirmed chain through the existing `verifyRows()` exact solution-set gate. Only the first changed row after a confirmed equivalent prefix can open feedback.
- Keeps the exact preceding line and first changed line visible together. `findEquationWitness()` uses the same rational parser and shows a value only after evaluating both sides of both equations and confirming exactly one equality holds.
- Prefers a root of the changed line where safe. It abstains on unique-to-identity and unique-to-contradiction transitions where selecting a predictable witness could expose the preceding equation's answer. Identity/contradiction pairs in other directions use an exact simple value.
- Reuses the authored negative-distribution separator only for its supported two-rule collision. It shows both sides of the new equation. Other verified typed changes ask “What operation did you apply here?” and accept a structured two-sided action plus exact constant. Edits and reconfirmation clear old witness, separator, retry, and operation feedback.

No learned next-question selector was tried or wired into the app. The offline hint ranker remains unused by the UI.

## Frozen synthetic fixture check

`diagnostic_studio_cases.mjs` holds ten author-written synthetic cases. Number-swapped and variable-swapped siblings remain in the same family. The frozen policy check reported:

| Outcome | Count |
|---|---:|
| Useful fixture-matched prompts: 3 fresh retries + 3 neutral questions | 6 |
| Wrong prompts | 0 |
| Missed expected prompts | 0 |
| Abstentions: equivalent, unconfirmed, unsupported-anchor, unresolved-prefix controls | 4 |

These counts describe only whether the hand-authored expected action matched the deterministic output on these fixtures. They are not an independent evaluation, learner data, or evidence of educational effectiveness. Run `node paper_lab/diagnostic_studio_bench.mjs` to reproduce the count.

## Declared-operation conversation

The 28-case frozen set and scoring rules are documented in [OPERATION_CONVERSATION.md](OPERATION_CONVERSATION.md). Its recorded SHA-256 matched before scoring. Results from `node paper_lab/operation_conversation_bench.mjs`:

| Measure | Result |
|---|---:|
| Correct claims matched | 7/7 |
| Correct side-targeted prompts | 10/10 expected prompts |
| Wrong confident prompts | 0/28 fixtures |
| Missed targeted prompts | 0/10 expected prompts |
| Flow abstentions | 17/28 fixtures |
| Changed exact-checker verdicts | 0/28 fixtures |
| Frozen exact-status mismatches | 0/28 fixtures |

One additional fixture preserved the authored negative-distribution retry. The same changed pair produced a right-side prompt for “subtract 6” and a left-side prompt for “divide by 2.” Counts compare deterministic output with author-written labels only; they are not student evidence or learning-gain measurements.

The exact witness tests cover negative and fractional unique-to-unique changes, identity-to-unique, contradiction-to-unique, identity↔contradiction in both directions, and deliberate abstentions for unique-to-identity and unique-to-contradiction. App tests also verify that the original root is not printed in the witness or fresh probe, that an unresolved prefix blocks downstream feedback, and that editing then reconfirming identical text does not restore the earlier probe response or retry state.

## Demo

For the typed path only, serve the repository root with `python -m http.server 8766 --bind 127.0.0.1` and open `http://127.0.0.1:8766/paper_lab/`.

1. Enter `−(x−4)=12` and `−x−4=12` on separate lines, then choose **Confirm and check typed chain**.
2. Inspect the two-line comparison. The exact witness is `x = -16`: the preceding equation evaluates to `20 ≠ 12`, and the changed equation to `12 = 12`. The follow-up is a fresh full equation, `−3(y−2)=12`; it does not solve the original equation.
3. Edit the text and confirm it again. The old comparison disappears. For the low-evidence case, enter `2(x+3)=14` and `2x+3=7`; the witness is `x = 2`, and the follow-up asks **What operation did you apply here?** without inferring an explanation.
4. For the side-specific demo, enter `2x+6=14` and `2x=9`. Select **Subtract**, enter `6`, and check the right-side prompt `14−6`. Change the action to **Divide**, enter `2`, and see the left-side prompt to check every term in `(2x+6) ÷ 2`. Select **Something else / Not sure** to see the intermediate-line/abstention response.

The static server does not provide `/api/ocr`; photo reading requires the existing OCR server. The OCR pipeline was not changed for this work.

## Student decisions and external assistance

Codex implemented this R&D branch with synthetic fixtures and recorded the external assistance in this note. No real student data was used. Manan and Vihan retain the decisions about whether this typed path belongs in Y?, the confirmation boundary and wording, the witness abstention rules, the operation choices and their prompt wording, and any later integration. Their hands-on review can include walking through `verifyRows()`, `findEquationWitness()`, `diagnoseStep()`, and `checkTwoSidedOperationClaim()`, rerunning the tests and frozen cases, and deciding what to implement or adapt for the finale so they can explain the math and limits themselves. Do not represent this prototype as student-authored work; follow the applicable competition acknowledgment rules for any later use.

## Integration note

This branch is based on `8c20183d50a8791658e16b8b5f7eb53e77e22cd5` and has not been merged or deployed. Before combining it with `paper-to-proof-rnd`, compare the shared `paper_lab/app.mjs`, `verify.mjs`, `diagnostic.mjs`, `operation_claim.mjs`, `index.html`, stylesheet, and tests. Cherry-pick or port only after Manan and Vihan review the overlap; do not copy the entire `paper_lab/` directory over the OCR worker's changes. Keep `main`, `paper-to-proof-rnd`, the live site, and OCR-owned files unchanged. Re-run the Paper Lab Node tests and both frozen benches on the eventual integration branch.

## Limits and evidence

- The checker remains authoritative and bounded to its existing one-variable affine grammar. Unsupported notation and unresolved prefixes stop feedback.
- The diagnostic only separates its two authored negative-distribution rules. A matching response is evidence about that response, not a diagnosis of intent.
- No handheld device test, handwriting/OCR accuracy test, learner study, or learning-improvement claim is included.
- In the declared-operation iteration, a real Chromium browser confirmed both desktop prompts. At a 390 px viewport the workbench and line comparison stacked in one column with no horizontal overflow. The phone action-response interaction could not be completed because a browser consent-reminder overlay covered the controls; the phone flow remains unverified.

## Complete typed tutoring iteration (2026-11-26)

The later iteration adds a typed repair line bound to the actual immediately
preceding confirmed equation, separates exact solution-set preservation from
the declared operation check, and opens a different fixed transfer task only
after a supported repair. The first fresh-task response is evaluated before
the hint unlocks; an aided correction remains labeled separately. Combined or
uncertain actions use a neutral intermediate-line check, and edits/reset clear
downstream feedback. The photo/OCR route and its existing retry were not
changed. The implementation and one-minute camera-failure demo are in
[`TYPED_TUTORING_TRACK.md`](TYPED_TUTORING_TRACK.md).

Current branch evidence: `node --test paper_lab/*.test.mjs` passed 91/91 tests
after the retry-label and grouped-equivalence fixes. Unparseable retry text does
not unlock hints; the first evaluable response remains the comparison point,
and a later correction before a hint is labeled after feedback. Equivalent
parenthesized negative-factor products remain uncredited until distribution is
shown. The Python suite ran 24
tests: 19 passed and 5 Tesseract-dependent cases skipped because the local OCR
binary is unavailable. The static page/module-graph route test passed; new
helpers are kept inside the existing allowlisted shared module, and no
OCR-owned server or test file was edited.
The separate grouped selector run is frozen and documented in
[`QUESTION_SELECTOR_EXPERIMENT.md`](QUESTION_SELECTOR_EXPERIMENT.md): the rule
matched 12/12 expected held prompts; the learned selector matched 5/12, made
one confident wrong selection, and abstained on 6/12 expected-question cases.
Only 10 independent eligible groups were held, below the declared 20-group
floor, so the learned selector remains out of the app.

Google Chrome rehearsal later completed the full typed flow at the desktop
viewport and a 390 × 844 CSS-pixel viewport. The phone-sized viewport had no
horizontal overflow (390 px viewport, 375 px document width). Both viewports
covered input, exact witness, action feedback, repair, fresh retry, reset, and
the combined-move ambiguity path. This is browser responsive emulation, not a
physical handset test. The older incomplete phone note above describes the
earlier browser session; this later completion supersedes it for this branch.

The learned selector is a no-go. These fixtures were written by the authors and
do not establish student benefit, a misconception diagnosis, or learning
gains. Review `TYPED_TUTORING_TRACK.md` for the OCR confirmed-ordered-lines
boundary and the decisions Manan and Vihan should make before integration.

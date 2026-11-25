# Typed Diagnostic Studio R&D

This prototype starts from research commit `8c20183d50a8791658e16b8b5f7eb53e77e22cd5` on `diagnostic-studio-rnd`. It is local research code, not the original Y? notebook, a competition submission, or a claim about learner outcomes.

## What the typed flow does

- Accepts 2–12 one-variable equation lines. The user confirms the typed chain before it is checked.
- Sends the confirmed chain through the existing `verifyRows()` exact solution-set gate. Only the first changed row after a confirmed equivalent prefix can open feedback.
- Keeps the exact preceding line and first changed line visible together. `findEquationWitness()` uses the same rational parser and shows a value only after evaluating both sides of both equations and confirming exactly one equality holds.
- Prefers a root of the changed line where safe. It abstains on unique-to-identity and unique-to-contradiction transitions where selecting a predictable witness could expose the preceding equation's answer. Identity/contradiction pairs in other directions use an exact simple value.
- Reuses the authored negative-distribution separator only for its supported two-rule collision. It shows both sides of the new equation. Other verified changes ask exactly “What operation did you apply here?” Edits and reconfirmation clear old witness, separator, and retry feedback.

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

## Demo

For the typed path only, serve the repository root with `python -m http.server 8766 --bind 127.0.0.1` and open `http://127.0.0.1:8766/paper_lab/`.

1. Enter `−(x−4)=12` and `−x−4=12` on separate lines, then choose **Confirm and check typed chain**.
2. Inspect the two-line comparison. The exact witness is `x = -16`: the preceding equation evaluates to `20 ≠ 12`, and the changed equation to `12 = 12`. The follow-up is a fresh full equation, `−3(y−2)=12`; it does not solve the original equation.
3. Edit the text and confirm it again. The old comparison disappears. For the low-evidence case, enter `2(x+3)=14` and `2x+3=7`; the witness is `x = 2`, and the follow-up is **What operation did you apply here?** with no inferred explanation.

The static server does not provide `/api/ocr`; photo reading requires the existing OCR server. The OCR pipeline was not changed for this work.

## Student decisions and external assistance

Codex implemented this R&D branch with synthetic fixtures and received one independent Sol Medium architecture review. No real student data was used. Manan and Vihan retain the decisions about whether this typed path belongs in Y?, the confirmation boundary and wording, the witness abstention rules, the neutral follow-up, and any later integration. Their hands-on review can include walking through `verifyRows()`, `findEquationWitness()`, and `diagnoseStep()`, rerunning the tests, and deciding what to implement or adapt for the finale so they can explain the math and limits themselves. Do not represent this prototype as student-authored work; follow the applicable competition acknowledgment rules for any later use.

## Integration note

This branch is based on `8c20183d50a8791658e16b8b5f7eb53e77e22cd5` and has not been merged or deployed. Before combining it with `paper-to-proof-rnd`, compare the shared `paper_lab/app.mjs`, `verify.mjs`, `diagnostic.mjs`, `index.html`, stylesheet, and tests. Cherry-pick or port only after Manan and Vihan review the overlap; do not copy the entire `paper_lab/` directory over the OCR worker's changes. Keep `main`, `paper-to-proof-rnd`, the live site, and OCR-owned files unchanged. Re-run the Paper Lab Node tests and the frozen bench on the eventual integration branch.

## Limits and evidence

- The checker remains authoritative and bounded to its existing one-variable affine grammar. Unsupported notation and unresolved prefixes stop feedback.
- The diagnostic only separates its two authored negative-distribution rules. A matching response is evidence about that response, not a diagnosis of intent.
- No phone-device test, handwriting/OCR accuracy test, learner study, or learning-improvement claim is included.
- A real desktop/phone browser pass was attempted, but the Windows browser-control layer stopped because it could not determine the existing Chrome tab URL. Playwright packages were unavailable in this checkout, so no viewport screenshots or real-browser interaction are claimed.

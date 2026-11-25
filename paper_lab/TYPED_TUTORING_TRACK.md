# Typed tutoring track

This 2026-11-26 iteration completes the typed repair-and-transfer loop on
`diagnostic-studio-rnd`. It is local R&D built on the existing exact affine
checker. It is not a competition submission, learner study, or claim of
learning benefit.

## Student loop

1. Enter and confirm one ordered equation chain. `verifyRows()` remains the
   authority for equivalence, the first changed row, unresolved lines, and
   unsupported notation. The app shows an exact witness only after the checker
   verifies both equations.
2. On a typed changed step, choose the move used. A side-specific prompt is
   shown only when the exact comparison supports one side. `Something else / Not
   sure`, combined moves, and cases where neither side matches take a neutral
   route; the app does not infer intent.
3. Enter one repair line. It is checked against the actual immediately
   preceding confirmed equation. `verifyRows()` checks solution-set
   preservation; a separate exact operation comparison checks whether the
   line demonstrates the declared move. A valid equivalent rewrite is
   recognized as equivalent but is not credited as showing that move.
4. A supported repair opens a different, fixed transfer problem for the same
   move family. Only an evaluable equation counts as a response and unlocks the
   hint; blank or unparseable submissions do not. The first evaluable response
   stays the comparison point. A later supported response is labeled before
   help, after feedback, or after a hint, according to the path taken. Attempt
   state is in memory only and stores verdict metadata, not answer strings.

The exact grammar remains one-variable affine equations. Unconfirmed, unresolved,
or unsupported work cannot produce repair feedback. The photo/OCR interaction
does not currently open this typed repair loop; it remains unchanged.

## One-minute typed demo

This sequence needs no camera and works from the typed box in the local
workbench.

| Time | Presenter action and line | What the audience sees |
|---|---|---|
| 0:00–0:10 | Enter `2x+6=14` then `2x=9`; confirm. | The exact predecessor and first changed equation appear together. |
| 0:10–0:20 | Read the witness `x=9/2`. | The predecessor gives `15 ≠ 14`; the changed line gives `9 = 9`. The original answer is not shown. |
| 0:20–0:31 | Choose **Subtract from both sides**, enter `6`, continue. | The left side matches the declared move; the app asks the student to check the right side. It does not call this a diagnosis. |
| 0:31–0:38 | Enter repair `2x=8`. | The line preserves the preceding solution and demonstrates subtracting 6 from both sides. |
| 0:38–0:53 | In the fresh problem `3m+5=2m+11`, first enter `m+5=10`. Then show one hint and enter `m+5=11`. | The wrong no-hint response is evaluated first. The hint says to subtract `2m` from each complete side; the later correct response is labeled after a hint. |
| 0:53–1:00 | Point out the two separate response labels. | The class can see what was correct independently and what was corrected with help. |

For a quick safety demonstration after the timed route, clear the work, enter
`2(x+3)=14` then `2x+3=7`, choose **More than one move**, and continue. The
exact witness remains visible, but the app requests a neutral intermediate
line, does not attribute a move, and does not open a fresh retry.

## Confirmed-lines boundary for later OCR integration

OCR drafts must not enter this loop. Once a student has explicitly confirmed
one consecutive solution chain and its reading order, the input to the shared
checker is:

```js
const checked = verifyRows({
  anchor: {text: originalEquation, confirmed: true},
  rows: orderedLaterLines.map(text => ({text, confirmed: true})),
});
```

Use the first `changed` row only after every earlier selected row is confirmed
and equivalent. Pair it with the actual preceding confirmed row, then reuse
`findEquationWitness()` for a separating value, `classifyTypedStep()` for the
declared-action gate, and `checkTypedRepair()` or
`checkNeutralIntermediate()` for the student-entered repair. Those helpers
call the same `verifyRows()` checker; an OCR adapter should provide confirmed
text and order, not introduce another math verdict. If any required row is
unconfirmed, unresolved, unsupported, or omitted, stop before feedback.

Repair outputs distinguish `supported`, `equivalent-other`,
`neutral-equivalent`/`equivalent-unattributed`, `not-equivalent`, and `blocked`.
Only `supported` starts a retry. The source photo, OCR confidence, or raw OCR
draft is not copied into retry prompts. Equivalent grouped products such as
`3+(-5)*(2z+1)=8` stay `equivalent-other` until the declared distribution is
shown; exact equivalence alone does not demonstrate expansion.

## Browser rehearsal

Rehearsed in Google Chrome against the local static server with a real desktop
viewport and a 390 × 844 CSS-pixel responsive viewport. Both viewports covered
typed input, witness, declared-operation feedback, repair, a different fresh
retry, reset, and a combined-move ambiguity case. The phone-sized viewport had
no horizontal document overflow (`scrollWidth` 375 px at 390 px width). The
ambiguous case accepted an equivalent neutral line without attribution and
without opening a retry. This is a browser viewport rehearsal, not a physical
handset test.

The screenshots captured during the rehearsal are kept under the ignored
`.codex-work/` directory. To reproduce the Node checks and selector decision,
run `node --test paper_lab/*.test.mjs`, then
`node paper_lab/question_selector.mjs`. See
[`QUESTION_SELECTOR_EXPERIMENT.md`](QUESTION_SELECTOR_EXPERIMENT.md) for the
frozen grouped benchmark and its no-go result.

The final Node run passed 91/91 tests. The Python suite ran 24 tests: 19 passed
and 5 Tesseract-dependent cases skipped because the local OCR binary is absent.
Its static page/module-graph route check passed after keeping the new helpers in
the existing allowlisted `operation_claim.mjs`; no OCR-owned server or test
file was edited. The environment lacks a system DejaVu font, so the run used a
temporary copy of the already-installed Matplotlib DejaVu font in ignored
`.codex-work/`.

## Decisions before integration

- Manan and Vihan should decide whether the repair wording, neutral ambiguity
  path, and exact witness fit the live Y? explanation they can teach.
- They should review the supported affine grammar and repair examples, then
  decide whether to adapt this branch selectively into the OCR branch after
  checking overlapping files. The current OCR UI is not wired to this loop.
- Keep the learned selector off. Reconsider it only with a larger, independently
  grouped and student-relevant evaluation; the current authored benchmark does
  not support integration or any learning-gain claim.

# Phone-photo trial: preserve the mistake first

This protocol is ready for capture, not a result. The MathWriting excerpt contains
no single-line reference that passes Paper Lab's bounded one-variable affine
grammar (100 human validation samples and 100 human test samples audited).
The previous 24 clean rendered-ink crops measured a broader formula task.
Neither study establishes phone-photo or full-chain accuracy.

## Capture and freeze

1. Use the eight original practice chains in `phone-affine-cases.json`. Write
   them by hand on eight separate unnamed sheets; do not use actual assignments,
   grades or student identifiers. Keep sheet type, writer, pen, layout and line
   spacing consistent. Draw the stacked fraction with a bar, not a slash.
2. Take one straight, evenly lit picture per sheet and one picture at a fixed
   oblique angle with lighting held constant. Keep the sheet fully in frame.
   The denominator is eight physical sheets and sixteen paired captures, not
   sixteen independent handwriting samples. This is a pilot, not a population
   estimate. Do not change optics or choose a new photo after seeing OCR results.
3. Before inference, independently compare each visible line against the intended
   prompt, preserving every visible digit, sign, symbol and line order. Write
   down any copying difference or unreadable input; do not silently substitute
   intended labels. Freeze image hashes, the upright pixel dimensions, actual
   literal rows, and tight bounds for each row, with the full fraction inside
   one row. Make the upright image identical for display, crops and detection.
   Keep unredacted frames, hashes, literal transcripts and outputs local.
4. Run the same fixed engine settings on manual row crops and automatic proposal
   crops. Count missing, extra and reordered rows; inspect edge cuts against
   actual photo ink, not a synthetic foreground mask. Use exact literal scores
   with the limited formatting allowances of the earlier probe. A stacked bar
   and a slash are distinct on this metric.

## What to report

- Whole ordered exact chains, by condition and crop arm, with denominators
  that include failures. Log abstentions and illegible input separately.
- First-changed-line agreement after passing supported transcriptions to the
  unchanged exact verifier. A wrong answer on a correct chain and a missing
  first error on a changed chain are both failures. Report this separately
  from literal fidelity; a coincidentally right verdict is not exact OCR.
- Any confident repair of an intentional wrong step into a correct one. Compare
  oracle and automatic crops to localize detection versus recognition; do not
  promote a product default from one writer or treat the typed lane as OCR.

Validate the intended chains without images:
`node paper_lab/math_ocr_probe/phone-fixtures-verify.mjs` from the repository
root. The four altered chains first change on written line 2 and preserve that
altered result in the rest of their lines.

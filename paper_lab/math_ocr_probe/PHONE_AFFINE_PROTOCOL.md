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

## Local intake and crop commands

Use a new private directory outside the repository (for example, from
`mktemp -d`). Keep all resulting files there. Do not commit, post or deploy
practice captures or outputs. These commands are separate from Paper Lab's
browser and live endpoint; they do not change the product.

1. Run `python paper_lab/math_ocr_probe/phone_captures.py normalize ORIGINAL BUNDLE`.
   It records file SHA, format, EXIF orientation, original dimensions, and
   header/byte preflights separately. These preflights are not browser uploads
   or HTTP status observations for your image. A synthetic 4032 × 3024 JPEG
   returned 413 from the loopback endpoint, despite being under 6 MiB; a
   synthetic 4000 × 3000 JPEG returned 200.
2. Use only `BUNDLE/upright.png` for both manual boxes and crop comparisons.
   The offline rule is EXIF transpose, RGB, then a fixed aspect-preserving
   Lanczos reduction to at most 1600 px on the long side (no enlargement).
   The research raster is not a claim that the shipped page accepts the
   original image. The saved raster is metadata-free; its fingerprint covers
   mode, dimensions and pixel bytes, not PNG container bytes.
3. Before inference, create a separate local reference JSON with
   `{"raster_sha256": "...", "rows":[{"literal":"2x+6=14","box":[50,100,215,150]}]}`.
   Copy the digest from `BUNDLE/intake.json`. Boxes are integer
   left/top/right/bottom, with right/bottom excluded; list top to bottom with
   no overlap. Record illegible captures separately, never improvise text.
   Run `python paper_lab/math_ocr_probe/phone_captures.py freeze BUNDLE REFERENCE.json`.
4. Run `python paper_lab/math_ocr_probe/phone_captures.py prepare BUNDLE CROPS`.
   It rechecks the raster digest, records the frozen reference digest, and
   makes manual and two automatic crop arms from the same raster. The
   detectors cannot see the reference text or boxes. Record detector geometry
   separately from literal recognition. With the pinned offline TexTeller
   runtime, `node page_recognize.mjs CROPS --private-phone` accepts this
   one-capture manifest; old eight-pack runs are unchanged. Save any literal
   OCR output only to the private folder.

## Score without crediting a coincidentally correct verdict

Run `node paper_lab/math_ocr_probe/phone_score.mjs BUNDLE CROPS RESULT.json`.
The scorer checks the frozen and ordered manifest fingerprints, exact returned
crop metadata/order and each crop file hash. It associates crops to physical
rows from geometry without looking at their text. Its conservative bounding
box rule requires at least 90% of each manual box in one crop, in order, with
no second row covered at 10% or more. These percentages are box overlap,
not actual ink coverage; inspect disputed clipping separately.

Compare three distinct measures: exact ordered transcription; agreement on the
first changed physical row, requiring a variable in the first equation and
allowing constant-only suffix rows from cancellation, but no switched variable;
and the literal adjacent pair supporting that issue. A correct row index can
coexist with a changed starting equation. Track when an original erroneous row
becomes equivalent to its unchanged predecessor and the first issue moves
later or disappears. Neither a one-line capture nor a chain with a broken or
unsupported suffix earns issue credit. No OCR is rewritten to gain a match.

For cohort reporting, keep a separate local JSON array of planned IDs before
intake (one ID per capture condition and sheet), then create a receipts JSON
array. Examples: `{"id":"sheet1-straight","status":"scored","bundle":"...",
"crops":"...","result":"..."}` and `{"id":"sheet1-oblique","status":"illegible"}`.
Other explicit receipt statuses are `intake-rejected` and `inference-failed`;
a planned ID without a receipt remains pending. Run `phone_score.mjs PLANNED.json
RECEIPTS.json` using Node. The planned denominator includes failed and pending
captures and the report also gives comparable-chain counts by arm. Byte-identical
reuploads cannot count twice; that does not establish independent writers.

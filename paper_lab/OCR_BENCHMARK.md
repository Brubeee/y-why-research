# Paper Lab OCR benchmark v1 · synthetic only

We asked whether sparse page recognition is a safe replacement for the existing
layout mode. **It is not.** Keep the live draft/confirmation workflow unchanged.
This is an offline baseline, not an evaluation of real test papers or a grader.

## Reproduce

From the repository root, with Node, Python 3.10+, Pillow, both DejaVu Sans fonts,
and Tesseract with English data:

```sh
python paper_lab/ocr_fixtures.py --self-test
python paper_lab/ocr_bench.py --cohort dev --json /tmp/ywhy-dev.json
python paper_lab/ocr_bench.py --cohort frozen --json /tmp/ywhy-frozen.json
```

Ten generated pages use no student data. The development cohort has four plain
or ruled pages; six frozen pages have different equation templates and include
rotation, contrast loss, JPEG damage, stacked fractions, columns, a cross-out,
and a nonlinear question. The fixtures, literal labels, geometry, OCR settings,
and 70-point minimum per-word confidence were fixed before OCR. Both modes see
the same image bytes, recorded as hashes along with the full manifest hash.
Versions in this run: Tesseract 5.5.0, Pillow 13.0.0, Node 24.22.3. Font and
recognizer versions may change outputs on another machine.

The baseline calls the actual server OCR function (PSM 3). The comparison only
changes Tesseract's segmentation mode to PSM 11 (sparse text). A geometry-only
matcher uses annotation boxes to attribute OCR lines, not to crop the input. It
does not guess missing characters or join split rows. The scoring harness uses
the known active rows and rejects reorders; the counts are conditional on this
annotation aid and are not standalone page-parsing results. Only cosmetic minus
and spacing differences are ignored; a gap between digits is preserved. Missing
rows, multi-match rows and poor-confidence rows are scored separately. Confidence
is not calibrated. Stacked fractions use one intended serialized reference, so
their per-row match score is deliberately strict; whole-page math verdicts are
not attempted on stacked fractions, mixed chains or nonlinear samples.

## Frozen results

| Measure | Baseline: PSM 3 | Sparse: PSM 11 |
|---|---:|---:|
| Exact active rows (all layouts) | 12/22 | 13/22 |
| Active rows passing the confidence gate | 12/22 | 13/22 |
| Exact among rows passing the gate | 11/12 | 12/13 |
| Pages with all active rows found in order | 4/6 | 2/6 |
| Canceled rows a naive include-all picker would include | 1/1 | 1/1 |
| Supported chains resolved by offline OCR replay, gated | 0/3 | 1/3 |
| Supported chains resolved by offline OCR replay, ungated | 0/3 | 1/3 |
| Literal reference controls agreeing with declared label | 3/3 | 3/3 |
| Invalid-to-valid / valid-to-invalid flips, gated | Not measurable: 0 comparable | 0 / 0 (1 comparable, an invalid chain) |

The sparse mode preserved the invalid `9m=9` on the low-contrast page and
recovered enough preceding rows to locate it. It missed the original equation
on the cross-out page. Both modes misread the printed `y=5` as `y=9` above
the confidence cutoff on the unsupported stacked-fraction page. No fully
correct frozen chain was resolved from OCR in either mode. Do not interpret
zero observed flips as evidence that a recognizer cannot hide an error.

On the dev sentinels, both modes kept the wrong `4t−2=20` as written, rather
than changing the 2 to an 8. The confidence gate withheld all four dev
chains in both modes; without the gate the baseline resolved 1/4 and sparse
resolved 2/4. Sparse picked up the canceled row as mangled text, not as a
recognized deletion. All four literal dev reference verdicts matched the
declared labels. Separate unit tests deliberately inject a wrong-to-right
transcript to show that such a flip would be counted.

**Decision:** keep manual confirmation. Next compare explicitly selected
question/line regions against full-page OCR on a new set, tracking whether the
extra tap improves exact reading without hiding wrong or crossed-out work.
This could improve the workflow even if automatic page layout is still poor.

Motivation: [Seong et al., EMNLP 2026](https://aclanthology.org/2026.emnlp-main.476/)
documented semantic over-correction by vision-language OCR. This experiment
does not use those models or reproduce their reported scores.

### Protocol 2: raw exact chain

In addition to geometry-only coverage, the report now counts complete exact
selected-solution drafts before any edits or confidence gating. Eligible
fixtures have one bounded chain. Compare the raw engine order and all literal
lines, allowing only the same presentation normalization as the row metric.
Only a line box wholly contained in a preannotated heading or canceled row,
and not overlapping any active box, is excluded. Other unmatched detections
count as extras, even if their text resembles a heading. This conservative
policy can penalize poor localization as well as poor transcription. It is
a scoring use of annotations, not automatic identification of handwriting or
crossed-out work by the app. Stacked-fraction, two-column and nonlinear
fixtures remain in legacy coverage counts, not the bounded-chain denominator.

On the existing frozen printed/synthetic set with Tesseract 5.5.0, whole-page
PSM 3 found all active geometry in order on 4/6 fixtures but scored 0/3
eligible exact chains. PSM 11 found ordered geometry on 2/6 and scored 1/3
eligible exact chains. This small historical set is not a basis to change
defaults and is not handwriting or phone evidence. A correctly transcribed
written error passes the OCR metric; a silently corrected line or a spurious
in-scope line fails, even when geometry alone passes.

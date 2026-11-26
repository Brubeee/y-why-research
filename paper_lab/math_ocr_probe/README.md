# Offline formula OCR candidate probe

This is not part of Paper Lab's server or app, and it never invokes the maths
checker. It asks whether a model can read *what was written*, including
wrong steps. It separates formula recognition from finding the relevant rows
on a full photo.

Dependencies: Node 24, Tesseract with English, and Python with Pillow and
DejaVu Serif Italic/DejaVu Sans Mono. Run from this directory:

```sh
npm_config_onnxruntime_node_install_cuda=skip npm --cache "$PWD/.npm" ci
python prepare.py
YWHY_ALLOW_MODEL_DOWNLOAD=1 node compare.mjs frozen_oracle_01b > comparison.json
python summarize.py comparison.json
```

The opt-in downloads Apache-2.0 [TexTeller3 ONNX
weights](https://huggingface.co/onnx-community/TexTeller3-ONNX/tree/ed90c6164810242882ca90863bb85697a76f4841).
The two q4 weight files total 256,078,900 bytes. The installed model runs on
CPU; once cached, omit the opt-in to prevent network access. No input image
is transmitted. The q4 conversion is a candidate, not the canonical
upstream runtime.

The three arms use the same 36 frozen synthetic pixels: Tesseract PSM 7,
TexTeller with its converted stock processor, and the same TexTeller weights
with an upstream-style transform. The latter independently implements
[upstream input geometry](https://github.com/OleehyO/TexTeller/blob/9b88cec77bda735aa16f9fc7e4ccb4eb1500a8b2/texteller/utils/image.py):
corner-background trim, aspect-preserving resize, grayscale, normalization,
then zero-padding of the normalized tensor at bottom/right. The transform
smoke tests include blank rejection, wide/square size, normalized black, and
exact zero padding. Pillow bicubic is not assumed bit-identical to PyTorch's
antialiased resize. The exporter’s stock processor stretches to 448×448.

Six source chains each have three known rows and two views (clean typeset
and procedurally tilted/blurred/recompressed). The two views reuse the same
math; they are not independent examples. Labels and hashes are generated
before inference. The scorer keeps errors in the labels, and allows only
formatting differences in display wrappers, sized parentheses, single-line
spacing and the Unicode minus. It does not use algebraic equivalence.
An exact chain here means **all three oracle crops match**, not that the
model correctly found rows on a real page. This is not handwriting evidence
or validation on an actual phone.

## First paired run

Manifest SHA-256: `551339e7b5650044b361e1d2f6a216e10849ebc01a691602b510231ab6d35303`.
See [raw run output](oracle-01b-results.json); its SHA-256 is
`90527c439cdb6f421feebfb2623de313ed7d1fb505e6f8f8ed8d0dd2300a3ab2`.
Results with Tesseract 5.5.0, Pillow 13.0.0 and model q4:

| OCR arm | Clean exact rows | Clean oracle chains | Phone-style exact rows | Phone-style oracle chains |
| --- | ---: | ---: | ---: | ---: |
| Tesseract PSM 7 | 18/18 | 6/6 | 10/18 | 1/6 |
| TexTeller stock | 10/18 | 1/6 | 17/18 | 5/6 |
| TexTeller aspect/pad | 15/18 | 3/6 | 11/18 | 2/6 |

The preprocessing change did not produce a universal improvement. On the
phone-style rendered `n=4` that intentionally ends in a maths error, stock
TexTeller reproduced the error correctly; the aspect/pad arm produced
additional tokens. Stock TexTeller's remaining rendered-photo error was
`s/8+3/4=11/8` → `5/8+3/4=11/8`, not a harmless formatting mismatch. These arms are
not ready for policy selection solely from this small test. The next decision
needs independent real handwriting, page-row detection and paired comparisons
without oracle crops. No server or product default changed.

## Full-page isolation test

Four new three-line chains have paired clean and simulated-photo pages. They
include vertical fractions (including a deliberately wrong step), negative
signs, and a final row low on the page. Compare the existing full-page PSM 3
detector's unmodified line boxes and order against oracle row boxes obtained
from each render's known ink. Crops are padded by the same 12 pixels, and the
same stock q4 TexTeller decodes both. The generator freezes image/crop hashes
and literal truths before model inference. Duplicate crop bytes are recognized
once; no recognition output supplies a box or label. No handwritten or real
phone captures are tested here.

```sh
python page_prepare.py frozen_page_02
YWHY_MODEL_CACHE="$PWD/model-cache" node page_recognize.mjs frozen_page_02 > page-02-local.json
python page_score.py page-02-local.json
```

The cache already needs the pinned model from the first experiment. The
measurement uses unmodified Tesseract page order; it does not remove noisy
extra boxes after the fact. A crop linked to 10% or more of a row's frozen
ink counts as a hit; a complete row needs exactly one hit that retains at
least 97% of its ink and does not link to another row. A page needs one
complete crop per row in order, no extras, and all literal strings exact.
This fixed geometry rule is for scoring only, not a detector. The scorer
also accepts display/text-size fraction commands as presentation variants,
but will not normalize sums, signs, or mistakes.

| View | Crop source | Complete rows | Exact readings on complete rows | Exact entire chains |
| --- | --- | ---: | ---: | ---: |
| Clean | Oracle | 12/12 | 12/12 | 4/4 |
| Clean | Existing detector | 5/12 | 5/5 | 1/4 |
| Simulated photo | Oracle | 12/12 | 11/12 | 3/4 |
| Simulated photo | Existing detector | 5/12 | 4/5 | 1/4 |

Both versions of both vertical-fraction pages returned zero boxes in the
existing detector. With the oracle crops all four fraction pages were read
exactly, including the wrong calculation. On the other matched chain with
one noisy recognition miss, stock TexTeller changed `7a=-14` to `70=-14`
even with the correct crop. Thus page-row finding is the larger bottleneck
on this fixture set, but finding the correct crop does not guarantee
recognition. No app default changed. The next comparison should use a detector
that does not require text recognition to propose rows, and new pages to
check that it groups vertically stacked fractions without merging distinct
lines. This is not evidence that all real pages or handwriting behave this way.

Frozen manifest SHA-256:
`4d96ae89ac1258f31f4c69d94a4911e62253bc16d06f0a11d49668ccd42a651c`.
[Raw page/crop results](page-02-results.json).

## Geometry-first prototype: close rows and ruled paper

The previous pages all left 61–109 px between neighboring ink boxes. This
new frozen test uses first-row gaps of 9 px and 32 px. It pairs short
stacked fractions with distinct adjacent equation rows sharing similarly
placed minus and equals marks. The simulated-photo view includes tilt,
background variation, horizontal rules and JPEG blur. No handwriting
or native phone has been tested. Build with NumPy and SciPy in addition
to the earlier dependencies:

```sh
python close_prepare.py frozen_close_03
YWHY_MODEL_CACHE="$PWD/model-cache" node page_recognize.mjs frozen_close_03 > close-03-local.json
python page_score.py close-03-local.json
python -m unittest page_geometry_test
```

The candidate uses local contrast and projection bands, proposes a stacked
fraction only when a short horizontal bar has ink support above and below,
and clips crop padding to adjacent row midpoints. It deliberately does not
read text to choose boxes and sends the original grayscale crop to the same
stock TexTeller. The candidate is a bounded research prototype. A long rule
that touches math can remain in a connected component; rejecting whole
connected components would also destroy the attached equation. Weights,
normalization, scorer and literal truths are otherwise unchanged.

| View | Crop source | Geometrically complete pages | Exact ordered solutions |
| --- | --- | ---: | ---: |
| Clean | Existing detector | 1/4 | 1/4 |
| Clean | Geometry first | 4/4 | 3/4 |
| Clean | Frozen truth boxes + fixed padding | 3/4 | 2/4 |
| Simulated photo | Existing detector | 0/4 | 0/4 |
| Simulated photo | Geometry first | 4/4 | 0/4 |
| Simulated photo | Frozen truth boxes + fixed padding | 4/4 | 3/4 |

The fixed-padding reference is visibly not a best possible crop: on one
clean 9 px gap it imports 14.2% of the previous line's ink under the existing
score thresholds, even though that recognizer returned the right string.
The candidate admits no neighboring **math** ink across these eight
pages. However on the four ruled images its selected x bounds span about
590 of 640 px; known row masks do not include paper rules. Its model reads
0/12 rows exactly on those images, versus 10/12 on the padded truth boxes.
One denominator 9 was also consistently read as g by the candidate and
truth-box arms on clean and noisy fraction views. The improvement in
finding lines is insufficient to set a new default. Next isolate rule and
width effects without changing the OCR model, score actual handwritten
or new held-out samples separately, and preserve literal wrong steps.

[Raw crop and transcription results](close-03-results.json).
Frozen input manifest SHA-256:
`14b164053b8bac26d4f52703e17466368eb565d04b683cbd2fbab381c526d1ee`.

## Width × notebook ruling diagnostic

The previous ruled failures confounded the wide crop with ruling ink. This
diagnostic re-renders the same four noisy underlying chains twice with
identical math masks, background, blur and JPEG settings, toggling only
the synthetic rules before overlaying the marks. Each row is repositioned
once so its center is shared across both apertures (maximum 0.082 percentage
points from the center). Both widths use exactly the same candidate y
bounds and preserve all other math rows outside the crop. Narrow and wide
widths match those observed in the previous study. This investigation
explains possible failure mechanisms; it is not an evaluation of a new
detector or independent handwriting.

```sh
python width_rule_ablation.py build frozen_width_rule_04
YWHY_MODEL_CACHE="$PWD/model-cache" node page_recognize.mjs frozen_width_rule_04 > width-rule-04-local.json
python width_rule_ablation.py score width-rule-04-local.json
```

If the same denominator is wrong in multiple arms, count the whole chain
wrong in each. Do not infer correctness from the student's other lines
or resolve ambiguous glyphs using algebra.

| Synthetic ruling | Aperture | Exact rows | Exact chains |
| --- | --- | ---: | ---: |
| Off | 93–207 px | 10/12 | 3/4 |
| Off | 614–615 px | 1/12 | 0/4 |
| On | 93–207 px | 10/12 | 3/4 |
| On | 614–615 px | 1/12 | 0/4 |

The aperture change moved the result by nine rows in each condition;
switching the rules off did not recover a complete solution from wide
crops. The two wide arms got different single rows right. The paired
test points to finding a tight horizontal crop before trying to erase
notebook ruling. It does not establish that ruling never matters or
that the recognizer handles all tightly cropped equations: the
denominator `9` still became `g` in both narrow views on two related
rows. The original OCR path is unchanged.

[Raw diagnostic output](width-rule-04-results.json). Frozen manifest
SHA-256: `753c35f51d5e42e15f93e01ad4466fd4adccda547b8d1b360f82c392e2130cb4`.

## Width-only repair on fresh ruled and smudged pages

These eight new synthetic pages cover shifted and unevenly indented rows,
gaps of 10–28 px, a leading minus, short final equations, fraction bars,
sloped printed ruling, a broken dark rule, and light smudges. The source-page
hashes and exact intended rows are in [the frozen fixture record](trim-05-freeze.json).
The scan-style stressors, renderer settings and hitherto unscored
literal chains define the fixture; none is a genuine phone photograph.
The two detected crop arms share every y bound and row order. For wide
proposals the trim uses local contrast and column persistence, leaving a
margin for thin edge symbols. When support is weak it leaves the old crop
unchanged. Input pixels are unmodified and no transcript is used to choose
the box. A direct control covers a leading minus next to a short equation.

```sh
python trim_compare.py freeze frozen_trim_05
YWHY_MODEL_CACHE="$PWD/model-cache" node page_recognize.mjs frozen_trim_05 > trim-05-local.json
python trim_compare.py score trim-05-local.json
python -m unittest horizontal_trim_test page_geometry_test
```

All three arms use the pinned q4 TexTeller recognizer. The oracle uses
known math masks only for its boxes, not substituted pixels or transcripts.
No missing or extra crop is forgiven in the exact full-chain metric.
Frozen crop manifest SHA-256:
`cf35ef847ff2e4d4d2b59c1e2609c83eccea66a7545ef42988aff2fdda0a5966`.

| Source | Crop | Complete intended rows | Exact intended rows | Extra crops | Exact chains |
| --- | --- | ---: | ---: | ---: | ---: |
| Clean | Known boxes | 12/12 | 8/12 | 0 | 1/4 |
| Clean | Geometry | 12/12 | 8/12 | 0 | 1/4 |
| Clean | Geometry + trim | 12/12 | 8/12 | 0 | 1/4 |
| Ruled/smudged | Known boxes | 12/12 | 11/12 | 0 | 3/4 |
| Ruled/smudged | Geometry | 12/12 | 0/12 | 17 | 0/4 |
| Ruled/smudged | Geometry + trim | 12/12 | 4/12 | 17 | 0/4 |

The trim reduced the aperture on 10/12 intended adverse rows while
preserving the measured ink of all 12. Two apertures stayed 629 px
and two still exceeded 450 px. Spurious ruling crops remained on all four
adverse pages. Two cases recovered their second and third rows but not
their first. Even with a known crop one adverse case read `7q-8=20` as
`70-8=20`. The clean-view ceiling was also low; page parsing and exact
character recognition remain separate problems. No default is changed.
Next isolate rejecting long shallow components in the proposal mask from
rewriting the original image, and check that any new rule filter preserves
true short rows, fraction bars and leading minuses on independently frozen
pages. Do not use the 17 known extra crops as test-time labels.

[Raw crop and transcription results](trim-05-results.json).

## Rule removal for proposals only

This compares the previously tested width-only crop with a detector that
also searches the binary proposal mask for shallow ridges near horizontal,
using column occupancy in a narrow sloped band. A rule must span at least
69% of page width with evidence in at least 48% of columns. A height
support test protects the core of intersecting glyphs. No pixels are
erased from the images sent to OCR; the rule search only changes the
crop rectangles. This is a small controlled engineering experiment,
not a default for paper capture.

Four newly frozen chains have deliberately wrong steps, close spacing,
and short final rows. They are paired clean and synthetically ruled:
asymmetric sloped rules, a broken rule, smudges and low-contrast math
appear only in the second view. The known-box arm receives the same
untouched pixels as both automated arms. It supplies a geometry
reference, not a transcription reference or clean replacement image.
The freeze record contains source hashes and scored row strings before
the recognizer runs.

```sh
python rule_compare.py freeze frozen_rule_06
YWHY_MODEL_CACHE="$PWD/model-cache" node page_recognize.mjs frozen_rule_06 > rule-06-local.json
python rule_compare.py score rule-06-local.json
python -m unittest rule_mask_test horizontal_trim_test page_geometry_test
```

[Source-page freeze](rule-06-freeze.json). Crop manifest SHA-256:
`56a3ebff73fcdfb3524170d73a1be9ef81184879ce5e1b04bd6263f2b7460c7b`.

| Source | Crop | Complete intended rows | Exact intended rows | Extra crops | Exact chains |
| --- | --- | ---: | ---: | ---: | ---: |
| Clean | All three arms | 12/12 | 10/12 | 0 | 2/4 |
| Ruled/smudged | Known boxes | 12/12 | 6/12 | 0 | 1/4 |
| Ruled/smudged | Width-only | 12/12 | 1/12 | 18 | 0/4 |
| Ruled/smudged | Proposal rule filter | 12/12 | 1/12 | 3 | 0/4 |

The filter removed 15 false boxes without moving an intended row below
the predeclared 97% ink threshold. This is an improvement in geometry,
not in literal OCR. Three pages still contain an extra box, and some
remaining intended crops are wider than 500 px. No candidate arm
transcribed a whole ruled page correctly. Even known boxes recover only
one complete ruled chain and six rows. The line ends can still capture
long residual ink and the recognizer can still misread a source line
when geometry is right. No application behavior is changed. Assess
the recognizer on anonymous handwritten formulas separately from
continuous-page detection; these paired renders do not measure handwriting.

[Raw crop and transcription output](rule-06-results.json).

## Isolated human handwriting, before page finding

This compares recognizers on **individual contributor-written formulas**
from the official [Google MathWriting excerpt](https://github.com/google-research/google-research/tree/master/mathwriting)
(CC BY-NC-SA 4.0). It does not include student papers, whole handwritten
solutions, or phone captures. Within each labeled publisher split, the
probe selects four stacked-fraction and eight other formulas using a
predeclared hash of the sample ID. These are excerpt strata, not a random
sample of school math. Some formulas are outside the app's affine grammar;
publisher split names do not establish writer independence or absence from
model training. The recognizer's overlap with these samples is unverified.

Input is a clean, known formula crop rendered from X/Y coordinates with
a uniform aspect-preserving fit, round stroke ends, and white margins.
Tests require a one-point mark to appear and a pen-up gap to stay white.
A visual preview before inference showed no clipping or obvious joined
strokes. Potential ambiguity in letters, delimiters and superscripts did
not change any selection or label. The reference is the published
`normalizedLabel`. The score keeps signs, fractions, scripts and bracket
structure; it does not compare algebraic equivalence or convert slashes to
stacked fractions. The eight inference packs are a batching convention
and do not represent worked chains.

Both recognizers get identical frozen PNG bytes: local Tesseract English
single-line mode (`--psm 7`, not the shipped full-page endpoint) and the
existing pinned stock q4 TexTeller revision with greedy decoding. No raw
corpus data, weights, rendering or model output is checked in.

```sh
python mathwriting_probe.py freeze /path/to/mathwriting-2024-excerpt.tgz frozen_hw_07
python mathwriting_probe.py tesseract frozen_hw_07 > hw-07-tess-local.json
YWHY_MODEL_CACHE="$PWD/model-cache" node page_recognize.mjs frozen_hw_07 > hw-07-stock-local.json
python mathwriting_probe.py score hw-07-stock-local.json hw-07-tess-local.json
```

Official excerpt SHA-256:
`cba038def001480a89962b25cb20a60df4c4145e94c86ef9d2af65f192cb82bc`.
Frozen recognizer manifest SHA-256:
`b37cb6688995a45fac6217e4c5b098f35cf039925708b4fcde70d08a81edda9a`.

| Publisher split and stratum | Exact q4 TexTeller | Exact Tesseract 5.5.0 |
| --- | ---: | ---: |
| Valid, stacked fraction | 0/4 | 0/4 |
| Valid, other | 2/8 | 0/8 |
| Test, stacked fraction | 1/4 | 0/4 |
| Test, other | 3/8 | 0/8 |
| Total | **6/24** | **0/24** |

The learned formula reader returns nonempty output for all 24, including
substantial wrong outputs; a nonblank response is not a reliability signal.
The text reader is blank three times. Qualitative failure types include
confusing letters, dropping script structure, and emitting extra control
tokens. Do not switch the live recognizer based on this sample. Measure
how well it reads the intended one-variable equation class separately
and test real phone capture apart from clean stroke rendering. Using a
different raster density or model should be a prespecified comparison,
not a post hoc reinterpretation of these reference strings.

[Aggregate results](hw-07-aggregate.json). Local raw output SHA-256
(stock, then Tesseract): `a86f2369784b66bf4524c713b9efa8fc76b65d1341530b38086501414a58e39b`,
`66ba420c0e20d9e2f80489f019d5fdbd266148c814fbb13839dd70d7563675fc`.

### HW-08: in-scope reference inventory (no OCR)

Checked all 200 human valid/test records in the **same tiny publisher
excerpt**, not the full MathWriting dataset. Took `normalizedLabel` and
applied only the bounded display adapter in `affine_scope.mjs` followed by the
existing exact checker. The audit requires a single literal equality,
one supported variable and a supported affine equation. It rejects unknown
layouts and ambiguous implicit products by a fraction; it does not correct
characters, rename variables, or solve to force a match. The audit and
literal OCR scoring are separate.

Zero eligibility in both splits (0/100 valid, 0/100 test). Three test
references reached the exact parser and were rejected. See
`hw-08-affine-inventory.json` for the complete rejection counts and checksum.
No inference was run, the distinct-sample denominator was not padded, and
no sample-level data was saved to the repo. This rules out this excerpt as
an in-scope benchmark, not the full corpus. Reproduce with:

`python paper_lab/math_ocr_probe/mathwriting_affine_inventory.py <publisher-excerpt.tgz>`

The next evidence target is the paired paper-photo check in
[PHONE_AFFINE_PROTOCOL.md](PHONE_AFFINE_PROTOCOL.md). Case labels are authored
practice prompts; no captures or new OCR scores yet.

### PAD-09: crop-margin agreement is not a confidence guarantee

Eight new generated phone-style pages, three rows each. The same source
pixels and known ink boxes were used for all three arms; only symmetric
padding changed (6, 12, or 24 source pixels, clipped at the page edge).
No other authored row entered the tested crop. The frozen manifests and
crops reproduced byte for byte; the original cached q4 decoder settings
were unchanged. These are printed synthetic fixtures, not handwriting,
and detection was bypassed.

Each margin read 22/24 rows and 7/8 whole chains exactly. All three
agreed on 23/24 rows: 22 correct and one wrong. The one disagreement was
also wrong at every margin. On the decimal page, the second line was
written `0.4q=3.2` and returned `0.49=3.2` at all three margins; the
first misread differed between margins. No margin recovered either line.
Agreement did not catch the stable variable-to-digit substitution.
Do not install a margin or a consensus confidence gate from this result.

Reproduce with `python padding_stability.py freeze <new-dir>`, run the
pinned offline `page_recognize.mjs <new-dir>`, then run
`python padding_stability.py score <new-dir>/manifest.json <raw-output.json>`.
See [aggregate counts](padding-09-aggregate.json).

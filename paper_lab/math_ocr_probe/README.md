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

# Why the fraction photo failed

Run locally with Python, Pillow, DejaVu fonts and Tesseract:
`python paper_lab/fraction_failure_probe.py`. This reuses one *already seen*
synthetically typeset fraction fixture, not newly collected test data. The app
and OCR settings are unchanged. All eight requests use the real local endpoint
(Tesseract 5.5.0, English, page segmentation mode 3).

Matched controls preserve the text, grain seed and typography. We render at
4° and 0°. At each angle PNG and quality-72 JPEG start from identical RGB,
with no EXIF. A fixed complete-chain window (98, 274) to (680, 670) is applied
to the decoded original and uploaded as PNG, like a lossless crop from the
loaded image. It excludes the heading; it does not repair pixels or alter
the input angle. Independently rendered row boxes are used only to match
returned rows, never given to OCR. Exact scoring allows ordinary math spacing
and Unicode-minus normalization but does not correct digits, variables or
spurious characters.

| Rotation | Input | Full page exact | Fixed crop exact | Full page row issues | Crop row issues |
| --- | --- | --- | --- | --- | --- |
| 4° | PNG | 1/3 | 0/3 | All three found in order; two misread | No rows returned |
| 4° | JPEG | 0/3 | 0/3 | Final row missing | No rows returned |
| 0° | PNG | 1/3 | 2/3 | First row split; final row missing | Final row missing |
| 0° | JPEG | 1/3 | 2/3 | First row split; final row missing | Final row missing |

The rotated full JPEG reproduces the original failure. Lossless encoding
recovers the third row at 4°, but the first row gains a stray bar and the
second changes `q` to `9`. Straightening alone does not recover the last row.
The same fixed crop can remove the first-row split upright and erase all
detections at 4°. This rules out a simple “always crop” or “JPEG alone” fix
for this case, not for other pages. No condition recognized the entire chain
exactly. The 4° full PNG is the only complete ordered draft, and its
misreads still require correction. Do not infer a missing final step or
auto-confirm any draft. No browser, handset, handwriting or accuracy claim.

For a next app-facing check, use the existing manual insert/crop workflow to
see if a user can recover the missing final line without a misleading verdict
about the entire paper. Do not reuse this fixture to estimate general OCR
performance or change automatic preprocessing based on it.

## Manual recovery through the running server and app handlers

Run `python paper_lab/final_line_flow.py` (also requires Node). Two separate,
upright synthetic PNGs share the first two equations; one actually shows
`q = 2` and the other shows `q = 3`. The production photo-picker and crop-read
handlers send a real request to the local OCR endpoint for each full raster
and each crop. The DOM and image decode are mocked. The canvas shim checks
the requested coordinates and supplies the corresponding Pillow crop rather
than simulating OCR. No raw results are edited before the app consumes them.

Tesseract 5.5.0 omitted the final line from both crops, returning two exact
rows each. Checking just those two rows never mentioned line 3 and labeled
the result as selected steps only. In both cases the operator simulation
typed the visible final line manually; the app required fresh photo
attestation and confirmation of the new line. It then reported no change for
`q = 2` and marked line 3 as the first change for `q = 3`. The appended row
had no fabricated source highlight. The workflow relies on comparing the
draft to the photo, not on automatic missing-line detection. This is a
local integration check, not a browser, phone, learner, or new OCR accuracy
test.

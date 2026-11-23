# Select one question · synthetic crop study

Optional two-tap cropping is now available in the **local research prototype**.
It keeps the full photo visible, runs the same OCR on the chosen rectangle, and
maps detected boxes to the original preview. It does not replace the full-page
mode. Switching reads resets the draft and confirmations. The student must
separately verify the original equation and that no active steps were omitted.
Even then, Photo Lab reports only selected steps, never a whole-question grade.

## Four new synthetic pages

| Measure | Full page | One question crop |
|---|---:|---:|
| Exact active rows | 9/13 | 11/13 |
| Active rows above the fixed confidence gate | 7/13 | 10/13 |
| All active rows in order | 3/4 | 3/4 |
| Usable chain verdicts, confidence gated | 1/4 | 1/4 |
| Usable chain verdicts, ungated | 3/4 | 3/4 |

Both modes used local Tesseract 5.5.0 PSM 3. Crop bounds and row labels were
predeclared; these are annotation-assisted stand-ins, not measured user crop
behavior. Complete crop recovered three rows on the two-column page, but lost
the final row on a fractions page. Neither mode recovered the faint leading
minus. Both returned the crossed-out line as OCR text; neither recovered its
status. Crossed-out work still needs manual handling. No direction of verdict
flip was observed among the few comparable outputs. Independent, intentionally
corrupted literal controls exercised both directions.

**Why an original-equation check matters:** the clipped crop retained
`−x−4=12 → x=−16`, a valid local transition, but omitted the preceding
`−(x−4)=12` where the solution set first changed. Promoting the clipped suffix
produced a false pass in the offline replay. Retaining the missing anchor
as unresolved correctly withheld the verdict. The UI separately gates the
anchor and describes any result as selected steps only; it cannot know what the
student omitted.

```sh
python paper_lab/crop_bench.py --json /tmp/ywhy-crop.json
node --test paper_lab/*.test.mjs
python -m unittest discover -s paper_lab -p '*_test.py' -v
```

The table is not a handwriting benchmark. Browser interaction, device capture,
and usability still need verification. Tests use a mocked browser canvas for
pixel-coordinate plumbing, the local HTTP endpoint for real OCR, and unit tests
for missing and corrupted source evidence. Full-photo JPEG boxes are deliberately
not overlaid because the image decoder and OCR may orient them differently.

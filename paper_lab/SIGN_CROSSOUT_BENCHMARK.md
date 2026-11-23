# Faint minus and canceled rows: frozen synthetic stress test

Run `python sign_crossout_bench.py` in `paper_lab`. Requires Pillow with
DejaVu Sans Mono, offline Tesseract with `eng`, and Node. No user images,
network, app changes or policy changes. The JSON report records image digests,
fixture labels, aligned raw text and independent exact-verifier controls.

Twelve recompressed typeset pages: two fixed chains × three fixed minus-ink
intensities × single-strike/scribble. These are variants of two chains, not
independent student samples. The handwritten or photographic generalization
question is untested. Geometry aligns OCR with annotated regions for scoring
only; it is not a cancellation detector. The relevant sign is the first minus
in each active row, whether on the left or right side of equality. Missing or
fragmented text is not counted as an isolated minus deletion.

Observed locally with Tesseract 5.5.0 and Pillow 13.0.0:

| Metric | Current PSM 3 | Sparse PSM 11 |
|---|---:|---:|
| Exact active text | 3/30 | 4/30 |
| Exact preserved written erroneous step | 1/6 | 2/6 |
| Aligned minus-only loss, LHS | 2/12 | 4/12 |
| Aligned minus-only loss, RHS | 0/18 | 0/18 |
| Canceled region yielded any draft text/fragment | 0/12 | 9/12 |
| Fully comparable gated transcripts | 1/12 | 0/12 |

No complete, exact RHS-sign target row was aligned by either mode, so the zero
isolated RHS deletions do **not** demonstrate RHS-sign fidelity. Sparse PSM 11
surfaced canceled regions as corrupted fragments rather than exact text. It
gained one exact active row but increased left-sign loss and exposed nine
canceled regions. The exact-verifier controls agreed with all independently
fixed reference verdicts; only one PSM 3 draft and no PSM 11 drafts were
comparable, so zero observed verdict flips is not evidence of safety. Neither
alternative justifies changing OCR or bypassing manual sign/row confirmation.

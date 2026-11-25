# Practice-paper flow: actual OCR, simulated confirmation

`python paper_lab/photo_flow_bench.py` runs the existing local HTTP OCR
endpoint against three fixed anonymous synthetic pages. The unmodified
OCR JSON bodies are then passed to the app's actual photo and verification
handlers through a lightweight Node DOM harness. Pillow, Tesseract, Node
and loopback binding are needed; nothing is sent outside the machine.

Ground truth is the fixture annotation, independent of OCR. A match must be
a unique vertically aligned detection for each active row and in consecutive
order; unsupported mappings are reported rather than filled. Cosmetic
formatting allows whitespace and Unicode minus normalization. The
second check uses independently annotated text to simulate a careful reader
correcting mismatches before confirming the whole-photo attestation. It is
not a measurement of human transcription, usability or a browser decoder,
and it does not auto-accept actual OCR.

| Practice page | Exact active draft rows | Simulated corrections | Result |
| --- | ---: | ---: | --- |
| `t-invalid` PNG | 4/4 | 0 | After confirmation, first change at active step 2 (displayed OCR row 3); later rows not checked |
| `linear-photo-like` PNG | 3/4 | 1 | After correcting the doubled minus on the preceding valid row and confirming, first change at active step 3 (displayed OCR row 4); later row not checked |
| `fraction-rotated` JPEG | 0/3 | Not attempted | Final row not detected; no independently mapped, complete chain in this harness |

Before row confirmations and again before full-photo attestation, neither
of the two mapped pages issued a maths verdict. Real JPEG OCR segmentation
is deliberately not repaired in this harness. This small reused fixture
slice measures the connection between local OCR and app logic with a
scripted user, not real phones, handwriting, independent evaluation or
whole-page grades. Results can vary with local OCR software and fonts.

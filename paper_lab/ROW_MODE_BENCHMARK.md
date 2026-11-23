# Frozen oracle-row OCR comparison

Run `python row_mode_bench.py` with local Tesseract, English model, Pillow/
DejaVu Sans Mono and Node. Three synthetic sentinels × three fixed minus
intensities (40, 160, 216); no handwritten samples. Same recompressed input
per condition, same per-row box plus 24 white pixels on each side for PSM 7
and PSM 13. PSM 3 runs the unchanged full-page workflow. Oracle coordinates,
order and exclusion of canceled work are supplied for scoring only, not
detected by either crop strategy. No equation verdict selects a transcript.

| Metric on Tesseract 5.5.0 | Page PSM 3 | Oracle PSM 7 | Oracle PSM 13 |
|---|---:|---:|---:|
| Exact active rows | 14/18 | 15/18 | 3/18 |
| Unaligned active rows | 0/18 | 0/18 | 0/18 |
| Verifier-comparable chains, forced draft | 5/9 | 6/9 | 0/9 |
| False pass among written errors | 0/3 | 0/3 | 0/3 |
| False error among written passes | 0/6 | 0/6 | 0/6 |
| Canceled region emitted text/fragment | 0/3 | 3/3 | 3/3 |

A single aligned reply can still be a fragment or corrupted and fail parsing;
compare unresolved chains (4/9, 3/9, 9/9) with the zero unaligned rows. No
isolated minus-only deletions or exact canceled match were observed. Zero
flips are not evidence of safety, especially for PSM 13 with zero comparable
chains. Forced synthetic sign deletions in unit tests independently confirm
the expected false pass and false error directions. A canceled crop is forced
only to probe exposure: no cancel fragment is counted as an actual active
selection. Keep explicit confirmation of signs and row selection in the app.

Processed `get.images` TIFF check on the nine target marks per line mode:
6/9 regions had any dark pixel, with 92/96, 2/96, and 0/96 dark pixels per
intensity respectively, identical across modes. “Any dark” does not mean a
coherent glyph. PSM 7 still transcribed the faintest right-side minus correctly
in these outputs, so the dumped processed TIFF is evidence about those pixels,
not proof of how recognition obtained its string or of sign fidelity. Do not
change thresholds or deploy a new mode based on three synthetic chains.

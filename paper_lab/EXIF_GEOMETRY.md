# JPEG orientation: equal dimensions do not prove equal coordinates

This is a synthetic, local Paper Lab diagnostic, not phone validation or an OCR mode
change. Four JPEGs share the same encoded raster and differ only in EXIF tag 274.
The non-square page is **640 × 440** with visually different corner markers and
three printed equations. Corners below are top-left, top-right, bottom-left,
bottom-right.

| EXIF | Encoded geometry sent to OCR | EXIF-aware geometry (Pillow) | EXIF-aware marker order |
| --- | --- | --- | --- |
| 1 | 640 × 440 | 640 × 440 | red, green, blue, yellow |
| 2 (mirror) | 640 × 440 | 640 × 440 | green, red, yellow, blue |
| 3 (180°) | 640 × 440 | 640 × 440 | yellow, blue, green, red |
| 6 (90° clockwise) | 640 × 440 | 440 × 640 | blue, red, yellow, green |

In the tested local Tesseract 5.5 server path, all four produced the same
nonempty OCR text **and coordinates**, using the encoded raster. This happens even
when an EXIF-aware decoder moves the sampled content while preserving dimensions
(2 and 3). The four cases are not an OCR accuracy benchmark or a browser claim.
An app test locks the existing safe behavior: no full JPEG OCR boxes/highlights
or paper-backed crossed-out controls; usable text remains editable, and a
display/OCR size mismatch disables cropping.

## Reproduce

```sh
python paper_lab/exif_probe.py
python paper_lab/exif_probe.py --browser-html /tmp/ywhy-exif-fixtures.html
python -m unittest discover -s paper_lab -p 'exif_probe_test.py' -v
node --test paper_lab/app.test.mjs
```

Open the generated HTML locally in a permitted normal browser. It has only
synthetic embedded data, samples all four displayed corners on canvas and round-trips
one selected source corner through a canvas PNG export. Record browser/version,
reported dimensions, marker order and PNG crop marker. Native headless Chromium
156 in this environment fails before navigation with
`process_singleton_posix.cc: socket() failed: Operation not permitted`.
No security flags or other computer were used to get around that restriction.
The generated page is a reproducible future check, not a browser pass.

Do not enable raw JPEG overlays merely because sizes agree. A future fix should
derive the display and OCR input from the **same** explicitly canonical pixel
raster, then verify alignment and rotated/mirrored crop coordinates on a real
browser/device. Existing JPEG text-only and PNG geometry behavior is unchanged.

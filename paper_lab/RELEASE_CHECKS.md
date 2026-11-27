# Paper Lab release checks

This is a check sheet, not a release approval. Use an anonymous synthetic
practice sheet and a fresh browser profile. Record the commit, device, OS,
browser version, date, route, and PASS / FAIL / BLOCKED for each case. For a
failure, record the case ID, last successful step, and the on-screen error;
do not retain a worksheet photo, OCR transcript, network body, or browser
trace from real student work.

## Run the controlled exercise

From the repository root, make the known fixture without starting OCR:

```sh
(cd paper_lab && python -c "from pathlib import Path; from local_release_smoke import synthetic_page; synthetic_page(Path('/tmp/ywhy-release-fixture.jpg'))")
```

Open the private formula candidate as described in the [run instructions](README.md#optional-local-formula-ocr-worker-research-candidate).
For a phone, use an independently approved private build that actually has
the formula route. The development server's loopback address on a phone
does not refer to the developer's computer. **Do not** expose the development
server, add a tunnel, or test on a visual-only preview. If there is no
approved way to reach working OCR on the phone, mark that column BLOCKED.

The fixture reads `7x+4=53 → 7x=48 → x=7`. The written 48 is intentional.
It must survive OCR and stay unchanged until the reviewer edits it.

| ID | Action | Passing observation |
| --- | --- | --- |
| A1 | On a real phone, use **Take photo** with that practice sheet displayed or printed. Repeat with **Choose existing photo** and the fixture. | Camera and gallery are usable without switching to typed input. The approved formula endpoint returns the draft, and the photo and all three lines can be reviewed. Record capture versus gallery separately. |
| A2 | Before confirming, check the draft. Then confirm every row except row 2 and attest the order. Finally confirm row 2. | No verdict before all three rows and the complete order are attested. The first verified change is at line 2; line 3 isn't presented as checked. |
| A3 | Inspect the exact comparison. Declare **Subtract**, enter `4`, and check. First enter `7x=48` as the repair, then `7x=49`. | The comparison is between lines 1 and 2: x = 48/7 makes the first 52 ≠ 53 and the second 48 = 48. The first repair is rejected and the second accepted. No auto-correction of the draft. |
| A4 | Solve the next step of `3m+5=2m+11` with `m+5=11` before help. Repeat in a fresh session after one readable wrong attempt and a hint. | The fresh problem is distinct from the repair. Unaided first success is recorded separately from a later aided success. |
| A5 | Enter the same chain and repeat A3–A4 using **Confirm and check typed chain**. Then edit the typed chain. | The same exact evidence and tutor are reached with no OCR request. Editing invalidates the old evidence and practice. |
| B1 | After reaching a verdict, close each photo picker without choosing; then choose an oversized JPEG. Repeat with HEIC if the OS lets the file through the picker. | No new verdict or upload on dismissal/rejected selection. The committed work stays visible. Record whether the OS converted, filtered, or passed on HEIC; do not record app HEIC support if the OS sent a JPEG. |
| B2 | With a verified worksheet visible, use a temporary network interruption or a controlled unavailable response, then restore service and pick the same JPEG again. | No new draft replaces the worksheet on failure. Same-file reselection works after recovery. If the environment safely exposes real contention, also check that only the coded busy response offers **Retry this photo**, and the retry is manual. |
| B3 | Repeat with a rotated JPEG and one benign unsupported example, such as a sheet containing a squared term. | Reviewer can compare the upright preview and ordered rows, or is told why the input cannot be used. Unsupported mathematics never receives a fabricated verdict. |
| C1 | Walk through the controls by keyboard or a device screen reader. At high zoom and in phone portrait check both the photo and confirmed rows. | Both photo entry controls are named, each row confirmation can be reached, focus is visible, status changes can be heard, and the review does not require horizontal scrolling to reach the check button. In the typed path, confirmation focuses the result heading and Edit returns focus to the original input. Mark device and assistive technology used. |
| C2 | After A4, check storage before and after explicitly saving a review. Press **Clear**, reload, then use **Delete saved review** and reload again. | Worksheet and evidence disappear on Clear. Only the opt-in authored item/outcome record survives reload; it contains no photo, rows or answers. Delete removes that record. Check browser Back/Forward separately; a browser-restored live page is not proof of data deletion. |

For B2 on the private formula route, also simulate a connection that stalls
without closing (waiting for headers or a partial response body). Keep the
page foregrounded. The 210-second browser deadline should stop waiting,
keep the current worksheet, and let the user select the same photo again.
It must not trigger an automatic retry. Browser cancellation does not prove
the server's inference stopped; check the hosting timeout separately.

## Evidence to keep separate

- **Exact-loop regression:** The private synthetic smoke is a real OCR HTTP
  round trip with the UI's JavaScript in a test harness, not a browser run.
  It verifies A2–A4's core behavior, not device or assistive technology behavior.
- **Device evidence:** Run A and B on the target Android and iOS browsers.
  Record a desktop-browser pass or a viewport-width pass as such, not as
  phone evidence. Record actual C1 behavior, not just the presence of ARIA.
- **Reading quality:** Freeze a different cohort of anonymous or explicitly
  consented practice pages. Record complete ordered transcription and symbol
  preservation before correction, and exact verdicts *after* human review.
  Separate clean print, real handwriting, and fail-closed controls. Do not
  treat the exercise above as a handwriting benchmark.
- **Approved hosting:** With synthetic requests only, confirm HTTPS,
  same-origin processing, ingress size limits, cold/warm duration, contention,
  cache policy, and whether any proxy, worker or error logger persists images
  or transcripts. Reject a build with hidden fallback or unresolved data
  handling. A local no-store header alone does not verify hosting.

Do not mark publish-ready on test-suite results alone. A blocked photo path
on a target phone is a launch blocker, not an excuse to substitute typed work.

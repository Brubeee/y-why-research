# Y? Paper Lab / assistant-assisted research reference

This branch is an assistant-assisted R&D prototype requested by the project owner. It is not the team's original competition submission, a production release, a new entry, or evidence of educational effectiveness. It leaves the Zonal workflow and original public demonstrator intact. Any finale implementation must follow the organizer's student-authorship and external-tool-acknowledgment rules.

## What this increment proves

- An actual local Tesseract draft can read a PNG/JPEG into ordered lines and return source-pixel boxes. From a practice photo, pick **one consecutive solution chain** starting with the original equation and explicitly confirm each transcription. Nothing is auto-corrected to make the maths fit. Page segmentation, mixed printed/handwritten work, crossed-out lines, and reliable handwriting/geometry are not solved.
- An exact integer/rational affine checker preserves solution-set equivalence, spots the first changed solution set and stops at an unreadable/unconfirmed row. It does not certify every reasoning move or grade the entire page.
- A bounded symbolic diagnostic compares two executable candidate responses and searches for a new prompt whose predictions and correct answer differ. It reports observed consistency, not a proven misconception, and does not use a trained model. Example: `−(x−4)=12 → −x−4=12` can lead to `−3(y−2)`; `−3y−2`, `−3y−6`, and `−3y+6` are distinct.
- Course selector uses an optional, explicit book or programme choice. After the checker sees a confirmed supported equation it can suggest one of two book-specific review references; IB MYP stays at the Algebra topic level. This does not infer the photographed chapter or adjust exact correctness.
- Responsive local web UI includes a camera/file input. No store release, PWA installability, handheld validation, cloud OCR, accounts, saved practice history or MEMEX scheduling yet.

## Run locally

Python 3.10+, Tesseract with English data and a current browser are needed. No network/OCR API key is required. From the repo root:

```sh
python paper_lab/ocr_server.py --port 8765
```

Open `http://127.0.0.1:8765/paper_lab/`. The server listens only on loopback and sends no photo to another service. It temporarily writes a photo for local Tesseract decoding and removes it after completion/error; it does not persist requests or OCR text. Do not make this research server public or use identifiable student work. An eventual phone build needs genuine on-device processing or a separate, consented and secured deployment design.

## Verify

```sh
node --test paper_lab/*.test.mjs
python -m unittest discover -s paper_lab -p '*_test.py' -v
```

The Python synthetic-image test needs Pillow and DejaVu Sans Mono; the OCR endpoint will run without Pillow. Synthetic image and equation fixtures are smoke tests, not handwriting or learning benchmarks. On the available Tesseract build, a synthetic printed `2 + 3 = 5` was even misread as `2+32=5`. That is why confirmation is mandatory.

**OCR accuracy:** See the [synthetic stress test](OCR_BENCHMARK.md) for the current baseline, sparse-mode comparison, explicit abstentions and independent exact-math reference controls. The result does not support a production mode switch. Next test a user-selected crop against the full-page baseline, then assess real anonymous practice photos before claiming handwriting accuracy.

## Scope and sources

- Parent baseline: `prototype/typed-equations.*` (simple integer grammar). The richer local Zonal notebook and its source history are not in GitHub main; no parity claim with that separate build.
- Curriculum references: one-variable equations in Grade 7 Ganita Prakash Part II, Chapter 7, [Finding the Unknown (KVS teaching plan, PDF)](https://cdnbbsr.s3waas.gov.in/s3kv024a04cc7c870cd1cea818dea66958/uploads/2026/04/2026043072.pdf); negative distribution practice in Grade 8 Ganita Prakash Part I, Chapter 6, [We Distribute, Yet Things Multiply (NCERT activity index)](https://ciet.ncert.gov.in/activity/grade8?lang=en); [IB MYP mathematics framework](https://www.ibo.org/programmes/middle-years-programme/curriculum/mathematics/). Links point to supporting references, not a full syllabus or direct chapter PDFs. Mismatched or unknown book profiles get a skill only. The lookup works locally and does not store the profile or send it with the photo.
- Diagnostic precedent: Brown & Burton, [Diagnostic Models for Procedural Bugs](https://doi.org/10.1207/s15516709cog0202_4), and Rafferty et al., [Assessing Mathematics Misunderstandings via Bayesian Inverse Planning](https://doi.org/10.1111/cogs.12900). No first-of-its-kind claim.
- OCR dependency: [Tesseract](https://github.com/tesseract-ocr/tesseract). This branch does not bundle training data or models. The separate StepVerify baseline is not loaded here.

## Mistake-to-retry experiment

The [retry lab](RETRY_LAB.md) links a supported verified distribution mistake to
one exact, form-aware practice question. It keeps first attempts apart from
hint-aided responses in the current session. It does not yet schedule a
delayed review or measure learning.

- A photographed gap can be skipped only after you confirm that an entire
  separately highlighted OCR row is crossed out and contains no active work.
  Keep mixed or uncertain rows unmarked and correct the draft instead. The
  option needs dependable source boxes (full JPEG OCR does not show them);
  it does not detect strike-through, missing rows, or mixed text inside a box.

- If OCR misses an active row, use **Insert line above** on the next visible row
  to type the missing work where it belongs. This creates no OCR highlight and
  does not assume what was written. Check the full photo again and confirm the
  new transcription before relying on the verdict.
  A handwritten line entered this way does not prove the photo order around a
  crossed-out row. In that case the checker names the unlocated line and
  stops; reread a crop of the question if available and reconfirm the new draft
  only if the needed lines have their own nonoverlapping highlights.

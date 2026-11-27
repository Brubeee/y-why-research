# Y? Paper Lab / assistant-assisted research reference

This branch is an assistant-assisted R&D prototype requested by the project owner. It is not the team's original competition submission, a production release, a new entry, or evidence of educational effectiveness. It leaves the Zonal workflow and original public demonstrator intact. Any finale implementation must follow the organizer's student-authorship and external-tool-acknowledgment rules.

## What this increment proves

- An actual local Tesseract draft can read a PNG/JPEG into ordered lines and return source-pixel boxes. From a practice photo, pick **one consecutive solution chain** starting with the original equation and explicitly confirm each transcription. Nothing is auto-corrected to make the maths fit. Page segmentation, mixed printed/handwritten work, crossed-out lines, and reliable handwriting/geometry are not solved.
- An exact integer/rational affine checker preserves solution-set equivalence, spots the first changed solution set and stops at an unreadable/unconfirmed row. It does not certify every reasoning move or grade the entire page.
- A bounded symbolic diagnostic compares two executable candidate responses and searches for a new prompt whose predictions and correct answer differ. It reports observed consistency, not a proven misconception, and does not use a trained model. Example: `−(x−4)=12 → −x−4=12` can lead to `−3(y−2)`; `−3y−2`, `−3y−6`, and `−3y+6` are distinct.
- Course selector uses an optional, explicit book or programme choice. After the checker sees a confirmed supported equation it can suggest one of two book-specific review references; IB MYP stays at the Algebra topic level. This does not infer the photographed chapter or adjust exact correctness.
- Responsive local web UI includes separate native-camera and existing-photo inputs. A short next-day practice item can be saved locally by opt-in (see below). No store release, PWA claim, handheld validation, cloud OCR, account history or MEMEX integration.

## Run locally

Python 3.10+, Tesseract with English data and a current browser are needed. No network/OCR API key is required. From the repo root:

```sh
python paper_lab/ocr_server.py --port 8765
```

Open `http://127.0.0.1:8765/paper_lab/`. The server listens only on loopback and sends no photo to another service. It temporarily writes a photo for local Tesseract decoding and removes it after completion/error; it does not persist requests or OCR text. Do not make this research server public or use identifiable student work. An eventual phone build needs genuine on-device processing or a separate, consented and secured deployment design.

Photo uploads and rereads currently send PNG or JPEG, up to 4 MB (4,000,000 bytes). A rejected replacement keeps the previous photo and confirmed work. Oversize recovery still asks for a smaller photo; the app does not automatically resize or convert phone captures. This is not a verified public OCR deployment.

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
  or **Add a missed line at the end** if there is no next row. Type the line
  as written, even if the maths looks wrong. This creates no OCR highlight and
  does not assume what was written. Check the full photo again and confirm the
  new transcription before relying on the verdict.
  A handwritten line entered this way does not prove the photo order around a
  crossed-out row. In that case the checker names the unlocated line and
  stops; reread a crop of the question if available and reconfirm the new draft
  only if the needed lines have their own nonoverlapping highlights.

- After all selected lines are confirmed and preserve the solution, some
  steps include an optional [written expansion check](OPERATION_CLAIM.md).
  Changing both sides can be mathematically valid. The optional check
  only answers whether the written step fits expanding the left bracket
  without rewriting the right side. It does not infer how you solved it.

### Optional local formula OCR worker (research candidate)

The default Paper Lab photo path remains `/api/ocr`. For the opt-in whole-page
formula candidate, use `/paper_lab/?formula=1` on the local server below.
On a Linux development machine, provision
the official MIT `zai-org/GLM-OCR` snapshot at
`2e85a62840ccac27daa451df36c736c4636b8628` in a local directory. Verify
`model.safetensors` SHA-256
`a16eb0de98d199293371c560f95f83130d2a2c9612449df16839f08ff9498815`
before running. The checked development setup used CPU Torch `2.15.0+cpu`,
Transformers `5.6.2`, and Pillow. No Hugging Face requests are made at runtime
and remote model code is not enabled.

```sh
python paper_lab/ocr_server.py --formula-python /path/to/venv/bin/python \
  --formula-model /path/to/pinned-model
curl -H 'Content-Type: image/jpeg' --data-binary @synthetic-page.jpg \
  http://127.0.0.1:8765/api/formula-draft
python paper_lab/formula_worker_test.py
```

The response is unconfirmed model text, **not** a grade, transcript attestation,
confidence score, or row alignment. Feed it through
`math_ocr_probe/glm_page_draft.mjs` and show the original image beside the ordered
editable rows before any confirmation or verification. The opt-in photo control does this
through the strict adapter; it checks nothing until all lines and the full
order are attested. It never silently falls back to Tesseract or invents row
boxes. A rejected draft leaves the existing work intact. Use one equation
chain per photo. Typed entry still works independently. This is a local
research UI, not the Lovable preview or a release deployment.

The worker keeps one model warm and admits only one inference at a time. It
does not queue a second image. Startup and inference are separately bounded
(120 s and 60 s respectively); an inference deadline kills the worker before
another request can start. The input is limited to single-frame raw PNG/JPEG
up to 4 MB, 12.5 million pixels and 7000 pixels per side. The formula path
accepts 4032 × 3024 (or portrait) within that byte limit, which the previous
12-million-pixel cap rejected. The legacy Tesseract cap is unchanged. The
review screen distinguishes a known resolution rejection from a generic
upload-size limit and keeps the current verified work in either case.
The offline worker orients via EXIF and
fits within 768 pixels without upscaling. Uploaded images are not written to
disk or forwarded. Responses are marked `no-store`. This is a private loopback
test server, not a public hosting or deployment prescription.

Run the reproducible private check with the pinned local model:

```sh
python paper_lab/local_release_smoke.py --formula-python /path/to/venv/bin/python \
  --formula-model /path/to/pinned-model
```

This uses Pillow, DejaVu Sans, and Node. It generates one synthetic JPEG
locally at 3024 × 4032, opens only an ephemeral loopback port, runs the suites with the
real worker, and removes the fixture and stops the server on exit. There is
no user-photo argument. The smoke verifies the SHA-256 of the local weights
against the pin above before starting the server. It does not download files
or verify the provenance of the rest of the local snapshot. If the weights
are missing or different, record the real OCR smoke as blocked, not passed. The composed test preserves
`7x+4=53 → 7x=48 → x=7` exactly as written, waits for explicit complete-order
review, then exercises the first changed line, exact repair, and a separate
unaided practice problem. This is a DOM harness, not a physical phone test.

### Release handoff

Treat the research UI as the behavioral reference for any future frontend,
not permission to publish or wire up a live site. Keep these gates separate:
Use the [release check sheet](RELEASE_CHECKS.md) to record device-specific evidence.

- **Local behavior:** photo and typed routes enter the same exact checker only
  after confirmation. A rejected or superseded photo cannot clear the current
  verified worksheet. Only contention offers a manual retry of the same photo;
  the file is held in page memory and only resent on an explicit click.
- **Real phones:** before release, verify camera and gallery, normal and rotated
  captures, HEIC/oversize recovery, busy retry and focus, whole-page confirmation,
  exact repair and independent practice on target Android and iOS browsers.
  A viewport can check layout only.
- **Reading quality:** freeze independent anonymous or explicitly consented
  practice pages before evaluation. Measure written symbols and complete row
  order separately from checker verdicts. Synthetic passes are not handwriting
  accuracy. Keep visible confirmation, even if accuracy improves.
- **Hosting and privacy:** verify same-origin ingress, body limits, cold and
  warm latency, single-job contention and no-store/no logging at each request
  hop. The loopback server is not suitable for public exposure. The Lovable
  visual preview is separate, with no connected live OCR in the reviewed build.
  Do not upload real student work, connect a live service or publish from this
  checklist.

## Shared typed and formula-photo tutoring candidate

Typed input and fully attested formula photos use the same exact checker and
declared-operation tutor. A written step is never attributed to a guessed
operation. The app shows the actual preceding line and an independently
evaluated substitution when available. It does not list the anchor's solution.
A supported one-step repair can open a separate authored practice equation.
The selection excludes written templates from the complete confirmed chain
and accepted repair, and never reuses an item previously shown on the current
page. The check is conservative, not a claim of universal problem similarity.
If neither item is eligible, the app says so instead of recording a repeat
as independent. Hints are available only after an evaluable attempt. Success
on a later attempt is not recorded as first-attempt success. Rechecking the
same confirmed work or submitting the same operation again keeps that
record and the current practice item. Edits still invalidate them. The default
Tesseract workflow is unchanged.

The typed tutoring, declared-operation checks, and attempt recorder are
adapted from Manan and Vihan's
[Diagnostic Studio research branch](https://github.com/Brubeee/y-why-research/tree/906f9d4992b87f164d8a9fcb9cb945b0bfd2142f/paper_lab).
That branch's notes describe the student decisions, Codex assistance, and
experimental limits. This integration adds no learned selector and makes no
claim of learning improvement.

For typed-only review, serve the repository root with
`python -m http.server 8766 --bind 127.0.0.1` and open
`http://127.0.0.1:8766/paper_lab/`. That static server does not provide OCR;
use the local formula worker above to exercise both entry routes.

### Optional next-day equation practice

After a supported repair and an exact correct immediate practice step, either
confirmed entry route can offer one additional authored problem for tomorrow.
The offer excludes a known written template from the current chain, its repair,
and that session's immediate practice. No offer appears when there is no
distinct reviewed item. Today's evidence stays separate from the next-day
result, even when today's success followed a hint.

Saving requires a click. The browser stores only a version, authored item ID,
due time and coarse first-readable outcome. It stores no worksheet image,
transcription, answer, or account information for this feature. Return in the
same browser after 24 hours (device clock); there is no reminder, account sync,
or hint. **Clear** removes current work, while **Delete saved review** separately
removes the browser record. The app honors existing expression reviews. Results
are not a mastery or retention score. Simultaneous use across tabs is not a
transactional assessment system.

# Y? typed-equation prototype

This folder contains the authored, deterministic browser demo linked from the Y? project site. It checks a restricted grammar of typed linear equations by comparing solution sets across consecutive lines. It can mark the first non-equivalent transition as a candidate and show later lines as downstream. It also offers two fixed worked-example probes and an abstention path for unsupported input.

This is not the StepVerify trained model, a misconception diagnosis, or evidence of learning impact. The checker runs in the browser and does not send or save typed work. It has not been teacher-validated.

Run from the repository root with:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765/prototype/typed-equations.html`.

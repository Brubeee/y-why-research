# Y? — First-error research prototype

Y? is exploring whether a short sequence of a learner's written algebra steps can help locate the **first incorrect step**, then support a targeted follow-up question. This repository starts with a small, reproducible text-classification baseline on a public, teacher-annotated math dataset. It is research scaffolding, not a working Y? algebra diagnosis product.

## Current experiment

The Colab notebook trains a TF-IDF + logistic-regression classifier to identify the earliest erroneous step in each solution. It turns each line up to the current step into an example, groups validation by problem to keep versions of the same word problem out of both splits, and compares the model with a naive “first line is wrong” baseline. The dataset has 1,002 annotations and every example is a **math word problem**. It is not a linear-equation dataset. Results are therefore only a pipeline/method sanity check; they do not show that Y? can diagnose algebra errors or generalize to real students.

The only trained model artifact belongs in `artifacts/` after a run. The dataset is downloaded from its host by the notebook and is not copied into this repository.

## Run in Colab

Open [the notebook in Google Colab](https://colab.research.google.com/github/Brubeee/y-why-research/blob/main/notebooks/first_error_baseline.ipynb) and run all cells. It fetches the public data, trains on CPU, prints held-out metrics, and writes a model plus a metrics JSON into `artifacts/` in the Colab runtime. Colab's temporary files are not automatically committed to GitHub.

For a local run with Python 3.10+: install `requirements.txt`, then run `python train_stepverify.py`. The script downloads the same source data when no local input is passed.

## Data sources and why

1. **StepVerify (training now):** ETH Zurich / TU Darmstadt's public release contains 1,002 multi-step math word-problem solutions with teacher-annotated first-error indices and error categories. It is the closest available quick-start dataset to the *first-error localization* part of Y?. Its domain is arithmetic word problems, so it is deliberately treated as a methodological smoke test. The upstream research repository states CC BY-SA 4.0; see its card and citation before reusing derived outputs. [Dataset card](https://huggingface.co/datasets/eth-nlped/stepverify) · [paper](https://aclanthology.org/2024.emnlp-main.478/) · [upstream code/data and license](https://github.com/eth-lre/verify-then-generate).
2. **KDD Cup 2010 Algebra I (next, auxiliary):** The official 2005–2006 development set has 575 learners and 813,661 tutor step records, including a “Correct First Attempt” outcome, problem/step names, skill labels, and opportunity counts. It can support an algebra step-error-risk benchmark. It does **not** provide free-form student workings or teacher labels for error causes, so it cannot by itself train Y?'s intended misconception-vs-slip diagnosis. Read and comply with the [official data page and terms](https://kdd.org/kdd-cup/view/kdd-cup-2010-student-performance-evaluation/Data); do not redistribute the data.
3. **Y? linear-equation data (needed for the actual target):** collect or author an explicitly separate, small benchmark of typed step sequences for one-step/two-step linear equations, with first-error location, error category, and a short rationale reviewed by a math teacher. Start with consented volunteer responses or expert-authored synthetic cases clearly tagged as synthetic. Split by equation template and learner, publish no identifiable student data, and obtain appropriate consent/permissions before retaining real student work. Keep handwritten image/OCR work out of this first experiment.

## Research and build plan

1. **Reproduce the baseline:** run the notebook, record dataset version, train/validation group counts, exact first-error accuracy, per-step precision/recall/F1, and the first-line baseline. Keep seeds and split groups fixed. A single random split is exploratory, not proof.
2. **Audit domain fit:** review what StepVerify covers and make the mismatch explicit. Inspect KDD Cup terms and schema before using it. Use KDD only for next-step correctness prediction, not reasoning diagnosis.
3. **Build a narrow algebra benchmark:** focus first on linear equations and four observable labels: sign/inverse-operation error, coefficient/division omission, arithmetic slip, and other/unclear. Have a qualified reviewer check label definitions and ambiguous examples. Keep student-level and equation-template groups out of validation/test to prevent leakage.
4. **Compare simple methods:** symbolic rule checks for algebra equivalence and operation balance; TF-IDF/logistic regression; then a small pretrained text encoder only if the benchmark size and compute justify it. Report exact first-error match, macro F1 by error type, per-group results, and calibration. Include “abstain / unclear” when evidence is insufficient.
5. **Test the diagnostic question separately:** compare a mathematically checked probe against a generic follow-up on held-out misconception/slip cases. Measure whether responses discriminate the intended error type, and ask a teacher to audit each probe. One answer is evidence, not a permanent learner trait.
6. **Only then consider handwriting:** first measure OCR step transcription on consented examples; do not conflate recognition errors with algebra reasoning errors.

## Limits and safety

- This baseline uses an external word-problem dataset and cannot substantiate Y?'s algebra claims.
- One dataset split, a high score, or synthetic examples would not establish educational effectiveness.
- Do not infer a stable student trait from a single mistake or probe.
- No learner data, credentials, or API keys belong in this repository.
- The web demo under `../supporting-demo/` is authored deterministic logic; it does not load this model.

## Citation

Daheim, N., Macina, J., Kapur, M., Gurevych, I., & Sachan, M. (2024). *Stepwise Verification and Remediation of Student Reasoning Errors with Large Language Model Tutors*. EMNLP 2024. https://aclanthology.org/2024.emnlp-main.478/ (CC BY-SA 4.0 per upstream repository).


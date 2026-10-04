# Y? Making plan

## Target

Start with typed, step-by-step solutions to simple linear equations. Given a problem and a student's ordered steps, locate the first invalid transition and classify only what the evidence supports. The first output is a trace annotation, not a student profile. Handwriting OCR, broad algebra coverage, and open-ended tutor generation are later work.

## Data plan

| Source | Role | What it contains | Boundary |
|---|---|---|---|
| [StepVerify](https://huggingface.co/datasets/eth-nlped/stepverify) | Train the first-error text baseline now | 1,002 teacher-annotated multi-step math word-problem solutions and error indices | Not linear algebra; smoke test only. Upstream says CC BY-SA 4.0; cite and share alike. Data stays at source. |
| [KDD Cup 2010 Algebra I 2005–06](https://kdd.org/kdd-cup/view/kdd-cup-2010-student-performance-evaluation/Data) | Next auxiliary benchmark | 575 learners / 813,661 step records with first-attempt correctness and skill metadata | Tutor actions are not free-response algebra work and labels are not misconception causes. Observe official terms; do not redistribute. |
| New, narrow algebra benchmark | Required to evaluate the real Y? task | Typed linear-equation traces with first-error step and reviewed error labels | Collect with informed consent or tag expert-authored synthetic cases separately. Group splits by learner and equation template. Teacher review required. |

Candidate target labels: inverse-operation/sign error; coefficient division omitted; arithmetic/transcription slip; other/unclear. Keep an abstain option. Never label the learner as having a lasting misconception from one trace.

## Milestones

1. Run and publish the StepVerify baseline with a problem-group holdout and naive baseline.
2. Inspect the KDD schema/terms, then create an auxiliary next-step correctness benchmark if its use conditions fit.
3. Define and teacher-review a consented/clearly synthetic linear-equation set; version annotation rules before model comparison.
4. Compare symbolic equivalence checks and a compact text classifier. Keep all variants of equation templates and all steps from each learner inside one split.
5. Evaluate first-error exact match, macro F1 per error class, abstention, and calibration; inspect false alarms and missed errors by type.
6. Evaluate targeted diagnostic questions on separate held-out cases. Only add handwriting recognition after a separate consented OCR evaluation.

## First experiment details

The runnable baseline uses word and character TF-IDF features over the problem plus the solution prefix up to each candidate step, and class-weighted logistic regression. It trains on all steps before the teacher-labeled first error (including later steps as negatives for the *first*-error position task), with validation grouped by problem text. It reports per-step metrics and exact first-error location per solution against a first-line heuristic. This task and dataset are broader than the Y? algebra goal. The result is a pipeline check, not product accuracy.


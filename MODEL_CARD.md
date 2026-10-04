# Model card: StepVerify first-error baseline

## Intended use

A small research baseline for locating the teacher-annotated first incorrect step in a sequence of math word-problem steps. It exists to exercise the Y? first-error pipeline and evaluation workflow. It is not an algebra tutor, student profile, production model, or validated diagnosis tool.

## Training data and license

The model uses the public [StepVerify dataset](https://huggingface.co/datasets/eth-nlped/stepverify), containing 1,002 annotated math word-problem solutions in this run. The raw dataset is not included in the repository. The upstream release is CC BY-SA 4.0; downstream reuse should retain attribution and share-alike obligations. See the [paper](https://aclanthology.org/2024.emnlp-main.478/) and [upstream repository/license](https://github.com/eth-lre/verify-then-generate).

## Method and evaluation

Word and character TF-IDF features over each problem and the candidate solution prefix feed a class-weighted logistic regression. The fixed seed is 42. Validation uses a 20% `GroupShuffleSplit` grouped by exact problem text. That holds identical problem strings apart, but it is only one exploratory split and does not test learner-level or equation-template generalization.

The completed Google Colab CPU run used Python 3.13.15 and scikit-learn 1.6.1. It produced 5,935 step examples, with 4,642 training examples and 1,293 validation examples across 123 held-out problem groups (208 held-out solutions). Metrics: per-step accuracy 0.6210, precision 0.2191, recall 0.5288, F1 0.3099, macro-F1 0.5243, and exact first-error accuracy 0.2596 versus 0.2163 for a first-line heuristic. The exact metrics are in [`artifacts/colab_metrics.json`](artifacts/colab_metrics.json).

## Artifact provenance

[`artifacts/stepverify_first_error_baseline.joblib.zip`](artifacts/stepverify_first_error_baseline.joblib.zip) contains a separately regenerated serialization of the same committed training script, using local Python 3.10.11 and scikit-learn 1.6.1. The fixed split produced the same reported metrics as Colab. Re-run the notebook to create a Colab-native serialization. The dataset itself is not bundled.

Joblib files use Python pickle serialization. Load this artifact only if you trust this repository and use a compatible scikit-learn environment.

## Limitations and next data needed

StepVerify examples are math word problems, not typed linear-equation traces, handwritten work, or Y? target-task data. These scores do not show that the model can diagnose linear-equation errors, distinguish misconceptions from slips, or help real students. The next meaningful dataset is a small consented or clearly synthetic set of typed one-step and two-step equation traces with teacher-reviewed first-error labels and a learner/template-grouped holdout. KDD Cup 2010 Algebra I can be an auxiliary step-correctness benchmark, but it has tutor interaction events rather than free-response work and misconception labels; its official terms restrict redistribution.


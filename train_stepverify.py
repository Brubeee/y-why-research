"""Small, reproducible first-error localization baseline for the StepVerify corpus."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from urllib.request import urlopen

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import FeatureUnion, Pipeline


DATA_URL = (
    "https://huggingface.co/datasets/eth-nlped/stepverify/resolve/main/stepverify.json"
)
SEED = 42


def load_records(data_path: Path | None) -> list[dict]:
    if data_path:
        return json.loads(data_path.read_text(encoding="utf-8"))
    with urlopen(DATA_URL, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def make_examples(records: list[dict]) -> tuple[list[str], list[int], list[int], list[str]]:
    texts: list[str] = []
    labels: list[int] = []
    solution_ids: list[int] = []
    groups: list[str] = []
    kept = 0
    for solution_id, row in enumerate(records):
        steps = row.get("student_incorrect_solution")
        error_index = row.get("incorrect_index")
        if not isinstance(steps, list) or not steps or error_index is None:
            continue
        try:
            error_index = int(error_index)
        except (TypeError, ValueError):
            continue
        if not 0 <= error_index < len(steps):
            continue
        problem = str(row.get("problem", ""))
        topic = str(row.get("topic", ""))
        for index, step in enumerate(steps):
            prefix = "\n".join(
                f"Step {prior + 1}: {steps[prior]}" for prior in range(index + 1)
            )
            texts.append(f"Topic: {topic}\nProblem: {problem}\n{prefix}")
            labels.append(int(index == error_index))
            solution_ids.append(kept)
            groups.append(problem)
        kept += 1
    if not texts:
        raise ValueError("No usable annotated solutions were found in the dataset.")
    return texts, labels, solution_ids, groups


def build_model() -> Pipeline:
    features = FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    ngram_range=(1, 2), max_features=20_000, min_df=2,
                    sublinear_tf=True, strip_accents="unicode",
                ),
            ),
            (
                "character",
                TfidfVectorizer(
                    analyzer="char_wb", ngram_range=(3, 5), max_features=15_000,
                    min_df=2, sublinear_tf=True,
                ),
            ),
        ]
    )
    return Pipeline(
        [
            ("features", features),
            (
                "classifier",
                LogisticRegression(
                    class_weight="balanced", max_iter=300, random_state=SEED
                ),
            ),
        ]
    )


def train(output_dir: Path, data_path: Path | None = None) -> dict:
    random.seed(SEED)
    np.random.seed(SEED)
    records = load_records(data_path)
    texts, labels, solution_ids, groups = make_examples(records)
    labels_array = np.asarray(labels)
    group_array = np.asarray(groups)
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    train_index, valid_index = next(
        splitter.split(np.zeros(len(labels)), labels_array, groups=group_array)
    )
    if len(np.unique(labels_array[train_index])) < 2 or len(np.unique(labels_array[valid_index])) < 2:
        raise ValueError("Grouped split must contain both first-error and other steps.")

    model = build_model()
    model.fit([texts[i] for i in train_index], labels_array[train_index])
    predicted = model.predict([texts[i] for i in valid_index])
    probabilities = model.predict_proba([texts[i] for i in valid_index])[:, 1]

    valid_solutions = sorted({solution_ids[i] for i in valid_index})
    valid_probabilities = {int(row_index): float(probabilities[local_index]) for local_index, row_index in enumerate(valid_index)}
    exact_correct = 0
    first_line_correct = 0
    solution_count = 0
    for solution_id in valid_solutions:
        positions = sorted(i for i in valid_index if solution_ids[i] == solution_id)
        if not positions:
            continue
        gold = int(np.argmax(labels_array[positions]))
        local_prediction = int(np.argmax([valid_probabilities[i] for i in positions]))
        exact_correct += int(local_prediction == gold)
        first_line_correct += int(gold == 0)
        solution_count += 1

    output_dir.mkdir(parents=True, exist_ok=True)
    metrics = {
        "experiment": "stepverify_first_error_localization_baseline",
        "dataset": "eth-nlped/stepverify",
        "dataset_url": "https://huggingface.co/datasets/eth-nlped/stepverify",
        "dataset_rows_downloaded": len(records),
        "usable_solutions": len(set(solution_ids)),
        "step_examples": len(texts),
        "train_step_examples": int(len(train_index)),
        "validation_step_examples": int(len(valid_index)),
        "validation_unique_problem_groups": int(len(set(group_array[valid_index]))),
        "split": "GroupShuffleSplit by exact problem string; seed=42; validation=20% groups",
        "model": "word+character TF-IDF + class-weighted logistic regression",
        "per_step_accuracy": float(accuracy_score(labels_array[valid_index], predicted)),
        "per_step_precision": float(precision_score(labels_array[valid_index], predicted, zero_division=0)),
        "per_step_recall": float(recall_score(labels_array[valid_index], predicted, zero_division=0)),
        "per_step_f1": float(f1_score(labels_array[valid_index], predicted, zero_division=0)),
        "per_step_macro_f1": float(f1_score(labels_array[valid_index], predicted, average="macro", zero_division=0)),
        "solution_exact_first_error_accuracy": float(exact_correct / solution_count),
        "first_line_heuristic_exact_accuracy": float(first_line_correct / solution_count),
        "validation_solutions": solution_count,
        "seed": SEED,
        "scope_note": "This corpus contains math word problems, not linear algebra or handwritten student work. This exploratory score does not validate the Y? product task.",
    }
    joblib.dump(
        {
            "model": model,
            "task": metrics["experiment"],
            "dataset": metrics["dataset"],
            "seed": SEED,
            "input_format": "Problem and all solution steps through the candidate step",
            "label": "1 only for the teacher-annotated first incorrect step",
            "scope_note": metrics["scope_note"],
        },
        output_dir / "stepverify_first_error_baseline.joblib",
    )
    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2) + "\n", encoding="utf-8"
    )
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--data-path", type=Path, default=None)
    args = parser.parse_args()
    print(json.dumps(train(args.output_dir, args.data_path), indent=2))


if __name__ == "__main__":
    main()


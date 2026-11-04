#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Build graded variants of the #14839 comparison corpora.

Each accepted source case becomes two rows that differ only in the correct
answer: a `correct` row whose correct answer is the baseline's own stored
answer, and an `incorrect` row whose correct answer is a nearby non-equivalent
value. Each rejected case becomes one `invalid` row. The worker grades rows
with a `scoring` label after parse() unless parse() set a format error, as
PrairieLearn does, so timings cover a whole submission.

Rows are labeled on both commits of the pair. Rows whose baseline score does
not match their label are dropped; rows the candidate scores differently are
kept, labeled by the baseline, and counted in the manifest.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
from collections import Counter
from typing import TYPE_CHECKING, Any

import benchmark
import generate_ce_corpus
import oracle
import translate_corpus
import worker

if TYPE_CHECKING:
    from pathlib import Path

GRADED_WORKER = benchmark.BENCHMARK_DIR / "graded_worker.py"
VARIANTS = {
    "a1": (
        benchmark.DEFAULT_CORPUS,
        generate_ce_corpus.BASELINE_COMMIT,
        generate_ce_corpus.CANDIDATE_COMMIT,
    ),
    "a2": (
        generate_ce_corpus.DEFAULT_OUTPUT,
        generate_ce_corpus.BASELINE_COMMIT,
        generate_ce_corpus.CANDIDATE_COMMIT,
    ),
    "b": (
        translate_corpus.DEFAULT_OUTPUT,
        translate_corpus.BASELINE_COMMIT,
        translate_corpus.CANDIDATE_COMMIT,
    ),
}
EXAMPLE_LIMIT = 8


def output_path(variant: str) -> Path:
    return oracle.CACHE_ROOT / f"corpus-graded-{variant}.jsonl"


def run_graded_worker(
    commit: str, corpus: Path, mode: str
) -> dict[str, dict[str, Any]]:
    checkout = benchmark.prepare_worktree(commit, oracle.CACHE_ROOT)
    result = subprocess.run(
        [
            "uv",
            "run",
            "--project",
            os.fspath(checkout),
            "--locked",
            "python",
            os.fspath(GRADED_WORKER),
            "--checkout",
            os.fspath(checkout),
            "--corpus",
            os.fspath(corpus),
            "--mode",
            mode,
        ],
        cwd=checkout,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Graded worker failed for {commit}:\n{result.stderr}")
    return {item["id"]: item for item in map(json.loads, result.stdout.splitlines())}


def build_graded_rows(
    source: list[dict[str, Any]], answers: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], Counter[str]]:
    """Expand source rows into labeled graded rows from baseline answers."""
    rows: list[dict[str, Any]] = []
    skipped: Counter[str] = Counter()
    for case in source:
        answer = answers[case["id"]]
        if answer["status"] == "rejected":
            rows.append({**case, "id": f"{case['id']}-invalid", "scoring": "invalid"})
            continue
        if answer["status"] != "accepted":
            skipped[f"answers-{answer['status']}"] += 1
            continue
        variants = [("correct", answer["correct"])]
        if answer["incorrect"] is not None:
            variants.append(("incorrect", answer["incorrect"]))
        for scoring, correct_answer in variants:
            correct_answers = copy.deepcopy(case["correct_answers"])
            correct_answers[worker.ANSWER_NAME] = correct_answer
            rows.append({
                **case,
                "id": f"{case['id']}-{scoring}",
                "scoring": scoring,
                "correct_answers": correct_answers,
            })
    return rows, skipped


def scoring_class(label: dict[str, Any]) -> str:
    if label["status"] == "rejected":
        return "invalid"
    if label["status"] != "accepted":
        return label["status"]
    return {1.0: "correct", 0.0: "incorrect"}.get(label["score"], "partial")


def label_rows(
    rows: list[dict[str, Any]],
    baseline: dict[str, dict[str, Any]],
    candidate: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    dropped: Counter[str] = Counter()
    changed: Counter[str] = Counter()
    examples: list[dict[str, Any]] = []
    for row in rows:
        before = scoring_class(baseline[row["id"]])
        if before != row["scoring"]:
            dropped[f"{row['scoring']}-scored-{before}"] += 1
            continue
        after = scoring_class(candidate[row["id"]])
        if after != before:
            key = f"{row['input_mode']}|{row['payload_mode']}|{before}->{after}"
            changed[key] += 1
            if len(examples) < EXAMPLE_LIMIT:
                examples.append({
                    "id": row["id"],
                    "submission": row["submission"][:160],
                    "baseline": baseline[row["id"]],
                    "candidate": candidate[row["id"]],
                })
        baseline_status = "rejected" if before == "invalid" else "accepted"
        kept.append({**row, "baseline_status": baseline_status})
    return kept, {
        "dropped": dict(dropped),
        "candidate_changed": dict(changed),
        "candidate_changed_examples": examples,
    }


def generate(variant: str) -> Path:
    source_path, baseline_commit, candidate_commit = VARIANTS[variant]
    source = worker.load_cases(source_path)
    answers = run_graded_worker(baseline_commit, source_path, "answers")
    rows, skipped = build_graded_rows(source, answers)

    output = output_path(variant)
    output.parent.mkdir(parents=True, exist_ok=True)
    unlabeled = output.with_suffix(".unlabeled.jsonl")
    unlabeled.write_text("".join(json.dumps(row) + "\n" for row in rows))
    baseline = run_graded_worker(baseline_commit, unlabeled, "label")
    candidate = run_graded_worker(candidate_commit, unlabeled, "label")
    unlabeled.unlink()
    kept, labels = label_rows(rows, baseline, candidate)

    output.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in kept))
    manifest = {
        "variant": variant,
        "source_corpus": os.fspath(source_path),
        "source_sha256": benchmark.sha256_file(source_path),
        "baseline_commit": baseline_commit,
        "candidate_commit": candidate_commit,
        "corpus_sha256": benchmark.sha256_file(output),
        "rows": len(kept),
        "skipped": dict(skipped),
        "counts": dict(
            Counter(
                f"{row['input_mode']}|{row['payload_mode']}|{row['scoring']}"
                for row in kept
            ).most_common()
        ),
        **labels,
    }
    output.with_suffix(".manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("variants", nargs="*", default=list(VARIANTS))
    args = parser.parse_args()
    for variant in args.variants:
        print(generate(variant))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

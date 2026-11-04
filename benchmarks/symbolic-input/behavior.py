#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Compare parse() behavior, not timing, between commits for #14839.

For each comparison corpus, runs every case once on the baseline and the
candidate and reports:

- accept/reject confusion matrices by input mode and payload mode;
- for cases both accept, whether the stored answers are identical, and if not,
  whether they are symbolically equivalent;
- rejection message categories on each side;
- intended-rejected cases that are accepted.

It also compares the candidate's stored answer for Compute Engine payloads
with the committed corpus's serializer payloads for the same source case.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import benchmark
import generate_ce_corpus
import oracle
import translate_corpus
import worker

sys.path.insert(0, os.fspath(benchmark.REPO_ROOT / "apps/prairielearn/python"))

import sympy
from prairielearn import sympy_utils as psu

BEHAVIOR_WORKER = benchmark.BENCHMARK_DIR / "behavior_worker.py"
DEFAULT_OUTPUT_DIR = oracle.CACHE_ROOT / "mathjson-14839" / "behavior"
EXAMPLE_LIMIT = 8
COMPARISONS = {
    "a1": (
        generate_ce_corpus.BASELINE_COMMIT,
        generate_ce_corpus.CANDIDATE_COMMIT,
        benchmark.DEFAULT_CORPUS,
    ),
    "a2": (
        generate_ce_corpus.BASELINE_COMMIT,
        generate_ce_corpus.CANDIDATE_COMMIT,
        generate_ce_corpus.DEFAULT_OUTPUT,
    ),
    "b": (
        translate_corpus.BASELINE_COMMIT,
        translate_corpus.CANDIDATE_COMMIT,
        translate_corpus.DEFAULT_OUTPUT,
    ),
}


def run_target(commit: str, corpus: Path) -> dict[str, dict[str, Any]]:
    checkout = benchmark.prepare_worktree(commit, oracle.CACHE_ROOT)
    result = subprocess.run(
        [
            "uv",
            "run",
            "--project",
            os.fspath(checkout),
            "--locked",
            "python",
            os.fspath(BEHAVIOR_WORKER),
            "--checkout",
            os.fspath(checkout),
            "--corpus",
            os.fspath(corpus),
        ],
        cwd=checkout,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Behavior worker failed for {commit}:\n{result.stderr}")
    return {item["id"]: item for item in map(json.loads, result.stdout.splitlines())}


def message_category(error: str | None) -> str:
    """Reduce a format error to a stable category for counting."""
    if error is None:
        return "none"
    text = re.sub(r"<[^>]+>", " ", error)
    text = re.split(r"\$\$|\n", text, maxsplit=1)[0]
    text = re.sub(r"\"[^\"]*\"|'[^']*'|`[^`]*`", "…", text)
    text = re.sub(r"\d+(\.\d+)?", "N", text)
    return " ".join(text.split())[:90]


def canonical_stored(stored: Any) -> Any:
    """Sort the stored name lists, whose order follows per-process set order."""
    if not isinstance(stored, dict):
        return stored
    return {
        key: sorted(value) if key in {"_variables", "_custom_functions"} else value
        for key, value in stored.items()
    }


def stored_equivalent(first: Any, second: Any) -> bool | None:
    """Whether two stored answers are mathematically equal (None if unknown)."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            left = psu.json_to_sympy(first, allow_complex=True, allow_sets=True)
            right = psu.json_to_sympy(second, allow_complex=True, allow_sets=True)
            if left == right:
                return True
            if isinstance(left, sympy.Expr) and isinstance(right, sympy.Expr):
                return sympy.simplify(left - right) == 0
            return bool(left.equals(right)) if hasattr(left, "equals") else None
    except Exception:
        return None


def compare_cases(
    cases: list[dict[str, Any]],
    baseline: dict[str, dict[str, Any]],
    candidate: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    confusion: Counter[tuple[str, str, str, str]] = Counter()
    stored: Counter[tuple[str, str, str]] = Counter()
    messages: dict[str, Counter[str]] = {"baseline": Counter(), "candidate": Counter()}
    examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    intended_rejected_accepted: Counter[tuple[str, str]] = Counter()
    message_changes: Counter[tuple[str, str, str]] = Counter()

    for case in cases:
        before, after = baseline[case["id"]], candidate[case["id"]]
        slice_key = (case["input_mode"], case["payload_mode"])
        confusion[*slice_key, before["status"], after["status"]] += 1
        for side, result in (("baseline", before), ("candidate", after)):
            if result["status"] == "rejected":
                messages[side][message_category(result["error"])] += 1
            if case["intended_status"] == "rejected" and result["status"] == "accepted":
                intended_rejected_accepted[side, case["payload_mode"]] += 1

        if before["status"] != after["status"]:
            kind = f"{before['status']}-to-{after['status']}"
        elif before["status"] == "accepted":
            if canonical_stored(before["stored"]) == canonical_stored(after["stored"]):
                kind = "identical"
            else:
                equivalent = stored_equivalent(before["stored"], after["stored"])
                kind = {True: "equivalent", False: "different", None: "unknown"}[
                    equivalent
                ]
            stored[*slice_key, kind] += 1
        else:
            kind = (
                "same-message"
                if before["error"] == after["error"]
                else "different-message"
            )
            stored[*slice_key, kind] += 1
            if kind == "different-message":
                message_changes[
                    case["payload_mode"],
                    message_category(before["error"]),
                    message_category(after["error"]),
                ] += 1
        if kind not in {"identical", "same-message"} and (
            len(examples[kind]) < EXAMPLE_LIMIT
        ):
            examples[kind].append({
                "id": case["id"],
                "payload_mode": case["payload_mode"],
                "submission": case["submission"][:160],
                "baseline": {
                    "status": before["status"],
                    "error": before["error"],
                    "stored": before["stored"],
                },
                "candidate": {
                    "status": after["status"],
                    "error": after["error"],
                    "stored": after["stored"],
                },
            })

    return {
        "confusion": {"|".join(key): count for key, count in sorted(confusion.items())},
        "outcome_detail": {
            "|".join(key): count for key, count in sorted(stored.items())
        },
        "rejection_messages": {
            side: dict(counter.most_common(15)) for side, counter in messages.items()
        },
        "intended_rejected_accepted": {
            "|".join(key): count
            for key, count in sorted(intended_rejected_accepted.items())
        },
        "message_changes": [
            {"payload_mode": payload, "baseline": old, "candidate": new, "cases": n}
            for (payload, old, new), n in message_changes.most_common()
        ],
        "examples": dict(examples),
    }


def compare_payload_sources(
    a1_cases: list[dict[str, Any]],
    a1_candidate: dict[str, dict[str, Any]],
    a2_cases: list[dict[str, Any]],
    a2_candidate: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Compare serializer payloads with Compute Engine payloads on the candidate."""
    serializer = {
        case["id"]: a1_candidate[case["id"]]
        for case in a1_cases
        if case["payload_mode"] == "mathjson"
    }
    counts: Counter[str] = Counter()
    examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for case in a2_cases:
        if (
            case["payload_mode"] != "compute-engine"
            or case["source_id"] not in serializer
        ):
            continue
        reference = serializer[case["source_id"]]
        result = a2_candidate[case["id"]]
        if result["status"] != reference["status"]:
            kind = f"serializer-{reference['status']}-ce-{result['status']}"
        elif canonical_stored(result["stored"]) == canonical_stored(
            reference["stored"]
        ):
            kind = "identical"
        else:
            equivalent = stored_equivalent(reference["stored"], result["stored"])
            kind = {True: "equivalent", False: "different", None: "unknown"}[equivalent]
        counts[kind] += 1
        if kind != "identical" and len(examples[kind]) < EXAMPLE_LIMIT:
            examples[kind].append({
                "source_id": case["source_id"],
                "source_submission": case["source_submission"][:160],
                "mathjson": case["mathjson"][:300],
                "serializer": reference,
                "compute_engine": result,
            })
    return {"counts": dict(counts), "examples": dict(examples)}


def render_markdown(report: dict[str, Any]) -> str:
    lines = ["# #14839 behavior differences", ""]
    for name, section in report["comparisons"].items():
        lines += [
            f"## {name}: `{section['baseline'][:10]}` → `{section['candidate'][:10]}`",
            "",
            "| input mode | payload | baseline | candidate | cases |",
            "|---|---|---|---|---:|",
        ]
        for key, count in section["confusion"].items():
            lines.append(f"| {' | '.join(key.split('|'))} | {count} |")
        lines += ["", "| input mode | payload | detail | cases |", "|---|---|---|---:|"]
        for key, count in section["outcome_detail"].items():
            lines.append(f"| {' | '.join(key.split('|'))} | {count} |")
        lines += ["", "Intended-rejected cases accepted:", ""]
        for key, count in section["intended_rejected_accepted"].items() or {}:
            lines.append(f"- {key}: {count}")
        if section["message_changes"]:
            lines += [
                "",
                "Changed rejection messages:",
                "",
                "| payload | baseline | candidate | cases |",
                "|---|---|---|---:|",
            ]
            for change in section["message_changes"]:
                lines.append(
                    f"| {change['payload_mode']} | {change['baseline']} | "
                    f"{change['candidate']} | {change['cases']} |"
                )
        lines.append("")
    lines += ["## Serializer vs Compute Engine payloads on the candidate", ""]
    for kind, count in sorted(report["payload_sources"]["counts"].items()):
        lines.append(f"- {kind}: {count}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    results: dict[str, Any] = {}
    sections: dict[str, Any] = {}
    for name, (baseline_commit, candidate_commit, corpus) in COMPARISONS.items():
        cases = worker.load_cases(corpus)
        baseline = run_target(baseline_commit, corpus)
        candidate = run_target(candidate_commit, corpus)
        results[name] = (cases, candidate)
        sections[name] = {
            "baseline": baseline_commit,
            "candidate": candidate_commit,
            "corpus": os.fspath(corpus),
            "corpus_sha256": benchmark.sha256_file(corpus),
            **compare_cases(cases, baseline, candidate),
        }
    report = {
        "comparisons": sections,
        "payload_sources": compare_payload_sources(*results["a1"], *results["a2"]),
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "behavior.json").write_text(
        json.dumps(report, indent=2, sort_keys=True, default=str) + "\n"
    )
    (args.output_dir / "behavior.md").write_text(render_markdown(report))
    print(args.output_dir / "behavior.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

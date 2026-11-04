# ruff: file-ignore[undocumented-public-function]
"""Tests for the Compute Engine and `allow-sets` corpus variants."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import pytest

BENCHMARK_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCHMARK_DIR))

import behavior  # ruff: ignore[module-import-not-at-top-of-file]
import generate_ce_corpus  # ruff: ignore[module-import-not-at-top-of-file]
import generate_graded_corpus  # ruff: ignore[module-import-not-at-top-of-file]
import oracle  # ruff: ignore[module-import-not-at-top-of-file]
import translate_corpus  # ruff: ignore[module-import-not-at-top-of-file]

VARIABLES = {"variables": "x,y,z"}


@pytest.mark.parametrize(
    ("expression", "attributes", "expected"),
    [
        ("((y) * (z))", VARIABLES, r"\left({\left(y\right)}\cdot\left(z\right)\right)"),
        (
            "((((x) - (y)))**2) + 1",
            VARIABLES,
            r"\left(\left(\left(\left(x\right)-\left(y\right)\right)\right)^{2}\right)+1",
        ),
        ("((x)/2)", VARIABLES, r"\left(\frac{\left(x\right)}{2}\right)"),
        (
            "sqrt(x**2 + 6) + log(x) + exp(y/4)",
            VARIABLES,
            r"\sqrt{x^{2}+6}+\operatorname{log}\left(x\right)+\exp\left(\frac{y}{4}\right)",
        ),
        ("sin(z)", {"allow-trig-functions": "false"}, r"sin\left(z\right)"),
        ("cot(infty)", VARIABLES, r"\cot\left(\infty\right)"),
        (
            "f(x) + g(y, 1)",
            {"custom-functions": "f,g"},
            r"\operatorname{f}\left(x\right)+\operatorname{g}\left(y,1\right)",
        ),
        ("4*i", VARIABLES, r"{4}\cdot i"),
        ("(x) + *", VARIABLES, r"\left(x\right)+\placeholder{}\cdot"),
        (
            "[1, 2) U {3}",
            VARIABLES,
            r"\left\lbrack1,2\right)U\left\lbrace3\right\rbrace",
        ),
        ("Reals", VARIABLES, "Reals"),
    ],
)
def test_editor_latex_matches_typed_mathlive_shapes(
    expression: str, attributes: dict[str, str], expected: str
) -> None:
    assert generate_ce_corpus.editor_latex(expression, attributes) == expected


def test_build_rows_pairs_candidate_payload_with_baseline_fallback() -> None:
    case = {
        "id": "random-000001",
        "submission": "x*y",
        "editor_latex": r"{x}\cdot y",
        "mathjson": "stale",
        "payload_mode": "mathjson",
        "baseline_status": "accepted",
    }
    compute_engine, legacy = generate_ce_corpus.build_rows(
        case,
        candidate={
            "submission": "x * y",
            "latex": "x\\cdot y",
            "mathjson": '["Multiply","x","y"]',
        },
        baseline={"submission": "x * y", "latex": "x\\cdot y", "mathjson": None},
    )

    assert compute_engine["id"] == "random-000001-compute-engine"
    assert compute_engine["mathjson"] == '["Multiply","x","y"]'
    assert legacy["id"] == "random-000001-legacy"
    assert "mathjson" not in legacy
    for row in (compute_engine, legacy):
        assert row["source_id"] == "random-000001"
        assert row["source_submission"] == "x*y"
        assert "baseline_status" not in row


@pytest.mark.parametrize(
    ("source", "editor", "expected"),
    [
        (("accepted", "a"), ("accepted", "a"), "same-answer"),
        (("accepted", "a"), ("accepted", "b"), "different-answer"),
        (("accepted", "a"), ("rejected", "error"), "accepted-became-rejected"),
        (("rejected", "error"), ("rejected", "other"), "both-rejected"),
    ],
)
def test_classify_fidelity(
    source: tuple[str, str], editor: tuple[str, str], expected: str
) -> None:
    assert (
        generate_ce_corpus.classify_fidelity(
            oracle.Outcome(*source), oracle.Outcome(*editor)
        )
        == expected
    )


@pytest.mark.parametrize(
    ("attributes", "expected"),
    [
        (
            {"allowed-types": "finite-set", "variables": "x"},
            {"allow-sets": "true", "variables": "x"},
        ),
        ({"allowed-types": "interval"}, {"allow-sets": "true"}),
        ({"allowed-types": "set"}, {"allow-sets": "true"}),
        ({"allowed-types": "expression", "variables": "x"}, {"variables": "x"}),
        ({"variables": "x"}, {"variables": "x"}),
    ],
)
def test_translate_attributes(
    attributes: dict[str, str], expected: dict[str, str]
) -> None:
    assert translate_corpus.translate_attributes(attributes) == expected


def test_committed_ce_corpus_matches_manifest_and_pairs_every_case() -> None:
    corpus_bytes = generate_ce_corpus.DEFAULT_OUTPUT.read_bytes()
    manifest = json.loads(generate_ce_corpus.DEFAULT_MANIFEST.read_text())
    rows = [json.loads(line) for line in corpus_bytes.splitlines()]

    assert manifest["corpus_sha256"] == hashlib.sha256(corpus_bytes).hexdigest()
    assert len(rows) == manifest["case_count"] == 2 * manifest["source_case_count"]
    assert Counter(row["source_id"] for row in rows) == dict.fromkeys(
        {row["source_id"] for row in rows}, 2
    )
    assert all(
        ("mathjson" in row) == (row["payload_mode"] == "compute-engine") for row in rows
    )


def test_compare_cases_classifies_outcomes_ignoring_name_order() -> None:
    def stored(value: str, variables: list[str]) -> dict[str, object]:
        return {
            "_type": "sympy",
            "_value": value,
            "_variables": variables,
            "_custom_functions": [],
        }

    def accepted(answer: dict[str, object]) -> dict[str, object]:
        return {"status": "accepted", "stored": answer, "error": None}

    def rejected(error: str) -> dict[str, object]:
        return {"status": "rejected", "stored": None, "error": error}

    cases = [
        {"id": case_id, "input_mode": "plain", "payload_mode": "legacy"}
        | {"intended_status": intended, "submission": case_id}
        for case_id, intended in [
            ("reordered", "accepted"),
            ("equivalent", "accepted"),
            ("message", "rejected"),
            ("flipped", "rejected"),
        ]
    ]
    baseline = {
        "reordered": accepted(stored("x*z", ["z", "x"])),
        "equivalent": accepted(stored("2*x", ["x"])),
        "message": rejected("old"),
        "flipped": rejected("old"),
    }
    candidate = {
        "reordered": accepted(stored("x*z", ["x", "z"])),
        "equivalent": accepted(stored("x + x", ["x"])),
        "message": rejected("new"),
        "flipped": accepted(stored("x", ["x"])),
    }

    result = behavior.compare_cases(cases, baseline, candidate)

    assert result["outcome_detail"] == {
        "plain|legacy|different-message": 1,
        "plain|legacy|equivalent": 1,
        "plain|legacy|identical": 1,
    }
    assert result["confusion"]["plain|legacy|rejected|accepted"] == 1
    assert result["intended_rejected_accepted"] == {"candidate|legacy": 1}
    assert result["message_changes"] == [
        {"payload_mode": "legacy", "baseline": "old", "candidate": "new", "cases": 1}
    ]


def test_build_graded_rows_expands_accepted_cases_by_scoring() -> None:
    assumptions = {"_assumptions": {"x": {"real": True}}}
    source = [
        {"id": "a", "correct_answers": {"bench": assumptions}},
        {"id": "r", "correct_answers": {}},
        {"id": "blank", "correct_answers": {}},
        {"id": "boom", "correct_answers": {}},
    ]
    answers = {
        "a": {
            "status": "accepted",
            "correct": {"_value": "x"},
            "incorrect": {"_value": "x + 1"},
        },
        "r": {"status": "rejected"},
        "blank": {"status": "accepted", "correct": "", "incorrect": None},
        "boom": {"status": "exception", "error": "ValueError: no"},
    }

    rows, skipped = generate_graded_corpus.build_graded_rows(source, answers)

    assert [(row["id"], row["scoring"]) for row in rows] == [
        ("a-correct", "correct"),
        ("a-incorrect", "incorrect"),
        ("r-invalid", "invalid"),
        ("blank-correct", "correct"),
    ]
    assert rows[1]["correct_answers"] == {"bench": {"_value": "x + 1"}}
    assert source[0]["correct_answers"] == {"bench": assumptions}
    assert skipped == {"answers-exception": 1}


def test_label_rows_drops_mislabeled_rows_and_counts_candidate_changes() -> None:
    def row(row_id: str, scoring: str) -> dict[str, object]:
        return {
            "id": row_id,
            "scoring": scoring,
            "input_mode": "formula-editor",
            "payload_mode": "mathjson",
            "submission": row_id,
        }

    rows = [
        row("same", "correct"),
        row("changed", "incorrect"),
        row("wrong", "incorrect"),
    ]
    baseline = {
        "same": {"status": "accepted", "score": 1.0},
        "changed": {"status": "accepted", "score": 0.0},
        "wrong": {"status": "accepted", "score": 1.0},
    }
    candidate = {
        "same": {"status": "accepted", "score": 1.0},
        "changed": {"status": "rejected", "score": None},
        "wrong": {"status": "accepted", "score": 1.0},
    }

    kept, labels = generate_graded_corpus.label_rows(rows, baseline, candidate)

    assert [(r["id"], r["baseline_status"]) for r in kept] == [
        ("same", "accepted"),
        ("changed", "accepted"),
    ]
    assert labels["dropped"] == {"incorrect-scored-correct": 1}
    assert labels["candidate_changed"] == {
        "formula-editor|mathjson|incorrect->invalid": 1
    }

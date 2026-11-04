#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Derive or check graded variants of corpus cases in a target's environment.

Runs inside the target's own environment, like `worker.py`, so stored answers
use that commit's own `sympy_utils`. Writes one JSON line per case.

- `answers`: parse each case and, when accepted, emit the stored answer as the
  correct answer and a nearby non-equivalent answer as the incorrect one.
- `label`: parse and, if there is no format error, grade each case, emitting
  its status and score.
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path
from typing import Any

import worker

ANSWER = worker.ANSWER_NAME


def incorrect_value(expr: Any, sympy: Any) -> Any:
    """A value that is not equivalent to `expr`, keeping its kind (expr or set)."""
    if isinstance(expr, sympy.Interval):
        start, end = expr.start, expr.end
        if end.is_finite:
            end += 1
        elif start.is_finite:
            start -= 1
        else:
            end = sympy.Integer(1000)
        return sympy.Interval(
            start, end, left_open=expr.left_open, right_open=expr.right_open
        )
    if isinstance(expr, sympy.Set):
        marker = sympy.FiniteSet(1000)
        if expr.contains(1000) is sympy.true:
            return sympy.Complement(expr, marker, evaluate=True)
        return sympy.Union(expr, marker, evaluate=True)
    return expr + 1


def answers(module: Any, case: dict[str, Any], psu: Any, sympy: Any) -> dict[str, Any]:
    data = worker._question_data(case)
    module.parse(worker._element_html(case["element_attributes"]), data)
    stored = data["submitted_answers"].get(ANSWER)
    if ANSWER in data["format_errors"] or stored is None:
        return {"status": "rejected"}
    if not isinstance(stored, dict):
        return {"status": "accepted", "correct": stored, "incorrect": None}

    attributes = case["element_attributes"]
    flags = {
        "allow_complex": attributes.get("allow-complex") == "true",
        "allow_trig_functions": attributes.get("allow-trig-functions", "true")
        != "false",
    }
    allow_sets = (
        attributes.get("allow-sets") == "true"
        or attributes.get("allowed-types", "expression") != "expression"
    )
    value = psu.json_to_sympy(stored, allow_sets=allow_sets, **flags)
    incorrect = psu.sympy_to_json(
        incorrect_value(value, sympy), allow_sets=allow_sets, **flags
    )
    for key in ("_variables", "_custom_functions", "_assumptions"):
        if key in stored:
            incorrect[key] = stored[key]
    return {"status": "accepted", "correct": stored, "incorrect": incorrect}


def label(module: Any, case: dict[str, Any]) -> dict[str, Any]:
    data = worker._question_data(case)
    element_html = worker._element_html(case["element_attributes"])
    module.parse(element_html, data)
    if ANSWER in data["format_errors"] or data["submitted_answers"].get(ANSWER) is None:
        return {"status": "rejected", "score": None}
    module.grade(element_html, data)
    if ANSWER in data["format_errors"]:
        return {"status": "grade-error", "score": None}
    return {"status": "accepted", "score": data["partial_scores"][ANSWER]["score"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--mode", choices=("answers", "label"), required=True)
    args = parser.parse_args()

    cases = worker.load_cases(args.corpus.resolve())
    module, _sympy_version = worker.load_target(args.checkout.resolve())
    import sympy
    from prairielearn import sympy_utils as psu

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for case in cases:
            try:
                result = (
                    answers(module, case, psu, sympy)
                    if args.mode == "answers"
                    else label(module, case)
                )
            except Exception as exc:
                result = {
                    "status": "exception",
                    "error": f"{type(exc).__name__}: {exc}",
                }
            sys.stdout.write(json.dumps({"id": case["id"], **result}) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

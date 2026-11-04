#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Run each corpus case once through a target's parse() and print its result.

Runs inside the target's own environment, like `worker.py`. Writes one JSON
line per case: {"id", "status", "stored", "error"}, where `stored` is the
submitted answer parse() stored and `error` is its format error.
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import worker


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, required=True)
    args = parser.parse_args()

    cases = worker.load_cases(args.corpus.resolve())
    module, _sympy_version = worker.load_target(args.checkout.resolve())
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for case in cases:
            data = worker._question_data(case)
            try:
                module.parse(worker._element_html(case["element_attributes"]), data)
            except Exception as exc:
                result = {
                    "status": "exception",
                    "stored": None,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            else:
                error = data["format_errors"].get(worker.ANSWER_NAME)
                stored = data["submitted_answers"].get(worker.ANSWER_NAME)
                result = {
                    "status": "accepted"
                    if error is None and stored is not None
                    else "rejected",
                    "stored": stored,
                    "error": None if error is None else str(error),
                }
            sys.stdout.write(json.dumps({"id": case["id"], **result}) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

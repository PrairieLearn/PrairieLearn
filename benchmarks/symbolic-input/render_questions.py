#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Render a target commit's pl-symbolic-input question panel per case.

Each panel restores a saved answer: the case's `submission` and, as
`-latex`, its `editor_latex`. Runs inside the target's own environment, like
`worker.py`, and writes one JSON line of {"id", "html"} per case to stdout.
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
from contextlib import chdir
from pathlib import Path

import worker


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, required=True)
    args = parser.parse_args()

    checkout = args.checkout.resolve()
    cases = worker.load_cases(args.corpus.resolve())
    module, _sympy_version = worker.load_target(checkout)
    element_dir = checkout / "apps/prairielearn/elements/pl-symbolic-input"
    with chdir(element_dir), warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for case in cases:
            data = {
                "submitted_answers": {},
                "raw_submitted_answers": {
                    worker.ANSWER_NAME: case["submission"],
                    f"{worker.ANSWER_NAME}-latex": case["editor_latex"],
                },
                "correct_answers": case["correct_answers"],
                "answers_names": {},
                "format_errors": {},
                "partial_scores": {},
                "panel": "question",
                "editable": True,
            }
            html = module.render(worker._element_html(case["element_attributes"]), data)
            sys.stdout.write(json.dumps({"id": case["id"], "html": html}) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

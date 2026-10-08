#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Isolated worker for the symbolic-input parse benchmark."""

from __future__ import annotations

import argparse
import gc
import hashlib
import html
import importlib.util
import json
import os
import platform
import sys
import time
import traceback
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from types import ModuleType

ANSWER_NAME = "bench"


def _element_html(attributes: dict[str, str]) -> str:
    rendered = [f'answers-name="{ANSWER_NAME}"']
    rendered.extend(
        f'{name}="{html.escape(value, quote=True)}"'
        for name, value in sorted(attributes.items())
    )
    return f"<pl-symbolic-input {' '.join(rendered)}></pl-symbolic-input>"


def _question_data(case: dict[str, Any]) -> dict[str, Any]:
    submitted = {ANSWER_NAME: case["submission"]}
    raw_submitted = submitted.copy()
    if case["latex"] is not None:
        raw_submitted[f"{ANSWER_NAME}-latex"] = case["latex"]
    return {
        "submitted_answers": submitted,
        "raw_submitted_answers": raw_submitted,
        "correct_answers": case["correct_answers"],
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }


def load_cases(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as corpus_file:
        return [json.loads(line) for line in corpus_file if line.strip()]


def load_target(checkout: Path) -> tuple[ModuleType, str]:
    python_root = checkout / "apps/prairielearn/python"
    element_path = (
        checkout / "apps/prairielearn/elements/pl-symbolic-input/pl-symbolic-input.py"
    )
    if not python_root.is_dir() or not element_path.is_file():
        raise RuntimeError(
            "Target commit does not contain the expected pl-symbolic-input layout"
        )

    sys.path.insert(0, os.fspath(python_root))
    spec = importlib.util.spec_from_file_location(
        "symbolic_input_benchmark_target", element_path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load target element from {element_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if not callable(getattr(module, "parse", None)):
        raise TypeError("Target pl-symbolic-input module has no callable parse()")

    import sympy

    return module, sympy.__version__


def run_case(
    module: ModuleType,
    case: dict[str, Any],
    element_html: str,
) -> tuple[int, str, int]:
    data = _question_data(case)
    start = time.perf_counter_ns()
    try:
        module.parse(element_html, data)
    except BaseException as exc:
        duration_ns = time.perf_counter_ns() - start
        return 2, f"{type(exc).__name__}: {exc}", duration_ns
    duration_ns = time.perf_counter_ns() - start

    if (
        ANSWER_NAME not in data["format_errors"]
        and data["submitted_answers"].get(ANSWER_NAME) is not None
    ):
        stored = json.dumps(
            data["submitted_answers"][ANSWER_NAME],
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return 0, hashlib.sha256(stored).hexdigest(), duration_ns
    return 1, str(data["format_errors"].get(ANSWER_NAME, "rejected")), duration_ns


def run_batch(
    module: ModuleType,
    cases: list[dict[str, Any]],
    rendered_html: list[str],
    indices: list[int],
    *,
    gc_mode: str,
    record: bool,
) -> dict[str, Any]:
    if gc_mode == "disabled":
        gc.collect()
        gc.disable()
    try:
        outcomes: list[int] = []
        details: list[str] = []
        timings_ns: list[int] = []
        for index in indices:
            outcome, detail, duration_ns = run_case(
                module, cases[index], rendered_html[index]
            )
            if record:
                outcomes.append(outcome)
                details.append(detail)
                timings_ns.append(duration_ns)
        return {
            "outcomes": outcomes,
            "details": details,
            "timings_ns": timings_ns,
        }
    finally:
        if gc_mode == "disabled":
            gc.enable()


def serve(checkout: Path, corpus: Path) -> int:
    cases = load_cases(corpus)
    rendered_html = [_element_html(case["element_attributes"]) for case in cases]
    try:
        module, sympy_version = load_target(checkout)
    except BaseException as exc:
        print(
            json.dumps({
                "ready": False,
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc(),
            }),
            flush=True,
        )
        return 1

    print(
        json.dumps({
            "ready": True,
            "python": platform.python_version(),
            "sympy": sympy_version,
            "platform": platform.platform(),
            "cpu_count": os.cpu_count(),
            "case_count": len(cases),
        }),
        flush=True,
    )
    for line in sys.stdin:
        command = json.loads(line)
        if command["command"] == "stop":
            return 0
        if command["command"] != "batch":
            print(json.dumps({"error": "unknown command"}), flush=True)
            continue
        try:
            result = run_batch(
                module,
                cases,
                rendered_html,
                command["indices"],
                gc_mode=command["gc_mode"],
                record=command["record"],
            )
            print(json.dumps(result, separators=(",", ":")), flush=True)
        except BaseException as exc:
            print(
                json.dumps({
                    "error": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(),
                }),
                flush=True,
            )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, required=True)
    args = parser.parse_args()
    return serve(args.checkout.resolve(), args.corpus.resolve())


if __name__ == "__main__":
    raise SystemExit(main())

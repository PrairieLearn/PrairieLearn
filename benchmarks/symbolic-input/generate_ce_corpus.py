#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
r"""Generate formula-editor cases whose payloads come from the real editor.

The committed corpus's MathJSON comes from the server's SymPy serializer, and
only accepted cases have it. This corpus instead builds the LaTeX a student's
formula editor would hold for each case, in the shapes MathLive produces when
the expression is typed (`\left(...\right)` fences, `{a}\cdot b`, `a^{n}`,
`\frac{a}{b}`, `\sqrt{...}`, `\operatorname{log}`). It then loads that LaTeX
through the element's saved-answer path in headless Chromium, focuses, blurs,
and submits, and records the hidden `bench`, `bench-latex`, and `bench-json`
fields that the element's own JavaScript writes. Each case is emitted twice:

- `compute-engine`: loaded on the candidate's element, with its Compute
  Engine `-json` payload.
- `legacy`: loaded on the baseline's element, which has no `-json` field. On
  the candidate this is the fallback for pages rendered before the upgrade.

LaTeX is generated rather than typed keystroke by keystroke because MathLive's
smart fences and `#@` shortcuts misplace structure in the corpus's deeply
nested parentheses, which a student would notice and fix.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import benchmark
import oracle
import worker

SCHEMA_VERSION = 1
CANDIDATE_COMMIT = "f7959d5c787a7e7f27dfc28b3d84fe092aead545"
BASELINE_COMMIT = "9c35ec3595b2bd128b9cc512fbf94fcef3bee664"
COMPUTE_ENGINE_VERSION = "0.102.0"
MATHLIVE_VERSION = "0.110.0"
DEFAULT_OUTPUT = benchmark.BENCHMARK_DIR / "corpus-ce.jsonl"
DEFAULT_MANIFEST = benchmark.BENCHMARK_DIR / "corpus-ce-manifest.json"
BROWSER_SCRIPT = benchmark.BENCHMARK_DIR / "ce_payloads.mjs"
RENDER_SCRIPT = benchmark.BENCHMARK_DIR / "render_questions.py"
EXAMPLE_LIMIT = 20

_TOKEN = re.compile(r"\*\*|[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|\.\d+|\S")
_FENCES = {
    "(": r"\left(",
    "[": r"\left\lbrack",
    "{": r"\left\lbrace",
    ")": r"\right)",
    "]": r"\right\rbrack",
    "}": r"\right\rbrace",
}
_MATCHING = {"(": ")", "[": "]", "{": "}"}
_PLACEHOLDER = r"\placeholder{}"
# MathLive's own inline shortcuts, which the element keeps when trig functions
# are allowed (`trigFunctions` in pl-symbolic-input.js).
_TRIG_FUNCTIONS = frozenset({
    "acos", "acosh", "arccos", "arcsin", "arctan", "arctan2", "asin", "asinh",
    "atan", "atan2", "atanh", "cos", "cosh", "cot", "csc", "exp", "sec", "sin",
    "sinh", "tan", "tanh",
})  # fmt: skip
_LATEX_TRIG_COMMANDS = frozenset({
    "arccos", "arcsin", "arctan", "cos", "cosh", "cot", "csc", "exp", "sec",
    "sin", "sinh", "tan", "tanh",
})  # fmt: skip
# `defaultFunctions` in pl-symbolic-input.js, inserted as \operatorname{...}.
_DEFAULT_FUNCTIONS = frozenset({
    "Abs", "abs", "exp", "factorial", "ln", "log", "Max", "max", "Min", "min",
    "sgn", "sign",
})  # fmt: skip
_SYMBOLS = {"pi": r"\pi", "infty": r"\infty", "infinity": r"\infty"}
# Atoms that end MathLive's implicit `#@` argument instead of becoming it.
_NON_ARGUMENTS = frozenset({"+", "-", ","})


def _join(atoms: list[str]) -> str:
    joined = ""
    for atom in atoms:
        if re.search(r"\\[A-Za-z]+$", joined) and re.match(r"[A-Za-z]", atom):
            joined += " "
        joined += atom
    return joined


def editor_latex(expression: str, attributes: dict[str, str]) -> str:
    """Return the LaTeX the formula editor holds after `expression` is entered."""
    tokens = _TOKEN.findall(expression)
    custom_functions = {
        name for name in attributes.get("custom-functions", "").split(",") if name
    }
    allow_trig = attributes.get("allow-trig-functions", "true") != "false"

    def function_latex(name: str) -> str | None:
        if allow_trig and name in _TRIG_FUNCTIONS:
            return (
                f"\\{name}"
                if name in _LATEX_TRIG_COMMANDS
                else f"\\operatorname{{{name}}}"
            )
        if name in _DEFAULT_FUNCTIONS or name in custom_functions:
            return f"\\operatorname{{{name}}}"
        return None

    def group_end(start: int, end: int) -> int:
        depth = 0
        for index in range(start, end):
            if tokens[index] in _MATCHING:
                depth += 1
            elif tokens[index] in _MATCHING.values():
                depth -= 1
                if depth == 0:
                    return index + 1
        return end

    def fenced(start: int, end: int) -> tuple[str, int]:
        close = group_end(start, end)
        closer = tokens[close - 1] if close - 1 > start else ""
        if closer not in _MATCHING.values():
            closer, inner_end = _MATCHING[tokens[start]], close
        else:
            inner_end = close - 1
        inner = _join(render(start + 1, inner_end))
        return f"{_FENCES[tokens[start]]}{inner}{_FENCES[closer]}", close

    def next_atom(index: int, end: int) -> tuple[str, int]:
        if index >= end:
            return _PLACEHOLDER, index
        token = tokens[index]
        if token in _MATCHING:
            return fenced(index, end)
        follows_call = index + 1 < end and tokens[index + 1] == "("
        if token == "sqrt" and follows_call:
            close = group_end(index + 1, end)
            return f"\\sqrt{{{_join(render(index + 2, close - 1))}}}", close
        if follows_call and (name := function_latex(token)) is not None:
            arguments, close = fenced(index + 1, end)
            return name + arguments, close
        return _SYMBOLS.get(token, token), index + 1

    def render(start: int, end: int) -> list[str]:
        atoms: list[str] = []

        def take_argument() -> str:
            if atoms and atoms[-1] not in _NON_ARGUMENTS:
                return atoms.pop()
            return _PLACEHOLDER

        index = start
        while index < end:
            token = tokens[index]
            if token in {"**", "^"}:
                base = take_argument()
                exponent, index = next_atom(index + 1, end)
                atoms.append(f"{base}^{{{exponent}}}")
            elif token == "/":
                numerator = take_argument()
                denominator, index = next_atom(index + 1, end)
                atoms.append(f"\\frac{{{numerator}}}{{{denominator}}}")
            elif token == "*":
                argument = take_argument()
                if argument != _PLACEHOLDER:
                    argument = f"{{{argument}}}"
                atoms.append(f"{argument}\\cdot")
                index += 1
            else:
                atom, index = next_atom(index, end)
                atoms.append(atom)
        return atoms

    return _join(render(0, len(tokens)))


def load_source_cases() -> list[dict[str, Any]]:
    manifest = json.loads(benchmark.DEFAULT_MANIFEST.read_text())
    if benchmark.sha256_file(benchmark.DEFAULT_CORPUS) != manifest["corpus_sha256"]:
        raise RuntimeError("Committed corpus does not match its manifest")
    return [
        case
        for case in worker.load_cases(benchmark.DEFAULT_CORPUS)
        if case["input_mode"] == "formula-editor"
    ]


def _main_checkout() -> Path:
    common_dir = benchmark.git_output(
        "rev-parse", "--path-format=absolute", "--git-common-dir"
    )
    return Path(common_dir).parent


def _serialize(cases: list[dict[str, Any]]) -> bytes:
    return b"".join(
        (json.dumps(case, sort_keys=True, separators=(",", ":")) + "\n").encode()
        for case in cases
    )


def render_questions(checkout: Path, corpus: Path) -> dict[str, str]:
    """Render each case's question panel in the target's own environment."""
    result = subprocess.run(
        [
            "uv",
            "run",
            "--project",
            os.fspath(checkout),
            "--locked",
            "python",
            os.fspath(RENDER_SCRIPT),
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
        raise RuntimeError(f"Rendering failed for {checkout}:\n{result.stderr}")
    return {
        item["id"]: item["html"] for item in map(json.loads, result.stdout.splitlines())
    }


def load_in_browser(
    case_ids: list[str],
    html: dict[str, dict[str, str]],
    element_dirs: dict[str, Path],
) -> tuple[dict[str, Any], dict[tuple[str, str], dict[str, Any]]]:
    request = {
        "targets": {
            target: {"elementDir": os.fspath(element_dir)}
            for target, element_dir in element_dirs.items()
        },
        "cases": [
            {
                "id": case_id,
                "html": {target: html[target][case_id] for target in element_dirs},
            }
            for case_id in case_ids
        ],
    }
    result = subprocess.run(
        [
            "node",
            os.fspath(BROWSER_SCRIPT),
            "--node-root",
            os.fspath(_main_checkout()),
            "--expect-compute-engine",
            COMPUTE_ENGINE_VERSION,
            "--expect-mathlive",
            MATHLIVE_VERSION,
        ],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Browser payload generation failed:\n{result.stderr}")
    ready, *lines = result.stdout.splitlines()
    fields = {(item["id"], item["target"]): item for item in map(json.loads, lines)}
    if len(fields) != len(case_ids) * len(element_dirs):
        raise RuntimeError("Browser returned a different number of results")
    return json.loads(ready), fields


def build_rows(
    case: dict[str, Any], *, candidate: dict[str, Any], baseline: dict[str, Any]
) -> list[dict[str, Any]]:
    base = {
        key: value
        for key, value in case.items()
        if key not in {"mathjson", "payload_mode", "baseline_status", "editor_latex"}
    }
    base |= {
        "source_id": case["id"],
        "source_submission": case["submission"],
        "editor_latex": case["editor_latex"],
    }
    compute_engine = base | {
        "id": f"{case['id']}-compute-engine",
        "payload_mode": "compute-engine",
        "submission": candidate["submission"],
        "latex": candidate["latex"],
    }
    if candidate["mathjson"] is not None:
        compute_engine["mathjson"] = candidate["mathjson"]
    legacy = base | {
        "id": f"{case['id']}-legacy",
        "payload_mode": "legacy",
        "submission": baseline["submission"],
        "latex": baseline["latex"],
    }
    return [compute_engine, legacy]


def classify_fidelity(source: oracle.Outcome, editor: oracle.Outcome) -> str:
    """Compare the baseline's outcome for the editor's field with the source ASCII."""
    if source.status != editor.status:
        return f"{source.status}-became-{editor.status}"
    if source.status == "accepted":
        return "same-answer" if source.detail == editor.detail else "different-answer"
    return f"both-{source.status}"


def generate() -> tuple[bytes, dict[str, Any]]:
    source_cases = [
        case
        | {"editor_latex": editor_latex(case["submission"], case["element_attributes"])}
        for case in load_source_cases()
    ]
    checkouts = {
        "baseline": benchmark.prepare_worktree(BASELINE_COMMIT, oracle.CACHE_ROOT),
        "candidate": benchmark.prepare_worktree(CANDIDATE_COMMIT, oracle.CACHE_ROOT),
    }
    element_dirs = {
        target: checkout / "apps/prairielearn/elements/pl-symbolic-input"
        for target, checkout in checkouts.items()
    }

    with tempfile.TemporaryDirectory() as temporary:
        source_corpus = Path(temporary) / "source.jsonl"
        source_corpus.write_bytes(_serialize(source_cases))
        html = {
            target: render_questions(checkout, source_corpus)
            for target, checkout in checkouts.items()
        }
        environment, fields = load_in_browser(
            [case["id"] for case in source_cases], html, element_dirs
        )
        rows = [
            row
            for case in source_cases
            for row in build_rows(
                case,
                candidate=fields[case["id"], "candidate"],
                baseline=fields[case["id"], "baseline"],
            )
        ]

        # Fidelity check: on the baseline, the editor's legacy field should
        # parse like the ASCII expression the LaTeX was built from.
        source_rows = [
            {
                key: value
                for key, value in case.items()
                if key not in {"mathjson", "editor_latex"}
            }
            for case in source_cases
        ]
        oracle_corpus = Path(temporary) / "oracle.jsonl"
        oracle_corpus.write_bytes(_serialize([*rows, *source_rows]))
        baseline_outcomes = oracle.corpus_outcomes(BASELINE_COMMIT, oracle_corpus)
        unlabeled = Path(temporary) / "rows.jsonl"
        unlabeled.write_bytes(_serialize(rows))
        candidate_outcomes = oracle.corpus_outcomes(CANDIDATE_COMMIT, unlabeled)

    row_outcomes = baseline_outcomes[: len(rows)]
    for row, baseline_outcome, candidate_outcome in zip(
        rows, row_outcomes, candidate_outcomes, strict=True
    ):
        row["baseline_status"] = baseline_outcome.status
        row["candidate_status"] = candidate_outcome.status

    editor_outcomes = {
        row["source_id"]: outcome
        for row, outcome in zip(rows, row_outcomes, strict=True)
        if row["payload_mode"] == "legacy"
    }
    source_outcomes = dict(
        zip(
            (case["id"] for case in source_cases),
            baseline_outcomes[len(rows) :],
            strict=True,
        )
    )
    fidelity: dict[str, list[str]] = defaultdict(list)
    for case in source_cases:
        category = classify_fidelity(
            source_outcomes[case["id"]], editor_outcomes[case["id"]]
        )
        fidelity[category].append(case["id"])

    corpus_bytes = _serialize(rows)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "source_corpus_sha256": benchmark.sha256_file(benchmark.DEFAULT_CORPUS),
        "source_case_count": len(source_cases),
        "case_count": len(rows),
        "baseline_commit": BASELINE_COMMIT,
        "candidate_commit": CANDIDATE_COMMIT,
        "browser": environment["browser"],
        "versions": environment["versions"],
        "baseline_and_candidate_submission_differences": sum(
            fields[case["id"], "baseline"]["submission"]
            != fields[case["id"], "candidate"]["submission"]
            for case in source_cases
        ),
        "editor_fidelity_on_baseline": {
            category: {"count": len(ids), "examples": ids[:EXAMPLE_LIMIT]}
            for category, ids in sorted(fidelity.items())
        },
        "status_distribution": {
            "|".join(key): value
            for key, value in sorted(
                Counter(
                    (
                        row["payload_mode"],
                        row["intended_status"],
                        row["baseline_status"],
                        row["candidate_status"],
                    )
                    for row in rows
                ).items()
            )
        },
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
    }
    return corpus_bytes, manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    corpus_bytes, manifest = generate()
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    if args.check:
        if args.output.read_bytes() != corpus_bytes:
            raise SystemExit(
                "Committed CE corpus does not match deterministic generation"
            )
        if args.manifest.read_bytes() != manifest_bytes:
            raise SystemExit("Committed CE manifest does not match generation")
        return 0

    args.output.write_bytes(corpus_bytes)
    args.manifest.write_bytes(manifest_bytes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

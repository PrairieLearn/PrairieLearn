#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Generate the deterministic symbolic-input benchmark corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import warnings
from collections import Counter
from pathlib import Path
from typing import Any, Literal

import worker

SEED = 15970
SCHEMA_VERSION = 1
ORACLE_COMMIT = "fbdb0757cd7a4aecbc980b1697cd28e3b22fc989"
FAMILIES = (
    "arithmetic",
    "elementary",
    "trigonometric",
    "complex",
    "custom-function",
    "finite-set",
    "interval",
    "composite-set",
)
COMPLEXITIES = ("small", "medium", "large")
DEPTHS = {"small": 1, "medium": 3, "large": 5}


def _arith(rng: random.Random, depth: int) -> str:
    atoms = ("x", "y", "z", str(rng.randint(1, 11)))
    if depth == 0:
        return rng.choice(atoms)
    left = _arith(rng, depth - 1)
    right = _arith(rng, max(0, depth - 2))
    operator = rng.choice(("+", "-", "*"))
    if rng.random() < 0.22:
        return f"(({left})**{rng.choice((2, 3))})"
    if rng.random() < 0.18:
        return f"(({left})/{rng.randint(2, 9)})"
    return f"(({left}) {operator} ({right}))"


def _accepted_expression(
    rng: random.Random,
    family: str,
    complexity: str,
    *,
    simplify: bool,
) -> tuple[str, dict[str, str], dict[str, Any]]:
    depth = DEPTHS[complexity]
    arithmetic = _arith(rng, depth)
    attributes = {"variables": "x,y,z"}
    correct_answers: dict[str, Any] = {}

    if family == "arithmetic":
        submission = arithmetic
    elif family == "elementary":
        submission = (
            f"sqrt(({arithmetic})**2 + {rng.randint(1, 9)})"
            f" + log(x**2 + {rng.randint(1, 9)}) + exp(y/{rng.randint(2, 7)})"
        )
    elif family == "trigonometric":
        submission = (
            f"sin({arithmetic}) + cos(y/{rng.randint(2, 7)})"
            f" + tan(z/{rng.randint(3, 9)})"
        )
    elif family == "complex":
        submission = f"({arithmetic}) + {rng.randint(1, 9)}*i"
        attributes["allow-complex"] = "true"
        attributes["imaginary-unit-for-display"] = "i"
    elif family == "custom-function":
        submission = f"f({arithmetic}) + g(y, {rng.randint(1, 9)})"
        attributes["custom-functions"] = "f,g"
        correct_answers = {
            worker.ANSWER_NAME: {
                "_variables": ["x", "y", "z"],
                "_assumptions": {
                    "x": {"real": True},
                    "y": {"positive": True},
                    "z": {"integer": True},
                },
            }
        }
    elif family == "finite-set":
        member_count = {"small": 2, "medium": 6, "large": 16}[complexity]
        members = rng.sample(range(-100, 101), member_count)
        submission = "{" + ", ".join(map(str, members)) + "}"
        attributes["allowed-types"] = "finite-set"
    elif family == "interval":
        term_count = {"small": 1, "medium": 4, "large": 12}[complexity]
        start = (
            "-(" + " + ".join(str(rng.randint(1, 9)) for _ in range(term_count)) + ")"
        )
        end = "(" + " + ".join(str(rng.randint(1, 9)) for _ in range(term_count)) + ")"
        left = "[" if rng.choice((True, False)) else "("
        right = "]" if rng.choice((True, False)) else ")"
        submission = f"{left}{start}, {end}{right}"
        attributes["allowed-types"] = "interval"
    elif family == "composite-set":
        value = rng.randint(-9, 9)
        if not simplify:
            submission = rng.choice(("Reals", "Integers", "Naturals"))
        elif complexity == "small":
            submission = "Reals"
        elif complexity == "medium":
            submission = f"[{value - 6}, {value - 4}] U [{value + 4}, {value + 6}]"
        else:
            intervals = [
                f"[{value + offset * 4}, {value + offset * 4 + 2}]"
                for offset in range(-3, 4)
            ]
            submission = " U ".join(intervals)
        attributes["allowed-types"] = "set"
    else:
        raise AssertionError(family)
    return submission, attributes, correct_answers


def _rejected_expression(
    rng: random.Random,
    family: str,
    complexity: str,
    ordinal: int,
    *,
    simplify: bool,
) -> tuple[str, dict[str, str], dict[str, Any], str]:
    valid, attributes, correct_answers = _accepted_expression(
        rng, family, complexity, simplify=simplify
    )
    reasons = (
        "syntax",
        "undeclared-symbol",
        "float",
        "disabled-feature",
        "wrong-type",
        "bad-function",
        "unsupported-simplification",
        "invalid-character",
    )
    reason = reasons[ordinal % len(reasons)]

    if reason == "syntax":
        submission = f"({valid}) + *"
    elif reason == "undeclared-symbol":
        if family in {"finite-set", "interval", "composite-set"}:
            submission = "{q, 1}"
            attributes["allowed-types"] = "finite-set"
        else:
            submission = f"({valid}) + q"
    elif reason == "float":
        if family in {"finite-set", "interval", "composite-set"}:
            submission = "{1.25, 2}"
            attributes["allowed-types"] = "finite-set"
        else:
            submission = f"({valid}) + 1.25"
    elif reason == "disabled-feature":
        if family == "trigonometric":
            submission = valid
            attributes["allow-trig-functions"] = "false"
        elif family == "complex":
            submission = valid
            attributes["allow-complex"] = "false"
        elif family == "custom-function":
            submission = valid
            attributes.pop("custom-functions", None)
        else:
            submission = (
                valid if family.endswith("set") or family == "interval" else "{1, 2}"
            )
            attributes["allowed-types"] = "expression"
    elif reason == "wrong-type":
        if family in {"finite-set", "interval", "composite-set"}:
            submission = valid
            attributes["allowed-types"] = "expression"
        else:
            submission = valid
            attributes["allowed-types"] = "finite-set"
    elif reason == "bad-function":
        submission = "sin(x, y)" if ordinal % 2 else "sqrt(x, y)"
        attributes["allowed-types"] = "expression"
    elif reason == "unsupported-simplification":
        submission = "sin(infty)" if simplify else "cot(infty)"
        attributes = {"variables": "x,y,z", "allowed-types": "expression"}
        correct_answers = {}
    elif reason == "invalid-character":
        submission = f"({valid}) + @"
    else:
        raise AssertionError(reason)
    return submission, attributes, correct_answers, reason


def _make_case(
    *,
    case_id: str,
    family: str,
    complexity: str,
    formula_editor: bool,
    simplify: bool,
    intended_status: Literal["accepted", "rejected"],
    submission: str,
    attributes: dict[str, str],
    correct_answers: dict[str, Any],
    validity: str,
) -> dict[str, Any]:
    attributes = attributes.copy()
    attributes["display-simplified-expression"] = str(simplify).lower()
    if formula_editor:
        attributes["formula-editor"] = "true"
    return {
        "id": case_id,
        "family": family,
        "complexity": complexity,
        "input_mode": "formula-editor" if formula_editor else "plain",
        "simplify": simplify,
        "validity": validity,
        "intended_status": intended_status,
        "submission": submission,
        "latex": submission if formula_editor else None,
        "element_attributes": attributes,
        "correct_answers": correct_answers,
    }


def generate_random_cases() -> list[dict[str, Any]]:
    rng = random.Random(SEED)
    cases: list[dict[str, Any]] = []
    ordinal = 0
    for family in FAMILIES:
        for complexity in COMPLEXITIES:
            for formula_editor in (False, True):
                for simplify in (False, True):
                    for intended_status in ("accepted", "rejected"):
                        for _ in range(32):
                            if intended_status == "accepted":
                                submission, attributes, correct_answers = (
                                    _accepted_expression(
                                        rng,
                                        family,
                                        complexity,
                                        simplify=simplify,
                                    )
                                )
                                validity = "accepted"
                            else:
                                (
                                    submission,
                                    attributes,
                                    correct_answers,
                                    validity,
                                ) = _rejected_expression(
                                    rng,
                                    family,
                                    complexity,
                                    ordinal,
                                    simplify=simplify,
                                )
                            cases.append(
                                _make_case(
                                    case_id=f"random-{ordinal:06d}",
                                    family=family,
                                    complexity=complexity,
                                    formula_editor=formula_editor,
                                    simplify=simplify,
                                    intended_status=intended_status,
                                    submission=submission,
                                    attributes=attributes,
                                    correct_answers=correct_answers,
                                    validity=validity,
                                )
                            )
                            ordinal += 1
    assert len(cases) == 6144
    return cases


def generate_edge_cases() -> list[dict[str, Any]]:
    templates: tuple[
        tuple[
            str,
            str,
            dict[str, str],
            Literal["accepted", "rejected"],
        ],
        ...,
    ] = (
        ("blank-rejected", "", {}, "rejected"),
        ("blank-accepted", "", {"allow-blank": "true"}, "accepted"),
        (
            "blank-value",
            "",
            {"allow-blank": "true", "blank-value": "x + 1", "variables": "x"},
            "accepted",
        ),
        ("accum-bounds", "cot(infty)", {}, "rejected"),
        ("float", "1.25 + x", {"variables": "x"}, "rejected"),
        ("complex-disabled", "sqrt(-1)", {}, "rejected"),
        ("complex-enabled", "sqrt(-1)", {"allow-complex": "true"}, "accepted"),
        ("set-disabled", "{1, 2}", {}, "rejected"),
        ("finite-set", "{1, 2}", {"allowed-types": "finite-set"}, "accepted"),
        ("interval", "[1, 2]", {"allowed-types": "interval"}, "accepted"),
        ("domain", "Reals", {"allowed-types": "set"}, "accepted"),
        (
            "complement-unsimplified",
            "[0, 5] - {2}",
            {"allowed-types": "set"},
            "rejected",
        ),
        ("union", "[0, 1] U [2, 3]", {"allowed-types": "set"}, "accepted"),
        ("bad-arity", "sin(x, y)", {"variables": "x,y"}, "rejected"),
        ("unknown-symbol", "x + q", {"variables": "x"}, "rejected"),
        (
            "formula-plus-minus",
            "2+-x",
            {"variables": "x", "formula-editor": "true"},
            "accepted",
        ),
    )
    cases: list[dict[str, Any]] = []
    for ordinal in range(128):
        name, submission, attributes, intended = templates[ordinal % len(templates)]
        formula_editor = attributes.get("formula-editor") == "true"
        cases.append(
            _make_case(
                case_id=f"edge-{ordinal:03d}-{name}",
                family="edge",
                complexity="small",
                formula_editor=formula_editor,
                simplify=ordinal % 2 == 0,
                intended_status=intended,
                submission=submission,
                attributes=attributes,
                correct_answers={},
                validity=name,
            )
        )
    return cases


def _validate_cases(cases: list[dict[str, Any]], repo_root: Path) -> None:
    module, _sympy_version = worker.load_target(repo_root)
    mismatches: list[str] = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for case in cases:
            outcome, detail, _duration = worker.run_case(
                module,
                case,
                worker._element_html(case["element_attributes"]),
            )
            status = ("accepted", "rejected", "exception")[outcome]
            if status != case["intended_status"]:
                mismatches.append(
                    f"{case['id']}: expected {case['intended_status']}, got {status}: {detail}"
                )
                if len(mismatches) == 20:
                    break
            case["baseline_status"] = status
    if mismatches:
        raise RuntimeError("Corpus validation failed:\n" + "\n".join(mismatches))


def _serialize_cases(cases: list[dict[str, Any]]) -> bytes:
    return b"".join(
        (json.dumps(case, sort_keys=True, separators=(",", ":")) + "\n").encode()
        for case in cases
    )


def generate(repo_root: Path) -> tuple[bytes, dict[str, Any]]:
    cases = [*generate_random_cases(), *generate_edge_cases()]
    _validate_cases(cases, repo_root)
    corpus_bytes = _serialize_cases(cases)
    distribution = Counter(
        (
            case["family"],
            case["complexity"],
            case["input_mode"],
            str(case["simplify"]).lower(),
            case["baseline_status"],
        )
        for case in cases
    )
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "seed": SEED,
        "random_case_count": 6144,
        "edge_case_count": 128,
        "case_count": len(cases),
        "oracle_commit": ORACLE_COMMIT,
        "generated_from_commit": ORACLE_COMMIT,
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
        "distribution": {
            "|".join(key): value for key, value in sorted(distribution.items())
        },
    }
    return corpus_bytes, manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root", type=Path, default=Path(__file__).resolve().parents[2]
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("corpus.jsonl"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).with_name("corpus-manifest.json"),
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    corpus_bytes, manifest = generate(args.repo_root.resolve())
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    if args.check:
        if args.output.read_bytes() != corpus_bytes:
            raise SystemExit("Committed corpus does not match deterministic generation")
        if args.manifest.read_bytes() != manifest_bytes:
            raise SystemExit(
                "Committed manifest does not match deterministic generation"
            )
        return 0

    args.output.write_bytes(corpus_bytes)
    args.manifest.write_bytes(manifest_bytes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

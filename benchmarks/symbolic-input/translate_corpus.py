#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Translate the committed corpus to master's `allow-sets` attribute.

The committed corpus uses the stack's `allowed-types`, which master-based
commits ignore. This writes a copy for comparing #14839 as written against its
master merge-base: set-valued `allowed-types` become `allow-sets="true"`, and
`allowed-types="expression"` is dropped. Payloads are unchanged, since
`mathjson_utils.py` is identical on both sides. Each case is relabeled with its
outcome on both master-based commits.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

import benchmark
import oracle
import worker

SCHEMA_VERSION = 1
BASELINE_COMMIT = "eeca6f48c27e8a5cf4c285479b8dce7d2f579163"
CANDIDATE_COMMIT = "39b72195be06bec0f90109c75ca35507ec9a1daa"
SET_TYPES = frozenset({"finite-set", "interval", "set"})
DEFAULT_OUTPUT = oracle.CACHE_ROOT / "corpus-allow-sets.jsonl"


def translate_attributes(attributes: dict[str, str]) -> dict[str, str]:
    translated = {
        name: value for name, value in attributes.items() if name != "allowed-types"
    }
    if attributes.get("allowed-types") in SET_TYPES:
        translated["allow-sets"] = "true"
    return translated


def translate_case(case: dict[str, Any]) -> dict[str, Any]:
    return case | {
        "element_attributes": translate_attributes(case["element_attributes"])
    }


def _serialize(cases: list[dict[str, Any]]) -> bytes:
    return b"".join(
        (json.dumps(case, sort_keys=True, separators=(",", ":")) + "\n").encode()
        for case in cases
    )


def generate() -> tuple[bytes, dict[str, Any]]:
    manifest = json.loads(benchmark.DEFAULT_MANIFEST.read_text())
    if benchmark.sha256_file(benchmark.DEFAULT_CORPUS) != manifest["corpus_sha256"]:
        raise RuntimeError("Committed corpus does not match its manifest")
    cases = [
        translate_case(case) for case in worker.load_cases(benchmark.DEFAULT_CORPUS)
    ]

    with tempfile.TemporaryDirectory() as temporary:
        unlabeled = Path(temporary) / "corpus.jsonl"
        unlabeled.write_bytes(_serialize(cases))
        baseline = oracle.corpus_outcomes(BASELINE_COMMIT, unlabeled)
        candidate = oracle.corpus_outcomes(CANDIDATE_COMMIT, unlabeled)
    for case, baseline_outcome, candidate_outcome in zip(
        cases, baseline, candidate, strict=True
    ):
        case["baseline_status"] = baseline_outcome.status
        case["candidate_status"] = candidate_outcome.status

    corpus_bytes = _serialize(cases)
    return corpus_bytes, {
        "schema_version": SCHEMA_VERSION,
        "source_corpus_sha256": manifest["corpus_sha256"],
        "case_count": len(cases),
        "baseline_commit": BASELINE_COMMIT,
        "candidate_commit": CANDIDATE_COMMIT,
        "status_distribution": {
            "|".join(key): value
            for key, value in sorted(
                Counter(
                    (
                        case["input_mode"],
                        case["payload_mode"],
                        case["intended_status"],
                        case["baseline_status"],
                        case["candidate_status"],
                    )
                    for case in cases
                ).items()
            )
        },
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    corpus_bytes, manifest = generate()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(corpus_bytes)
    args.output.with_suffix(".manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

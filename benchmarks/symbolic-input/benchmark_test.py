# ruff: file-ignore[undocumented-public-function]
"""Tests for the benchmark-only symbolic-input parse suite."""

from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

import pytest

BENCHMARK_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCHMARK_DIR))

import benchmark  # ruff: ignore[module-import-not-at-top-of-file]
import generate_corpus  # ruff: ignore[module-import-not-at-top-of-file]
import worker  # ruff: ignore[module-import-not-at-top-of-file]


def _tiny_corpus(tmp_path: Path) -> Path:
    first_case = benchmark.DEFAULT_CORPUS.read_text().splitlines()[0]
    corpus = tmp_path / "corpus.jsonl"
    corpus.write_text(first_case + "\n")
    return corpus


def _tiny_suite() -> benchmark.Suite:
    return benchmark.Suite(
        name="test",
        default_duration_ns=0,
        corpus_cycles=1,
        epoch_seconds=1,
        batch_size_per_worker=1,
        warmup_cases=0,
        lifecycles=("warm",),
        gc_modes=("normal",),
        workers=(1,),
    )


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("250ms", 250_000_000),
        ("2s", 2_000_000_000),
        ("1.5m", 90_000_000_000),
        ("2h", 7_200_000_000_000),
    ],
)
def test_parse_duration(value: str, expected: int) -> None:
    assert benchmark.parse_duration(value) == expected


def test_scheduled_indices_are_deterministic_complete_permutations() -> None:
    first = benchmark.scheduled_indices(
        seed=15970,
        condition_id=3,
        offset=0,
        count=20,
        corpus_size=10,
    )
    second = benchmark.scheduled_indices(
        seed=15970,
        condition_id=3,
        offset=0,
        count=20,
        corpus_size=10,
    )
    assert first == second
    assert sorted(first[:10]) == list(range(10))
    assert sorted(first[10:]) == list(range(10))


def test_committed_corpus_matches_manifest_and_distribution() -> None:
    corpus_bytes = benchmark.DEFAULT_CORPUS.read_bytes()
    cases = [json.loads(line) for line in corpus_bytes.splitlines()]
    manifest = json.loads(benchmark.DEFAULT_MANIFEST.read_text())

    assert len(cases) == 6272
    assert manifest["random_case_count"] == 6144
    assert manifest["edge_case_count"] == 128
    assert manifest["corpus_sha256"] == hashlib.sha256(corpus_bytes).hexdigest()
    assert len({case["id"] for case in cases}) == len(cases)
    assert Counter(case["baseline_status"] for case in cases) == {
        "accepted": 3136,
        "rejected": 3136,
    }

    random_cases = [case for case in cases if case["id"].startswith("random-")]
    cells = Counter(
        (
            case["family"],
            case["complexity"],
            case["input_mode"],
            case["simplify"],
            case["baseline_status"],
        )
        for case in random_cases
    )
    assert len(cells) == 8 * 3 * 2 * 2 * 2
    assert set(cells.values()) == {32}


def test_corpus_regeneration_is_byte_for_byte_deterministic() -> None:
    corpus_bytes, manifest = generate_corpus.generate(benchmark.REPO_ROOT)
    assert corpus_bytes == benchmark.DEFAULT_CORPUS.read_bytes()
    assert (json.dumps(manifest, indent=2, sort_keys=True) + "\n") == (
        benchmark.DEFAULT_MANIFEST.read_text()
    )


def test_database_checkpoint_resume_extension_and_report(tmp_path: Path) -> None:
    database = tmp_path / "result.sqlite3"
    corpus = _tiny_corpus(tmp_path)
    benchmark.create_database(
        database,
        target_ref="HEAD",
        target_commit=benchmark.resolve_commit("HEAD"),
        suite=_tiny_suite(),
        target_duration_ns=0,
        corpus=corpus,
        corpus_size=1,
        worker_metadata={"python": "test", "sympy": "test"},
        labels=["unit-test"],
    )

    connection = benchmark.connect_database(database)
    try:
        condition = benchmark.load_conditions(connection)[0]
        benchmark.record_batch(
            connection,
            condition,
            [0],
            [125_000],
            [0],
            ["value-hash"],
            200_000,
        )
        completed = benchmark.load_conditions(connection)[0]
        assert completed.complete
        assert completed.completed_invocations == 1
        with pytest.raises(benchmark.BenchmarkError, match="checkpoint"):
            benchmark.record_batch(
                connection,
                condition,
                [0],
                [125_000],
                [0],
                ["duplicate"],
                200_000,
            )
    finally:
        connection.close()

    benchmark.extend_run(database, benchmark.parse_duration("1s"))
    connection = benchmark.connect_database(database)
    try:
        extended = benchmark.load_conditions(connection)[0]
        assert not extended.complete
        assert extended.target_active_ns == 1_000_200_000
        assert extended.target_invocations == 0
    finally:
        connection.close()

    output = io.StringIO()
    benchmark.render_report([database], "markdown", output)
    report = output.getvalue()
    assert "Runtime conditions" in report
    assert "125.000" in report


def test_incompatible_database_is_rejected(tmp_path: Path) -> None:
    database = tmp_path / "invalid.sqlite3"
    connection = sqlite3.connect(database)
    connection.execute("CREATE TABLE unrelated (value INTEGER)")
    connection.close()

    connection = benchmark.connect_database(database)
    try:
        with pytest.raises(benchmark.BenchmarkError, match="compatible"):
            benchmark.get_metadata(connection)
    finally:
        connection.close()


def test_target_loader_refuses_incompatible_checkout(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="expected pl-symbolic-input layout"):
        worker.load_target(tmp_path)


def test_target_loader_runs_current_element() -> None:
    module, sympy_version = worker.load_target(benchmark.REPO_ROOT)
    case = json.loads(benchmark.DEFAULT_CORPUS.read_text().splitlines()[0])
    outcome, _detail, duration_ns = worker.run_case(
        module,
        case,
        worker._element_html(case["element_attributes"]),
    )
    assert sympy_version
    assert outcome == 0
    assert duration_ns > 0


def test_signal_requests_graceful_stop() -> None:
    benchmark.STOP_REQUESTED.clear()
    benchmark.signal_handler(0, None)
    assert benchmark.STOP_REQUESTED.is_set()
    benchmark.STOP_REQUESTED.clear()

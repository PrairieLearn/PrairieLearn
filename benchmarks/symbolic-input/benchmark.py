#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Run and report resumable pl-symbolic-input parse benchmarks."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import platform
import random
import select
import signal
import sqlite3
import statistics
import struct
import subprocess
import sys
import threading
import time
import tomllib
import zlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, TextIO

if TYPE_CHECKING:
    from collections.abc import Sequence

BENCHMARK_DIR = Path(__file__).resolve().parent
REPO_ROOT = BENCHMARK_DIR.parents[1]
DEFAULT_CORPUS = BENCHMARK_DIR / "corpus.jsonl"
DEFAULT_MANIFEST = BENCHMARK_DIR / "corpus-manifest.json"
SUITES_PATH = BENCHMARK_DIR / "suites.toml"
WORKER_PATH = BENCHMARK_DIR / "worker.py"
SCHEMA_VERSION = 1
OUTCOMES = ("accepted", "rejected", "exception")
STOP_REQUESTED = threading.Event()


@dataclass(frozen=True, slots=True)
class Suite:
    name: str
    default_duration_ns: int
    corpus_cycles: int
    epoch_seconds: int
    batch_size_per_worker: int
    warmup_cases: int
    lifecycles: tuple[Literal["warm", "fresh"], ...]
    gc_modes: tuple[Literal["normal", "disabled"], ...]
    workers: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class Condition:
    id: int
    lifecycle: str
    gc_mode: str
    workers: int
    target_active_ns: int
    target_invocations: int
    completed_active_ns: int
    completed_invocations: int
    next_batch: int
    complete: bool


class BenchmarkError(RuntimeError):
    """Raised for benchmark configuration or execution failures."""


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def parse_duration(value: str) -> int:
    units = {
        "ms": 1_000_000,
        "s": 1_000_000_000,
        "m": 60_000_000_000,
        "h": 3_600_000_000_000,
    }
    for suffix in ("ms", "s", "m", "h"):
        if value.endswith(suffix):
            try:
                amount = float(value[: -len(suffix)])
            except ValueError as exc:
                raise argparse.ArgumentTypeError(f"Invalid duration: {value}") from exc
            if amount < 0:
                raise argparse.ArgumentTypeError("Duration cannot be negative")
            return round(amount * units[suffix])
    raise argparse.ArgumentTypeError("Duration must end in ms, s, m, or h")


def format_duration(duration_ns: int) -> str:
    seconds = duration_ns / 1_000_000_000
    if seconds >= 3600:
        return f"{seconds / 3600:.2f}h"
    if seconds >= 60:
        return f"{seconds / 60:.2f}m"
    return f"{seconds:.2f}s"


def load_suites(path: Path = SUITES_PATH) -> dict[str, Suite]:
    with path.open("rb") as suite_file:
        raw = tomllib.load(suite_file)
    suites: dict[str, Suite] = {}
    for name, config in raw.items():
        suites[name] = Suite(
            name=name,
            default_duration_ns=parse_duration(config["default_duration"]),
            corpus_cycles=config["corpus_cycles"],
            epoch_seconds=config["epoch_seconds"],
            batch_size_per_worker=config["batch_size_per_worker"],
            warmup_cases=config["warmup_cases"],
            lifecycles=tuple(config["lifecycles"]),
            gc_modes=tuple(config["gc_modes"]),
            workers=tuple(config["workers"]),
        )
    return suites


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_output(*args: str, cwd: Path = REPO_ROOT) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def resolve_commit(ref: str) -> str:
    try:
        return git_output("rev-parse", "--verify", f"{ref}^{{commit}}")
    except subprocess.CalledProcessError as exc:
        raise BenchmarkError(f"Could not resolve commit {ref!r}") from exc


def prepare_worktree(commit: str, cache_root: Path) -> Path:
    worktree = cache_root / "worktrees" / commit
    if worktree.exists():
        try:
            existing = git_output("rev-parse", "HEAD", cwd=worktree)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            raise BenchmarkError(
                f"Cached worktree path exists but is invalid: {worktree}"
            ) from exc
        if existing != commit:
            raise BenchmarkError(
                f"Cached worktree {worktree} contains {existing}, expected {commit}"
            )
        return worktree
    worktree.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["git", "worktree", "add", "--detach", os.fspath(worktree), commit],
            cwd=REPO_ROOT,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise BenchmarkError(f"Could not create target worktree for {commit}") from exc
    return worktree


def _pack_unsigned(values: list[int], code: Literal["I", "Q"]) -> bytes:
    if not values:
        return b""
    return struct.pack(f"<{len(values)}{code}", *values)


def _unpack_unsigned(data: bytes, code: Literal["I", "Q"]) -> list[int]:
    item_size = struct.calcsize(code)
    if len(data) % item_size:
        raise BenchmarkError("Corrupt packed measurement data")
    if not data:
        return []
    return list(struct.unpack(f"<{len(data) // item_size}{code}", data))


def _compress(data: bytes) -> bytes:
    return zlib.compress(data, level=6)


def _decompress(data: bytes) -> bytes:
    try:
        return zlib.decompress(data)
    except zlib.error as exc:
        raise BenchmarkError("Corrupt compressed measurement data") from exc


class WorkerClient:
    def __init__(
        self,
        checkout: Path,
        corpus: Path,
        log_dir: Path,
        worker_number: int,
    ) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self._log_path = log_dir / f"worker-{worker_number}-{time.time_ns()}.log"
        self._log_file = self._log_path.open("w", encoding="utf-8")
        command = [
            "uv",
            "run",
            "--project",
            os.fspath(checkout),
            "--locked",
            "python",
            os.fspath(WORKER_PATH),
            "--checkout",
            os.fspath(checkout),
            "--corpus",
            os.fspath(corpus),
        ]
        self._process = subprocess.Popen(
            command,
            cwd=checkout,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self._log_file,
            text=True,
            start_new_session=True,
        )
        ready = self._receive(timeout_seconds=300)
        if not ready.get("ready"):
            self.close(force=True)
            raise BenchmarkError(
                f"Target worker failed compatibility setup: {ready.get('error')}; "
                f"see {self._log_path}"
            )
        self.metadata = ready

    def send_batch(
        self,
        indices: list[int],
        *,
        gc_mode: str,
        record: bool = True,
    ) -> None:
        self._send({
            "command": "batch",
            "indices": indices,
            "gc_mode": gc_mode,
            "record": record,
        })

    def receive_batch(self) -> dict[str, Any]:
        result = self._receive(timeout_seconds=600)
        if "error" in result:
            raise BenchmarkError(
                f"Target worker failed: {result['error']}; see {self._log_path}"
            )
        return result

    def _send(self, value: dict[str, Any]) -> None:
        if self._process.stdin is None:
            raise BenchmarkError("Worker stdin is unavailable")
        try:
            self._process.stdin.write(json.dumps(value, separators=(",", ":")) + "\n")
            self._process.stdin.flush()
        except BrokenPipeError as exc:
            raise BenchmarkError(
                f"Target worker exited unexpectedly; see {self._log_path}"
            ) from exc

    def _receive(self, *, timeout_seconds: int) -> dict[str, Any]:
        if self._process.stdout is None:
            raise BenchmarkError("Worker stdout is unavailable")
        readable, _, _ = select.select([self._process.stdout], [], [], timeout_seconds)
        if not readable:
            self.close(force=True)
            raise BenchmarkError(
                f"Target worker did not respond within {timeout_seconds}s; "
                f"see {self._log_path}"
            )
        line = self._process.stdout.readline()
        if not line:
            raise BenchmarkError(
                f"Target worker exited unexpectedly; see {self._log_path}"
            )
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise BenchmarkError(
                f"Target worker emitted invalid protocol data; see {self._log_path}"
            ) from exc
        if not isinstance(value, dict):
            raise BenchmarkError("Target worker emitted a non-object response")
        return value

    def close(self, *, force: bool = False) -> None:
        if self._process.poll() is None and not force:
            try:
                self._send({"command": "stop"})
                self._process.wait(timeout=10)
            except (BenchmarkError, subprocess.TimeoutExpired):
                force = True
        if self._process.poll() is None and force:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait()
        self._log_file.close()


class WorkerPool:
    def __init__(
        self,
        checkout: Path,
        corpus: Path,
        log_dir: Path,
        workers: int,
    ) -> None:
        self.clients: list[WorkerClient] = []
        try:
            for worker_number in range(workers):
                self.clients.append(
                    WorkerClient(checkout, corpus, log_dir, worker_number)
                )
        except BaseException:
            self.close(force=True)
            raise

    @property
    def metadata(self) -> dict[str, Any]:
        return self.clients[0].metadata

    def run(
        self,
        partitions: list[list[int]],
        *,
        gc_mode: str,
        record: bool = True,
    ) -> tuple[list[int], list[int], list[str], int]:
        start_ns = time.perf_counter_ns()
        for client, indices in zip(self.clients, partitions, strict=True):
            client.send_batch(indices, gc_mode=gc_mode, record=record)
        results = [client.receive_batch() for client in self.clients]
        wall_ns = time.perf_counter_ns() - start_ns
        timings = [value for result in results for value in result["timings_ns"]]
        outcomes = [value for result in results for value in result["outcomes"]]
        details = [value for result in results for value in result["details"]]
        return timings, outcomes, details, wall_ns

    def close(self, *, force: bool = False) -> None:
        for client in self.clients:
            client.close(force=force)
        self.clients.clear()


def partition_indices(indices: list[int], workers: int) -> list[list[int]]:
    partitions = [[] for _ in range(workers)]
    for position, index in enumerate(indices):
        partitions[position % workers].append(index)
    return partitions


def scheduled_indices(
    *,
    seed: int,
    condition_id: int,
    offset: int,
    count: int,
    corpus_size: int,
) -> list[int]:
    indices: list[int] = []
    while len(indices) < count:
        cycle, position = divmod(offset, corpus_size)
        permutation = list(range(corpus_size))
        random.Random(seed + condition_id * 1_000_003 + cycle).shuffle(permutation)
        take = min(count - len(indices), corpus_size - position)
        indices.extend(permutation[position : position + take])
        offset += take
    return indices


def connect_database(path: Path) -> sqlite3.Connection:
    try:
        connection = sqlite3.connect(path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA foreign_keys = ON")
        return connection
    except sqlite3.Error as exc:
        raise BenchmarkError(
            f"Could not open benchmark database {path}: {exc}"
        ) from exc


def set_metadata(connection: sqlite3.Connection, key: str, value: Any) -> None:
    connection.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
        (key, json.dumps(value, sort_keys=True)),
    )


def get_metadata(connection: sqlite3.Connection) -> dict[str, Any]:
    try:
        return {
            row["key"]: json.loads(row["value"])
            for row in connection.execute("SELECT key, value FROM metadata")
        }
    except sqlite3.Error as exc:
        raise BenchmarkError(
            "Not a compatible symbolic-input benchmark database"
        ) from exc


def create_database(
    path: Path,
    *,
    target_ref: str,
    target_commit: str,
    suite: Suite,
    target_duration_ns: int,
    corpus: Path,
    corpus_size: int,
    worker_metadata: dict[str, Any],
    labels: list[str],
) -> None:
    if path.exists():
        raise BenchmarkError(f"Output database already exists; use resume: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = connect_database(path)
    try:
        connection.executescript(
            """
            CREATE TABLE metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE conditions (
                id INTEGER PRIMARY KEY,
                lifecycle TEXT NOT NULL,
                gc_mode TEXT NOT NULL,
                workers INTEGER NOT NULL,
                target_active_ns INTEGER NOT NULL,
                target_invocations INTEGER NOT NULL,
                completed_active_ns INTEGER NOT NULL DEFAULT 0,
                completed_invocations INTEGER NOT NULL DEFAULT 0,
                next_batch INTEGER NOT NULL DEFAULT 0,
                complete INTEGER NOT NULL DEFAULT 0,
                UNIQUE (lifecycle, gc_mode, workers)
            );
            CREATE TABLE batches (
                condition_id INTEGER NOT NULL REFERENCES conditions(id),
                batch_index INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                wall_ns INTEGER NOT NULL,
                invocation_count INTEGER NOT NULL,
                case_indices BLOB NOT NULL,
                timings_ns BLOB NOT NULL,
                outcomes BLOB NOT NULL,
                details BLOB NOT NULL,
                PRIMARY KEY (condition_id, batch_index)
            );
            """
        )
        conditions = [
            (lifecycle, gc_mode, workers)
            for lifecycle in suite.lifecycles
            for gc_mode in suite.gc_modes
            for workers in suite.workers
        ]
        duration_base, duration_remainder = divmod(target_duration_ns, len(conditions))
        target_invocations = (
            corpus_size * suite.corpus_cycles if target_duration_ns == 0 else 0
        )
        for condition_id, (lifecycle, gc_mode, workers) in enumerate(conditions):
            condition_duration = duration_base + (
                1 if condition_id < duration_remainder else 0
            )
            connection.execute(
                """
                INSERT INTO conditions (
                    id, lifecycle, gc_mode, workers, target_active_ns,
                    target_invocations
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    condition_id,
                    lifecycle,
                    gc_mode,
                    workers,
                    condition_duration,
                    target_invocations,
                ),
            )
        for key, value in {
            "schema_version": SCHEMA_VERSION,
            "target_ref": target_ref,
            "target_commit": target_commit,
            "suite": suite.name,
            "suite_config": suite.__dict__
            if hasattr(suite, "__dict__")
            else {field: getattr(suite, field) for field in Suite.__dataclass_fields__},
            "target_duration_ns": target_duration_ns,
            "corpus_path": os.fspath(corpus.resolve()),
            "corpus_sha256": sha256_file(corpus),
            "corpus_size": corpus_size,
            "seed": 15970,
            "harness_commit": git_output("rev-parse", "HEAD"),
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "status": "ready",
            "labels": labels,
            "controller_python": platform.python_version(),
            "controller_platform": platform.platform(),
            "worker_environment": worker_metadata,
        }.items():
            set_metadata(connection, key, value)
        connection.commit()
    finally:
        connection.close()


def load_conditions(connection: sqlite3.Connection) -> list[Condition]:
    return [
        Condition(
            id=row["id"],
            lifecycle=row["lifecycle"],
            gc_mode=row["gc_mode"],
            workers=row["workers"],
            target_active_ns=row["target_active_ns"],
            target_invocations=row["target_invocations"],
            completed_active_ns=row["completed_active_ns"],
            completed_invocations=row["completed_invocations"],
            next_batch=row["next_batch"],
            complete=bool(row["complete"]),
        )
        for row in connection.execute("SELECT * FROM conditions ORDER BY id")
    ]


def condition_is_complete(condition: Condition) -> bool:
    if condition.target_active_ns:
        return condition.completed_active_ns >= condition.target_active_ns
    return condition.completed_invocations >= condition.target_invocations


def record_batch(
    connection: sqlite3.Connection,
    condition: Condition,
    indices: list[int],
    timings: list[int],
    outcomes: list[int],
    details: list[str],
    wall_ns: int,
) -> None:
    if not (len(indices) == len(timings) == len(outcomes) == len(details)):
        raise BenchmarkError("Worker returned inconsistent batch lengths")
    new_active_ns = condition.completed_active_ns + wall_ns
    new_invocations = condition.completed_invocations + len(indices)
    updated = Condition(
        id=condition.id,
        lifecycle=condition.lifecycle,
        gc_mode=condition.gc_mode,
        workers=condition.workers,
        target_active_ns=condition.target_active_ns,
        target_invocations=condition.target_invocations,
        completed_active_ns=new_active_ns,
        completed_invocations=new_invocations,
        next_batch=condition.next_batch + 1,
        complete=False,
    )
    complete = condition_is_complete(updated)
    try:
        with connection:
            connection.execute(
                """
                INSERT INTO batches (
                    condition_id, batch_index, created_at, wall_ns,
                    invocation_count, case_indices, timings_ns, outcomes, details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    condition.id,
                    condition.next_batch,
                    now_iso(),
                    wall_ns,
                    len(indices),
                    _compress(_pack_unsigned(indices, "I")),
                    _compress(_pack_unsigned(timings, "Q")),
                    _compress(bytes(outcomes)),
                    _compress(json.dumps(details, separators=(",", ":")).encode()),
                ),
            )
            connection.execute(
                """
                UPDATE conditions
                SET completed_active_ns = ?, completed_invocations = ?,
                    next_batch = ?, complete = ?
                WHERE id = ?
                """,
                (
                    new_active_ns,
                    new_invocations,
                    condition.next_batch + 1,
                    int(complete),
                    condition.id,
                ),
            )
            set_metadata(connection, "updated_at", now_iso())
    except sqlite3.Error as exc:
        raise BenchmarkError(f"Could not checkpoint benchmark batch: {exc}") from exc


def _make_pool(
    checkout: Path,
    corpus: Path,
    log_dir: Path,
    condition: Condition,
) -> WorkerPool:
    return WorkerPool(checkout, corpus, log_dir, condition.workers)


def run_condition_epoch(
    connection: sqlite3.Connection,
    condition: Condition,
    suite: Suite,
    checkout: Path,
    corpus: Path,
    log_dir: Path,
    corpus_size: int,
    seed: int,
) -> None:
    epoch_target_ns = suite.epoch_seconds * 1_000_000_000
    epoch_active_ns = 0
    warm_pool: WorkerPool | None = None
    try:
        if condition.lifecycle == "warm":
            warm_pool = _make_pool(checkout, corpus, log_dir, condition)
            warmup_count = min(suite.warmup_cases, corpus_size)
            if warmup_count:
                warmup = scheduled_indices(
                    seed=seed,
                    condition_id=condition.id,
                    offset=0,
                    count=warmup_count,
                    corpus_size=corpus_size,
                )
                warm_pool.run(
                    partition_indices(warmup, condition.workers),
                    gc_mode=condition.gc_mode,
                    record=False,
                )

        while not STOP_REQUESTED.is_set() and epoch_active_ns < epoch_target_ns:
            rows = load_conditions(connection)
            current = next(row for row in rows if row.id == condition.id)
            if condition_is_complete(current):
                return
            count = suite.batch_size_per_worker * current.workers
            if current.target_invocations:
                count = min(
                    count,
                    current.target_invocations - current.completed_invocations,
                )
            indices = scheduled_indices(
                seed=seed,
                condition_id=current.id,
                offset=current.completed_invocations,
                count=count,
                corpus_size=corpus_size,
            )
            pool = warm_pool or _make_pool(checkout, corpus, log_dir, current)
            try:
                timings, outcomes, details, wall_ns = pool.run(
                    partition_indices(indices, current.workers),
                    gc_mode=current.gc_mode,
                )
            finally:
                if warm_pool is None:
                    pool.close()
            record_batch(
                connection,
                current,
                indices,
                timings,
                outcomes,
                details,
                wall_ns,
            )
            epoch_active_ns += wall_ns
    finally:
        if warm_pool is not None:
            warm_pool.close(force=STOP_REQUESTED.is_set())


def locate_corpus(metadata: dict[str, Any]) -> Path:
    stored = Path(metadata["corpus_path"])
    candidates = (stored, DEFAULT_CORPUS)
    for candidate in candidates:
        if candidate.is_file() and sha256_file(candidate) == metadata["corpus_sha256"]:
            return candidate
    raise BenchmarkError(
        "The corpus used for this run is unavailable or its hash has changed"
    )


def validate_database(metadata: dict[str, Any]) -> None:
    if metadata.get("schema_version") != SCHEMA_VERSION:
        raise BenchmarkError(
            f"Unsupported benchmark database schema: {metadata.get('schema_version')}"
        )
    required = {
        "target_commit",
        "suite",
        "suite_config",
        "corpus_sha256",
        "corpus_size",
        "seed",
    }
    missing = required - metadata.keys()
    if missing:
        raise BenchmarkError(
            "Benchmark database is missing metadata: " + ", ".join(sorted(missing))
        )


def suite_from_metadata(metadata: dict[str, Any]) -> Suite:
    config = metadata["suite_config"]
    return Suite(
        name=config["name"],
        default_duration_ns=config["default_duration_ns"],
        corpus_cycles=config["corpus_cycles"],
        epoch_seconds=config["epoch_seconds"],
        batch_size_per_worker=config["batch_size_per_worker"],
        warmup_cases=config["warmup_cases"],
        lifecycles=tuple(config["lifecycles"]),
        gc_modes=tuple(config["gc_modes"]),
        workers=tuple(config["workers"]),
    )


def execute_database(path: Path) -> None:
    cache_root = REPO_ROOT / ".cache/symbolic-input-benchmark"
    connection = connect_database(path)
    try:
        metadata = get_metadata(connection)
        validate_database(metadata)
        suite = suite_from_metadata(metadata)
        corpus = locate_corpus(metadata)
        checkout = prepare_worktree(metadata["target_commit"], cache_root)
        log_dir = cache_root / "logs" / path.stem
        with connection:
            set_metadata(connection, "status", "running")
            set_metadata(connection, "updated_at", now_iso())

        while not STOP_REQUESTED.is_set():
            incomplete = [
                condition
                for condition in load_conditions(connection)
                if not condition_is_complete(condition)
            ]
            if not incomplete:
                break
            for condition in incomplete:
                if STOP_REQUESTED.is_set():
                    break
                print(
                    f"condition {condition.id}: {condition.lifecycle}, "
                    f"gc={condition.gc_mode}, workers={condition.workers}",
                    flush=True,
                )
                run_condition_epoch(
                    connection,
                    condition,
                    suite,
                    checkout,
                    corpus,
                    log_dir,
                    metadata["corpus_size"],
                    metadata["seed"],
                )

        with connection:
            set_metadata(
                connection,
                "status",
                "interrupted" if STOP_REQUESTED.is_set() else "complete",
            )
            set_metadata(connection, "updated_at", now_iso())
    except BaseException:
        with connection:
            set_metadata(connection, "status", "failed")
            set_metadata(connection, "updated_at", now_iso())
        raise
    finally:
        connection.close()


def initialize_run(args: argparse.Namespace) -> None:
    suites = load_suites()
    suite = suites[args.suite]
    corpus = args.corpus.resolve()
    with corpus.open(encoding="utf-8") as corpus_file:
        corpus_size = sum(1 for line in corpus_file if line.strip())
    if corpus_size == 0:
        raise BenchmarkError("Corpus is empty")
    manifest = json.loads(DEFAULT_MANIFEST.read_text())
    if corpus == DEFAULT_CORPUS.resolve() and manifest["corpus_sha256"] != sha256_file(
        corpus
    ):
        raise BenchmarkError("Bundled corpus does not match its manifest")

    target_commit = resolve_commit(args.commit)
    cache_root = REPO_ROOT / ".cache/symbolic-input-benchmark"
    checkout = prepare_worktree(target_commit, cache_root)
    probe = WorkerPool(
        checkout,
        corpus,
        cache_root / "logs" / "probe",
        1,
    )
    try:
        worker_metadata = probe.metadata
        if worker_metadata["case_count"] != corpus_size:
            raise BenchmarkError("Worker loaded a different corpus size")
    finally:
        probe.close()
    duration_ns = (
        args.duration if args.duration is not None else suite.default_duration_ns
    )
    create_database(
        args.output.resolve(),
        target_ref=args.commit,
        target_commit=target_commit,
        suite=suite,
        target_duration_ns=duration_ns,
        corpus=corpus,
        corpus_size=corpus_size,
        worker_metadata=worker_metadata,
        labels=args.label,
    )
    execute_database(args.output.resolve())


def extend_run(path: Path, extension_ns: int) -> None:
    if extension_ns <= 0:
        raise BenchmarkError("Extension duration must be positive")
    connection = connect_database(path)
    try:
        metadata = get_metadata(connection)
        validate_database(metadata)
        conditions = load_conditions(connection)
        base, remainder = divmod(extension_ns, len(conditions))
        with connection:
            for position, condition in enumerate(conditions):
                addition = base + (1 if position < remainder else 0)
                connection.execute(
                    """
                    UPDATE conditions
                    SET target_active_ns = MAX(target_active_ns, completed_active_ns) + ?,
                        target_invocations = 0, complete = 0
                    WHERE id = ?
                    """,
                    (addition, condition.id),
                )
            set_metadata(
                connection,
                "target_duration_ns",
                metadata["target_duration_ns"] + extension_ns,
            )
            set_metadata(connection, "status", "ready")
    finally:
        connection.close()


def show_status(path: Path) -> None:
    connection = connect_database(path)
    try:
        metadata = get_metadata(connection)
        validate_database(metadata)
        print(f"database: {path}")
        print(f"status: {metadata['status']}")
        print(f"target: {metadata['target_commit']}")
        print(f"suite: {metadata['suite']}")
        print(f"corpus: {metadata['corpus_size']} cases")
        for condition in load_conditions(connection):
            target = (
                format_duration(condition.target_active_ns)
                if condition.target_active_ns
                else f"{condition.target_invocations} calls"
            )
            progress = (
                format_duration(condition.completed_active_ns)
                if condition.target_active_ns
                else f"{condition.completed_invocations} calls"
            )
            print(
                f"[{condition.id:02d}] {condition.lifecycle:5s} "
                f"gc={condition.gc_mode:8s} workers={condition.workers}: "
                f"{progress} / {target}"
            )
    finally:
        connection.close()


def quantile(values: Sequence[int | float], fraction: float) -> float:
    if not values:
        return math.nan
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def load_measurements(
    path: Path,
) -> tuple[
    dict[str, Any], list[dict[str, Any]], dict[tuple[str, str, int], tuple[int, int]]
]:
    connection = connect_database(path)
    try:
        metadata = get_metadata(connection)
        validate_database(metadata)
        corpus = [
            json.loads(line)
            for line in locate_corpus(metadata).read_text().splitlines()
            if line
        ]
        measurements: list[dict[str, Any]] = []
        condition_wall: dict[tuple[str, str, int], list[int]] = defaultdict(
            lambda: [0, 0]
        )
        query = """
            SELECT c.lifecycle, c.gc_mode, c.workers, b.*
            FROM batches AS b
            JOIN conditions AS c ON c.id = b.condition_id
            ORDER BY b.condition_id, b.batch_index
        """
        for row in connection.execute(query):
            indices = _unpack_unsigned(_decompress(row["case_indices"]), "I")
            timings = _unpack_unsigned(_decompress(row["timings_ns"]), "Q")
            outcomes = list(_decompress(row["outcomes"]))
            if not (len(indices) == len(timings) == len(outcomes)):
                raise BenchmarkError(f"Corrupt batch in {path}")
            condition_key = (row["lifecycle"], row["gc_mode"], row["workers"])
            condition_wall[condition_key][0] += row["invocation_count"]
            condition_wall[condition_key][1] += row["wall_ns"]
            for case_index, timing_ns, outcome in zip(
                indices, timings, outcomes, strict=True
            ):
                case = corpus[case_index]
                measurements.append({
                    "condition": condition_key,
                    "family": case["family"],
                    "complexity": case["complexity"],
                    "expected": case["baseline_status"],
                    "timing_ns": timing_ns,
                    "outcome": OUTCOMES[outcome],
                })
        return (
            metadata,
            measurements,
            {key: (value[0], value[1]) for key, value in condition_wall.items()},
        )
    finally:
        connection.close()


def summarize(values: list[int]) -> dict[str, float | int]:
    return {
        "count": len(values),
        "mean_us": statistics.fmean(values) / 1000 if values else math.nan,
        "stdev_us": statistics.pstdev(values) / 1000 if len(values) > 1 else 0.0,
        "p50_us": quantile(values, 0.50) / 1000,
        "p90_us": quantile(values, 0.90) / 1000,
        "p95_us": quantile(values, 0.95) / 1000,
        "p99_us": quantile(values, 0.99) / 1000,
    }


def report_rows(paths: list[Path]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    condition_rows: list[dict[str, Any]] = []
    breakdown_rows: list[dict[str, Any]] = []
    baseline_means: dict[tuple[Any, ...], float] = {}
    for database_number, path in enumerate(paths):
        metadata, measurements, wall = load_measurements(path)
        target = metadata["target_commit"][:12]
        by_condition: dict[tuple[str, str, int], list[dict[str, Any]]] = defaultdict(
            list
        )
        by_breakdown: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
        for measurement in measurements:
            condition = measurement["condition"]
            by_condition[condition].append(measurement)
            by_breakdown[
                *condition,
                measurement["family"],
                measurement["complexity"],
                measurement["expected"],
            ].append(measurement)
        for condition, group in sorted(by_condition.items()):
            stats = summarize([item["timing_ns"] for item in group])
            invocations, wall_ns = wall[condition]
            condition_rows.append({
                "database": os.fspath(path),
                "target": target,
                "lifecycle": condition[0],
                "gc": condition[1],
                "workers": condition[2],
                "throughput_per_s": invocations * 1_000_000_000 / wall_ns,
                "mismatches": sum(
                    item["outcome"] != item["expected"] for item in group
                ),
                "exceptions": sum(item["outcome"] == "exception" for item in group),
                **stats,
            })
        for key, group in sorted(by_breakdown.items()):
            stats = summarize([item["timing_ns"] for item in group])
            comparison_key = key
            if database_number == 0:
                baseline_means[comparison_key] = float(stats["mean_us"])
            baseline_mean = baseline_means.get(comparison_key)
            ratio = (
                float(stats["mean_us"]) / baseline_mean
                if baseline_mean and database_number > 0
                else (1.0 if database_number == 0 else math.nan)
            )
            breakdown_rows.append({
                "database": os.fspath(path),
                "target": target,
                "lifecycle": key[0],
                "gc": key[1],
                "workers": key[2],
                "family": key[3],
                "complexity": key[4],
                "expected": key[5],
                "actual_accepted": sum(item["outcome"] == "accepted" for item in group),
                "actual_rejected": sum(item["outcome"] == "rejected" for item in group),
                "exceptions": sum(item["outcome"] == "exception" for item in group),
                "mismatches": sum(
                    item["outcome"] != item["expected"] for item in group
                ),
                "ratio_to_first": ratio,
                **stats,
            })
    return condition_rows, breakdown_rows


def _markdown_table(rows: list[dict[str, Any]], columns: list[str]) -> str:
    output = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join("---" for _ in columns) + " |",
    ]
    output.extend(
        (
            "| "
            + " | ".join(
                f"{row[column]:.3f}"
                if isinstance(row[column], float)
                else str(row[column])
                for column in columns
            )
            + " |"
        )
        for row in rows
    )
    return "\n".join(output)


def render_report(paths: list[Path], output_format: str, output: TextIO) -> None:
    condition_rows, breakdown_rows = report_rows(paths)
    if not condition_rows or not breakdown_rows:
        raise BenchmarkError("No completed benchmark batches to report")
    if output_format == "csv":
        writer = csv.DictWriter(output, fieldnames=list(breakdown_rows[0]))
        writer.writeheader()
        writer.writerows(breakdown_rows)
        return

    condition_columns = [
        "target",
        "lifecycle",
        "gc",
        "workers",
        "count",
        "throughput_per_s",
        "mean_us",
        "stdev_us",
        "p50_us",
        "p90_us",
        "p95_us",
        "p99_us",
        "mismatches",
        "exceptions",
    ]
    breakdown_columns = [
        "target",
        "lifecycle",
        "gc",
        "workers",
        "family",
        "complexity",
        "expected",
        "count",
        "actual_accepted",
        "actual_rejected",
        "mean_us",
        "stdev_us",
        "p50_us",
        "p90_us",
        "p95_us",
        "p99_us",
        "ratio_to_first",
        "mismatches",
        "exceptions",
    ]
    if output_format == "markdown":
        output.write("# Symbolic-input parse benchmark\n\n")
        output.write("## Runtime conditions\n\n")
        output.write(_markdown_table(condition_rows, condition_columns) + "\n\n")
        output.write("## Corpus breakdown\n\n")
        output.write(_markdown_table(breakdown_rows, breakdown_columns) + "\n")
        return

    output.write("Runtime conditions\n")
    output.write(_markdown_table(condition_rows, condition_columns) + "\n\n")
    output.write("Corpus breakdown\n")
    output.write(_markdown_table(breakdown_rows, breakdown_columns) + "\n")


def comparison_schedule(block_count: int) -> list[str]:
    """Return mirrored ABBA blocks so both commits occupy every block position."""
    schedule: list[str] = []
    for block_index in range(block_count):
        schedule.extend(
            ("baseline", "candidate", "candidate", "baseline")
            if block_index % 2 == 0
            else ("candidate", "baseline", "baseline", "candidate")
        )
    return schedule


def _comparison_state_path(output_dir: Path) -> Path:
    return output_dir / "comparison.json"


def _write_comparison_state(output_dir: Path, state: dict[str, Any]) -> None:
    state_path = _comparison_state_path(output_dir)
    temporary_path = state_path.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
    os.replace(temporary_path, state_path)


def _load_comparison_state(output_dir: Path) -> dict[str, Any]:
    state_path = _comparison_state_path(output_dir)
    try:
        state = json.loads(state_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise BenchmarkError(f"Invalid comparison state: {state_path}") from exc
    if state.get("schema_version") != 1:
        raise BenchmarkError(
            f"Unsupported comparison schema: {state.get('schema_version')}"
        )
    return state


def _validate_comparison_duration(total_ns: int, round_ns: int) -> int:
    if round_ns <= 0:
        raise BenchmarkError("Round duration must be positive")
    block_ns = round_ns * 4
    block_count, remainder = divmod(total_ns, block_ns)
    if remainder or block_count == 0:
        raise BenchmarkError(
            "Comparison duration must be a positive multiple of four round durations"
        )
    return block_count


def _comparison_rounds(
    *,
    start_index: int,
    block_count: int,
    baseline_commit: str,
    candidate_commit: str,
) -> list[dict[str, Any]]:
    if start_index % 4:
        raise BenchmarkError("Comparison extensions must start on a block boundary")
    rounds: list[dict[str, Any]] = []
    start_block = start_index // 4
    schedule = comparison_schedule(start_block + block_count)[start_index:]
    for offset, role in enumerate(schedule):
        round_index = start_index + offset
        commit = baseline_commit if role == "baseline" else candidate_commit
        rounds.append({
            "index": round_index,
            "block": round_index // 4,
            "position": round_index % 4,
            "role": role,
            "commit": commit,
            "database": f"round-{round_index:04d}-{role}-{commit[:12]}.sqlite3",
            "status": "pending",
        })
    return rounds


def _new_comparison_state(args: argparse.Namespace, output_dir: Path) -> dict[str, Any]:
    missing = [
        option
        for option in ("baseline", "candidate", "duration")
        if getattr(args, option) is None
    ]
    if missing:
        raise BenchmarkError(
            "A new comparison requires: "
            + ", ".join(f"--{option.replace('_', '-')}" for option in missing)
        )
    if output_dir.exists() and any(output_dir.iterdir()):
        raise BenchmarkError(f"Comparison output directory is not empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    baseline_commit = resolve_commit(args.baseline)
    candidate_commit = resolve_commit(args.candidate)
    if baseline_commit == candidate_commit:
        raise BenchmarkError("Baseline and candidate resolve to the same commit")
    round_duration_ns = args.round_duration or parse_duration("5m")
    block_count = _validate_comparison_duration(args.duration, round_duration_ns)
    corpus = (args.corpus or DEFAULT_CORPUS).resolve()
    suite_name = args.suite or "comparison"
    if suite_name not in load_suites():
        raise BenchmarkError(f"Unknown suite: {suite_name}")
    state = {
        "schema_version": 1,
        "status": "ready",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "harness_commit": git_output("rev-parse", "HEAD"),
        "baseline_ref": args.baseline,
        "baseline_commit": baseline_commit,
        "candidate_ref": args.candidate,
        "candidate_commit": candidate_commit,
        "suite": suite_name,
        "order": args.order or "abba",
        "round_duration_ns": round_duration_ns,
        "total_duration_ns": args.duration,
        "corpus_path": os.fspath(corpus),
        "corpus_sha256": sha256_file(corpus),
        "labels": args.label,
        "rounds": _comparison_rounds(
            start_index=0,
            block_count=block_count,
            baseline_commit=baseline_commit,
            candidate_commit=candidate_commit,
        ),
    }
    _write_comparison_state(output_dir, state)
    return state


def _validate_comparison_arguments(
    args: argparse.Namespace, state: dict[str, Any]
) -> None:
    for option, state_key in (
        ("baseline", "baseline_commit"),
        ("candidate", "candidate_commit"),
    ):
        value = getattr(args, option)
        if value is not None and resolve_commit(value) != state[state_key]:
            raise BenchmarkError(f"--{option} does not match the existing comparison")
    if args.duration is not None and args.duration != state["total_duration_ns"]:
        raise BenchmarkError(
            "--duration does not match the existing comparison; use --extend"
        )
    if (
        args.round_duration is not None
        and args.round_duration != state["round_duration_ns"]
    ):
        raise BenchmarkError("--round-duration does not match the existing comparison")
    if args.suite is not None and args.suite != state["suite"]:
        raise BenchmarkError("--suite does not match the existing comparison")
    if args.order is not None and args.order != state["order"]:
        raise BenchmarkError("--order does not match the existing comparison")
    if args.corpus is not None:
        corpus = args.corpus.resolve()
        if sha256_file(corpus) != state["corpus_sha256"]:
            raise BenchmarkError("--corpus does not match the existing comparison")


def _extend_comparison(
    output_dir: Path,
    state: dict[str, Any],
    extension_ns: int,
) -> None:
    block_count = _validate_comparison_duration(
        extension_ns, state["round_duration_ns"]
    )
    state["rounds"].extend(
        _comparison_rounds(
            start_index=len(state["rounds"]),
            block_count=block_count,
            baseline_commit=state["baseline_commit"],
            candidate_commit=state["candidate_commit"],
        )
    )
    state["total_duration_ns"] += extension_ns
    state["status"] = "ready"
    state["updated_at"] = now_iso()
    _write_comparison_state(output_dir, state)


def _safe_load_average() -> list[float] | None:
    try:
        return list(os.getloadavg())
    except OSError:
        return None


def _database_status(path: Path) -> str:
    connection = connect_database(path)
    try:
        metadata = get_metadata(connection)
        validate_database(metadata)
        return metadata["status"]
    finally:
        connection.close()


def _comparison_group_totals(
    path: Path,
) -> dict[tuple[Any, ...], tuple[int, int, int, int]]:
    _metadata, measurements, _wall = load_measurements(path)
    groups: dict[tuple[Any, ...], list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for measurement in measurements:
        condition = measurement["condition"]
        keys = (
            ("overall", *condition, "all", "all", "all"),
            (
                "breakdown",
                *condition,
                measurement["family"],
                measurement["complexity"],
                measurement["expected"],
            ),
        )
        for key in keys:
            totals = groups[key]
            totals[0] += measurement["timing_ns"]
            totals[1] += 1
            totals[2] += measurement["outcome"] != measurement["expected"]
            totals[3] += measurement["outcome"] == "exception"
    return {
        key: (value[0], value[1], value[2], value[3]) for key, value in groups.items()
    }


def _geometric_mean(values: list[float]) -> float:
    return math.exp(statistics.fmean(math.log(value) for value in values))


def _bootstrap_ratio_interval(
    ratios: list[float],
    *,
    seed_key: tuple[Any, ...],
    samples: int = 2000,
) -> tuple[float, float]:
    if len(ratios) < 2:
        return ratios[0], ratios[0]
    seed_bytes = hashlib.sha256(repr(seed_key).encode()).digest()[:8]
    rng = random.Random(int.from_bytes(seed_bytes))
    estimates = [
        _geometric_mean([rng.choice(ratios) for _ in ratios]) for _ in range(samples)
    ]
    return quantile(estimates, 0.025), quantile(estimates, 0.975)


def comparison_report_rows(
    output_dir: Path, state: dict[str, Any]
) -> list[dict[str, Any]]:
    complete_rounds = {
        round_data["index"]: round_data
        for round_data in state["rounds"]
        if round_data["status"] == "complete"
    }
    complete_blocks = [
        block_index
        for block_index in range(len(state["rounds"]) // 4)
        if all(block_index * 4 + position in complete_rounds for position in range(4))
    ]
    block_groups: dict[tuple[Any, ...], list[tuple[float, float, float, int, int]]] = (
        defaultdict(list)
    )
    for block_index in complete_blocks:
        rounds = [complete_rounds[block_index * 4 + position] for position in range(4)]
        totals_by_role: dict[str, dict[tuple[Any, ...], list[int]]] = {
            "baseline": defaultdict(lambda: [0, 0, 0, 0]),
            "candidate": defaultdict(lambda: [0, 0, 0, 0]),
        }
        for round_data in rounds:
            round_groups = _comparison_group_totals(output_dir / round_data["database"])
            for key, totals in round_groups.items():
                combined = totals_by_role[round_data["role"]][key]
                for position, value in enumerate(totals):
                    combined[position] += value
        common_keys = (
            totals_by_role["baseline"].keys() & totals_by_role["candidate"].keys()
        )
        for key in common_keys:
            baseline = totals_by_role["baseline"][key]
            candidate = totals_by_role["candidate"][key]
            baseline_mean = baseline[0] / baseline[1]
            candidate_mean = candidate[0] / candidate[1]
            block_groups[key].append((
                baseline_mean,
                candidate_mean,
                candidate_mean / baseline_mean,
                baseline[2] + candidate[2],
                baseline[3] + candidate[3],
            ))

    rows: list[dict[str, Any]] = []
    for key, blocks in sorted(block_groups.items()):
        ratios = [block[2] for block in blocks]
        ratio = _geometric_mean(ratios)
        ci_low, ci_high = _bootstrap_ratio_interval(ratios, seed_key=key)
        rows.append({
            "scope": key[0],
            "lifecycle": key[1],
            "gc": key[2],
            "workers": key[3],
            "family": key[4],
            "complexity": key[5],
            "expected": key[6],
            "blocks": len(blocks),
            "baseline_mean_us": statistics.fmean(block[0] for block in blocks) / 1000,
            "candidate_mean_us": statistics.fmean(block[1] for block in blocks) / 1000,
            "ratio": ratio,
            "delta_percent": (ratio - 1) * 100,
            "ci_2_5": ci_low,
            "ci_97_5": ci_high,
            "mismatches": sum(block[3] for block in blocks),
            "exceptions": sum(block[4] for block in blocks),
        })
    return rows


def write_comparison_reports(output_dir: Path, state: dict[str, Any]) -> None:
    rows = comparison_report_rows(output_dir, state)
    if not rows:
        return
    columns = list(rows[0])
    markdown_path = output_dir / "comparison.md"
    markdown_path.write_text(
        "# Paired symbolic-input comparison\n\n"
        f"- Baseline: `{state['baseline_commit']}`\n"
        f"- Candidate: `{state['candidate_commit']}`\n"
        f"- Round duration: {format_duration(state['round_duration_ns'])}\n"
        f"- Completed blocks: {max(row['blocks'] for row in rows)}\n\n"
        + _markdown_table(rows, columns)
        + "\n"
    )
    with (output_dir / "comparison.csv").open(
        "w", encoding="utf-8", newline=""
    ) as output:
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def _comparison_progress(state: dict[str, Any]) -> str:
    complete = sum(round_data["status"] == "complete" for round_data in state["rounds"])
    return f"{complete}/{len(state['rounds'])} rounds complete"


def run_comparison(args: argparse.Namespace) -> None:
    output_dir = args.output_dir.resolve()
    state_path = _comparison_state_path(output_dir)
    if state_path.exists():
        state = _load_comparison_state(output_dir)
        _validate_comparison_arguments(args, state)
    else:
        state = _new_comparison_state(args, output_dir)
    if args.extend:
        _extend_comparison(output_dir, state, args.extend)

    corpus = Path(state["corpus_path"])
    if not corpus.is_file() or sha256_file(corpus) != state["corpus_sha256"]:
        raise BenchmarkError("Comparison corpus is unavailable or has changed")
    print(
        f"paired comparison: {state['baseline_commit'][:12]} vs "
        f"{state['candidate_commit'][:12]} ({_comparison_progress(state)})",
        flush=True,
    )
    state["status"] = "running"
    state["updated_at"] = now_iso()
    _write_comparison_state(output_dir, state)

    for round_data in state["rounds"]:
        if STOP_REQUESTED.is_set():
            break
        if round_data["status"] == "complete":
            continue
        database = output_dir / round_data["database"]
        round_data["status"] = "running"
        round_data["started_at"] = now_iso()
        round_data["load_average_start"] = _safe_load_average()
        state["updated_at"] = now_iso()
        _write_comparison_state(output_dir, state)
        print(
            f"round {round_data['index'] + 1}/{len(state['rounds'])}: "
            f"{round_data['role']} {round_data['commit'][:12]}",
            flush=True,
        )
        try:
            if database.exists():
                execute_database(database)
            else:
                initialize_run(
                    argparse.Namespace(
                        suite=state["suite"],
                        corpus=corpus,
                        commit=round_data["commit"],
                        duration=state["round_duration_ns"],
                        output=database,
                        label=[
                            *state["labels"],
                            f"comparison-round={round_data['index']}",
                            f"comparison-role={round_data['role']}",
                        ],
                    )
                )
            round_data["status"] = _database_status(database)
        except BaseException:
            round_data["status"] = "failed"
            round_data["finished_at"] = now_iso()
            round_data["load_average_end"] = _safe_load_average()
            state["status"] = "failed"
            state["updated_at"] = now_iso()
            _write_comparison_state(output_dir, state)
            raise
        round_data["finished_at"] = now_iso()
        round_data["load_average_end"] = _safe_load_average()
        state["updated_at"] = now_iso()
        _write_comparison_state(output_dir, state)
        if round_data["status"] != "complete":
            break
        if (round_data["index"] + 1) % 4 == 0:
            write_comparison_reports(output_dir, state)

    state["status"] = (
        "complete"
        if all(round_data["status"] == "complete" for round_data in state["rounds"])
        else "interrupted"
    )
    state["updated_at"] = now_iso()
    _write_comparison_state(output_dir, state)
    write_comparison_reports(output_dir, state)
    print(f"comparison {state['status']}: {_comparison_progress(state)}", flush=True)


def signal_handler(_signum: int, _frame: Any) -> None:
    if not STOP_REQUESTED.is_set():
        print("Stopping after the active batch...", file=sys.stderr, flush=True)
    STOP_REQUESTED.set()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Start a new benchmark run")
    run_parser.add_argument("--commit", required=True)
    run_parser.add_argument("--suite", choices=tuple(load_suites()), default="quick")
    run_parser.add_argument("--duration", type=parse_duration)
    run_parser.add_argument("--output", type=Path, required=True)
    run_parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    run_parser.add_argument("--label", action="append", default=[])

    resume_parser = subparsers.add_parser("resume", help="Resume a benchmark run")
    resume_parser.add_argument("database", type=Path)
    resume_parser.add_argument("--extend", type=parse_duration, default=0)

    status_parser = subparsers.add_parser("status", help="Show benchmark progress")
    status_parser.add_argument("database", type=Path)

    report_parser = subparsers.add_parser("report", help="Report benchmark results")
    report_parser.add_argument("databases", type=Path, nargs="+")
    report_parser.add_argument(
        "--format", choices=("text", "markdown", "csv"), default="text"
    )
    report_parser.add_argument("--output", type=Path)

    compare_parser = subparsers.add_parser(
        "compare", help="Run or resume a paired commit comparison"
    )
    compare_parser.add_argument("--baseline", help="Baseline Git ref for a new run")
    compare_parser.add_argument("--candidate", help="Candidate Git ref for a new run")
    compare_parser.add_argument(
        "--suite", choices=tuple(load_suites()), help="Defaults to comparison"
    )
    compare_parser.add_argument(
        "--duration",
        type=parse_duration,
        help="Total active time across both commits",
    )
    compare_parser.add_argument(
        "--round-duration",
        type=parse_duration,
        help="Active time per round; defaults to 5m",
    )
    compare_parser.add_argument(
        "--order", choices=("abba",), help="Mirrored ABBA/BAAB block order"
    )
    compare_parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="State, round DB, and report directory",
    )
    compare_parser.add_argument(
        "--corpus", type=Path, help="Defaults to the bundled corpus"
    )
    compare_parser.add_argument("--label", action="append", default=[])
    compare_parser.add_argument(
        "--extend",
        type=parse_duration,
        default=0,
        help="Append complete four-round blocks to an existing run",
    )
    return parser


def main() -> int:
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    args = build_parser().parse_args()
    try:
        if args.command == "run":
            initialize_run(args)
        elif args.command == "resume":
            if args.extend:
                extend_run(args.database.resolve(), args.extend)
            execute_database(args.database.resolve())
        elif args.command == "status":
            show_status(args.database.resolve())
        elif args.command == "report":
            if args.output is None:
                render_report(args.databases, args.format, sys.stdout)
            else:
                with args.output.open("w", encoding="utf-8", newline="") as output:
                    render_report(args.databases, args.format, output)
        elif args.command == "compare":
            run_comparison(args)
        else:
            raise AssertionError(args.command)
    except BenchmarkError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

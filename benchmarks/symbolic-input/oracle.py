"""Record each corpus case's parse() outcome on a pinned commit."""

from __future__ import annotations

from typing import TYPE_CHECKING, NamedTuple

import benchmark

if TYPE_CHECKING:
    from pathlib import Path

CACHE_ROOT = benchmark.REPO_ROOT / ".cache/symbolic-input-benchmark"


class Outcome(NamedTuple):
    status: str
    """One of "accepted", "rejected", or "exception"."""
    detail: str
    """The stored answer's SHA-256 if accepted, otherwise the error text."""


def corpus_outcomes(commit: str, corpus: Path) -> list[Outcome]:
    """Run every case in `corpus` once through `commit`'s parse(), in order."""
    checkout = benchmark.prepare_worktree(benchmark.resolve_commit(commit), CACHE_ROOT)
    client = benchmark.WorkerClient(
        checkout, corpus, CACHE_ROOT / "logs" / "oracle", worker_number=0
    )
    try:
        client.send_batch(
            list(range(client.metadata["case_count"])), gc_mode="normal", record=True
        )
        result = client.receive_batch()
    finally:
        client.close()
    return [
        Outcome(benchmark.OUTCOMES[outcome], detail)
        for outcome, detail in zip(result["outcomes"], result["details"], strict=True)
    ]

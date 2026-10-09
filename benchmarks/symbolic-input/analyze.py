#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Analyze paired symbolic-input comparisons and runtime overhead with figures."""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from benchmark import load_measurements, load_suites, parse_duration

SURFACE = "#fcfcfb"
TEXT_PRIMARY = "#0b0b0b"
TEXT_SECONDARY = "#52514e"
GRID = "#e6e5e1"
AXIS = "#9b9a95"
MUTED = "#b3b1aa"
ACCENT = "#2a78d6"
REFERENCE = "#52514e"

SIZE_ORDER = {"small": 0, "medium": 1, "large": 2}
BOOTSTRAP_SAMPLES = 2000
EN_DASH = "\u2013"
TIMES = "\u00d7"
MICRO = "\u00b5"


def _style() -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "axes.edgecolor": AXIS,
        "axes.labelcolor": TEXT_SECONDARY,
        "axes.titlecolor": TEXT_PRIMARY,
        "axes.titlesize": 13,
        "axes.titleweight": "bold",
        "axes.titlelocation": "left",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "xtick.color": TEXT_SECONDARY,
        "ytick.color": TEXT_SECONDARY,
        "font.size": 9.5,
        "savefig.dpi": 200,
        "savefig.bbox": "tight",
        "savefig.facecolor": SURFACE,
    })


def geometric_mean(values: np.ndarray) -> float:
    return float(np.exp(np.log(values).mean()))


def bootstrap_interval(ratios: np.ndarray, seed: int = 15970) -> tuple[float, float]:
    if ratios.size < 2:
        return float(ratios[0]), float(ratios[0])
    rng = np.random.default_rng(seed)
    samples = rng.choice(ratios, size=(BOOTSTRAP_SAMPLES, ratios.size))
    estimates = np.exp(np.log(samples).mean(axis=1))
    low, high = np.quantile(estimates, [0.025, 0.975])
    return float(low), float(high)


def load_round(path: Path) -> dict[str, Any]:
    _metadata, measurements, _wall = load_measurements(path)
    timings = np.fromiter((m["timing_ns"] for m in measurements), dtype=np.int64)
    totals: dict[tuple[Any, ...], list[int]] = defaultdict(lambda: [0, 0])
    for measurement, timing in zip(measurements, timings.tolist(), strict=True):
        condition = measurement["condition"]
        cell = (
            measurement["family"],
            measurement["complexity"],
            measurement["expected"],
        )
        for key in ((*condition, *cell), (*condition, "all", "all", "all")):
            totals[key][0] += timing
            totals[key][1] += 1
    return {
        "timings": timings,
        "cells": {key: (value[0], value[1]) for key, value in totals.items()},
        "mismatches": sum(m["outcome"] != m["expected"] for m in measurements),
        "exceptions": sum(m["outcome"] == "exception" for m in measurements),
    }


def analyze_comparison(comparison_dir: Path) -> dict[str, Any]:
    state = json.loads((comparison_dir / "comparison.json").read_text())
    complete = [r for r in state["rounds"] if r["status"] == "complete"]
    block_ids = sorted({r["block"] for r in complete})
    blocks = [
        [r for r in complete if r["block"] == block]
        for block in block_ids
        if sum(r["block"] == block for r in complete) == 4
    ]

    rounds: list[dict[str, Any]] = []
    loaded: dict[int, dict[str, Any]] = {}
    for round_data in [r for block in blocks for r in block]:
        data = load_round(comparison_dir / round_data["database"])
        loaded[round_data["index"]] = data
        timings = data["timings"]
        rounds.append({
            "index": round_data["index"],
            "block": round_data["block"],
            "role": round_data["role"],
            "started_at": round_data["started_at"],
            "invocations": int(timings.size),
            "mean_us": float(timings.mean() / 1000),
            "p50_us": float(np.quantile(timings, 0.5) / 1000),
            "p99_us": float(np.quantile(timings, 0.99) / 1000),
        })

    def block_ratio(block: list[dict[str, Any]], key: tuple[Any, ...]) -> float:
        sums: dict[str, list[int]] = {"baseline": [0, 0], "candidate": [0, 0]}
        for round_data in block:
            data = loaded[round_data["index"]]
            total, count = data["cells"][key]
            sums[round_data["role"]][0] += total
            sums[round_data["role"]][1] += count
        baseline = sums["baseline"][0] / sums["baseline"][1]
        candidate = sums["candidate"][0] / sums["candidate"][1]
        return candidate / baseline

    def summarize_ratios(ratios: np.ndarray) -> dict[str, Any]:
        low, high = bootstrap_interval(ratios)
        ratio = geometric_mean(ratios)
        return {
            "block_ratios": ratios.round(4).tolist(),
            "ratio": ratio,
            "delta_percent": (ratio - 1) * 100,
            "ci_low_percent": (low - 1) * 100,
            "ci_high_percent": (high - 1) * 100,
        }

    # Ratios are only comparable within one runtime condition, so every key
    # starts with (lifecycle, gc, workers).
    keys = sorted(
        {key for data in loaded.values() for key in data["cells"]},
        key=lambda k: (k[0], k[1], k[2], k[3], SIZE_ORDER.get(k[4], -1), k[5]),
    )
    rows = [
        {
            "lifecycle": key[0],
            "gc": key[1],
            "workers": key[2],
            "family": key[3],
            "complexity": key[4],
            "expected": key[5],
            **summarize_ratios(np.array([block_ratio(block, key) for block in blocks])),
        }
        for key in keys
    ]
    conditions = [r for r in rows if r["family"] == "all"]
    cells = [r for r in rows if r["family"] != "all"]

    means = {
        role: np.array([r["mean_us"] for r in rounds if r["role"] == role])
        for role in ("baseline", "candidate")
    }
    invocations = {
        role: sum(r["invocations"] for r in rounds if r["role"] == role)
        for role in ("baseline", "candidate")
    }
    return {
        "baseline_commit": state["baseline_commit"],
        "candidate_commit": state["candidate_commit"],
        "suite": state["suite"],
        "complete_blocks": len(blocks),
        "conditions": conditions,
        "cells": cells,
        "rounds": rounds,
        "round_mean_cv": {
            role: float(values.std() / values.mean()) for role, values in means.items()
        },
        "invocations": invocations,
        "throughput_ratio": (invocations["candidate"] / invocations["baseline"]),
        "mismatches": sum(data["mismatches"] for data in loaded.values()),
        "exceptions": sum(data["exceptions"] for data in loaded.values()),
    }


def analyze_runtime(database: Path) -> dict[str, Any]:
    """Attribute wall-clock time to conditions from batch commit timestamps.

    Active time excludes worker startup, so the gap between a condition's
    epochs and its recorded active time is the overhead a run must budget for.

    Returns:
        Per-condition and whole-run wall time, active time, and overhead factor.
    """
    connection = sqlite3.connect(database)
    try:
        created_at = json.loads(
            connection.execute(
                "SELECT value FROM metadata WHERE key = 'created_at'"
            ).fetchone()[0]
        )
        conditions = {
            row[0]: {"lifecycle": row[1], "gc": row[2], "workers": row[3]}
            for row in connection.execute(
                "SELECT id, lifecycle, gc_mode, workers FROM conditions"
            )
        }
        batches = connection.execute(
            "SELECT condition_id, created_at, wall_ns FROM batches ORDER BY created_at"
        ).fetchall()
    finally:
        connection.close()

    wall = defaultdict(float)
    active = defaultdict(float)
    batch_counts = defaultdict(int)
    previous = datetime.fromisoformat(created_at)
    for condition_id, timestamp, wall_ns in batches:
        moment = datetime.fromisoformat(timestamp)
        wall[condition_id] += (moment - previous).total_seconds()
        active[condition_id] += wall_ns / 1e9
        batch_counts[condition_id] += 1
        previous = moment

    rows = [
        {
            **condition,
            "wall_s": wall[condition_id],
            "active_s": active[condition_id],
            "overhead_factor": wall[condition_id] / active[condition_id],
            "startup_s_per_batch": (wall[condition_id] - active[condition_id])
            / batch_counts[condition_id],
        }
        for condition_id, condition in sorted(conditions.items())
        if batch_counts[condition_id]
    ]
    total_wall = sum(wall.values())
    total_active = sum(active.values())
    return {
        "database": str(database),
        "conditions": rows,
        "wall_s": total_wall,
        "active_s": total_active,
        "overhead_factor": total_wall / total_active,
    }


def plan_run(
    suite_name: str, duration_ns: int, round_ns: int, overhead_factor: float
) -> dict[str, Any]:
    suite = load_suites()[suite_name]
    condition_count = len(suite.lifecycles) * len(suite.gc_modes) * len(suite.workers)
    rounds = duration_ns // round_ns
    return {
        "suite": suite_name,
        "blocks": rounds // 4,
        "rounds": rounds,
        "active_s_per_condition_per_round": round_ns / 1e9 / condition_count,
        "active_s_per_condition_per_commit": round_ns
        / 1e9
        / condition_count
        * rounds
        / 2,
        "overhead_factor": overhead_factor,
        "expected_wall_h": duration_ns / 1e9 * overhead_factor / 3600,
    }


def condition_label(row: dict[str, Any]) -> str:
    workers = f"{row['workers']} worker{'s' if row['workers'] > 1 else ''}"
    return f"{row['lifecycle']}, GC {row['gc']}, {workers}"


def condition_slug(row: dict[str, Any]) -> str:
    return f"{row['lifecycle']}-gc-{row['gc']}-{row['workers']}w"


def same_condition(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return all(a[field] == b[field] for field in ("lifecycle", "gc", "workers"))


def plot_cell_changes(
    comparison: dict[str, Any], condition: dict[str, Any], path: Path
) -> None:
    cells = [c for c in comparison["cells"] if same_condition(c, condition)]
    accepted = [c for c in cells if c["expected"] == "accepted"]
    rejected = {
        (c["family"], c["complexity"]): c for c in cells if c["expected"] == "rejected"
    }
    y = np.arange(len(accepted))[::-1]
    accepted_delta = np.array([c["delta_percent"] for c in accepted])
    rejected_delta = np.array([
        rejected[c["family"], c["complexity"]]["delta_percent"] for c in accepted
    ])
    overall = condition["delta_percent"]

    fig, ax = plt.subplots(figsize=(7.6, 0.24 * len(accepted) + 1.6))
    ax.hlines(y, accepted_delta, rejected_delta, color=GRID, linewidth=2, zorder=1)
    ax.scatter(
        accepted_delta,
        y,
        s=40,
        color=ACCENT,
        edgecolor=SURFACE,
        linewidth=1.5,
        zorder=3,
        label="Accepted answers",
    )
    ax.scatter(
        rejected_delta,
        y,
        s=34,
        color=MUTED,
        edgecolor=SURFACE,
        linewidth=1.5,
        zorder=3,
        label="Rejected answers",
    )
    ax.axvline(0, color=AXIS, linewidth=1, zorder=0)
    ax.axvline(overall, color=REFERENCE, linewidth=1, linestyle=(0, (3, 3)), zorder=2)
    ax.text(
        overall + 0.6,
        y.max() + 0.9,
        f"All cases {overall:.1f}%",
        color=TEXT_SECONDARY,
        ha="left",
        va="bottom",
    )

    labels = []
    previous_family = None
    for cell in accepted:
        family = cell["family"] if cell["family"] != previous_family else ""
        labels.append(
            f"{family}  {cell['complexity']}".strip() if family else cell["complexity"]
        )
        previous_family = cell["family"]
    ax.set_yticks(y, labels)
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.set_xlim(-46, 4)
    ax.set_ylim(-0.8, y.max() + 1.8)
    ax.xaxis.set_major_formatter(lambda value, _pos: f"{value:.0f}%")
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_xlabel(
        f"Change in mean parse latency vs baseline (left is faster); "
        f"{condition_label(condition)}"
    )
    accepted_range = (-accepted_delta.max(), -accepted_delta.min())
    rejected_range = (-rejected_delta.max(), -rejected_delta.min())
    ax.set_title(
        f"Accepted answers parse {accepted_range[0]:.0f}{EN_DASH}{accepted_range[1]:.0f}% faster; "
        f"rejected answers {rejected_range[0]:.0f}{EN_DASH}{rejected_range[1]:.0f}% faster",
        pad=24,
    )
    ax.legend(
        loc="upper left",
        bbox_to_anchor=(0, 1.06),
        ncol=2,
        frameon=False,
        borderaxespad=0,
        handletextpad=0.3,
    )
    fig.savefig(path)
    plt.close(fig)


def plot_condition_changes(comparison: dict[str, Any], path: Path) -> None:
    rows = sorted(
        comparison["conditions"],
        key=lambda r: (r["lifecycle"] != "warm", r["gc"], r["workers"]),
    )
    y = np.arange(len(rows))[::-1]
    deltas = np.array([r["delta_percent"] for r in rows])
    errors = np.array([
        [r["delta_percent"] - r["ci_low_percent"] for r in rows],
        [r["ci_high_percent"] - r["delta_percent"] for r in rows],
    ])

    fig, ax = plt.subplots(figsize=(7.6, 0.32 * len(rows) + 1.4))
    ax.errorbar(
        deltas, y, xerr=errors, fmt="none", ecolor=MUTED, elinewidth=1.5, capsize=3
    )
    ax.scatter(
        deltas, y, s=40, color=ACCENT, edgecolor=SURFACE, linewidth=1.5, zorder=3
    )
    for position, delta in zip(y, deltas, strict=True):
        ax.text(
            delta, position + 0.28, f"{delta:.1f}%", ha="center", color=TEXT_PRIMARY
        )
    ax.axvline(0, color=AXIS, linewidth=1, zorder=0)
    ax.set_yticks(y, [condition_label(r) for r in rows])
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.set_xlim(min(deltas.min() * 1.25, -5), 2)
    ax.xaxis.set_major_formatter(lambda value, _pos: f"{value:.0f}%")
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_xlabel("Change in mean parse latency vs baseline, 95% bootstrap interval")
    ax.set_title(
        f"Mean latency changes from {deltas.min():+.1f}% to {deltas.max():+.1f}% "
        f"across runtime conditions"
    )
    fig.savefig(path)
    plt.close(fig)


def plot_round_means(comparison: dict[str, Any], path: Path) -> None:
    rounds = comparison["rounds"]
    fig, ax = plt.subplots(figsize=(7.6, 3.2))
    for role, color, label in (
        ("baseline", MUTED, "Baseline"),
        ("candidate", ACCENT, "Candidate"),
    ):
        points = [r for r in rounds if r["role"] == role]
        ax.scatter(
            [r["index"] for r in points],
            [r["mean_us"] for r in points],
            s=48,
            color=color,
            edgecolor=SURFACE,
            linewidth=1.5,
            zorder=3,
        )
        last = points[-1]
        ax.text(
            last["index"] + 0.35,
            last["mean_us"],
            label,
            color=TEXT_SECONDARY,
            va="center",
        )
    for block in range(1, comparison["complete_blocks"]):
        ax.axvline(block * 4 - 0.5, color=GRID, linewidth=1, zorder=0)
    ax.set_ylim(0, max(r["mean_us"] for r in rounds) * 1.15)
    ax.set_xlim(-0.6, len(rounds) + 1.2)
    ax.set_xticks(range(len(rounds)))
    ax.set_xlabel("Round (5-minute rounds, ABBA/BAAB blocks separated by lines)")
    ax.set_ylabel(f"Mean latency ({MICRO}s)")
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    cv = comparison["round_mean_cv"]
    ax.set_title(
        f"Round means hold steady: {cv['baseline'] * 100:.1f}% variation baseline, "
        f"{cv['candidate'] * 100:.1f}% candidate"
    )
    fig.savefig(path)
    plt.close(fig)


def plot_runtime_overhead(runtime: dict[str, Any], path: Path) -> None:
    rows = sorted(
        runtime["conditions"],
        key=lambda r: (r["lifecycle"] != "warm", r["gc"], r["workers"]),
    )
    labels = [
        f"{r['lifecycle']}, GC {r['gc']}, {r['workers']} worker{'s' if r['workers'] > 1 else ''}"
        for r in rows
    ]
    factors = np.array([r["overhead_factor"] for r in rows])
    colors = [ACCENT if r["lifecycle"] == "fresh" else MUTED for r in rows]
    y = np.arange(len(rows))[::-1]

    fig, ax = plt.subplots(figsize=(7.6, 0.32 * len(rows) + 1.4))
    ax.barh(y, factors, height=0.62, color=colors, edgecolor=SURFACE, linewidth=2)
    for position, factor in zip(y, factors, strict=True):
        ax.text(
            factor + 0.15,
            position,
            f"{factor:.2f}{TIMES}" if factor < 2 else f"{factor:.1f}{TIMES}",
            va="center",
            color=TEXT_PRIMARY,
            bbox={"facecolor": SURFACE, "edgecolor": "none", "pad": 1},
            zorder=4,
        )
    ax.axvline(
        runtime["overhead_factor"],
        color=REFERENCE,
        linewidth=1,
        linestyle=(0, (3, 3)),
        zorder=1,
    )
    ax.text(
        runtime["overhead_factor"] + 0.15,
        y.max() + 0.75,
        f"Whole suite {runtime['overhead_factor']:.2f}{TIMES}",
        color=TEXT_SECONDARY,
        va="bottom",
    )
    ax.set_yticks(y, labels)
    ax.tick_params(axis="y", length=0)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    ax.spines["left"].set_color(AXIS)
    ax.set_ylim(-0.7, y.max() + 1.6)
    ax.set_xlim(0, factors.max() * 1.12)
    fresh = factors[[r["lifecycle"] == "fresh" for r in rows]]
    warm = factors[[r["lifecycle"] == "warm" for r in rows]]
    ax.set_title(
        f"Fresh workers take {fresh.min():.1f}{EN_DASH}{fresh.max():.1f}{TIMES} their active time in wall clock; "
        f"warm {warm.min():.2f}{EN_DASH}{warm.max():.2f}{TIMES}"
    )
    fig.savefig(path)
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--comparison-dir", type=Path, required=True, help="A compare --output-dir"
    )
    parser.add_argument(
        "--runtime-db", type=Path, help="A round database to measure startup overhead"
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--plan-suite", default="standard")
    parser.add_argument(
        "--plan-duration", type=parse_duration, help="Planned compare --duration"
    )
    parser.add_argument(
        "--plan-round-duration",
        type=parse_duration,
        help="Planned compare --round-duration",
    )
    args = parser.parse_args()

    _style()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    comparison = analyze_comparison(args.comparison_dir)
    for condition in comparison["conditions"]:
        plot_cell_changes(
            comparison,
            condition,
            args.output_dir / f"latency-change-by-cell-{condition_slug(condition)}.png",
        )
    if len(comparison["conditions"]) > 1:
        plot_condition_changes(
            comparison, args.output_dir / "latency-change-by-condition.png"
        )
    plot_round_means(comparison, args.output_dir / "round-means.png")
    result: dict[str, Any] = {"comparison": comparison}

    if args.runtime_db:
        runtime = analyze_runtime(args.runtime_db)
        plot_runtime_overhead(runtime, args.output_dir / "runtime-overhead.png")
        result["runtime"] = runtime
        if args.plan_duration and args.plan_round_duration:
            result["plan"] = plan_run(
                args.plan_suite,
                args.plan_duration,
                args.plan_round_duration,
                runtime["overhead_factor"],
            )

    (args.output_dir / "analysis.json").write_text(json.dumps(result, indent=2) + "\n")
    print(
        f"{comparison['complete_blocks']} complete blocks; "
        f"{comparison['mismatches']} mismatches, {comparison['exceptions']} exceptions"
    )
    for condition in comparison["conditions"]:
        print(
            f"{condition_label(condition)}: {condition['delta_percent']:+.1f}% "
            f"[{condition['ci_low_percent']:+.1f}%, {condition['ci_high_percent']:+.1f}%]"
        )
    if "runtime" in result:
        print(
            f"Runtime overhead: {result['runtime']['overhead_factor']:.2f}{TIMES} wall/active"
        )
    if "plan" in result:
        plan = result["plan"]
        print(
            f"Plan: {plan['blocks']} blocks, {plan['rounds']} rounds, "
            f"{plan['active_s_per_condition_per_round']:.0f}s per condition per round, "
            f"~{plan['expected_wall_h']:.2f}h wall"
        )
    print(f"Wrote {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

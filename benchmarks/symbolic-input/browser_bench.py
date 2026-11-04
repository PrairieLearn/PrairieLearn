#!/usr/bin/env python3
# ruff: file-ignore[undocumented-public-function]
"""Measure the browser-side cost of #14839's formula editor.

Uses the Compute Engine corpus's formula-editor cases and compares the
baseline's and candidate's elements in headless Chromium (`browser_bench.mjs`):

- the `input` handler, which runs on every edit; the candidate's also parses
  the LaTeX with Compute Engine;
- the `blur` handler, which only the candidate registers;
- the first field's initialization on a fresh page, which includes building the
  candidate's Compute Engine syntax;
- script evaluation during page load, and script sizes.

Each runs at every requested CPU throttling rate.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any

import benchmark
import generate_ce_corpus
import oracle
import worker

BROWSER_SCRIPT = benchmark.BENCHMARK_DIR / "browser_bench.mjs"
DEFAULT_OUTPUT_DIR = oracle.CACHE_ROOT / "mathjson-14839" / "browser"


def source_cases() -> list[dict[str, Any]]:
    return [
        {
            "id": row["source_id"],
            "submission": row["source_submission"],
            "editor_latex": row["editor_latex"],
            "element_attributes": row["element_attributes"],
            "correct_answers": row["correct_answers"],
            "family": row["family"],
            "complexity": row["complexity"],
            "status": row["candidate_status"],
        }
        for row in worker.load_cases(generate_ce_corpus.DEFAULT_OUTPUT)
        if row["payload_mode"] == "compute-engine"
    ]


def quantile(values: list[float], fraction: float) -> float:
    return statistics.quantiles(values, n=100, method="inclusive")[
        round(fraction * 100) - 1
    ]


def summarize(values: list[float]) -> dict[str, float]:
    return {
        "count": len(values),
        "median": statistics.median(values),
        "p95": quantile(values, 0.95),
        "max": max(values),
    }


def summarize_run(raw: dict[str, Any], cases: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {case["id"]: case for case in cases}
    handlers: dict[tuple[int, str], dict[str, dict[str, float]]] = defaultdict(dict)
    for item in raw["handlers"]:
        handlers[item["rate"], item["id"]][item["target"]] = item

    summary: dict[str, Any] = {"handlers": {}, "load": {}, "sizes": raw["sizes"]}
    for rate in sorted({rate for rate, _ in handlers}):
        groups: dict[str, dict[str, list[float]]] = defaultdict(
            lambda: defaultdict(list)
        )
        for (item_rate, case_id), sides in handlers.items():
            if item_rate != rate:
                continue
            case = by_id[case_id]
            for group in ("all", case["complexity"], case["status"]):
                bucket = groups[group]
                for target, item in sides.items():
                    bucket[f"{target}_input_ms"].append(item["inputMs"])
                    bucket[f"{target}_blur_ms"].append(item["blurMs"])
                bucket["added_input_ms"].append(
                    sides["candidate"]["inputMs"] - sides["baseline"]["inputMs"]
                )
        summary["handlers"][f"{rate}x"] = {
            group: {name: summarize(values) for name, values in metrics.items()}
            for group, metrics in groups.items()
        }

    load: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for item in raw["load"]:
        key = f"{item['rate']}x {item['target']}"
        for metric in ("scriptDurationMs", "taskDurationMs", "firstFieldMs"):
            load[key][metric].append(item[metric])
        load[key]["jsHeapUsedMB"].append(item["jsHeapUsedBytes"] / 1e6)
    summary["load"] = {
        key: {
            metric: {
                "median": statistics.median(values),
                "min": min(values),
                "max": max(values),
            }
            for metric, values in metrics.items()
        }
        for key, metrics in load.items()
    }
    return summary


def render_markdown(summary: dict[str, Any], environment: dict[str, Any]) -> str:
    lines = [
        "# #14839 browser cost",
        "",
        (
            f"Chromium {environment['browser']}, Compute Engine "
            f"{environment['versions']['computeEngine']}, MathLive "
            f"{environment['versions']['mathlive']}; "
            f"{environment['dispatches']} dispatches per case."
        ),
        "",
        "## Handlers (per event, ms)",
        "",
        (
            "| CPU | cases | baseline input p50 / p95 | candidate input p50 / p95 "
            "| added input p50 / p95 | candidate blur p50 / p95 |"
        ),
        "|---|---|---|---|---|---|",
    ]
    for rate, groups in summary["handlers"].items():
        for group, metrics in groups.items():
            cells = [
                f"{metrics[name]['median']:.3f} / {metrics[name]['p95']:.3f}"
                for name in (
                    "baseline_input_ms",
                    "candidate_input_ms",
                    "added_input_ms",
                    "candidate_blur_ms",
                )
            ]
            lines.append(f"| {rate} | {group} | {' | '.join(cells)} |")
    lines += [
        "",
        "## Page load (median, min to max)",
        "",
        "| CPU and target | script ms | task ms | first field ms | JS heap MB |",
        "|---|---|---|---|---|",
    ]
    for key, metrics in sorted(summary["load"].items()):
        cells = [
            f"{metrics[name]['median']:.1f} ({metrics[name]['min']:.1f} to "
            f"{metrics[name]['max']:.1f})"
            for name in (
                "scriptDurationMs",
                "taskDurationMs",
                "firstFieldMs",
                "jsHeapUsedMB",
            )
        ]
        lines.append(f"| {key} | {' | '.join(cells)} |")
    lines += [
        "",
        "## Scripts",
        "",
        "| target | script | bytes | gzip -9 |",
        "|---|---|---:|---:|",
    ]
    for target, scripts in summary["sizes"].items():
        for script in scripts:
            lines.append(
                f"| {target} | `{script['script']}` | {script['bytes']:,} | "
                f"{script['gzipBytes']:,} |"
            )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--dispatches", type=int, default=20)
    parser.add_argument("--load-samples", type=int, default=30)
    parser.add_argument("--throttle", type=int, action="append", default=None)
    parser.add_argument("--limit", type=int, help="Use only the first N cases")
    args = parser.parse_args()

    cases = source_cases()[: args.limit]
    checkouts = {
        "baseline": benchmark.prepare_worktree(
            generate_ce_corpus.BASELINE_COMMIT, oracle.CACHE_ROOT
        ),
        "candidate": benchmark.prepare_worktree(
            generate_ce_corpus.CANDIDATE_COMMIT, oracle.CACHE_ROOT
        ),
    }
    with tempfile.TemporaryDirectory() as temporary:
        corpus = Path(temporary) / "cases.jsonl"
        corpus.write_text("".join(json.dumps(case) + "\n" for case in cases))
        html = {
            target: generate_ce_corpus.render_questions(checkout, corpus)
            for target, checkout in checkouts.items()
        }
    request = {
        "targets": {
            target: {
                "elementDir": os.fspath(
                    checkout / "apps/prairielearn/elements/pl-symbolic-input"
                )
            }
            for target, checkout in checkouts.items()
        },
        "cases": [
            {
                "id": case["id"],
                "html": {target: html[target][case["id"]] for target in checkouts},
            }
            for case in cases
        ],
        "dispatches": args.dispatches,
        "loadSamples": args.load_samples,
        "throttles": args.throttle or [1, 4],
    }
    result = subprocess.run(
        [
            "node",
            os.fspath(BROWSER_SCRIPT),
            "--node-root",
            os.fspath(generate_ce_corpus._main_checkout()),
            "--expect-compute-engine",
            generate_ce_corpus.COMPUTE_ENGINE_VERSION,
            "--expect-mathlive",
            generate_ce_corpus.MATHLIVE_VERSION,
        ],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Browser benchmark failed:\n{result.stderr}")
    raw = json.loads(result.stdout)
    summary = summarize_run(raw, cases)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "browser-raw.json").write_text(json.dumps(raw) + "\n")
    (args.output_dir / "browser.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n"
    )
    (args.output_dir / "browser.md").write_text(render_markdown(summary, raw))
    print(args.output_dir / "browser.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

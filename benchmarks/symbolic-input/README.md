# Symbolic-input parse benchmark

> [!CAUTION]
> This directory and its branch are benchmark-only infrastructure. They are not
> intended to be merged into `master` or shipped with PrairieLearn.

This suite measures the production `pl-symbolic-input.parse()` boundary against
an exact Git commit. It excludes corpus loading, worktree/environment setup,
question-data construction, and reporting from per-call timings. It includes
element/config parsing, normalization, SymPy parsing, validation, serialization,
and mutation of the submitted answer.

The committed corpus contains 6,144 deterministic randomized cases and 128
fixed edge cases. Cases cover scalar, function, complex, custom-function, set,
plain-input, formula-editor, simplified, unsimplified, accepted, and rejected
paths at three complexity levels. The runner records behavior changes without
treating them as timing failures.

## Run

Run commands from the repository root:

```sh
uv run python benchmarks/symbolic-input/benchmark.py run \
  --commit fbdb0757c \
  --suite soak \
  --duration 8h \
  --label s2 \
  --output .cache/symbolic-input-benchmark/s2.sqlite3
```

The target ref is resolved to an immutable SHA before the run starts. The suite
creates a detached cached worktree and invokes the worker with that commit's
locked Python environment. Setup may therefore download dependencies. A target
commit executes repository Python code locally; only benchmark commits you
trust.

The named suites are:

- `quick`: one corpus pass with one warm worker and normal GC;
- `standard`: a 15-minute default across the full runtime matrix;
- `soak`: an eight-hour default across the full runtime matrix.

`standard` and `soak` cover warm and fresh-per-batch workers, normal and
disabled-during-batch GC, and 1, 2, and 4 worker processes. `--duration`
overrides the suite default and is distributed evenly across conditions.

Interrupt with `Ctrl-C` or `SIGTERM`. The controller finishes or discards only
the active batch; every earlier batch is already committed atomically.

## Resume and inspect

```sh
uv run python benchmarks/symbolic-input/benchmark.py status \
  .cache/symbolic-input-benchmark/s2.sqlite3

uv run python benchmarks/symbolic-input/benchmark.py resume \
  .cache/symbolic-input-benchmark/s2.sqlite3

uv run python benchmarks/symbolic-input/benchmark.py resume \
  .cache/symbolic-input-benchmark/s2.sqlite3 --extend 2h
```

SQLite is used in WAL mode. The database stores the target SHA, suite and corpus
hashes, environment metadata, condition progress, outcome details, and
compressed per-invocation nanosecond timings. Paused time and dependency setup
do not count toward the requested active duration.

## Compare commits

Run the same suite and duration into one database per commit. Put the baseline
database first when reporting so ratios are candidate/baseline:

```sh
uv run python benchmarks/symbolic-input/benchmark.py report \
  .cache/symbolic-input-benchmark/pre-s2.sqlite3 \
  .cache/symbolic-input-benchmark/s2.sqlite3 \
  --format markdown \
  --output .cache/symbolic-input-benchmark/comparison.md
```

Reports include wall-clock throughput by runtime condition and mean, standard
deviation, p50, p90, p95, and p99 latency by expression family, complexity,
and expected validity. They also show acceptance changes and exceptions. The
suite intentionally has no timing pass/fail threshold.

## Regenerate the corpus

The generator uses `random.Random(15970)` and validates every case with the S2
oracle before writing it:

```sh
uv run python benchmarks/symbolic-input/generate_corpus.py
uv run python benchmarks/symbolic-input/generate_corpus.py --check
```

`--check` regenerates in memory and requires byte-for-byte corpus and manifest
equality. Do not regenerate the corpus when comparing existing result databases;
the runner rejects a corpus hash mismatch.

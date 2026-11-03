# Question title sync: implementation and benchmark

Implemented on November 3, 2026, on top of `c10897236` with the uncommitted title-sync changes.

## Behavior

The web editor selects a targeted operation only when a successful sync baseline matches the current revision, sync version, and chunk-generation mode. It verifies that the actual Git diff changes exactly one existing question file and contains no tracked symlinks. For `info.json`, it loads the JSON with the existing loader, validates the title with the question schema, and compares all remaining raw fields against the baseline commit. Unchanged fields already passed full sync at that baseline.

A verified title-only edit updates only `questions.title`, republishes the question chunk when enabled, and records a new baseline after successful completion. It preserves existing metadata diagnostics. Changes to other fields or files, invalid JSON/title values, QID changes, and push recovery use full sync. No migration or new sync version is required: no previously valid metadata needs reprocessing.

The settings form uses `MultiEditor` (a file edit plus a no-op QID rename). Its children propose a single question scope, while the final diff check prevents an unsupported sibling operation from being ignored. The title-only `QuestionRenameEditor` action and title-only edits through the file editor use the same verification.

The existing `sync_questions` stored procedure reconciles the whole question collection, including deleted questions, so it must not be called with a one-question subset. The new table-owned model query updates only the verified title instead.

## Method

Both comparisons use a synthetic course with 500 questions and 25 assessments, three warm-ups per mode, and 20 measured saves per mode. Modes are interleaved with alternating pair order. Invalidating the baseline outside the timed interval selects full sync; a valid baseline selects targeted sync. Each sample verifies the selected mode and the persisted title. This compares two paths in the updated implementation, not historical checkouts.

Machine: Apple M5 Pro, arm64, macOS / Darwin 25.5.0; Node v24.21.0. PostgreSQL and S3-compatible storage run locally.

The isolated local editor benchmark includes server-job creation/execution, actual Git commits and pushes to a temporary local remote, database updates, tar packaging, and S3 publication. It excludes HTTP, browser rendering, and GitHub latency. Fixture setup, per-save editor preparation, assertions, and log collection are outside timing. The retained run was executed without another test suite running.

The browser benchmark uses the actual settings form, HTTP, and the private disposable `RafaelaAfferri/prarielearn-sync-test` GitHub repository. A temporary localhost proxy injects instrumentation without changing application source. The browser's Performance API measures Save click through a successful response and two animation frames with the success alert present. Three warm-up pairs are excluded; all 46 saves succeeded. Two preparation attempts were retried before clicking Save because the form had not finished hydration; neither created a measured save. These measurements include the localhost proxy and development-mode rendering.

## Results

| Measurement (median)                    |  Full sync | Targeted sync | Reduction |
| --------------------------------------- | ---------: | ------------: | --------: |
| Local editor, real Git and S3           |  444.34 ms |     342.60 ms |    22.90% |
| Browser click to success, GitHub remote | 2338.75 ms |    2038.20 ms |    12.85% |

| Measurement (p95)        |  Full sync | Targeted sync |
| ------------------------ | ---------: | ------------: |
| Local editor             |  465.18 ms |     350.88 ms |
| Browser click to success | 3203.70 ms |    2684.70 ms |

The local median reduction was 101.74 ms. The browser median reduction was 300.55 ms, but the GitHub comparison includes variable network time; it does not establish that all of this difference comes from skipping metadata sync. These are small local samples, not a production latency guarantee.

Raw artifacts:

- `/private/tmp/pl-question-title-sync-comparison.json`
- `/private/tmp/pl-fast-sync-real-YGfyKJ/title-browser-summary.json` (joined server and browser samples)
- `/private/tmp/pl-fast-sync-real-YGfyKJ/title-server-samples.json` (server logs and selected modes)
- `/private/tmp/pl-fast-sync-real-YGfyKJ/title-browser-instrumented.json` (browser timestamps)
- `/private/tmp/pl-fast-sync-real-YGfyKJ/title-sync-success.png`

## Repeat the local comparison

Requires local PostgreSQL, Redis, and S3. Creates commits and pushes only in temporary test repositories.

```sh
PL_SAVE_BENCHMARK_OUTPUT=/private/tmp/pl-question-title-sync-comparison.json \
  PL_SAVE_BENCHMARK_REAL_GIT=1 \
  PL_SAVE_BENCHMARK_ACTION=title \
  pnpm exec vitest run \
  apps/prairielearn/src/tests/questionContentSaveBenchmark.test.ts \
  --coverage.enabled=false
```

Without `PL_SAVE_BENCHMARK_ACTION=title`, the existing content-edit benchmark remains available. Benchmarks are opt-in and contain no fixed timing thresholds.

## Regression coverage

- `questionContentSync.test.ts`: two new settings/rename cases verify the title, unchanged question rows, targeted publication, no full course load, and baseline advancement. The existing metadata fallback and publication-failure recovery cases now exercise title edits too; existing baseline and Git fallback coverage is reused.
- `questionContentChunks.test.ts`: existing real S3 publication test remains unchanged; the title operation uses that same publisher.
- `courseEditor.test.ts`: existing integration coverage checks that course/question operations continue to work.

# Print preparation load test

This runner captures a real preview and PDF export request in a browser, then replays that workflow concurrently. Use several assessment sizes so the results include both quick exports and booklet exports. It records per-request preview time, time until the export is ready, download time, response bytes, and failures. The application records render queue wait and process memory in OpenTelemetry.

## Run against an isolated local server

The Playwright wrapper starts an isolated PrairieLearn server, signs in with a development account, selects two assessments from the test course, and writes the results to your system temporary directory. It removes the temporary authentication files after each run.

```sh
PRINT_LOAD_USERS=10 pnpm --filter @prairielearn/prairielearn test:e2e src/tests/e2e/print-preparation-load.spec.ts
```

Set `PRINT_LOAD_BOOKLET_COPIES=75` to add a booklet export to the workload. Raise `PRINT_LOAD_USERS` gradually after checking failures and memory at each level. The Playwright test reports measurements; it does not enforce performance targets. The p50 and p95 timings only include requests that reached the measured stage, so always read them with the failure count. This isolated test course is useful for repeatable local measurements but does not represent the size of a production assessment.

## Prepare an authenticated session

Start the development server, then use Playwright to sign in and save its browser state:

```sh
pnpm --filter @prairielearn/prairielearn exec playwright codegen --save-storage=/tmp/print-load-auth.json http://localhost:3000
```

Close the codegen browser after signing in. Keep the storage file private: it contains login cookies. Create `/tmp/print-load-config.json` with representative assessment URLs:

```json
{
  "storageState": "/tmp/print-load-auth.json",
  "serverPid": 12345,
  "scenarios": [
    {
      "name": "short form",
      "url": "http://localhost:3000/pl/course_instance/1/instructor/assessment/2/print_preparation?instances=",
      "export": "form"
    },
    {
      "name": "75-student booklet",
      "url": "http://localhost:3000/pl/course_instance/1/instructor/assessment/3/print_preparation?instances=",
      "export": "booklet",
      "copies": 75
    }
  ]
}
```

`serverPid` is optional. If supplied, the runner samples that server process's resident memory every 500 ms. For a deployment with multiple processes, use the OpenTelemetry memory measurements to see every renderer. The runner only accepts localhost URLs unless `--allow-remote` is given explicitly.

## Run

```sh
pnpm --filter @prairielearn/prairielearn exec tsx src/tests/load/print-preparation.ts \
  --config /tmp/print-load-config.json --users 200 \
  --output /tmp/print-load-results.json
```

Run lower concurrency first (for example, `--users 10`), then increase it to 50, 100, and 200. The result file contains each request and p50/p95 timing summaries, including p95 values by scenario. The runner uses the same authenticated account for every simulated user, so it measures concurrent server work rather than separate account authorization costs. It captures requests once before the timed run, and aborts the setup export before it starts rendering.

After establishing a baseline, add optional `targets` to the config with `maxFailures`, `previewP95Ms`, `exportP95Ms`, and `peakRssBytes`. The command exits with a failure code when a target is missed. A memory target requires `serverPid`.

Use the following OpenTelemetry metrics alongside the result file:

| Metric                                                                         | What it measures                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `print.preview.request.duration`                                               | Full preview response time                                                |
| `print.preview.questions.duration`                                             | Question preparation before browser pagination                            |
| `print.render.queue_wait`                                                      | Time a preview or PDF render waited for a browser slot, labeled by `kind` |
| `print.render.duration`                                                        | Queue plus browser render time, labeled by `kind`                         |
| `print.render.waiting`                                                         | Waiting renders when each new render arrived                              |
| `print.render.active`                                                          | Active renders when each new render arrived                               |
| `print.render.rss`, `print.preview.rss`, `print.export.rss`                    | Server process resident memory                                            |
| `print.render.failures`, `print.preview.failures`, `print.export.packet.error` | Failures                                                                  |
| `print.export.packet.duration`                                                 | Full PDF packet render and assembly time                                  |
| `print.export.background.queue_wait`                                           | Time before a shared worker claimed a queued export                       |
| `print.export.background.duration`, `print.export.background.rss`              | Background render time and worker memory                                  |
| `print.export.path`                                                            | Inline or background exports, including why background was chosen         |

Compare p95 preview time, queue wait, export time, peak memory, and failure count at each concurrency level. Background exports are stored in S3 and claimed from a shared database queue. The worker pool permits two active exports across all hosts. This local test measures one deployment shape; repeat it against a production-like Cloudflare rendering setup before treating 200 concurrent users as verified.

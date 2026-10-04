# Course agent development

The course agent runs Codex in a Cloudflare Linux sandbox and exposes a browser
chat panel in PrairieLearn. Enable it only for courses whose owners should have
access. This directory contains the local Worker configuration and test fixtures.

## Where the code runs

| Code                                               | Runtime                                    | Responsibility                                                                                   |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `worker.ts`                                        | Cloudflare Worker                          | Authenticate requests and route them to a conversation.                                          |
| `agent.ts`                                         | Chat Durable Object                        | Persist messages and execution receipts; coordinate Send, steering, Stop, recovery, and cleanup. |
| `app-server.ts`                                    | Chat Durable Object                        | Correlate Codex JSON-RPC acknowledgments and route native notifications.                         |
| `codex-turn.ts`, `codex-events.ts`                 | Chat Durable Object                        | Control one native turn and translate its events into AI SDK message parts.                      |
| `codex.ts`                                         | Chat Durable Object                        | Start/connect the sandbox's Codex process and restore or create filesystem checkpoints.          |
| `sandbox.ts`, `outbound.ts`                        | Cloudflare Worker / Sandbox Durable Object | Enforce outbound destinations and inject credentials outside the container.                      |
| Codex CLI                                          | Linux sandbox                              | Read and modify the course checkout; run commands.                                               |
| `apps/prairielearn/src/ee/lib/course-agent/`       | PL webserver                               | Authorize course owners and bridge browser requests to the Worker.                               |
| `apps/prairielearn/src/ee/components/courseAgent/` | Browser                                    | Display saved messages and live output; send follow-ups, steering, and Stop.                     |

`cleanupDiagnosticsSchema` describes one stored stop/backup/destroy attempt in
Chat's sandbox state. `sandboxDiagnosticsSchema` describes the complete response
from `/diagnostics`: that attempt plus lifecycle state, checkpoint warnings, and
computed expiration times. Neither contains raw SDK exceptions or signed URLs.

## Start with the deterministic fixture

The fixture runs the real Chat Durable Object and its persistence/transport in
local workerd. A fake Sandbox Durable Object simulates Codex responses, token
usage, lost acknowledgments, cancellation, and R2 checkpoint contents. It needs
no Docker, OpenAI key, GitHub access, or network publication. It verifies control
flow; it does not verify the real Codex process, sandbox isolation, or GitHub.

From the repository root:

```sh
pnpm install
make build
make start-support
pnpm --filter @prairielearn/course-agent dev:fixture
```

The fixture uses port **8791**. In another terminal, add these local settings to
`config.json` (or your usual PrairieLearn config file):

```json
{
  "courseAgent": {
    "workerUrl": "http://localhost:8791",
    "serviceToken": "local-fixture-service-token-not-a-secret",
    "pricing": { "fixture-model": { "input": 0, "cachedInput": 0, "output": 0 } }
  },
  "githubClientToken": "fixture-no-github-network",
  "features": { "course-agent": true }
}
```

Start PL with `pnpm --filter @prairielearn/prairielearn dev`. Use an enterprise
development license, sign in as a course owner, and open a non-example course
configured with repository `https://github.com/example/course` and branch `main`.
The fixture binds its conversations to this destination; it never clones it.
The placeholder PL GitHub token satisfies publisher setup; the empty-base fixture
proposal is rejected before a GitHub request. Use a real token only for the real
publication flow below.
Open the stars button, send a message, send a correction while the answer streams,
and use Stop. Saved conversations, drafts, and panel selection survive course-page navigation.
The statistics dialog includes token totals and estimated cost.

Fixture lifecycle checks:

```sh
pnpm --filter @prairielearn/course-agent test
pnpm --filter @prairielearn/course-agent test:lifecycle
pnpm test apps/prairielearn/src/ee/components/courseAgent/chat-transport.test.ts apps/prairielearn/src/ee/lib/course-agent/routes.test.ts
```

The lifecycle tests require the fixture running on 8791. They advance its test
clock instead of sleeping for production deadlines. `scripts/start-fixture.sh`
starts it and waits for readiness in CI. `pnpm --filter @prairielearn/course-agent
demo` is an optional one-shot HTTP smoke test: create a conversation, send one
prompt, and print its saved transcript. The browser is the interactive test path.

## Run the real sandbox locally

Docker must be running. Copy `apps/course-agent/.dev.vars.example` to
`apps/course-agent/.dev.vars` and fill in:

- `PL_SERVICE_TOKEN`: a random secret of at least 32 characters, matching PL's
  `courseAgent.serviceToken`.
- `CODEX_MODEL` and `CODEX_API_KEY`: the model and its API credential.
- `GITHUB_CLIENT_TOKEN`: access to read your course repository.

Keep `.dev.vars` untracked. Local R2 emulation does not need remote R2 keys.
Run `pnpm --filter @prairielearn/course-agent dev` and point PL's `workerUrl` to
`http://localhost:8790`. Configure the course's actual GitHub repository and branch.
The explicitly named `wrangler.local.jsonc` uses development resources; package
scripts do not expose a deployment shortcut.

Send a prompt that reads a known course file, then one that edits a scratch file
and runs a command. Check that live text, tool output, steering, and Stop appear
in the browser. To publish, configure PL's `githubClientToken` with write access, ask the agent to
commit its changes and call `push_sync`, inspect **View changes**, then approve or
deny. Use a disposable course repository for this test. Approval publishes the
exact captured files to GitHub and then runs Course Sync.

## Recovery and troubleshooting

- A completed turn enters `waiting_for_user`. After **10 idle minutes**, Chat
  checkpoints `/workspace` to R2 and destroys the sandbox. A follow-up restores
  that checkpoint into a new sandbox and resumes the native thread.
- **Six hours since the last user interaction** is a separate hard cleanup
  deadline, including while the agent runs. `SANDBOX_IDLE_MS` and `USER_IDLE_MS`
  in `src/codex.ts` control these deadlines. The app-server's 15-second timeout
  controls RPC acknowledgments, not how long Codex may work.
- Stop asks Codex to interrupt. Navigating away or closing a stream only detaches
  observation. Lost acknowledgments are reconciled against native history;
  mutating requests are not blindly replayed.
- Failed cleanup exposes **Retry cleanup**. A missing/expired checkpoint requires
  a new conversation. A changed course repository or branch invalidates new work
  in the old conversation; history, Stop, and cleanup remain available.
- For `bind(): Address already in use`, inspect `lsof -nP -iTCP:8790 -sTCP:LISTEN`
  (or 8791 for the fixture). Stop your earlier dev instance or use another port
  and update PL's URL. Do not run two Workers with the same port/persistence path.
- Wrangler prints the path to its local log. PL logs failed connections and
  authorization; the statistics dialog shows sanitized lifecycle diagnostics.
  Never copy credentials or signed checkpoint URLs into issue reports.

## Codex protocol types

The sandbox Dockerfile and development dependency pin the same Codex CLI version.
`make update-codex-protocol` invokes that CLI's experimental TypeScript generator,
selects the payload types this integration uses through the TypeScript parser,
and preserves upstream directories and comments under `src/generated/`. NodeNext
imports gain `.js` extensions and the repository's Prettier settings are applied.
`make check-codex-protocol` detects stale, missing, and obsolete generated files.
Update the CLI dependency and Dockerfile together when changing versions.

## Saved conversations and usage

Configure `courseAgent.pricing` before sending work, including the fixture model:

```json
{ "fixture-model": { "input": 0, "cachedInput": 0, "output": 0 } }
```

Pricing is per million tokens. Production prices must match the chosen model;
unknown pricing blocks admission rather than counting the work as free. Defaults
allow two concurrent requests per user, five per course, 30 requests per hour,
and a $20 daily estimate limit. These are admission limits, not a hard limit on
one turn's eventual cost. Unconfirmed receipts remain charged as active until
reconciled; one unavailable conversation must not silently free its slot.

In the browser, reload while a response streams, navigate to another course page,
switch conversations, and return to an unsent draft. Confirm each survives and
that the statistics dialog updates without duplicating token usage. Turn off the
feature flag and verify history, Stop, and cleanup remain usable while new work
is disabled. `courseAgent.test.ts` and `courseAgentUsage.test.ts` cover database
ownership, operation retries, admission races, and accounting reconciliation.

## Approval and Course Sync

The runtime captures committed UTF-8 text changes as an immutable proposal. PL
verifies paths, modes, trusted base contents, size, and the digest before showing
an approval. It does not prevalidate course JSON or schemas: Course Sync owns
those checks. The instructor can inspect the diff, approve it, or deny it. New
messages wait until the durable tool result is delivered; the Send button explains
this through an upward hover/focus tooltip.

During approval the card displays **Publishing…** or **Syncing course…**. A normal
publication, including a cold sandbox restore, must not display **Retry
completion**. Definite GitHub rejections return a failed result to the agent.
Lost acknowledgments remain retryable and reconcile verified branch history
before another write. A changed branch head requires a new proposal.

Course-content failures retain the GitHub commit. The agent receives its SHA and
Course Sync diagnostics, then can propose a correction or explicit revert for
another instructor approval. Course Sync can have applied valid entities before
failing; this is not an automatic rollback or an atomic course update. A transient
sync error retries from the saved publication rather than pushing twice.

If PL restarts during Course Sync, its abandoned-job cleanup marks the job failed.
The instructor uses **Retry completion** to resume from saved receipts. Background
continuation is process-local; automatic restart recovery is outside this MVP.
History, Stop, and sandbox cleanup remain available after repository/branch changes,
but the old conversation cannot start or publish more work.

For automated validation, start the fixture and run:

```sh
COURSE_AGENT_FIXTURE_URL=http://localhost:8791 pnpm --filter @prairielearn/prairielearn test:e2e src/tests/e2e/courseAgent.spec.ts
pnpm test apps/prairielearn/src/tests/courseAgent.test.ts apps/prairielearn/src/tests/courseAgentSync.test.ts apps/prairielearn/src/ee/lib/course-agent/publish.test.ts
```

The browser tests cover approval presentation, pending-message tooltips, visible
publication progress, and preparation rejection. Worker lifecycle tests exercise
warm and cold result delivery. The sync tests use real local Git repositories and
the normal Course Sync jobs; publisher tests simulate lost GitHub acknowledgments,
branch movement, definite GraphQL rejection, and unavailable branches. Real
GitHub writes, model inference, and Docker networking require the manual flow.

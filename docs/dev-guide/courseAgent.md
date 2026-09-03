# Course agent development

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a single Claude Code harness, live activity events, and a
minimal instructor panel. The repository layer resolves the course's configured repository and
branch, shallow-clones it into `/workspace/course`, and configures an identity for local commits.

Conversation metadata, turns, messages, and normalized runtime events are persisted in PostgreSQL.
The instructor panel lists those conversations so a browser refresh can reopen one. After ten idle
minutes, the Worker checkpoints `/workspace` to the configured R2 bucket, destroys the sandbox, and
stores the opaque backup handle in its coordinator state. The next snapshot records that handle in
PostgreSQL, and a later run restores the same workspace before continuing.

## Free local testing

Set `courseAgentRuntime` to `fake` in your existing PrairieLearn configuration and enable the
`course-agent` feature for a course. The fake runtime exercises the same tRPC and UI contracts but
does not contact Cloudflare or a model provider.

To exercise the Worker locally, set `courseAgentRuntime` to `cloudflare`, configure
`courseAgentCapabilitySecret`, and run `make dev`. This starts PrairieLearn and the course-agent
Worker together; run `pnpm dev-course-agent-worker` to start only the Worker. Wrangler uses local
simulation and local state. Before starting it, create an untracked
`apps/course-agent-worker/.dev.vars` file containing `COURSE_AGENT_CAPABILITY_SECRET`,
`ANTHROPIC_API_KEY`, and `COURSE_AGENT_GITHUB_PAT`. The capability secret must match
`courseAgentCapabilitySecret` in PrairieLearn. `courseAgentGithubToken` does not populate the Worker
secret; configure the same read-only GitHub token separately as `COURSE_AGENT_GITHUB_PAT`. Do not run
`wrangler deploy` as part of local testing. The model credential is held by the Worker and inserted
only by its outbound Anthropic handler; the sandbox receives the placeholder value `proxy-injected`.

The GitHub PAT is also held by the Worker. The sandbox uses `proxy-read`, and the Worker replaces it
only for `git-upload-pack` requests to the exact repository configured for that sandbox. Receive-pack,
other repositories, and other GitHub operations are rejected. The PAT is therefore available for
clone, fetch, and pull, but never for push.

## Approval-gated publication

The sandbox cannot publish course changes. Its `push_sync` tool verifies that the workspace is
clean, calculates the committed diff from the configured remote branch, and sends that diff to
PrairieLearn. The tool waits while the instructor reviews the exact diff in the course-agent panel.

On approval, the trusted PrairieLearn web process verifies that the configured repository, branch,
and remote base SHA still match the request. It applies the approved diff to the normal course
checkout and uses PrairieLearn's existing editor path to commit, push, and start Course Sync. The
remote branch is verified after the editor completes, and the result is returned through the Worker
to the waiting tool. Denial and publication errors are also returned to the agent. The sandbox's
GitHub PAT proxy remains read-only throughout this flow; PrairieLearn never enables
`git-receive-pack` or gives a push credential to the sandbox.

Live local testing of approval-gated publication requires `fileEditorUseGit: true` and Git push
credentials for the PrairieLearn process. This setting affects all local file-editor operations, so
only enable it while testing against a disposable course repository. Without it, course-agent
publication fails before applying the approved diff instead of reporting a local-only edit as a
successful push.

Wrangler uses its local R2 simulation by default. Production R2 access requires a dedicated bucket
and narrowly scoped R2 credentials supplied to the Worker; local tests do not create or pay for
Cloudflare resources.

## Usage accounting and guardrails

Each run has a one-to-one PostgreSQL usage record. Worker snapshots report cumulative provider,
model, token, provider-cost, and estimated-cost fields; PostgreSQL updates them with monotonic
maximums so repeated snapshots do not double count. Completed and failed runs finalize the record,
including a zero-usage record when the provider fails before reporting tokens. The instructor panel
shows the active-run and conversation totals.

`courseAgentUsageLimits` configures a rolling window and optional per-user, per-course, and global
milli-dollar limits. Null limits are disabled, which keeps the fake runtime and local development
independent of Redis by default. When configured, Redis holds only rolling guardrail counters;
PostgreSQL remains the durable accounting source of truth. New turns fail with a clear message if a
configured counter reaches its limit or the required Redis check cannot be completed.

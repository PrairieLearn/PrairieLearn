# Course agent development

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a Codex harness with web search, Redis-backed resumable
SSE activity, a basic instructor panel, and optional diagnostics. It does not clone a course
repository, persist conversations, publish changes, or track usage. The next stacked layer resolves
the course's configured GitHub repository and branch, shallow-clones it into `/workspace/course`,
and gives Codex a course validator. At that point the agent can create and edit questions,
assessments, and other course content locally, but still cannot push.

The third stack layer stores conversations, turns, messages, and runtime events in PostgreSQL. The
panel reopens the most recent conversation and resumes an active Redis stream after navigation.
When the configured idle period expires, the Worker backs up `/workspace` to its R2 backup binding,
destroys the sandbox, and restores that backup on the next turn. The backup TTL comes from
`courseAgentSandbox.backupTtlSeconds`.

The fourth layer adds the approval-gated `push_sync` tool. Codex must statically validate the full
course, smoke-test changed question variants, commit a clean workspace with a descriptive message
and PrairieLearn Agent co-author trailer, and then call the tool. The Worker independently reruns
validation and verifies the proposed commit and Git tree before it creates an approval. PrairieLearn
applies the approved diff to its trusted checkout, pushes and syncs it, and returns the resulting
status to the waiting tool call. Denial returns control without publishing.

The fifth layer records normalized Codex usage for every run and enforces optional rolling per-user,
per-course, and global cost limits before starting a new turn.

## Free local testing

Set `courseAgentRuntime` to `fake` in your existing PrairieLearn configuration and enable the
`course-agent` feature for a course. The fake runtime exercises the same tRPC and UI contracts but
does not contact Cloudflare or a model provider.

To exercise the Worker locally, set `courseAgentRuntime` to `cloudflare`, configure
`courseAgentCapabilitySecret`, and start PrairieLearn with `make dev`. Start the Worker separately
with `pnpm dev-course-agent-worker`; Wrangler uses local simulation and local state. Do not run
`wrangler deploy` as part of local testing. Put `OPENAI_API_KEY` and the matching
`COURSE_AGENT_CAPABILITY_SECRET` in `apps/course-agent-worker/.dev.vars`. The model credential is
held by the Worker and inserted only by its outbound OpenAI handler; the sandbox receives the
placeholder value `proxy-injected`. Repository-enabled builds also require a read-only
`COURSE_AGENT_GITHUB_PAT` in the same Worker-only file. The sandbox sees `proxy-read`; the Worker
replaces it only for Git upload-pack requests to the exact authorized repository. Receive-pack,
other repositories, and other GitHub operations are rejected, so the credential can clone, fetch,
and pull but cannot push.

Sandbox lifetime settings are non-secret and can be configured in `config.json`:

```json
{
  "courseAgentSandbox": {
    "idleTimeoutSeconds": 600,
    "backupTtlSeconds": 604800,
    "turnTimeoutSeconds": 900
  }
}
```

Enable the separate `course-agent-diagnostics` feature for a course to expose a user-controlled
diagnostic mode. It shows live runtime identifiers, state, stream position, tool activity, and
usage, but never credentials or model reasoning.

The Worker mounts the `COURSE_AGENT_DOCS` R2 binding read-only at
`/opt/prairielearn-docs`. Local development can use Wrangler's empty local R2 bucket; Codex falls
back to web search when documentation is unavailable. `validate-course .` performs baseline and
post-turn static checks for JSON and Python syntax, question UUIDs and required files, merge
conflicts, and Git whitespace errors. Codex is instructed to run it before completing every content
change.

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
model, token, and estimated-cost fields; PostgreSQL updates them with monotonic
maximums so repeated snapshots do not double count. Completed and failed runs finalize the record,
including a zero-usage record when the provider fails before reporting tokens. The instructor panel
shows the active-run and conversation totals.

`courseAgentUsageLimits` configures a rolling window and optional per-user, per-course, and global
milli-dollar limits. Null limits are disabled, which keeps the fake runtime and local development
independent of Redis by default. When configured, Redis holds only rolling guardrail counters;
PostgreSQL remains the durable accounting source of truth. New turns fail with a clear message if a
configured counter reaches its limit or the required Redis check cannot be completed.

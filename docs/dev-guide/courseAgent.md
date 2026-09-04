# Course agent development

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a Codex harness with web search, Redis-backed resumable
SSE activity, a basic instructor panel, and live diagnostics. It does not clone a course
repository, persist conversations, publish changes, or track usage. The next stacked layer resolves
the course's configured GitHub repository and branch, shallow-clones it into `/workspace/course`,
and gives Codex a course validator. At that point the agent can create and edit questions,
assessments, and other course content locally, but still cannot push.

The third stack layer stores conversations, turns, messages, and runtime events in PostgreSQL. The
panel reopens the most recent conversation and resumes an active Redis stream after navigation.
When the configured idle period expires, the Worker backs up `/workspace` to its R2 backup binding,
destroys the sandbox, and restores that backup on the next turn. The backup TTL comes from
`courseAgentSandbox.backupTtlSeconds`.

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

The panel always includes a collapsed **Live conversation state** accordion. It shows runtime
identifiers, state, stream position, and usage, but never credentials or model reasoning. Activity
is grouped by instructor turn, and assistant responses support Markdown. Enter sends a message;
Shift+Enter adds a newline. The sandbox image includes `python` and `python3`.

The Worker mounts the `COURSE_AGENT_DOCS` R2 binding read-only at
`/opt/prairielearn-docs`. Local development can use Wrangler's empty local R2 bucket; Codex falls
back to web search when documentation is unavailable. `validate-course .` performs baseline and
post-turn static checks for JSON and Python syntax, question UUIDs and required files, merge
conflicts, and Git whitespace errors. Codex is instructed to run it before completing every content
change.

For local backup testing, Wrangler uses its local `BACKUP_BUCKET` binding and does not require R2
access keys. A deployed Worker may receive `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as optional
secrets when its backup implementation uses remote S3-compatible access.

Cloud resources and credentials used by later stack layers are intentionally not configured here.

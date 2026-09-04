# Course agent development

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a Codex harness with web search, Redis-backed resumable
SSE activity, a basic instructor panel, and live diagnostics. It does not clone a course
repository, persist conversations, publish changes, or track usage. The next stacked layer resolves
the course's configured GitHub repository and branch, shallow-clones it into `/workspace/course`,
and gives Codex a bundled content-authoring skill. At that point the agent can create and edit questions,
assessments, and other course content locally, but still cannot push.

The third stack layer stores conversations, turns, messages, and runtime events in PostgreSQL. The
panel reopens the most recent conversation and resumes an active Redis stream after navigation.
Each successful turn checkpoints `/workspace` to the Worker's R2 backup binding. When the configured
idle period expires, the Worker checkpoints again and destroys the sandbox. The next turn restores
the checkpoint only if it needs a new sandbox; a live workspace is never overwritten by an older
backup. The backup TTL comes from `courseAgentSandbox.backupTtlSeconds`. Completed text and tool
history are persisted independently of whether the browser remains connected. Recent user/assistant
messages are passed to the harness as bounded context; workspace files remain authoritative.

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

`make dev` never starts Wrangler. If the Worker is unavailable when you send a message, the panel
shows an error with the separate startup command.

Sandbox lifetime settings are non-secret and can be configured in `config.json`:

```json
{
  "courseAgentSandbox": {
    "idleTimeoutSeconds": 600,
    "maxLifetimeSeconds": 600,
    "backupTtlSeconds": 604800,
    "turnTimeoutSeconds": 900
  }
}
```

`maxLifetimeSeconds` is an absolute limit starting when the sandbox is created, not an idle timer.
It defaults to 600 seconds and accepts values from 1 to 86,400 seconds (for example, 10 for local
expiry testing). New messages do not extend an existing sandbox's deadline. A durable alarm shuts
down the sandbox at the deadline, including during an active turn. In this persistence layer, the
next message restores the last completed checkpoint. Changes from an interrupted turn may be lost.
An idle backup failure retains the sandbox for a retry until the absolute deadline. An expired
backup is reported instead of silently claiming unpublished edits were restored. The lifetime applies
from sandbox creation; new messages do not reset it. `idleTimeoutSeconds` controls the separate
durable idle timer after a turn finishes. With both defaults at 600 seconds, the absolute limit wins.

Administrators see a collapsed **Conversation info (only visible to administrators)**
accordion. The diagnostic endpoint also requires administrator access; the ordinary transcript
omits internal telemetry. The accordion shows runtime
identifiers, state, and usage, but never credentials or model reasoning. Activity
appears inline within each assistant response using the same tool-status components as question
generation, and assistant responses support Markdown. Enter sends a message;
Shift+Enter adds a newline. The sandbox image includes `python` and `python3`.

The Worker mounts the `COURSE_AGENT_DOCS` R2 binding read-only at
`/opt/prairielearn-docs`. Local development can use Wrangler's empty local R2 bucket; Codex falls
back to the bundled skill when documentation is unavailable. The skill lives at
`apps/course-agent-worker/skills/course-content-authoring` and is packaged under
`/opt/course-agent/skills/course-content-authoring`. The runner reads its entrypoint into Codex's
developer instructions on every turn, so the model does not need to discover or search for `SKILL.md`.
It contains basic
course layout, targeted documentation pointers, fixed-choice and randomized numeric question
examples, and Homework/Exam assessment examples. These are available without R2 or web access.
References are read only when relevant; normal greetings require no repository inspection.

A compact Homework example is included in the starting instructions, so a basic assessment does
not require a separate template read. The skill encourages batched inspection, editing, and
review, and defaults to three complementary questions when no count is requested. It preserves
requested subject depth. No automatic course inventory or eval runner is included.

There is no standalone validator or `question_render` tool in the repository-setup PR. The later
push/sync PR should return PL sync errors through `push_sync` and add `question_render` for a
selected question variant before requesting publication. Rendering should use isolated proposed
content, not mutate the live course; return rendered output and actionable generation/render
errors to the agent. Sync success alone does not establish that every variant renders or grades.
Until those tools exist, the agent reports local edits without claiming successful rendering or sync.

The panel uses the AI SDK's `useChat`. A small transport starts runs through tRPC and reads standard
UI-message SSE. PrairieLearn translates Worker events into UI-message chunks before buffering them
in Redis; each run has a stable assistant-message ID, and earlier turns in the Worker's replay are
excluded. Reconnecting rebuilds that run's message from the beginning without submitting another
model request. If Redis no longer has the completed stream, the same adapter reconstructs it from
the authorized workspace snapshot. On page reload, PostgreSQL history is rebuilt with the same
UI-message adapter, including each turn's tool calls. An active run reconnects without another model
request. Saved history remains readable if the Worker is temporarily unavailable. Internal telemetry
and backup handles are omitted from this ordinary history response.

The sandbox runs Codex app-server over stdio to forward final-answer text deltas as they arrive.
Commentary and reasoning are not displayed. Rebuild/restart the local Worker after changing its
Dockerfile or runner script. The Docker build context excludes local configuration and credentials.
To verify the runner against the pinned Codex binary without paid requests, set
`COURSE_AGENT_TEST_CODEX` to that binary's absolute path when running the Worker tests; its provider
is replaced by a localhost-only mock with a fake key.

For local backup testing, Wrangler uses its local `BACKUP_BUCKET` binding and does not require R2
access keys. A deployed Worker may receive `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as optional
secrets when its backup implementation uses remote S3-compatible access.

Cloud resources and credentials used by later stack layers are intentionally not configured here.

# Course agent development

## Codex thread state

Each conversation keeps one native Codex thread in `/workspace/.course-agent/codex`, outside the
course Git checkout. The runner records its thread ID and resumes it on subsequent turns; restarting
the app-server process does not reset the thread. Codex retains its model-visible history, tool
results, and any native compaction state. A failed resume reports an error rather than silently
replacing the session.

If no saved thread exists (including after a sandbox is lost in this base layer), the runner creates
a thread and supplies all available user/assistant messages from the conversation's Worker events.
This is a recovery fallback, not native-session restoration: it cannot recover tool results or
unpublished files. It has no 20-message/20,000-character truncation. A recovery transcript that exceeds
the model's context window can fail; automatic compaction is not unlimited input ingestion.

The base layer retains native state only for the sandbox's lifetime. The persistence layer adds
workspace backups containing these session files and PostgreSQL copies of messages and activity
for the UI. PostgreSQL chat history does not replace Codex's native session state.

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a Codex harness with web search, Redis-backed resumable
SSE activity, a basic instructor panel, and live diagnostics. It does not clone a course
repository, persist conversations, publish changes, or track usage.

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
placeholder value `proxy-injected`.

`make dev` never starts Wrangler. If the Worker is unavailable when you send a message, the panel
shows an error with the separate startup command.

Sandbox lifetime settings are non-secret and can be configured in `config.json`:

```json
{
  "courseAgentSandbox": {
    "idleTimeoutSeconds": 600,
    "sleepAfterSeconds": 21600,
    "backupTtlSeconds": 604800,
    "turnTimeoutSeconds": 21600
  }
}
```

`idleTimeoutSeconds` starts a new idle interval after a turn finishes or fails. A new message clears
the deadline. The Durable Object alarm checks an active process every minute; idle expiry never
interrupts a working agent. `turnTimeoutSeconds` is a separate active-execution guard, not a sandbox
lifetime. `sleepAfterSeconds` controls Cloudflare's inactivity failsafe, with `keepAlive` disabled.
Both guards default to six hours. Settings take effect on the next run and accept 60–86,400 seconds.
Startup has a separate five-minute grace period. If the coordinator is replaced before it records
the process ID, an alarm fails the abandoned startup after that period so the instructor can retry.

There is no absolute sandbox lifetime. Legacy `maxLifetimeSeconds` values are ignored. On upgrade,
old absolute-deadline alarms are replaced with a full idle interval or an active-process check.
Temporary files are still lost when this base PR's ephemeral workspace is suspended; backup and
restore are added by the persistence PR.

The coordinator persists its process ID, parsed stream state and log cursor. Quiet process polling
backs off from one to eight seconds and does not rewrite unchanged checkpoints. New output resets
the interval to one second. Conversation UUIDs and derived sandbox IDs are canonicalized to lowercase;
inspection requests derive the sandbox ID server-side instead of trusting the client value.
An alarm can reconcile
the same process after coordinator replacement, including its final output, without submitting the
user's prompt again. Conversation state (`working`, `waiting_for_user`, `failed`) is separate from
sandbox state (`offline`, `starting`, `ready`, `suspending`). Later PRs add approval/publication phases.

Administrators see a collapsed **Conversation info (only visible to administrators)**
accordion. The diagnostic endpoint also requires administrator access; the ordinary transcript
omits internal telemetry. The accordion shows runtime
identifiers, raw state values and usage, but never credentials or model reasoning. Worker-owned fields
are labeled explicitly; `null` is shown as `null`, and UI loading state never replaces stored state. Activity
appears inline within each assistant response using the same tool-status components as question
generation, and assistant responses support Markdown. Enter sends a message;
Shift+Enter adds a newline. The sandbox image includes `python` and `python3`.

The panel uses the AI SDK's `useChat`. A small transport starts runs through tRPC and reads standard
UI-message SSE. PrairieLearn translates Worker events into UI-message chunks before buffering them
in Redis; each run has a stable assistant-message ID, and earlier turns in the Worker's replay are
excluded. Reconnecting rebuilds that run's message from the beginning without submitting another
model request. If Redis no longer has the completed stream, the same adapter reconstructs it from
the authorized workspace snapshot. If the run is still active, reconnect opens an authenticated
Worker stream to replay its events and follow new output through completion.
This does not persist the browser conversation across reloads;
conversation persistence belongs to the later persistence PR.

The sandbox runs Codex app-server over stdio to forward final-answer text deltas as they arrive.
Commentary and reasoning are not displayed. Rebuild/restart the local Worker after changing its
Dockerfile or runner script. The Docker build context excludes local configuration and credentials.
To verify the runner against the pinned Codex binary without paid requests, set
`COURSE_AGENT_TEST_CODEX` to that binary's absolute path when running the Worker tests; its provider
is replaced by a localhost-only mock with a fake key.

Cloud resources and credentials used by later stack layers are intentionally not configured here.

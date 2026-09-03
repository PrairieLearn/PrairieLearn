# Course agent development

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
    "maxLifetimeSeconds": 600,
    "backupTtlSeconds": 604800,
    "turnTimeoutSeconds": 900
  }
}
```

`maxLifetimeSeconds` is an absolute limit starting when the sandbox is created, not an idle timer.
It defaults to 600 seconds and accepts values from 1 to 86,400 seconds (for example, 10 for local
expiry testing). New messages do not extend an existing sandbox's deadline. A durable alarm shuts
down the sandbox at the deadline, including during an active turn. Temporary files are lost in
this base PR; the next message starts a fresh workspace. Configuration changes apply to newly
created sandboxes. The existing `idleTimeoutSeconds` separately controls Cloudflare's idle sleep.

Administrators see a collapsed **Conversation diagnostics (only visible to administrators)**
accordion. The diagnostic endpoint also requires administrator access; the ordinary transcript
omits internal telemetry. The accordion shows runtime
identifiers, state, stream position, and usage, but never credentials or model reasoning. Activity
is grouped by instructor turn, and assistant responses support Markdown. Enter sends a message;
Shift+Enter adds a newline. The sandbox image includes `python` and `python3`.

Cloud resources and credentials used by later stack layers are intentionally not configured here.

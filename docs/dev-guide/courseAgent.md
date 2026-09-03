# Course agent development

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a single Claude Code harness, live activity events, and a
minimal instructor panel. It does not clone a course repository, persist conversations, publish
changes, or track usage.

## Free local testing

Set `courseAgentRuntime` to `fake` in your existing PrairieLearn configuration and enable the
`course-agent` feature for a course. The fake runtime exercises the same tRPC and UI contracts but
does not contact Cloudflare or a model provider.

To exercise the Worker locally, set `courseAgentRuntime` to `cloudflare`, configure
`courseAgentCapabilitySecret`, and run `make dev`. This starts PrairieLearn and the course-agent
Worker together; run `pnpm dev-course-agent-worker` to start only the Worker. Wrangler uses local
simulation and local state. Do not run `wrangler deploy` as part of local testing. The model
credential is held by the Worker and inserted only by its outbound Anthropic handler; the sandbox
receives the placeholder value `proxy-injected`.

Cloud resources and credentials used by later stack layers are intentionally not configured here.

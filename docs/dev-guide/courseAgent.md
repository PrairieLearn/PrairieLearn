# Course agent development

The course agent is experimental and guarded by the `course-agent` feature flag. The first MVP
layer provides a temporary `/workspace`, a single Claude Code harness, live activity events, and a
minimal instructor panel. The repository layer resolves the course's configured repository and
branch, shallow-clones it into `/workspace/course`, and configures an identity for local commits. It
does not persist conversations, publish changes, or track usage.

## Free local testing

Set `courseAgentRuntime` to `fake` in your existing PrairieLearn configuration and enable the
`course-agent` feature for a course. The fake runtime exercises the same tRPC and UI contracts but
does not contact Cloudflare or a model provider.

To exercise the Worker locally, set `courseAgentRuntime` to `cloudflare`, configure
`courseAgentCapabilitySecret`, and run `pnpm dev-course-agent-worker`. The script uses Wrangler's
local simulation and local state. Do not run `wrangler deploy` as part of local testing. The model
credential is held by the Worker and inserted only by its outbound Anthropic handler; the sandbox
receives the placeholder value `proxy-injected`.

The GitHub PAT is also held by the Worker. The sandbox uses `proxy-read`, and the Worker replaces it
only for `git-upload-pack` requests to the exact repository configured for that sandbox. Receive-pack,
other repositories, and other GitHub operations are rejected. The PAT is therefore available for
clone, fetch, and pull, but never for push.

Cloud resources and credentials used by later stack layers are intentionally not configured here.

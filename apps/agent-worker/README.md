# PrairieLearn agent worker

This private Worker runs one serialized course-authoring conversation per Durable Object. Agent
processes run in the pinned Cloudflare Sandbox image, use `/workspace/course`, mirror Claude sessions
to immutable R2 parts, and checkpoint Git history as verified baseline/incremental bundles. No public
endpoint accepts a command.

The service is disabled unless both `AGENT_WORKER_ENABLED=true` and
`AGENT_CAPABILITY_SECRET` are configured. PrairieLearn issues short-lived HS256 capabilities bound to
the route purpose, prompt hash, run/conversation/course, callback origin, harness, repository, and
allowed tools. Production also requires `PRAIRIELEARN_ORIGIN`; HTTP callback URLs are accepted only
with `LOCAL_DEVELOPMENT=true`.

## API

- `POST /v1/runs/start`
- `GET /v1/runs/:run_id`
- `POST /v1/runs/:run_id/cancel`
- `POST /v1/runs/:run_id/publish`
- `DELETE /v1/conversations/:conversation_id`

Publication uses a separate `purpose=publish` capability and a fresh model-free publisher sandbox.
Its exact repository, branch, HEAD, operation ID, and capability JTI are verified before a temporary
Git write handler is installed.

## Local development and recovery smoke

Docker must be running. Start the Worker from the repository root:

```sh
pnpm --filter @prairielearn/agent-worker dev
```

The dev script supplies the fixed local-only capability secret and persists Wrangler state in
`.wrangler/state`. Run the first smoke phase:

```sh
pnpm --filter @prairielearn/agent-worker test:smoke -- start /tmp/agent-smoke.json
```

After it completes, stop Wrangler, restart the same dev command (and therefore the same persisted
DO/R2 directory), then run:

```sh
pnpm --filter @prairielearn/agent-worker test:smoke -- resume /tmp/agent-smoke.json
```

The phases cover signed start/status, concurrent-turn rejection, a real deterministic harness commit,
Worker restart, sandbox destruction and R2 restore, publication and receipt replay, session resume,
cancellation, deletion, and confirmation that the conversation R2 prefix is empty. `test:smoke`
without a phase runs both halves without the explicit Worker restart.

Production secrets are `AGENT_CAPABILITY_SECRET` and, when enabled, `ANTHROPIC_API_KEY`,
`GITHUB_READ_TOKEN`, and `GITHUB_WRITE_TOKEN`. Deployable Wrangler configuration contains no secret
values.

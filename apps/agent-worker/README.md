# PrairieLearn agent worker

This app is the Cloudflare Worker and Sandbox execution boundary for PrairieLearn's course-authoring agent. The current foundation slice provides:

- a health endpoint that runs without starting a container;
- a local-only smoke endpoint that runs a fixed command in a real Cloudflare Sandbox;
- one Durable Object per conversation to serialize run-state transitions; and
- an R2 checkpoint write/read during the smoke run.

The smoke endpoint intentionally does not accept a command from the caller. Arbitrary agent commands will be introduced behind PrairieLearn-issued run authorization rather than an unauthenticated HTTP endpoint.

## Local development

Docker must be running. From the repository root:

```sh
pnpm dev-agent-worker
```

Wrangler builds the Sandbox image and persists local Durable Object and R2 state in `apps/agent-worker/.wrangler/state`.

In another terminal, verify the Worker-only route:

```sh
curl --fail-with-body --silent --show-error http://localhost:8787/health
```

Then exercise the real Sandbox, Durable Object, and R2 bindings:

```sh
pnpm --filter @prairielearn/agent-worker test:smoke
```

The first Sandbox image build can take several minutes. A successful response includes `sandbox-ok`, the installed Node and Git versions, `claude-agent-sdk-ok`, and the R2 checkpoint key.

The `LOCAL_DEVELOPMENT` binding gates this endpoint. Production configuration must omit it.

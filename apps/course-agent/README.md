# Course agent

Integration draft for [Course agent MVP](https://github.com/PrairieLearn/PrairieLearn/issues/15871).
The selected [prototype stack](https://github.com/miguelaenlle/cloudflare-agents-sdk-test/pull/21)
is the architectural reference for the native Codex adapter and sandbox lifecycle.
PL supplies the catalog, authorization, durable proposals, publication, and Course Sync.

## Ownership

```mermaid
flowchart LR
  Browser[Instructor panel] <-->|tRPC / SSE| PL[PL webserver]
  PL <-->|Authenticated HTTP / WebSocket| Chat[Chat Durable Object]
  PL --> PG[(Postgres)]
  PL --> GitHub[GitHub API publication]
  PL --> Sync[Existing Course Sync]
  Chat --> Sandbox[Sandbox / Codex app-server]
  Sandbox <-->|Latest checkpoint| R2[(R2)]
```

- `src/agent.ts`: conversation history, generic pending tools, native execution, cleanup alarms.
- `src/codex*.ts`, `src/app-server.ts`: the pinned Codex protocol and AI SDK stream adapter.
- `src/outbound.ts`, `src/sandbox.ts`: repository-scoped read credentials and model credentials outside the sandbox.
- `apps/prairielearn/src/ee/lib/course-agent`: PL authorization, event subscriptions, proposal completion, GitHub publication, and usage.
- `apps/prairielearn/src/models/course-agent-*`: Postgres entities. Decisions and their audit events commit together.
- `packages/course-agent-contract`: private transport types, with no standalone database or prototype server.

## Local development

First follow the normal PL local setup, including Postgres, Redis, Python, and `pnpm install`.
Build workspace packages with `make build` when needed. Nothing is enabled by default.

### Deterministic sandbox fixture

Run this alongside the PL development server:

```sh
pnpm --filter @prairielearn/course-agent dev:fixture
```

This runs the real Chat Durable Object in local workerd on port 8791. It replaces only
sandbox execution and Codex responses. It does not call a model or publish to GitHub.
The fixture supports `example/course` on `main`. Its predictable responses finish in eight seconds.
Test-only controls live under the fixture entry point and are absent from the production Worker.

A PL development config can opt in with:

```json
{
  "isEnterprise": true,
  "redisUrl": "redis://localhost:6379",
  "features": { "course-agent": true },
  "courseAgent": {
    "workerUrl": "http://localhost:8791",
    "serviceToken": "local-fixture-service-token-not-a-secret",
    "publicationTokens": {},
    "pricing": {}
  }
}
```

Use an editable, non-example course whose repository is `https://github.com/example/course.git`
and branch is `main`; the authenticated and effective users must both be course owners.
The browser test creates an isolated copy of PL's existing test course and configures this automatically.
Keep real publication credentials out of the fixture config.

```sh
# Portable protocol, capture, outbound, and host-tool tests
pnpm --filter @prairielearn/course-agent test

# With dev:fixture running
pnpm --filter @prairielearn/course-agent test:lifecycle
COURSE_AGENT_FIXTURE_URL=http://localhost:8791 pnpm --filter @prairielearn/prairielearn test:e2e courseAgent.spec.ts --workers=1

# PL persistence, approvals, accounting, and mocked GitHub publication
pnpm test apps/prairielearn/src/tests/courseAgent.test.ts apps/prairielearn/src/ee/lib/course-agent/publish.test.ts
```

### Real local sandbox

Docker must be running. Copy `.dev.vars.example` to `.dev.vars` in this directory,
set a shared service token, a model, a model API key, and repository-scoped **read-only** GitHub tokens.
Run `pnpm --filter @prairielearn/course-agent dev` and use port 8790 in PL's configuration.
Set PL's course repository and branch normally; the browser cannot choose the sandbox repository.
Only configure `publicationTokens` for a disposable course repository you intend to modify.
These separate write credentials stay in the PL webserver. Git publication uses GitHub APIs;
only the existing Course Sync operation accesses PL's normal course checkout.

Prices are configured by exact model name as dollars per million tokens, e.g.
`"pricing": { "your-model": { "input": 1, "cachedInput": 0.1, "output": 5 } }`.
These numbers illustrate the config shape; supply current prices for the chosen model.
Unreported usage and unpriced models display **Unknown**. Estimated costs exclude Cloudflare,
R2, and other infrastructure charges. Admission limits use reported estimated model cost,
request counts, and active conversations; they are not a hard cap on provider invoices.
Use provider-side spending controls as well before a pilot.

## Recovery

| Situation                           | Behavior                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser closes or changes pages     | Native work continues; PL keeps a host-tool/accounting observer. Reopening observes the existing stream.                                       |
| Steering acknowledgment lost        | Keep a durable receipt and reconcile the native message ID on retry; do not submit uncertain steering twice.                                   |
| Webserver exits                     | DO history and lifecycle survive. The next authorized connection reattaches; admission reconciles active execution receipts.                   |
| Ten minutes waiting for a user/tool | Checkpoint the workspace, then destroy the sandbox. One latest checkpoint is retained per conversation, with the SDK’s seven-day TTL.          |
| Backup or destruction fails         | Three total cleanup attempts, 30 seconds apart. Then show the stage and require **Retry cleanup**.                                             |
| Six hours without user interaction  | Interrupt and destroy; preserve a visible warning if the final checkpoint failed.                                                              |
| Checkpoint missing/expired          | Preserve the failure and saved PL decision; require a new conversation rather than silently creating a replacement thread.                     |
| Approval after shutdown             | Save the decision and outcome in Postgres. Restore the checkpoint and send a hidden continuation; a warm call receives its native tool result. |
| GitHub response lost                | **Retry completion** checks branch history, parent, and full tree before attempting another write.                                             |
| Branch moved                        | Reject the stale proposal without force-pushing. Prepare a new proposal.                                                                       |
| Course Sync fails                   | Preserve the published SHA and job ID. Retry sync without publishing again. The sync must contain the approved commit.                         |
| Sync webserver dies                 | PL's existing abandoned-job handling marks the job failed; an explicit completion retry can then retry sync.                                   |
| Result delivery fails               | Keep the same decision/outcome and operation ID. Retry delivery without repeating publication or a successful sync.                            |
| Feature disabled                    | Reject new conversations/messages; existing authorized history and recovery remain available while integration config is retained.             |

Only ordinary UTF-8 files are supported, with a 256 KiB proposal limit and at most 100 files.
Executable files, symlinks, submodules, `.git`, and `.github` changes are rejected.
The displayed diff is rebuilt from trusted base blobs and the exact saved file contents.

## Deployment boundary

This draft does not provision or deploy a Cloudflare account. `wrangler.jsonc` is for local development;
it is not the production account configuration. Production provisioning belongs in sysconf/Terraform:
Worker, Chat/Sandbox SQLite Durable Objects and migrations, pinned container image, private service
credential, R2 binding and backup credentials, environment-scoped secrets, and capacity limits.
Set `LOCAL_DEV` to false outside local development. Keep account IDs, tokens, and bucket credentials
out of Git. Coordinate the private contract version when deploying PL and the Worker.

Before enabling a pilot, validate a deployed Worker and R2 backup/restore, repository-specific
credentials and rotation, a small model canary, real GitHub publication and Course Sync, revocation,
multiple PL webservers, and deployment during pending approval. The automated fixtures establish
local behavior, not production readiness.

Codex is pinned to `0.155.0`, Sandbox SDK/image to `0.12.9`, Agents to `0.23.0`, and AIChatAgent to
`0.12.0`. To regenerate `src/protocol.ts`, point `CODEX_BINARY` at the matching Codex binary and run
`pnpm --filter @prairielearn/course-agent generate:protocol`; review the protocol diff and rerun tests.

# Course agent service

A Cloudflare Worker hosts private course-editing conversations behind PrairieLearn’s Enterprise `course-agent` flag. PrairieLearn owns authorization and the conversation catalog; `AIChatAgent` owns chat history, streaming, replay and Stop. The Conversation Durable Object owns sandbox lifecycle, and CourseSandbox owns container, native process and directory-backup operations.

## Configuration

Set `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and `GITHUB_READ_TOKEN` with Wrangler secrets (or copy `.dev.vars.example` to `.dev.vars` locally). The repository token needs read access to the pilot repositories. Secrets are injected by outbound Worker handlers and never enter the container or its checkpoints. The container has no general internet access; only the configured model endpoint, repository smart-HTTP read operations, and the SDK’s temporary backup grant are available. Git publication is unavailable.

Create the private `prairielearn-course-agent-checkpoints` R2 bucket before deployment. `wrangler.jsonc` configures the container image and Durable Object bindings. Container SDK and helper image are both pinned to 1.0.2; the native runtime and protocol generator are both Codex 0.163.0.

`OPENAI_MODEL` is pinned when a conversation is created. `AGENT_TURN_SECONDS` (six hours) includes setup and execution. `USER_IDLE_SECONDS` (ten minutes) starts after native termination and chat persistence. Connections, history reads and streamed progress do not extend deadlines. The container inactivity timeout covers the configured turn and idle budgets plus one hour, and is reapplied on Sandbox DO wake.

Run `pnpm --filter @prairielearn/course-agent dev` with Docker running. In PrairieLearn, set `courseAgentServiceUrl`, set `courseAgentServiceToken` to exactly match `PL_SERVICE_TOKEN`, and enable `features: { "course-agent": true }`. Use a course owner and a course configured with a GitHub repository and branch.

## Lifecycle and recovery

Creation binds a repository and branch without starting a container. First send clones that branch; later turns reuse the native thread. Only the newest input is submitted. Stop interrupts native work and confirms quiescence before another turn is admitted. Closing or switching the panel leaves execution running.

After idle expiry, the service stops native writers, backs up `/workspace/session` with `DirectoryBackup`, commits its returned reference, then destroys the container. A later send restores that checkpoint before resuming the native thread. A fresh random sandbox ID identifies every newly provisioned runtime. Caches, dependencies and native authentication files are excluded from backups.

Uncertain execution enters `blocked`. Resume durably admits recovery; it never repeats the old prompt. Startup failures discard incomplete setup while preserving the committed checkpoint. Runtime and checkpoint failures require quiescence and a new checkpoint. Cleanup failures retain the sandbox ID and committed archive for destruction retry. Missing live workspace data stays blocked rather than silently restoring older edits. Existing text-only conversations retain readable history; start a new conversation to edit files.

Only SDK-buffered output can be replayed after a restart. Native output that never reached the SDK cannot be recovered through reconnect.

## Private service endpoints

All endpoints require `Authorization: Bearer <PL_SERVICE_TOKEN>`:

- `POST /conversations` accepts `{ repository: "owner/name", branch: "branch" }` and returns `201 { id }` after initialization.
- `POST /conversations/{uuid}/resume` returns `202 { accepted: true }` for durably admitted recovery, `409` when unavailable or already admitted, and `503` if scheduling fails.
- `GET /conversations/{uuid}` upgrades to the native SDK chat WebSocket.
- `GET /conversations/{uuid}/get-messages` returns SDK history.

PrairieLearn’s owner- and creator-scoped tRPC routes create and recover conversations. Its existing authenticated proxy carries SDK traffic without parsing native Codex messages. Native stdio is carried only by private Container exec and Durable Object RPC; there is no public native-server route or container listening port.

## Protocol generation and validation

Run `pnpm --filter @prairielearn/course-agent generate-protocol` after changing the exact Codex dependency, and update the Dockerfile to match. The script invokes the pinned CLI, adds ESM import suffixes, and formats its generated types and aggregate JSON schema. CI regenerates and checks tracked changes and new files.

Focused tests cover native termination, stream adaptation, lost acceptance, and PrairieLearn authorization/binding/recovery. Before enabling a pilot, verify real outbound restrictions, credential exclusion, native child-process termination, backup replacement/restore and failed destruction in a deployed sandbox, then exercise reconnect, Stop and Resume through the PL proxy. Publication, push sync, approvals, accounting and rich tool cards remain separate work.

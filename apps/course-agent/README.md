# Course agent service

A Cloudflare Worker hosts private course-editing conversations behind PrairieLearn’s Enterprise `course-agent` flag. PrairieLearn owns authorization and the conversation catalog; `AIChatAgent` owns chat history, streaming, replay and Stop. The Conversation Durable Object owns sandbox lifecycle and one private persisted record. SandboxTurn owns each in-memory execution, and CourseSandbox owns container, native process and directory-backup operations. See [the execution contract](CONTRACT.md).

## Configuration

Set `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and `GITHUB_READ_TOKEN` with Wrangler secrets (or copy `.dev.vars.example` to `.dev.vars` locally). The repository token needs read access to the pilot repositories. Secrets are injected by outbound Worker handlers and never enter the container or its checkpoints. The container has no general internet access; only the configured model endpoint, repository smart-HTTP read operations, and the SDK’s temporary backup grant are available. Git publication is unavailable.

Create the private `prairielearn-course-agent-checkpoints` R2 bucket before deployment. `wrangler.jsonc` configures the container image and Durable Object bindings. Container SDK and helper image are both pinned to 1.0.2; the native runtime and protocol generator are both Codex 0.163.0.

`OPENAI_MODEL` is pinned when a conversation is created. `AGENT_TURN_SECONDS` (six hours) includes setup and execution. `USER_IDLE_SECONDS` (ten minutes) starts after native termination and chat persistence. Connections, history reads and streamed progress do not extend deadlines. In PrairieLearn development mode, the chat’s Stats button shows lifecycle state and a live countdown derived from the public `deadlineAt` timestamp. The container inactivity timeout covers the configured turn and idle budgets plus one hour, and is reapplied on Sandbox DO wake.

Run `pnpm --filter @prairielearn/course-agent dev` with Docker running. In PrairieLearn, set `courseAgentServiceUrl`, set `courseAgentServiceToken` to exactly match `PL_SERVICE_TOKEN`, and enable `features: { "course-agent": true }`. Use a course owner and a course configured with a GitHub repository and branch.

## Lifecycle and recovery

Creation binds a repository and branch without starting a container. First send clones that branch; later turns reuse the native thread. Only the newest input is submitted. Stop interrupts native work and verifies that agent/tool processes have stopped before another turn is admitted. Turn deadline expiry also backs up and shuts down the workspace. Closing or switching the panel leaves execution running.

After idle expiry, the service stops native writers, backs up `/workspace/session` with `DirectoryBackup`, commits its returned reference, then destroys the container. A later send restores that checkpoint before resuming the native thread. A fresh random sandbox ID identifies every newly provisioned runtime. Caches, dependencies and native authentication files are excluded from backups.

Uncertain execution enters `blocked`. Resume waits for recovery to finish; it never repeats the old prompt. Concurrent recovery is rejected. A failed or interrupted recovery requires another explicit Resume. Startup failures discard incomplete setup while preserving the committed checkpoint. Runtime and checkpoint failures require stopped processes and a new checkpoint. Cleanup failures retain the sandbox ID and committed archive for destruction retry. Missing live workspace data stays blocked rather than silently restoring older edits.

Only SDK-buffered output can be replayed after a restart. Native output that never reached the SDK cannot be recovered through reconnect.

## Private service endpoints

All endpoints require `Authorization: Bearer <PL_SERVICE_TOKEN>`:

- `POST /conversations` accepts `{ repository: "owner/name", branch: "branch" }` and returns `201 { id }` after initialization.
- `POST /conversations/{uuid}/resume` returns `200 { recovered: true }` after recovery completes, `409` when unavailable or already recovering, and `503` if recovery fails.
- `GET /conversations/{uuid}` upgrades to the native SDK chat WebSocket.
- `GET /conversations/{uuid}/get-messages` returns SDK history.

PrairieLearn’s owner- and creator-scoped tRPC routes create and recover conversations. Its existing authenticated proxy carries SDK traffic without parsing native Codex messages. The conversation connects to Codex over a private WebSocket through the CourseSandbox DO binding. CourseSandbox forwards upgrades to the container port and injects a fresh capability token; only its hash reaches the runner, and neither value enters a checkpoint. There is no public native-server route. Process execution still uses private Container exec.

## Protocol generation and validation

Run `pnpm --filter @prairielearn/course-agent generate-protocol` after changing the exact Codex dependency, and update the Dockerfile to match. The script invokes the pinned CLI, adds ESM import suffixes, and compiles runtime validators from its JSON Schema with Ajv. Generated validators are bundled during generation, so the Worker does not compile schemas or use dynamic evaluation. CI regenerates and checks tracked changes and new files.

`protocol-methods.json` contains only the request-to-result schema associations and notification names used by the chat adapter. Request parameters and notification payloads come directly from the generated protocol. Add a catalog entry to use another method without changing transport code. `vscode-jsonrpc` owns request correlation and notification/server-request dispatch. `codex-connection.ts` adapts the accepted Cloudflare WebSocket and normalizes Codex’s omitted JSON-RPC version field. `CodexAppServerClient` validates generated payloads, bounds command waits, initializes the native session, and converts output to chat chunks. Unsupported server requests receive a method-not-found error.

Malformed messages and invalid response or subscribed-notification payloads fail the connection and pending work. Unknown notifications and late replies are ignored. Connection loss and command timeouts never replay a prompt. Codex currently labels WebSocket transport experimental and unsupported for production; deployed validation is required before enabling a pilot.

Focused tests cover native termination, stream adaptation, lost acceptance, and PrairieLearn authorization/binding/recovery. Before enabling a pilot, verify real outbound restrictions, credential exclusion, native child-process termination, backup replacement/restore and failed destruction in a deployed sandbox, then exercise reconnect, Stop and Resume through the PL proxy. Publication, push sync, approvals, accounting and rich tool cards remain separate work.

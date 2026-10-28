# Course agent service

A Cloudflare Worker hosts private course-editing conversations behind PrairieLearn’s Enterprise `course-agent` flag. PrairieLearn owns authorization and the conversation catalog; `AIChatAgent` owns chat history, streaming, replay and Stop. The Conversation Durable Object owns sandbox lifecycle and one private persisted record. SandboxTurn owns each in-memory execution, and CourseSandbox owns container, native process and directory-backup operations. See [the execution contract](CONTRACT.md).

## Configuration

Set `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and `GITHUB_READ_TOKEN` with Wrangler secrets (or copy `.dev.vars.example` to `.dev.vars` locally). The repository token needs read access to the pilot repositories. Secrets are injected by outbound Worker handlers and never enter the container or its checkpoints. The container has no general internet access; only the configured model endpoint, repository smart-HTTP read operations, and the SDK’s temporary backup grant are available. The container cannot publish; PrairieLearn performs approved publication and Course Sync outside it.

Create the private `prairielearn-course-agent-checkpoints` R2 bucket before deployment. `wrangler.jsonc` configures the container image and Durable Object bindings. Container SDK and helper image are both pinned to 1.0.2; the native runtime and protocol generator are both Codex 0.163.0.

`OPENAI_MODEL` is pinned when a conversation is created. `AGENT_TURN_SECONDS` (six hours) includes setup and execution. `USER_IDLE_SECONDS` (ten minutes) starts after normal turn cleanup and chat persistence, or after a review card has been persisted while the native tool waits for a decision. Connections, history reads and streamed progress do not extend deadlines. In PrairieLearn development mode, the chat’s Stats button shows lifecycle state and a live countdown derived from the public `deadlineAt` timestamp. The container inactivity timeout covers the configured turn and idle budgets plus one hour, and is reapplied on Sandbox DO wake.

Run `pnpm --filter @prairielearn/course-agent dev` with Docker running. In PrairieLearn, set `courseAgentServiceUrl`, set `courseAgentServiceToken` to exactly match `PL_SERVICE_TOKEN`, and enable `features: { "course-agent": true }`. Use a course owner and a course configured with a GitHub repository and branch. Set PL `githubClientToken` to an API credential with write access to that repository. Configure Worker `PL_SERVICE_URL` to the PrairieLearn origin (the local default is `http://localhost:3000`) so Resume can retrieve saved job outcomes.

## Lifecycle and recovery

The + button opens a local draft. First send creates the conversation and its title, binding a repository and branch without starting a container. First send clones that branch; later turns reuse the native thread. Only the newest input is submitted. Stop interrupts native work and verifies that agent/tool processes have stopped before another turn is admitted. Turn deadline expiry also backs up and shuts down the workspace. Closing or switching the panel leaves execution running. The selected conversation is retained per tab in session storage.

After idle expiry, the service stops native writers, backs up `/workspace/session` with `DirectoryBackup`, commits its returned reference, then destroys the container. A later send restores that checkpoint before resuming the native thread. A fresh random sandbox ID identifies every newly provisioned runtime. Caches, dependencies and native authentication files are excluded from backups.

Uncertain execution enters `blocked`. Resume waits for recovery to finish; it never repeats the old prompt. Concurrent recovery is rejected. A failed or interrupted recovery requires another explicit Resume. Startup failures discard incomplete setup while preserving the committed checkpoint. Runtime and checkpoint failures require stopped processes and a new checkpoint. Cleanup failures retain the sandbox ID and committed archive for destruction retry. Missing live workspace data stays blocked rather than silently restoring older edits.

Only SDK-buffered output can be replayed after a restart. Native output that never reached the SDK cannot be recovered through reconnect.

## Private service endpoints

All endpoints require `Authorization: Bearer <PL_SERVICE_TOKEN>`:

- `POST /conversations` accepts `{ repository: "owner/name", branch: "branch" }` and returns `201 { id }` after initialization.
- `POST /conversations/{uuid}/resume` returns `200 { recovered: true }` after recovery completes, `409` when unavailable or already recovering, and `503` if recovery fails.
- `GET /conversations/{uuid}` upgrades to the native SDK chat WebSocket.
- `GET /conversations/{uuid}/get-messages` returns SDK history.
- `GET /conversations/{uuid}/pending-review` returns the DO-owned full-file snapshot, card identity, status, and PL job reference, or `null`.
- `POST /conversations/{uuid}/pending-review/decision` accepts `{ callId, decision, jobSequenceId }` for approval or `{ callId, decision }` for denial, and claims the operation before publication. Identical decisions succeed; conflicts return `409`.
- `POST /conversations/{uuid}/pending-review/outcome` accepts `{ callId, result }` after a PrairieLearn review decision. It acknowledges SDK persistence; conflicting redelivery returns `409`.

PrairieLearn’s owner- and creator-scoped tRPC routes create and recover conversations. Its existing authenticated proxy carries SDK traffic without parsing native Codex messages. The conversation connects to Codex over a private WebSocket through the CourseSandbox DO binding. CourseSandbox forwards upgrades to the container port and injects a fresh capability token; only its hash reaches the runner, and neither value enters a checkpoint. There is no public native-server route. Process execution still uses private Container exec.

## Protocol generation and validation

Run `pnpm --filter @prairielearn/course-agent generate-protocol` after changing the exact Codex dependency, and update the Dockerfile to match. The script invokes the pinned CLI with `--experimental`, adds ESM import suffixes, and retains only types imported by application code and their transitive dependencies. Regenerate after adding or removing protocol imports, too. CI regenerates and checks tracked changes and new files.

Outgoing requests are checked against the generated types with TypeScript. Incoming replies and subscribed notifications use small Zod schemas in `codex.ts` that validate only fields the adapter consumes, ignoring additional data. Initialization and interrupt acknowledgments require only a JSON object. Native connections opt into the experimental API during initialization. `vscode-jsonrpc` owns request correlation and notification/server-request dispatch. `codex-connection.ts` adapts the accepted Cloudflare WebSocket and normalizes Codex’s omitted JSON-RPC version field. `CodexAppServerClient` bounds command waits, initializes the native session, and converts output to chat chunks. Unsupported server requests receive a method-not-found error.

Malformed messages and invalid consumed fields in replies or subscribed notifications fail the connection and pending work. Unknown notifications and late replies are ignored. Connection loss and command timeouts never replay a prompt. Codex currently labels WebSocket transport experimental and unsupported for production; deployed validation is required before enabling a pilot.

Focused tests cover native termination, stream adaptation, lost acceptance, and PrairieLearn authorization/binding/recovery. Before enabling a pilot, verify real outbound restrictions, credential exclusion, native child-process termination, backup replacement/restore and failed destruction in a deployed sandbox, then exercise reconnect, Stop and Resume through the PL proxy. Review cards wait for a PrairieLearn approval or denial result. Idle expiry checkpoints a pending review; the saved result continues the restored native thread without repeating the user prompt. Accounting remains separate work.

### Push sync

The Conversation DO owns the pending snapshot; PL adds no table or conversation column. PL publishes the reviewed full-file contents using Octokit GraphQL, runs Course Sync, and stores the outcome in the existing job record before attempting one callback. Native call IDs identify reviews; there is no extra request UUID.

Explicit Resume recovers a missed callback through PL's service-authenticated `GET /pl/api/course-agent/conversations/{uuid}/jobs/{jobSequenceId}/outcome`. The route returns `{ callId, jobSequenceId, status, result, error }`; status is running, completed, or blocked. Before ordinary job completion, callId may be null. Interrupted publication requires inspection and is never automatically retried. There is no PL delivery cron.

Snapshot limits are 100 files, 64 KiB decoded per file, and 1 MiB of base64 contents. Only non-executable regular files are supported initially. GitHub attributes commits to the API credential. The agent handles fetching published changes into its sandbox. See [CONTRACT.md](CONTRACT.md#pending-reviews-and-publication-outcomes) for persistence and recovery.

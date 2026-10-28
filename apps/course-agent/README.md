# Course agent service

A Cloudflare Worker hosts private course-editing conversations behind PrairieLearn’s Enterprise `course-agent` flag. PrairieLearn owns authorization and the conversation catalog; `AIChatAgent` owns chat history, streaming, replay and Stop. The Conversation Durable Object owns sandbox lifecycle and one private persisted record. SandboxTurn owns each in-memory execution, and CourseSandbox owns container, native process and directory-backup operations. See [the execution contract](CONTRACT.md).

## Configuration

Set `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and `GITHUB_READ_TOKEN` with Wrangler secrets (or copy `.dev.vars.example` to `.dev.vars` locally). The repository token needs read access to the pilot repositories. Secrets are injected by outbound Worker handlers and never enter the container or its checkpoints. The container has no general internet access; only the configured model endpoint, repository smart-HTTP read operations, and the SDK’s temporary backup grant are available. Git publication is unavailable.

Create the private `prairielearn-course-agent-checkpoints` R2 bucket before deployment. `wrangler.jsonc` configures the container image and Durable Object bindings. Container SDK and helper image are both pinned to 1.0.2; the native runtime and protocol generator are both Codex 0.163.0.

`OPENAI_MODEL` is pinned when a conversation is created. `AGENT_TURN_SECONDS` (six hours) includes setup and execution. `USER_IDLE_SECONDS` (ten minutes) starts after native termination and chat persistence. Connections, history reads and streamed progress do not extend deadlines. In PrairieLearn development mode, the chat’s Stats button shows lifecycle state and a live countdown derived from the public `deadlineAt` timestamp. The container inactivity timeout covers the configured turn and idle budgets plus one hour, and is reapplied on Sandbox DO wake.

## Local development

Assumes a working [native PrairieLearn development setup](../../docs/dev-guide/installingNative.md) and Docker running. Run commands from the repository root.

Copy the Worker secrets template:

```sh
cp apps/course-agent/.dev.vars.example apps/course-agent/.dev.vars
```

Set `OPENAI_API_KEY`, `GITHUB_READ_TOKEN` with read access to the course repository, and a random `PL_SERVICE_TOKEN` in `.dev.vars` (e.g. generate the service token with `openssl rand -hex 32`).

Merge the following into `apps/prairielearn/config.json`, using the same service token:

```json
{
  "isEnterprise": true,
  "courseAgentServiceUrl": "http://127.0.0.1:8790",
  "courseAgentServiceToken": "paste-the-same-PL_SERVICE_TOKEN-here",
  "features": {
    "course-agent": true
  }
}
```

Start the Worker:

```sh
pnpm --filter @prairielearn/course-agent dev
```

Wrangler builds the sandbox image and manages local containers and R2 storage. No deployed Worker or R2 bucket is needed; local state is kept in `apps/course-agent/.wrangler/local`.

Start PrairieLearn in a second terminal:

```sh
make dev
```

At [Global Admin → Courses](http://localhost:3000/pl/administrator/courses), set a non-example course's repository to its GitHub URL and its branch to an existing branch. Open an instructor page in that course, click the stars button, and send a message in a new conversation. Both the authenticated and effective user must have Owner permission. The first message starts the sandbox and clones the configured GitHub branch; local course-file changes are not copied into it.

### HTTP requests

Set `PL_SERVICE_TOKEN` in your shell to the value from `.dev.vars`. Create a conversation, replacing the repository and branch with your course's values:

```sh
curl --fail-with-body -X POST -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"repository":"owner/repo","branch":"main"}' \
  http://localhost:8790/conversations
```

Set `conversation_id` to the returned `id`, then fetch its saved history:

```sh
curl --fail-with-body -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  "http://localhost:8790/conversations/$conversation_id/get-messages"
```

These requests do not start a sandbox or add the conversation to PrairieLearn's catalog. Send messages through PrairieLearn to use the sandbox.

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

PrairieLearn’s owner- and creator-scoped tRPC routes create and recover conversations. Its existing authenticated proxy carries SDK traffic without parsing native Codex messages. The conversation connects to Codex over a private WebSocket through the CourseSandbox DO binding. CourseSandbox forwards upgrades to the container port and injects a fresh capability token; only its hash reaches the runner, and neither value enters a checkpoint. There is no public native-server route. Process execution still uses private Container exec.

## Protocol generation and validation

Run `pnpm --filter @prairielearn/course-agent generate-protocol` after changing the exact Codex dependency, and update the Dockerfile to match. The script invokes the pinned CLI with `--experimental`, adds ESM import suffixes, and retains only types imported by application code and their transitive dependencies. Regenerate after adding or removing protocol imports, too. CI regenerates and checks tracked changes and new files.

Outgoing requests are checked against the generated types with TypeScript. Incoming replies and subscribed notifications use small Zod schemas in `codex.ts` that validate only fields the adapter consumes, ignoring additional data. Initialization and interrupt acknowledgments require only a JSON object. Native connections opt into the experimental API during initialization. `vscode-jsonrpc` owns request correlation and notification/server-request dispatch. `codex-connection.ts` adapts the accepted Cloudflare WebSocket and normalizes Codex’s omitted JSON-RPC version field. `CodexAppServerClient` bounds command waits, initializes the native session, and converts output to chat chunks. Unsupported server requests receive a method-not-found error.

Malformed messages and invalid consumed fields in replies or subscribed notifications fail the connection and pending work. Unknown notifications and late replies are ignored. Connection loss and command timeouts never replay a prompt. Codex currently labels WebSocket transport experimental and unsupported for production; deployed validation is required before enabling a pilot.

Focused tests cover native termination, stream adaptation, lost acceptance, and PrairieLearn authorization/binding/recovery. Before enabling a pilot, verify real outbound restrictions, credential exclusion, native child-process termination, backup replacement/restore and failed destruction in a deployed sandbox, then exercise reconnect, Stop and Resume through the PL proxy. Publication, push sync, approvals, accounting and rich tool cards remain separate work.

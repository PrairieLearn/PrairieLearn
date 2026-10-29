# Course agent service

A Cloudflare Worker hosts private course-editing conversations behind PrairieLearn’s Enterprise `course-agent` flag. PrairieLearn owns authorization and the conversation catalog; `AIChatAgent` owns chat history, streaming, replay and Stop. The Conversation Durable Object owns sandbox lifecycle and one private persisted record. SandboxTurn owns each in-memory execution, and CourseSandbox owns container, native process and directory-backup operations. See [the execution contract](CONTRACT.md).

## Configuration

Set `PL_SERVICE_TOKEN` and `OPENAI_API_KEY` with Wrangler secrets (or copy `.dev.vars.example` to `.dev.vars` locally). GitHub-backed conversations additionally require `GITHUB_READ_TOKEN` with read access to the course repository. Secrets are injected by outbound Worker handlers and never enter the container or its checkpoints. The container has no general internet access; only the configured model endpoint, repository smart-HTTP read operations, and the SDK’s temporary backup grant are available. The container cannot publish; PrairieLearn performs approved publication and Course Sync outside it.

Create the private `prairielearn-course-agent-checkpoints` R2 bucket before deployment. `wrangler.jsonc` configures the container image and Durable Object bindings.

`OPENAI_MODEL` is pinned when a conversation is created. `AGENT_TURN_SECONDS` (six hours) includes setup and execution. `USER_IDLE_SECONDS` (ten minutes) starts after normal turn completion and chat persistence, or after a review card has been persisted while the native tool waits for a decision. Connections, history reads and streamed progress do not extend deadlines. In PrairieLearn development mode, the chat’s Stats button shows lifecycle state and a live countdown derived from the public `deadlineAt` timestamp. The container inactivity timeout covers the configured turn and idle budgets plus one hour, and is reapplied on Sandbox DO wake.

## Local development

Assumes a working [native PrairieLearn development setup](../../docs/dev-guide/installingNative.md) and Docker running. Run commands from the repository root.

Copy the Worker secrets template:

```sh
cp apps/course-agent/.dev.vars.example apps/course-agent/.dev.vars
```

Set `OPENAI_API_KEY` and a random `PL_SERVICE_TOKEN` in `.dev.vars` (e.g. generate the service token with `openssl rand -hex 32`). Leave `GITHUB_READ_TOKEN` empty for the default local-file setup, which does not require a GitHub token or a course repository URL. Wrangler must still declare its name in `secrets.required` so it loads the value from `.dev.vars` when GitHub mode is enabled.

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

For GitHub publication, set `fileEditorUseGit: true`, configure the course repository and branch, and set PrairieLearn `githubClientToken` to an API credential with write access. Worker `PL_SERVICE_URL` defaults to `http://localhost:3000`; change it to your PrairieLearn origin if different so Resume can retrieve saved job outcomes.

Start the Worker:

```sh
pnpm --filter @prairielearn/course-agent dev
```

Wrangler builds the sandbox image and manages local containers and R2 storage. No deployed Worker or R2 bucket is needed; local state is kept in `apps/course-agent/.wrangler/local`.

Start PrairieLearn in a second terminal:

```sh
make dev
```

Open [http://localhost:3000](http://localhost:3000), navigate to an instructor page in a non-example course (e.g. Test Course), click the stars button, and send a message in a new conversation. Both the authenticated and effective user must have Owner permission.

In PrairieLearn dev mode with the default `fileEditorUseGit: false`, creation copies current course files, including uncommitted edits, and exports their Git history using standard Git. Nested courses such as `testCourse` include only that directory’s history. Host Git metadata and dependency/cache directories are excluded. The first message unpacks the snapshot into the sandbox and commits a private baseline on top of the imported history. Courses without Git history start with just that baseline. Sandbox edits remain in that conversation; this PR does not save them back to the local course files.

### HTTP requests

Set `PL_SERVICE_TOKEN` in your shell to the value from `.dev.vars`. Create a conversation from local course files:

```sh
tar --exclude=.git --exclude=node_modules --exclude=.venv --exclude=__pycache__ \
  -czf - -C testCourse . \
  | curl --fail-with-body -X POST -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
    -H 'Content-Type: application/gzip' --data-binary @- \
    http://localhost:8790/conversations/local
```

Set `conversation_id` to the returned `id`, then fetch its saved history:

```sh
curl --fail-with-body -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  "http://localhost:8790/conversations/$conversation_id/get-messages"
```

These requests do not start a sandbox or add the conversation to PrairieLearn's catalog. Send messages through PrairieLearn to use the sandbox.

## Lifecycle and recovery

The + button opens a local draft. First send creates the conversation and its title without starting a container. In dev mode it snapshots local course files; otherwise it binds a GitHub repository and branch. Execution unpacks the local snapshot or clones that branch; later turns reuse the running Codex connection and native thread. Only the newest input is submitted. Ordinary turn completion leaves Codex and background tools running until the next message or workspace cleanup. Stop interrupts the turn and terminates all agent/tool processes before another turn is admitted; the container and edited files remain available. Turn deadline expiry also backs up and shuts down the workspace. Closing or switching the panel leaves execution running. The selected conversation is retained per tab in session storage.

After idle expiry, the service stops native writers, backs up `/workspace/session` with `DirectoryBackup`, commits its returned reference, then destroys the container. A later send restores that checkpoint before resuming the native thread. A fresh random sandbox ID identifies every newly provisioned runtime. Caches, dependencies and native authentication files are excluded from backups.

Uncertain execution enters `blocked`. Resume waits for recovery to finish; it never repeats the old prompt. Concurrent recovery is rejected. A failed or interrupted recovery requires another explicit Resume. Startup failures discard incomplete setup while preserving the committed checkpoint. Runtime and checkpoint failures require stopped processes and a new checkpoint. Cleanup failures retain the sandbox ID and committed archive for destruction retry. Missing live workspace data stays blocked rather than silently restoring older edits.

Browser refresh or disconnect leaves execution running; the SDK replays saved output on reconnect. A Worker/DO restart loses the native connection. Output that Codex generated before it reached the SDK may be missing from the chat even when the associated file edit completed. The interrupted turn is marked blocked, with a warning that its reply may be incomplete. Resume recovers the workspace without resubmitting the old prompt. Recovering completed answers from persisted native thread history is follow-up work; this PR does not promise reconstruction of missing output.

## Private service endpoints

All endpoints require `Authorization: Bearer <PL_SERVICE_TOKEN>`:

- `POST /conversations/local` accepts a gzip tar archive of course files and optional Git history and returns `201 { id }`. For a course nested in the archived repository, `X-PL-Course-Directory` specifies its URL-encoded relative directory. The initial archive is deleted after the first successful checkpoint.
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

## Deployment environments and monitoring

Use `pnpm --filter @prairielearn/course-agent deploy --env staging` or `--env production`. The top-level configuration is for local development. Each named environment has its own Worker, Durable Object bindings/storage, checkpoint bucket, model/deadline vars, and secrets. Resource bindings are repeated explicitly because Wrangler does not inherit them into named environments. Container image configuration is shared; the container instances belong to each environment's separate Durable Objects.

Create the matching checkpoint bucket and configure `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and (for GitHub course sources) `GITHUB_READ_TOKEN` separately for each deployed environment. Configure PL to use the matching Worker URL and service token. Do not point staging at production conversation storage or checkpoints. Set `PL_SERVICE_URL` to the matching PrairieLearn origin in each deployed environment so Resume can retrieve saved publication outcomes. No deployment or resource provisioning is performed by local checks.

Set that environment's `SENTRY_DSN` to enable error reporting. `SENTRY_ENVIRONMENT` and Worker version metadata identify the deployment. Reports cover Worker handlers, Durable Object/RPC operations, and handled background lifecycle failures. Reports include request URLs without query parameters and headers, including course context, with Sentry's default sensitive-header filtering. Request bodies, cookies, IP addresses, and breadcrumbs are not attached. Model and service credentials are redacted from exception messages. Local reporting is disabled while the DSN is empty.

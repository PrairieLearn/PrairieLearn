# Course agent service

A Cloudflare Worker runs private course-editing conversations behind PrairieLearn’s Enterprise `course-agent` flag. Instructors review the agent’s proposed changes before PrairieLearn saves them to the course. This guide covers setup, operation, and development. See [CONTRACT.md](CONTRACT.md) for state ownership, protocol behavior, and recovery guarantees.

## Configuration

Set `PL_SERVICE_TOKEN` and `OPENAI_API_KEY` with Wrangler secrets (or copy `.dev.vars.example` to `.dev.vars` locally). GitHub-backed conversations additionally require `GITHUB_READ_TOKEN` with read access to the course repository. Secrets are injected by outbound Worker handlers and never enter the container or its checkpoints. The container has no general internet access; only the configured model endpoint, repository smart-HTTP read operations, and the SDK’s temporary backup grant are available. PrairieLearn saves approved changes and syncs the course using its file editor workflow. The container has no write access to the course repository.

Create the private `prairielearn-course-agent-checkpoints` R2 bucket before deployment. `wrangler.jsonc` configures the container image and Durable Object bindings.

`OPENAI_MODEL` is pinned when a conversation is created. `AGENT_TURN_SECONDS` (six hours) includes setup and execution. `USER_IDLE_SECONDS` (ten minutes) starts after normal turn completion and chat persistence, or after a request for instructor review has been saved to chat history. Connections, history reads and streamed progress do not extend deadlines. In PrairieLearn development mode, the chat’s Stats button shows lifecycle state and a live countdown derived from the public `deadlineAt` timestamp.

## Local development

Assumes a working [native PrairieLearn development setup](../../docs/dev-guide/installingNative.md) and Docker running. Run commands from the repository root.

Copy the Worker secrets template:

```sh
cp apps/course-agent/.dev.vars.example apps/course-agent/.dev.vars
```

Set `OPENAI_API_KEY` and a random `PL_SERVICE_TOKEN` in `.dev.vars` (e.g. generate the service token with `openssl rand -hex 32`). The default local setup does not require a GitHub token or a course repository URL.

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

To commit and push approved changes, set `fileEditorUseGit: true`, configure the course repository and branch, and configure PrairieLearn’s normal Git credentials with write access to that repository. Worker `PL_SERVICE_URL` defaults to `http://localhost:3000`; change it to your PrairieLearn origin if different so Resume can retrieve saved job outcomes.

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

With the default `fileEditorUseGit: false`, a new conversation starts from current local course files, including uncommitted edits, and their Git history. Sandbox edits stay private until the instructor approves them. See [Reviewing course edits](#reviewing-course-edits) for save behavior and limitations.

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

The + button opens a draft; the first message creates the conversation. In development it starts from local course files; otherwise it uses the configured GitHub repository and branch. Later messages reuse the workspace. Closing the panel or disconnecting leaves execution running. Stop interrupts the current turn and stops agent processes while retaining the workspace.

After the turn deadline or idle timeout, the service backs up the workspace and shuts down the container. The next message restores that backup. Connections, history reads, and streamed progress do not extend these deadlines.

If an operation fails or a Worker restarts during execution, the conversation becomes blocked. Resume repairs the workspace without repeating the interrupted prompt. It can also retrieve a saved review outcome if the callback from PrairieLearn was missed. If recovery fails, inspect the error before trying Resume again.

Saved chat output is replayed on reconnect. Output lost before it reached chat history may be missing even if the associated file edits completed. Resume preserves those edits but does not reconstruct the missing reply. See [Backup and recovery](CONTRACT.md#backup-and-recovery) for failure handling.

## Private service endpoints

All endpoints require `Authorization: Bearer <PL_SERVICE_TOKEN>`:

- `POST /conversations/local` accepts a gzip tar archive of course files and optional Git history and returns `201 { id }`. For a course nested in the archived repository, `X-PL-Course-Directory` specifies its URL-encoded relative directory. The initial archive is deleted after the first successful checkpoint.
- `POST /conversations` accepts `{ repository: "owner/name", branch: "branch" }` and returns `201 { id }` after initialization.
- `POST /conversations/{uuid}/resume` returns `200 { recovered: true }` after recovery completes, `409` when unavailable or already recovering, and `503` if recovery fails.
- `GET /conversations/{uuid}` upgrades to the native SDK chat WebSocket.
- `GET /conversations/{uuid}/get-messages` returns SDK history.
- `GET /conversations/{uuid}/pending-review` returns the captured files, chat message/tool-part IDs, status, and PrairieLearn job ID, or `null`.
- `POST /conversations/{uuid}/pending-review/decision` accepts `{ callId, decision, jobSequenceId }` for approval or `{ callId, decision }` for denial, and records the decision before saving files. Identical decisions succeed; conflicts return `409`.
- `POST /conversations/{uuid}/pending-review/outcome` accepts `{ callId, result }` after a PrairieLearn review decision. It acknowledges SDK persistence; conflicting redelivery returns `409`.

PrairieLearn’s tRPC routes check course ownership and conversation ownership before creating or recovering conversations. Its authenticated proxy carries chat traffic. Native Codex connections are private to the Worker and sandbox; see [Native protocol boundary](CONTRACT.md#native-protocol-boundary).

## Protocol generation and validation

Run `pnpm --filter @prairielearn/course-agent generate-protocol` after changing the exact Codex dependency, and update the Dockerfile to match. The script invokes the pinned CLI with `--experimental`, adds ESM import suffixes, and retains only types imported by application code and their transitive dependencies. Regenerate after adding or removing protocol imports, too. CI regenerates and checks tracked changes and new files.

Outgoing requests are checked against generated TypeScript types. Incoming replies and notifications are validated with Zod for the fields the adapter consumes. See [Native protocol boundary](CONTRACT.md#native-protocol-boundary) for validation and connection failure behavior.

Focused tests cover native turns, authentication, review decisions, save/sync outcomes, and local baseline capture. Before enabling a pilot, verify outbound restrictions, credential exclusion, process termination, and backup/restore in a deployed sandbox, then exercise approval, commit/push, reconnect, Stop, and Resume through PrairieLearn’s proxy. Codex labels the WebSocket transport experimental and unsupported for production.

## Deployment environments and monitoring

Use `pnpm --filter @prairielearn/course-agent deploy --env staging` or `--env production`. The top-level configuration is for local development. Each named environment has its own Worker, Durable Object bindings/storage, checkpoint bucket, model/deadline vars, and secrets. Resource bindings are repeated explicitly because Wrangler does not inherit them into named environments. Container image configuration is shared; the container instances belong to each environment's separate Durable Objects.

Create the matching checkpoint bucket and configure `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and (for GitHub course sources) `GITHUB_READ_TOKEN` separately for each deployed environment. Configure PL to use the matching Worker URL and service token. Do not point staging at production conversation storage or checkpoints. Set `PL_SERVICE_URL` to the matching PrairieLearn origin in each deployed environment so Resume can retrieve saved job outcomes.

Set that environment's `SENTRY_DSN` to enable error reporting. `SENTRY_ENVIRONMENT` and Worker version metadata identify the deployment. Reports cover Worker handlers, Durable Object/RPC operations, and handled background lifecycle failures. Reports include request URLs without query parameters and headers, including course context, with Sentry's default sensitive-header filtering. Request bodies, cookies, IP addresses, and breadcrumbs are not attached. Model and service credentials are redacted from exception messages. Local reporting is disabled while the DSN is empty.

## Reviewing course edits

The agent calls `request_changes` to capture files for review. The chat shows View changes, Approve, and Deny controls. Approval saves the captured files through PrairieLearn’s upload/delete editors and syncs the course. With `fileEditorUseGit: true`, the editor commits and pushes using the approving instructor’s name and email and PrairieLearn’s configured Git credentials. With `fileEditorUseGit: false` in development, it saves locally without committing or pushing. Denial leaves the edits private to the conversation.

Approval can overwrite course edits made since the snapshot was captured. A save can succeed while syncing fails; the chat reports the two outcomes separately and includes sync diagnostics. After a Git save, the agent fetches and reconciles the changes in its sandbox before continuing.

Reviews support up to 100 non-executable regular files, 64 KiB decoded per file, and 1 MiB of base64 contents in total. Local reviews count both original and proposed contents toward the limit. Larger files are not supported yet.

Local saves do not refresh unrelated sandbox files. Start a new conversation to import current local course files; the old conversation retains its private work. Local reviews delete files, not directories. Deleting every file in a question or assessment can leave an empty directory and cause sync errors. Use PrairieLearn’s question or assessment delete action to remove those entities.

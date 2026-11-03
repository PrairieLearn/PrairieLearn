# Conversation and sandbox contract

This document describes implementation invariants for maintainers. For configuration, local development, review controls, and deployment checks, see [README.md](README.md).

`Conversation` is the chat Durable Object, extending `AIChatAgent`. It decides when a user may send a message and when a workspace must stop, back up, or recover. The chat SDK owns message history, response persistence, and browser reconnect replay.

`SandboxTurn` is an in-memory execution helper in the Conversation DO. It owns one turn's setup, cancellation, and output stream. The Conversation DO retains the Codex adapter across normal turns, so finishing a reply does not restart the native process. `CourseSandbox` is a separate DO that owns the container and private process channel. Keeping execution in one helper avoids making the conversation's lifecycle depend on individual native protocol commands.

## State ownership

The conversation's private `conversation` storage record owns lifecycle, course source/model configuration, sandbox and native thread IDs, the latest committed checkpoint reference, the current deadline, and a nullable pending review containing the native call, snapshot metadata, decision, and PL job reference. A separate private `budget` record owns the signed credit balance and accounting delivery state; its block overrides lifecycle admission. See [the accounting contract](BUDGET.md). Updates synchronously save a replacement record before publishing status/recovery information and `deadlineAt` (an ISO timestamp or `null`) to browsers through SDK state. SDK public state is a projection, republished on wake; it is not a second source of lifecycle decisions.

Active execution handles and SDK completion promises exist only in memory. An unfinished turn cannot be reconstructed from those handles after a restart. Stable wake states are `offline`, `waiting_for_user`, and `blocked`; interrupted operations become blocked without resubmitting the prompt.

The private `destroying` phase means that a replacement checkpoint has been committed and only container destruction remains. Browsers see `suspending`. A wake during this phase requires cleanup recovery, not another backup of potentially unavailable files.

## Operations

| Operation           | Success means                                                                                                                                                                            | Failure handling                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Prepare             | Container started with restricted outbound access; local snapshot unpacked, repository cloned, or checkpoint restored; Codex configuration and permissions applied. No prompt submitted. | Discard incomplete startup on explicit Resume, preserving the committed checkpoint.                                  |
| Start/resume thread | Native thread ID returned and saved before prompt submission.                                                                                                                            | Treat as setup failure for a new sandbox, or runtime failure for an existing one.                                    |
| Execute             | New input submitted once; native output translated to SDK chunks; normal stream completion preserves the running session for follow-up input.                                            | Preserve output already recorded by the SDK and require explicit recovery. Never retry uncertain submission.         |
| Stop                | Pending submission prevented, or execution interrupted and processes verified stopped.                                                                                                   | An interrupt acknowledgment alone is insufficient; fall back to stopping processes. Failed cleanup blocks admission. |
| Backup              | Writers stopped; a new archive created and its reference returned.                                                                                                                       | Retain the live workspace and previous committed reference for explicit recovery.                                    |
| Destroy             | Container removed.                                                                                                                                                                       | Retain the sandbox identity and committed replacement checkpoint for cleanup retry.                                  |
| Delete backup       | The specified obsolete archive removed.                                                                                                                                                  | Retry independently; this does not change the current checkpoint.                                                    |

## Admission and completion

Only `offline` and `waiting_for_user` without a pending review accept new input. A pending review blocks new messages even after shutdown. Capture the input before asynchronous setup. Only the newest message is submitted to the native thread; SDK history is not resubmitted as another prompt.

SDK response completion and explicit Stop cleanup are separate events. Normal completion leaves the native process and background tools running until workspace cleanup. Explicit Stop may complete the SDK response first. One completion path waits for both and for any admitted model request to settle usage before releasing the active operation. Stop does not abort the provider stream: the native process stops immediately, while the response observer continues accounting independently. Manual Stop retains an established workspace for another message; Stop during initial setup discards the incomplete sandbox.

The turn deadline includes setup. Expiry stops the active operation, then backs up and shuts down without an intervening admission window. Idle expiry backs up and shuts down directly. Persisted deadlines identify the expected expiry and workspace so superseded callbacks do nothing. Scheduling and record persistence are separate SDK operations: wake reconciliation restores idle scheduling or blocks an interrupted active operation.

## Backup and recovery

The replacement sequence is:

1. Stop file writers and create a new archive.
2. Commit the new reference and the private destruction phase in one record update.
3. Destroy the live container and become `offline`.
4. Schedule deletion of the previous archive independently.

An older checkpoint does not prove the latest edits are backed up. Never discard a workspace containing edits merely because an older archive exists. Missing live workspace data remains blocked instead of silently restoring an older version.

Resume directly awaits recovery and rejects overlapping recovery or unfinished execution. It discards incomplete startup, backs up interrupted execution, or retries destruction of an already checkpointed container, depending on the recorded failure. Failure remains actionable through another explicit Resume; no interrupted prompt is replayed. The PL recovery request waits for the result rather than using the short conversation-creation timeout.

## Native protocol boundary

The first execution in a workspace starts Codex app-server under the dedicated agent user with an authenticated WebSocket listener. The Conversation DO connects through the private CourseSandbox binding. The sandbox forwards the upgrade to the container port, injecting a fresh per-runner capability token; the runner receives only its SHA-256 hash. The public Worker does not route requests to this endpoint. Tokens remain outside the checkpoint directory and are discarded with the runner.

JSON-RPC messages preserve Codex's wire format, with one object per WebSocket text message. A small transport adapter validates envelopes and adds/removes the version field expected by `vscode-jsonrpc`. The library owns request correlation and notification/server-request dispatch; there is no PL-owned RPC dispatcher. Outgoing requests are checked against types generated from the pinned runtime. Incoming replies and subscribed notifications use Zod schemas for the fields the adapter consumes; additional data is ignored. Initialization and interrupt acknowledgments require only a JSON object. The chat adapter subscribes only to the text, reasoning, and completion events it needs. The experimental protocol also registers a validated `item/tool/call` handler for `request_changes`; the human wait is an inbound request and does not inherit outbound command timeouts.

A malformed message or invalid consumed field in a reply or subscribed notification fails the connection and rejects pending requests. Unsupported server requests receive an error; unknown notifications and late responses are ignored. Timeouts and disconnects do not retry a potentially accepted command. An interrupt response acknowledges the request; terminal confirmation and process cleanup are still required before admitting another execution after Stop. Normal turn completion retains the connection. A new connection after DO recovery replaces any orphaned runner before resuming its saved native thread.

## Streaming and reconnect

Codex output flows through the adapter into the SDK response stream, then into SDK buffering/persistence and browser delivery. A browser disconnect leaves server execution running. The SDK replays buffered output and resumes live delivery when the browser reconnects.

A Worker/DO restart loses the native connection. SDK-recorded output remains readable, but output that never reached the SDK cannot be recovered through browser reconnect. The UI warns that edits may have completed while the reply is incomplete. Explicit Resume recovers ordinary interrupted work without replaying its prompt; reconstructing missing native output remains deferred. Reviewed tool outcomes use the separate result-only continuation described below.

## Pending reviews and save outcomes

### Capture and chat history

`request_changes({})` is a native dynamic tool handled by the Conversation DO. `CourseSandbox.captureReview()` uses Git to find tracked changes against the base commit and untracked files. It then reads those files through the sandbox SDK. Agent tools are not paused during capture, so concurrent writes may produce a mixed snapshot. Approval saves the captured bytes, regardless of later sandbox edits.

The DO stores file contents in separate durable entries and keeps paths and the base commit in its private review record. The snapshot survives container destruction and cannot be replaced for the same native call ID. See [Reviewing course edits](README.md#reviewing-course-edits) for supported file types and size limits.

The SDK represents the review as a `request_changes` tool part in an assistant message. Its `messageId` and `partId` identify where to display the decision and result. The DO persists the snapshot before emitting this part and waits for chat persistence before accepting a decision. The native tool request stays open while the SDK response finishes. After a restart, the DO locates the tool part using the saved IDs.

Chat history can be submitted by the browser. PrairieLearn authorizes saves using the DO’s private review record, rather than trusting that history. A pending review blocks new messages, including when its sandbox is offline.

### Approval and saving

PrairieLearn retrieves the snapshot without starting a sandbox. It checks the course source, repository, and branch and builds the diff from saved contents and immutable Git objects in the course checkout. Missing objects are fetched without changing working files or staging.

The authenticated, CSRF-protected review endpoint checks course edit permission and conversation ownership. It also checks that the submitted native call ID matches the pending review. Before saving, PrairieLearn records the approval and job sequence ID in the DO. Competing decisions are rejected; denial creates no editor job.

Approved files are passed to `MultiEditor`, which combines the upload and delete editors, then to `Editor.executeWithServerJob()`. This uses the file editor’s course-directory lock, path validation, Git attributes/filters, and sync behavior. With Git editing enabled, a failed push fetches the remote branch and reapplies edits before retrying. Commits and pushes use PrairieLearn’s checkout and Git credentials.

### Saved outcomes and Resume

The editor job records whether saving and syncing succeeded, along with its logs. Its description identifies whether it used local or Git editing, allowing recovery even if configuration has changed. Ordinary editor jobs do not record a commit SHA, so that field is optional in the result.

After the job finishes, PrairieLearn sends its outcome to the DO. If this callback is missed, Resume calls the service-authenticated `GET /pl/api/course-agent/conversations/{uuid}/jobs/{jobSequenceId}/outcome`. It returns `{ jobSequenceId, status, result, error }`, with status `running`, `completed`, or `blocked`. Both paths build the result from the same job data. The job does not store the native call ID: the DO matches the returned job sequence ID to its pending review. A running job stays pending. An interrupted job stays blocked for inspection; Resume does not start another save. A saved denial can also be delivered through Resume.

The DO saves and broadcasts the result in the chat tool part before continuing the agent. Duplicate callbacks share one in-flight delivery promise. Continuation depends on whether the native call is still live:

- For a live call, open another output stream and return the result to that call.
- After a restart, restore the native thread and send empty user input plus `toolOutput` tagged with the saved call ID. Check native history first: if the result is already recorded, do not start another turn.

Neither path repeats the original prompt. The review stays saved until both chat persistence and native result handling complete. Failed result delivery can be retried through Resume.

### Shutdown and subsequent edits

Idle expiry stops execution before backing up and destroying the sandbox. The pending review is stored separately and survives shutdown. All shutdown callers share one promise. If an outcome arrives during shutdown, it is saved to chat history first; continuation then waits for shutdown to finish.

For Git-backed courses, the agent fetches and reconciles approved changes before further edits. PrairieLearn does not reset its sandbox checkout. Denial and failed saves preserve private sandbox edits. Completed review messages retain outcomes and diagnostics; their diffs are not available after the review is settled.

## Local course sources

In PrairieLearn development mode, the owner-scoped creation route archives the authorized course directory and uploads it to the service-authenticated `POST /conversations/local` endpoint. The Worker chooses the R2 key; neither the browser nor the agent supplies a host path. The source and model are pinned at creation. Local sandboxes have no repository outbound route and require no GitHub token.

For courses in Git, PrairieLearn uses `git fast-export` and `git fast-import` to copy history reachable from `HEAD`, filtered to the course directory. The original directory prefix is retained so no additional history rewrite is needed. Only the new repository’s metadata is included; host Git configuration and unrelated repository contents are excluded. Current course files are copied over the imported index, preserving uncommitted additions, modifications, and deletions. Courses without Git history use just their current files.

The initial archive survives startup failures and retries. Execution unpacks it into an isolated repository and commits a private baseline on top of the imported history. `/workspace/session/course` links to the course directory within that repository; checkpoints preserve the repository, link, and native thread normally. After the first checkpoint is committed, deletion of the initial archive is scheduled with retries. Later sandboxes restore the latest checkpoint. Host course files are not changed by sandbox initialization or execution.

Local conversations also expose `request_changes`. Capture compares against the initial uploaded Git commit plus confirmed saved-file overrides held by the Conversation DO. The initial commit hash is pinned before native execution; ordinary agent commits do not advance it. Original bytes and proposed bytes for affected files are persisted with the pending review, so review generation and approval do not need a live sandbox. Local reviews include the original bytes in the size budget.

With `fileEditorUseGit: false` in development, PrairieLearn builds the diff from captured originals and saves through the local upload/delete editor workflow. It does not compare current host files against the conversation baseline before writing. The course must remain a Git checkout: the editor reads and updates local commit hashes but does not commit, fetch, or push.

The result uses `publication.status = saved_locally` for a local save and `published` for a Git commit/push. Sync success or failure is reported separately. Before continuing the agent, the DO updates its local baseline overrides to the approved bytes, even if sync fails. Denial or failed saving preserves the previous baseline. The initial Git objects survive in checkpoints, so removing the source archive does not lose the baseline.

Resume restores the checkpoint. It does not import newer files from the local course.

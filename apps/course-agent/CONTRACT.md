# Conversation and sandbox contract

`Conversation` is the chat Durable Object, extending `AIChatAgent`. It decides when a user may send a message and when a workspace must stop, back up, or recover. The chat SDK owns message history, response persistence, and browser reconnect replay.

`SandboxTurn` is an in-memory execution helper in the Conversation DO. It owns one turn's setup, cancellation, and output stream. The Conversation DO retains the Codex adapter across normal turns, so finishing a reply does not restart the native process. `CourseSandbox` is a separate DO that owns the container and private process channel. Keeping execution in one helper avoids making the conversation's lifecycle depend on individual native protocol commands.

## State ownership

The conversation's private `conversation` storage record is authoritative. It contains lifecycle, course source/model configuration, sandbox and native thread IDs, the latest committed checkpoint reference, the current deadline, and a nullable pending review containing the native call, snapshot metadata, decision, and PL job reference. Updates synchronously save a replacement record before publishing status/recovery information and `deadlineAt` (an ISO timestamp or `null`) to browsers through SDK state. SDK public state is a projection, republished on wake; it is not a second source of lifecycle decisions.

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

SDK response completion and explicit Stop cleanup are separate events. Normal completion leaves the native process and background tools running until workspace cleanup. Explicit Stop may complete the SDK response first. One completion path waits for both before releasing the active operation. Manual Stop retains an established workspace for another message; Stop during initial setup discards the incomplete sandbox.

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

`request_changes({})` is a native dynamic tool handled in the Conversation DO. `CourseSandbox.captureReview()` lists tracked changes against the remote base with Git and adds untracked paths separately. SDK file operations read metadata and bytes for those affected paths directly in TypeScript, including local commits and working-tree edits without changing staging. Capture does not pause agent tools: concurrent writes may produce a mixed snapshot, and the instructor reviews the exact saved contents that will be published. The DO stores file contents in separate durable entries (at most 64 KiB decoded per file, 100 changed files, and 1 MiB total base64 contents); its private review record contains their paths and the exact base commit. The snapshot survives container destruction and cannot be replaced for an existing call ID. There is no frozen patch file or DO-managed publication base.

Persist the snapshot before emitting the SDK tool card. Finish the SDK response while keeping the native request waiting; admit a decision only after card persistence. A restart can recover the card against its saved review record. The SDK manages browser-submitted chat history; PL independently authorizes publication against the DO's saved review. Pending reviews block new input even while offline.

PL retrieves the snapshot without waking a sandbox, checks the course destination, and generates the review diff from immutable Git objects in its existing course checkout and saved contents, fetching missing objects without changing working files or staging. A signed token binds the deciding user, conversation, and immutable native call. The pending UI is a compact warning row with View changes, Approve, and Deny; View changes opens the diff modal. Approval records its decision and ordinary PL job ID in the DO before publication, rejecting competing claims. Denial has no publication job.

PL applies approved files through `ReviewedChangesEditor` and the existing `Editor` commit/push/sync workflow under the course-directory lock. It fetches the configured branch and rejects a head that differs from the reviewed base. A normal Git push publishes the commit, attributed to the approving instructor; a competing push is rejected without reapplying the snapshot to a new base. Only non-executable regular files are supported initially. Paths through symlinks and Git attribute/filter transformations of approved bytes are rejected. The shared workflow validates question sharing before publication, syncs disk to the database, updates course chunks when configured, and records the course commit hash. If a push reports failure, PL fetches to determine whether the prepared commit reached the branch; an unconfirmed result remains blocked for inspection. This path uses the existing checkout and normal Git credentials and makes no GitHub API requests.

The editor's existing job API persists save/sync flags, the Git commit hash when applicable, and logs before PL attempts one callback. Callback delivery and Resume reconstruct the same outcome from that completed job. The DO retains the native call and job association; the PL job does not store another copy of the review outcome. There is no delivery cron or shared server-jobs extension. Configure PL_SERVICE_URL so explicit Resume can retrieve a completed job outcome after a missed callback. A running job remains pending. An interrupted or uncertain publication remains blocked for inspection; Resume never republishes it. Denial delivery can also be recovered through Resume from the saved DO decision.

Every callback saves and broadcasts the result in the SDK tool part before continuing. One in-memory review operation holds the native call's resolver and any in-flight outcome delivery; duplicate callbacks share that delivery promise. The SDK's continuation flag and saved tool history select the path: a live call opens another output stream and receives its result, while a cold call restores the native thread and starts a result-only continuation using empty user input and toolOutput tagged with the native call. Check persisted native history before incorporation; an identical result must not start another turn. Never replay the original prompt or answer a dead RPC ID. Keep the review until SDK persistence and native incorporation settle. Result delivery failures remain recoverable through explicit Resume.

Idle expiry uses the ordinary execution stop path before checkpoint/destruction. The pending review remains saved independently of the stopped execution. All shutdown callers share one backup-and-shutdown promise. Outcomes arriving during shutdown are persisted through the SDK before continuation waits for that promise. Ordinary process cleanup and SDK completion still gate new messages.

For Git-backed courses, the agent receives the published SHA and owns fetching/reconciling its checkout before further edits. The host does not reset the sandbox; private edits are preserved on denial and publication failure. Settled cards retain outcomes and diagnostics without a historical diff viewer.

Focused normal-suite tests cover snapshot capture, native transport behavior, PL authorization, local Git publication, stale heads, actual Course Sync diagnostics, and the saved-outcome endpoint. Before enabling the pilot, validate real credentials, publication, sandbox checkpoint/result-only continuation, and reconnect/Resume through PL's proxy in the deployed environment.

## Local course sources

In PrairieLearn development mode, the owner-scoped creation route archives the authorized course directory and uploads it to the service-authenticated `POST /conversations/local` endpoint. The Worker chooses the R2 key; neither the browser nor the agent supplies a host path. The source and model are pinned at creation. Local sandboxes have no repository outbound route and require no GitHub token.

For courses in Git, PrairieLearn uses `git fast-export` and `git fast-import` to copy history reachable from `HEAD`, filtered to the course directory. The original directory prefix is retained so no additional history rewrite is needed. Only the new repository’s metadata is included; host Git configuration and unrelated repository contents are excluded. Current course files are copied over the imported index, preserving uncommitted additions, modifications, and deletions. Courses without Git history use just their current files.

The initial archive survives startup failures and retries. Execution unpacks it into an isolated repository and commits a private baseline on top of the imported history. `/workspace/session/course` links to the course directory within that repository; checkpoints preserve the repository, link, and native thread normally. After the first checkpoint is committed, deletion of the initial archive is scheduled with retries. Later sandboxes restore the latest checkpoint. Host course files are not changed by sandbox initialization or execution.

Local conversations also expose `request_changes`. Capture compares against the initial uploaded Git commit plus confirmed saved-file overrides held by the Conversation DO. The initial commit hash is pinned before native execution; ordinary agent commits do not advance it. Original bytes and proposed bytes for affected files are persisted with the pending review, so review generation and approval do not need a live sandbox. Local reviews include the original bytes in the size budget.

With `fileEditorUseGit` disabled in development, PL generates the diff from those original bytes and uses the existing non-Git editor execution path. Before any batch file is written, the reviewed editor checks all affected local paths under the existing course-directory lock: replacements/deletions must match the saved originals and additions require an absent path. A stale request writes nothing and names the conflicting files. The lock coordinates PL operations; external IDE writes are not locked. File I/O failures can leave partial writes and must be inspected rather than blindly retried.

Approved local changes are saved through PL's upload/delete editors and synced without commit, fetch, or push. The result uses `publication.status = saved_locally`, distinct from Git publication, with the sync outcome reported separately. Before continuing the agent, the DO advances its saved-file overrides to exactly the approved bytes, including when sync fails. Missed callbacks recover through the existing saved job result. Denial or failed saving leaves the baseline unchanged. The initial Git objects survive in sandbox checkpoints, so the source archive can still be removed after checkpointing.

Local save does not refresh unrelated course files in the sandbox. There is no pull/merge operation. Stale reviews require manual reconciliation or a new conversation, preserving the old conversation's private edits. Resume restores the checkpoint, not a new copy of the local course.

This pilot changes the native tool and SDK card name from `push_sync` to `request_changes`. Start new development conversations after updating; existing pending `push_sync` requests are not migrated.

# Conversation and sandbox contract

This document describes implementation invariants for maintainers. For configuration, local development, review controls, and deployment checks, see [README.md](README.md).

`Conversation` is the chat Durable Object, extending `AIChatAgent`. It decides when a user may send a message and when a sandbox must stop, back up, or recover. The chat SDK owns message history, response persistence, and browser reconnect replay.

`SandboxTurn` is an in-memory execution helper in the Conversation DO. It owns one turn's setup, cancellation, and output stream. The Conversation DO retains the Codex adapter across normal turns, so finishing a reply does not restart the native process. `CourseSandbox` is a separate DO that owns the container and private process channel. Keeping execution in one helper avoids making the conversation's lifecycle depend on individual native protocol commands.

## State ownership

The conversation's private `conversation` storage record is authoritative. It contains lifecycle, course source/model configuration, sandbox and native thread IDs, the latest committed checkpoint reference, the current deadline, and the review whose result the agent has not yet received. Updates synchronously save a replacement record before publishing status, `deadlineAt` (an ISO timestamp or `null`), and the review ID to browsers through SDK state. SDK public state is a projection, republished on wake; it is not a second source of lifecycle decisions. Chat history displays reviews but holds none of their state.

Each review fact has one owner. The DO owns the snapshot and whether the agent has received the result. PrairieLearn's `course_agent_reviews` table owns the decision, the editor job, and the result. The Codex thread is a cache of the conversation that the DO can resume, not a record the DO reconciles against.

Active execution handles and SDK completion promises exist only in memory. An unfinished turn cannot be reconstructed from those handles after a restart. Stable wake states are `offline`, `waiting_for_user`, and `blocked`; interrupted operations become blocked without resubmitting the prompt.

The private `destroying` phase means that a replacement checkpoint has been committed and only container destruction remains. Browsers see `suspending`. A wake during this phase requires cleanup recovery, not another backup of potentially unavailable files.

## Operations

| Operation           | Success means                                                                                                                                                                            | Failure handling                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Prepare             | Container started with restricted outbound access; local snapshot unpacked, repository cloned, or checkpoint restored; Codex configuration and permissions applied. No prompt submitted. | Discard incomplete startup on explicit Resume, preserving the committed checkpoint.                                  |
| Start/resume thread | Native thread ID returned; saved once Codex accepts the turn's input, because Codex persists a new thread only then.                                                                     | Treat as setup failure for a new sandbox, or runtime failure for an existing one.                                    |
| Execute             | New input submitted once; native output translated to SDK chunks; normal stream completion preserves the running session for follow-up input.                                            | Preserve output already recorded by the SDK and require explicit recovery. Never retry uncertain submission.         |
| Stop                | Pending submission prevented, or execution interrupted and processes verified stopped.                                                                                                   | An interrupt acknowledgment alone is insufficient; fall back to stopping processes. Failed cleanup blocks admission. |
| Backup              | Writers stopped; a new archive created and its reference returned.                                                                                                                       | Retain the live sandbox and previous committed reference for explicit recovery.                                      |
| Destroy             | Container removed.                                                                                                                                                                       | Retain the sandbox identity and committed replacement checkpoint for cleanup retry.                                  |
| Delete backup       | The specified obsolete archive removed.                                                                                                                                                  | Retry independently; this does not change the current checkpoint.                                                    |

## Admission and completion

Only `offline` and `waiting_for_user` without a review awaiting its result accept new input. Such a review blocks new messages even after shutdown. Capture the input before asynchronous setup. The first user message after the last one handled is submitted to the native thread as a prompt; a message the conversation refuses counts as handled too, since the chat SDK has already saved it and it must not be sent later in place of the user's next message. Earlier history is sent only as reference text for a thread that may be behind, described below.

SDK response completion and explicit Stop cleanup are separate events. Normal completion leaves the native process and background tools running until sandbox cleanup. Explicit Stop may complete the SDK response first. One completion path waits for both before releasing the active operation. Manual Stop retains an established sandbox for another message; Stop during initial setup discards the incomplete sandbox.

The turn deadline includes setup. Expiry stops the active operation, then backs up and shuts down without an intervening admission window. Idle expiry backs up and shuts down directly. Persisted deadlines identify the expected expiry and sandbox so superseded callbacks do nothing. Scheduling and record persistence are separate SDK operations: wake reconciliation restores idle scheduling or blocks an interrupted active operation.

## Backup and recovery

The replacement sequence is:

1. Stop file writers and create a new archive.
2. Commit the new reference and the private destruction phase in one record update.
3. Destroy the live container and become `offline`.
4. Schedule deletion of the previous archive independently.

An older checkpoint does not prove the latest edits are backed up. Never discard a running sandbox merely because an older archive exists. A stopped container is different: crashes, restarts, and host maintenance do not preserve it, so its edits since the last checkpoint are already gone and no backup can succeed. Shutdown, Resume, and the next message therefore check whether the container is running. A stopped sandbox is abandoned and the conversation becomes `offline` with `sandboxLost` set, which the UI shows until the next message; that turn restores the last checkpoint, or the course source if none exists. Blocking instead would leave Resume retrying a backup that can never succeed.

Restoring a checkpoint also restores the native thread as of that checkpoint, while chat history keeps every later turn; with no checkpoint, the thread is new. Every turn's input therefore carries a tag that Codex saves on its user message: `message:<chat message id>` for a prompt and `review:<id>` for a delivery. Until Codex accepts a turn on a sandbox that was just started, the conversation records that its thread may be behind, so a Stop before acceptance does not skip the catch-up. Such a turn reads the thread's latest tag, finds it in chat history (a user message, or a delivery turn's `data-turn` part), and sends the text of later turns, capped to the newest 32,000 characters, in the same input as the turn's own text. Because a continuation appends to the last assistant message, each delivery turn adds a `data-turn` part marking where it began, with a one-line summary of the result, once Codex accepts it. That text says it is reference only, that edits from those messages may be gone from the checkout, and not to redo them unless asked. A new thread receives all earlier history; a tag that cannot be found is treated as current. Only delivery tags are checked to avoid resubmission, so a regenerated prompt is submitted again.

Resume directly awaits recovery and rejects overlapping recovery or unfinished execution, except that it succeeds without action when a waiting result is already being delivered or will be when the current turn ends. It discards incomplete startup, backs up interrupted execution, or retries destruction of an already checkpointed container, depending on the recorded failure, then lets a waiting review result be delivered, even one that waited for Resume. Failure remains actionable through another explicit Resume; no interrupted prompt is replayed. A blocked conversation that still holds a sandbox also schedules this recovery one idle period later, so edits are saved before the container's inactivity timeout ends even if nobody resumes; a failed attempt schedules another. The PL recovery request waits for the result rather than using the short conversation-creation timeout.

## Native protocol boundary

The first execution in a sandbox starts Codex app-server under the dedicated agent user with an authenticated WebSocket listener. The Conversation DO connects through the private CourseSandbox binding. The sandbox forwards the upgrade to the container port, injecting a fresh per-runner capability token; the runner receives only its SHA-256 hash. The public Worker does not route requests to this endpoint. Tokens remain outside the checkpoint directory and are discarded with the runner.

JSON-RPC messages preserve Codex's wire format, with one object per WebSocket text message. A small transport adapter validates envelopes and adds/removes the version field expected by `vscode-jsonrpc`. The library owns request correlation and notification/server-request dispatch; there is no PL-owned RPC dispatcher. Outgoing requests are checked against types generated from the pinned runtime. Incoming replies and subscribed notifications use Zod schemas for the fields the adapter consumes; additional data is ignored. Initialization and interrupt acknowledgments require only a JSON object. The chat adapter subscribes only to the text, reasoning, and completion events it needs. The experimental protocol also registers a validated `item/tool/call` handler for `request_changes`, which answers as soon as the snapshot is saved. No native request waits on a person: Codex keeps pending tool calls only in memory and cancels them when a turn or process ends.

A malformed message or invalid consumed field in a reply or subscribed notification fails the connection and rejects pending requests. Unsupported server requests receive an error; unknown notifications and late responses are ignored. Timeouts and disconnects do not retry a potentially accepted command. An interrupt response acknowledges the request; terminal confirmation and process cleanup are still required before admitting another execution after Stop. Normal turn completion retains the connection. A new connection after DO recovery replaces any orphaned runner before resuming its saved native thread.

## Streaming and reconnect

Codex output flows through the adapter into the SDK response stream, then into SDK buffering/persistence and browser delivery. A browser disconnect leaves server execution running. The SDK replays buffered output and resumes live delivery when the browser reconnects.

A Worker/DO restart loses the native connection. SDK-recorded output remains readable, but output that never reached the SDK cannot be recovered through browser reconnect. The UI warns that edits may have completed while the reply is incomplete. Explicit Resume recovers ordinary interrupted work without replaying its prompt; reconstructing missing native output remains deferred. Review results are delivered in their own turn, described below.

## Tool calls in chat history

Each Codex tool call (a command, file change, MCP or dynamic tool call, web search, or other non-message item) is a `data-tool` part with ID `tool:<Codex item ID>` and data matching `ToolCallSchema` in `@prairielearn/course-agent-types`. The Worker writes it when Codex starts the item and replaces it when Codex completes it. A call still running when the stream closes is rewritten as `interrupted`. A stream can also end without that rewrite (a cancelled response or a lost Worker), so the browser treats a `running` call in any message that is no longer streaming as interrupted. The part stores Codex's fields, and the browser derives labels from them, so label changes apply to existing history.

History keeps a bounded copy: command text up to 2,000 characters, output up to 4,000 (its start and end), arguments up to 1,000, each diff up to 4,000, and 50 files per change. Paths in the course checkout are stored relative to the course root. Once a message's tool calls exceed 300,000 characters, later calls in it keep their labels but no output, diffs, or arguments, so the message stays well within a Durable Object row; Codex's own thread keeps the full record. A successful `request_changes` call has no part, because its review card shows it; a failed one does, so the instructor sees why. Catch-up omits tool calls except a one-line list of the files each completed change touched.

## Reviews

A review is a snapshot of the agent's edits that an instructor approves or denies in PrairieLearn, with the outcome delivered back to the agent in a later turn. Each fact has one owner:

| Fact                                               | Owner                                       | Held in                                                                                  |
| -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Review ID, snapshot (paths, base commit, contents) | Conversation DO                             | Private record; file contents in separate durable entries                                |
| Whether the agent has received the result          | Conversation DO                             | Private record (`review` is dropped once Codex accepts the delivery turn)                |
| Decision, editor job, result, delivery bookkeeping | PrairieLearn                                | `course_agent_reviews`                                                                   |
| Diff shown to the instructor                       | PrairieLearn, computed on request           | Saved contents plus immutable Git objects in the course checkout; never the live sandbox |
| Where each delivery turn began in chat history     | Conversation DO, written once Codex accepts | A `data-turn` part with a one-line summary, used only to catch up a restored thread      |

Chat history shows a review as a `data-review` part containing only its ID; the card loads everything else from PrairieLearn, so history is never rewritten to record a decision or result.

### Capture

`request_changes({})` is a native dynamic tool handled by the DO. `CourseSandbox.captureReview()` uses Git to find tracked changes against the base commit and untracked files, then reads them through the sandbox SDK; agent tools are not paused, so concurrent writes may produce a mixed snapshot, and approval saves the captured bytes regardless of later edits. The tool returns as soon as the snapshot is saved, telling the agent the decision arrives in a later message, and the turn continues. Only one review may await its result: another call, a call with no changes, or one whose turn stopped or failed during capture returns an error and records nothing. See [Reviewing course edits](README.md#review-limits) for supported file types and size limits.

### Decision and saving

The authenticated, CSRF-protected decision endpoint checks course edit permission and conversation ownership, then that the DO still has the review and that the course source, repository, and branch match the snapshot. The unique review key makes the first decision win; a repeated decision must match it. An approval prepares its editor job before recording the decision with the job's ID, so a losing concurrent approval stops its job before it runs. A denial records its result directly. A decision does not wait for the agent's turn to end. Diff failures keep the review pending with Deny available and Approve disabled.

Approved files go through `MultiEditor` (upload and delete editors) and `Editor.executeWithServerJob()`, so saving uses the file editor's course lock, path validation, Git attributes and filters, and sync. With Git editing, a pre-write hook under the course lock checks every affected file against its reviewed original, including expected absence for new files, fetching and resetting to the remote branch first when the checkout lacks the reviewed base; push retries repeat the check after resetting to the fetched branch. A conflict rejects the whole proposal before any file is written. Unrelated upstream changes do not conflict.

### Results

Invariants:

- A result is recorded on the review row once, from the finished job (save and sync flags, conflict paths, and the last 16,000 characters of the log) or from the denial, before it is sent. A stopped job maps from the flags it recorded, like a failed one. A job that the abandoned-job sweeper ended never persisted its flags, so its result is `unknown`: the files may or may not have been saved, and the agent is told to check.
- PrairieLearn sends the result as the POST body of the review's `outcome` endpoint and marks it delivered when the DO acknowledges it. Sending is retried by a cron sweep every minute and by Resume; if PrairieLearn stopped before recording an approval's result, the sweep rebuilds it from the finished job. The sweep stops at the first unreachable response, reports a result that has stayed undelivered for an hour to Sentry once, and after a week retires the result from the sweep with a log entry; Resume still sends a retired result. The Worker never calls PrairieLearn.
- The DO accepts a result keyed by review ID. A repeated identical result is acknowledged again, as is one for a review ID the DO does not hold: either the agent already received it or the ID was never valid, and PrairieLearn only sends IDs it read from the DO. A different result for the review the DO holds is refused with 409, which PrairieLearn treats as final.

### Delivery to the agent

Invariants:

- Delivery is a function of the saved record: whenever the record is saved idle (`offline` or `waiting_for_user`) with a result to deliver, and on wake, the DO schedules `deliverWaitingResult`. The callback runs after whatever released the sandbox has finished and, on wake, after the chat SDK's own restart recovery, so it cannot interleave with either. It claims the conversation synchronously by setting `waiting_for_agent`, so there is never more than one delivery in flight.
- The delivery turn continues the last assistant message with plain-language text stating the result, what to do next, and any save or sync output; the agent never sees the result's structure or the review ID. Before a local save is delivered, the Worker advances the local baseline described below.
- The turn carries `clientUserMessageId = review:<id>`. If an earlier attempt's acceptance was lost, the thread's latest user message already has that ID and the input is not submitted again. A thread started for the delivery turn cannot contain an earlier attempt and is not checked, because Codex cannot list a thread's history before its first message.
- Once Codex accepts the turn (or reports the earlier acceptance), the DO writes the `data-turn` marker and drops the snapshot, so new messages are admitted, including a fresh review in the same turn. A delivery that fails before acceptance leaves no marker.
- A delivery turn that ends before acceptance, because it failed or was stopped, marks the result as waiting for Resume; a wake, turn end, or automatic recovery does not repeat it. Explicit Resume clears that mark. A failure blocks the conversation, and its banner offers Resume; after Stop, the review card offers it.

### Subsequent edits

For Git-backed courses, the agent fetches and reconciles published changes before further edits; PrairieLearn does not reset its sandbox checkout. Denial and failed saves preserve private sandbox edits. A conflict asks the agent to fetch and reconcile current repository contents, then submit a fresh review; the previous approval does not authorize the revised proposal. Settled review cards show their result and diagnostics; their diffs are not available after the agent receives the result.

## Local course sources

In PrairieLearn development mode, the owner-scoped creation route archives the authorized course directory and uploads it to the service-authenticated `POST /conversations/local` endpoint. The Worker chooses the R2 key; neither the browser nor the agent supplies a host path. The source and model are pinned at creation. Local sandboxes have no repository outbound route and require no GitHub token.

For courses in Git, PrairieLearn uses `git fast-export` and `git fast-import` to copy history reachable from `HEAD`, filtered to the course directory. The original directory prefix is retained so no additional history rewrite is needed. Only the new repository’s metadata is included; host Git configuration and unrelated repository contents are excluded. Current course files are copied over the imported index, preserving uncommitted additions, modifications, and deletions. Courses without Git history use just their current files.

The initial archive survives startup failures and retries. Execution unpacks it into an isolated repository and commits a private baseline on top of the imported history. `/workspace/session/course` links to the course directory within that repository; checkpoints preserve the repository, link, and native thread normally. After the first checkpoint is committed, deletion of the initial archive is scheduled with retries. Later sandboxes restore the latest checkpoint. Host course files are not changed by sandbox initialization or execution.

Local conversations also expose `request_changes`, as a development convenience rather than a replica of saving through Git. Capture compares the sandbox checkout against `refs/prairielearn/saved`, which starts at the initial uploaded commit; ordinary agent commits do not advance it. Proposed bytes are persisted with the pending review, so review generation and approval do not need a live sandbox.

With `fileEditorUseGit: false` in development, PrairieLearn builds the diff against the files currently on disk and saves through the local upload/delete editor workflow, overwriting those files. There is no conflict check. The course must remain a Git checkout: the editor reads and updates local commit hashes but does not commit, fetch, or push.

The result uses `publication.status = saved_locally` for a local save and `published` for a Git commit/push. Sync success or failure is reported separately. Before continuing the agent after a local save, even if sync fails, the Worker commits the approved paths onto `refs/prairielearn/saved` using a temporary index, leaving the agent's working tree, index, and `HEAD` untouched. Denial or failed saving leaves the ref unchanged. Checkpoints preserve the ref, so removing the source archive does not lose the baseline.

Resume restores the checkpoint. To import newer local course files, start a new conversation; the old conversation retains its private edits.

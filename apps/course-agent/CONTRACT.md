# Conversation and sandbox contract

`Conversation` is the chat Durable Object, extending `AIChatAgent`. It decides when a user may send a message and when a workspace must stop, back up, or recover. The chat SDK owns message history, response persistence, and browser reconnect replay.

`SandboxTurn` is an in-memory execution helper in the Conversation DO. It owns the Codex adapter for one turn, including setup, cancellation, output conversion, and cleanup. `CourseSandbox` is a separate DO that owns the container and private process channel. Keeping execution in one helper avoids making the conversation's lifecycle depend on individual native protocol commands.

## State ownership

The conversation's private `conversation` storage record is authoritative. It contains lifecycle, repository/model configuration, sandbox and native thread IDs, the latest committed checkpoint reference, and the current deadline. Updates synchronously save a replacement record before publishing status/recovery information and `deadlineAt` (an ISO timestamp or `null`) to browsers through SDK state. SDK public state is a projection, republished on wake; it is not a second source of lifecycle decisions.

Active execution handles and SDK completion promises exist only in memory. An unfinished turn cannot be reconstructed from those handles after a restart. Stable wake states are `offline`, `waiting_for_user`, and `blocked`; interrupted operations become blocked without resubmitting the prompt.

The private `destroying` phase means that a replacement checkpoint has been committed and only container destruction remains. Browsers see `suspending`. A wake during this phase requires cleanup recovery, not another backup of potentially unavailable files.

## Operations

| Operation           | Success means                                                                                                                                                  | Failure handling                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Prepare             | Container started with restricted outbound access; repository cloned or checkpoint restored; Codex configuration and permissions applied. No prompt submitted. | Discard incomplete startup on explicit Resume, preserving the committed checkpoint.                                  |
| Start/resume thread | Native thread ID returned and saved before prompt submission.                                                                                                  | Treat as setup failure for a new sandbox, or runtime failure for an existing one.                                    |
| Execute             | New input submitted once; native output translated to SDK chunks; processes stopped before normal stream completion.                                           | Preserve output already recorded by the SDK and require explicit recovery. Never retry uncertain submission.         |
| Stop                | Pending submission prevented, or execution interrupted and processes verified stopped.                                                                         | An interrupt acknowledgment alone is insufficient; fall back to stopping processes. Failed cleanup blocks admission. |
| Backup              | Writers stopped; a new archive created and its reference returned.                                                                                             | Retain the live workspace and previous committed reference for explicit recovery.                                    |
| Destroy             | Container removed.                                                                                                                                             | Retain the sandbox identity and committed replacement checkpoint for cleanup retry.                                  |
| Delete backup       | The specified obsolete archive removed.                                                                                                                        | Retry independently; this does not change the current checkpoint.                                                    |

## Admission and completion

Only `offline` and `waiting_for_user` accept new input. Capture the input before asynchronous setup. Only the newest message is submitted to the native thread; SDK history is not resubmitted as another prompt.

SDK response completion and sandbox process termination are separate events. Explicit Stop may complete the SDK response first. One completion path waits for both before releasing the active operation. Manual Stop retains an established workspace for another message; Stop during initial setup discards the incomplete sandbox.

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

Each execution starts Codex app-server under the dedicated agent user with an authenticated WebSocket listener. The Conversation DO connects through the private CourseSandbox binding. The sandbox forwards the upgrade to the container port, injecting a fresh per-runner capability token; the runner receives only its SHA-256 hash. The public Worker does not route requests to this endpoint. Tokens remain outside the checkpoint directory and are discarded with the runner.

JSON-RPC messages preserve Codex's wire format, with one object per WebSocket text message. A small transport adapter validates envelopes and adds/removes the version field expected by `vscode-jsonrpc`. The library owns request correlation and notification/server-request dispatch; there is no PL-owned RPC dispatcher. Generated validators check registered payloads before typed application code consumes them. A small catalog supplies the request-to-result associations missing from the upstream schema; payload fields remain generated from the pinned runtime. The chat adapter subscribes only to the text, reasoning, and completion events it needs.

A malformed message or invalid response/subscribed-notification payload fails the connection and rejects pending requests. Unsupported server requests receive an error; unknown notifications and late responses are ignored. Timeouts and disconnects do not retry a potentially accepted command. An interrupt response acknowledges the request; terminal confirmation and process cleanup are still required before admitting another execution.

## Streaming and reconnect

Codex output flows through the adapter into the SDK response stream, then into SDK buffering/persistence and browser delivery. A browser disconnect leaves server execution running. The SDK replays buffered output and resumes live delivery when the browser reconnects.

A Worker/DO restart loses the native connection. SDK-recorded output remains readable, but output that never reached the SDK cannot be recovered through browser reconnect. Explicit Resume recovers the workspace; it does not continue or resubmit the interrupted turn.

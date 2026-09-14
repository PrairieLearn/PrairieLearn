# Vercel course-agent spike

The course agent runs inside PrairieLearn and uses **Vercel Sandbox** for isolated course editing.
Start one PrairieLearn process. There is no separate worker service, proxy server, or Docker image.

The implementation preserves the instructor panel, conversation switching and saved history,
streamed replies and tool activity, sandbox files and native agent context between turns, and
proposal review followed by GitHub push and course sync. AI SDK `useChat` owns messages, streaming
status, errors, and stream resumption. AI SDK `toUIMessageStream` converts the native harness stream to message chunks, and `readUIMessageStream` restores saved
message parts. `DefaultChatTransport` parses the SDK stream; its request
hooks connect to PrairieLearn's authorized tRPC start operation and resumable stream endpoint.
Only one prompt runs at a time in a conversation.

**Live Vercel execution remains unverified.** This spike was built without Vercel credentials.
Local tests use simulated agent output. Provisioning, credential injection, and continuation of
an outstanding tool call after VM replacement still need a live run.

## Run

The permanent local checkout is `PrairieLearn-course-agent-vercel-spike`, alongside the main repo.
Install dependencies with `pnpm install`, build with `make build`, and prepare the usual PrairieLearn
Python and support-service dependencies. Use the existing AGENT TEST course and repository.

Merge the following into root `config.json`, preserving the existing course directories and other
settings. Supply credentials locally; do not commit them. Keep GitHub read access restricted to the
test course repository. PrairieLearn's trusted checkout keeps its existing, separate write access.

```json
{
  "courseAgentRuntime": "vercel",
  "features": { "course-agent": true },
  "courseAgentVercel": {
    "token": "VERCEL_ACCESS_TOKEN",
    "teamId": "VERCEL_TEAM_ID",
    "projectId": "VERCEL_PROJECT_ID",
    "openaiApiKey": "OPENAI_API_KEY",
    "githubReadToken": "COURSE_REPOSITORY_READ_TOKEN"
  }
}
```

Run `make dev`, open AGENT TEST, and start a new conversation. Credentials are checked only when
the agent is used. For UI-only testing without credentials, set `courseAgentRuntime` to `fake`.
Fake mode never calls a sandbox or model provider.

Optional `courseAgentVercel` settings are `model` (default `gpt-5.4`), `timeoutMs` (30 minutes),
`backupTtlSeconds` (7 days), and `stateDirectory` (`.course-agent` at the repository root).
The old runtime origin, capability secret, and platform-specific idle settings are removed.

## What owns each part

| Responsibility                                                         | Implementation                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Browser messages, request status, errors, resuming a response          | AI SDK `useChat`                                                  |
| Stream parsing and request preparation                                 | AI SDK `DefaultChatTransport`                                     |
| Native agent context and tool continuation                             | `HarnessAgent`, Codex adapter, `createSession` / `continueStream` |
| Remote machine, network policy, and filesystem snapshots               | Vercel Sandbox                                                    |
| Course permissions, selected conversation, saved transcript, approvals | Existing PrairieLearn tRPC and PostgreSQL models                  |
| Publication and course sync                                            | Existing trusted PrairieLearn publisher                           |
| Connecting native tool results to the course workflow                  | Small runtime under `src/ee/lib/course-agent/vercel`              |

The agent shallow-clones the configured course branch, checks its initial revision, and reads
bundled authoring instructions and examples from `assets/course-agent`. It can read the official
PrairieLearn docs. When it calls `push_sync`, the runtime checks the clean committed tree and
snapshots the workspace. PrairieLearn validates the proposed tree before displaying approval.
The instructor can approve or deny; an explicitly selected automatic approval preference remains
supported by the existing authorization checks. Publication and sync results return to the native
tool call. A post-publication merge conflict is returned to the agent along with the publication
result. A successful sync offers a course refresh action.

## Smallest remaining custom state

AI SDK hooks do not store application permissions, publish Git commits, or persist conversations
to PrairieLearn's database. PostgreSQL retains the instructor transcript and approval results.
The runtime saves the opaque native-session resume handle, pending tool ID, snapshot reference,
and ordered activity in `.course-agent`. That local directory must survive app restarts. The
prototype runs in one PrairieLearn process and has no distributed execution coordinator.

The VM is stopped and snapshotted after each completed turn or pending approval. Native session
state and files resume together. A pending approval can survive an app restart. An interrupted
active turn reports failure without automatically replaying a paid prompt; a crash while delivering
a publication result requires inspecting the recorded result and starting a new conversation.
Expired or missing snapshots fail explicitly. Saved UI history alone cannot recreate native tool
context or unpublished files.

Model authentication is handled by the trusted harness adapter. A Vercel network transformation
injects the repository read token only for matching Git smart-HTTP read requests. The model receives
placeholder credentials. Allowed hosts are GitHub, OpenAI, the npm registry, and PrairieLearn docs.
Request matching scopes credential injection; it does not block every unmatched request on an
allowed host. There is no sandbox credential for GitHub writes.

## Live acceptance in AGENT TEST

1. Request one small practice question. Check streamed activity, proposed files, and metadata validation.
2. Deny the proposal; verify no publication occurred and the agent receives the decision.
3. Request a revision, restart PrairieLearn while approval is pending, then approve. Verify the GitHub
   commit, course sync, agent continuation, and refresh action. Render and grade the new question.
4. Reload and ask a follow-up requiring an unpublished file; verify native context and files survive
   VM replacement. Switch conversations and confirm isolation.
5. Exercise a changed remote branch, a merge conflict, and a sync failure. Confirm partial publication
   is reported accurately and retrying a decision does not publish twice.

The inherited publisher creates a fresh trusted commit from the approved diff, so its SHA can
change while preserving the validated tree. Metadata validation does not prove rendering or grading.
Usage accounting, distributed coordination, retention management, and production deployment remain
outside this spike. Prove the live sequence first, then harden the parts that need stronger durability.

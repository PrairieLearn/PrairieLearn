# Vercel course agent prototype

This implementation develops independently of the existing course agent. It preserves
its panel and chat interaction, with a small native Codex backend modeled on
[the playground](https://github.com/miguelaenlle/vercel-agent-playground). The intent is
for this agent to replace the existing agent after the remaining capabilities are built.

## Run locally

Enable Enterprise Edition for local development and add these fields to `config.json`:

```json
{
  "isEnterprise": true,
  "features": { "vercel-course-agent": true },
  "vercelCourseAgent": {
    "token": "VERCEL_TOKEN",
    "teamId": "VERCEL_TEAM_ID",
    "projectId": "VERCEL_PROJECT_ID",
    "openAiApiKey": "OPENAI_API_KEY",
    "githubPat": "READ_ONLY_GITHUB_PAT"
  }
}
```

An optional `model` overrides the native Codex default. AI Gateway is not required.
Do not commit credentials. Open a non-example course as a course owner. Both the
signed-in and effective user must have owner permission. Set the course's repository
and branch in its existing course settings; no separate agent repository URL is needed.
The PAT should have **Contents: read-only** access to the selected repositories.

## Code path

1. The panel creates a process-local conversation through course tRPC.
2. AI SDK's `DefaultChatTransport` posts the new prompt to the course stream endpoint.
3. `streamConversation` claims the conversation and creates its sandbox on the first turn.
4. `HarnessAgent` on the PL webserver starts native Codex in `course/` inside Vercel Sandbox.
   Codex calls OpenAI through the SDK's credential injection. Provider keys stay outside the VM.
5. Native events become an AI SDK UI stream. The browser renders text and tool activity.
6. After draining the stream, PL detaches the native session and retains its resume payload
   in memory. The next turn attaches to the same sandbox and sends only the new prompt.

On first use, PL shallow-clones the course's configured branch into
`/vercel/sandbox/course`. SSH course remotes are converted to credential-free HTTPS.
The checkout has a local Git identity so the agent can edit and create local commits.

Vercel injects the read-only PAT outside the sandbox for that repository's
`info/refs?service=git-upload-pack` and `git-upload-pack` requests. This supports clone,
fetch, and pull. Git push uses `git-receive-pack`, which receives no credential.
Other internet traffic stays allowed. The PAT is never written to Git config,
command arguments, environment variables, or course files. `withGitAuth` reapplies
Git rules alongside OpenAI rules whenever native Codex attaches to its session.

There is no publishing or PrairieLearn sync. Native Codex owns agent history inside
the sandbox; the browser holds the displayed transcript. Unpublished edits, local
commits, and history are lost when the ephemeral sandbox expires.

## Deliberate limits

Sandboxes are ephemeral, with a fixed 30-minute timeout and a five-minute turn timeout.
PL does not renew, snapshot, or restore them. Stop or a disconnected browser aborts
the turn; an interrupted or expired conversation requires **Start over**. Reloading
also starts a new conversation. The old sandbox expires at its original deadline.

This is a single-webserver prototype. There is no distributed ownership, reconnect,
message queue, durable history, approval, or publishing layer. Lifecycle management
is TBD: PL could coordinate ownership across servers, or a Vercel Workflow could
periodically ask PL whether a sandbox is still needed. No dedicated worker is required
by this stack.

Tests use fake sandbox/model calls. Manually verify live creation, file editing,
follow-up context, Stop, and expiry with real credentials before enabling this feature.

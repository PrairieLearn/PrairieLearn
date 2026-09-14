# Vercel course-agent spike

This is a local, single-process prototype of the course agent through **push and sync**.
It combines the existing PrairieLearn panel, saved conversations, proposal validation, and
trusted publication workflow with a new Vercel Sandbox runtime driven by AI SDK HarnessAgent
and its Codex adapter. Selecting `courseAgentRuntime: "vercel"` uses this service;
the Cloudflare implementation remains available for comparison.

**No live Vercel run has been verified.** The initial spike was prepared without Vercel
credentials. Tests exercise the local runtime and PrairieLearn integration using simulated
agent results. Sandbox provisioning, network credential injection, native Codex continuation
after a snapshot, and actual GitHub publication still require the live acceptance run below.

## Scope and source stack

This branch includes the existing implementation through
[push/sync #15750](https://github.com/PrairieLearn/PrairieLearn/pull/15750), based on
commit `be863095f`. Its prerequisite stack is
[#15747](https://github.com/PrairieLearn/PrairieLearn/pull/15747) →
[#15748](https://github.com/PrairieLearn/PrairieLearn/pull/15748) →
[#15749](https://github.com/PrairieLearn/PrairieLearn/pull/15749) →
[#15750](https://github.com/PrairieLearn/PrairieLearn/pull/15750).
Usage accounting in [#15765](https://github.com/PrairieLearn/PrairieLearn/pull/15765) is outside
this spike. The broader proposal is [#15681](https://github.com/PrairieLearn/PrairieLearn/issues/15681).

The new service implements the same signed run, snapshot, SSE, and push-decision protocol.
PrairieLearn continues to own authorization, PostgreSQL history, the approval card, exact-tree
metadata validation, and the trusted Git push/course sync. The sandbox owns the working tree
and native harness session. The prototype requires manual approval even when an instructor
previously selected automatic approval with another runtime.

## Run locally

Use the existing **AGENT TEST** course and its configured repository/branch for the first live
run. The runtime does not create a course or change its repository configuration.

1. Install this branch's dependencies and build the workspace with `pnpm install` and
   `make build`. Set up PrairieLearn's normal Python and support-service dependencies if
   this is a new checkout.
2. Copy `.env.example` to `.env` in this directory. Supply a Vercel access token, team ID,
   project ID, an OpenAI API key, and a GitHub token with **read-only contents access to the
   test course repository**. Use the same capability secret in this service and PrairieLearn.
   Keep the `.env` file private; it is ignored by Git.
3. Merge these settings into the existing root `config.json` without replacing its other
   settings:

   ```json
   {
     "courseAgentRuntime": "vercel",
     "courseAgentVercelOrigin": "http://127.0.0.1:8788",
     "courseAgentCapabilitySecret": "the-same-at-least-32-character-secret"
   }
   ```

4. Enable the existing `course-agent` feature flag for AGENT TEST. PrairieLearn's trusted
   checkout must already have its normal GitHub write access, as required by the push/sync
   implementation. That credential is separate from this service's read-only token.
5. Start PrairieLearn normally. In another terminal at the repository root, run
   `pnpm dev-course-agent-vercel`. The service binds only to `127.0.0.1`, defaults to port
   8788, and exposes `GET /health`. Missing environment settings fail startup before any
   sandbox is created. Start a **new conversation** when switching runtimes.

The default model is `gpt-5.4`; `COURSE_AGENT_MODEL` can select another model supported by the
Codex adapter and your OpenAI account. `COURSE_AGENT_TIMEOUT_MS` defaults to 30 minutes per
active VM. `COURSE_AGENT_STATE_DIRECTORY` defaults to this directory's `.state` folder. Run
only one service process against that folder and keep it across service restarts.

The experimental SDK versions are pinned together in `package.json` and the workspace lockfile.
Do not independently upgrade one adapter during the first compatibility run.

## Runtime behavior

- Provision or resume one named persistent Vercel sandbox per conversation. Shallow-clone the
  authorized GitHub branch and check its initial commit against PrairieLearn's synced SHA.
  Copy the existing content-authoring references and examples into the VM.
- Run Codex through `HarnessAgent.stream`, translate activity into the existing course-agent
  event stream, and save state after each event. Browser disconnection does not cancel a run.
- At the end of a turn, detach the native harness session, stop the caller-owned VM, and
  require a confirmed snapshot before reporting a saved workspace. This prototype stops
  immediately between turns instead of keeping a warm VM during an idle grace period.
- When Codex calls `push_sync`, require a clean committed worktree, fetch the configured remote,
  check ancestry, collect the diff/tree, and checkpoint before exposing an approval.
  PrairieLearn validates the proposal and publishes only after manual approval.
- After a decision, restore the saved session and deliver the result through
  `continueStream`. After a successful push, fetch and merge the published remote commit.
  Repeated decisions are deduplicated locally. A pending approval survives service restart.

Vercel's firewall injects the read-only Git token only into matching smart-HTTP read requests
for the authorized repository and placeholder credential. Model authentication is supplied to
the trusted Codex adapter for its network transformation; the driver does not put real tokens
into clone URLs or sandbox environment variables. Bootstrap allows the npm registry.

The firewall's request matchers control credential injection, **not denial of every unmatched
request on an allowed host**. This prototype allows unauthenticated traffic to allowed GitHub,
npm, and OpenAI hosts. It is not a complete repository/API egress broker. Use only the dedicated
test repository while validating it. See the
[Vercel firewall documentation](https://vercel.com/docs/sandbox/concepts/firewall).

## Local checks and live acceptance

`pnpm --filter @prairielearn/course-agent-vercel test` exercises persistence, restart with a
pending approval, approval and denial continuations, duplicate delivery, conversation ownership,
snapshot failure, expiration, signed HTTP requests, event replay, and Git credential rules.
It needs a temporary loopback port but no cloud/model credentials.

Once credentials are configured, run this sequence in AGENT TEST:

1. Ask for one small practice question using existing course conventions. Verify streamed
   activity, proposed files, metadata validation, and a visible approval card.
2. Deny it. Verify GitHub and PrairieLearn course content remain unchanged and the agent
   receives the denial. Ask for a revision and inspect the new diff.
3. While the revised proposal awaits approval, restart the local runtime. Approve once.
   Verify the GitHub commit, successful course sync, tool continuation, and refresh action.
   Check the question renders and grades; metadata validation alone does not prove that.
4. Reload PrairieLearn, reopen the conversation, and ask a follow-up requiring an unpublished
   workspace file. Verify both native session context and files survived VM replacement.
5. Create a second conversation and confirm isolation. Exercise a remote branch change,
   denied network destination, and a failed sync; inspect the reported partial-success result.

Capture sandbox IDs, snapshot IDs, commit SHAs, timings, and redacted logs for the run. Do not
interpret a successful mocked test as evidence that Vercel resumed an outstanding native tool
call; that is the most important remaining compatibility check.

## Limits and next implementation strategy

The service keeps orchestration state and resume handles in private local JSON files. It has
no distributed lease, cross-process event coordination, or durable execution queue. A restart
during active execution reports failure without automatically replaying a paid prompt. A crash
while delivering a publication result requires a new conversation and inspection of the saved
publication result. Snapshots expire according to the signed backup TTL; losing `.state` also
loses the runtime's native-session resume handle. PostgreSQL history alone cannot restore it.

The inherited publisher applies the approved diff and creates a fresh commit in the trusted
checkout. It verifies the proposed tree; the published commit SHA can differ from the sandbox
commit SHA. There is no production usage ledger, quota enforcement, cancellation UI, snapshot
retention manager, or full question-render/grading test runner in this spike. Only the bundled
authoring references are copied; the Cloudflare R2 documentation mount is not used.

Keep this broad spike as the integration experiment. First prove the live acceptance sequence,
especially suspend/resume at `push_sync` and credential injection. Then carry the proven driver
and protocol behavior into the production stack: runtime provisioning/streaming, repository
access, durable sessions, and publication. Replace local JSON orchestration with transactional
state and a single durable owner per conversation before deployment; add usage accounting as
the subsequent layer. Keep the existing UI and trusted publication logic unless the live run
exposes a specific incompatibility. This avoids a second wholesale UI rewrite while giving the
new provider a real end-to-end trial.

# Cloud agent architecture

This is a design proposal for an agent that can help instructors create and
operate PrairieLearn courses. It is intentionally separate from the local MCP
proof of concept: that server validates the useful tool surface and agent loop,
but it has no production authorization or durability model.

## Decision summary

- Use **PrairieLearn as the system of record and policy-enforcement point**.
  It owns user identity, course authorization, durable run state, audit events,
  long-running jobs, and every operation that can read or modify course or
  student data.
- Use a **Cloudflare Worker plus Durable Object as the cloud execution control
  plane**. It creates and coordinates ephemeral Cloudflare Sandboxes, streams
  run events to the UI, and serializes activity for one agent conversation.
- Run a **Claude Code harness inside each sandbox**. The harness receives a
  checked-out course repository and a remote, authenticated PrairieLearn tool
  service. It has no database connection and no durable provider, GitHub, or
  PrairieLearn credential.
- Keep **GitHub as the publication authority for the MVP**. Publishing requires
  a successful GitHub push before PrairieLearn syncs the course. Store immutable
  Git bundles in R2 as recoverable conversation checkpoints, retained until the
  conversation is explicitly deleted; never use R2 as a mounted Git remote.
- Reuse **PrairieLearn's existing centralized Git identity and repository
  configuration**. Instructors do not connect GitHub or supply credentials.
  The sandbox clones and pushes directly over HTTPS, while a Worker outbound
  handler injects PrairieLearn's centrally managed GitHub token without
  exposing it to Claude. PrairieLearn retains authorization, repository
  administration, pull-request creation, and course sync.
- Start with a **small conversation page and an append-only run timeline**.
  Every proposed side effect is visible, attributable, reviewable, and linked
  to the corresponding Git commit, PrairieLearn job, or approval.

## System shape

```text
Instructor browser
       |
       | PrairieLearn session + SSE
       v
+-------------------+       signed, short-lived run capability
| PrairieLearn app  |----------------------------------+
| - conversation UI |                                  |
| - authorization   |                                  v
| - tool API        |                         +-------------------+
| - jobs/audit/PG   |<---- authenticated ----| Cloudflare Worker  |
+---------+---------+       tool requests    | + Durable Object   |
          |                                    +---------+---------+
          | GitHub API / course sync                     |
          v                                             | creates/resumes
       GitHub <------------------------------+           v
          ^          credential-injected Git | +-------------------+
          +----------------------------------| Cloudflare Sandbox |
                                             | - Claude Code      |
                                             | - local Git/Bash   |
                                             | - MCP adapter      |
                                             +-------------------+
                                                       |
                                                       | credential-injected
                                                       | model egress
                                                       v
                                                Anthropic API
```

The sandbox is untrusted. The Worker is trusted to hold egress credentials and
execute signed capabilities, but it is not an independent policy authority.
The PrairieLearn app remains the authorization boundary: a tool call does not
become authorized merely because a Claude process made it. PrairieLearn
re-checks the instructor, institution, course, resource scope, operation type,
and agent-run capability on every tool call and approval.

## Components and responsibilities

### PrairieLearn agent service

Add a first-class agent service to `apps/prairielearn`, protected by the normal
PrairieLearn login and authorization model. It should provide:

- the conversation page and HTTP/SSE endpoints;
- `agent_conversations`, `agent_runs`, `agent_events`, `agent_operations`, and
  `agent_artifacts` records in Postgres;
- a course-scoped, versioned tool API;
- approval and policy evaluation before every consequential action;
- audit events in the same database transaction as each mutation;
- a single-variant question preview adapter plus asynchronous job adapters for
  sync, imports, and regrades;
- signed, single-use publication capabilities bound to one repository, branch,
  and commit; and
- pull-request operations built on the course's existing repository
  configuration and PrairieLearn's existing GitHub API machinery.

The service issues a signed, audience-bound **run-scoped access token**. It
contains the run and conversation IDs, authenticated and effective user IDs,
course ID, allowed tool families, expiry, and a unique token ID. Signing lets
PrairieLearn reject altered claims without a database lookup; short expiry and
revocation limit damage if a token is captured. PrairieLearn still recomputes
the user's current authorization on every consequential call. The Worker may
exchange the run token for a per-call token; the sandbox never gets the
PrairieLearn session cookie or a reusable database credential.

### Cloudflare Worker and Durable Object

Use one Durable Object per conversation (or per active run) for coordination:
one active turn lease, cancellation, token streaming, sandbox ID, and recovery
orchestration. Its durable state and the corresponding R2 checkpoints may live
for the conversation's lifetime even though the object hibernates and sandbox
containers are disposable. Do not make Durable Object storage the only durable
history; write the canonical run/event/operation records to PrairieLearn
Postgres before acknowledging externally visible progress.

The Worker performs only orchestration. It should not contain raw database
access, PrairieLearn authorization rules, or a second implementation of the
tools. A resumed run reads the durable operation log from PrairieLearn and
continues from an idempotent checkpoint.

### Cloudflare Sandbox and Claude Code harness

Build a pinned image containing Node, Git, the Claude Code CLI, the course
authoring dependencies needed for static checks, and a small bootstrap program.
At run start the Worker:

1. obtains the authorized repository URL and exact base ref from PrairieLearn;
2. creates or resumes a sandbox identified by run ID;
3. attaches a read-only GitHub outbound handler, clones the course directly
   under the stable path `/workspace/course`, creates
   `pl-agent/<course>/<run>` from the authorized base commit, and durably uploads
   and verifies the baseline Git bundle before model execution begins;
4. starts a local MCP adapter whose tool implementations call the remote,
   authenticated PrairieLearn tool API;
5. launches Claude Code with an explicit allowed-tool policy and a bounded turn,
   cost, and wall-time budget; and
6. streams structured harness output back through the Worker as run events.

The local proof of concept shows the right _capabilities_ but not the production
transport. In production, expose typed remote tools over authenticated HTTPS;
the sandbox adapter may present those tools to Claude Code as MCP. That keeps
the agent-facing contract independent of any one harness and lets direct UI,
scheduled automation, or another provider call the same operation service.

## Tool contract

Each tool call includes `run_id`, `operation_id` (idempotency key), the
course/resource scope, and an expected Git revision when it reads or writes
course content. Each response includes an immutable event ID and, when
applicable, a job ID, commit SHA, artifact IDs, and a proposed/committed state.

The initial production tools should map the POC into four classes:

| Class   | Examples                                                                 | Behavior                                                                                        |
| ------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Read    | list entities, read course files, query approved course data, job output | Scoped, row/size/time limited, redacts data not needed by the task.                             |
| Draft   | write file, create course/instance/assessment/question, generate rubric  | Writes only to the agent branch or records a proposal; no student-visible effect.               |
| Preview | render question                                                          | Materializes one draft revision and renders one variant through PrairieLearn's preview path.    |
| Apply   | sync course, publish, enroll, regrade, grade, change access control      | Requires a policy decision and often instructor approval; runs as an auditable, idempotent job. |

### Arbitrary read queries

Keep one general-purpose `query_course_data` tool rather than creating one tool
per table or report. The model supplies one arbitrary SQL query and receives
column names, structured rows, a row count, and a truncation flag. It may use the
result in subsequent reasoning or scripts inside the sandbox.

The tool is _presented_ locally to Claude by the sandbox MCP adapter, but its
trusted implementation runs in PrairieLearn. The adapter forwards the SQL over
authenticated HTTPS; the sandbox receives neither a Postgres connection string
nor the PrairieLearn application database role. PrairieLearn executes the query
in a read-only transaction with a dedicated query role, one-statement parsing,
statement and lock timeouts, bounded rows and bytes, restricted concurrency,
and a complete audit event. Keyword scanning may improve error messages but is
not a security boundary.

Read-only execution prevents mutation but does not prevent the query from
reading another course. Production use therefore requires a deterministic
database-enforced or query-engine-enforced row-scope mechanism. PrairieLearn
currently uses neither application database views nor row-level security, so do
not silently introduce a permanent view hierarchy or claim that the POC's
read-only transaction is sufficient. Before enabling this tool outside local
development, choose and threat-model one of:

- policies for a dedicated query role that enforce course and course-instance
  scope from an unforgeable run context;
- a real SQL parser/compiler that exposes an allowlisted relational catalog and
  inserts trusted scopes; or
- a narrower structured-query surface backed by existing parameterized model
  queries if arbitrary SQL cannot be secured without an alien database pattern.

The release gate is behavioral, not architectural preference: fixtures with two
courses and differently privileged instructors must prove that no accepted SQL
can return rows or sensitive columns unavailable to the calling instructor.
Writes, grades, enrollment, and access-control changes remain separate typed and
audited tools regardless of the read-query design.

The sandbox edits and commits its local checkout with normal Git and Bash. The
Git credential remains in the Worker runtime and is added to Git HTTPS requests
by an outbound handler, so it cannot be read from the sandbox environment,
process list, filesystem, or remote URL. Normal runs receive clone/fetch access
only.

Publication requires a signed, single-use capability from PrairieLearn bound to
the repository, agent branch, approved commit SHA, operation ID, and a short
expiry. The Worker pauses the Claude harness, verifies the local head, enables
the write handler only for the controlled push, and removes it in a `finally`
block. A separate, model-free publisher sandbox is the preferred production
hardening so no untrusted process shares the write window. PrairieLearn verifies
the remote head and uses its existing GitHub API machinery to create the draft
pull request. The instructor or a separately approved automation merges it;
PrairieLearn then uses its existing course sync path to apply the merged content
to the live course.

### Single-variant question preview

Use `render_question`, not the proof-of-concept `test_question`, in the MVP
authoring loop. The existing AI question-generation agent already follows this
pattern: it validates and saves the draft, invokes `getAndRenderVariant()` once
to collect render issues, and displays that same variant with the normal
question-preview components.

`render_question` takes a QID, the expected conversation revision, and an
optional variant seed. It must:

1. verify that the revision is the conversation's current checkpoint;
2. materialize that question's files as a conversation-scoped draft without
   changing the published question;
3. run the AI HTML validation used by question generation;
4. generate and render exactly one variant through the instructor-preview path,
   loading detailed issue output; and
5. return the variant ID and seed, a signed preview URL, and structured
   validation/render issues. The conversation UI embeds the resulting preview;
   a screenshot artifact for a vision-capable harness can be added later.

With no seed, each invocation creates one fresh preview. Supplying the returned
seed reproduces a failure. The tool does not fan out across variants, manufacture
correct/incorrect/invalid submissions, grade them, or claim statistical
coverage. Those behaviors belong in opt-in validation or CI if they are ever
needed, not in the normal agent conversation.

## Conversation and workspace durability

There are three related but distinct kinds of state:

| State                                                                                               | Durable authority                                                                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| User/assistant messages, normalized tool calls and results, approvals, operations, and audit events | PrairieLearn Postgres                                                                           |
| Claude Code's provider-specific resumable transcript and subagent transcripts                       | R2 through an Agent SDK `SessionStore` adapter                                                  |
| Course files and Git objects                                                                        | GitHub for published content; immutable R2 Git bundles for unpublished conversation checkpoints |

Claude Code normally writes its transcript under `~/.claude/projects` in the
container. Capture the session ID from the harness result, record it on the
PrairieLearn run, and configure the Agent SDK with a custom `SessionStore`.
The adapter addresses immutable R2 parts by stable project key, conversation,
session ID, subpath, and sequence. A Worker internal-host handler exposes
`append`, `load`, `listSubkeys`, and `delete` using an R2 binding; the sandbox
receives no R2 credential. Serialize appends through the conversation Durable
Object and deduplicate retried entries by their UUID.

On restart, restore the repository at the stable `/workspace/course` path,
attach the same session store, and launch the harness with
`resume: <claude_session_id>`. Claude receives its prior prompt, tool calls,
tool results, responses, and compacted context; the new user message need not
replay the entire conversation. The Postgres event log remains the canonical UI
and audit history and can seed a new provider session if the Claude-specific
transcript cannot be resumed.

Agent SDK session mirroring is best-effort. Treat its `mirror_error` event as a
failed durability checkpoint: do not acknowledge the turn as durably complete
or allow sandbox eviction until the bootstrap has retried or exported the local
transcript successfully. Transcript objects follow the same retention rule as
the conversation's Git bundles and are deleted only when the user explicitly
deletes the conversation. Because transcripts may contain instructor-visible
student data, apply the same encryption, residency, access logging, and deletion
policy as other agent artifacts.

### Git checkpoints

Cloudflare Sandboxes retain state only while their container is active. After
the default idle period, a new container starts with an empty filesystem. Their
backup API writes a point-in-time compressed image to R2 and can restore it, but
the mount itself is also lost after a restart.

Therefore **never mount R2 as `.git` and never treat an R2 backup as the Git
remote**. Git requires filesystem operations such as atomic ref updates and
locking that an object-store mount does not provide, regardless of R2's strong
consistency guarantees.

Use this recovery protocol instead:

1. After the initial direct GitHub clone, upload one complete baseline bundle to
   R2. This preserves the authorized base even if GitHub becomes unavailable.
2. After each meaningful edit or render checkpoint, commit the working tree and
   upload an incremental bundle containing objects since the prior checkpoint.
   Periodically compact the chain into a new complete bundle. Verify checksums
   before atomically advancing
   `{conversation, branch, head_sha, bundle_keys}` in Postgres.
3. Retain the conversation's checkpoint bundles without a TTL until the user
   explicitly deletes the conversation. R2 is immutable checkpoint transport,
   not a filesystem on which Git executes.
4. On a sandbox restart, download and verify the baseline plus incremental
   bundles and restore them into the sandbox's normal local filesystem. Resume
   the Claude transcript from its R2 session store and poll incomplete
   PrairieLearn operations by their idempotency key.
5. Publishing remains a distinct operation. Push the proposed commit to the
   configured GitHub repository with an expected remote head, then use
   PrairieLearn's existing course application/sync path. If GitHub is down, the
   conversation remains safely checkpointed and may continue drafting, but the
   publish operation is blocked or retryable and must not report success.
6. Optionally retain a Cloudflare `createBackup()` snapshot between adjacent
   turns to avoid re-installing dependencies. Treat it only as a cache: validate
   the Git head after restore and fall back to the R2 bundle if it fails.

This gives a fast resume path without running Git on R2. It also keeps the MVP's
publication semantics aligned with PrairieLearn today: GitHub availability is
an explicit dependency, while sandbox recovery is not.

## Credentials and network policy

The sandbox begins with `enableInternet: false` and a deny-by-default host
allowlist. Permit only the PrairieLearn agent API, the exact GitHub hosts needed
by Git HTTPS, the model endpoint, package registries during controlled setup,
and explicitly approved source-material hosts.

PrairieLearn already uses platform-owned GitHub credentials and course
repository configuration; instructors do not connect GitHub and must not supply
a token. For the MVP, configure the Worker with a deployment-managed HTTPS Git
credential representing that same PrairieLearn machine identity. Store it as a
Worker secret, never in Wrangler configuration or a sandbox environment. This
uses HTTPS rather than PrairieLearn's current SSH Git transport because
Cloudflare outbound handlers intercept HTTP and HTTPS, not SSH.

The Git handler validates the container/run mapping and exact course repository,
and injects authorization only for the allowed Git smart-HTTP endpoints. Normal
operation permits upload-pack for clone/fetch. Receive-pack is installed only
after PrairieLearn supplies the single-use publication capability and is
removed immediately after the controlled push. PrairieLearn's existing GitHub
client performs repository administration and draft-PR creation. A future
internal migration from a long-lived machine token to short-lived GitHub App
installation tokens would reduce blast radius but would be invisible to
instructors and is not an MVP dependency.

Use the same outbound-handler pattern for the Anthropic API key and the
PrairieLearn run credential. The sandbox receives neither secret, a Postgres
connection string, nor the instructor's session cookie. Tool and Git policies
may change at runtime without restarting the sandbox.

This path also keeps bulk course traffic away from PrairieLearn: baseline Git
objects move directly from GitHub to the sandbox, and recovery objects move
directly between the sandbox and R2. PrairieLearn receives bounded tool payloads,
events, approval records, preview inputs, and checkpoint metadata.

## Conversation UI

The MVP page belongs in PrairieLearn, not in the Worker. It has:

- a course-scoped conversation list and new-conversation action;
- streaming assistant messages plus a compact, expandable timeline of tool
  calls, jobs, commits, changed files, and artifacts;
- explicit approval cards for apply-class tools, showing a before/after table
  for access/grade/publishing changes;
- links to the agent branch/PR and the existing PrairieLearn destinations; and
- stop, resume, and retry controls tied to the durable run record.

Do not model the UI as a chat transcript only. The run timeline is the source
of operational truth and makes a long-running agent legible after the original
browser tab, Worker, or sandbox has disappeared.

## Execution model

The normal authoring loop is:

```text
request -> plan -> draft branch edits -> checkpoint -> render one preview
        -> revise if needed -> summarize -> approval -> publish through GitHub
```

### Example nontrivial workflow

Suppose an instructor asks: "Analyze performance on last semester's homework,
identify weak topics, and add three targeted practice questions to next
semester's course instance."

1. PrairieLearn checks that the instructor can read the requested historical
   course instance and edit the destination course. It creates a conversation,
   run, and read/draft capability. The Worker records the lease in the
   conversation Durable Object, attaches read-only Git and model outbound
   handlers, and directly clones the destination course from GitHub.
2. Claude calls `query_course_data` with a query such as:

   ```sql
   SELECT
     a.title,
     count(*) AS attempts,
     avg(ai.score_perc) AS mean_score_perc
   FROM
     assessments AS a
     JOIN assessment_instances AS ai ON ai.assessment_id = a.id
   WHERE
     a.course_instance_id = 123
     AND ai.include_in_statistics
   GROUP BY
     a.id,
     a.title
   ORDER BY
     mean_score_perc
   ```

   The SQL is illustrative; the query engine must independently enforce that
   `123` and every returned row are in the instructor's authorized scope even
   if the model omits or tampers with that predicate. PrairieLearn executes one
   read-only, time/row/byte-bounded statement and returns structured rows. No
   database or database credential is copied into the sandbox.

3. Claude can use Bash and local scripts to analyze those returned rows, inspect
   the course's existing question conventions, and draft three new question
   directories plus the course-instance configuration changes. Bash operates
   only on sandbox files and already-returned data; database access still goes
   through the one audited query tool.
4. Claude commits the draft and uploads a baseline or incremental Git bundle to
   R2. The Agent SDK mirrors its transcript to the R2 session store. Only after
   both checkpoints succeed does PrairieLearn record the new head as durable.
5. Claude calls `render_question` once for the first question. PrairieLearn
   materializes that checkpoint as a draft and renders exactly one variant
   through the existing instructor-preview path. Claude receives the seed and
   structured issues, fixes an invalid element attribute, checkpoints, and
   renders one replacement variant. It repeats the single-preview loop for the
   other questions rather than generating a bulk variant suite.
6. The instructor closes the browser and returns the next day after the sandbox
   has been evicted. The Worker starts a new sandbox, restores the Git baseline
   and incremental bundles at `/workspace/course`, loads the Claude transcript
   from the R2 `SessionStore`, and resumes the recorded session ID. The UI is
   reconstructed from Postgres. The recovery target for an ordinary course is
   under one minute at p95, with a cold-path target under two minutes; these are
   product SLOs to measure, not Cloudflare guarantees.
7. Claude summarizes the analysis, changed files, preview results, and exact
   commit. The instructor clicks **Create draft pull request**. PrairieLearn
   issues a one-use capability for that repository, agent branch, and SHA. The
   trusted publisher pushes through the credential-injecting Worker handler,
   PrairieLearn verifies the remote SHA, and its existing GitHub client creates
   the draft PR. A failure at any point is retryable and never reports a PR that
   does not exist.
8. After review and merge, PrairieLearn uses its existing course sync flow to
   import the merged repository state. Until that merge and sync, the questions
   remain drafts and cannot affect students. If GitHub is unavailable, analysis,
   editing, previews, and R2 checkpoints can continue; push, PR creation, and
   publication remain blocked for the MVP.

Imports, regrades, and other expensive work should be asynchronous jobs. Return
a job ID immediately, stream its logs, and let the harness poll `get_job_output`
or receive a completion event. `render_question` is deliberately bounded to one
variant per call. Add a separate, capacity-controlled agent rendering pool only
after measuring that it protects student render latency; student work remains
the higher-priority queue.

Use specialized subagents only behind the same run/operation protocol. A parent
run delegates immutable tasks with scoped capabilities and merges their Git
branches or artifacts through a reviewer step. The delegate never inherits a
broader course or student-data scope merely because it is a subagent.

## Local implementation and verification

The MVP must be runnable and testable on one development machine. Local mode
uses the real PrairieLearn application, Postgres, Worker code, Durable Objects,
R2 bindings, Sandbox container image, Git CLI, MCP adapter, signed-capability
path, and browser UI. Only the model provider and GitHub service are replaced by
deterministic local fakes in the default test path.

### Proposed repository layout

- Keep the PrairieLearn conversation page, tRPC procedures, external agent API,
  models, migrations, tool implementations, previews, jobs, and audits under
  `apps/prairielearn`.
- Add a small `apps/agent-worker` application containing the Worker entrypoint,
  conversation Durable Object, Sandbox class, outbound handlers, R2 transcript
  store, harness bootstrap, `wrangler.jsonc`, and pinned Sandbox Dockerfile.
- Keep shared wire schemas in a narrowly scoped package only if both
  applications need to compile against them; do not move PrairieLearn policy or
  database models into the Worker.
- Add local fixture services for an authenticated Git smart-HTTP remote and the
  minimal GitHub REST calls needed to record draft PRs. Both operate on a local
  bare repository and reject missing or incorrect injected credentials.

### Local topology and commands

Wrangler local development runs the Worker, Durable Objects, and R2 emulation;
Docker runs the Sandbox container and local Git/model fixtures. PrairieLearn
runs normally against the existing local Postgres, Redis, and S3-compatible
support services.

Add two top-level developer entrypoints:

- `make dev-agent`: starts or verifies PrairieLearn support services, the local
  Git and deterministic-model fixtures, PrairieLearn, and
  `wrangler dev --local --persist-to <repo-local-state-directory>`. It prints
  the conversation URL, service health, ports, and paths to local Wrangler
  state. Docker and Wrangler are the only additional runtime prerequisites.
- `make test-agent`: builds the Sandbox image and runs the deterministic unit,
  integration, Worker, and end-to-end acceptance suites. It must require no
  Cloudflare, GitHub, or Anthropic account and must leave failure logs and
  sandbox output at a printed path.

Use `.dev.vars` for optional local secrets and keep it ignored. A checked-in
`.dev.vars.example` documents variables without values. Local development must
not add an authentication bypass: test runs obtain the same signed run and
publication capabilities as production. An optional `make smoke-agent-live`
may use real Anthropic and GitHub credentials for manual compatibility testing,
but it is neither required for implementation nor a substitute for the local
suite.

The deterministic harness fixture implements the same streaming contract as
the Claude harness and executes a scripted sequence of MCP calls and Bash/file
operations. This makes recovery, cancellation, approval, and failure tests
repeatable and free. A separate adapter contract test runs the actual Claude
Code bootstrap without making a paid model request, verifying its arguments,
stable working directory, tool configuration, outbound policy, session ID
capture, and `SessionStore` wiring.

### Test layers

1. **Pure unit tests:** capability signing, expiry, audience and repository
   binding; operation idempotency; event folding; SQL statement classification
   and limits; Git bundle creation/checksums/chains; outbound Git endpoint
   allowlisting; and transcript-part ordering and deduplication.
2. **PrairieLearn integration tests:** normal course authorization; read-query
   timeout, size, and write rejection; audit events in the mutation transaction;
   preview materialization; exactly one `getAndRenderVariant()` invocation per
   `render_question`; publication approval; and remote-head verification.
3. **Worker tests:** use Cloudflare's Vitest integration with local Durable
   Object and R2 bindings to test one-turn leases, reconnects, cancellation,
   session-store append/load/delete, sandbox-ID recovery, outbound policy
   transitions, and one-use publication capabilities.
4. **Container contract tests:** run the pinned image with Docker, assert that
   the harness can use Git and Bash, cannot read injected secrets, cannot reach
   denied hosts or PrairieLearn's database, and can call only the allowed MCP
   adapter and Git smart-HTTP endpoints.
5. **Playwright acceptance test:** create a conversation through the real
   PrairieLearn UI, stream a deterministic agent turn, query fixture course
   data, edit and commit a question, render one preview, and checkpoint the Git
   and Claude state. Destroy the Sandbox container and Worker process, restart
   Wrangler against its persisted local state, resume the same session and Git
   SHA, approve publication, push to the authenticated local Git server, and
   observe a draft-PR record. Finally delete the conversation and assert that
   its Postgres records are tombstoned as required and its R2 transcript and Git
   objects are removed.

The cross-course query test is a release gate. Seed two courses and multiple
roles, then exercise nested subqueries, joins, CTEs, functions, and deliberately
misleading predicates. No accepted query may return a row or sensitive column
outside the effective instructor's scope. If the arbitrary-SQL design cannot
pass this test, ship the narrower structured-query surface instead.

Local R2 tests use direct binding `put`, `get`, `list`, and `delete` calls, not
an R2 filesystem mount. Sandbox backup/restore is only a performance cache and
is not required to pass locally; the authoritative recovery acceptance test
always destroys the sandbox and restores from Git bundles plus the transcript
store. A small staging smoke test can later cover Cloudflare-specific scheduling,
real outbound TLS interception, and the optional Sandbox backup API, but no core
correctness claim may depend on it.

## Suggested delivery plan

1. **Local spine:** `apps/agent-worker`, Wrangler/Docker orchestration,
   deterministic harness and Git fixtures, signed-capability round trip, R2 and
   Durable Object bindings, and the recovery acceptance test.
2. **Foundation:** PrairieLearn schema, audit/event model, remote MCP adapter,
   course-scoped read tools, and a minimal SSE conversation UI. No automated
   writes; arbitrary SQL remains development-only until its isolation gate
   passes.
3. **Draft authoring:** direct credential-injected Git checkout, R2 Claude
   session and Git checkpointing, draft-only course-file edits, single-variant
   question previews, controlled branch push, and draft-PR creation through
   PrairieLearn's existing GitHub client.
4. **Guarded apply:** instructor approval cards and idempotent implementations
   for selected content operations. Keep grades, enrollment, and access control
   read-only initially.
5. **Operations and grading:** add the higher-risk tool families one at a time,
   with separate permissions, audit views, and evaluation suites.
6. **Scale and evaluation:** task fixtures, deterministic replay, model/tool
   evaluations, queues, per-institution budgets, and an agent rendering fleet
   if production measurements justify it.

## Open decisions

- Should the Cloudflare Worker call PrairieLearn through a public HTTPS API,
  Cloudflare Tunnel/private connectivity, or a dedicated agent gateway? The
  choice must satisfy data residency and latency requirements before exposing
  student data outside the current deployment boundary.
- Can arbitrary instructor SQL be given a simple, deterministic row- and
  column-scope boundary that fits PrairieLearn's database conventions? The MVP
  must keep it development-only or fall back to structured queries until the
  cross-course isolation suite passes.
- How should agents continue publishing if GitHub is unavailable? The MVP does
  not solve this: GitHub remains required for publication. Cloudflare Artifacts,
  a second managed Git remote, or a PrairieLearn-owned content store would each
  change source-of-truth, conflict, deletion, and recovery semantics and need a
  separate design decision.
- Which apply-class operations can be fully automated after policy evaluation,
  and which always require an instructor click?
- Does Claude Code authenticate against an Anthropic service account through
  the outbound credential proxy, or does the institution bring its own model
  provider? The harness interface should permit both.
- Should long-lived workflow orchestration use a managed durable workflow
  system (for example Temporal/Restate) once operation graphs outgrow a Durable
  Object, rather than building a custom workflow engine?

## References

- [Cloudflare Sandbox lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)
- [Cloudflare Sandbox backup and restore](https://developers.cloudflare.com/sandbox/guides/backup-restore/)
- [Cloudflare Sandbox outbound traffic and credential injection](https://developers.cloudflare.com/sandbox/guides/outbound-traffic/)
- [Cloudflare Sandbox Git workflows](https://developers.cloudflare.com/sandbox/guides/git-workflows/)
- [Cloudflare tutorial: run Claude Code on a Sandbox](https://developers.cloudflare.com/sandbox/tutorials/claude-code/)
- [Cloudflare local development](https://developers.cloudflare.com/workers/local-development/)
- [Cloudflare local persistence](https://developers.cloudflare.com/workers/local-development/local-data/)
- [Cloudflare Sandbox Wrangler configuration](https://developers.cloudflare.com/sandbox/configuration/wrangler/)
- [Cloudflare Containers local development](https://developers.cloudflare.com/containers/local-dev/)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Claude Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Claude Agent SDK external session storage](https://code.claude.com/docs/en/agent-sdk/session-storage)
- [AI SDK Claude Code harness](https://ai-sdk.dev/providers/ai-sdk-harnesses/claude-code)
- [PrairieLearn course-content sync](../sync.md)

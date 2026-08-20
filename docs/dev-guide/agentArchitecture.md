# Cloud agent architecture (draft)

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
+-------------------+       tool requests    | + Durable Object   |
       ^                                      +---------+---------+
       |                                                |
       | operation status/events                        | creates/resumes
       |                                                v
       |                                      +-------------------+
       +--------------------------------------| Cloudflare Sandbox |
              HTTPS tool API                  | Claude Code        |
                                                | course checkout    |
                                                +-------------------+
                                                         |
                                      credential-injecting egress handlers
                                                         v
                                               GitHub / Anthropic API
```

The Worker and sandbox form an untrusted execution plane. The PrairieLearn app
is the trust boundary: a tool call does not become authorized merely because a
Claude process made it. PrairieLearn re-checks the instructor, institution,
course, resource scope, operation type, and agent-run capability on every call.

## Components and responsibilities

### PrairieLearn agent service

Add a first-class agent service to `apps/prairielearn`, protected by the normal
PrairieLearn login and authorization model. It should provide:

- the conversation page and HTTP/SSE endpoints;
- `agent_conversations`, `agent_runs`, `agent_events`, `agent_operations`, and
  `agent_artifacts` records in Postgres;
- a course-scoped, versioned tool API;
- approval and policy evaluation before every consequential action;
- audit events in the same database transaction as each mutation; and
- a single-variant question preview adapter plus asynchronous job adapters for
  sync, imports, and regrades.

The service issues a signed, audience-bound capability for one run. It contains
the run ID, instructor ID, course ID, allowed tool families, expiry, and a nonce.
The Worker may exchange it for a per-call token; the sandbox never gets the
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

1. obtains the current course repository ref and creates `pl-agent/<course>/<run>`;
2. creates or resumes a sandbox identified by run ID;
3. checks out that exact branch/commit under `/workspace/course`;
4. writes an MCP configuration that points to the remote PrairieLearn tool API;
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

`query_course_data` remains useful, but is not a general database credential.
It must run in a read-only transaction through a dedicated database role, with
course predicates injected by the server rather than trusted from agent SQL. For
the most sensitive data, prefer named report operations over arbitrary SQL.

File operations should use a server-side Git workspace or GitHub API and return
the resulting commit SHA. The sandbox can edit its checkout for the harness,
but the server validates the expected base ref and records the new commit before
calling `sync_course`. An agent may prepare a pull request; the instructor or a
policy-approved automation applies the content to the live course.

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

## Durability and Git

Cloudflare Sandboxes retain state only while their container is active. After
the default idle period, a new container starts with an empty filesystem. Their
backup API writes a point-in-time compressed image to R2 and can restore it, but
the mount itself is also lost after a restart.

Therefore **never mount R2 as `.git` and never treat an R2 backup as the Git
remote**. Git requires filesystem operations such as atomic ref updates and
locking that an object-store mount does not provide, regardless of R2's strong
consistency guarantees.

Use this recovery protocol instead:

1. After each meaningful edit or render checkpoint, commit the working tree and
   create a self-contained Git bundle for the conversation head. Upload it to
   an immutable R2 key, verify its checksum, and only then atomically advance
   `{conversation, branch, head_sha, bundle_key}` in Postgres.
2. Retain the conversation's checkpoint bundles without a TTL until the user
   explicitly deletes the conversation. R2 is immutable checkpoint transport,
   not a filesystem on which Git executes.
3. On a sandbox restart, download the latest bundle, verify it, and clone or
   fetch it into the sandbox's normal local filesystem. Reconstruct harness
   context from the event log and poll incomplete PrairieLearn operations by
   their idempotency key.
4. Publishing remains a distinct operation. Push the proposed commit to the
   configured GitHub repository with an expected remote head, then use
   PrairieLearn's existing course application/sync path. If GitHub is down, the
   conversation remains safely checkpointed and may continue drafting, but the
   publish operation is blocked or retryable and must not report success.
5. Optionally retain a Cloudflare `createBackup()` snapshot between adjacent
   turns to avoid re-installing dependencies. Treat it only as a cache: validate
   the Git head after restore and fall back to the R2 bundle if it fails.

This gives a fast resume path without running Git on R2. It also keeps the MVP's
publication semantics aligned with PrairieLearn today: GitHub availability is
an explicit dependency, while sandbox recovery is not.

## Credentials and network policy

The sandbox should begin with `enableInternet: false` (or an equivalent
allowlist). Permit only required hosts: the PrairieLearn agent API, GitHub, the
model endpoint, package registries during controlled setup, and explicitly
approved source-material hosts.

Cloudflare outbound handlers can attach secrets in the Worker runtime while the
sandbox makes a normal request, so use them for the GitHub App installation
token and Anthropic API key. Scope credentials by sandbox/run ID, operation,
and expiry; remove the GitHub write handler except during an explicit commit or
push. Do not pass a personal access token, a PrairieLearn database credential,
or the instructor's session into the container.

Use a GitHub App with per-organization/repository installation permissions:
read-only for baseline checkout, contents/pull-request write only for the
agent's branch, and no organization-wide administration. The Worker must
validate the requested repository against the course record before enabling the
handler.

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

## Suggested delivery plan

1. **Foundation:** schema, audit/event model, course-scoped read tools, remote
   MCP adapter, and a minimal SSE conversation UI. No automated writes.
2. **Draft authoring:** GitHub App integration, disposable sandbox checkout,
   R2 Git-bundle checkpointing, draft-only course-file edits, single-variant
   question previews, and PR creation.
3. **Guarded apply:** instructor approval cards and idempotent implementations
   for selected content operations. Keep grades, enrollment, and access control
   read-only initially.
4. **Operations and grading:** add the higher-risk tool families one at a time,
   with separate permissions, audit views, and evaluation suites.
5. **Scale and evaluation:** task fixtures, deterministic replay, model/tool
   evaluations, queues, per-institution budgets, and an agent rendering fleet
   if production measurements justify it.

## Open decisions

- Should the Cloudflare Worker call PrairieLearn through a public HTTPS API,
  Cloudflare Tunnel/private connectivity, or a dedicated agent gateway? The
  choice must satisfy data residency and latency requirements before exposing
  student data outside the current deployment boundary.
- Who owns the GitHub App installation: PrairieLearn centrally, each
  institution, or each course repository owner?
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

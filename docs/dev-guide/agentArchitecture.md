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
- Keep **GitHub Git refs and commits—not R2—as the durable workspace**. A
  sandbox can be re-created by checking out the agent branch at its recorded
  commit. R2 sandbox backups are only a disposable cache/checkpoint.
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
- asynchronous job adapters for sync, question tests, imports, and regrades.

The service issues a signed, audience-bound capability for one run. It contains
the run ID, instructor ID, course ID, allowed tool families, expiry, and a nonce.
The Worker may exchange it for a per-call token; the sandbox never gets the
PrairieLearn session cookie or a reusable database credential.

### Cloudflare Worker and Durable Object

Use one Durable Object per conversation (or per active run) for short-lived
coordination: one active turn lease, cancellation, token streaming, sandbox ID,
and recovery orchestration. Do not make Durable Object storage the only durable
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

The initial production tools should map the POC into three classes:

| Class | Examples                                                                 | Behavior                                                                                        |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Read  | list entities, read course files, query approved course data, job output | Scoped, row/size/time limited, redacts data not needed by the task.                             |
| Draft | write file, create course/instance/assessment/question, generate rubric  | Writes only to the agent branch or records a proposal; no student-visible effect.               |
| Apply | sync course, publish, enroll, regrade, grade, change access control      | Requires a policy decision and often instructor approval; runs as an auditable, idempotent job. |

`query_course_data` remains useful, but is not a general database credential.
It must run in a read-only transaction through a dedicated database role, with
course predicates injected by the server rather than trusted from agent SQL. For
the most sensitive data, prefer named report operations over arbitrary SQL.

File operations should use a server-side Git workspace or GitHub API and return
the resulting commit SHA. The sandbox can edit its checkout for the harness,
but the server validates the expected base ref and records the new commit before
calling `sync_course`. An agent may prepare a pull request; the instructor or a
policy-approved automation applies the content to the live course.

## Durability and Git

Cloudflare Sandboxes retain state only while their container is active. After
the default idle period, a new container starts with an empty filesystem. Their
backup API writes a point-in-time compressed image to R2 and can restore it, but
the mount itself is also lost after a restart.

Therefore **never mount R2 as `.git` and never treat an R2 backup as the Git
remote**. Git requires coherent, atomic ref and object semantics; object-store
consistency and a FUSE mount are the wrong durability primitive for it.

Use this recovery protocol instead:

1. The authoritative checkpoint is `{run, branch, head_sha, operation log}` in
   Postgres plus the pushed GitHub branch.
2. After each meaningful edit/test checkpoint, the runner commits and pushes
   the agent branch. Push with an expected remote head; on divergence, stop and
   ask the agent to rebase/resolve as a new explicit operation.
3. On a sandbox restart, create a fresh checkout at the recorded `head_sha`,
   reconstruct the harness context from the event log, and poll incomplete
   PrairieLearn operations by their idempotency key.
4. Optionally retain a Cloudflare `createBackup()` snapshot between adjacent
   turns to avoid re-installing dependencies. Persist only its handle and TTL;
   validate the Git head after restore and fall back to clone if it fails.

This gives the desirable fast resume path without relying on R2 for source
control correctness.

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
request -> plan -> draft branch edits -> static validation -> sync/test job
        -> summarize evidence -> approval (when needed) -> apply or open PR
```

Tests and other expensive work should be asynchronous jobs, not hundreds of
per-request tool round trips. Return a job ID immediately, stream its logs, and
let the harness poll `get_job_output` or receive a completion event. Add a
separate, capacity-controlled agent rendering pool only after measuring that it
protects student render latency; student work remains the higher-priority queue.

Use specialized subagents only behind the same run/operation protocol. A parent
run delegates immutable tasks with scoped capabilities and merges their Git
branches or artifacts through a reviewer step. The delegate never inherits a
broader course or student-data scope merely because it is a subagent.

## Suggested delivery plan

1. **Foundation:** schema, audit/event model, course-scoped read tools, remote
   MCP adapter, and a minimal SSE conversation UI. No automated writes.
2. **Draft authoring:** GitHub App integration, disposable sandbox checkout,
   draft-only course-file edits, sync/test jobs, and PR creation.
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

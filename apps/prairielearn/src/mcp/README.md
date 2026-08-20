# Agent MCP server (experimental)

An [MCP](https://modelcontextprotocol.io) server that exposes PrairieLearn to an
external agent harness such as Claude Code. It is a **local development tool**:
it performs no authorization checks and refuses to start against anything that
doesn't look like a developer's own machine.

The premise is that a harness already has excellent file tools, and course
content is just files in a git repository. So this server only provides what a
harness _can't_ do on its own: reach PrairieLearn's database, sync pipeline, and
question rendering engine.

## Tools

| Tool                | Purpose                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_course`       | Applies file edits by syncing disk → database. Returns schema errors, dangling QID references, duplicate UUIDs, undeclared topics/tags. |
| `list_entities`     | Lists questions, course instances, or assessments with both database IDs and repo paths. Bridges `qid` (files) to `question_id` (data). |
| `test_question`     | Renders a question across random variants, submitting correct/incorrect/invalid answers. Failures include the reproducing seed.         |
| `query_course_data` | Read-only SQL over student work, statistics, and issues. Single `SELECT`/`WITH`, 1000-row cap, 15s timeout.                             |
| `get_job_output`    | Reads a job sequence's output.                                                                                                          |

The agent's working loop is **edit files → `sync_course` → `test_question` →
repeat**. The primer served as the server's MCP `instructions` (see
`instructions.ts`) explains the repo layout, where PrairieLearn's own docs live,
and the SQL joins that are wrong in non-obvious ways.

## Safety

This server has no permission model, so the guards are environmental:

- Refuses to start when `NODE_ENV=production`.
- Refuses to start when `config.devMode` is false.
- Refuses to connect to any Postgres host other than localhost.
- Refuses to operate on the example course or a deleted course.
- `query_course_data` runs in a `READ ONLY` transaction with a statement
  timeout, and rejects anything that isn't a single `SELECT`/`WITH`.
- The scratch-course script refuses to create a course inside the PrairieLearn
  repository, so agent edits can't dirty PrairieLearn's own working tree.

The MCP SDK is a **devDependency**, so it never enters the production dependency
tree.

## Setup

Requires a local Postgres and Redis, plus the Python environment
(`make python-deps`).

```sh
# 1. Create a scratch course outside the repository, seeded from testCourse.
pnpm --filter @prairielearn/prairielearn mcp:create-scratch-course
# -> prints the course id, e.g. 1

# 2. Verify the tools work end to end.
pnpm --filter @prairielearn/prairielearn mcp:smoke-test -- --course-id 1
pnpm --filter @prairielearn/prairielearn mcp:loop-test -- --course-id 1
```

Then register the server with your harness. For Claude Code, add to
`.mcp.json` or `~/.claude.json` — the course id is machine-specific, so this
is deliberately not committed:

```json
{
  "mcpServers": {
    "prairielearn": {
      "type": "stdio",
      "command": "pnpm",
      "args": ["--filter", "@prairielearn/prairielearn", "mcp", "--", "--course-id", "1"],
      "cwd": "/absolute/path/to/PrairieLearn"
    }
  }
}
```

If you use Conductor, the database name comes from `CONDUCTOR_WORKSPACE_NAME`,
so pass that through in `env` alongside `CONDUCTOR_PORT`.

## Flags

```
--course-id <id>    Required. The course to operate on.
--user-uid <uid>    User to act as. Default: dev@example.com
--config <path>     Config file path. Defaults to the standard locations.
```

## Not implemented

There are no tools for grades, enrollment, staff, rubrics, or LMS integration,
and no authorization layer. Content writes go through the harness's own file
tools rather than PrairieLearn's `Editor` classes, which means this does not
exercise the production git path (commit, push, conflict retry, sharing
validation).

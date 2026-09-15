# Course-agent data exposure

The course agent may query PrairieLearn data only through a reviewed **logical schema**.
That schema is defined in `apps/prairielearn/src/lib/course-agent/data-exposure/manifest.ts`
and is the source of truth for later DSL compilation and temporary-view generation.

PostgreSQL foreign-key metadata validates and expands the declared ownership path. It does
not choose authorization semantics.

## Authorization

| Data kind                     | Required permission                                              | Scope                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Course configuration          | Course preview/view, or instance view for instance-linked rows   | `courses.id` of the authorized course                                                                         |
| Course-instance configuration | Course preview/view **or** `has_course_instance_permission_view` | Exact authorized `course_instances.id`, or every instance of the course when the user has course-wide preview |
| Student data                  | `has_course_instance_permission_view` for the exact instance     | Exact authorized `course_instances.id`                                                                        |

Course-level ownership does not grant student-data access. A user with only course-instance
access receives the configuration needed to interpret that instance (assessments and the
questions/tags/topics they use), not every question in the course.

Global tables such as `users` are exposed only as scoped projections (`enrolled_users`).

Institution administrators and global administrators still query through the same course /
course-instance context. They do not receive rows from other courses.

## Special ownership paths

These tables have nullable or multiple plausible foreign keys. The manifest names a reviewed
path instead of taking the shortest FK route:

- `assessment_tools` — assessment **or** zone (exclusive-or).
- `question_tags` — both the question and the tag must belong to the authorized course.
- `variants` — `preview_variants` (`course_instance_id IS NULL`) versus `student_variants`
  (`course_instance_id` set).
- `issues` — `course_issues` versus `instance_issues`.
- `page_view_logs` / `current_pages` — require a non-null `course_instance_id`; the question
  FK is not used as a scope path.

Rubrics are not owned by a course column. They are reached through
`assessment_questions.manual_rubric_id`.

## Soft-deleted rows

Configuration queries exclude soft-deleted courses, instances, assessments, questions, and
team configs. Historical student-facing objects (deleted teams, deleted grading jobs, deleted
rubrics) remain queryable so past scores can be interpreted.

## Schema drift

`assertCourseAgentDataExposureMatchesDatabase()` loads `pg_attribute` and `pg_constraint`
and fails if a declared table, column, type, or foreign-key hop is missing, if a scope path
cycles, or if a path does not end at `courses` or `course_instances`. The check runs at
application startup and in CI.

New physical columns are unavailable to the agent until they are added to the manifest
allowlist.

## DSL and tool descriptions

Call `getCourseAgentLogicalSchema()` for the versioned JSON advertised to the query DSL and
tools. Relation names, column allowlists, data kinds, and authz requirements all come from
that object. The compiler must not accept identifiers that are absent from it.

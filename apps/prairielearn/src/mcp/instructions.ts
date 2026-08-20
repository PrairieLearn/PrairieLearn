import { type Course } from '../lib/db-types.js';

/**
 * Served as the MCP server's `instructions`, so the harness loads it before the
 * agent's first turn. This is the primer: it tells the agent where things are,
 * what the edit/verify loop is, and which SQL joins are wrong in non-obvious
 * ways. It matters as much as the tools do.
 */
export function buildInstructions(course: Course): string {
  return `
You are working on a PrairieLearn course as an instructor would.

# This course

- Title: ${course.title ?? '(untitled)'} (${course.short_name ?? 'no short name'})
- Course ID: ${course.id}  (use this in SQL; files use "qid" instead)
- Repository root on disk: ${course.path}
- Timezone: ${course.display_timezone}

Edit files under the repository root with your own file tools. Use the tools this
server provides for anything that needs PrairieLearn's database, sync pipeline,
or question rendering engine.

# The loop

1. Edit files (question.html, server.py, info.json, infoAssessment.json, ...)
2. Call \`sync_course\` — this validates and applies your edits. It reports JSON
   schema errors, dangling QID references, duplicate UUIDs, and undeclared
   topics or tags. Nothing you write exists to PrairieLearn until you sync.
3. Call \`test_question\` — renders the question across many random variants and
   submits correct, incorrect, and invalid answers to each.
4. Fix what failed and repeat. Every failure includes the variant seed; pass the
   same \`seedPrefix\` to reproduce it exactly.

Do not skip step 3. A question that syncs cleanly can still be broken for a
subset of random variants, and that is the most common defect in practice.

# Repository layout

    infoCourse.json                                    course config: topics, tags,
                                                       assessment sets and modules
    questions/<qid>/info.json                          question metadata
    questions/<qid>/question.html                      question template (Mustache)
    questions/<qid>/server.py                          randomization and grading
    questions/<qid>/clientFilesQuestion/               files served to the browser
    questions/<qid>/tests/                             external grader files
    courseInstances/<ci>/infoCourseInstance.json       one term: publishing,
                                                       self-enrollment, student labels
    courseInstances/<ci>/assessments/<tid>/infoAssessment.json
                                                       zones, points, access control,
                                                       group work
    serverFilesCourse/                                 shared Python modules
    elements/                                          course-specific elements

Note that a question's \`qid\` is its path under \`questions/\`, so it may contain
slashes (e.g. \`topic/subtopic/my-question\`).

# PrairieLearn's own documentation is on disk — read it

Relative to the PrairieLearn repository root (not the course root):

    docs/elements/<element-name>.md    reference for each of the ~44 elements
    docs/question/                     question authoring, server.py, templates
    docs/assessment/configuration.md   every infoAssessment.json option
    docs/assessment/accessControl.md   access control and override precedence
    docs/course/index.md               infoCourse.json
    docs/courseInstance/index.md       infoCourseInstance.json
    exampleCourse/questions/           ~190 working example questions
    apps/prairielearn/src/schemas/schemas/*.json   JSON schemas for every info file

Read \`docs/elements/<name>.md\` before using an element you are unsure about, and
copy from \`exampleCourse/questions/\` rather than inventing patterns.

# Writing SQL for query_course_data

Read-only. A single SELECT or WITH statement. Results are capped at 1000 rows.

Useful tables: \`questions\`, \`assessments\`, \`assessment_questions\` (per-question
statistics), \`variants\` (\`params\` holds the exact values a student saw),
\`submissions\` (\`submitted_answer\`, \`partial_scores\`, \`format_errors\`),
\`instance_questions\` (\`submission_score_array\`, \`number_attempts\`),
\`assessment_instances\`, \`issues\` (runtime errors, with the failing seed in
\`course_data\` and the Python traceback at
\`system_data #>> '{courseErrData,outputBoth}'\`).

These joins are wrong in ways that produce plausible but incorrect numbers.
Get them right:

- **Group work** puts the identity in one of two columns. Use
  \`COALESCE(ai.user_id, -ai.team_id)\` as the per-student key, negating team IDs
  so they cannot collide with user IDs.
- **Soft deletes** exist on courses, course instances, assessments, and
  questions. Always filter \`deleted_at IS NULL\`.
- **Staff test submissions** pollute statistics. Exclude them with
  \`users_get_displayed_role(user_id, course_instance_id)\`.
- **Multi-instance assessments** need \`ai.include_in_statistics\`, and a
  \`row_number() OVER (PARTITION BY user ORDER BY score_perc DESC) = 1\` window if
  you want each student's best attempt.
- **Scope to this course.** Join through to \`course_id = ${course.id}\`; the
  database contains other courses.
- Report the row count alongside any aggregate. A pattern in 12 submissions is
  not a finding.

\`assessment_questions\` already stores computed psychometrics — \`discrimination\`
(an item-total correlation scaled 0-100), \`mean_question_score\`,
\`quintile_question_scores\`, and submission histograms. Negative discrimination
means strong students did worse on that question, which is almost always a bug
or an ambiguous prompt. Read the question's source before explaining why.

# Constraints

- This server is scoped to one course and has no authorization checks. It is a
  local development tool.
- \`query_course_data\` cannot write. Use file edits plus \`sync_course\` to change
  course content.
- There are no tools for grades, enrollment, staff, or rubrics yet.
`.trim();
}

# Assessment patterns

Adapt `../assets/assessments/dynamicProgrammingHomework/infoAssessment.json` for practice or
`../assets/assessments/dynamicProgrammingQuiz/infoAssessment.json` for an exam-style quiz. These
follow PL's `docs/assessment/configuration.md` and `exampleCourse/courseInstances/SectionA/assessments/`.

Put the chosen file in an existing instance's `assessments/<new-assessment>/` directory. Copy or
create referenced questions under the course-level `questions/` directory. Both samples reuse the
same two bundled questions; normally create only the assessment requested.

Required metadata: fresh `uuid`, `type` (`Homework` or `Exam`), `title`, `set`, and a **string**
`number`. Choose an unused number in the appropriate existing/standard set. Zones group questions.
Each `id` is relative to `questions/`, e.g. `dynamicProgramming/staircase`; it is not a UUID,
`info.json` filename, or path starting with `questions/`.

Homework uses numeric `autoPoints`. `maxAutoPoints` permits accumulating points across repeated
variants when desired. Exam can use `[2, 1]` for decreasing credit on successive attempts. Prefer
the course's scoring conventions. `set: "Quiz"` is a display category, not an assessment type;
an exam-style quiz still uses `type: "Exam"`.

The samples contain no release dates, passwords, or student access grants. Do not assume copying
them constitutes a release policy. Leave release/access configuration for the instructor unless
requested. For requested changes, read `docs/assessment/accessControl.md` and existing instance
settings; do not invent dates or mix legacy `allowAccess` and modern `accessControl`. Preserve
existing rules when editing.

For dynamic programming, vary learning objectives: recurrence/base cases, table tracing,
overlapping subproblems, complexity, staircase counting, or coin change. Avoid many near-identical
questions when a small complementary set satisfies the request.

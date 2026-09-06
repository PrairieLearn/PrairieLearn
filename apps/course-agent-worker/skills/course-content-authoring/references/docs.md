# Documentation map

The bundled examples cover basic multiple-choice/numeric questions and Homework/Exam assessments.
No R2 credentials or internet access are needed to read them.

Additional PL documentation may be mounted read-only at `/opt/prairielearn-docs`. Check once for
the needed file, directly or under `docs/`. An empty directory is not documentation. Do not keep
retrying an unavailable mount or search the entire workspace for it.

| Need                         | Relative documentation path      | Official page if not mounted                               |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------- |
| Question layout and metadata | `question/overview.md`           | https://docs.prairielearn.com/question/overview/           |
| Mustache and panels          | `question/template.md`           | https://docs.prairielearn.com/question/template/           |
| Python generation/grading    | `question/server.md`             | https://docs.prairielearn.com/question/server/             |
| Assessment zones and points  | `assessment/configuration.md`    | https://docs.prairielearn.com/assessment/configuration/    |
| Release and access           | `assessment/accessControl.md`    | https://docs.prairielearn.com/assessment/accessControl/    |
| Multiple choice              | `elements/pl-multiple-choice.md` | https://docs.prairielearn.com/elements/pl-multiple-choice/ |
| Numeric input                | `elements/pl-number-input.md`    | https://docs.prairielearn.com/elements/pl-number-input/    |

Prefer a targeted read over repeated broad searches. Start with the local examples and course
conventions, not search-engine snippets. A docs bundle may contain `exampleCourse/` or schemas;
these are optional, not required for the bundled patterns. A course repository is not the PL
application source tree.

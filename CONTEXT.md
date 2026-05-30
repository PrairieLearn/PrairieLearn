# PrairieLearn — Domain Context

Terms resolved during design work. Domain-meaningful concepts only; not an
implementation index.

## Grading method vs. manually graded

A question's `grading_method` (`Internal` | `External` | `Manual`, default
`Internal`) is **not** the same as "is this question manually graded". A question
can be `grading_method = 'Internal'` (or have no auto-gradable answer) and still
be graded by a human, because **manual points are configured at the assessment
level** (`manualPoints` on the assessment question → `max_manual_points`).

- "Auto-graded points" = `assessment_questions.max_auto_points`.
- "Manually graded points" = `assessment_questions.max_manual_points`.
- A question is *manually gradable* when `max_manual_points > 0`, regardless of
  `grading_method`.

Example: `testCourse` `hw10-aiGrading` → question `aiGradingRubrics` is a
`pl-string-input` with no fixed correct answer, `grading_method = 'Internal'`,
`max_auto_points = 0`, `max_manual_points = 4`.

## Manual-grading queue

The instructor manual-grading UI ("submissions that need grading") is computed
from `instance_questions` where `requires_manual_grading = true` and
`status != 'unanswered'`. It is **independent of whether the assessment instance
is open or closed** — the queries do not filter on `assessment_instances.open`.

- `requires_manual_grading` is set `true` (sticky OR) by `saveSubmission` when
  the question has `max_manual_points > 0`.
- A saved-but-ungraded manual submission has `status = 'saved'`.
- Grading a submission (applying a rubric / score) clears
  `requires_manual_grading`, removing it from the queue.

## Element self-test (`test()`)

Each Freeform element defines a Python `test()` that synthesizes a submission
for a given `test_type` (`correct` | `incorrect` | `invalid`). It powers the
instructor "Test question" action and is reused to generate synthetic
submissions. Historically, manually-graded elements with **no fixed correct
answer** bailed out of `test()` (no submission). Generating synthetic manual
submissions requires a `test()` fallback that emits a plausible dummy answer in
that case.

## autoFinishExams scope

The `autoFinishExams` cron only closes/grades assessment instances where
`assessments.type = 'Exam'`. Homework instances are never auto-finished, so
leaving a Homework instance open has no cron side effects.

# Data for assessment diagnosis

## Getting results

Download results with the course data tools. `list_course_datasets` describes
every dataset and column. Filter each download to the assessments you're
analyzing, and select only the columns you need.

| Dataset                | Use                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course_instances`     | The offerings, with each one's timezone.                                                                                                                                          |
| `assessments`          | Each offering's copy of the assessment. Match offerings by `tid`, then confirm the questions match.                                                                               |
| `questions`            | Maps `question_id` to the QID used in course files.                                                                                                                               |
| `assessment_questions` | Each question's points on the assessment.                                                                                                                                         |
| `assessment_instances` | One per attempt at the assessment. Keep rows with `include_in_statistics`, which drops staff. `started_at` shows the day, and `duration` the total time.                          |
| `instance_questions`   | One per question a student was assigned: `score_perc`, `duration`, `highest_submission_score`, and manual and auto points.                                                        |
| `submissions`          | One per submission, with `score`, `submitted_at`, and `overridden`. Count attempts here, and take the first submission as the earliest `submitted_at` per `instance_question_id`. |

Join the datasets on their ID columns, and read them all as text so the IDs
match. Compute everything as aggregates; the downloads have one row per student
or submission.

If the instructor attaches exported results, aggregate them the same way and
never copy their student identifiers.

With no results at all, review the question source only, and say so at the top
of the report.

## Assessment structure

Course data lists an assessment's questions without their zones or slots. Read
those from the assessment's `infoAssessment.json`, and match questions by QID:

- Number each entry in a zone's `questions` list from 1, continuing across
  zones. An entry with `alternatives` is a slot whose alternatives are numbered
  in order, such as `6.1` and `6.2`.
- `numberChoose`, `bestQuestions`, and `maxPoints` on a zone or slot change how
  many questions each student gets and which ones count.
- A points list, such as `"points": [10, 7, 5]`, is a retry schedule.

The file describes the current definition. A past offering has its own
`infoAssessment.json` in its course instance, and Git history shows what it was
when students took it. If the questions students were assigned don't match the
file, say so.

If `assessments.max_points` is empty, add up each slot's maximum points.

## What course data can't show

Course data has scores and times, but no answer contents. These would each
settle a question it leaves open, and the instructor can attach them:

| To learn                                           | Ask for                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Which part of a question loses points              | The all-submissions file from the assessment's **Downloads** page, which has per-part scores and grader feedback |
| Common wrong answers                               | The same file, which has submitted answers                                                                       |
| Whether some generated values are harder           | The same file, which has each variant's parameters                                                               |
| Which rubric items graders applied, and who graded | The same file, which has rubric gradings and graders                                                             |
| How long the exam was                              | The instructor, when the time limit isn't in `infoAssessment.json`                                               |

## Known quirks

- **Staff score changes.** `submissions.overridden` marks a submission whose
  score staff changed. Check it for every question, not only those at 100%;
  partial bumps don't produce perfect scores. A bulk change shows up as many
  overridden submissions on one question. Report the effect with and without
  those students.
- **Manually graded questions.** `duration` and submission scores can be empty
  even when the question was graded. Use `manual_points`, and don't report
  first-submission scores or time for these.
- **Attempts.** `instance_questions.number_attempts` is unreliable; count rows
  in `submissions`.
- **Exam length** often isn't in PrairieLearn, for example when PrairieTest runs
  the exam. Don't infer it from when attempts closed. Use the 90th percentile of
  total duration as a rough guide, and say it's inferred.
- **Duration** includes idle time and revisits. Use medians, plus the share of
  students finishing near the limit.
- **Which submission.** Use the best submission when explaining the recorded
  score, and the first when studying initial mistakes. Exams can store saved but
  ungraded submissions (`score` is empty); skip them.
- **Days.** Timestamps are in UTC. Convert them to the course instance's
  timezone before checking which alternative was assigned on which day.
- **Statistics columns.** `mean_question_score` and the other statistics in
  `assessment_questions` are precomputed and can be out of date. Compute your
  own.
- **Course files contain identifiers too.** Access rules in
  `infoAssessment.json` can list student emails. Don't copy them into the
  report.
- **Zero-point questions** and workspace placeholders don't need analysis.

## Per-question statistics

For each offering, among attempts with `include_in_statistics`, compute for each
question with points:

| Measure               | From                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| Number assigned       | rows in `instance_questions`                                                      |
| Mean final score      | mean `score_perc`                                                                 |
| Full credit           | share with `score_perc` of at least 100                                           |
| No submission         | share with no rows in `submissions`                                               |
| Mean first submission | mean `score` of each student's first graded submission, among those who submitted |
| Mean attempts         | mean number of graded submissions, among those who submitted                      |
| Median minutes        | median `duration`, among those who submitted                                      |

Then group the questions by slot using the assessment structure, so alternatives
sit side by side.

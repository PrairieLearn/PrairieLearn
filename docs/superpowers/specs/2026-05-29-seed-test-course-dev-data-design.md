# Seed the test course with synthetic grading data on dev startup

**Status:** Approved design
**Date:** 2026-05-29
**Branch:** `reteps/seed-database`

## Background

Iterating on the manual-grading and assessment-instance-grading pages requires a
dev environment that already contains closed assessment instances, student
submissions on a manually-graded question, an attached rubric, and a partially
graded queue. Today there is no synthetic data: a fresh dev database has no
submissions, and producing them by hand (enroll students → open instances →
submit → grade) is slow and repetitive.

Two closed-unmerged PRs explored generating this data as **admin queries**:

- **#14636** — `generate_rubric_submissions` admin query: attaches a generated
  rubric to a manually-graded question and creates ungraded submissions for
  testing the manual-grading UI. It also added manual-grading fallbacks to the
  `test()` functions of input elements so that synthetic submissions can be
  generated for questions that have no `correct-answer` defined.
- **#14694** — overhauled `generate_submissions` to handle auto/external/manual
  grading, extracted a reusable `closeAssessmentInstance`, and added `test()`
  fallbacks to the file/text manual elements (`pl-file-upload`,
  `pl-file-editor`, `pl-rich-text-editor`).

Both were closed, so none of that code is in the repo today. This feature does
**not** resurrect the admin queries. It builds a dedicated, idempotent seed
module that runs automatically on dev-server startup, composing existing model
functions, and brings back **only** the Python element `test()` fallbacks
(which are a hard prerequisite for generating manual submissions).

## Goals

- On every dev-server startup, ensure the test course contains realistic
  synthetic data for the manual-grading and assessment-instance-grading pages.
- Idempotent: running repeatedly does not duplicate data and is a fast no-op
  once seeded.
- Never block or crash server startup if seeding fails.
- Provide an extensible foundation so more synthetic data (other assessments,
  other grading methods) can be added later.

## Non-goals

- No admin-UI path (the closed-PR admin queries are not restored).
- No production behavior — strictly `config.devMode`.
- No new course content on disk; we seed an existing test-course assessment.
- Not a general reproducible-fixtures system for integration tests (though the
  seed function is unit-tested).

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Primary goal | Manual-grading + assessment-instance-grading pages; extensible for more later |
| Trigger | Always in `devMode`, idempotent (no opt-in flag) |
| Target | One known manual-grading assessment: `Sp15` / `hw10-aiGrading` |
| Architecture | New seed lib composing existing model functions; resurrect Python `test()` fallbacks |
| Element set | **Both PRs' full set** (8 input elements + 3 file/text elements) |
| Data shape | ~30 students, closed instances, rubric attached, ~50% rubric-graded / ~50% pending |
| Course sync | Seed syncs the test course from disk first (self-contained on a fresh DB) |

## Target assessment

`testCourse/courseInstances/Sp15/assessments/hw10-aiGrading` — a Homework with a
single zone containing one question `aiGradingRubrics` (`manualPoints: 4`, no
auto points). `aiGradingRubrics` is a pure free-response `pl-string-input`
(`answers-name="explanation"`) with no `correct-answer`, which is exactly why
its element `test()` fallback must be restored (see below).

## Architecture

### New module: `apps/prairielearn/src/lib/seed-dev-data/`

- `index.ts` — exports `seedDevData()`, the orchestrator.
- `constants.ts` — exported tunables:
  - `SEED_STUDENT_COUNT = 30`
  - `SEED_GRADED_FRACTION = 0.5`
  - `TARGET_COURSE_INSTANCE_SHORT_NAME = 'Sp15'`
  - `TARGET_ASSESSMENT_TID = 'hw10-aiGrading'`
  - `SEED_STUDENT_UID_PREFIX = 'seed-student-'` (e.g. `seed-student-001@example.com`)
- `rubric.ts` — `generateFakeRubric()` helper (restored/adapted from #14636):
  produces ~5 rubric items whose positive points sum to `max_manual_points`,
  including one negative "style/formatting penalty" item.
- `index.test.ts` — integration test (see Testing).

The module composes existing functions only — no raw SQL beyond what those
helpers already encapsulate, and no resurrection of the admin-query files:

- `syncOrCreateDiskToSql(TEST_COURSE_PATH, logger)` — `sync/syncFromDisk.ts`
- a **deterministic seed-user upsert + enroll** (see note) — built on
  `enrollUserInCourseInstance` / the user-insert helpers in `models/`
- `makeAssessmentInstance` — `lib/assessment.ts`
- `ensureVariant` — `lib/question-variant.ts`
- `createTestSubmissionData` — `lib/question-testing.ts`
- `saveSubmission` — `lib/grading.ts`
- `closeAssessmentInstance` — `lib/assessment.ts` **(must also be restored; see below)**
- `unsetGradingNeeded` — `models/assessment-instance.ts` **(must also be restored; see below)**
- `updateAssessmentQuestionRubric`, `updateInstanceQuestionScore` — `lib/manualGrading.ts`
- `selectCompleteRubric` — `models/rubrics.ts`

### Supporting functions to restore

`closeAssessmentInstance` and `unsetGradingNeeded` were introduced in the closed
PRs and are not in the repo today. Restore them as part of this work:

- **`closeAssessmentInstance({ assessment_instance_id, authn_user_id, client_fingerprint_id })`**
  in `lib/assessment.ts` — extracted from `gradeAssessmentInstance`'s existing
  close path (locks the instance, throws if missing/not-open, runs the
  `close_assessment_instance` SQL inside a transaction). Refactor
  `gradeAssessmentInstance` to call it (the behavior-preserving extraction from
  #14694), so we don't duplicate the close logic.
- **`unsetGradingNeeded(assessment_instance_id)`** in `models/assessment-instance.ts`
  — sets `grading_needed = false` for the instance, so the `autoFinishExams`
  cron does not pick up these synthetic closed instances.

### Startup hook: `apps/prairielearn/src/server.ts`

Inside the existing dev-mode block (currently `server.ts:2583`):

```ts
if (config.devMode) {
  await insertDevUser();
  try {
    await seedDevData();
  } catch (err) {
    logger.error('Failed to seed dev data', err);
  }
}
```

`seedDevData()` runs after `insertDevUser()` so the dev user (an administrator)
exists and is used as `authn_user_id` for rubric creation and grading actions.
The try/catch guarantees a seeding failure logs and is swallowed — startup
proceeds regardless.

## Control flow of `seedDevData()`

```
1. Idempotency fast-path:
   - Resolve the dev user id (authn_user_id).
   - Look up the target assessment by (course short_name, assessment tid).
     If found, check whether any assessment_instance on it is owned by a
     seed student (uid LIKE 'seed-student-%').
   - If seed instances already exist → log "test course already seeded", return.
     (No disk sync — fast startup on every subsequent boot.)

2. Sync test course from disk:
   - syncOrCreateDiskToSql(TEST_COURSE_PATH, logger). Idempotent; guarantees
     course / course instance / assessment / assessment_question rows exist.

3. Resolve targets:
   - course instance Sp15, assessment hw10-aiGrading, and its
     manually-graded assessment_question (max_manual_points > 0).
   - If the assessment or a manual question can't be found, log a warning
     and return (the test course shape changed).

4. Create students:
   - Upsert SEED_STUDENT_COUNT users with deterministic uids
     (seed-student-001@example.com …) and enroll them in Sp15.
   - We do NOT reuse `generateAndEnrollUsers`, which assigns random uids; the
     deterministic uids are what make step 1's idempotency marker work. Use a
     small seed-local helper that upserts each user by uid (ON CONFLICT) and
     enrolls them.

5. Per student — create a graded-ready instance:
   - makeAssessmentInstance (Homework, mode 'Public', authn_user_id = dev user).
   - ensureVariant for the manual question.
   - createTestSubmissionData(variant, question, course, 'correct', ...).
   - saveSubmission (credit 100, not auto-graded — manual question).
   - closeAssessmentInstance + unsetGradingNeeded.

6. Attach rubric (once, to the assessment_question):
   - generateFakeRubric({ maxPoints: max_manual_points }).
   - updateAssessmentQuestionRubric(use_rubric: true, tag_for_manual_grading:
     true, items, authn_user_id).

7. Grade ~SEED_GRADED_FRACTION of submissions:
   - selectCompleteRubric → db rubric items.
   - For each chosen instance question, updateInstanceQuestionScore with
     manual_rubric_data applying a random subset of rubric items.
   - The remaining ~50% are left ungraded → visible as pending work in the
     manual-grading queue.

8. Log a summary (students created, instances closed, submissions graded).
```

### Idempotency marker

Deterministic seed-student uids are the marker. The fast-path in step 1 treats
"a seed student already has an assessment instance on the target assessment" as
"already seeded". This is robust on a fresh DB (no seed instances → seed runs)
and cheap on subsequent boots (one indexed lookup → early return).

## Python element changes (required prerequisite)

`createTestSubmissionData` invokes each element's `test()` to synthesize a
submission. For manually-graded questions with **no `correct-answer`**, the
current `test()` functions bail out with `return`, producing no submission.
Restore the manual-grading fallbacks from the two closed PRs for the **full set
of 11 elements**:

**Input elements (from #14636):** when `answers-name` has no entry in
`data["correct_answers"]`, synthesize a gradable dummy answer instead of
returning (honoring a `correct-answer` attribute if present, else a
type-appropriate sentinel for `correct` vs `incorrect`):

- `pl-string-input` — `"Correct answer"` / `"Incorrect answer"`
- `pl-integer-input` — `999` / `-999`
- `pl-number-input` — `999` / `-999`
- `pl-symbolic-input` — first variable (e.g. `x`) / its negation
- `pl-big-o-input` — `999 * n` / `-999 * n` (first declared variable)
- `pl-matrix-component-input` — all-ones / all-negative-ones matrix sized to `rows`×`columns`
- `pl-units-input` — restore the #14636 fallback
- `pl-drawing` — submit a single point at canvas center so `parse()` sees a non-empty list

**File/text elements (from #14694):** add a `test()` that emits valid
base64-encoded file content for `correct`/`incorrect` and a format error (or
valid content when blank is allowed) for `invalid`:

- `pl-file-upload` (plus its `generate_filename_from_pattern` helper and the
  `pl_file_upload_test.py` coverage from #14694)
- `pl-file-editor`
- `pl-rich-text-editor`

Each change is the exact diff from the corresponding closed PR; restore them
verbatim and re-run each element's existing Python tests.

### `question-testing.ts` adjustment (from #14694)

`compareTestResults` must skip the `partial_scores` / `score` comparison when
`question.grading_method === 'Manual'` (auto-grading is skipped for manual
questions, so those fields are null and there is nothing to compare). Thread
`question` into `compareTestResults` as #14694 did. This keeps the existing
"test question" admin action passing for manual questions whose `test()` now
produces a submission.

## Error handling

- Startup hook wraps `seedDevData()` in try/catch; failures are logged via
  `logger.error` and never propagate.
- Inside `seedDevData()`, "expected" missing-data conditions (assessment not
  found, no manual question) log a warning and return early rather than throw.
- All work uses existing model functions, which manage their own transactions;
  the seed does not introduce a new top-level transaction spanning all students
  (a partial failure mid-seed simply leaves fewer students, and the next boot
  re-runs because the fast-path marker check counts existing seed instances —
  note this means a partial seed is considered "seeded"; acceptable for dev).

## Testing

- **Vitest integration test** (`index.test.ts`): with the test course synced,
  call `seedDevData()` then assert: `SEED_STUDENT_COUNT` closed instances exist
  on the target assessment, the manual question has a rubric with the expected
  item count, and roughly `SEED_GRADED_FRACTION` of instance questions are
  graded (assert a count > 0 and < total rather than an exact split, since
  grading is random). Call `seedDevData()` a second time and assert the counts
  are unchanged (idempotent no-op).
- **Python element tests:** restore/extend each element's existing
  `*_test.py` for the manual-only fallback, including the
  `pl_file_upload_test.py` cases for `generate_filename_from_pattern` from
  #14694.

## Files touched

**New**
- `apps/prairielearn/src/lib/seed-dev-data/index.ts`
- `apps/prairielearn/src/lib/seed-dev-data/index.test.ts`
- `apps/prairielearn/src/lib/seed-dev-data/constants.ts`
- `apps/prairielearn/src/lib/seed-dev-data/rubric.ts`

**Modified**
- `apps/prairielearn/src/server.ts` — call `seedDevData()` in the devMode block
- `apps/prairielearn/src/lib/assessment.ts` — restore/extract `closeAssessmentInstance`
- `apps/prairielearn/src/lib/assessment.sql` — supporting blocks if needed for the extraction
- `apps/prairielearn/src/models/assessment-instance.ts` (+`.sql`) — restore `unsetGradingNeeded`
- `apps/prairielearn/src/lib/question-testing.ts` — `compareTestResults` manual skip
- 11 element controllers under `apps/prairielearn/elements/` (+ their `*_test.py`)
- Documentation for any element whose documented options change (none expected —
  these are `test()`-only changes), per the repo rule on element docs.

## Open considerations / risks

- **Startup cost:** the disk sync runs only on first boot (gated by the
  fast-path), so steady-state startup adds one indexed query. First boot pays a
  test-course sync (already the cost tests pay) plus ~30 instance/submission
  creations.
- **Test-course drift:** if `hw10-aiGrading` or `aiGradingRubrics` changes shape,
  the seed degrades to a logged warning, not a crash.
- **HMR / multiple workers:** seeding is invoked once per process start in the
  devMode block; the idempotency marker prevents duplication across restarts and
  across multiple dev workers racing (last-writer benign; both see/create the
  same deterministic users — enrollment and user upserts are conflict-safe).

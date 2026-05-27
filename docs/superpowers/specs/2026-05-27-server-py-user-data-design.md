# Design: Expose user information to `server.py`

**Issue:** [#13049](https://github.com/PrairieLearn/PrairieLearn/issues/13049)
**Date:** 2026-05-27
**Status:** Design

## Problem

Question authors want to write `server.py` code that varies behavior based on the student viewing the question — verify CAD-file ownership by email, fetch a student-specific repo, dynamically generate questions per student, etc. Today, no user identity reaches `server.py`. A prior attempt (#12657) was paused because exposing user data interacts with group work, public sharing, and PII concerns in subtle ways.

## Goals

1. Expose a minimal, deliberate set of user fields to `server.py` in every question phase.
2. Make exposure strictly opt-in at the course level.
3. Never expose user data when a question is being rendered outside its owning course.
4. Support group assessments — expose teammates' equivalent fields when applicable.

## Non-goals

- Exposing email or any other field beyond `uid`, `uin`, `name`.
- Per-question, per-assessment, or per-element opt-in granularity.
- Runtime, mid-session toggling visible to questions.

## Data shape

When all gating conditions are met, `data['options']` gains two new keys in all question phases (`generate`, `prepare`, `render`, `parse`, `grade`, `test`, `file`):

```python
data['options']['user'] = {
    'uid':  'jane@example.com',
    'uin':  '123456789',     # may be None
    'name': 'Jane Student',  # may be None
}

data['options']['group'] = {  # None when the assessment is not group work
    'name': 'Team Alpha',
    'members': [
        {'uid': '...', 'uin': '...', 'name': '...'},  # same shape as data['options']['user']
        ...
    ],
}
```

Each entry in `group.members` has the same shape as `data['options']['user']` (uid + uin + name). The current viewing user is included in `members`.

Field set matches what the questions-table CSV export already exposes (minus the computed `role`). No `email` field is added — `uid` is the operative identifier.

When the gate is closed (any condition below not met) or no user context exists (e.g. a sync-time `generate` call without a variant), both keys are present with value `None`. The keys are always present so question authors can write the idiomatic `if data['options']['user']: ...`.

## Gating rules

User data is included only when **all** are true:

1. **Course opt-in.** `courses.questions_receive_user_data = true`.
2. **First-party rendering.** The question is owned by the course in whose context the variant was created. Concretely: `question.course_id == variant.course_id` (or the equivalent path through `course_instance.course_id` — exact column to be confirmed at implementation time). This single check covers public sharing, sharing-set imports, and instructor preview of foreign questions: in all three cases the variant's course differs from the question's owning course.
3. **A user exists.** `generate()` is sometimes called with no variant and no user (sync, cache warming); in those calls, `user` and `group` are `None`. Phases that take a variant always have a `variant.user_id` and therefore always have a user.

There is no per-question opt-out. The course-level setting is the only switch.

## Course-level opt-in

Dual representation, matching the existing `devModeFeatures` pattern:

- **Database:** New column `courses.questions_receive_user_data BOOLEAN NOT NULL DEFAULT FALSE`.
- **Course JSON:** New optional field `infoCourse.json` → `options.questionsReceiveUserData: boolean`.

Sync behavior (in `apps/prairielearn/src/sync/course-db.ts` + the courses sync writer):

- **Dev mode (`config.devMode = true`):** `infoCourse.json` is authoritative; the DB column is overwritten on every sync.
- **Production:** The DB column is authoritative. If `infoCourse.json` sets a value that diverges from the DB, sync emits a non-fatal warning and does not change the DB. This is the same divergence pattern used for `devModeFeatures`.

UI:

- Course settings page gets a toggle, gated to course owners.
- Toggling writes the column and inserts an audit event in the same `runInTransactionAsync` block.

## Implementation surface

### TypeScript

| File | Change |
|---|---|
| `apps/prairielearn/src/migrations/<ts>_courses__questions_receive_user_data.{ts,sql}` | Add column with `DEFAULT FALSE`. Single-step, no backfill. Follow `migrations/README.md`. |
| `database/tables/courses.pg` | Regenerated to include the new column. |
| `apps/prairielearn/src/lib/db-types.ts` | Add `questions_receive_user_data` to `CourseSchema`. |
| `apps/prairielearn/src/schemas/infoCourse.ts` | Add `questionsReceiveUserData: z.boolean().optional()` to `CourseOptionsJsonSchema`. |
| `apps/prairielearn/src/sync/course-db.ts` | Read `info.options.questionsReceiveUserData`; pass through to course sync writer. |
| `apps/prairielearn/src/sync/fromDisk/courses.ts` (or equivalent) | Apply dev-mode-overwrites vs prod-warn-on-divergence logic for the new column. |
| `apps/prairielearn/src/question-servers/freeform.ts` | New helper `getUserContextForQuestion(...)`. Inject `user` and `group` into `data.options` at all phase call sites. |
| `apps/prairielearn/src/question-servers/types.ts` | Export `UserContext` and `GroupContext` types. |
| `apps/prairielearn/src/lib/groups.ts` | No change; `getGroupInfo` already returns members. |
| `apps/prairielearn/src/models/course.ts` (or similar) | `updateCourseQuestionsReceiveUserData(course_id, value, authn_user_id)` that writes the column and inserts an audit event in a transaction. Reuse existing model fn if one fits. |
| `apps/prairielearn/src/pages/instructorCourseAdminSettings/` (or equivalent) | Add the toggle UI; wire through tRPC (per `trpc` skill conventions). |

### Python

No structural changes. `data['options']` is already a passthrough dict. Optionally add `UserInfo` / `GroupInfo` TypedDicts to `prairielearn/__init__.py` for question-author autocomplete if the existing convention supports it (confirm during implementation).

### Docs

| File | Change |
|---|---|
| `docs/question.md` | Document the new `data['options']['user']` and `data['options']['group']` fields, including gating rules and shape. |
| `docs/course.md` (or wherever `infoCourse.json` options are documented) | Document `questionsReceiveUserData`. |

### Tests

- Unit tests for `getUserContextForQuestion`: matrix over `{opted-in, not opted-in} × {shared question, owned question} × {has user, no user} × {individual, group}`.
- Integration test exercising a freeform render with the flag on/off, asserting the dict passed to Python contains/omits the expected keys.

## Open questions for the implementation phase

These are not blockers for the spec — they will be resolved during grill-with-docs / implementation:

1. **Exact column for "rendering course."** Whether the gate uses `variant.course_id` directly, or routes through `course_instance.course_id`. The variants table has a `course_id`; need to confirm it's populated for all variant origin paths.
2. **`generate` call site.** `generate()` is called without a variant in some paths (warming caches, sync validation). For those, user/group must be `None`.
3. **Instructor preview behavior.** When an instructor previews a question they own (no assessment context), the variant exists and `variant.user_id` is the instructor. Per the gating rules, data flows. That's the intended behavior — instructors see their own user data, which matches the model where the instructor is "the user."

## Out of scope (deferred)

- A `data['options']['student_info']`-shaped alternative for non-group questions (Nathan's MVP). The chosen shape is unified across individual and group — `user` is always the viewing user, `group` is non-null only when the assessment is group work.
- Per-question or per-element opt-in.
- Exposing `email` (separate field on `users`), `lti_user_id`, or institution-level identifiers.
- Audit events for *reads* of user data inside questions (only the course-setting toggle is audited).

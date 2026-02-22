# Lockpoints Implementation Plan

## Context

PrairieLearn assessments currently have no mechanism to make earlier questions read-only when a student advances to later sections. This is needed for exams where conceptual questions precede a Python workspace -- students shouldn't be able to use the workspace to retroactively answer the conceptual questions. **Lockpoints** are zone-level barriers that, once crossed, make all questions in preceding zones read-only. See [#14002](https://github.com/PrairieLearn/PrairieLearn/issues/14002).

Key design decisions (from issue + user clarification):

- Crossing a lockpoint uses a **checkbox + confirm button in a modal** (sufficient friction for MVP; can reconsider adding a typed phrase later if needed)
- For **group assessments**, the modal includes additional text: "This will affect all group members. Questions above will become read-only for everyone in your group."
- Lockpoint-locked status is computed by **extending `question_order` sproc** (single query for all lock state)
- The "low-friction path when all previous questions are already closed" is **deferred** (leave a TODO)
- **Full scope** minus the instructor "undo" feature
- Multiple lockpoints per assessment are supported (sequential crossing required)
- Lockpoints are supported for both **Exam** and **Homework** assessments
- Crossing is allowed whenever `authz_result.authorized_edit` is true (including staff emulating a student)
- Staff emulating a student **cannot view** questions past uncrossed lockpoints (matching `sequence_locked` behavior). They must cross lockpoints the same way students do.
- Lockpoints do **not** block the "Finish" action — students can finish the assessment at any time regardless of lockpoint state. Grading processes all submitted variants regardless of lockpoint state.
- Lockpoint crossing is triggered only from the **assessment instance overview page** (not from next-question navigation on the instance-question page)
- Staff with `has_course_instance_permission_edit` but `authorized_edit = false` **cannot** cross lockpoints
- Student-visible crossed-by text shows **UID only** (matching submission-panel conventions)

---

## Post-implementation follow-up (2026-02-14)

After finishing the initial implementation, one gap stood out in automated coverage:

- We verified lockpoint lifecycle behavior, but we did not explicitly test two important server-side invariants:
  - lockpoints cannot be crossed out of order via forged POST requests
  - crossing an already-crossed lockpoint is idempotent (safe on duplicate submissions)

Follow-up action:

- [x] Add integration tests in `testLockpoints.test.ts` for out-of-order rejection and idempotent recrossing behavior.

- [x] Replace lock-state booleans in `question_order` with a canonical access mode:
  - `writable`
  - `blocked_sequence`
  - `blocked_lockpoint`
  - `read_only_lockpoint`
    and update middleware/UI to consume the canonical mode as the source of truth.

### Sketch: Dedicated Lockpoint Command Boundary (Not Implemented Yet)

Goal: isolate lockpoint crossing into one transactional domain command instead of page-specific route logic.

Proposed API:

- `assessment.crossLockpointCommand({ assessment_instance_id, zone_id, authn_user_id, context })`
  where `context` includes authz policy inputs and request metadata.

Responsibilities inside the command:

1. Acquire row-level lock on the target assessment instance (`FOR UPDATE`).
2. Validate all invariants in one place:
   - assessment instance is open
   - caller has `authorized_edit`
   - zone belongs to assessment and is a lockpoint
   - lockpoints are crossed in order
   - no unresolved sequence lock in prior zones
3. Apply change idempotently (`INSERT ... ON CONFLICT DO NOTHING`).
4. Emit event/audit row with normalized payload.
5. Return typed result:
   - `crossed`
   - `already_crossed`
   - `rejected` with machine-readable reason code.

Usage model:

- UI routes call only this command and map reason codes to user-facing errors.
- Future undo/support tooling can reuse the same boundary.
- Background jobs and API endpoints can reuse the same command path.

---

## Phase 1: Database Schema

### Migration 1: Add `lockpoint` to `zones`

**File:** `apps/prairielearn/src/migrations/{timestamp}_zones__lockpoint__add.sql`

This migration must come first (before migration 2) since the new table conceptually depends on the `lockpoint` column.

```sql
ALTER TABLE zones
ADD COLUMN lockpoint boolean NOT NULL DEFAULT false;
```

**Update:** `database/tables/zones.pg` -- add `lockpoint: boolean not null default false`

### Migration 2: Create `assessment_instance_crossed_lockpoints` table

**File:** `apps/prairielearn/src/migrations/{timestamp}_assessment_instance_crossed_lockpoints__create.sql`

```sql
CREATE TABLE assessment_instance_crossed_lockpoints (
  id bigserial PRIMARY KEY,
  assessment_instance_id bigint NOT NULL REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  zone_id bigint NOT NULL REFERENCES zones (id) ON UPDATE CASCADE ON DELETE CASCADE,
  crossed_at timestamptz NOT NULL DEFAULT now(),
  authn_user_id bigint REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (assessment_instance_id, zone_id)
);
```

Note: the unique constraint already creates an index with `assessment_instance_id` as the leading key, so a separate `(assessment_instance_id)` index is likely unnecessary.

**Create:** `database/tables/assessment_instance_crossed_lockpoints.pg`

After adding migrations, run `make update-database-description` so `database/tables/*.pg` stays in sync with the live schema.

### Update Zod types

**File:** `apps/prairielearn/src/lib/db-types.ts`

- Add Zod schema and type for `assessment_instance_crossed_lockpoints` table
- Add `lockpoint` field to `ZoneSchema`
- Add the new table name to `TableNames`
- Add `lockpoint_not_yet_crossed` and `lockpoint_read_only` to `SprocQuestionOrderSchema`

---

## Phase 2: Schema & Sync

### Add `lockpoint` to `infoAssessment.json` schema

**File:** `apps/prairielearn/src/schemas/infoAssessment.ts`

Add to `ZoneAssessmentJsonSchema`:

```typescript
lockpoint: z.boolean()
  .describe('If true, students must explicitly acknowledge advancing past this point. All questions in previous zones become read-only after crossing.')
  .optional()
  .default(false),
```

### Add validation: lockpoint constraints

**File:** `apps/prairielearn/src/schemas/infoAssessment.ts`

There is no existing `.superRefine()` on `AssessmentJsonSchema`. The current chain is `.object({...}).strict().describe(...)`. Chain `.superRefine()` after `.describe()`:

```typescript
export const AssessmentJsonSchema = z
  .object({
    /* ... existing ... */
  })
  .strict()
  .describe('Configuration data for an assessment.')
  .superRefine((assessment, ctx) => {
    if (assessment.zones?.[0]?.lockpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The first zone cannot have lockpoint: true',
        path: ['zones', 0, 'lockpoint'],
      });
    }

    assessment.zones?.forEach((zone, index) => {
      if (zone.lockpoint && zone.numberChoose === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A lockpoint zone must include at least one selectable question',
          path: ['zones', index, 'numberChoose'],
        });
      }
    });
  });
```

**Type change note:** Adding `.superRefine()` changes the schema type from `ZodObject` to `ZodEffects`. This means `AssessmentJsonSchema.shape` would no longer work. Verified: no code in the codebase accesses `AssessmentJsonSchema.shape`, so this is safe. The `z.infer` and `z.input` type extraction still works with `ZodEffects`.

Rationale: validation in the schema ensures consistent error formatting during sync, instead of introducing one-off validation in `fromDisk/assessments.ts`.

### Sync `lockpoint` to the database

**File:** `apps/prairielearn/src/sync/fromDisk/assessments.ts` (~line 89-103)

Add `lockpoint: zone.lockpoint` to the zone mapping. (After Zod parsing with `.optional().default(false)`, the value is always a boolean, so `?? false` is unnecessary.)

**File:** `apps/prairielearn/src/sprocs/sync_assessments.sql` (~line 328-371)

Add `lockpoint` to the INSERT and ON CONFLICT UPDATE for zones:

- Add to column list: `lockpoint`
- Add to values: `(zone->>'lockpoint')::boolean`
- Add to ON CONFLICT SET: `lockpoint = EXCLUDED.lockpoint`

### Update JSON schema output

Run `make update-jsonschema` after changing the Zod schema. This regenerates `schemas/schemas/*.json`.

### Preserve `lockpoint` in instructor assessment editor

**File:** `apps/prairielearn/src/pages/instructorAssessmentQuestions/utils/dataTransform.ts`

The `serializeZonesForJson` function (~line 153-165) has a hardcoded property list for serializing zone data back to JSON. It currently includes `title`, `numberChoose`, `bestQuestions`, `advanceScorePerc`, `gradeRateMinutes`, and `questions`. If `lockpoint` is NOT added to this list, editing and saving an assessment through the instructor UI will **silently drop** any `lockpoint: true` configuration.

Add `lockpoint` to the serialized properties:

```typescript
const zone: Record<string, unknown> = {};
// ... existing properties ...
if (formZone.lockpoint) {
  zone.lockpoint = true;
}
```

**File:** `apps/prairielearn/src/pages/instructorAssessmentQuestions/utils/dataTransform.test.ts`

Add a test case verifying that `lockpoint: true` round-trips correctly through serialize/deserialize.

---

## Phase 3: Backend Logic

### Extend `question_order` sproc

**File:** `apps/prairielearn/src/sprocs/question_order.sql`

Add two new return columns and compute them:

```sql
CREATE FUNCTION question_order (arg_assessment_instance_id bigint) RETURNS TABLE (
  instance_question_id bigint,
  row_order integer,
  question_number text,
  sequence_locked boolean,
  lockpoint_not_yet_crossed boolean, -- NEW: can't access (zone's lockpoint not crossed)
  lockpoint_read_only boolean -- NEW: can view but can't submit
)
```

#### Semantics

The lockpoint is defined on the _destination_ zone. Crossing it locks all _previous_ zones:

- Zone 1 (no lockpoint): questions become read-only when Zone 2's lockpoint is crossed
- Zone 2 (`lockpoint: true`): questions become read-only when Zone 3's lockpoint is crossed
- Zone 3 (`lockpoint: true`): questions never become read-only (no subsequent lockpoint)

Two computed values:

1. **`lockpoint_not_yet_crossed`**: This question's zone has `lockpoint = true` and it hasn't been crossed yet, OR there's a prior uncrossed lockpoint. Blocks access entirely (like `sequence_locked`).
2. **`lockpoint_read_only`**: A later lockpoint was crossed, so this question can be viewed but not submitted to.

#### Corner case: non-lockpoint zones between lockpoint zones

Example: Zone 1 (none), Zone 2 (lockpoint), Zone 3 (none), Zone 4 (lockpoint). After crossing zone 2's lockpoint: Zone 1 is read-only, zones 2-3 are accessible, zone 4 is blocked. After crossing zone 4's lockpoint: zones 1-3 are read-only, zone 4 is accessible. Non-lockpoint zones between lockpoint zones are governed by the surrounding lockpoints.

#### No-lockpoint and all-crossed cases

When the assessment has no lockpoints: `lockpoint_info` CTE returns 0 rows, `first_uncrossed_lockpoint` is NULL, all lockpoint fields are false. When all lockpoints are crossed: same — `first_uncrossed_lockpoint` is NULL, `lockpoint_not_yet_crossed` is false for all questions, `lockpoint_read_only` is true for all zones before the last lockpoint.

#### CTE approach

The existing `question_order` function is `LANGUAGE SQL STABLE` with a single `WITH locks_next AS (...) SELECT ...` statement. The new CTEs must be added to the same WITH clause: `WITH locks_next AS (...), lockpoint_info AS (...), first_uncrossed_lockpoint AS (...) SELECT ...`. This preserves the single-expression SQL function structure.

```sql
lockpoint_info AS (
  SELECT
    z.id AS zone_id,
    z.number AS zone_number,
    z.lockpoint,
    aicl.id IS NOT NULL AS is_crossed
  FROM
    zones z
    LEFT JOIN assessment_instance_crossed_lockpoints aicl ON aicl.zone_id = z.id
    AND aicl.assessment_instance_id = arg_assessment_instance_id
  WHERE
    z.assessment_id = (
      SELECT
        assessment_id
      FROM
        assessment_instances
      WHERE
        id = arg_assessment_instance_id
    )
    AND z.lockpoint = true
),
first_uncrossed_lockpoint AS (
  SELECT
    MIN(zone_number) AS zone_number
  FROM
    lockpoint_info
  WHERE
    NOT is_crossed
)
```

Join `first_uncrossed_lockpoint` to the main SELECT via `CROSS JOIN first_uncrossed_lockpoint` (it returns exactly one row with a nullable `zone_number`).

Then for each question in zone with number `z.number` (already available from the existing `zones AS z` join at line 58):

- `lockpoint_not_yet_crossed = COALESCE(z.number >= first_uncrossed_lockpoint.zone_number, false)` -- blocked by uncrossed lockpoint
- `lockpoint_read_only = EXISTS (SELECT 1 FROM lockpoint_info WHERE is_crossed AND zone_number > z.number)` -- read-only from crossed lockpoint

### Prevent submissions to lockpoint-read-only questions

**Files to modify:**

1. **`apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.sql`**

   Three changes needed:

   **a) Add columns to `instance_questions_info` CTE** (lines 3-29):
   - The CTE at line 16 currently selects `qo.sequence_locked`. Add `qo.lockpoint_not_yet_crossed` and `qo.lockpoint_read_only` to the CTE's SELECT list so they're available as `iqi.lockpoint_not_yet_crossed` and `iqi.lockpoint_read_only`.

   **b) Add WHERE clause filter** (line 135):
   - Currently: `AND NOT iqi.sequence_locked`
   - Add: `AND NOT iqi.lockpoint_not_yet_crossed` to block access to zones past uncrossed lockpoints
   - Do NOT add `lockpoint_read_only` here — students should still be able to VIEW read-only questions

   **c) Add to `instance_question_info` JSON** (lines 80-95):
   - Add `lockpoint_read_only` and `lockpoint_not_yet_crossed` to the `jsonb_build_object(...)` that builds `instance_question_info`, so they're available downstream in TypeScript.

   **Direct URL access:** When a student navigates directly to a `lockpoint_not_yet_crossed` question, the WHERE clause filters it out and the middleware throws a 403. For MVP, use the same generic error as `sequence_locked` — no lockpoint-specific message needed. The existing behavior (403 when question not found in accessible set) is sufficient.

2. **`apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`** (line 172-188)
   - In `validateAndProcessSubmission`, add:

     ```typescript
     if (res.locals.instance_question_info.lockpoint_read_only) {
       throw new HttpStatusError(403, 'This question is read-only after crossing a lockpoint');
     }
     ```

3. **`apps/prairielearn/src/lib/question-render.ts`** — `buildLocals` function (~line 254)
   - `buildLocals` currently takes a destructured options object with 9 named properties (`variant`, `question`, `instance_question`, `group_role_permissions`, `assessment`, `assessment_instance`, `assessment_question`, `group_config`, `authz_result`). Add `lockpoint_read_only?: boolean` to the existing options object:

     ```typescript
     function buildLocals({
       variant,
       question,
       instance_question,
       // ... existing params ...
       lockpoint_read_only, // NEW
     }: {
       // ... existing types ...
       lockpoint_read_only?: boolean;
     });
     ```

   - Insert a new block **after** the `allow_grade_left_ms` check (~line 340) and **before** the `!variant.open` cascade (line 342). This placement is _outside_ the `if (!assessment || ...) / else` block (line 299-340), so it applies to both instructor and student paths. This is intentional: for instructor pages `lockpoint_read_only` will be falsy (undefined) so the block is a no-op. For student pages it correctly overrides button visibility. Placement is after all the assessment-type-specific logic and grade-rate limiting, but before the variant/question lifecycle checks:

     ```typescript
     if (lockpoint_read_only) {
       locals.showGradeButton = false;
       locals.showSaveButton = false;
       locals.allowAnswerEditing = false;
       // We intentionally do NOT show the true answer or "Try again" for
       // lockpoint-read-only questions. The question and variant may still
       // be "open" — the student simply can't submit because they chose to
       // advance. Showing correct answers just because a student crossed a
       // lockpoint would let them share answers with classmates who haven't
       // crossed yet (especially on group assessments). Students can still
       // review their own previous submissions.
     }
     ```

   - This placement ensures lockpoint-read-only overrides Homework's default `showGradeButton = true` but does NOT trigger `showTryAgainButton` (which only activates in the `!variant.open` / `!iq.open` block later).
   - **Caller 1: `getAndRenderVariant`** — receives a `locals` parameter (which is `res.locals` passed by the page handler). `instance_question_info` exists at runtime but is not part of the current typed `locals` parameter. To avoid mutating `res.locals` with ad-hoc fields:
     1. Add `instance_question_info?: { lockpoint_read_only?: boolean }` to `getAndRenderVariant`'s typed `locals` parameter.
     2. In `getAndRenderVariant`, pass `lockpoint_read_only: locals.instance_question_info?.lockpoint_read_only` to `buildLocals`.
     3. No extra `res.locals.lockpoint_read_only` assignment is needed in `studentInstanceQuestion.ts`.
   - **Caller 2: `renderPanelsForSubmission`** — does NOT have access to `res.locals`. Instead, it gets data from `select_submission_info` SQL query. The `lockpoint_read_only` value must be added to that query's output and threaded through (see Phase 3 item 5a below).

4. **`apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.ts`** — `InstanceQuestionInfoSchema`
   - Add to the schema:

     ```typescript
     lockpoint_not_yet_crossed: z.boolean(),
     lockpoint_read_only: z.boolean(),
     ```

   - Add to the `next_instance_question` sub-object:

     ```typescript
     lockpoint_not_yet_crossed: z.boolean().nullable(),
     ```

   - The corresponding SQL (`selectAndAuthzInstanceQuestion.sql`) must add `lockpoint_not_yet_crossed` to the `lead()` window function that populates `next_instance_question`, matching the existing `sequence_locked` pattern.

5. **`apps/prairielearn/src/lib/question-render.sql` + `apps/prairielearn/src/lib/question-render.ts`**

   Two additions to `select_submission_info`:

   **a) `lockpoint_read_only` for the current question:**
   - Add `COALESCE(qo.lockpoint_read_only, false) AS lockpoint_read_only` to the SELECT list in `select_submission_info`.
   - Use `COALESCE` because `renderPanelsForSubmission()` is also used by non-assessment pages (`publicQuestionPreview`, `instructorQuestionPreview`) where `assessment_instance` and `question_order()` are null.
   - Update `SubmissionInfoSchema` in `question-render.ts` with `lockpoint_read_only: z.boolean()`.
   - In `renderPanelsForSubmission`, destructure `lockpoint_read_only` from `submissionInfo` and pass it to `buildLocals`:

     ```typescript
     const { ..., lockpoint_read_only } = submissionInfo;
     // then in the buildLocals call:
     ...buildLocals({
       variant, question, instance_question,
       group_role_permissions: groupRolePermissions,
       assessment, assessment_instance, assessment_question,
       group_config,
       lockpoint_read_only, // NEW
     }),
     ```

   - This ensures live-updated panels after a submission correctly hide Save/Grade buttons if the question became lockpoint-read-only (e.g., a group member crossed a lockpoint while this question was open).

   **b) `lockpoint_not_yet_crossed` for the next question navigation:**
   - In the `next_iq` CTE (~line 124), add `lead(qo.lockpoint_not_yet_crossed) OVER w AS lockpoint_not_yet_crossed` (matching the existing `lead(qo.sequence_locked) OVER w` pattern).
   - In the `next_instance_question` JSON build (~line 171), add `'lockpoint_not_yet_crossed', next_iq.lockpoint_not_yet_crossed` to the `jsonb_build_object(...)` call.
   - Update the `next_instance_question` sub-schema in `SubmissionInfoSchema` with `lockpoint_not_yet_crossed: z.boolean().nullable()`.
   - In `renderPanelsForSubmission` (~line 873-881), pass `lockpointNotYetCrossed: next_instance_question.lockpoint_not_yet_crossed` to the `QuestionNavSideButton(...)` call for the "next" button, matching the existing `sequenceLocked: next_instance_question.sequence_locked` pattern.

### API endpoint: Cross a lockpoint

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.ts`

Add a new POST action `cross_lockpoint`:

```typescript
} else if (req.body.__action === 'cross_lockpoint') {
    if (!res.locals.assessment_instance.open || !res.locals.authz_result.active) {
        throw new HttpStatusError(403, 'This assessment is not accepting submissions at this time.');
    }
    const zone_id = IdSchema.parse(req.body.zone_id);
    // Note: file uses `import * as assessment from '../../lib/assessment.js'`
    // so call as `assessment.crossLockpoint(...)`.
    // Also ensure `IdSchema` is imported from `@prairielearn/zod`.
    await assessment.crossLockpoint({
        assessment_instance_id: res.locals.assessment_instance.id,
        zone_id,
        authn_user_id: res.locals.authn_user.id,
    });
    res.redirect(req.originalUrl);
}
```

**Authorization tier:** keep `cross_lockpoint` in the **tier 1** gate and do NOT add it to the **tier 2** student-only blocklist (staff emulating students must be able to cross). Inside the `cross_lockpoint` branch, add an explicit check for `res.locals.authz_result.authorized_edit` so only the assessment owner (or an emulated owner) can cross lockpoints.

**File:** `apps/prairielearn/src/lib/assessment.ts`

Create `crossLockpoint()` function that uses a single atomic SQL `INSERT ... SELECT` with all validation in the WHERE clause:

1. Assessment instance is still open (`ai.open = true`)
2. Zone has `lockpoint = true`
3. Zone belongs to the same assessment as the assessment instance
4. This is the next uncrossed lockpoint (no prior uncrossed lockpoint exists)
5. All questions in prior zones satisfy `advanceScorePerc` (no `sequence_locked` question exists before this zone)
6. `ON CONFLICT DO NOTHING` for idempotent concurrent requests

The advanceScorePerc check (point 4) requires calling `question_order()` to get `sequence_locked` state. Sketch:

```sql
INSERT INTO
  assessment_instance_crossed_lockpoints (assessment_instance_id, zone_id, authn_user_id)
SELECT
  $assessment_instance_id,
  z.id,
  $authn_user_id
FROM
  zones z
  JOIN assessment_instances ai ON ai.id = $assessment_instance_id
WHERE
  z.id = $zone_id
  AND ai.open = true
  AND z.lockpoint = true
  AND z.assessment_id = ai.assessment_id
  -- This must be the next uncrossed lockpoint
  AND NOT EXISTS (
    SELECT
      1
    FROM
      zones z2
      LEFT JOIN assessment_instance_crossed_lockpoints aicl ON aicl.zone_id = z2.id
      AND aicl.assessment_instance_id = $assessment_instance_id
    WHERE
      z2.assessment_id = z.assessment_id
      AND z2.lockpoint = true
      AND z2.number < z.number
      AND aicl.id IS NULL
  )
  -- No sequence_locked questions in prior zones
  AND NOT EXISTS (
    SELECT
      1
    FROM
      question_order ($assessment_instance_id) qo
      JOIN instance_questions iq ON iq.id = qo.instance_question_id
      JOIN assessment_questions aq ON aq.id = iq.assessment_question_id
      JOIN alternative_groups ag ON ag.id = aq.alternative_group_id
    WHERE
      ag.zone_id IN (
        SELECT
          z3.id
        FROM
          zones z3
        WHERE
          z3.assessment_id = z.assessment_id
          AND z3.number < z.number
      )
      AND qo.sequence_locked = true
  )
ON CONFLICT (assessment_instance_id, zone_id) DO NOTHING
RETURNING
  id;
```

The `ON CONFLICT DO NOTHING` means Postgres never errors on this INSERT — it either inserts a row or silently does nothing. The 0-rows-inserted case covers two scenarios:

1. **Already crossed** (conflict): Harmless — the lockpoint is already in the desired state.
2. **Validation failed** (WHERE clause didn't match): The UI should prevent this — the "Proceed" button is only shown when the lockpoint is crossable.

In the TypeScript `crossLockpoint()` function, distinguish between "already crossed" (idempotent success) and "validation failed" (error). When the INSERT returns 0 rows, do a follow-up SELECT to check if the lockpoint was already crossed:

```typescript
export async function crossLockpoint({
  assessment_instance_id,
  zone_id,
  authn_user_id,
}: {
  assessment_instance_id: string;
  zone_id: string;
  authn_user_id: string;
}) {
  const result = await sqldb.queryOptionalRow(
    sql.cross_lockpoint,
    { assessment_instance_id, zone_id, authn_user_id },
    IdSchema,
  );
  if (result == null) {
    // INSERT returned no rows — either already crossed (conflict) or validation failed.
    // Check if it was already crossed (idempotent success for concurrent group members).
    const alreadyCrossed = await sqldb.queryOptionalRow(
      sql.check_lockpoint_crossed,
      { assessment_instance_id, zone_id },
      IdSchema,
    );
    if (alreadyCrossed != null) {
      // Already crossed — treat as success (redirect will reload the page).
      return;
    }
    throw new HttpStatusError(
      403,
      'Unable to cross this lockpoint. Please return to the assessment overview and try again.',
    );
  }
}
```

The `check_lockpoint_crossed` SQL is a simple:

```sql
SELECT
  id
FROM
  assessment_instance_crossed_lockpoints
WHERE
  assessment_instance_id = $assessment_instance_id
  AND zone_id = $zone_id;
```

This correctly handles the concurrent group crossing scenario: two members POST simultaneously, one INSERT succeeds, the other gets ON CONFLICT DO NOTHING but the follow-up SELECT finds it was already crossed, so the redirect proceeds cleanly.

### Interaction with advanceScorePerc

The `first_uncrossed_lockpoint` CTE in `question_order` handles this naturally: if `advanceScorePerc` locks a question, the student can't reach the lockpoint crossing UI. The `crossLockpoint` function additionally verifies no questions in prior zones are `sequence_locked`.

**Intentional design decision: `advanceScorePerc` within a lockpoint zone does NOT block crossing the _next_ lockpoint.** The `crossLockpoint` SQL only checks `sequence_locked` in zones _before_ the lockpoint zone. This means: if Zone 2 has `lockpoint: true` AND `advanceScorePerc: 80` on its questions, a student could score below 80% on Zone 2's first question (making Zone 2's second question `sequence_locked`) and still cross Zone 3's lockpoint (if present). This is correct because lockpoints gate _entry_ to the next section, not _completion_ of the current section. The `advanceScorePerc` within Zone 2 still prevents access to later questions within Zone 2 itself via `sequence_locked`.

### Interaction with external grading

No changes needed. Since we compute lockpoint status on-the-fly from `assessment_instance_crossed_lockpoints` (NOT `instance_questions.open`), external grading results will still update question scores. The question is just read-only for new student submissions.

### Interaction with finish/close

No changes needed. Lockpoints do not block the "Finish" action. The `gradeAssessmentInstance()` function grades all submitted variants without checking lockpoint state. Students can finish at any time regardless of uncrossed lockpoints.

---

## Phase 4: Student UI - Assessment Instance Page

### Lockpoint barrier row in question table

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.html.ts`

When rendering the question table, insert a lockpoint barrier row before each lockpoint zone. Concretely, when rendering a question row with `start_new_zone = true` and `lockpoint = true`, render the barrier first, then the zone header row. This is a full-width `<tr>` with `colspan` using the already-computed `zoneTitleColspan` value (~line 134), matching the zone header row pattern.

The barrier renders even if `zone_title` is null (the `start_new_zone && lockpoint` check is independent of `zone_title`).

#### Barrier has three visual states

1. **Already crossed** (`lockpoint_crossed = true`): Non-interactive "Section completed" indicator. Shows who crossed it and when (e.g., "Crossed by `student@example.com` at 2:30 PM"). Uses a muted/success style.

2. **Next crossable** (`lockpoint_crossed = false` AND this is the first uncrossed lockpoint AND no `sequence_locked` questions in prior zones): Active "Proceed to next section" button that opens the confirmation modal. Warning-styled background.

3. **Future / not yet reachable** (`lockpoint_crossed = false` AND either a prior lockpoint is uncrossed OR `sequence_locked` questions exist in prior zones OR assessment is not currently editable): Disabled barrier with text "Complete previous sections first". Uses `bg-light` styling matching `sequence_locked` rows.

#### Computing barrier crossability

`zone_id` is already returned in `select_instance_questions`. To determine whether a barrier is crossable, compute this in TypeScript from the per-question row data when building the question table:

```typescript
// After querying instance questions, compute per-zone crossability
const firstUncrossedLockpointZoneNumber = rows
  .filter((r) => r.lockpoint && !r.lockpoint_crossed && r.start_new_zone)
  .map((r) => r.zone_number)
  .sort((a, b) => a - b)[0];

const hasSequenceLockedInPriorZones = (zoneNumber: number) =>
  rows.some((r) => r.zone_number < zoneNumber && r.sequence_locked);

// A barrier is crossable when:
// 1. It's the first uncrossed lockpoint
// 2. No sequence_locked questions exist in prior zones
function isBarrierCrossable(row: InstanceQuestionRow): boolean {
  return (
    resLocals.assessment_instance.open &&
    resLocals.authz_result.active &&
    resLocals.authz_result.authorized_edit &&
    row.lockpoint &&
    !row.lockpoint_crossed &&
    row.zone_number === firstUncrossedLockpointZoneNumber &&
    !hasSequenceLockedInPriorZones(row.zone_number)
  );
}
```

This avoids adding another SQL column — the data is already available from the existing query results.

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.sql`

Add to `select_instance_questions`:

- `z.lockpoint` to the SELECT
- `aicl.id IS NOT NULL AS lockpoint_crossed` (via `LEFT JOIN assessment_instance_crossed_lockpoints AS aicl ON (aicl.zone_id = z.id AND aicl.assessment_instance_id = ai.id)`, placed after the `zones AS z` join)
- `aicl.crossed_at AS lockpoint_crossed_at`
- `lockpoint_user.uid AS lockpoint_crossed_auth_user_uid` (via `LEFT JOIN users AS lockpoint_user ON (lockpoint_user.id = aicl.authn_user_id)`)
- `lockpoint_not_yet_crossed` and `lockpoint_read_only` from `question_order`
- `z.number AS zone_number` (NOT currently in SELECT — must be added; needed for barrier crossability computation in TypeScript)

Update `InstanceQuestionRowSchema`:

```typescript
lockpoint: z.boolean(),
lockpoint_crossed: z.boolean(),
lockpoint_crossed_at: z.date().nullable(),
lockpoint_crossed_auth_user_uid: z.string().nullable(),
lockpoint_not_yet_crossed: z.boolean(),
lockpoint_read_only: z.boolean(),
zone_number: z.number(),
```

### Lockpoint crossing modal

Each lockpoint zone needs its own modal with a unique ID (e.g., `crossLockpointModal-${zone_id}`). Since the `Modal` component wraps content in a `<form>`, modals must be rendered **outside** the `<table>`. Render all lockpoint modals in `preContent` (matching the existing `ConfirmFinishModal` pattern at lines 185-189), using a `.filter()` + `.map()` over `instance_question_rows` to find lockpoint zones:

```typescript
// In preContent, alongside ConfirmFinishModal:
${instance_question_rows
  .filter((r) => r.start_new_zone && r.lockpoint && !r.lockpoint_crossed && isBarrierCrossable(r))
  .map((r) => Modal({
    id: `crossLockpointModal-${r.zone_id}`,
    title: 'Proceed to next section?',
    body: html`
      <p>Questions above will become read-only. You can review your previous submissions but cannot make new ones.</p>
      ${groupConfig != null
        ? html`<p class="fw-bold">This will affect all group members. Questions above will become read-only for everyone in your group.</p>`
        : ''}
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="lockpoint-confirm-${r.zone_id}"
          onchange="document.getElementById('lockpoint-submit-${r.zone_id}').disabled = !this.checked" />
        <label class="form-check-label" for="lockpoint-confirm-${r.zone_id}">
          I understand that questions above will become read-only
        </label>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="zone_id" value="${r.zone_id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button id="lockpoint-submit-${r.zone_id}" type="submit" name="__action" value="cross_lockpoint"
        class="btn btn-warning" disabled>Confirm</button>
    `,
  }))}
```

The barrier row button in the question table then uses `data-bs-toggle="modal" data-bs-target="#crossLockpointModal-${zone_id}"`.

If the barrier's lockpoint is already crossed, show a non-interactive "Section completed" state instead of the button, including student-visible details: crossed by UID and crossed timestamp.

### Question row display

Questions that are `lockpoint_read_only`:

- Still clickable links (students can view them)
- Lock icon with popover: "This question is read-only because you have advanced past a lockpoint."
- Different CSS class (e.g., `pl-lockpoint-read-only`) for visual distinction

Questions that are `lockpoint_not_yet_crossed`:

- NOT clickable links (can't access yet)
- Lock icon with popover: "You must cross the lockpoint above to access this question."
- Same `bg-light` styling as `sequence_locked`

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.html.ts` `RowLabel` function (~line 803)

The current `RowLabel` function has two rendering paths: locked (no link, `text-muted` + lock icon + popover) and unlocked (clickable link). Lockpoints introduce a third state: `lockpoint_read_only` (clickable link WITH lock icon + popover). This requires restructuring `RowLabel`:

```typescript
if (sequence_locked) {
  // Existing: no link, text-muted, lock icon, "A previous question must be completed..."
} else if (lockpoint_not_yet_crossed) {
  // NEW: no link, text-muted, lock icon, "You must cross the lockpoint above..."
  // Same visual treatment as sequence_locked
} else if (!(group_role_permissions?.can_view ?? true)) {
  // Existing: no link, text-muted, lock icon, group role message
} else if (lockpoint_read_only) {
  // NEW: clickable link (student CAN view) WITH lock icon + popover
  // "This question is read-only because you have advanced past a lockpoint."
  // Link renders normally but with a small lock icon appended
} else {
  // Existing: normal clickable link
}
```

**Key distinction:** `lockpoint_read_only` renders as a **clickable link with a lock icon** (not `text-muted`). This is different from the fully-locked states which render as plain text. The lock icon indicates read-only status while the link allows viewing previous submissions.

**Row CSS class:** The existing question row ternary (~line 338: `instance_question_row.sequence_locked ? 'bg-light pl-sequence-locked' : ''`) must be extended to a multi-way expression:

```typescript
class="${instance_question_row.sequence_locked || instance_question_row.lockpoint_not_yet_crossed
  ? 'bg-light pl-sequence-locked'
  : instance_question_row.lockpoint_read_only
    ? 'pl-lockpoint-read-only'
    : ''}"
```

**Priority:** `sequence_locked` takes precedence over `lockpoint_not_yet_crossed` when both apply. This is correct since the student must address the `advanceScorePerc` threshold first.

---

## Phase 5: Student UI - Instance Question Page

### Block submissions on read-only questions

Handled in Phase 3 (item 3) via `buildLocals` in `question-render.ts`. No separate work needed here — just confirming the data flow: `selectAndAuthzInstanceQuestion.sql` → `res.locals.instance_question_info.lockpoint_read_only` → passed to `buildLocals` → buttons/editing disabled.

### Read-only banner

**File:** `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.html.ts`

Show alert when viewing a lockpoint-read-only question:

```html
<div class="alert alert-warning">
  This question is read-only because you advanced past a lockpoint. You can review your previous
  submissions but cannot make new ones.
</div>
```

### Update "Next" button for lockpoint barriers

**File:** `apps/prairielearn/src/components/QuestionNavigation.tsx`

This file is in `apps/prairielearn/src/components/`, NOT in `packages/`, so no changeset is needed.

Add a new `lockpointNotYetCrossed` prop to `QuestionNavSideButton`. Also add it to `QuestionNavSideGroup`, which wraps `QuestionNavSideButton` and must accept and forward the prop:

```typescript
export function QuestionNavSideButton({
  instanceQuestionId,
  sequenceLocked,
  lockpointNotYetCrossed, // NEW
  urlPrefix,
  whichButton,
  groupRolePermissions,
  advanceScorePerc,
  userGroupRoles,
}: {
  // ...existing types...
  lockpointNotYetCrossed?: boolean | null;
});
```

In the disabled-explanation logic (~line 75-82), add a new `else if` branch after the existing `sequenceLocked` check:

```typescript
} else if (lockpointNotYetCrossed) {
  disabledExplanation = html`You must cross the lockpoint on the assessment overview page before
    you can proceed to the next question.`;
}
```

This reuses the existing disabled button rendering (same `btn-secondary` + lock icon + popover pattern). No new CSS or button variants needed.

**Data flow:** Pass `lockpoint_not_yet_crossed` for the next question through:

1. `next_instance_question` JSON in `selectAndAuthzInstanceQuestion.sql` (via `lead()` window function, matching the existing `sequence_locked` pattern)
2. `select_submission_info` in `question-render.sql` (so real-time panel updates after submissions keep navigation consistent)
3. All call sites of `QuestionNavSideButton` / `QuestionNavSideGroup` that pass the next-question props

**Call sites that must pass `lockpointNotYetCrossed`:**

1. **`apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.html.ts`** (~line 175-187): The initial page render uses `QuestionNavSideGroup` and passes `sequenceLocked: resLocals.instance_question_info.next_instance_question?.sequence_locked`. Add the corresponding `lockpointNotYetCrossed: resLocals.instance_question_info.next_instance_question?.lockpoint_not_yet_crossed`.

2. **`apps/prairielearn/src/lib/question-render.ts`** (~line 873-881): The AJAX panel update uses `QuestionNavSideButton` directly. Add `lockpointNotYetCrossed: next_instance_question.lockpoint_not_yet_crossed`.

3. **`apps/prairielearn/src/components/QuestionNavigation.tsx`** (internal): `QuestionNavSideGroup` must forward `lockpointNotYetCrossed` to its internal `QuestionNavSideButton` call.

---

## Phase 6: Instructor UI

### Instructor assessment instance page

**File:** `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.ts`

The GET handler queries data and passes it to the template. Add a new query execution for `select_crossed_lockpoints` and pass the results as a new `crossedLockpoints` prop to `InstructorAssessmentInstance(...)`. Define a `CrossedLockpointSchema` for the query result:

```typescript
const CrossedLockpointSchema = z.object({
  zone_id: IdSchema,
  zone_number: z.number(),
  zone_title: z.string().nullable(),
  lockpoint_crossed: z.boolean(),
  crossed_at: DateFromISOString.nullable(),
  authn_user_id: IdSchema.nullable(),
  auth_user_uid: z.string().nullable(),
});
```

**File:** `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.html.tsx`

Add a `crossedLockpoints` parameter to `InstructorAssessmentInstance`. Show lockpoint crossing details between zones: "Lockpoint crossed by [UID] at [time]" or "Lockpoint not yet crossed".

**File:** `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.sql`

```sql
-- BLOCK select_crossed_lockpoints
SELECT
  z.id AS zone_id,
  z.number AS zone_number,
  z.title AS zone_title,
  (aicl.id IS NOT NULL) AS lockpoint_crossed,
  aicl.crossed_at,
  aicl.authn_user_id,
  u.uid AS auth_user_uid
FROM
  assessment_instances ai
  JOIN zones z ON z.assessment_id = ai.assessment_id
  AND z.lockpoint
  LEFT JOIN assessment_instance_crossed_lockpoints aicl ON aicl.assessment_instance_id = ai.id
  AND aicl.zone_id = z.id
  LEFT JOIN users u ON u.id = aicl.authn_user_id
WHERE
  ai.id = $assessment_instance_id
ORDER BY
  z.number;
```

### Event log

**File:** `apps/prairielearn/src/lib/assessment.sql` (~line 1240)

Add a new UNION block to `assessment_instance_log`. Existing event_order values range from 1 to 10. The value 7.7 fits between 7.5 (Time limit expiry) and 8 (View variant).

The color `purple2` is defined in `apps/prairielearn/public/stylesheets/colors.scss` (hex `#9b59b6`) but not currently used by any event — a good distinctive choice for lockpoint events.

```sql
UNION
(
  SELECT
    7.7 AS event_order,
    'Cross lockpoint'::text AS event_name,
    'purple2'::text AS event_color,
    aicl.crossed_at AS date,
    u.id AS auth_user_id,
    u.uid AS auth_user_uid,
    NULL::text AS qid,
    NULL::integer AS question_id,
    NULL::integer AS instance_question_id,
    NULL::integer AS variant_id,
    NULL::integer AS variant_number,
    NULL::integer AS submission_id,
    aicl.id AS log_id,
    NULL::bigint AS client_fingerprint_id,
    jsonb_build_object('zone_title', z.title, 'zone_number', z.number) AS data
  FROM
    assessment_instance_crossed_lockpoints AS aicl
    JOIN zones AS z ON (z.id = aicl.zone_id)
    LEFT JOIN users AS u ON (u.id = aicl.authn_user_id)
  WHERE
    aicl.assessment_instance_id = $assessment_instance_id
)
```

---

## Phase 7: Validation & Edge Cases

### Sync validation

**File:** `apps/prairielearn/src/schemas/infoAssessment.ts`

Validation errors (via `.superRefine()` added in Phase 2):

1. First zone cannot have `lockpoint: true`
2. A lockpoint zone cannot have `numberChoose: 0`

### Concurrent access (groups / multiple tabs)

The `crossLockpoint` SQL uses `INSERT ... ON CONFLICT DO NOTHING`, making it idempotent. If a student tries to submit to a now-read-only question (because another group member crossed a lockpoint), the server-side check returns a 403 with a clear error message.

For UI: page reload shows the updated state. No real-time WebSocket updates for MVP.

Note on stale state in AJAX panel updates: if a group member crosses a lockpoint while another member has a question open, the next AJAX panel update (after submission) will use `res.locals` populated by the middleware at request time. The lockpoint state will be current because the middleware re-runs `question_order()` on each request. The `renderPanelsForSubmission` path correctly re-evaluates lockpoint state.

### Auto-close / time limit expiry

No changes needed. Lockpoints only affect the student's ability to make new submissions while the assessment is open. Auto-close grades everything regardless.

### Re-opening a closed assessment instance

When an instructor re-opens a closed assessment instance, lockpoint crossing records persist in `assessment_instance_crossed_lockpoints`. This is correct: re-opening should restore the student to the state they were in when the assessment closed, with the same lockpoints already crossed.

### Personal notes (file uploads, text attachments)

Personal notes (`attach_file`, `attach_text`, `delete_file`) are NOT blocked by lockpoints. These are informational (not graded submissions) and should remain accessible on read-only questions so students can annotate their previous work.

### Shuffled questions

When `shuffleQuestions = true`, questions are shuffled within zones but zones maintain their order. Lockpoints operate at the zone level so work correctly. Verify with tests.

---

## Phase 8: Documentation

**File:** `docs/assessment/configuration.md`

Add a new section after "Sequential questions" (`advanceScorePerc`) documenting lockpoints:

### Lockpoints

Lockpoints allow instructors to create one-way barriers between zones. When a student crosses a lockpoint, all questions in previous zones become read-only — students can review their previous submissions but cannot make new ones.

Also update the **Zone Property table** (~line 160-168 in the docs) with a new row for `lockpoint`.

Document:

- The `lockpoint` zone property and its behavior
- Example `infoAssessment.json` configuration (use the test fixture below)
- Multiple lockpoints and sequential crossing
- Interaction with `advanceScorePerc` (must satisfy score thresholds before crossing)
- Interaction with workspaces: **lockpoints do not make workspaces read-only**. Lockpoints gate access to future questions/resources; they should not be used to remove access to previous workspaces. If a workspace question precedes a lockpoint, students retain access to that workspace even after crossing.
- Configuration timing: lockpoints should be configured before students begin the assessment. Adding a lockpoint after students have started will require those students to cross the new lockpoint, which may lock them out of zones they were previously working in.
- Group assessments: all group members share lockpoint state. Any member can cross a lockpoint, and it affects the whole group.
- Finishing: students can finish the assessment at any time regardless of lockpoint state.

### Test fixture

**File:** `testCourse/courseInstances/Sp15/assessments/exam18-lockpoints/infoAssessment.json`

```json
{
  "uuid": "3d4ef390-5e04-4a7d-9dce-6cf8f5c17311",
  "type": "Exam",
  "title": "Exam with lockpoints",
  "set": "Exam",
  "number": "18",
  "zones": [
    {
      "title": "Conceptual questions",
      "questions": [
        {
          "id": "addNumbers",
          "points": 10
        }
      ]
    },
    {
      "title": "Coding questions",
      "lockpoint": true,
      "questions": [
        {
          "id": "addVectors",
          "points": 10
        }
      ]
    },
    {
      "title": "Advanced questions",
      "lockpoint": true,
      "questions": [
        {
          "id": "fossilFuelsRadio",
          "points": 10
        }
      ]
    }
  ]
}
```

This provides a 3-zone assessment with lockpoints on zones 2 and 3 for testing sequential crossing, read-only state, and the full lockpoint lifecycle.

---

## Files Modified (Summary)

| File                                                                                             | Change                                                                                         |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `apps/prairielearn/src/migrations/{ts1}_zones__lockpoint__add.sql`                               | **NEW** - migration (must come first)                                                          |
| `apps/prairielearn/src/migrations/{ts2}_assessment_instance_crossed_lockpoints__create.sql`      | **NEW** - migration                                                                            |
| `database/tables/zones.pg`                                                                       | Add `lockpoint` column                                                                         |
| `database/tables/assessment_instance_crossed_lockpoints.pg`                                      | **NEW** - table description                                                                    |
| `apps/prairielearn/src/lib/db-types.ts`                                                          | Add new table schema, update Zone, update SprocQuestionOrder                                   |
| `apps/prairielearn/src/schemas/infoAssessment.ts`                                                | Add `lockpoint` to zone schema, add `.superRefine()` validation                                |
| `apps/prairielearn/src/sync/fromDisk/assessments.ts`                                             | Sync `lockpoint`                                                                               |
| `apps/prairielearn/src/sprocs/sync_assessments.sql`                                              | Add `lockpoint` to zone upsert                                                                 |
| `apps/prairielearn/src/sprocs/question_order.sql`                                                | Add `lockpoint_not_yet_crossed`, `lockpoint_read_only`                                         |
| `apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.sql`                           | Block `lockpoint_not_yet_crossed`, pass `lockpoint_read_only`, add to `next_instance_question` |
| `apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.ts`                            | Add lockpoint fields to `InstanceQuestionInfoSchema`                                           |
| `apps/prairielearn/src/lib/question-render.sql`                                                  | Add `lockpoint_read_only` for current question + `lockpoint_not_yet_crossed` for next question |
| `apps/prairielearn/src/lib/assessment.ts`                                                        | Add `crossLockpoint()` function                                                                |
| `apps/prairielearn/src/lib/assessment.sql`                                                       | Add `cross_lockpoint` SQL, `check_lockpoint_crossed` SQL, event log UNION                      |
| `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.ts`             | Handle `cross_lockpoint` POST                                                                  |
| `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.sql`            | Add lockpoint data to `select_instance_questions`                                              |
| `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.html.ts`        | Barrier row (3 states), modal, read-only styling                                               |
| `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`                 | Block submissions for read-only                                                                |
| `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.html.ts`            | Read-only banner                                                                               |
| `apps/prairielearn/src/components/QuestionNavigation.tsx`                                        | Lockpoint in Next button (no changeset needed — in `apps/`)                                    |
| `apps/prairielearn/src/lib/question-render.ts`                                                   | Hide save/grade for read-only, include lockpoint in live nav updates                           |
| `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.html.tsx` | Lockpoint crossing details                                                                     |
| `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.sql`      | Query crossed lockpoints                                                                       |
| `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.ts`       | Pass lockpoint data                                                                            |
| `apps/prairielearn/src/pages/instructorAssessmentQuestions/utils/dataTransform.ts`               | Add `lockpoint` to `serializeZonesForJson` to prevent silent data loss                         |
| `apps/prairielearn/src/pages/instructorAssessmentQuestions/utils/dataTransform.test.ts`          | Test `lockpoint` round-trips through serialize/deserialize                                     |
| `docs/assessment/configuration.md`                                                               | Add lockpoints documentation section + Zone Property table row                                 |
| `testCourse/courseInstances/Sp15/assessments/exam18-lockpoints/infoAssessment.json`              | **NEW** - test fixture                                                                         |
| `apps/prairielearn/src/tests/testLockpoints.test.ts`                                             | **NEW** - integration tests                                                                    |
| `apps/prairielearn/src/tests/testLockpoints.test.sql`                                            | **NEW** - fixture lookup query for integration tests                                           |

---

## Blindspots & Risks

1. **`question_order` sproc performance**: Adding CTEs with joins to `assessment_instance_crossed_lockpoints` could slow down this frequently-called sproc. The table is small (max ~5 rows per assessment instance) so it should be fine, but worth profiling.

2. **Workspace read-only limitation**: Crossing a lockpoint does NOT make workspaces read-only. Document this limitation. The issue acknowledges it.

3. **Shuffled questions with lockpoints**: When `shuffleQuestions = true`, questions are shuffled within zones but zones maintain their order. Lockpoints operate at the zone level so should work correctly, but verify with tests.

4. **`instance_questions.open` recomputation**: The issue explicitly warns against using `iq.open` for lockpoints because grading recomputes it. This plan correctly avoids it by computing status on-the-fly from `assessment_instance_crossed_lockpoints`.

5. **advanceScorePerc interaction**: If Zone 1 ends with `advanceScorePerc` and Zone 2 has a lockpoint, the `crossLockpoint` function must verify `advanceScorePerc` is satisfied before allowing crossing.

6. **`selectAndAuthzInstanceQuestion.sql` WHERE clause**: Adding `AND NOT iqi.lockpoint_not_yet_crossed` blocks access to zones past uncrossed lockpoints. Must NOT block `lockpoint_read_only` questions (students should view them).

7. **Race condition in `crossLockpoint`**: `UNIQUE(assessment_instance_id, zone_id)` + `ON CONFLICT DO NOTHING` makes concurrent crossing idempotent.

8. **Re-sync after lockpoint removed from config**: If an instructor removes a lockpoint after students crossed it, the `assessment_instance_crossed_lockpoints` row persists but `zones.lockpoint` becomes false. The `question_order` sproc handles this gracefully since it only checks `z.lockpoint = true`.

9. **Re-sync after lockpoint added to config**: If an instructor adds `lockpoint: true` to a zone after students are already past it, those students will see `lockpoint_not_yet_crossed = true` for that zone and all subsequent zones, locking them out until they cross it. This is technically correct behavior (the student hasn't crossed the lockpoint), but could be confusing. **Mitigation:** Document in user-facing docs that lockpoints should be configured before students begin, and that adding lockpoints mid-assessment will require affected students to cross the new lockpoint. The instructor "undo" feature (deferred) would also help here.

10. **Course sync validation errors**: Need to integrate lockpoint validation into existing sync error reporting. The `.superRefine()` approach ensures consistent Zod error formatting.

11. **Test data**: Add a fixture assessment under `testCourse/courseInstances/Sp15/assessments/` (e.g. `exam18-lockpoints`). `testSequentialQuestions.test.ts` already uses this test course fixture pattern.

12. **Instructor assessment editor (`dataTransform.ts`)**: The `serializeZonesForJson` function has a hardcoded property list. If `lockpoint` is not added, editing and saving an assessment through the instructor UI will silently drop `lockpoint: true` configuration. This is addressed in Phase 2.

13. **Sync tests**: The sync test file at `apps/prairielearn/src/sync/fromDisk/entity-list.test.ts` (or a new lockpoint-specific test) should verify `lockpoint` field syncing and schema validation errors (first zone lockpoint, `numberChoose: 0` lockpoint).

---

## TODO (deferred)

- Low-friction path when all previous questions are already closed (100%) -- skip/simplify the confirmation modal
- Instructor "undo" button to un-cross a lockpoint

---

## Verification

### Integration Tests

Create `apps/prairielearn/src/tests/testLockpoints.test.ts` modeled on `testSequentialQuestions.test.ts`:

1. **Basic lockpoint crossing**: 2 zones, lockpoint on zone 2. Verify zone 2 blocked → cross → zone 1 read-only, zone 2 accessible.
2. **Multiple lockpoints**: 3 zones, lockpoints on zones 2 and 3. Verify sequential crossing.
3. **advanceScorePerc interaction**: Zone 1 with `advanceScorePerc`, zone 2 with lockpoint. Can't cross until satisfied.
4. **Submission blocking**: After crossing, attempt to submit to read-only question → 403.
5. **Concurrent crossing**: Two users crossing same lockpoint → idempotent.
6. **External grading**: Submit to externally-graded question, cross lockpoint, grading result still accepted.
7. **Homework support**: homework assessment with lockpoints follows the same lock/read-only behavior.
8. **Re-sync: lockpoint added mid-assessment**: Add lockpoint after student has started, verify student is blocked until they cross it.
9. **Finish with uncrossed lockpoints**: Student can finish assessment even with uncrossed lockpoints.
10. **Question preview safety**: Live submission-panel updates still work in `publicQuestionPreview` / `instructorQuestionPreview` after adding `lockpoint_read_only` to `select_submission_info`.

Also add `apps/prairielearn/src/tests/testLockpoints.test.sql` with fixture lookup queries (matching the `testSequentialQuestions.test.ts` pattern).

### Manual Testing

1. Create test assessment with lockpoints in `testCourse/courseInstances/Sp15/assessments/` for repeatable local testing
2. Navigate as student, verify barrier visible in all three states (crossed, crossable, future)
3. Try clicking blocked question → locked
4. Cross lockpoint via modal
5. Verify previous questions are read-only (view OK, submit blocked)
6. On group assessment, verify modal includes group warning text
7. Check instructor view shows crossing details
8. Check event log shows crossing event

### Automated Checks

```bash
make build          # Typecheck
make format-changed # Format
make update-database-description
make update-jsonschema # Update JSON schema
yarn test apps/prairielearn/src/tests/testLockpoints.test.ts
```

---

## Resolved Clarifications

1. Lockpoints are allowed on **Homework** and **Exam**.
2. `cross_lockpoint` is allowed when `authz_result.authorized_edit` is true, including staff emulating students. Staff emulating students cannot view lockpoint-blocked questions (must cross the lockpoint like a student).
3. Lockpoint zones with `numberChoose: 0` fail at sync time.
4. Student overview shows crossed-by and crossed-at details after crossing.
5. Barrier rows are always visible, even for unreachable lockpoints, so students can anticipate what's next.
6. Group assessment modal includes additional friction text about affecting all group members.
7. Barrier crossability is computed in TypeScript from per-question row data (no extra SQL column needed).
8. Finishing the assessment is not blocked by uncrossed lockpoints.
9. Crossing a lockpoint is initiated only from the assessment instance overview page; next-question navigation remains disabled until the lockpoint is crossed there.
10. Non-emulating staff (`has_course_instance_permission_edit` with `authorized_edit = false`) cannot cross lockpoints.
11. Crossed-by display should use UID only.

---

## Implementation deviations (2026-02-14, updated 2026-02-20)

- Test implementation currently focuses on core lockpoint lifecycle behavior in `testLockpoints.test.ts`, and does not yet cover every optional edge-case scenario listed in the Verification checklist.

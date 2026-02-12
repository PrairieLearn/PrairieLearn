# Lockpoints Implementation Plan

## Context

PrairieLearn assessments currently have no mechanism to make earlier questions read-only when a student advances to later sections. This is needed for exams where conceptual questions precede a Python workspace -- students shouldn't be able to use the workspace to retroactively answer the conceptual questions. **Lockpoints** are zone-level barriers that, once crossed, make all questions in preceding zones read-only. See [#14002](https://github.com/PrairieLearn/PrairieLearn/issues/14002).

Key design decisions (from issue + user clarification):

- Crossing a lockpoint uses a **checkbox + confirm button in a modal** (sufficient friction for MVP; can reconsider adding a typed phrase later if needed)
- Lockpoint-locked status is computed by **extending `question_order` sproc** (single query for all lock state)
- The "low-friction path when all previous questions are already closed" is **deferred** (leave a TODO)
- **Full scope** minus the instructor "undo" feature
- Multiple lockpoints per assessment are supported (sequential crossing required)
- Lockpoints are supported for both **Exam** and **Homework** assessments
- Crossing is allowed whenever `authz_result.authorized_edit` is true (including staff emulating a student)

---

## Phase 1: Database Schema

### Migration 1: Add `lockpoint` to `zones`

**File:** `apps/prairielearn/src/migrations/{timestamp}_zones__lockpoint__add.sql`

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

In a `.superRefine()` on `AssessmentJsonSchema`, enforce:

```
if (assessment.zones[0]?.lockpoint) {
  error: "The first zone cannot have lockpoint: true"
}

if (assessment.zones.some(zone => zone.lockpoint && zone.numberChoose === 0)) {
  error: "A lockpoint zone must include at least one selectable question"
}
```

Rationale: validation in the schema ensures consistent error formatting during sync, instead of introducing one-off validation in `fromDisk/assessments.ts`.

### Sync `lockpoint` to the database

**File:** `apps/prairielearn/src/sync/fromDisk/assessments.ts` (~line 89-103)

Add `lockpoint: zone.lockpoint ?? false` to the zone mapping.

**File:** `apps/prairielearn/src/sprocs/sync_assessments.sql` (~line 328-371)

Add `lockpoint` to the INSERT and ON CONFLICT UPDATE for zones:

- Add to column list: `lockpoint`
- Add to values: `(zone->>'lockpoint')::boolean`
- Add to ON CONFLICT SET: `lockpoint = EXCLUDED.lockpoint`

### Update JSON schema output

Run `make update-jsonschema` after changing the Zod schema.

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

#### CTE approach

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

Then for each question in zone with number `qz_number`:

- `lockpoint_not_yet_crossed = COALESCE(qz_number >= first_uncrossed_lockpoint.zone_number, false)` -- blocked by uncrossed lockpoint
- `lockpoint_read_only = EXISTS (SELECT 1 FROM lockpoint_info WHERE is_crossed AND zone_number > qz_number)` -- read-only from crossed lockpoint

### Prevent submissions to lockpoint-read-only questions

**Files to modify:**

1. **`apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.sql`** (line 135)
   - Currently: `AND NOT iqi.sequence_locked`
   - Add: `AND NOT iqi.lockpoint_not_yet_crossed` to block access to zones past uncrossed lockpoints
   - Do NOT add `lockpoint_read_only` here -- students should still be able to VIEW read-only questions
   - Add `lockpoint_read_only` and `lockpoint_not_yet_crossed` to the `instance_question_info` JSON object for downstream use

   **Direct URL access:** When a student navigates directly to a `lockpoint_not_yet_crossed` question (e.g., via bookmark or manual URL), the WHERE clause filters it out and the middleware throws a 403. Update the error message in `selectAndAuthzInstanceQuestion.ts` to detect this case: if the question exists but is lockpoint-blocked, return `HttpStatusError(403, 'This question is not yet accessible. You must cross the lockpoint on the assessment overview page first.')`. This matches the existing `sequence_locked` behavior pattern but provides a lockpoint-specific message.

2. **`apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`** (line 172-188)
   - In `validateAndProcessSubmission`, add:
     ```typescript
     if (res.locals.instance_question_info.lockpoint_read_only) {
       throw new HttpStatusError(403, 'This question is read-only after crossing a lockpoint');
     }
     ```

3. **`apps/prairielearn/src/lib/question-render.ts`** — `buildLocals` function (~line 254)
   - `buildLocals` currently takes 9 positional parameters via a destructured options object. Add `lockpoint_read_only?: boolean` to the existing options object:
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
     })
     ```
   - Insert a new block **after** the Homework/Exam-specific logic (line 333) and **before** the `!variant.open` cascade (line 342):
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
   - Callers of `buildLocals` (currently `getAndRenderVariant` and `renderPanelsForSubmission`) must pass `lockpoint_read_only` from `res.locals.instance_question_info.lockpoint_read_only`.

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
   - `select_submission_info` currently returns `next_instance_question.sequence_locked` only.
   - Add `lead(qo.lockpoint_not_yet_crossed) OVER w` and include it in `next_instance_question` JSON.
   - Update `SubmissionInfoSchema` in `question-render.ts` with `lockpoint_not_yet_crossed`.
   - Pass `lockpoint_not_yet_crossed` into `QuestionNavSideButton(...)` in `renderPanelsForSubmission` so the live-updated "Next question" button uses lockpoint state too.

### API endpoint: Cross a lockpoint

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.ts`

Add a new POST action `cross_lockpoint`:

```typescript
} else if (req.body.__action === 'cross_lockpoint') {
    if (!res.locals.assessment_instance.open || !res.locals.authz_result.active) {
        throw new HttpStatusError(403, 'This assessment is not accepting submissions at this time.');
    }
    const zone_id = IdSchema.parse(req.body.zone_id);
    await crossLockpoint({
        assessment_instance_id: res.locals.assessment_instance.id,
        zone_id,
        authn_user_id: res.locals.authn_user.id,
    });
    res.redirect(req.originalUrl);
}
```

Also add `'cross_lockpoint'` to the action list gated by `authorized_edit` in the student page POST handler. This keeps behavior consistent with other student actions: blocked when not actually emulating the student, allowed when `authz_result.authorized_edit` is true.

**File:** `apps/prairielearn/src/lib/assessment.ts`

Create `crossLockpoint()` function that uses a single atomic SQL `INSERT ... SELECT` with all validation in the WHERE clause:

1. Zone has `lockpoint = true`
2. Zone belongs to the same assessment as the assessment instance
3. This is the next uncrossed lockpoint (no prior uncrossed lockpoint exists)
4. All questions in prior zones satisfy `advanceScorePerc` (no `sequence_locked` question exists before this zone)
5. `ON CONFLICT DO NOTHING` for idempotent concurrent requests

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
ON CONFLICT (assessment_instance_id, zone_id) DO NOTHING;
```

The `ON CONFLICT DO NOTHING` means Postgres never errors on this INSERT — it either inserts a row or silently does nothing. The 0-rows-inserted case covers two scenarios:

1. **Already crossed** (conflict): Harmless. The redirect reloads the page showing the already-crossed state.
2. **Validation failed** (WHERE clause didn't match): The UI should prevent this — the "Proceed" button is only shown when the lockpoint is crossable. If a student manually crafts a POST or has a stale page, a generic error is appropriate.

In the TypeScript `crossLockpoint()` function, check `rowCount`:

```typescript
const result = await queryRows(sql.cross_lockpoint, { ... });
if (result.rowCount === 0) {
  throw new HttpStatusError(403, 'Unable to cross this lockpoint. Please return to the assessment overview and try again.');
}
```

No status enum or post-check query is needed. The UI prevents all invalid paths, and the generic 403 is sufficient for edge cases (stale tabs, concurrent group members, crafted requests).

### Interaction with advanceScorePerc

The `first_uncrossed_lockpoint` CTE in `question_order` handles this naturally: if `advanceScorePerc` locks a question, the student can't reach the lockpoint crossing UI. The `crossLockpoint` function additionally verifies no questions in prior zones are `sequence_locked`.

### Interaction with external grading

No changes needed. Since we compute lockpoint status on-the-fly from `assessment_instance_crossed_lockpoints` (NOT `instance_questions.open`), external grading results will still update question scores. The question is just read-only for new student submissions.

---

## Phase 4: Student UI - Assessment Instance Page

### Lockpoint barrier row in question table

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.html.ts`

When rendering the question table, insert a lockpoint barrier row before each lockpoint zone. Concretely, when rendering a question row with `start_new_zone = true` and `lockpoint = true`, render the barrier first, then the zone header row. This is a full-width `<tr>` with `colspan` spanning all columns, styled distinctly (e.g., warning background).

The barrier should include `__csrf_token` in a hidden input (required for all POST forms).

**File:** `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.sql`

Add to `select_instance_questions`:

- `z.lockpoint` to the SELECT
- `aicl.id IS NOT NULL AS lockpoint_crossed` (via LEFT JOIN on `assessment_instance_crossed_lockpoints` for this assessment instance + zone)
- `aicl.crossed_at AS lockpoint_crossed_at`
- `u.uid AS lockpoint_crossed_auth_user_uid`
- `lockpoint_not_yet_crossed` and `lockpoint_read_only` from `question_order`

Update `InstanceQuestionRowSchema`:

```typescript
lockpoint: z.boolean(),
lockpoint_crossed: z.boolean(),
lockpoint_crossed_at: z.date().nullable(),
lockpoint_crossed_auth_user_uid: z.string().nullable(),
lockpoint_not_yet_crossed: z.boolean(),
lockpoint_read_only: z.boolean(),
```

### Lockpoint crossing modal

When the next uncrossed lockpoint is reachable, show a button in the barrier row that opens a modal:

```
[Lockpoint barrier row in table]
"Questions above will become read-only if you proceed"
[Button: "Proceed to next section"]
  → Opens modal with:
     - Warning text explaining consequences
     - Checkbox: "I understand that questions above will become read-only"
     - [Cancel] [Confirm] buttons (Confirm disabled until checkbox checked)
     - Form POSTs __action=cross_lockpoint with zone_id and __csrf_token
```

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

**Priority:** In `RowLabel`, check `sequence_locked` first, then `lockpoint_not_yet_crossed` as an `else if`. This gives `sequence_locked` precedence when both apply, which is correct since the student must address the score threshold first.

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

Add a new `lockpointNotYetCrossed` prop to `QuestionNavSideButton` (and `QuestionNavSideGroup`):

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
})
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

---

## Phase 6: Instructor UI

### Instructor assessment instance page

**File:** `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.html.tsx`

Show lockpoint crossing details between zones: "Lockpoint crossed by [user] at [time]" or "Lockpoint not yet crossed".

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

Add a new UNION block to `assessment_instance_log`:

```sql
UNION
(
  SELECT
    7.7 AS event_order, -- Between 7.5 (Time limit expiry) and 8 (View variant); no conflict
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

Validation errors:

1. First zone cannot have `lockpoint: true`
2. A lockpoint zone cannot have `numberChoose: 0`

### Concurrent access (groups / multiple tabs)

The `crossLockpoint` SQL uses `INSERT ... ON CONFLICT DO NOTHING`, making it idempotent. If a student tries to submit to a now-read-only question (because another group member crossed a lockpoint), the server-side check returns a 403 with a clear error message.

For UI: page reload shows the updated state. No real-time WebSocket updates for MVP.

### Auto-close / time limit expiry

No changes needed. Lockpoints only affect the student's ability to make new submissions while the assessment is open. Auto-close grades everything regardless.

---

## Phase 8: Documentation

**File:** `docs/assessment/configuration.md`

Add a new section after "Sequential questions" (`advanceScorePerc`) documenting lockpoints:

### Lockpoints

Lockpoints allow instructors to create one-way barriers between zones. When a student crosses a lockpoint, all questions in previous zones become read-only — students can review their previous submissions but cannot make new ones.

Document:
- The `lockpoint` zone property and its behavior
- Example `infoAssessment.json` configuration (use the test fixture below)
- Multiple lockpoints and sequential crossing
- Interaction with `advanceScorePerc` (must satisfy score thresholds before crossing)
- Interaction with workspaces: **lockpoints do not make workspaces read-only**. Lockpoints gate access to future questions/resources; they should not be used to remove access to previous workspaces. If a workspace question precedes a lockpoint, students retain access to that workspace even after crossing.
- Configuration timing: lockpoints should be configured before students begin the assessment. Adding a lockpoint after students have started will require those students to cross the new lockpoint, which may lock them out of zones they were previously working in.
- Group assessments: all group members share lockpoint state. Any member can cross a lockpoint.

### Test fixture

**File:** `testCourse/courseInstances/Sp15/assessments/exam18-lockpoints/infoAssessment.json`

```json
{
  "uuid": "a new uuid",
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
| `apps/prairielearn/src/migrations/{ts1}_zones__lockpoint__add.sql`                               | **NEW** - migration                                                                            |
| `apps/prairielearn/src/migrations/{ts2}_assessment_instance_crossed_lockpoints__create.sql`      | **NEW** - migration                                                                            |
| `database/tables/zones.pg`                                                                       | Add `lockpoint` column                                                                         |
| `database/tables/assessment_instance_crossed_lockpoints.pg`                                      | **NEW** - table description                                                                    |
| `apps/prairielearn/src/lib/db-types.ts`                                                          | Add new table schema, update Zone                                                              |
| `apps/prairielearn/src/schemas/infoAssessment.ts`                                                | Add `lockpoint` to `ZoneAssessmentJsonSchema` and lockpoint validation                         |
| `apps/prairielearn/src/sync/fromDisk/assessments.ts`                                             | Sync `lockpoint`                                                                               |
| `apps/prairielearn/src/sprocs/sync_assessments.sql`                                              | Add `lockpoint` to zone upsert                                                                 |
| `apps/prairielearn/src/sprocs/question_order.sql`                                                | Add `lockpoint_not_yet_crossed`, `lockpoint_read_only`                                         |
| `apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.sql`                           | Block `lockpoint_not_yet_crossed`, pass `lockpoint_read_only`, add to `next_instance_question` |
| `apps/prairielearn/src/middlewares/selectAndAuthzInstanceQuestion.ts`                            | Add lockpoint fields to `InstanceQuestionInfoSchema`                                           |
| `apps/prairielearn/src/lib/question-render.sql`                                                  | Add lockpoint state to `next_instance_question` in `select_submission_info`                    |
| `apps/prairielearn/src/lib/assessment.ts`                                                        | Add `crossLockpoint()` function                                                                |
| `apps/prairielearn/src/lib/assessment.sql`                                                       | Add `crossLockpoint` SQL, event log UNION                                                      |
| `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.ts`             | Handle `cross_lockpoint` POST                                                                  |
| `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.sql`            | Add lockpoint data                                                                             |
| `apps/prairielearn/src/pages/studentAssessmentInstance/studentAssessmentInstance.html.ts`        | Barrier row, modal, read-only styling                                                          |
| `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`                 | Block submissions for read-only                                                                |
| `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.html.ts`            | Read-only banner                                                                               |
| `apps/prairielearn/src/components/QuestionNavigation.tsx`                                        | Lockpoint in Next button                                                                       |
| `apps/prairielearn/src/lib/question-render.ts`                                                   | Hide save/grade for read-only, include lockpoint in live nav updates                           |
| `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.html.tsx` | Lockpoint crossing details                                                                     |
| `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.sql`      | Query crossed lockpoints                                                                       |
| `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.ts`       | Pass lockpoint data                                                                            |
| `docs/assessment/configuration.md`                                                              | Add lockpoints documentation section                                                           |
| `testCourse/courseInstances/Sp15/assessments/exam18-lockpoints/infoAssessment.json`             | **NEW** - test fixture                                                                         |

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

10. **Course sync validation errors**: Need to integrate lockpoint validation into existing sync error reporting. Follow the `advanceScorePerc` validation pattern.

11. **Test data**: Add a fixture assessment under `testCourse/courseInstances/Sp15/assessments/` (e.g. `exam18-lockpoints`). `testSequentialQuestions.test.ts` already uses this test course fixture pattern.

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

### Manual Testing

1. Create test assessment with lockpoints in `testCourse/courseInstances/Sp15/assessments/` for repeatable local testing
2. Navigate as student, verify barrier visible
3. Try clicking blocked question → locked
4. Cross lockpoint via modal
5. Verify previous questions are read-only (view OK, submit blocked)
6. Check instructor view shows crossing details
7. Check event log shows crossing event

### Automated Checks

```bash
make build             # Typecheck
make format-changed    # Format
make update-jsonschema # Update JSON schema
yarn test apps/prairielearn/src/tests/testLockpoints.test.ts
```

---

## Resolved Clarifications

1. Lockpoints are allowed on **Homework** and **Exam**.
2. `cross_lockpoint` is allowed when `authz_result.authorized_edit` is true, including staff emulating students.
3. Lockpoint zones with `numberChoose: 0` fail at sync time.
4. Student overview shows crossed-by and crossed-at details after crossing.

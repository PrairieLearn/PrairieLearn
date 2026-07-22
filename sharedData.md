# Planning: `sharedData` (issue [#5501](https://github.com/PrairieLearn/PrairieLearn/issues/5501))

## 1. Problem

Questions cannot currently communicate with each other. An instructor who wants to
build a multi-part exercise (e.g. "design a subnet in part A, then configure
interfaces for that same subnet in part B") has to cram everything into one giant
question, because part B has no way to see what a student did in part A.

A second, simpler motivating example, used throughout this doc alongside the
subnet-design one: a "pick a theme" question where a student chooses between
`sports`, `cooking`, and `travel`, followed by two independent simple
arithmetic questions later in the assessment that reuse that theme to flavor
their wording (e.g. "a chef needs 3 batches of 12 cookies..." vs. "a runner
completes 3 laps of 12 minutes each..."). This example is useful specifically
because it exercises an `enum`-typed field (unlike the subnet example, which
only uses `string`/`number`) and a "one writer, many read-only downstream
readers" sharing pattern rather than subnet design's "both sides read and
write."

This doc scopes a first implementation ("v1") per direction given directly for
this task:

- `sharedData` lives in **named pools**, declared per-question in `info.json`.
- For student assessments, pool state is stored in its own table, joined to
  `assessment_instances` by `assessment_instance_id`.
- Instructor question preview must also work, but through a different
  (non-assessment-instance) storage path.
- Pool values are **typed**, using the same schema shape as the existing
  "Question Preferences" feature, applied per-pool.
- Instructors can view/edit a student's pool state from the
  `instructorAssessmentInstance` page.

## 2. Design template: Question Preferences

Preferences (`docs/question/preferences.md`) is the closest existing feature and
is the explicit template to follow:

- Schema (`{type, default, enum?}` per field) is declared inline in the
  question's own `info.json`, no central course-level registry
  (`apps/prairielearn/src/schemas/infoQuestion.ts:16-29`,
  `QuestionPreferencesFieldSchema` / `QuestionPreferencesSchemaJsonSchema`).
- `questions.preferences_schema jsonb` stores the authored schema.
- `assessment_questions.preferences jsonb` stores per-assessment override
  *values*, validated against the schema at sync time via AJV
  (`sync/fromDisk/assessments.ts`, `mergeAndValidatePreferences`).
- `variants.preferences jsonb` stores the final resolved values, frozen once
  at variant creation (`lib/question-variant.ts:261-330`).
- `freeform.ts`'s `checkData()` is the single source of truth for which `data`
  keys exist in which lifecycle phase and whether Python may mutate them
  (`question-servers/freeform.ts:401-493`). `preferences` is present in all
  phases but not editable in any (`checkProp('preferences', 'object', allPhases, [])`).

Shared data pools diverge from preferences in one essential way: preferences
are **frozen per-variant and read-only**; pool values must be **live and
read/write**, because their entire purpose is letting question B see (and
extend) what question A most recently wrote. Everywhere below, "do it like
preferences" applies to the *authoring/typing* story; the *runtime* story is
new.

## 3. `info.json` changes

Reuse the existing preferences field schema, but keyed by pool name instead of
by a flat field name — literally "the preferences pattern, once per pool":

```ts
// apps/prairielearn/src/schemas/infoQuestion.ts
export const SharedDataPoolSchemaJsonSchema = QuestionPreferencesSchemaJsonSchema; // record<fieldName, {type, default, enum?}>

// added to QuestionJsonSchema:
sharedDataPools: z.record(z.string().min(1), SharedDataPoolSchemaJsonSchema).optional(),
```

Example, for the subnet-design use case from the issue:

```json
"sharedDataPools": {
  "subnetDesign": {
    "address_range": { "type": "string", "default": "" },
    "nhosts": { "type": "number", "default": 0 }
  }
}
```

And for the themed-arithmetic example — the theme-picker question declares
the pool with an `enum` field:

```json
"sharedDataPools": {
  "assessmentTheme": {
    "theme": { "type": "string", "default": "sports", "enum": ["sports", "cooking", "travel"] }
  }
}
```

The two downstream arithmetic questions declare the *same* pool name and
field (so sync-time merge validation in §4 sees identical definitions and
accepts it), but only ever read `data["shared_data"]["assessmentTheme"]["theme"]`
in `generate()` to pick their wording — they never write to it. Nothing in the
schema or storage layer distinguishes "reads and writes" (subnet design) from
"writes once, reads many times" (theme) — that's purely a convention in how
each question's `server.py` chooses to use the pool.

A pool name (`"subnetDesign"`) has no central declaration anywhere else — it's
just a string that two or more questions happen to agree on, the same way
`sharingSets`/`tags` are bare strings, except here the *schema* rides along
with the name rather than being registered centrally. Multiple questions may
declare the same pool name with different (but non-conflicting) field sets;
see sync validation below.

## 4. Sync-time validation

New sync step, analogous to `mergeAndValidatePreferences`
(`sync/fromDisk/assessments.ts:38-80`), run per-assessment over all
`assessment_questions` it contains:

1. Collect every question's `sharedDataPools` declarations.
2. For each pool name referenced by more than one question, verify the
   overlapping field definitions are identical (`type`, `default`, `enum`) —
   error out with a sync error naming the conflicting questions/fields if not
   (mirrors the existing "does not define a preferences schema" error style).
3. Shallow-merge all questions' field definitions for each pool name into one
   effective schema.
4. Store the merged result on a new `assessments.shared_data_pool_schemas
jsonb` column.

This keeps the same "resolve once at sync time, read cheaply at runtime"
shape that `assessment_questions.preferences` uses, just moved up one level
to `assessments` since a pool is shared across questions, not owned by one.

## 5. Database schema changes

### New/changed columns

| Table | Column | Purpose |
|---|---|---|
| `questions` | `shared_data_pools jsonb not null default '{}'` | Per-question declared pool schemas, synced from `info.json` (mirrors `preferences_schema`). |
| `assessments` | `shared_data_pool_schemas jsonb not null default '{}'` | Merged/validated effective schema per pool name, computed at sync time (see §4). |

### New table: `assessment_instance_shared_data_pools`

One row per (assessment_instance, pool). This is the table the task
description asks for — joined to `assessment_instances` via
`assessment_instance_id`. Modeled directly on the existing
`assessment_instance_crossed_lockpoints` table (`database/tables/assessment_instance_crossed_lockpoints.pg`), which is the existing example of "one row per (assessment_instance, named thing)":

```
columns
    id: bigint not null default nextval(...)
    assessment_instance_id: bigint not null
    pool_name: text not null
    data: jsonb not null default '{}'::jsonb
    created_at: timestamp with time zone not null default now()
    updated_at: timestamp with time zone not null default now()

indexes
    PRIMARY KEY (id)
    UNIQUE (assessment_instance_id, pool_name)

foreign-key constraints
    assessment_instance_id -> assessment_instances(id) ON DELETE CASCADE
```

Migration file: `apps/prairielearn/src/migrations/{timestamp}_assessment_instance_shared_data_pools__create.sql`.

### New table: `course_instructor_shared_data_pools` (preview mode — see §7)

```
columns
    id: bigint not null default nextval(...)
    course_id: bigint not null
    user_id: bigint not null
    pool_name: text not null
    data: jsonb not null default '{}'::jsonb
    created_at: timestamp with time zone not null default now()
    updated_at: timestamp with time zone not null default now()

indexes
    PRIMARY KEY (id)
    UNIQUE (course_id, user_id, pool_name)

foreign-key constraints
    course_id -> courses(id) ON DELETE CASCADE
    user_id   -> users(id)   ON DELETE CASCADE
```

### `database/` description + Zod types

- Update `database/tables/*.pg` for all of the above (via
  `make update-database-description` after the migrations land) and add the
  question/assessment column docs in `database/tables/questions.pg`,
  `database/tables/assessments.pg`.
- Add Zod row types in `apps/prairielearn/src/lib/db-types.ts`:
  `SharedDataPoolValuesSchema` (`z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))`,
  same shape as `QuestionPreferenceValuesSchema`),
  `AssessmentInstanceSharedDataPoolSchema`, `CourseInstructorSharedDataPoolSchema`.
- Add `shared_data_pools` to `QuestionSchema` and `shared_data_pool_schemas` to
  `AssessmentSchema`, typed via the JSON-schema-of-schema types added in
  `schemas/infoQuestion.ts`.

## 6. Runtime data flow

New model file `apps/prairielearn/src/models/shared-data-pool.ts`, mirroring
`selectPreferencesForInstanceQuestion` (`models/assessment-question.ts:35-42`)
but read/write:

- `selectSharedDataPools(assessment_instance_id, poolNames, defaultsByPool)`:
  for each requested pool name, `INSERT ... ON CONFLICT (assessment_instance_id, pool_name) DO NOTHING RETURNING data`
  (seeding a pool with its schema defaults on first access), then a plain
  select, returning `Record<poolName, Record<fieldName, value>>`.
- `updateSharedDataPools(assessment_instance_id, updates)`: upserts new `data`
  per pool (`INSERT ... ON CONFLICT (assessment_instance_id, pool_name) DO UPDATE SET data = excluded.data, updated_at = now()`).
- Preview-mode equivalents keyed by `(course_id, user_id)` instead of
  `assessment_instance_id`.

### Wiring into `question-variant.ts` / `freeform.ts`

1. **Resolve pool names for a question**: `question.shared_data_pools` gives
   the pool names + per-question defaults directly (no new lookup needed,
   unlike preferences' assessment-override lookup).
2. **`checkData()`** (`question-servers/freeform.ts:401-493`): add a new row,
   modeled on `params`/`correct_answers` rather than `preferences`, since it
   must be writable:
   ```
   checkProp('shared_data', 'object', allPhases, ['generate', 'prepare', 'parse', 'grade'])
   ```
3. **Read, before each phase**: in `question-variant.ts`'s
   `makeAndInsertVariant`/`ensureVariant` (for `generate`/`prepare`) and in
   `lib/grading.ts` immediately before `questionModule.parse(...)` /
   `questionModule.grade(...)` (for `parse`/`grade`), fetch the current pool
   values via `selectSharedDataPools(...)` and inject as `data["shared_data"]`.
   Reading fresh (not frozen on the variant, unlike `preferences`) is what
   lets question B see question A's latest write.
4. **Write back, after each phase**: if the returned `data["shared_data"]`
   differs from what was read, call `updateSharedDataPools(...)` inside the
   same transaction that already persists the variant (`generate`/`prepare`)
   or the submission/score update (`parse`/`grade`). Grading already takes a
   per-assessment-instance lock (`lockAssessmentInstanceForInstanceQuestion`,
   referenced in `question-variant.ts:327`) to serialize concurrent scoring
   for one student — reuse that same lock for pool writes rather than adding
   new locking, so a student submitting two questions in quick succession
   can't race two pool updates.
5. Elements do **not** get access to `shared_data` (only `server.py`, via
   `data["shared_data"]["poolName"]["field"]`, and `question.html` via Mustache's
   `{{shared_data.poolName.field}}`), matching the "footgun for reusable
   elements" concern raised in the issue thread for the earlier `shareData`
   proposal.

## 7. Instructor preview mode

Preview variants (`pages/instructorQuestionPreview`,
`pages/publicQuestionPreview`) have `instance_question_id = null` — there is
no `assessment_instance_id` to hang pool state off of. Per
`question-variant.ts:286-294`, preferences simply skip the override lookup in
this case (defaults only); shared data instead needs an explicit different
storage path since the whole point is cross-question communication, and an
instructor testing a multi-part flow needs to preview question A, then
question B, and have B see what A wrote.

Design: scope preview-mode pool state by `(course_id, user_id, pool_name)` —
the previewing instructor's own scratch state within that course (mirrors how
preview variants already use `variant_user_id = <the previewing user>`).
Previewing question A, submitting/grading it, then previewing question B in
the same course lets the instructor exercise the same pool-sharing logic a
student would, without needing a real assessment instance.

This needs a manual reset affordance (since there's no "new variant resets
everything" concept spanning multiple questions) — add a "Reset shared data"
action, scoped to the current course, on the question preview page.

## 8. Instructor UI on `instructorAssessmentInstance`

Add a new section to `apps/prairielearn/src/pages/instructorAssessmentInstance/instructorAssessmentInstance.html.tsx`,
modeled on the typed-field-editor UI already used for per-assessment
preference overrides (`pages/instructorAssessmentQuestions/components/detail/QuestionDetailPanel.tsx:1026-1063`) rather than the schema-authoring
`PreferencesTable.tsx` (there's no schema editing here, only value editing):

- List the pool names present in `assessment.shared_data_pool_schemas`.
- For each pool, render one typed control per field (string/number/boolean,
  enum → select), populated from `assessment_instance_shared_data_pools` (or
  schema defaults if no row exists yet).
- Save posts to a new route handler that:
  - Validates submitted values against the pool's merged schema.
  - Wraps the upsert and an `insertAuditEvent` call in
    `runInTransactionAsync`, per this repo's convention that an audit event
    must be recorded atomically with the action it documents.

## 9. Size limits

Enforce a small hard cap on `JSON.stringify(data).length` per pool (start at,
e.g., 5 KB) when writing back in step 6.4 above — reject the write and surface
a `format_errors`-style error to the question rather than silently truncating
or letting arbitrarily large blobs accumulate per assessment instance.

## 10. Explicit non-goals for v1 (flag, don't build)

- Sharing pools *across* assessments/course instances (only within one
  `assessment_instance`, or one course for preview, per the scope given).
- Auto-resetting sibling questions' pool data when one question gets a new
  variant (the issue thread wanted this eventually; punt to a follow-up —
  the instructor edit UI in §8 is a manual stopgap).
- `advanceScorePerc`-gated sharing, ordering/dependency enforcement between
  questions, or a "regenerate all questions on any submission" mode — all
  discussed in the issue but out of scope here; instructors can implement
  ordering themselves in `parse()`/`generate()` using the pool contents.
- Schema-authoring UI for pools (the `PreferencesTable.tsx`-style editor) —
  v1 only needs a *value* editor (§8); schemas are authored directly in
  `info.json`.

## 11. Task breakdown

1. `schemas/infoQuestion.ts`: add `SharedDataPoolSchemaJsonSchema` / `sharedDataPools` to `QuestionJsonSchema`. Run `make update-jsonschema`.
2. Migrations: `questions.shared_data_pools`, `assessments.shared_data_pool_schemas`, `assessment_instance_shared_data_pools` table, `course_instructor_shared_data_pools` table. Update `database/` + `db-types.ts` afterward.
3. Sync: merge/validate pool schemas per assessment (`sync/fromDisk/assessments.ts` or a new sibling module); populate `questions.shared_data_pools` from disk in the question sync path.
4. Models: `models/shared-data-pool.ts` (+ `.sql`) with select/upsert functions for both the assessment-instance-scoped and course/user-scoped (preview) variants.
5. `question-servers/freeform.ts`: add `shared_data` to `checkData()`; thread it through `generate`/`prepare`/`parse`/`grade`/`render`'s `data` construction.
6. `lib/question-variant.ts` + `lib/grading.ts`: read pool values before each phase, write back after, reusing the existing per-assessment-instance lock.
7. `docs/question/`: new `shared-data-pools.md` doc, cross-linked from `preferences.md`.
8. Instructor UI: value editor on `instructorAssessmentInstance`; reset action on question preview pages.
9. Tests — see §12 for the full breakdown; this covers unit tests, student/assessment-instance integration tests, instructor-preview integration tests, and instructor view/edit coverage (integration + e2e).

## 12. Test plan

Unit tests alone don't cover this feature — the whole point of pools is
cross-context sharing, so each of the three consumers (student assessment,
instructor preview, instructor viewing/editing a student's instance) needs
its own coverage, not just the model layer.

### Unit tests (`*.test.ts` next to the code)

- Pool schema merge/validation (§4): compatible schemas from two questions
  merge cleanly; conflicting field definitions (different `type`/`default`/
  `enum` for the same field name) produce a sync error naming both questions.
- `extractDefaultPreferences`-equivalent default-extraction for a pool schema.
- Size-limit enforcement (§9 in the doc above): a write exceeding the cap is
  rejected with a clear error, not silently truncated.
- Model read/write functions in isolation (`models/shared-data-pool.ts`):
  first access seeds defaults; a second read after a write sees the new
  value; concurrent upserts to the same `(assessment_instance_id, pool_name)`
  don't lose an update (exercise the lock/upsert path directly).

### Student/assessment-instance integration tests (Vitest, `apps/prairielearn/src/tests`)

Use two small test course fixtures, one per motivating example:

**Subnet-design fixture** (two questions, both read and write the pool):

- Question A writes a value in `generate`; question B, rendered afterward in
  the *same* assessment instance, reads that value via
  `data["shared_data"]["subnetDesign"]`.
- Question B's write in `grade` is visible back to question A on its next
  `parse`/`grade` call.
- Two different students' assessment instances of the same assessment do
  **not** see each other's pool data (isolation by `assessment_instance_id`).
- A brand-new assessment instance for a pool-using assessment starts from
  schema defaults, not leftover data from a prior instance.
- Regenerating a variant of one question does not itself clear the pool
  (matches the "no auto-reset" non-goal in §10) — assert the sibling
  question still sees the old value.

**Themed-arithmetic fixture** (one theme-picker question, `enum`-typed field,
two independent read-only downstream questions):

- Selecting a theme in the picker question makes that theme visible to
  *both* downstream arithmetic questions, in either order, within the same
  assessment instance.
- Both downstream questions independently compute their own (unrelated)
  arithmetic answers correctly while sharing only the `theme` string — i.e.
  the pool constrains wording/flavor, not the grading logic.
- An attempt to write a value outside the declared `enum` (e.g. from a
  hand-edited `info.json` bug, or a future question mistakenly writing an
  invalid theme) is rejected the same way an invalid preferences value would
  be.
- Changing the theme partway through (student revisits the picker question
  and picks a different theme, still within the same assessment instance)
  is reflected the next time either downstream question is (re)rendered —
  confirms reads are live, not frozen at first access.
- A student who never visits the theme-picker question at all sees the
  downstream questions fall back to the schema default (`"sports"`) rather
  than erroring.

### Instructor-preview integration tests

- Previewing question A then question B (same course, same pool name, same
  instructor) round-trips a value the same way the assessment-instance path
  does, scoped by `(course_id, user_id, pool_name)`.
- Two different instructors previewing in the same course do not see each
  other's preview pool state.
- The "reset shared data" action (§7) clears preview pool rows for that
  course/user without touching any `assessment_instance_shared_data_pools`
  rows.

### Instructor view/edit of a student's assessment instance (§8)

- Integration test hitting the `instructorAssessmentInstance` route: GET
  renders the current pool values (or schema defaults if no row exists yet);
  POST with a valid typed value upserts
  `assessment_instance_shared_data_pools` and inserts a matching audit event
  in the same transaction, per this repo's `insertAuditEvent` convention
  (assert both rows exist, and that a forced failure of the audit insert
  rolls back the pool update too, since they share one transaction).
- POST with a value that fails the pool's typed schema (wrong type, value
  outside `enum`) is rejected with a validation error and does not mutate
  the stored row.
- Authorization: a user without instructor access to the course instance
  cannot GET/POST this route (follow the existing authz pattern already
  used elsewhere on `instructorAssessmentInstance`).

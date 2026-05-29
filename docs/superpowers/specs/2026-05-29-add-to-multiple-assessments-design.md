# Add selected questions to multiple assessments at once

## Problem

The bulk "Add to assessment" modal on the instructor questions table lets an
instructor add the selected questions to a **single** assessment, chosen from a
dropdown. Instructors frequently want to seed the same questions into several
assessments (e.g. a set of homeworks). Today that means repeating the flow once
per assessment.

This change replaces the single-select assessment dropdown with a checkbox list
of assessments, grouped by assessment set into collapsible `<details>` blocks,
so an instructor can add to many assessments in one action.

## Scope and decisions

- **One course instance per operation.** The course-instance dropdown stays.
  The checkbox list shows only the selected instance's assessments, grouped by
  set (single-level grouping). Adding across course instances is out of scope.
- **All assessments are checkable.** No disabling based on existing membership.
  Checking an assessment that already contains all selected questions is a
  harmless 0-add no-op (the existing dedup filter handles it).
- **New zone placement is unchanged.** As in the current behavior, added
  questions go into a new untitled zone appended to the end of each target
  assessment; questions already present stay where they are.
- **Atomic write.** Adding to N assessments is a single commit + single sync via
  `MultiEditor`. All-or-nothing: if the sync fails, nothing lands.
- Details blocks are **open by default**. No "select all" affordance (YAGNI).

## Architecture

Three layers change, plus tests. No database or schema changes.

### 1. Backend mutation — `apps/prairielearn/src/trpc/course/questions.ts`

`addToAssessment` input changes:

```diff
- QuestionIdsInputSchema.extend({ assessmentId: IdSchema })
+ QuestionIdsInputSchema.extend({ assessmentIds: z.array(IdSchema).min(1) })
```

Handler logic:

1. Resolve and validate the selected questions once (`selectQuestionsForMutation`).
2. For each `assessmentId`:
   - `selectAssessmentForEdit` to get the assessment + course instance, and build
     the `infoAssessment.json` path (`assessmentInfoPath`).
   - Call `prepareJsonFileEditor` with the existing new-zone `applyChanges`
     (filter out already-present QIDs via `collectQids`; append a new zone
     `{ questions: [...] }` only when there is something to add).
   - Capture that assessment's `addedCount` (count of questions added) from the
     closure, and skip building an editor when `addedCount === 0` so fully-present
     assessments contribute nothing to the commit.
3. If no editors were produced, short-circuit: return zero totals without
   running a server job.
4. Otherwise wrap the prepared `FileModifyEditor`s in a single
   `MultiEditor({ locals: ctx.locals, description }, editors)`, run
   `prepareServerJob()` / `executeWithServerJob()`. On throw, raise the existing
   `AddToAssessment` `SYNC_JOB_FAILED` app error with the job sequence id.
5. Return per-assessment results and an aggregate count of assessments that
   received at least one question:

```ts
return {
  results: [{ assessmentId, addedCount, skippedCount }],
  addedAssessmentCount, // assessments that received >= 1 question
};
```

`addedCount`/`skippedCount` are per assessment (counted against that
assessment's existing membership). The modal summarizes by **assessment count**
rather than a cross-assessment question total, which would be ambiguous when
membership differs between assessments.

`selectAssessmentForEdit`, `assessmentInfoPath`, `collectQids`,
`buildQuestionBlock` are reused as-is.

### 2. trpc `listAssessments` query — same file

Keep the current return shape (`id`, `label`, `title`, `type`,
`referencedCount`, `allQuestionsPresent`) and **add** set info for grouping:

```ts
set: {
  id: assessment.assessment_set.id,
  name: assessment.assessment_set.name,
  abbreviation: assessment.assessment_set.abbreviation,
  color: assessment.assessment_set.color,
  number: assessment.assessment_set.number,
}
```

`selectAssessments` already returns the full `assessment_set` and orders rows by
set number, then assessment order — the modal preserves that order when
grouping, so no client-side sorting is needed.

### 3. UI — `apps/prairielearn/src/pages/instructorQuestions/components/AddToAssessmentModal.tsx`

- Course-instance dropdown unchanged.
- Replace the assessment `<select>` (the zone select is already gone) with a
  grouped checkbox list:
  - Group the `listAssessments` rows by `set.id`, preserving query order.
  - Render one native `<details open>` per set. The `<summary>` shows the set
    badge (color background + `abbreviation` + `name`).
  - Inside each block, a Bootstrap `form-check` checkbox per assessment, labelled
    `${label}${title ? ": " + title : ""}`. Each checkbox has a unique `id` and a
    bound `<label htmlFor>`.
- State: `selectedAssessmentIds` as a `Set<string>` via `useState`. Reset it when
  the course instance changes (same place `setAssessmentId('')` used to run).
- `canSubmit = selectedAssessmentIds.size > 0`.
- Submit button label: "Add to {n} {assessment|assessments}".
- On the mutation `onSuccess`, build the message from the returned results,
  summarizing by assessment count, e.g. `Added selected questions to 3
  assessments.` When any assessment skipped questions it already had, append
  `Some questions were already present in one or more assessments.` Then
  invalidate the questions list, `clearSelection()`, and `onHide()`.
- Modal title becomes plural: "Add selected questions to assessments".

The mutation `onSuccess` no longer needs `effectiveAssessmentId`; the label is
derived from `results` joined against the `assessments` list when useful.

### 4. Tests — `apps/prairielearn/src/tests/e2e/bulkQuestions.e2e.spec.ts`

- Update the existing add flow: instead of `selectOption` on the Assessment
  dropdown, check the target assessment's checkbox inside its set's `<details>`
  block, then submit. Assertions on the appended new zone are unchanged.
- Add a case that creates two bulk-target assessments, checks both, submits once,
  and verifies each `infoAssessment.json` gained a new zone with the selected
  questions — exercising the single-sync multi-assessment path.

## Error handling

- Invalid course instance / assessment / question ids: existing `BAD_REQUEST`
  paths (`assertCourseInstanceBelongsToCourse`, `selectAssessmentForEdit`,
  `selectQuestionsForMutation`) are reused per assessment.
- Sync failure: single `SYNC_JOB_FAILED` app error surfaced via the existing
  `BulkQuestionErrorAlert`, linking to the job sequence. Because the write is
  atomic, there is no partial-success state to represent.
- Empty effective change (everything already present): success with zero totals
  and a clear message; no job is run.

## Out of scope

- Adding across multiple course instances at once.
- Choosing the target zone or zone title (added questions always go to a new
  untitled trailing zone).
- Any "select all" / bulk-toggle affordance on the checkbox list.

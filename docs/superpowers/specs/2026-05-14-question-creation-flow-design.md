# Question Creation Flow Design

## Context

GitHub issue: PrairieLearn/PrairieLearn#14057, "Improve question creation flow".

The current question creation experience splits normal question creation from AI-generated draft
questions. The intended end-state is a single flow where every new question begins as a draft,
regardless of whether it starts from a PrairieLearn template, a course template, an empty scratch
question, or AI assistance.

Related issue #14055 defines the improved template presentation that this flow should use:
grouped templates, clearer fixed/randomized/advanced categories, README-backed descriptions, and
evocative previews for basic templates.

Issue #13936 is intentionally out of scope except for preserving the future extension point: users
do not need to choose a title or QID until finalizing the draft.

## Goals

- Move the "Create question" action into the Questions page card/table header.
- Route "Create question" to a dedicated creation page.
- Let instructors choose a PrairieLearn template, course template, or scratch starting point.
- Always create a draft question first.
- Redirect every starting point into the same draft editor.
- Show draft questions in the existing Questions table, not in a separate draft list.
- Require title and QID only when the user finalizes the question.
- Retire the separate AI drafts page as a primary workflow.
- Keep AI chat optional and feature-gated inside the generalized draft editor.

## Non-Goals

- Do not implement AI-generated title or QID suggestions as part of this work.
- Do not convert the Questions page or Questions table wholesale to React.
- Do not change assessment selection semantics to allow draft questions.
- Do not redesign public question, sharing, preview, or finalized file-editing behavior.

## Product Flow

The Questions page is the entry point for both finalized and draft questions. The page continues to
render one table. Draft rows are visually identifiable and filterable in that table.

Selecting "Create question" opens a creation page. The creation page presents:

- PrairieLearn templates from the example course.
- Course templates from questions whose QID starts with `template/`.
- A scratch option.

The create page does not ask for a title or QID. Submitting the choice creates a draft question at
`questions/__drafts__/draft_N`, optionally seeded from the selected template, then redirects to the
draft editor.

Scratch drafts open in the draft editor with `question.html` selected and ready to edit. If AI
question generation is available, the editor also shows a prominent AI CTA in the chat/sidebar area.
Template drafts open with copied template contents ready for preview, editing, and optional AI
revision.

Finalization is the only point where title and QID are required. Finalizing validates the title and
QID, renames the draft out of `__drafts__`, updates `info.json`, clears draft status, and redirects
to the normal question preview.

## Architecture

The implementation should keep three boundaries clear.

### Draft-Aware Questions Table

The model backing the Questions table should return draft and non-draft questions for instructor
course-admin pages. Draft rows need enough data for the existing bootstrap-table formatters to show
status, placeholders, and a "Continue editing" action.

The Questions table can remain server-rendered HTML plus bootstrap-table JavaScript. It should gain
a status field or formatter value so drafts can be identified and filtered without a React rewrite.

Draft questions must remain excluded from assessment use, public sharing, and other finalized-only
flows. Any shared model changes should be scoped so public question queries continue to exclude
drafts.

### Draft Creation

The creation page is already a hydrated React island. It should use PrairieLearn's tRPC conventions
for the create action instead of an Express form POST.

The `CreateQuestionForm` component should be wrapped with the appropriate tRPC provider and
`QueryClientProviderDebug`. The component calls a mutation such as `questions.createDraft` with:

```ts
{
  startFrom: 'example' | 'course' | 'empty';
  templateQid?: string;
}
```

The tRPC procedure validates permissions, course mutability, `startFrom`, and `templateQid`. It then
uses the existing course-files/editor backend path with `is_draft: true`. The current
`QuestionAddEditor` already has the important draft and template-copy concepts, so this design
should extend that path rather than introduce a second writer.

The mutation returns either:

- `{ questionId, editorUrl }` on success, or
- a typed app error containing the edit-error/job identifier when the editor job fails.

The client redirects to `editorUrl` on success. On editor failure, it renders an `AppErrorAlert`
with a link to the edit-error or job page.

Because the create page is reachable under both course and course-instance URL prefixes, the tRPC
wiring should follow existing PrairieLearn scope conventions rather than creating a per-page router.
Use the course scope for course URLs and the course-instance scope only where course-instance locals
are required.

### Generalized Draft Editor

The existing AI draft editor should become the generalized draft editor. Conceptually, it should no
longer be AI-only. It should support:

- File editing.
- Preview.
- Finalization.
- AI chat and AI actions only when enterprise licensing and feature flags allow them.

The route should move toward a neutral URL such as `/question/:question_id/draft` or another
question-scoped draft URL. Existing AI draft editor URLs should redirect or thin-wrap into the new
route for compatibility.

Finalization should use an explicit backend operation if the existing generic rename operation does
not reliably clear `questions.draft`. The finalization path is responsible for both the filesystem
rename and the transition from draft to finalized question.

## Error Handling

Creation input errors return typed tRPC errors:

- Invalid `startFrom`.
- Missing `templateQid` for template starts.
- Template QID supplied for scratch starts.
- Missing edit permission.
- Example course or unavailable course path.

Editor and filesystem failures continue to use the existing server-job/edit-error mechanism. The
tRPC procedure should expose the relevant job or edit-error link through a typed app error so the
React client can show a useful recovery path.

Finalization validates title and QID with the same short-name rules used elsewhere. Invalid values
should fail before running the editor job. Filesystem or sync failures should surface through the
same edit-error pattern.

## Compatibility

- Existing AI-created drafts continue to open in the generalized draft editor.
- Existing `/ai_generate_question_drafts` URLs should redirect or thin-wrap to the new flow during
  rollout.
- Drafts without `draft_question_metadata` still appear in the Questions table.
- Finalized questions keep existing preview, file editing, assessment, sharing, and public behavior.
- Draft questions remain unusable in assessments.

## Testing

Add focused coverage for the new behavior:

- tRPC integration tests for creating scratch, example-template, and course-template drafts.
- tRPC or route integration tests for invalid creation inputs and editor job failures.
- Integration tests for finalizing a draft, including moving out of `__drafts__`, clearing draft
  status, preserving expected file contents, and redirecting to preview.
- Questions table tests for mixed draft and finalized rows.
- Compatibility tests for old AI draft URLs.
- UI or e2e coverage for the create page mutation path and generalized draft editor with AI
  disabled. Add AI-enabled coverage only where the feature-flag setup is practical.

## Implementation Notes

- Use tRPC for the interactive create action. Do not convert the Questions table/page to React just
  to support this.
- Keep the improved template gallery from issue #14055 as the create page's template selector.
- Prefer existing model functions and editor abstractions over one-off SQL or filesystem writes.
- Keep draft metadata optional in UI queries.
- Treat title/QID selection as a finalization concern, not a creation concern.

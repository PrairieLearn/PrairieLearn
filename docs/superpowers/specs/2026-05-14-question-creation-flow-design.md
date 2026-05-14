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
- Use one primary "Create question" action instead of separate manual and AI creation entry points.
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
- Do not add per-draft deletion to the Questions table; that belongs with a future React/tRPC table
  conversion.
- Do not change assessment selection semantics to allow draft questions.
- Do not redesign public question, sharing, preview, or finalized file-editing behavior.

## Product Flow

The Questions page is the entry point for both finalized and draft questions. The page continues to
render one table. Draft rows are shown by default, visually identifiable, and filterable in that
table. The page should expose one primary "Create question" action; AI assistance should not remain
a separate top-level creation path.

Selecting "Create question" opens a creation page. The creation page presents:

- PrairieLearn templates from the example course.
- Course templates from finalized questions whose QID starts with `template/`.
- A scratch option.

The create page should not include a separate AI starting point. AI assistance appears after a
scratch or template draft has been created and opened in the Draft editor.

The create page does not ask for a title or QID. Submitting the choice creates a draft question at
`questions/__drafts__/draft_N`, optionally seeded from the selected template, then redirects to the
draft editor.

Scratch drafts open in the draft editor with `question.html` selected and ready to edit. If AI
question generation is available, an empty scratch draft should show a prominent CTA to create with
AI or begin editing `question.html`. Template drafts open with copied template contents ready for
preview, editing, and optional AI revision; they should not show the scratch empty-state CTA.
Scratch drafts should keep the current empty-question file shape for this issue, including
`question.html` and `server.py`, while focusing the editor on `question.html` first.

Finalization is the only point where title and QID are required. Finalizing validates the title and
QID, renames the draft out of `__drafts__`, updates `info.json`, clears draft status, and redirects
to the normal question preview.

Draft title and QID are not edited as a separate early step in this design. The Draft editor should
show a friendly draft label and collect the final title/QID only through the Finalize action.

## Architecture

The implementation should keep three boundaries clear.

### Draft-Aware Questions Table

The model backing the Questions table should return draft and non-draft questions for instructor
course-admin pages. Draft rows need enough data for the existing bootstrap-table formatters to show
status, placeholders, and a "Continue editing" action.

The Questions table can remain server-rendered HTML plus bootstrap-table JavaScript. It should gain
a status field or formatter value so drafts can be identified and filtered without a React rewrite.
Draft rows should not present the `__drafts__/...` storage path as a normal user-facing QID. They
should show a friendly draft label such as "Draft #N" and link to `/question/:question_id/draft`.
The table should include a visible Status column with values such as "Draft" and "Finalized".
It should not add draft creator or created-time columns in this issue.
Draft rows should continue to surface sync errors and warnings.

Draft questions must remain excluded from assessment use, public sharing, source sharing, sharing
sets, cross-course copy/import flows, and other finalized-only flows. Draft-row UI should hide or
disable those controls, and server-side operations should continue to reject draft questions. Any
shared model changes should be scoped so public question queries continue to exclude drafts.

Course-template selection must also exclude draft questions. A draft should not become a selectable
template source, even if its path contains a `template/` segment.

When creating a draft from a template, preserve pedagogical metadata that is useful as a starting
point where it maps cleanly to the target course. Course templates should preserve topic and tags.
PrairieLearn example templates should preserve the topic only if it maps to an existing target-course
topic, otherwise use `Default`; they should preserve tags only when matching tags already exist in
the target course. Draft creation should not create new course topics or tags. Reset identity and
publication metadata: assign a new UUID, drop sharing/public flags, and omit template README files
where the current template-copy behavior omits them. The final title and QID are still collected
only during finalization.

### Draft Creation

The creation page is already a hydrated React island. It should use PrairieLearn's tRPC conventions
for the create action instead of an Express form POST.

The `CreateQuestionForm` component should be wrapped with the course tRPC provider and
`QueryClientProviderDebug`. The component calls a course-scoped mutation such as
`questions.createDraft` with:

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

The new creation flow should create `draft_question_metadata` for every new Draft question,
regardless of whether AI is used. Readers should still treat metadata as optional because synced,
legacy, or manually created drafts may not have a metadata row.

Creation metadata should be reliable. Update metadata should be best-effort in this issue: update
`updated_by` and the update timestamp when the Draft editor already has a natural save hook, but do
not require perfect update tracking across every existing file, preview, or AI endpoint before
shipping the flow.

The mutation returns either:

- `{ questionId, editorUrl }` on success, or
- a typed app error containing the edit-error/job identifier when the editor job fails.

The client redirects to `editorUrl` on success. On editor failure, it renders an `AppErrorAlert`
with a link to the edit-error or job page.

Because creating a draft question mutates course-owned data and does not require a course instance,
the canonical tRPC mutation should live in the course scope. Course-instance create pages should call
the course-scoped mutation using the course ID, while keeping their own navigation context. Add a
course-instance wrapper only if the client/CSRF plumbing makes direct course-scope calls impractical.

Draft creation should remain available from both course and course-instance course-admin URLs. The
draft belongs to the course in both cases; a course-instance URL only supplies navigation and access
context.

### Generalized Draft Editor

The existing AI draft editor should become the generalized draft editor. Conceptually, it should no
longer be AI-only. The core draft editor must live in the non-EE application so scratch and
template-based draft creation works for all PrairieLearn installs. It should support:

- File editing.
- Preview.
- Finalization.
- AI chat and AI actions only when enterprise licensing and feature flags allow them.

The Draft editor shell should be consistent for scratch and template drafts. Only empty-state
content should differ: scratch drafts can emphasize AI/manual starting actions, while template
drafts should show the seeded files and preview immediately.

When AI assistance is disabled or unavailable, the Draft editor should not reserve an empty chat
pane. It should use the available width for files and preview, with scratch empty-state guidance
inside the editor workspace.

The canonical route should be question-scoped: `/question/:question_id/draft`. Existing AI draft
editor URLs should redirect or thin-wrap into the new route for compatibility.
If this route is requested for a finalized Question, it should redirect to the normal question
preview.

Normal finalized-question routes such as preview, settings, and file edit should not become the
primary interface for draft questions. If an instructor navigates to a finalized-question route for
a draft, the route should redirect to `/question/:question_id/draft`, except for internal rendering
or file endpoints that the Draft editor needs to function.

Drafts with sync errors should still open in the Draft editor so users can fix them, but
finalization should be blocked while sync errors remain.

Preview should work for Draft questions when their files are valid, using the existing draft preview
mechanics from the AI draft editor. Empty scratch drafts should show an intentional empty state
rather than an unexplained blank preview.

Finalization should use an explicit backend operation rather than exposing generic rename as the
draft-completion API. The finalization path must enforce that the input question is currently a
draft, reject final QIDs that remain in `__drafts__`, and perform both the filesystem rename and the
transition from draft to finalized question. Draft status in the database is derived during sync
from whether the question remains in `__drafts__`; create/finalize operations should not treat
`questions.draft` as an independently mutable source of truth. The finalization operation may reuse
lower-level rename/editor helpers internally, but callers should invoke a domain-specific finalize
operation.

Finalization should delete the associated `draft_question_metadata` row. After finalization, the
question is a normal Question; draft metadata should not remain as a hidden subtype marker.

Finalization should reject QID/path conflicts instead of silently auto-suffixing the chosen QID.
The user should see and confirm the final identifier that will be created. Duplicate titles may be
allowed if they are otherwise valid in PrairieLearn, but QID conflicts must be validation errors.
Final QIDs under `template/` are valid when they pass normal QID validation and do not conflict; the
finalization flow should reject only the draft namespace, not the course-template namespace.

The finalize mutation should live beside creation in the course tRPC scope, for example
`questions.finalizeDraft`. The Draft editor can remain question-scoped in its URL while using the
course-scoped tRPC client for mutations.

This design does not require converting every Draft editor endpoint to tRPC. File loading/saving,
preview rendering, variant generation, and AI chat streaming may keep their existing HTTP/stream
endpoints for this issue unless they must move to support the non-EE Draft editor split.

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
- Existing `/ai_generate_question_drafts` URLs should redirect to the Questions table. The old AI
  drafts page should not remain as a separate draft management surface.
- Existing `/ai_generate_editor/:question_id` URLs should redirect to `/question/:question_id/draft`
  while the question is a Draft question and to `/question/:question_id/preview` after
  finalization. Missing or deleted questions should keep behavior consistent with the current draft
  not-found handling.
- The old top-level AI generation entry point should no longer be part of the primary Questions
  page workflow. If an AI fast path is preserved, it should still create/open a draft in the
  generalized Draft editor.
- Per-draft deletion is intentionally out of scope until the Questions table is converted to
  React/tRPC. The new primary flow should not expose "Delete all drafts".
- Drafts without `draft_question_metadata` still appear in the Questions table.
- Draft questions created outside the UI, such as synced course files under `__drafts__/`, should
  appear in the Questions table, open in the Draft editor, and be finalizable.
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
- Keep the Draft editor core outside EE; only AI-specific chat/actions remain enterprise-gated.
- Keep the improved template gallery from issue #14055 as the create page's template selector.
- Prefer existing model functions and editor abstractions over one-off SQL or filesystem writes.
- Keep draft metadata optional in UI queries.
- Treat title/QID selection as a finalization concern, not a creation concern.
- Model finalization as a distinct operation, even if it reuses rename mechanics internally.
- Treat `questions.draft` as a synced/materialized flag derived from the draft namespace.

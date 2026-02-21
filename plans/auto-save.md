# Auto-Save Student Answers (Issue #3358)

## Context

Students lose work when browsers crash, network drops, or exam timers expire before they click "Save". This is a long-standing pain point, especially for essay-style questions. The solution: silently back up form data in the background to a new `pending_submissions` table. This is purely a safety net — students still must explicitly click "Save" or "Save & Grade" for their work to count. If a draft is detected on page load, we show a restore banner.

This plan implements **Option 1** from nwalters512's proposal: server-side persistence with a single pending submission per variant (UNIQUE on `variant_id`), no delta saving, and no automatic promotion to real submissions.

## Terminology

Student-facing copy uses **"draft"** consistently to distinguish from "save" (which creates a real submission). The internal table/code uses `pending_submissions` since that's more precise.

- "Draft saved" — the brief indicator shown after a successful background save
- "Save" / "Save & Grade" — the explicit student action that creates a real submission
- "Restore draft" / "Discard" — the actions on the restore banner

The word "auto-save" is avoided in student-facing UI to prevent students from thinking their work is submitted. The `beforeunload` "unsaved changes" warning is kept as-is — a draft is not a substitute for the warning.

## Step 1: Database migration + schema

**Create** `apps/prairielearn/src/migrations/{TIMESTAMP}_pending_submissions__create.sql`:
```sql
CREATE TABLE IF NOT EXISTS pending_submissions (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    raw_submitted_answer JSONB NOT NULL,
    credit INTEGER,
    date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (variant_id)
);
CREATE INDEX pending_submissions_date_idx ON pending_submissions (date);
```

The `credit` column captures the student's credit percentage at the time the draft was saved. This is needed for the future instructor "commit draft" flow, where the credit value at draft time may differ from the credit at commit time.

**Create** `database/tables/pending_submissions.pg` (table description).

**Modify** `apps/prairielearn/src/lib/db-types.ts`:
- Add `PendingSubmissionSchema` Zod type (with `credit` as `z.number().nullable()`)
- Add `'pending_submissions'` to the `TableNames` array

## Step 2: Model functions

**Create** `apps/prairielearn/src/models/pending-submission.ts` and `.sql`:
- `upsertPendingSubmission({ variant_id, user_id, raw_submitted_answer, credit })` — `INSERT ... ON CONFLICT (variant_id) DO UPDATE`
- `selectPendingSubmission({ variant_id })` — returns the pending submission or null
- `deletePendingSubmission({ variant_id })` — deletes the pending submission for a variant
- `deleteOldPendingSubmissions({ max_age_sec })` — prunes rows older than threshold
- `countPendingSubmissionsByAssessmentQuestion({ assessment_question_id })` — returns count of drafts for a given assessment question (for instructor awareness)

## Step 3: Auto-save AJAX endpoint

**Modify** `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`:

Add `router.post('/auto_save', ...)` that:
1. Checks `question.type === 'Freeform'` (v2 legacy questions not supported)
2. Checks `authorized_edit`, `assessment_instance.open`, `instance_question.open`, `authz_result.active`
3. Validates the variant exists, belongs to this instance question, and is open
4. Extracts `submitted_answer` from `req.body` (same stripping of `__action`, `__csrf_token`, `__variant_id` as `processSubmission`)
5. Calls `upsertPendingSubmission()` with `credit` from `res.locals.authz_result.credit`
6. Returns `res.json({ status: 'ok' })`

Auth checks fail with JSON `{ error: '...' }` responses (not HTML error pages).

**Add SQL** to `studentInstanceQuestion.sql`: a query to validate the variant is open and belongs to the instance question.

**CSRF handling**: Generate a prefix CSRF token in the GET handler (using `generatePrefixCsrfToken` from `@prairielearn/signed-token`) so it covers both the main POST URL and the `/auto_save` sub-path. Pass it to the client via `EncodedData`.

## Step 4: Cleanup on real submission

**Modify** `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`:

After `validateAndProcessSubmission()` succeeds for `grade`/`save` actions (line ~213), call `deletePendingSubmission({ variant_id })` to clear any draft for that variant. This ensures the draft doesn't linger after a real save.

## Step 5: Restore flow

### Server-side (GET handler)

**Modify** the GET handler in `studentInstanceQuestion.ts` (line ~341, after `getAndRenderVariant`):
1. If the variant exists, is Freeform, assessment is open, and user is authorized to edit: call `selectPendingSubmission({ variant_id })`
2. Only show it if the pending submission's `user_id` matches `res.locals.user.id` and it's newer than the latest real submission (or there is no real submission)
3. Pass `pendingSubmission` and `autoSaveCsrfToken` to the template

### Server-side (POST handler)

Add two new `__action` cases:
- `restore_pending_submission`: Load the pending submission, reconstruct `req.body` from its `raw_submitted_answer`, call `validateAndProcessSubmission()` to create a real "save" submission, then delete the pending submission and redirect
- `dismiss_pending_submission`: Delete the pending submission and redirect

### Template

**Modify** `studentInstanceQuestion.html.ts`:
- Add a restore banner (Bootstrap `alert-info`) above the question container when `pendingSubmission` is present:
  > A draft of your previous work was found from 5 minutes ago. This draft was not submitted. [Restore draft] [Discard]
- Add `EncodedData` block with `auto-save-data` ID containing `{ variantId, csrfToken, autoSaveUrl }` (only when the variant is open and auto-save is applicable)

## Step 6: Client-side auto-save

**Create** `apps/prairielearn/assets/scripts/lib/autoSave.ts`:

Core behavior:
- **Change detection**: Listen to `input` and `change` events on the form. Also use `MutationObserver` on hidden input `value` attributes (for elements like `pl-rich-text-editor` and `pl-file-editor` that write to hidden inputs programmatically)
- **Debounce**: Wait 10 seconds after the last change before sending (aligns with nwalters512's proposal)
- **Max interval**: Force a save at least every 60 seconds if there are unsaved changes
- **Diff check**: Serialize form data (same approach as `confirmOnUnload.ts`) and compare to last successfully saved snapshot. Only POST if different
- **AJAX POST**: Send JSON to the `/auto_save` endpoint with `__variant_id` and `__csrf_token` in the body. Set `Content-Type: application/json` and `X-CSRF-Token` header
- **Status indicator**: After a successful draft save, briefly show "Draft saved" in muted text near the Save/Grade buttons. Fade after ~2 seconds. On error, show nothing (the `beforeunload` warning remains as the user-facing backstop)
- **`beforeunload`**: Attempt a final save using `navigator.sendBeacon()` with the CSRF token in the JSON body
- **No aggressive retry**: On error, just wait for the next change/interval. Don't retry in a loop
- Returns a cleanup function to teardown listeners/timers

**Modify** `apps/prairielearn/assets/scripts/question.ts`:
- In the `observe('.question-container form.question-form', ...)` block (~line 59), decode `auto-save-data` and call `startAutoSave()` if present
- Clean up on element removal

## Step 7: Instructor awareness in manual grading

**Modify** `apps/prairielearn/src/pages/instructorAssessmentManualGrading/assessmentQuestion/queries.sql`:

Add a query (or extend the existing `select_instance_questions_manual_grading`) to count instance questions that have a pending submission but no real submission (i.e., `iq.status = 'unanswered'` AND a matching row in `pending_submissions`). This is a `LEFT JOIN` count, separate from the main grading queue.

**Modify** the assessment question manual grading page template/component:

Show a small informational note when the count is > 0:
> N student(s) have unsubmitted drafts for this question.

This is awareness only — no commit functionality in the initial implementation. It tells instructors "there's data here" so they can follow up with students or plan for the future commit feature.

## Step 8: Cron job for cleanup

**Create** `apps/prairielearn/src/cron/cleanPendingSubmissions.ts`:
- Deletes pending submissions older than 7 days via `deleteOldPendingSubmissions()`

**Modify** `apps/prairielearn/src/cron/index.ts`:
- Register the job with a 1-hour interval (matching existing patterns like `cleanTimeSeries`)

## Key files summary

| Action | File |
|--------|------|
| Create | `apps/prairielearn/src/migrations/{TS}_pending_submissions__create.sql` |
| Create | `database/tables/pending_submissions.pg` |
| Create | `apps/prairielearn/src/models/pending-submission.ts` |
| Create | `apps/prairielearn/src/models/pending-submission.sql` |
| Create | `apps/prairielearn/assets/scripts/lib/autoSave.ts` |
| Create | `apps/prairielearn/src/cron/cleanPendingSubmissions.ts` |
| Modify | `apps/prairielearn/src/lib/db-types.ts` |
| Modify | `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts` |
| Modify | `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.sql` |
| Modify | `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.html.ts` |
| Modify | `apps/prairielearn/assets/scripts/question.ts` |
| Modify | `apps/prairielearn/src/cron/index.ts` |
| Modify | `apps/prairielearn/src/pages/instructorAssessmentManualGrading/assessmentQuestion/queries.sql` |
| Modify | Assessment question manual grading page template/component (draft count indicator) |

## Design decisions

- **Only Freeform (v3) questions**: Legacy v2 questions use a different form serialization path; not worth supporting
- **Single pending submission per variant**: UNIQUE constraint, last write wins. No history
- **No `parse()` on auto-save**: Just store raw form data. `parse()` runs only on restore (which creates a real submission)
- **No automatic promotion**: Pending submissions are never auto-promoted to real submissions. Restore is always an explicit user action
- **"Draft" terminology**: Student-facing copy uses "draft" to clearly distinguish from "save" (which creates a real submission). Avoids "auto-save" to prevent students from thinking their work is submitted
- **Preserve `beforeunload` warning**: The unsaved changes dialog is kept as-is. A draft is a safety net, not a replacement for the warning
- **Store `credit`**: The `credit` column captures the student's credit at draft time, for future use when instructors commit drafts
- **Cleanup on real save**: `deletePendingSubmission()` after any successful save/grade
- **`sendBeacon` on unload**: Best-effort, may fail. Not the primary save mechanism
- **Instructor awareness without commit**: Show draft counts on the manual grading page so instructors know data exists, but defer the "commit draft as submission" functionality to a follow-up

## Interaction with existing features

### Workspaces

Workspace questions use the same Save/Grade form buttons as regular questions. The key difference is that workspace file content (e.g., code files edited in VS Code or Jupyter) lives on the server-side workspace container filesystem, **not** in the HTML form. Files are fetched from the container inside `saveSubmission()` (`grading.ts:198-241`) and injected into `submitted_answer._files` — the form POST itself carries no workspace file data.

**Implications for auto-save:**
- Auto-save captures **form field state only** (hidden inputs from `pl-string-input`, `pl-rich-text-editor`, etc.), not workspace files. This is fine — workspace files are already persisted server-side on the container's filesystem.
- For a "pure workspace" question (where the only element is `pl-workspace`), the form may contain no meaningful data to auto-save. Auto-save will harmlessly detect no changes and not send requests.
- For a "mixed" question (workspace + other elements like `pl-string-input`), auto-save captures the non-workspace form fields.
- When a draft is **restored**, the restore goes through `processSubmission()` → `saveSubmission()`, which fetches workspace files at that point (same as a normal save). So the restored submission gets up-to-date workspace files.
- No workspace-specific code changes are needed.

### AI grading

AI grading is an enterprise feature, completely separate from the submission lifecycle. It is **manually triggered by instructors** from the manual grading UI, never automatic. It operates on existing real submissions — it renders the question/submission HTML and sends it to an LLM.

**Implications for auto-save:**
- Drafts are **not real submissions** — they exist in a separate `pending_submissions` table and do not create `submissions` rows, `grading_jobs`, or change `instance_questions.status`. AI grading queries only look at real submissions, so drafts are completely invisible to it.
- If a draft is **restored** (promoted to a real submission), it becomes a normal submission and is then available for AI grading like any other.
- No AI-grading-specific code changes are needed.
- **Future enhancement**: When the instructor "commit draft" feature is built, committed drafts become real submissions that can be AI-graded. The instructor could commit a batch of drafts, then run AI grading on them.

### Manual grading workflow

The manual grading UI has three levels, each with specific filters that determine visibility:

1. **Assessment level** (`assessment/`): Lists questions with counts of instance questions needing grading. Filters on `iq.status != 'unanswered'`.
2. **Assessment question level** (`assessmentQuestion/`): Lists all students' instance questions for a question. Filters on `iq.status != 'unanswered'`.
3. **Instance question level** (`instanceQuestion/`): Shows a specific student's submission for grading. Requires at least one real submission to exist (`JOIN submissions` in `select_variant_with_last_submission`). Throws 404 if no submission found.

The "next ungraded" navigation also requires `EXISTS (SELECT 1 FROM variants JOIN submissions WHERE ...)`.

**Implications for auto-save:**
- Drafts do **not** create real `submissions` rows or change `iq.status` from `'unanswered'`. Therefore, drafts do **not** appear in the grading queue. An instance question with only a draft (no real save) will not appear in any manual grading view.
- **Initial implementation**: The assessment question level page shows an informational count of students with unsubmitted drafts. This gives instructors awareness without polluting the grading queue.
- **Future enhancement** (not part of this work): Add a "commit draft as submission" action. This would require either a separate "unsubmitted drafts" section (preferred, keeps the grading queue clean) or extending the existing queries. When an instructor commits a draft, `processSubmission()` runs to create a real submission, which then enters the normal grading flow (manual, AI, or auto). The `credit` stored in the draft would be used to determine the credit value for the committed submission.

## Edge cases

- **Multiple tabs**: Last writer wins via UNIQUE upsert. Acceptable
- **Expired assessment**: Auth checks return 403 JSON; client stops trying
- **Network down**: Client retries on next change/interval. No aggressive retry loop
- **Team assessments**: Auto-save uses `res.locals.user.id`; group role permissions are NOT checked for auto-save (only for restore, which goes through `validateAndProcessSubmission`)
- **`beforeunload` CSRF**: Include `__csrf_token` in JSON body since `sendBeacon` can't set headers. The CSRF middleware checks `req.body.__csrf_token` as fallback
- **Student complacency**: Mitigated by using "draft" terminology (not "auto-save"), keeping the indicator subtle (muted text, brief fade), and preserving the `beforeunload` unsaved-changes warning

## Verification

1. **Migration**: Run `make build` to apply migration, then `make update-database-description`
2. **Manual testing**: Start dev server (`make dev`), open a Freeform question, type an answer, wait 10s, check that `/auto_save` was called via browser DevTools Network tab. Verify "Draft saved" indicator appears briefly. Reload the page — verify restore banner appears with correct copy. Click "Restore draft" — verify a real submission is created
3. **Discard**: Click "Discard" — verify banner disappears on reload
4. **Real save clears draft**: Type, wait for draft save, then click "Save" — verify draft is deleted (no banner on reload)
5. **Closed assessment**: Close the assessment instance, verify auto-save stops (403 responses)
6. **Instructor awareness**: Navigate to the manual grading assessment question page, verify draft count indicator appears when students have unsubmitted drafts
7. **Integration tests**: Write tests for the `/auto_save` endpoint, restore/discard actions, draft count query, and cron cleanup

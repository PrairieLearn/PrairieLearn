# Auto-Save Student Answers (Issue #3358)

## Context

Students lose work when browsers crash, network drops, or exam timers expire before they click "Save". This is a long-standing pain point, especially for essay-style questions. The solution: silently auto-save form data in the background to a new `pending_submissions` table. This is purely a safety net — students still must explicitly click "Save" or "Save & Grade" for their work to count. If unsaved work is detected on page load, we show a restore banner.

This plan implements **Option 1** from nwalters512's proposal: server-side persistence with a single pending submission per variant (UNIQUE on `variant_id`), no delta saving, and no automatic promotion to real submissions. Instructor visibility into pending submissions is deferred to a follow-up.

## Step 1: Database migration + schema

**Create** `apps/prairielearn/src/migrations/{TIMESTAMP}_pending_submissions__create.sql`:
```sql
CREATE TABLE IF NOT EXISTS pending_submissions (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    raw_submitted_answer JSONB NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (variant_id)
);
CREATE INDEX pending_submissions_date_idx ON pending_submissions (date);
```

**Create** `database/tables/pending_submissions.pg` (table description).

**Modify** `apps/prairielearn/src/lib/db-types.ts`:
- Add `PendingSubmissionSchema` Zod type
- Add `'pending_submissions'` to the `TableNames` array

## Step 2: Model functions

**Create** `apps/prairielearn/src/models/pending-submission.ts` and `.sql`:
- `upsertPendingSubmission({ variant_id, user_id, raw_submitted_answer })` — `INSERT ... ON CONFLICT (variant_id) DO UPDATE`
- `selectPendingSubmission({ variant_id })` — returns the pending submission or null
- `deletePendingSubmission({ variant_id })` — deletes the pending submission for a variant
- `deleteOldPendingSubmissions({ max_age_sec })` — prunes rows older than threshold

## Step 3: Auto-save AJAX endpoint

**Modify** `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`:

Add `router.post('/auto_save', ...)` that:
1. Checks `question.type === 'Freeform'` (v2 legacy questions not supported)
2. Checks `authorized_edit`, `assessment_instance.open`, `instance_question.open`, `authz_result.active`
3. Validates the variant exists, belongs to this instance question, and is open
4. Extracts `submitted_answer` from `req.body` (same stripping of `__action`, `__csrf_token`, `__variant_id` as `processSubmission`)
5. Calls `upsertPendingSubmission()`
6. Returns `res.json({ status: 'ok' })`

Auth checks fail with JSON `{ error: '...' }` responses (not HTML error pages).

**Add SQL** to `studentInstanceQuestion.sql`: a query to validate the variant is open and belongs to the instance question.

**CSRF handling**: Generate a prefix CSRF token in the GET handler (using `generatePrefixCsrfToken` from `@prairielearn/signed-token`) so it covers both the main POST URL and the `/auto_save` sub-path. Pass it to the client via `EncodedData`.

## Step 4: Cleanup on real submission

**Modify** `apps/prairielearn/src/pages/studentInstanceQuestion/studentInstanceQuestion.ts`:

After `validateAndProcessSubmission()` succeeds for `grade`/`save` actions (line ~213), call `deletePendingSubmission({ variant_id })` to clear any pending submission for that variant. This ensures the pending submission doesn't linger after a real save.

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
- Add a restore banner (Bootstrap `alert-info`) above the question container when `pendingSubmission` is present, with "Restore answers" and "Dismiss" buttons in small forms
- Add `EncodedData` block with `auto-save-data` ID containing `{ variantId, csrfToken, autoSaveUrl }` (only when the variant is open and auto-save is applicable)

## Step 6: Client-side auto-save

**Create** `apps/prairielearn/assets/scripts/lib/autoSave.ts`:

Core behavior:
- **Change detection**: Listen to `input` and `change` events on the form. Also use `MutationObserver` on hidden input `value` attributes (for elements like `pl-rich-text-editor` and `pl-file-editor` that write to hidden inputs programmatically)
- **Debounce**: Wait 10 seconds after the last change before sending (aligns with nwalters512's proposal)
- **Max interval**: Force a save at least every 60 seconds if there are unsaved changes
- **Diff check**: Serialize form data (same approach as `confirmOnUnload.ts`) and compare to last successfully saved snapshot. Only POST if different
- **AJAX POST**: Send JSON to the `/auto_save` endpoint with `__variant_id` and `__csrf_token` in the body. Set `Content-Type: application/json` and `X-CSRF-Token` header
- **Status callback**: `onStatusChange('saving' | 'saved' | 'error' | 'idle')` for optional UI indicator
- **`beforeunload`**: Attempt a final save using `navigator.sendBeacon()` with the CSRF token in the JSON body
- **No aggressive retry**: On error, just wait for the next change/interval. Don't retry in a loop
- Returns a cleanup function to teardown listeners/timers

**Modify** `apps/prairielearn/assets/scripts/question.ts`:
- In the `observe('.question-container form.question-form', ...)` block (~line 59), decode `auto-save-data` and call `startAutoSave()` if present
- Clean up on element removal

## Step 7: Cron job for cleanup

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

## Design decisions

- **Only Freeform (v3) questions**: Legacy v2 questions use a different form serialization path; not worth supporting
- **Single pending submission per variant**: UNIQUE constraint, last write wins. No history
- **No `parse()` on auto-save**: Just store raw form data. `parse()` runs only on restore (which creates a real submission)
- **No automatic promotion**: Pending submissions are never auto-promoted to real submissions. Restore is always an explicit user action
- **Instructor access deferred**: A follow-up could surface pending submissions in the manual grading UI
- **Cleanup on real save**: `deletePendingSubmission()` after any successful save/grade
- **`sendBeacon` on unload**: Best-effort, may fail. Not the primary save mechanism

## Interaction with existing features

### Workspaces

Workspace questions use the same Save/Grade form buttons as regular questions. The key difference is that workspace file content (e.g., code files edited in VS Code or Jupyter) lives on the server-side workspace container filesystem, **not** in the HTML form. Files are fetched from the container inside `saveSubmission()` (`grading.ts:198-241`) and injected into `submitted_answer._files` — the form POST itself carries no workspace file data.

**Implications for auto-save:**
- Auto-save captures **form field state only** (hidden inputs from `pl-string-input`, `pl-rich-text-editor`, etc.), not workspace files. This is fine — workspace files are already persisted server-side on the container's filesystem.
- For a "pure workspace" question (where the only element is `pl-workspace`), the form may contain no meaningful data to auto-save. Auto-save will harmlessly detect no changes and not send requests.
- For a "mixed" question (workspace + other elements like `pl-string-input`), auto-save captures the non-workspace form fields.
- When a pending submission is **restored**, the restore goes through `processSubmission()` → `saveSubmission()`, which fetches workspace files at that point (same as a normal save). So the restored submission gets up-to-date workspace files.
- No workspace-specific code changes are needed.

### AI grading

AI grading is an enterprise feature, completely separate from the submission lifecycle. It is **manually triggered by instructors** from the manual grading UI, never automatic. It operates on existing real submissions — it renders the question/submission HTML and sends it to an LLM.

**Implications for auto-save:**
- Pending submissions are **not real submissions** — they exist in a separate `pending_submissions` table and do not create `submissions` rows, `grading_jobs`, or change `instance_questions.status`. AI grading queries only look at real submissions, so pending submissions are completely invisible to it.
- If a pending submission is **restored** (promoted to a real submission), it becomes a normal submission and is then available for AI grading like any other.
- No AI-grading-specific code changes are needed.

### Manual grading workflow

The manual grading UI has three levels, each with specific filters that determine visibility:

1. **Assessment level** (`assessment/`): Lists questions with counts of instance questions needing grading. Filters on `iq.status != 'unanswered'`.
2. **Assessment question level** (`assessmentQuestion/`): Lists all students' instance questions for a question. Filters on `iq.status != 'unanswered'`.
3. **Instance question level** (`instanceQuestion/`): Shows a specific student's submission for grading. Requires at least one real submission to exist (`JOIN submissions` in `select_variant_with_last_submission`). Throws 404 if no submission found.

The "next ungraded" navigation also requires `EXISTS (SELECT 1 FROM variants JOIN submissions WHERE ...)`.

**Implications for auto-save:**
- Pending submissions do **not** create real `submissions` rows or change `iq.status` from `'unanswered'`. Therefore, pending submissions are **completely invisible** to the manual grading workflow. An instance question with only a pending submission (no real save) will not appear in any manual grading view.
- This is the intended behavior for the initial implementation. The norm is that students save their work; pending submissions are a safety net.
- **Future enhancement** (not part of this work): To let instructors see and "commit" pending submissions, the manual grading queries would need to be extended to include instance questions that have pending submissions even if `status = 'unanswered'`. The instance question grading view would need a "commit pending submission" action that runs `processSubmission()` to create a real submission, then allows normal grading. This would address the "student ran out of time without saving" scenario.

## Edge cases

- **Multiple tabs**: Last writer wins via UNIQUE upsert. Acceptable
- **Expired assessment**: Auth checks return 403 JSON; client stops trying
- **Network down**: Client retries on next change/interval. No aggressive retry loop
- **Team assessments**: Auto-save uses `res.locals.user.id`; group role permissions are NOT checked for auto-save (only for restore, which goes through `validateAndProcessSubmission`)
- **`beforeunload` CSRF**: Include `__csrf_token` in JSON body since `sendBeacon` can't set headers. The CSRF middleware checks `req.body.__csrf_token` as fallback

## Verification

1. **Migration**: Run `make build` to apply migration, then `make update-database-description`
2. **Manual testing**: Start dev server (`make dev`), open a Freeform question, type an answer, wait 10s, check that `/auto_save` was called via browser DevTools Network tab. Reload the page — verify restore banner appears. Click "Restore" — verify a real submission is created
3. **Dismiss**: Click "Dismiss" — verify banner disappears on reload
4. **Real save clears pending**: Type, wait for auto-save, then click "Save" — verify pending submission is deleted (no banner on reload)
5. **Closed assessment**: Close the assessment instance, verify auto-save stops (403 responses)
6. **Integration tests**: Write tests for the `/auto_save` endpoint, restore/dismiss actions, and cron cleanup

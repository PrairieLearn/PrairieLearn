# AI Draft Embedded File Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI draft editor's `All files` tab a parity-preserving embedded replacement for the existing question file browser.

**Architecture:** Keep `FileBrowser` as the shared renderer for directory listings and file actions. The AI draft editor supplies embedded URLs and action redirects, while `SelectedQuestionFileEditor` owns the inline Ace editing workflow for selected text files.

**Tech Stack:** TypeScript, React, React Bootstrap, Ace, Express, Vitest, PrairieLearn course-files API.

---

## File Structure

- Modify `apps/prairielearn/src/components/FileBrowser.tsx` so embedded consumers can override directory links and download URLs without losing existing actions.
- Modify `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.ts` to render the embedded browser for the current selected directory and to redirect successful file actions back into `tab=all-files`.
- Modify `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.ts` to centralize URL construction and path normalization for files and directories.
- Modify `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/components/QuestionAndFilePreview.tsx` to support embedded file-list navigation and selected-file editing without standalone navigation for normal text editing.
- Modify `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/components/SelectedQuestionFileEditor.tsx` to clean up save state, editor cleanup, and conflict redirects.
- Add focused tests beside `selectedQuestionFile.ts` for path validation and embedded URL construction.

## Tasks

### Task 1: Selected-File Path And URL Helpers

**Files:**

- Modify: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.ts`
- Test: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.test.ts`

- [x] **Step 1: Add failing tests**

Create tests that assert relative file paths are normalized, invalid paths throw `HttpStatusError`, and editor URLs preserve `tab=all-files` with encoded `file` and `dir` parameters.

- [x] **Step 2: Run tests**

Run: `yarn test apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.test.ts`

Expected: failures for missing URL helper behavior.

- [x] **Step 3: Implement helpers**

Add helpers for selected file URLs and embedded directory URLs. Keep validation strict: reject empty paths, backslashes, null bytes, absolute paths, and parent traversal.

- [x] **Step 4: Run tests**

Run: `yarn test apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.test.ts`

Expected: pass.

### Task 2: Embedded Browser Routing Parity

**Files:**

- Modify: `apps/prairielearn/src/components/FileBrowser.tsx`
- Modify: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.ts`

- [x] **Step 1: Extend browser options**

Allow embedded callers to override directory links and file download URLs while preserving default standalone behavior when options are absent.

- [x] **Step 2: Wire draft editor options**

Render the browser at the current embedded directory. Directory clicks should stay in the draft editor with `tab=all-files&dir=<path>`. Text-file edit clicks should stay in the draft editor with `tab=all-files&file=<path>`. Download links should keep using the existing file-download route.

- [x] **Step 3: Keep action redirects embedded**

Upload, rename, and delete forms should redirect back to `tab=all-files`, using the current embedded directory when appropriate.

### Task 3: Selected-File Editor Cleanup

**Files:**

- Modify: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/components/SelectedQuestionFileEditor.tsx`
- Modify: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/components/QuestionAndFilePreview.tsx`

- [x] **Step 1: Stabilize Ace lifecycle**

Destroy the Ace editor and its container cleanly on unmount. Reset the saved contents after successful saves by relying on refreshed props from the parent.

- [x] **Step 2: Make save state explicit**

Show `Saved.`, `Unsaved changes.`, `Saving...`, and concrete save errors. Redirect to the existing edit-error page when the server returns `editErrorUrl`.

- [x] **Step 3: Preserve escape hatch**

Keep a visible link to the standalone file browser for users who want the old full-page context.

### Task 4: Verification

**Files:**

- All changed TypeScript, React, Markdown files.

- [x] **Step 1: Run focused tests**

Run: `yarn test apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.test.ts`

- [x] **Step 2: Typecheck changed TypeScript files**

Run: `./scripts/typecheck-file.sh apps/prairielearn/src/components/FileBrowser.tsx apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.ts apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.ts apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/components/QuestionAndFilePreview.tsx apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/components/SelectedQuestionFileEditor.tsx`

- [x] **Step 3: Format changed files**

Run: `make format-changed`

- [x] **Step 4: Review diff**

Run: `git diff --stat origin/master...` and inspect the implementation diff for unrelated changes.

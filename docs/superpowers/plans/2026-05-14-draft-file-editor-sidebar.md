# Draft File Editor Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount draft-question file editing inside the draft editor route so the AI sidebar remains visible while editing files.

**Architecture:** Add a selected-file model to the draft editor page data. Server routes validate and load arbitrary non-binary files under the draft question directory, while React renders a single-file Ace editor inside the existing "All files" tab and posts saves back through the existing question-file update job.

**Tech Stack:** TypeScript, Express, React, Ace, Bootstrap, Vitest.

---

### Task 1: Server selected-file support

**Files:**

- Modify: `apps/prairielearn/src/pages/instructorQuestionDraft/instructorQuestionDraft.ts`
- Modify: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.ts`

- [ ] Add helper code that reads an optional `file` query parameter, rejects unsafe paths, rejects binary files, and returns `{ path, contents, aceMode }`.
- [ ] Pass `selectedFile` and `editorUrl` to both non-AI and AI draft editor render functions.
- [ ] Add `submit_file_revision` handling to both non-AI and AI draft editor POST handlers, saving `{ [filePath]: encodedContents }` through `updateQuestionFiles`.
- [ ] Redirect successful saves back to the editor URL with the same `file` query parameter.

### Task 2: React embedded file editor

**Files:**

- Create: `apps/prairielearn/src/pages/instructorQuestionDraftEditor/components/SelectedQuestionFileEditor.tsx`
- Modify: `apps/prairielearn/src/pages/instructorQuestionDraftEditor/components/DraftQuestionEditor.tsx`
- Modify: `apps/prairielearn/src/pages/instructorQuestionDraftEditor/components/QuestionAndFilePreview.tsx`
- Modify: `apps/prairielearn/src/pages/instructorQuestionDraftEditor/instructorQuestionDraftEditor.html.tsx`
- Modify: `apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.html.tsx`

- [ ] Define `SelectedQuestionFile` props shared by the draft editor components.
- [ ] Render an Ace single-file editor with saved/unsaved state, hidden base64 POST fields, and a "Back to all files" link.
- [ ] Make the "All files" tab active by default when `selectedFile` exists.
- [ ] Change file edit links to `editorUrl?file=<relative question file path>`.

### Task 3: Styles and verification

**Files:**

- Modify: `apps/prairielearn/assets/stylesheets/instructorQuestionDraftEditor.css`
- Modify or add focused tests under `apps/prairielearn/src/tests/`

- [ ] Add stable height/layout CSS for the selected-file editor pane.
- [ ] Add a focused test that draft "All files" edit links stay on the draft editor route.
- [ ] Run `yarn prettier --write` on changed TypeScript/Markdown/CSS files.
- [ ] Run `./scripts/typecheck-file.sh` for changed TypeScript files.
- [ ] Run the focused Vitest file covering draft editor output.

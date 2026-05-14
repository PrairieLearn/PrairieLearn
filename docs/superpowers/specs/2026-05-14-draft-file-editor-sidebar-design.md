# Draft File Editor Sidebar Design

## Goal

Let instructors edit draft-question files without leaving the draft editor page, so the AI question-generation sidebar remains visible while they inspect or change files from the "All files" tab.

## Scope

This applies only to draft questions. Existing non-draft file editor routes under `file_edit/*` remain unchanged for course, course instance, assessment, and finalized question files.

## Design

The draft editor accepts an optional selected file query parameter. When present, the server validates that the file is inside the current draft question directory, reads its contents, detects its Ace mode, and passes that data to the hydrated draft editor. The "All files" tab links point back to the draft editor route with this selected file instead of navigating to the standalone file editor page.

The React draft editor renders a single-file Ace editor inside the "All files" tab when a file is selected. The surrounding draft editor chrome, preview tabs, title/QID controls, finalization button, and AI sidebar all remain mounted. The selected-file editor posts back to the same draft editor route with a dedicated action, and the server saves the file through the existing question-file update job path.

The existing two-pane "Question" tab remains focused on the common `question.html` and `server.py` workflow. The embedded selected-file editor handles arbitrary non-binary files listed under the draft question directory.

## Error Handling

Invalid paths, directory traversal, directories, missing files, and binary files fail on the server before rendering or saving. Save job failures redirect to the existing edit error page. After a successful selected-file save, the user returns to the same draft editor route with the selected file still open.

## Testing

Add focused route-level test coverage that the draft editor renders "All files" edit links pointing to the draft editor route with a `file` query parameter, not to `/file_edit/*`. Typecheck the changed TypeScript files and run the relevant draft/file editor tests if local services are available.

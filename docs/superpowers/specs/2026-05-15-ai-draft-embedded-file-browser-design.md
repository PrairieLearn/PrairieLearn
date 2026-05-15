# AI Draft Embedded File Browser Design

## Goal

The AI draft editor's `All files` tab should replace the previous standalone file-browser workflow without losing functionality. Instructors must still be able to browse directories, view files, download files, edit text files, upload files, rename files, and delete files from the draft question's file tree.

## Approach

Use a parity-first embedded browser. The existing file browser remains the source of truth for directory listings and file actions. The draft editor supplies embedded routing hooks, selected-file editing, and redirect targets that keep users in the `All files` tab after successful file operations.

The only intentional workflow change in this PR is that editable text files open in an Ace editor inside the draft editor instead of navigating to the standalone file editor. Existing upload, rename, delete, download, and directory navigation behavior should remain available.

## Components

- `FileBrowser` continues to render directory listings and action forms.
- The AI draft editor passes file-browser options for embedded edit URLs, form actions, and successful-action redirects.
- `SelectedQuestionFileEditor` renders the embedded Ace editor for a selected text file.
- `selectedQuestionFile.ts` owns selected-file path normalization, file loading, binary-file rejection, and URL construction.

## Data Flow

The draft editor page loads the question's file data, the rendered file-browser HTML, and the selected file from the server. The active tab and selected file path are represented in the URL using `tab=all-files` and `file=<path>`.

When a user selects a text file, the file browser's edit link updates the draft editor URL and opens that file in the embedded editor. Saving posts the revised file contents to the draft editor route, which updates the question files through the existing course-files API. After a successful save, the client refreshes the file data and keeps the user in the embedded file editor.

Upload, rename, and delete forms continue to post through the existing file-browser actions. Successful actions redirect back to the draft editor's `All files` tab.

## Error Handling

This PR should keep the existing standalone edit-error page for server-job conflicts and file-action errors. That preserves current recovery behavior and avoids introducing a second conflict UI.

Inline errors should be limited to selected-file save failures that occur before the existing edit-error page is available, such as unexpected JSON/network failures.

## UX Requirements

- Preserve all existing file-browser functionality.
- Keep users in `All files` after successful embedded file operations.
- Make the selected file path and save state visible.
- Avoid navigating away from the draft editor for normal text-file editing.
- Keep navigation to the existing standalone file browser available as an escape hatch.
- Ensure the embedded file table and editor remain usable beside the chat panel.

## Testing

Add focused coverage for selected-file path validation, selected-file loading, and draft route save behavior. Add or update browser-level coverage where practical for selecting a file, saving edits, and returning to the file list.

Run focused typecheck, lint, and formatting on changed files, plus `make format-changed` before final review.

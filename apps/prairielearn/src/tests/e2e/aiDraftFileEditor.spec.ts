import fs from 'node:fs/promises';
import path from 'node:path';

import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { selectOrInsertUserByUid } from '../../models/user.js';

import { createTest, expect } from './fixtures.js';
import { setAceEditorContent } from './utils/ace.js';

// The AI draft editor is an enterprise-only page.
const test = createTest({ isEnterprise: true });

// The tests share a single draft question, so they must run serially. Loading
// the editor renders a question variant, so allow more than the default budget.
test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('AI draft file editor', () => {
  let editorUrl: string;
  let questionQid: string;

  test.beforeAll(async ({ courseInstance: _courseInstance }) => {
    const user = await selectOrInsertUserByUid('dev@example.com');
    const result = await getCourseFilesClient().createQuestion.mutate({
      course_id: '1',
      user_id: user.id,
      authn_user_id: user.id,
      has_course_permission_edit: true,
      is_draft: true,
      // `notes.txt` is the fixture for the per-file editor tests:
      // `question.html` and `server.py` route to the dedicated "Files" tab
      // rather than the per-file editor on "All files".
      files: {
        'question.html': '<p>e2e draft question</p>\n',
        'server.py': '# e2e\n',
        'notes.txt': 'e2e notes\n',
      },
    });
    if (result.status !== 'success') {
      throw new Error('Failed to create draft question fixture');
    }
    editorUrl = `/pl/course/1/ai_generate_editor/${result.question_id}`;
    questionQid = result.question_qid;
  });

  test('confirms before leaving a file with unsaved edits', async ({ page, enableFeatureFlag }) => {
    await enableFeatureFlag('ai-question-generation');
    await page.goto(`${editorUrl}?tab=all-files&selection=file%3Anotes.txt`);

    const editorStatus = page.getByTestId('selected-file-editor');
    await setAceEditorContent(page, 'edited but not saved\n');
    await expect(editorStatus.getByText('Unsaved changes.')).toBeVisible();

    await page.getByRole('link', { name: 'All files' }).click();

    // The edits are unsaved, so leaving is gated behind a confirmation.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Discard changes' })).toBeVisible();

    // Cancelling keeps the editor open with the edits intact.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(editorStatus.getByText('Unsaved changes.')).toBeVisible();

    // Discarding leaves the editor and returns to the file listing.
    await page.getByRole('link', { name: 'All files' }).click();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
  });

  test('leaves immediately when the file has no unsaved edits', async ({
    page,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('ai-question-generation');
    await page.goto(`${editorUrl}?tab=all-files&selection=file%3Anotes.txt`);
    await expect(page.getByTestId('selected-file-editor').getByText('Saved.')).toBeVisible();

    await page.getByRole('link', { name: 'All files' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
  });

  test('disables file mutations while a generation is in progress', async ({
    page,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('ai-question-generation');
    await page.goto(`${editorUrl}?tab=all-files`);

    const addFileButton = page.getByRole('button', { name: 'Add new file', exact: true });
    await expect(addFileButton).toBeEnabled();

    // Hold the chat request open so the editor stays in the generating state
    // for the duration of the assertions.
    await page.route(/\/ai_generate_editor\/\d+\/chat$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      await route.abort();
    });

    await page.getByLabel('Modification instructions').fill('Add another part to this question.');
    await page.getByRole('button', { name: 'Send prompt' }).click();

    // The "Stop generation" control confirms the generation is in progress.
    await expect(page.getByRole('button', { name: 'Stop generation' })).toBeVisible();
    await expect(addFileButton).toBeDisabled();
    await expect(
      page.getByRole('row', { name: /server\.py/ }).getByTestId('delete-file-button'),
    ).toBeDisabled();
  });

  test('falls back to the question root when the directory parameter is stale', async ({
    page,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('ai-question-generation');
    // A directory selection pointing at a directory that no longer exists (e.g.
    // a stale bookmark) loads the question root instead of failing the editor.
    await page.goto(`${editorUrl}?tab=all-files&selection=dir%3Adoes-not-exist`);
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
    await expect(page.getByRole('row', { name: /server\.py/ })).toBeVisible();

    // A directory selection pointing at a file rather than a directory falls back the same way.
    await page.goto(`${editorUrl}?tab=all-files&selection=dir%3Aserver.py`);
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
    await expect(page.getByRole('row', { name: /server\.py/ })).toBeVisible();
  });

  test('reports a concurrent change in the question-code editor as a recoverable conflict', async ({
    page,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('ai-question-generation');
    const htmlPath = path.join(testCoursePath, 'questions', questionQid, 'question.html');

    await page.goto(`${editorUrl}?tab=files`);
    await setAceEditorContent(page, '<p>edited in the browser</p>\n');

    // Another writer (e.g. the agent) changes the file after it was fetched.
    await fs.writeFile(htmlPath, '<p>changed on disk</p>\n');

    await page.getByRole('button', { name: 'Save edits' }).click();

    // The save is rejected with a conflict naming the file, not silently clobbered.
    await expect(page.getByText('changed since you opened it.')).toBeVisible();

    // Overwriting wins over the concurrent change.
    await page.getByRole('button', { name: 'overwrite anyway' }).click();
    await expect(page.getByText('No unsaved changes.')).toBeVisible();
    expect(await fs.readFile(htmlPath, 'utf8')).toBe('<p>edited in the browser</p>\n');
  });

  // Runs last: it deletes and then recreates the shared question's `notes.txt`.
  test('reports a deleted file as a recoverable conflict, not a sync failure', async ({
    page,
    testCoursePath,
    enableFeatureFlag,
  }) => {
    await enableFeatureFlag('ai-question-generation');
    const notesPath = path.join(testCoursePath, 'questions', questionQid, 'notes.txt');

    await page.goto(`${editorUrl}?tab=all-files&selection=file%3Anotes.txt`);
    await setAceEditorContent(page, 'edited after the file was deleted\n');

    // Another writer deletes the file after the editor was opened.
    await fs.rm(notesPath);

    const editorStatus = page.getByTestId('selected-file-editor');
    await editorStatus.getByRole('button', { name: 'Save edits' }).click();

    // The deleted file surfaces as a stale-edit conflict with recovery options,
    // not an opaque sync-job failure.
    await expect(
      editorStatus.getByText('This file was deleted since you opened it.'),
    ).toBeVisible();
    await expect(editorStatus.getByRole('button', { name: 'Reload file' })).toBeVisible();

    // Overwriting recreates the deleted file with the editor's contents.
    await editorStatus.getByRole('button', { name: 'overwrite anyway' }).click();
    await expect(editorStatus.getByText('Saved.')).toBeVisible();
    expect(await fs.readFile(notesPath, 'utf8')).toBe('edited after the file was deleted\n');
  });
});

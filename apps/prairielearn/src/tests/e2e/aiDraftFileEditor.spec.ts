import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { features } from '../../lib/features/index.js';
import { selectOrInsertUserByUid } from '../../models/user.js';

import { setAceEditorContentAt } from './aceUtils.js';
import { createTest, expect } from './fixtures.js';

// The AI draft editor is an enterprise-only page.
const test = createTest({ isEnterprise: true });

/** Locator for the ACE editor backing the open file on the "All files" tab. */
function selectedFileEditor(page: Page) {
  return page.getByTestId('selected-file-editor').locator('.ace_editor');
}

async function syncCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.getByText('Success', { exact: true })).toBeVisible();
}

// The tests share a single draft question, so they must run serially. Loading
// the editor renders a question variant, so allow more than the default budget.
test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('AI draft file editor', () => {
  let editorUrl: string;
  let questionQid: string;

  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncCourses(page);
    await page.close();

    await features.enable('ai-question-generation');

    const user = await selectOrInsertUserByUid('dev@example.com');
    const result = await getCourseFilesClient().createQuestion.mutate({
      course_id: '1',
      user_id: user.id,
      authn_user_id: user.id,
      has_course_permission_edit: true,
      is_draft: true,
      files: { 'question.html': '<p>e2e draft question</p>\n', 'server.py': '# e2e\n' },
    });
    if (result.status !== 'success') {
      throw new Error('Failed to create draft question fixture');
    }
    editorUrl = `/pl/course/1/ai_generate_editor/${result.question_id}`;
    questionQid = result.question_qid;
  });

  test('confirms before leaving a file with unsaved edits', async ({ page }) => {
    await page.goto(`${editorUrl}?tab=all-files&file=server.py`);

    const editorStatus = page.getByTestId('selected-file-editor');
    await setAceEditorContentAt(selectedFileEditor(page), '# edited but not saved\n');
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

  test('leaves immediately when the file has no unsaved edits', async ({ page }) => {
    await page.goto(`${editorUrl}?tab=all-files&file=server.py`);
    await expect(page.getByTestId('selected-file-editor').getByText('Saved.')).toBeVisible();

    await page.getByRole('link', { name: 'All files' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
  });

  test('disables file mutations while a generation is in progress', async ({ page }) => {
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
  }) => {
    // A `?dir=` pointing at a directory that no longer exists (e.g. a stale
    // bookmark) loads the question root instead of failing the editor.
    await page.goto(`${editorUrl}?tab=all-files&dir=does-not-exist`);
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
    await expect(page.getByRole('row', { name: /server\.py/ })).toBeVisible();

    // A `?dir=` pointing at a file rather than a directory falls back the same way.
    await page.goto(`${editorUrl}?tab=all-files&dir=server.py`);
    await expect(page.getByRole('table', { name: 'Directories and files' })).toBeVisible();
    await expect(page.getByRole('row', { name: /server\.py/ })).toBeVisible();
  });

  // Runs last: it deletes and then recreates the shared question's `server.py`.
  test('reports a deleted file as a recoverable conflict, not a sync failure', async ({
    page,
    testCoursePath,
  }) => {
    const serverPyPath = path.join(testCoursePath, 'questions', questionQid, 'server.py');

    await page.goto(`${editorUrl}?tab=all-files&file=server.py`);
    await setAceEditorContentAt(selectedFileEditor(page), '# edited after the file was deleted\n');

    // Another writer deletes the file after the editor was opened.
    await fs.rm(serverPyPath);

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
    expect(await fs.readFile(serverPyPath, 'utf8')).toBe('# edited after the file was deleted\n');
  });
});

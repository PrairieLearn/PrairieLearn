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
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

// The tests share a single draft question, so they must run serially. Loading
// the editor renders a question variant, so allow more than the default budget.
test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('AI draft file editor', () => {
  let editorUrl: string;

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
});

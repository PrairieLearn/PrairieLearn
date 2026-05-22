import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { getAceEditorContent, setAceEditorContent } from './aceUtils.js';
import { expect, test } from './fixtures.js';

// All file-edit URLs go through the course-admin file editor, which can edit any
// file in the course without needing a question id.
const FILE_EDIT_BASE = '/pl/course/1/course_admin/file_edit/questions/addNumbers';

function questionFilePath(testCoursePath: string, fileName: string) {
  return path.join(testCoursePath, 'questions', 'addNumbers', fileName);
}

async function syncCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

// These tests edit shared question files, so they must run serially.
test.describe.configure({ mode: 'serial' });

test.describe('Instructor file editor', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncCourses(page);
    await page.close();
  });

  test('edits a file and syncs the change to disk', async ({ page, testCoursePath }) => {
    const filePath = questionFilePath(testCoursePath, 'server.py');
    const original = await fs.readFile(filePath, 'utf8');

    await page.goto(`${FILE_EDIT_BASE}/server.py`);
    expect(await getAceEditorContent(page)).toBe(original);

    const edited = `${original}\n# e2e round-trip edit\n`;
    await setAceEditorContent(page, edited);

    const saveButton = page.getByRole('button', { name: /Save and sync/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByText('saved and synced successfully')).toBeVisible();
    expect(await fs.readFile(filePath, 'utf8')).toBe(edited);
  });

  test('surfaces a conflict and keeps the local version', async ({ page, testCoursePath }) => {
    const filePath = questionFilePath(testCoursePath, 'question.html');
    const base = await fs.readFile(filePath, 'utf8');
    const myContent = `${base}\n<!-- e2e my version -->\n`;
    const theirContent = `${base}\n<!-- e2e their version -->\n`;

    await page.goto(`${FILE_EDIT_BASE}/question.html`);
    await setAceEditorContent(page, myContent);

    // Another writer changes the file on disk after the editor was opened.
    await fs.writeFile(filePath, theirContent);

    await page.getByRole('button', { name: /Save and sync/ }).click();

    // The stale-hash save is rejected and the version chooser is shown.
    await expect(page.getByRole('heading', { name: 'My version' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Their version' })).toBeVisible();
    expect(await getAceEditorContent(page, 0)).toBe(myContent);
    expect(await getAceEditorContent(page, 1)).toBe(theirContent);

    await page.getByRole('button', { name: /Choose my version/ }).click();
    await page.getByRole('button', { name: /Save and sync/ }).click();

    await expect(page.getByText('saved and synced successfully')).toBeVisible();
    expect(await fs.readFile(filePath, 'utf8')).toBe(myContent);
  });

  test('surfaces a conflict and discards the local version', async ({ page, testCoursePath }) => {
    const filePath = questionFilePath(testCoursePath, 'question.html');
    const base = await fs.readFile(filePath, 'utf8');
    const myContent = `${base}\n<!-- e2e discarded version -->\n`;
    const theirContent = `${base}\n<!-- e2e kept version -->\n`;

    await page.goto(`${FILE_EDIT_BASE}/question.html`);
    await setAceEditorContent(page, myContent);
    await fs.writeFile(filePath, theirContent);

    await page.getByRole('button', { name: /Save and sync/ }).click();
    await expect(page.getByRole('heading', { name: 'Their version' })).toBeVisible();

    // Choosing their version reloads the page onto the on-disk content.
    await page.getByRole('button', { name: /Choose their version/ }).click();

    await expect(page.getByRole('heading', { name: 'Their version' })).toBeHidden();
    expect(await getAceEditorContent(page)).toBe(theirContent);
    expect(await fs.readFile(filePath, 'utf8')).toBe(theirContent);
  });

  test('restores the original UUID when info.json is saved with a changed UUID', async ({
    page,
    testCoursePath,
  }) => {
    const filePath = questionFilePath(testCoursePath, 'info.json');
    const originalUuid = JSON.parse(await fs.readFile(filePath, 'utf8')).uuid;
    expect(originalUuid).toBeTruthy();

    await page.goto(`${FILE_EDIT_BASE}/info.json`);
    const parsed = JSON.parse(await getAceEditorContent(page));
    parsed.uuid = '11111111-1111-1111-1111-111111111111';
    await setAceEditorContent(page, `${JSON.stringify(parsed, null, 2)}\n`);

    await page.getByRole('button', { name: /Save and sync/ }).click();

    // Changing the UUID opens a confirmation modal instead of saving directly.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('UUID change')).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm save' }).click();

    // Confirming saves the file with the original UUID restored.
    await expect(page.getByText('saved and synced successfully')).toBeVisible();
    const savedUuid = JSON.parse(await fs.readFile(filePath, 'utf8')).uuid;
    expect(savedUuid).toBe(originalUuid);
  });
});

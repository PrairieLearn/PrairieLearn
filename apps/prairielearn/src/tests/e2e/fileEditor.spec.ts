import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { selectQuestionByQid } from '../../models/question.js';

import { getAceEditorContent, setAceEditorContent } from './aceUtils.js';
import { expect, test } from './fixtures.js';

/**
 * The course-admin file editor rejects anything under `questions/`, so file
 * edits for a question go through the question-scoped editor. The path segment
 * after `file_edit/` is the file's path relative to the course root.
 */
function fileEditUrl(questionId: string, fileName: string) {
  return `/pl/course/1/question/${questionId}/file_edit/questions/addNumbers/${fileName}`;
}

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
  let questionId: string;

  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncCourses(page);
    await page.close();

    questionId = (await selectQuestionByQid({ qid: 'addNumbers', course_id: '1' })).id;
  });

  test('edits a file and syncs the change to disk', async ({ page, testCoursePath }) => {
    const filePath = questionFilePath(testCoursePath, 'server.py');
    const original = await fs.readFile(filePath, 'utf8');

    await page.goto(fileEditUrl(questionId, 'server.py'));
    expect(await getAceEditorContent(page)).toBe(original);

    const edited = `${original}\n# e2e round-trip edit\n`;
    await setAceEditorContent(page, edited);

    const saveButton = page.getByRole('button', { name: /Save and sync/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByText('saved and synced successfully')).toBeVisible({ timeout: 15_000 });
    expect(await fs.readFile(filePath, 'utf8')).toBe(edited);
  });

  test('surfaces a conflict and keeps the local version', async ({ page, testCoursePath }) => {
    const filePath = questionFilePath(testCoursePath, 'question.html');
    const base = await fs.readFile(filePath, 'utf8');
    const myContent = `${base}\n<!-- e2e my version -->\n`;
    const theirContent = `${base}\n<!-- e2e their version -->\n`;

    await page.goto(fileEditUrl(questionId, 'question.html'));
    await setAceEditorContent(page, myContent);

    // Another writer changes the file on disk after the editor was opened.
    await fs.writeFile(filePath, theirContent);

    await page.getByRole('button', { name: /Save and sync/ }).click();

    // The stale-hash save is rejected and the version chooser is shown.
    await expect(page.getByRole('heading', { name: 'My version' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Their version' })).toBeVisible();
    expect(await getAceEditorContent(page, 0)).toBe(myContent);
    expect(await getAceEditorContent(page, 1)).toBe(theirContent);

    await page.getByRole('button', { name: /Choose my version/ }).click();
    await page.getByRole('button', { name: /Save and sync/ }).click();

    await expect(page.getByText('saved and synced successfully')).toBeVisible({ timeout: 15_000 });
    expect(await fs.readFile(filePath, 'utf8')).toBe(myContent);
  });

  test('surfaces a conflict and discards the local version', async ({ page, testCoursePath }) => {
    const filePath = questionFilePath(testCoursePath, 'question.html');
    const base = await fs.readFile(filePath, 'utf8');
    const myContent = `${base}\n<!-- e2e discarded version -->\n`;
    const theirContent = `${base}\n<!-- e2e kept version -->\n`;

    await page.goto(fileEditUrl(questionId, 'question.html'));
    await setAceEditorContent(page, myContent);
    await fs.writeFile(filePath, theirContent);

    await page.getByRole('button', { name: /Save and sync/ }).click();
    await expect(page.getByRole('heading', { name: 'Their version' })).toBeVisible({
      timeout: 15_000,
    });

    // Reading the panes waits for the editors to hydrate. The version-choice
    // buttons run client-side handlers, so they do nothing until then.
    expect(await getAceEditorContent(page, 0)).toBe(myContent);
    expect(await getAceEditorContent(page, 1)).toBe(theirContent);

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

    await page.goto(fileEditUrl(questionId, 'info.json'));
    const parsed = JSON.parse(await getAceEditorContent(page));
    parsed.uuid = '11111111-1111-1111-1111-111111111111';
    await setAceEditorContent(page, `${JSON.stringify(parsed, null, 2)}\n`);

    await page.getByRole('button', { name: /Save and sync/ }).click();

    // Changing the UUID opens a confirmation modal instead of saving directly.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('UUID change')).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm save' }).click();

    await expect(page.getByText('saved and synced successfully')).toBeVisible({ timeout: 15_000 });
    const savedContent = await fs.readFile(filePath, 'utf8');
    const savedJson = JSON.parse(savedContent);
    expect(savedJson.uuid).toBe(originalUuid);
    // The file is reformatted with Prettier, not minified onto a single line.
    expect(savedContent).toContain('\n  "uuid": ');
  });
});

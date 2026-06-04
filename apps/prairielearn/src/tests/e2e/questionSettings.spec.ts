import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

// Tests in this suite modify the same question file, so they must run serially
test.describe.configure({ mode: 'serial' });

test.describe('Question settings', () => {
  let questionId: string;

  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();

    // Get question ID after sync
    questionId = (await selectQuestionByQid({ qid: 'addNumbers', course_id: '1' })).id;
  });

  test('edits title and verifies persistence to disk', async ({ page, testCoursePath }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
    const originalInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(originalInfo.title).toBe('Add two numbers');

    const titleInput = page.getByLabel('Title');
    await expect(titleInput).toHaveValue('Add two numbers', { timeout: 15000 });

    await titleInput.click();
    await titleInput.fill('Updated title from e2e test');

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeVisible({ timeout: 10000 });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);

    await expect(page.getByRole('alert')).toBeVisible();

    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.title).toBe('Updated title from e2e test');
  });

  test('edits topic using ComboBox and verifies persistence', async ({ page, testCoursePath }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');

    const titleInput = page.getByLabel('Title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const topicComboBoxButton = page.getByRole('button', { name: 'Show suggestions' }).first();
    await topicComboBoxButton.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 5000 });
    await listbox.getByText('Calculus', { exact: true }).click();

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.getByRole('alert')).toBeVisible();

    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.topic).toBe('Calculus');
  });

  test('toggles single variant checkbox and verifies persistence', async ({
    page,
    testCoursePath,
  }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
    const originalInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    const originalSingleVariant = originalInfo.singleVariant ?? false;

    const titleInput = page.getByLabel('Title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const singleVariantCheckbox = page.getByLabel('Single variant');
    await singleVariantCheckbox.click();

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.getByRole('alert')).toBeVisible();

    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    if (originalSingleVariant) {
      expect(updatedInfo.singleVariant).toBeFalsy();
    } else {
      expect(updatedInfo.singleVariant).toBe(true);
    }
  });

  test('changes grading method select and verifies persistence', async ({
    page,
    testCoursePath,
  }) => {
    await page.goto(`/pl/course/1/question/${questionId}/settings`);

    const infoJsonPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');

    const titleInput = page.getByLabel('Title');
    await expect(titleInput).not.toHaveValue('', { timeout: 15000 });

    const gradingMethodSelect = page.getByLabel('Grading method');
    await gradingMethodSelect.selectOption('Manual');

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await page.waitForURL(/\/question\/\d+\/settings$/);
    await expect(page.getByRole('alert')).toBeVisible();

    const updatedInfo = JSON.parse(await fs.readFile(infoJsonPath, 'utf8'));
    expect(updatedInfo.gradingMethod).toBe('Manual');
  });
});

test.describe('Question deletion', () => {
  test('deletes a question whose removal would leave an assessment with no zones', async ({
    page,
    testCoursePath,
  }) => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
    const qid = `singledelete${suffix}`;
    const assessmentNumber = `5${suffix.slice(0, 4)}`;

    const sourcePath = path.join(testCoursePath, 'questions', 'addNumbers');
    const targetPath = path.join(testCoursePath, 'questions', qid);
    await fs.cp(sourcePath, targetPath, { recursive: true });
    const infoPath = path.join(targetPath, 'info.json');
    const infoJson = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
    infoJson.uuid = randomUUID();
    infoJson.title = 'Single delete fix';
    await fs.writeFile(infoPath, `${JSON.stringify(infoJson, null, 2)}\n`);

    const assessmentTid = `singledelete${suffix}`;
    const assessmentDir = path.join(
      testCoursePath,
      'courseInstances',
      'Sp15',
      'assessments',
      assessmentTid,
    );
    await fs.mkdir(assessmentDir, { recursive: true });
    const assessmentInfoPath = path.join(assessmentDir, 'infoAssessment.json');
    await fs.writeFile(
      assessmentInfoPath,
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'Single delete fix target',
          set: 'Homework',
          number: assessmentNumber,
          allowAccess: [
            { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
          ],
          zones: [{ title: 'Only zone', questions: [{ id: qid, autoPoints: 1 }] }],
        },
        null,
        2,
      )}\n`,
    );
    await syncCourse(testCoursePath);

    const question = await selectQuestionByQid({ qid, course_id: '1' });
    await page.goto(`/pl/course/1/question/${question.id}/settings`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const modal = page.getByRole('dialog').filter({ hasText: qid });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Delete', exact: true }).click();

    await page.waitForURL(/\/course_admin\/questions$/);
    await expect(fs.access(path.join(testCoursePath, 'questions', qid))).rejects.toThrow();
    const after = JSON.parse(await fs.readFile(assessmentInfoPath, 'utf-8'));
    expect(after.zones).toHaveLength(0);
  });
});

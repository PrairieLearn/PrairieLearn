import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectCourseByShortName } from '../../models/course.js';
import { selectOrInsertUserByUid } from '../../models/user.js';

import { expect, test } from './fixtures.js';

const INFO_COURSE_PATH = path.join(TEST_COURSE_PATH, 'infoCourse.json');
let originalInfoCourseContents: string;

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

let courseId: string;

async function setupTestData() {
  const course = await selectCourseByShortName('QA 101');
  courseId = course.id;

  const devUser = await selectOrInsertUserByUid('dev@example.com');
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: 'dev@example.com',
    course_role: 'Editor',
    authn_user_id: devUser.id,
  });
}

function getRowIndex(row: Locator) {
  return row.evaluate((el: HTMLElement) =>
    Array.from(el.parentElement?.children ?? []).indexOf(el),
  );
}

test.describe('Assessment sets editor', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    // Backup the original infoCourse.json before any modifications
    originalInfoCourseContents = await fs.readFile(INFO_COURSE_PATH, 'utf-8');

    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
    await setupTestData();
  });

  test.afterAll(async ({ browser, workerPort }) => {
    // Restore the original infoCourse.json and re-sync
    await fs.writeFile(INFO_COURSE_PATH, originalInfoCourseContents);

    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
  });

  test('can create assessment sets and persist changes after save', async ({ page }) => {
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await expect(page).toHaveTitle(/Assessment Sets/);
    await page.waitForSelector('.js-hydrated-component');

    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    await expect(page.getByRole('button', { name: 'Save and sync' })).toBeVisible();

    // Create two assessment sets with unique abbreviations
    const timestamp = Date.now().toString().slice(-4);
    const abbrev1 = `A${timestamp}`;
    const abbrev2 = `B${timestamp}`;

    await page.getByRole('button', { name: 'New assessment set' }).click();
    await page.getByLabel('Abbreviation').fill(abbrev1);
    await page.getByLabel('Name').fill('Test Set Alpha');
    await page.getByLabel('Heading').fill('Test Set Alpha Heading');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.getByRole('button', { name: 'New assessment set' }).click();
    await page.getByLabel('Abbreviation').fill(abbrev2);
    await page.getByLabel('Name').fill('Test Set Beta');
    await page.getByLabel('Heading').fill('Test Set Beta Heading');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const tbody = page.locator('table[aria-label="Assessment sets"] tbody');
    await expect(tbody.locator('.badge', { hasText: abbrev1 })).toBeVisible();
    await expect(tbody.locator('.badge', { hasText: abbrev2 })).toBeVisible();

    // Reorder using keyboard: Space to pick up, Arrow to move, Space to drop
    const rows = tbody.locator('tr');
    const betaRow = rows.filter({ has: page.locator('.badge', { hasText: abbrev2 }) });
    const betaDragHandle = betaRow.getByRole('button', { name: 'Drag row' });
    const betaIndexBefore = await getRowIndex(betaRow);

    await betaDragHandle.click();
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    expect(await getRowIndex(betaRow)).toBeLessThan(betaIndexBefore);

    await page.getByRole('button', { name: 'Save and sync' }).click();
    await page.waitForURL(/\/jobSequence\/|\/course_admin\/sets/);

    if (page.url().includes('/jobSequence/')) {
      await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
    }

    // Verify order persisted after reload
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await page.waitForSelector('.js-hydrated-component');

    const rowsAfterReload = page.locator('table[aria-label="Assessment sets"] tbody tr');
    const alphaRowAfterReload = rowsAfterReload.filter({
      has: page.locator('.badge', { hasText: abbrev1 }),
    });
    const betaRowAfterReload = rowsAfterReload.filter({
      has: page.locator('.badge', { hasText: abbrev2 }),
    });

    expect(await getRowIndex(betaRowAfterReload)).toBeLessThan(
      await getRowIndex(alphaRowAfterReload),
    );
  });
});

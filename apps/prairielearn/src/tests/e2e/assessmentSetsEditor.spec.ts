import type { Locator } from '@playwright/test';

import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

function getRowIndex(row: Locator) {
  return row.evaluate((el: HTMLElement) =>
    Array.from(el.parentElement?.children ?? []).indexOf(el),
  );
}

const courseId = '1';

test.describe('Assessment sets editor', () => {
  test.beforeAll(async ({ testCoursePath }) => {
    await syncCourse(testCoursePath);
  });

  test('can create assessment sets and persist changes after save', async ({ page }) => {
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await expect(page).toHaveTitle(/Assessment sets/);
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

  test('can edit an existing assessment set', async ({ page }) => {
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await expect(page).toHaveTitle(/Assessment sets/);
    await page.waitForSelector('.js-hydrated-component');

    // Enter edit mode
    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    await expect(page.getByRole('button', { name: 'Save and sync' })).toBeVisible();

    // Create a new assessment set to edit
    const timestamp = Date.now().toString().slice(-4);
    const originalAbbrev = `E${timestamp}`;
    const editedAbbrev = `X${timestamp}`;

    await page.getByRole('button', { name: 'New assessment set' }).click();
    await page.getByLabel('Abbreviation').fill(originalAbbrev);
    await page.getByLabel('Name').fill('Original Name');
    await page.getByLabel('Heading').fill('Original Heading');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const tbody = page.locator('table[aria-label="Assessment sets"] tbody');
    await expect(tbody.locator('.badge', { hasText: originalAbbrev })).toBeVisible();

    // Click the edit button for the row we just created
    const row = tbody
      .locator('tr')
      .filter({ has: page.locator('.badge', { hasText: originalAbbrev }) });
    await row.getByRole('button', { name: 'Edit' }).click();

    // Verify modal opens with current values
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Abbreviation')).toHaveValue(originalAbbrev);
    await expect(page.getByLabel('Name')).toHaveValue('Original Name');
    await expect(page.getByLabel('Heading')).toHaveValue('Original Heading');

    // Edit the values
    await page.getByLabel('Abbreviation').fill(editedAbbrev);
    await page.getByLabel('Name').fill('Edited Name');
    await page.getByLabel('Heading').fill('Edited Heading');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify the table shows updated values
    await expect(tbody.locator('.badge', { hasText: editedAbbrev })).toBeVisible();
    await expect(tbody.locator('.badge', { hasText: originalAbbrev })).not.toBeVisible();

    // Save and sync
    await page.getByRole('button', { name: 'Save and sync' }).click();
    await page.waitForURL(/\/jobSequence\/|\/course_admin\/sets/);

    if (page.url().includes('/jobSequence/')) {
      await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
    }

    // Verify changes persisted after reload
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await page.waitForSelector('.js-hydrated-component');

    const tbodyAfterReload = page.locator('table[aria-label="Assessment sets"] tbody');
    await expect(tbodyAfterReload.locator('.badge', { hasText: editedAbbrev })).toBeVisible();
    await expect(tbodyAfterReload.locator('.badge', { hasText: originalAbbrev })).not.toBeVisible();
  });

  test('can delete an assessment set', async ({ page }) => {
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await expect(page).toHaveTitle(/Assessment sets/);
    await page.waitForSelector('.js-hydrated-component');

    // Enter edit mode
    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    await expect(page.getByRole('button', { name: 'Save and sync' })).toBeVisible();

    // Create a new assessment set to delete
    const timestamp = Date.now().toString().slice(-4);
    const deleteAbbrev = `D${timestamp}`;

    await page.getByRole('button', { name: 'New assessment set' }).click();
    await page.getByLabel('Abbreviation').fill(deleteAbbrev);
    await page.getByLabel('Name').fill('To Be Deleted');
    await page.getByLabel('Heading').fill('Delete Me');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const tbody = page.locator('table[aria-label="Assessment sets"] tbody');
    await expect(tbody.locator('.badge', { hasText: deleteAbbrev })).toBeVisible();

    // Click the delete button for the row we just created
    const row = tbody
      .locator('tr')
      .filter({ has: page.locator('.badge', { hasText: deleteAbbrev }) });
    await row.getByRole('button', { name: 'Delete' }).click();

    // Verify it's removed from the table
    await expect(tbody.locator('.badge', { hasText: deleteAbbrev })).not.toBeVisible();

    // Save and sync
    await page.getByRole('button', { name: 'Save and sync' }).click();
    await page.waitForURL(/\/jobSequence\/|\/course_admin\/sets/);

    if (page.url().includes('/jobSequence/')) {
      await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
    }

    // Verify deletion persisted after reload
    await page.goto(`/pl/course/${courseId}/course_admin/sets`);
    await page.waitForSelector('.js-hydrated-component');

    const tbodyAfterReload = page.locator('table[aria-label="Assessment sets"] tbody');
    await expect(tbodyAfterReload.locator('.badge', { hasText: deleteAbbrev })).not.toBeVisible();
  });
});

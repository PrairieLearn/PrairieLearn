import { getCourseInstanceStudentLabelsUrl } from '../../lib/client/url.js';

import { expect, test } from './fixtures.js';

test.describe('Instructor student labels', () => {
  test('editing a label shows its current values and preserves its color', async ({
    page,
    courseInstance,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const firstLabelName = `E2E Label A ${timestamp}`;
    const firstEditedName = `E2E Edited A ${timestamp}`;
    const secondLabelName = `E2E Label B ${timestamp}`;

    await page.goto(getCourseInstanceStudentLabelsUrl(courseInstance.id));
    await expect(page).toHaveTitle(/Student labels/);

    await page.getByRole('button', { name: 'Add label' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Label name').fill(firstLabelName);
    await page.getByLabel('Color').selectOption('blue1');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('table')).toContainText(firstLabelName);

    await page.getByRole('button', { name: 'Add label' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Label name').fill(secondLabelName);
    await page.getByLabel('Color').selectOption('green2');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('table')).toContainText(secondLabelName);

    await page.getByRole('button', { name: `Edit ${firstLabelName}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Label name')).toHaveValue(firstLabelName);
    await expect(dialog.getByLabel('Color')).toHaveValue('blue1');

    await dialog.getByLabel('Label name').fill(firstEditedName);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('table')).toContainText(firstEditedName);
    await expect(page.getByRole('table')).toContainText(secondLabelName);

    await page.getByRole('button', { name: `Edit ${secondLabelName}` }).click();
    const secondDialog = page.getByRole('dialog');
    await expect(secondDialog.getByLabel('Label name')).toHaveValue(secondLabelName);
    await expect(secondDialog.getByLabel('Color')).toHaveValue('green2');
    await secondDialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: `Delete ${firstEditedName}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('table')).not.toContainText(firstEditedName);

    await page.getByRole('button', { name: `Delete ${secondLabelName}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('table')).not.toContainText(secondLabelName);
  });
});

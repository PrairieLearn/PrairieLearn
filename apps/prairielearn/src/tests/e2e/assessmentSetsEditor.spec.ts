import { expect, test } from './fixtures.js';

test.describe('Assessment sets editor', () => {
  test('can create assessment sets and persist changes after save', async ({
    page,
    courseInstance,
  }) => {
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/sets`);
    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    const table = page.getByRole('table', { name: 'Assessment sets', exact: true });
    const names = table.getByRole('textbox', { name: 'Name for assessment set' });
    const originalCount = await names.count();

    await page.getByRole('button', { name: 'Add assessment set' }).click();
    await table.getByRole('textbox', { name: 'Abbreviation' }).last().fill('ALPHA');
    await names.last().fill('Test Set Alpha');
    await table.getByRole('textbox', { name: 'Heading' }).last().fill('Alpha heading');

    await page.getByRole('button', { name: 'Add assessment set' }).click();
    await table.getByRole('textbox', { name: 'Abbreviation' }).last().fill('BETA');
    await names.last().fill('Test Set Beta');
    await table.getByRole('textbox', { name: 'Heading' }).last().fill('Beta heading');

    const betaRow = table.getByRole('row').filter({ hasText: 'BETA' });
    const handle = betaRow.getByRole('button', { name: 'Drag row' });
    const startY = (await handle.boundingBox())!.y;
    await handle.focus();
    // The keyboard sensor defers installing its arrow-key listener until after activation.
    await handle.press('Space', { delay: 50 });
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await handle.boundingBox())!.y).toBeLessThan(startY);
    await page.keyboard.press('Space');
    await expect(names.nth(originalCount)).toHaveValue('Test Set Beta');

    await page.getByRole('main').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit assessment sets' })).toBeVisible();
    await page.reload();
    await expect(table.getByRole('row').nth(originalCount + 1)).toContainText('Test Set Beta');
    await expect(table.getByRole('row').nth(originalCount + 2)).toContainText('Test Set Alpha');
  });

  test('can edit an existing assessment set', async ({ page, courseInstance }) => {
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/sets`);
    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    const table = page.getByRole('table', { name: 'Assessment sets', exact: true });

    await page.getByRole('button', { name: 'Add assessment set' }).click();
    await table.getByRole('textbox', { name: 'Abbreviation' }).last().fill('EDIT');
    await table.getByRole('textbox', { name: 'Name' }).last().fill('Original Name');
    await table.getByRole('textbox', { name: 'Heading' }).last().fill('Original Heading');
    await page.getByRole('main').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit assessment sets' })).toBeVisible();
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    const row = table.getByRole('row').filter({ has: page.getByText('EDIT', { exact: true }) });
    await row.getByRole('textbox', { name: 'Name' }).fill('Edited Name');
    await row.getByRole('textbox', { name: 'Heading' }).fill('Edited Heading');
    await row.getByRole('textbox', { name: 'Abbreviation' }).fill('EDITED');
    await page.getByRole('main').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit assessment sets' })).toBeVisible();

    await page.reload();
    const editedRow = table
      .getByRole('row')
      .filter({ has: page.getByText('EDITED', { exact: true }) });
    await expect(editedRow).toContainText('Edited Name');
    await expect(editedRow).toContainText('Edited Heading');
    await expect(table.getByText('EDIT', { exact: true })).toHaveCount(0);
  });

  test('can delete an assessment set', async ({ page, courseInstance }) => {
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/sets`);
    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    const table = page.getByRole('table', { name: 'Assessment sets', exact: true });

    await page.getByRole('button', { name: 'Add assessment set' }).click();
    await table.getByRole('textbox', { name: 'Abbreviation' }).last().fill('DEL');
    await table.getByRole('textbox', { name: 'Name' }).last().fill('To Be Deleted');
    await table.getByRole('textbox', { name: 'Heading' }).last().fill('Delete Me');
    await page.getByRole('main').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit assessment sets' })).toBeVisible();
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: 'Edit assessment sets' }).click();
    await table
      .getByRole('button', { name: 'Delete assessment set To Be Deleted', exact: true })
      .click();
    await page.getByRole('main').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit assessment sets' })).toBeVisible();

    await page.reload();
    await expect(table.getByText('DEL', { exact: true })).toHaveCount(0);
  });
});

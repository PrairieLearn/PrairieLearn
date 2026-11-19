import { selectAssessmentByTid } from '../../models/assessment.js';

import { expect, test } from './fixtures.js';

test('Bootstrap popovers have a keyboard-accessible Close button', async ({
  page,
  courseInstance,
}) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/file_view`);

  const trigger = page.getByRole('button', { name: 'Add new files', exact: true });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Upload files' });
  const closeButton = dialog.getByRole('button', { name: 'Close' });
  const lastControl = dialog.getByRole('button', { name: 'Upload files' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Upload files', exact: true })).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByLabel('Choose files')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(lastControl).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('Bootstrap popovers keep focus inside when it is on an element outside the tab order', async ({
  page,
  courseInstance,
}) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/file_view`);

  const trigger = page.getByRole('button', { name: 'Add new files', exact: true });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Upload files' });
  const closeButton = dialog.getByRole('button', { name: 'Close' });
  const lastControl = dialog.getByRole('button', { name: 'Upload files' });
  await expect(dialog.getByLabel('Choose files')).toBeFocused();

  // The popover is appended to the end of the body, so without the focus trap,
  // tabbing forward from here would leave it.
  const staticContent = dialog.getByTestId('static-content');
  await dialog.evaluate((el) => {
    const content = document.createElement('p');
    content.tabIndex = -1;
    content.dataset.testid = 'static-content';
    content.textContent = 'Static content';
    el.querySelector('.popover-body')!.append(content);
  });

  await staticContent.focus();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await staticContent.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(lastControl).toBeFocused();
});

test('React popovers expose dialog state and return focus after closing', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw19-accessControlUi',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/access`,
  );
  await page.getByRole('button', { name: 'Edit' }).first().click();

  const trigger = page.getByRole('button', { name: 'What does before release mean?' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'What does "before release" mean?' });
  const closeButton = dialog.getByRole('button', { name: 'Close' });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(closeButton).toBeFocused();
  await closeButton.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

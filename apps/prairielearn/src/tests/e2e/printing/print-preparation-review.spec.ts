import { expect } from '../fixtures.js';

import {
  ACTIVE_PREVIEW_FRAME_SELECTOR,
  clearPrintPreparationState,
  downloadMenu,
  openPrintPreparation,
  printFormLabel,
  test,
  waitForFormA1,
} from './print-preparation-utils.js';

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ courseInstance }) => {
  await clearPrintPreparationState(courseInstance.id);
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id, 'exam23-printing');
  await waitForFormA1(page);
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR).locator(':root')).toHaveAttribute(
    'data-print-status',
    'ready',
    { timeout: 120_000 },
  );
  await expect(page.getByText('Review printability', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  const firstOmittedQuestion = page
    .getByRole('group', { name: /^Question / })
    .filter({ has: page.getByText('Omitted', { exact: true }) })
    .first();
  await expect(firstOmittedQuestion).not.toBeInViewport();
  await page.getByRole('button', { name: 'Review questions' }).click();
  await expect(firstOmittedQuestion).toBeInViewport();
  await expect(firstOmittedQuestion).toBeFocused();
  const reviewAlert = page.getByRole('alert').filter({
    has: page.getByRole('button', { name: 'Review questions' }),
  });
  await expect(reviewAlert).toBeVisible();
  await expect(reviewAlert.getByRole('button', { name: 'Dismiss question warning' })).toHaveCount(
    0,
  );
  await expect(downloadMenu(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeEnabled();
  await page.getByLabel(/Show only items to review/).check();
  await expect(page.getByRole('checkbox', { name: 'Include question 1', exact: true })).toHaveCount(
    0,
  );
  const omittedLabels = await page
    .getByRole('group', { name: /^Question / })
    .filter({ has: page.getByText('Omitted', { exact: true }) })
    .getByRole('checkbox')
    .evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label')!));
  for (const label of omittedLabels) {
    await page.getByRole('checkbox', { name: label, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: label, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByText('Review printability', { exact: true }).first()).toBeVisible();
  await expect(reviewAlert.getByRole('button', { name: 'Dismiss question warning' })).toBeVisible();
  await reviewAlert.getByRole('button', { name: 'Dismiss question warning' }).click();
  await expect(reviewAlert).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Print assessment' })).toBeFocused();
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  for (const label of omittedLabels) {
    await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
  }
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);
  const firstConcernQuestion = page
    .getByRole('group', { name: /^Question / })
    .filter({ has: page.getByText('Review printability', { exact: true }) })
    .first();
  await expect(firstConcernQuestion).not.toBeInViewport();
  await page.getByRole('button', { name: 'Review questions' }).click();
  await expect(firstConcernQuestion).toBeInViewport();
  await expect(firstConcernQuestion).toBeFocused();
  await reviewAlert.getByRole('button', { name: 'Dismiss question warning' }).click();
  await expect(reviewAlert).toHaveCount(0);

  const firstFormId = new URL(page.url()).searchParams.get('form');
  const firstLabel = await printFormLabel(page);
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('form'), {
      timeout: 120_000,
    })
    .not.toBe(firstFormId);
  await expect(reviewAlert).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: `Form ${firstLabel}` });
  await expect(reviewAlert).toBeVisible();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await reviewAlert.getByRole('button', { name: 'Dismiss question warning' }).click();
  await firstConcernQuestion.getByRole('checkbox').click();
  await expect(reviewAlert).toBeVisible();
});

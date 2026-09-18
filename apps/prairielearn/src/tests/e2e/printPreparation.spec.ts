import axe from 'axe-core';

import { selectAssessmentByTid } from '../../models/assessment.js';

import { expect, test } from './fixtures.js';

test.describe.configure({ timeout: 180_000 });

test('prepares an exam and key with consistent variants and downloads', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation`,
  );
  await expect(page.getByRole('heading', { name: 'Print preparation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  const form = await page.getByLabel('Your saved forms').inputValue();
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
  await expect(frame.locator(':root')).toHaveAttribute('data-print-status', 'ready');
  await expect(page.getByRole('heading', { name: /Questions in this form/ })).toBeVisible();
  await expect(page.getByText('No paper-specific concerns detected')).toHaveCount(0);
  await page.getByLabel('Paper size').selectOption('A4');
  await page.getByLabel('Additional student information').fill('Section\nStudent ID');
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-paper-size', 'A4');
  await expect(page.getByLabel('Your saved forms')).toHaveValue(form);
  await page.getByLabel('Spacing for question 1', { exact: true }).selectOption('full');
  await page.getByRole('button', { name: 'Update preview', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveAttribute(
    'data-print-block-size',
    'full',
  );
  const questionTwo = await frame
    .locator('.printing-question[data-question-number="2"]')
    .innerText();
  await page.getByRole('checkbox', { name: 'Include question 1', exact: true }).uncheck();
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  await expect(frame.locator(':root')).toHaveAttribute('data-print-max-points', '10');
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveCount(0);
  await expect(frame.locator('.printing-question[data-question-number="2"]')).toHaveText(
    questionTwo,
    { useInnerText: true },
  );
  await page.getByRole('checkbox', { name: 'Include question 2', exact: true }).uncheck();
  await expect(page.getByText('Select at least one question to prepare an exam.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update preview', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Include question 2', exact: true }).check();
  await page.getByRole('button', { name: 'Answer key', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveCount(0);
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  await expect(page.getByLabel('Your saved forms')).toHaveValue(form);
  await page.addScriptTag({ content: axe.source });
  const { violations } = await page.evaluate(async () => await axe.run());
  expect(violations).toEqual([]);
  for (const [button, extension] of [
    ['PDF', 'pdf'],
    ['Word (.docx)', 'docx'],
  ]) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    const request = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(`/paper/${extension}`),
    );
    await page.getByRole('button', { name: button, exact: true }).click();
    expect(new URL((await request).url()).searchParams.getAll('exclude_question')).toEqual(['1']);
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(`exam-form-${form}-answer-key.${extension}`);
    expect(await file.failure()).toBeNull();
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled();
  }
  await page.getByRole('checkbox', { name: 'Include question 1', exact: true }).check();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '2');
  await expect(frame.locator('.printing-question[data-question-number="1"]')).toHaveAttribute(
    'data-print-block-size',
    'full',
  );
  await expect(page.getByLabel('Your saved forms')).toHaveValue(form);
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam23-printing',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation`,
  );
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.getByText('Review for paper', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText('Omitted', { exact: true }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeDisabled();
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
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByText('Omitted', { exact: true })).toHaveCount(0);
});

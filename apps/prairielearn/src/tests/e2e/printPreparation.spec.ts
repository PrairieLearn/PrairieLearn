import fs from 'node:fs/promises';

import axe from 'axe-core';
import { PDFDocument } from 'pdf-lib';

import { PrintPacketMetadataSchema } from '../../lib/print-packet-schema.js';
import { selectAssessmentInstanceById } from '../../models/assessment-instance.js';
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
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await expect(page.getByRole('link', { name: 'Print preparation', exact: true })).toHaveCount(0);
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
  );
  await page.getByRole('button', { name: 'Print preparation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Print preparation', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Questions', exact: true })).toHaveAttribute(
    'href',
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await instancesLoaded;
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  const form = new URL(page.url()).searchParams.get('instance');
  await expect(page.getByRole('button', { name: /^Form A/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
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
  expect(new URL(page.url()).searchParams.get('instance')).toBe(form);
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
  expect(new URL(page.url()).searchParams.get('instance')).toBe(form);
  await page.addScriptTag({ content: axe.source });
  const { violations } = await page.evaluate(async () => await axe.run());
  expect(violations).toEqual([]);
  for (const [button, extension] of [
    ['PDF', 'pdf'],
    ['Word (.docx)', 'docx'],
  ]) {
    const downloaded = page.waitForEvent('download', { timeout: 120_000 });
    const request = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        extension === 'pdf' ? '/printableExamExport.pdf' : '/paper/docx',
      ),
    );
    await page.getByRole('button', { name: button, exact: true }).click();
    const exportRequest = await request;
    if (extension === 'pdf') {
      const input = await new Response(Uint8Array.from(exportRequest.postDataBuffer()!), {
        headers: exportRequest.headers(),
      }).formData();
      const metadata = PrintPacketMetadataSchema.parse(
        JSON.parse(input.get('metadata')!.toString()),
      );
      expect(metadata).toMatchObject({
        instances: [
          { assessmentInstanceId: form, formLabel: 'A', settings: { excludedQuestions: ['1'] } },
        ],
        copies: 1,
        document: 'answer_key',
      });
    } else {
      expect(new URL(exportRequest.url()).searchParams.getAll('exclude_question')).toEqual(['1']);
    }
    const file = await downloaded;
    if (extension === 'pdf') {
      expect(file.suggestedFilename()).toMatch(/answer_keys_1_copies\.pdf$/);
    } else {
      expect(file.suggestedFilename()).toBe('exam-form-A-answer-key.docx');
    }
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
  expect(new URL(page.url()).searchParams.get('instance')).toBe(form);
});

test('regenerates and combines assessment instances with custom covers for the class', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam20-assessmentTools',
  });
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation?instances=`,
  );
  await instancesLoaded;
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  const originalInstanceId = new URL(page.url()).searchParams.get('instance')!;
  const originalInstance = await selectAssessmentInstanceById(originalInstanceId);
  await page.getByRole('button', { name: 'Regenerate Form A', exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('instance'))
    .not.toBe(originalInstanceId);
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByRole('button', { name: /^Form A/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await selectAssessmentInstanceById(originalInstanceId)).toEqual(originalInstance);

  const formIds = [new URL(page.url()).searchParams.get('instance')!];
  for (const label of ['B', 'C']) {
    await page.getByRole('button', { name: 'Add assessment instance', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Form ${label}`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
      timeout: 120_000,
    });
    formIds.push(new URL(page.url()).searchParams.get('instance')!);
  }
  expect(new Set(formIds).size).toBe(3);
  const pageCounts: number[] = [];
  const frame = page.frameLocator('iframe[title="Printable document preview"]');
  for (const label of ['A', 'B', 'C']) {
    await page.getByRole('button', { name: new RegExp(`^Form ${label}`) }).click();
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled({
      timeout: 120_000,
    });
    await expect(frame.locator(':root')).toHaveAttribute('data-print-status', 'ready');
    pageCounts.push(await frame.locator('.pagedjs_page').count());
  }

  const cover = await PDFDocument.create();
  cover.addPage([400, 600]).drawText('Extended exam instructions');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'extended-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toBeVisible();
  await page.getByLabel('Number of exam copies', { exact: true }).fill('45');
  await expect(
    page.getByText('Forms A, B, C repeat in order until all 45 copies are included.', {
      exact: false,
    }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('instances')?.split(',')).toEqual(formIds);
  const downloaded = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Download class PDF', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/exam_45_copies\.pdf$/);
  expect(await download.failure()).toBeNull();
  const packet = await PDFDocument.load(await fs.readFile(await download.path()));
  expect(packet.getPageCount()).toBe(
    15 * pageCounts.reduce((total, count) => total + count + 1, 0),
  );
  let copyStart = 0;
  for (let copy = 0; copy < 45; copy++) {
    expect(packet.getPage(copyStart + 1).getSize()).toEqual({ width: 400, height: 600 });
    copyStart += pageCounts[copy % pageCounts.length] + 1;
  }
});

test('distinguishes paper review flags from broken questions omitted from the document', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam23-printing',
  });
  const instancesLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/printableExams.list'),
  );
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/print_preparation`,
  );
  await instancesLoaded;
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

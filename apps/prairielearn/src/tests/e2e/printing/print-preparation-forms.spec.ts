import fs from 'node:fs/promises';

import { PDFDocument } from 'pdf-lib';
import * as unzipper from 'unzipper';

import { selectAssessmentByTid } from '../../../models/assessment.js';
import { insertCoursePermissionsByUserUid } from '../../../models/course-permissions.js';
import { selectPrintFormQuestions } from '../../../models/print-form-question.js';
import {
  selectActivePrintFormsForAssessment,
  selectOptionalPrintForm,
} from '../../../models/print-form.js';
import { getOrCreateUser } from '../../utils/auth.js';
import { expect } from '../fixtures.js';

import {
  ACTIVE_PREVIEW_FRAME_SELECTOR,
  chooseDownload,
  clearPrintPreparationState,
  downloadMenu,
  downloadPreparedFile,
  openPrintPreparation,
  preparePreview,
  printFormLabel,
  test,
} from './print-preparation-utils.js';

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ courseInstance }) => {
  await clearPrintPreparationState(courseInstance.id);
});

test('uses one paper size for current forms and versions a downloaded form', async ({
  page,
  courseInstance,
}) => {
  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const formAId = new URL(page.url()).searchParams.get('form')!;
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(formAId);
  const formBId = new URL(page.url()).searchParams.get('form')!;

  await page.getByLabel('Paper size', { exact: true }).selectOption('A4');
  await expect
    .poll(async () =>
      (await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })).map(
        (form) => form.settings.paperSize,
      ),
    )
    .toEqual(['A4', 'A4']);
  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  const copy = await downloadPreparedFile(page, async () => {
    await chooseDownload(page, 'Download Form A1 (PDF)');
  });
  expect(await copy.failure()).toBeNull();

  await page.getByLabel('Paper size', { exact: true }).selectOption('Letter');
  const dialog = page.getByRole('dialog', { name: 'Change paper size for all forms' });
  await expect(dialog).toContainText('Form A1 → Form A2');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('A4');
  expect(
    (await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })).map(
      (form) => form.settings.paperSize,
    ),
  ).toEqual(['A4', 'A4']);

  await page.getByLabel('Paper size', { exact: true }).selectOption('Letter');
  await dialog.getByRole('button', { name: 'Apply paper size' }).click();
  await expect(page.getByRole('button', { name: 'Form A2 Previewing' })).toBeVisible({
    timeout: 120_000,
  });
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect
    .poll(async () =>
      (await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })).map(
        (form) => form.settings.paperSize,
      ),
    )
    .toEqual(['Letter', 'Letter']);
  expect(
    (await selectOptionalPrintForm({ printFormId: formAId, assessmentId: assessment.id }))!.settings
      .paperSize,
  ).toBe('A4');
  expect(
    (await selectOptionalPrintForm({ printFormId: formBId, assessmentId: assessment.id }))!.settings
      .paperSize,
  ).toBe('Letter');
  await page.getByText(/^Previous forms \(/).click();
  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('A4');
});

test('creates a new form version when including a question after a download', async ({
  page,
  courseInstance,
}) => {
  await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const originalFormId = new URL(page.url()).searchParams.get('form')!;
  const question = page.getByRole('checkbox', { name: 'Include question 2', exact: true });
  await question.uncheck();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });

  const file = await downloadPreparedFile(page, async () => {
    await chooseDownload(page, 'Download Form A1 (PDF)');
  });
  expect(await file.failure()).toBeNull();
  await expect(question).toBeEnabled();
  await question.click();
  const dialog = page.getByRole('dialog', { name: 'Change Form A1 questions' });
  await expect(dialog.getByText('Form A2', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).not.toBeChecked();
  await question.click();
  await dialog.getByRole('button', { name: 'Create new form version' }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(originalFormId);
  await expect(page.getByRole('button', { name: 'Form A2 Previewing' })).toBeVisible();
  await expect(question).toBeChecked();
  await page.getByText(/^Previous forms \(/).click();
  await page.getByRole('button', { name: 'Form A1', exact: true }).click();
  await expect(question).not.toBeChecked();
  await expect(question).toBeDisabled();
});

test('prepares homework with matching student copies, answer keys, and Word exports', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw15-lockpoints',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/questions`,
  );
  await page.getByRole('link', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Form A1(?: Previewing)?$/ })).toBeVisible();
  await openPrintPreparation(page, courseInstance.id, 'hw15-lockpoints');
  await page.getByLabel('Additional student fields:').fill('Section');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^(Create|Update) preview$/ }).click();
  const downloadButton = downloadMenu(page);
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '2');
  await page.getByLabel('Spacing for question HW15.1', { exact: true }).selectOption('full');
  await page.getByRole('checkbox', { name: 'Include question HW15.2', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Update preview', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-question-count', '1');
  await expect(frame.locator('.printing-question')).toHaveAttribute(
    'data-question-number',
    'HW15.1',
  );
  await expect(frame.locator('.printing-question')).toHaveAttribute(
    'data-print-block-size',
    'full',
  );
  await expect(frame.getByRole('article', { name: 'Homework cover page' })).toBeVisible();
  const question = frame
    .locator('.pagedjs_page')
    .getByText('What percentage score would you like for this question?');
  const questionText = await question.innerText();
  await page.getByRole('button', { name: 'Answer key', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
  await expect(question).toHaveText(questionText, { useInnerText: true });
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadButton).toBeEnabled({ timeout: 120_000 });
  await expect(question).toHaveText(questionText, { useInnerText: true });

  const label = await printFormLabel(page);
  const word = await downloadPreparedFile(
    page,
    async () => {
      await chooseDownload(page, `Download Form ${label} Word (.docx)`);
    },
    'docx',
  );
  expect(word.suggestedFilename()).toMatch(/\.docx$/);
  expect(await word.failure()).toBeNull();
  const archive = await unzipper.Open.file(await word.path());
  const documentXml = (
    await archive.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString();
  expect(documentXml).toContain('Question HW15.1');
  expect(documentXml).not.toContain('Question HW15.2');
});

test('combines current forms and answer keys with equal page counts and custom covers', async ({
  page,
  baseURL,
  courseInstance,
}) => {
  const instructor = await getOrCreateUser({
    uid: 'instructor@example.com',
    name: 'Instructor User',
    uin: '100000000',
  });
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: instructor.uid,
    course_role: 'Editor',
    authn_user_id: instructor.id,
  });
  await page
    .context()
    .addCookies([{ name: 'pl_test_user', value: 'test_instructor', url: baseURL }]);

  const assessment = await openPrintPreparation(page, courseInstance.id);
  await preparePreview(page);
  const originalFormId = new URL(page.url()).searchParams.get('form')!;
  const originalLabel = await printFormLabel(page, originalFormId);
  expect(originalLabel).toMatch(/^A[1-9]\d*$/);
  const originalQuestions = await selectPrintFormQuestions(originalFormId);
  const preview = page.locator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  await preview.evaluate((frame) => {
    (frame as HTMLIFrameElement).contentDocument!.documentElement.dataset.cacheMarker =
      'before-regeneration';
  });
  await page.getByRole('button', { name: `Regenerate Form ${originalLabel}` }).click();
  const regenerateDialog = page.getByRole('dialog', {
    name: `Regenerate Form ${originalLabel}`,
  });
  await expect(regenerateDialog).toContainText('while keeping its label');
  await regenerateDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(new URL(page.url()).searchParams.get('form')).toBe(originalFormId);
  await page.getByRole('button', { name: `Regenerate Form ${originalLabel}` }).click();
  await regenerateDialog.getByRole('button', { name: 'Regenerate form' }).click();
  await expect(regenerateDialog).toBeHidden();
  const regeneratedId = new URL(page.url()).searchParams.get('form')!;
  const regeneratedLabel = await printFormLabel(page, regeneratedId);
  expect(regeneratedId).toBe(originalFormId);
  expect(regeneratedLabel).toBe(originalLabel);
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${regeneratedLabel}`) }),
  ).toBeFocused();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${regeneratedLabel}`) }),
  ).toHaveAttribute('aria-pressed', 'true');
  const regeneratedQuestions = await selectPrintFormQuestions(regeneratedId);
  expect(
    regeneratedQuestions.map(({ print_form_question }) => print_form_question.variant_id),
  ).not.toEqual(originalQuestions.map(({ print_form_question }) => print_form_question.variant_id));
  await expect(
    page
      .frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR)
      .locator('.question-container[data-variant-id]')
      .first(),
  ).toHaveAttribute('data-variant-id', regeneratedQuestions[0].print_form_question.variant_id);
  expect(
    await preview.evaluate(
      (frame) => (frame as HTMLIFrameElement).contentDocument?.documentElement.dataset.cacheMarker,
    ),
  ).toBeUndefined();

  const formIds = [regeneratedId];
  const labels = [regeneratedLabel];
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('form')).not.toBe(regeneratedId);
  const newId = new URL(page.url()).searchParams.get('form')!;
  const newLabel = await printFormLabel(page, newId);
  await expect(
    page.getByRole('button', { name: `Archive Form ${regeneratedLabel}` }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toBeFocused();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  formIds.push(newId);
  labels.push(newLabel);
  expect(new Set(formIds).size).toBe(2);
  const pageCounts: number[] = [];
  const answerKeyPageCounts: number[] = [];
  const frame = page.frameLocator(ACTIVE_PREVIEW_FRAME_SELECTOR);
  for (const [index, label] of labels.entries()) {
    await page
      .getByRole('combobox', { name: 'Preview form', exact: true })
      .selectOption({ label: `Form ${label}` });
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
    await expect(page.getByRole('button', { name: new RegExp(`^Form ${label}`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(new URL(page.url()).searchParams.get('form')).toBe(formIds[index]);
    if (index === 0) {
      await page.getByLabel('Spacing for question 1', { exact: true }).selectOption('full');
      await expect(page.getByRole('combobox', { name: 'Preview form', exact: true })).toBeEnabled();
      await expect(downloadMenu(page)).toBeDisabled();
      await page.getByRole('button', { name: 'Update preview', exact: true }).click();
      await expect(downloadMenu(page)).toBeEnabled({
        timeout: 120_000,
      });
    }
    await expect(frame.locator(':root')).toHaveAttribute('data-print-status', 'ready');
    pageCounts.push(await frame.locator('.pagedjs_page').count());
    await page.getByRole('button', { name: 'Answer key', exact: true }).click();
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
    await expect(frame.locator(':root')).toHaveAttribute('data-print-document', 'answer_key');
    answerKeyPageCounts.push(await frame.locator('.pagedjs_page').count());
    await page.getByRole('button', { name: 'Student copy', exact: true }).click();
    await expect(downloadMenu(page)).toBeEnabled({
      timeout: 120_000,
    });
  }

  const pagesPerForm = Math.max(...pageCounts);
  const cover = await PDFDocument.create();
  cover.addPage([400, 600]).drawText('Extended assessment instructions');
  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'extended-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toBeVisible();
  const wouldWarnOnUnload = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await wouldWarnOnUnload()).toBe(true);
  const formPageCount = pagesPerForm + 1;
  await chooseDownload(page, 'Download all forms PDF');
  const formsModal = page.getByRole('dialog', { name: 'Download all forms PDF', exact: true });
  await expect(
    formsModal.getByText(
      `Each included form consists of ${formPageCount} ${formPageCount === 1 ? 'page' : 'pages'}.`,
    ),
  ).toBeVisible();
  const coveredForms = await downloadPreparedFile(page, async () => {
    await formsModal.getByRole('button', { name: 'Download all forms PDF', exact: true }).click();
  });
  expect(coveredForms.suggestedFilename()).toMatch(/_all_forms\.pdf$/);
  const packet = await PDFDocument.load(await fs.readFile(await coveredForms.path()));
  expect(packet.getPageCount()).toBe(formPageCount * formIds.length);
  expect(packet.getPage(1).getSize()).toEqual({ width: 400, height: 600 });
  expect(packet.getPage(pagesPerForm + 2).getSize()).toEqual({ width: 400, height: 600 });
  await expect(formsModal).toBeHidden();
  expect(await wouldWarnOnUnload()).toBe(false);

  await page.getByLabel('Custom cover pages (PDF)', { exact: true }).setInputFiles({
    name: 'new-instructions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cover.save()),
  });
  expect(await wouldWarnOnUnload()).toBe(true);

  const pagesPerAnswerKey = Math.max(...answerKeyPageCounts);
  await chooseDownload(page, 'Download all answer keys PDF');
  const keysModal = page.getByRole('dialog', {
    name: 'Download all answer keys PDF',
    exact: true,
  });
  await expect(
    keysModal.getByText(
      `Each included answer key consists of ${pagesPerAnswerKey} ${pagesPerAnswerKey === 1 ? 'page' : 'pages'}.`,
    ),
  ).toBeVisible();
  const answerKeys = await downloadPreparedFile(page, async () => {
    await keysModal
      .getByRole('button', { name: 'Download all answer keys PDF', exact: true })
      .click();
  });
  expect(answerKeys.suggestedFilename()).toMatch(/_all_answer_keys\.pdf$/);
  expect((await PDFDocument.load(await fs.readFile(await answerKeys.path()))).getPageCount()).toBe(
    pagesPerAnswerKey * formIds.length,
  );
  await expect(keysModal).toBeHidden();
  expect(await wouldWarnOnUnload()).toBe(true);
  await page.getByRole('button', { name: 'Remove cover new-instructions.pdf' }).click();
  expect(await wouldWarnOnUnload()).toBe(false);
  await page.getByRole('button', { name: 'Student copy', exact: true }).click();
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await page
    .getByRole('combobox', { name: 'Preview form', exact: true })
    .selectOption({ label: `Form ${regeneratedLabel}` });
  await expect(downloadMenu(page)).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByLabel('Spacing for question 1', { exact: true })).toHaveValue('full');
  await page.getByRole('button', { name: 'Remove cover extended-instructions.pdf' }).click();
  await expect(page.getByText('extended-instructions.pdf', { exact: true })).toHaveCount(0);
  await expect(downloadMenu(page)).toBeEnabled();
  await page.getByRole('button', { name: `Regenerate Form ${regeneratedLabel}` }).click();
  const lockedRegenerateDialog = page.getByRole('dialog', {
    name: `Regenerate Form ${regeneratedLabel}`,
  });
  const nextLabel = `A${Number(regeneratedLabel.slice(1)) + 1}`;
  await expect(
    lockedRegenerateDialog.getByText(`Form ${nextLabel}`, { exact: true }),
  ).toBeVisible();
  await lockedRegenerateDialog.getByRole('button', { name: 'Cancel' }).click();

  const printPath = new URL(page.url()).pathname;
  await page.context().clearCookies();
  await page.goto(printPath);
  for (const label of labels) {
    await expect(
      page.getByRole('button', { name: new RegExp(`^Form ${label}(?: Previewing)?$`) }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: `Archive Form ${regeneratedLabel}` }).click();
  const archiveDialog = page.getByRole('dialog', {
    name: `Archive Form ${regeneratedLabel}`,
  });
  await expect(
    archiveDialog.getByText(/preview or download it under Previous forms/),
  ).toBeVisible();
  await archiveDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^Form ${regeneratedLabel}`) }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Archive Form ${regeneratedLabel}` }).click();
  await archiveDialog.getByRole('button', { name: 'Archive form' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^Form ${newLabel}`) })).toBeFocused();
  await page.getByText(/^Previous forms \(/).click();
  await expect(
    page.getByRole('button', { name: `Form ${regeneratedLabel}`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Form ${regeneratedLabel}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Student copy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: `Form ${regeneratedLabel} Previewing` }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(downloadMenu(page)).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: `Archive Form ${newLabel}` })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: `Archive Form ${newLabel}` })).toBeDisabled();
  expect(
    (await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })).map(
      (form) => form.label,
    ),
  ).toEqual([newLabel]);
});

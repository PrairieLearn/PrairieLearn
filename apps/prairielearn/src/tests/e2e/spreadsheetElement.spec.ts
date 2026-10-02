import type { Locator } from '@playwright/test';
import axe from 'axe-core';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test.setTimeout(120_000);

// Grading recalculates every spreadsheet element on the page, which can take tens of
// seconds when several Playwright workers share one machine.
const GRADING_TIMEOUT = 60_000;

async function editCell(grid: Locator, address: string, value: string) {
  const cell = grid.getByRole('gridcell', {
    name: new RegExp(`^${address}, editable`),
  });
  await cell.dblclick();
  const editor = grid.getByRole('textbox', { name: `Edit cell ${address}` });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+A');
  await editor.fill(value);
  await editor.press('Enter');
}

test('uses spreadsheet-style click and typing behavior', async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'spreadsheetElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const parameterDemo = page.getByRole('region', {
    name: 'Parameter and DataFrame workbook',
  });
  const grid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Inputs',
  });
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');
  const b2 = grid.getByRole('gridcell', { name: /^B2, editable/ });
  const b2CellEditor = grid.getByRole('textbox', { name: 'Edit cell B2' });
  const b2FormulaBar = parameterDemo.getByLabel('Formula for B2');

  await b2.click();
  await expect(b2).toBeFocused();
  await expect(b2CellEditor).toHaveCount(0);

  await b2.click();
  await expect(b2CellEditor).toHaveCount(0);

  await b2.press('F2');
  await expect(b2CellEditor).toHaveCount(0);

  await b2.focus();
  await page.keyboard.type('987');
  await expect(b2CellEditor).toBeFocused();
  await expect(b2CellEditor).toHaveValue('987');
  await expect(rawAnswer).toHaveValue(/"B2":987/);
  await b2CellEditor.press('Escape');
  await expect(b2).toContainText('1');
  await expect(b2FormulaBar).toHaveValue('1');
  await expect(rawAnswer).not.toHaveValue(/"B2"/);

  await b2.focus();
  await page.keyboard.type('987');
  await expect(b2CellEditor).toHaveValue('987');
  await b2CellEditor.press('Enter');
  await expect(b2).toContainText('987');
  await expect(grid.getByRole('gridcell', { name: /^B3, editable/ })).toBeFocused();

  await b2.dblclick();
  await expect(b2CellEditor).toHaveValue('987');
});

test('highlights formulas in the formula bar', async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'spreadsheetElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const parameterDemo = page.getByRole('region', {
    name: 'Parameter and DataFrame workbook',
  });
  const grid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Inputs',
  });
  const formulaBar = parameterDemo.getByLabel('Formula for B2');
  const highlight = parameterDemo.locator('.pl-spreadsheet-formula-highlight');

  await grid.getByRole('gridcell', { name: /^B2, editable/ }).click();
  await formulaBar.fill('plain text');
  await expect(highlight).toHaveCount(0);

  await formulaBar.fill('=SUM($B$3:B4)+B3+"x"');
  await expect(highlight).toHaveText('=SUM($B$3:B4)+B3+"x" ');
  await expect(highlight.locator('.pl-spreadsheet-tok-function')).toHaveText('SUM');
  await expect(highlight.locator('.pl-spreadsheet-tok-range')).toHaveClass(
    /pl-spreadsheet-ref-color-0/,
  );
  await expect(highlight.locator('.pl-spreadsheet-tok-ref')).toHaveClass(
    /pl-spreadsheet-ref-color-1/,
  );
  await expect(highlight.locator('.pl-spreadsheet-tok-string')).toHaveText('"x"');
  await expect(highlight).toHaveAttribute('aria-hidden', 'true');
});

test('suggests functions in the formula bar', async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'spreadsheetElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const parameterDemo = page.getByRole('region', {
    name: 'Parameter and DataFrame workbook',
  });
  const grid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Inputs',
  });
  const formulaBar = parameterDemo.getByRole('combobox', { name: 'Formula for B2' });
  const suggestions = parameterDemo.getByRole('listbox', { name: 'Function suggestions' });
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');

  await grid.getByRole('gridcell', { name: /^B2, editable/ }).click();
  await formulaBar.fill('');
  await formulaBar.pressSequentially('=1+su');
  await expect(suggestions.getByRole('option')).toHaveText([
    /^SUM /,
    /^SUMIF /,
    /^SUMIFS /,
    /^SUMPRODUCT /,
  ]);
  await formulaBar.press('ArrowDown');
  await expect(suggestions.getByRole('option', { selected: true })).toHaveText(/^SUMIF /);
  await formulaBar.press('Enter');
  await expect(formulaBar).toHaveValue('=1+SUMIF(');
  await expect(suggestions).toHaveCount(0);
  await expect(parameterDemo.getByText('SUMIF(range, criteria, [sum_range])')).toBeVisible();
  await expect(parameterDemo.getByRole('status')).toHaveText('SUMIF, argument range');

  await formulaBar.pressSequentially('A3:B3, ">0")+ma');
  await formulaBar.press('Escape');
  await expect(suggestions).toHaveCount(0);
  await expect(formulaBar).toHaveValue('=1+SUMIF(A3:B3, ">0")+ma');
  await formulaBar.pressSequentially('x');
  await suggestions.getByRole('option', { name: /^MAX / }).click();
  await expect(formulaBar).toBeFocused();
  await expect(formulaBar).toHaveValue('=1+SUMIF(A3:B3, ">0")+MAX(');

  await formulaBar.pressSequentially('C2)');
  await formulaBar.press('Enter');
  await expect(rawAnswer).toHaveValue(/"B2":"=1\+SUMIF\(A3:B3, \\">0\\"\)\+MAX\(C2\)"/);
});

test('supports accessible local editing and trusted submission', async ({
  page,
  context,
  courseInstance,
}) => {
  const thirdPartyRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['localhost', '127.0.0.1'].includes(url.hostname)
    ) {
      thirdPartyRequests.push(request.url());
    }
  });

  const question = await selectQuestionByQid({
    qid: 'spreadsheetElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const parameterDemo = page.getByRole('region', {
    name: 'Parameter and DataFrame workbook',
  });
  const csvDemo = page.getByRole('region', {
    name: 'CSV source with a hidden output',
  });
  const tsvDemo = page.getByRole('region', {
    name: 'TSV sources combined as a sheetbook',
  });
  const xlsxDemo = page.getByRole('region', {
    name: 'XLSX workbook with a private worksheet',
  });
  const grid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Inputs',
  });
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');
  await expect(grid).toBeVisible();
  await expect(parameterDemo.getByRole('tab', { name: 'Inputs' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const csvGrid = csvDemo.getByRole('grid', {
    name: 'CSV budget workbook, sheet CsvBudget',
  });
  await expect(csvGrid.getByRole('columnheader', { name: 'A', exact: true })).toBeVisible();
  await expect(csvGrid.getByRole('columnheader', { name: 'C', exact: true })).toBeVisible();
  await expect(csvGrid.getByRole('columnheader', { name: 'D', exact: true })).toHaveCount(0);
  const csvOptions = await csvDemo
    .locator('.pl-spreadsheet-root')
    .evaluate((element) => atob((element as HTMLElement).dataset.options ?? ''));
  expect(csvOptions).not.toContain('SERVER_ONLY_CSV');
  expect(csvOptions).not.toContain('=D2=12');

  const tsvGrid = tsvDemo.getByRole('grid', {
    name: 'TSV rate workbook, sheet Rates',
  });
  await expect(tsvGrid).toBeVisible();
  await expect(tsvDemo.getByRole('tab', { name: 'Rates', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tsvDemo.getByRole('tab', { name: 'RateSummary' })).toBeVisible();
  const tsvOptions = await tsvDemo
    .locator('.pl-spreadsheet-root')
    .evaluate((element) => atob((element as HTMLElement).dataset.options ?? ''));
  expect(tsvOptions).not.toContain('SERVER_ONLY_TSV');
  expect(tsvOptions).not.toContain('=B1=22');

  const xlsxGrid = xlsxDemo.getByRole('grid', {
    name: 'XLSX workbook, sheet XlsxInputs',
  });
  await expect(xlsxGrid).toBeVisible();
  await expect(xlsxDemo.getByRole('tab', { name: 'XlsxSummary' })).toBeVisible();
  await expect(xlsxDemo.getByRole('tab', { name: 'XlsxChecks' })).toHaveCount(0);
  const xlsxOptions = await xlsxDemo
    .locator('.pl-spreadsheet-root')
    .evaluate((element) => atob((element as HTMLElement).dataset.options ?? ''));
  expect(xlsxOptions).not.toContain('SERVER_ONLY_XLSX');
  expect(xlsxOptions).not.toContain('=XlsxSummary!B1=22');

  const b2 = grid.getByRole('gridcell', { name: /^B2, editable/ });
  await b2.dblclick();
  const b2CellEditor = grid.getByRole('textbox', { name: 'Edit cell B2' });
  const b2FormulaBar = parameterDemo.getByLabel('Formula for B2');
  await b2CellEditor.fill('30');
  await expect(b2FormulaBar).toHaveValue('1');
  await b2CellEditor.press('Enter');
  await expect(b2).toContainText('30');

  await b2.click();
  await expect(b2FormulaBar).toHaveValue('30');
  await b2FormulaBar.fill('31');
  await expect(b2).toContainText('30');
  await b2FormulaBar.press('Enter');
  await expect(b2).toContainText('31');

  await b2.dblclick();
  const canceledB2Editor = grid.getByRole('textbox', { name: 'Edit cell B2' });
  await canceledB2Editor.fill('999');
  await expect(rawAnswer).toHaveValue(/"B2":999/);
  await canceledB2Editor.press('Escape');
  await expect(b2).toContainText('31');
  await expect(b2FormulaBar).toHaveValue('31');
  await expect(rawAnswer).toHaveValue(/"B2":31/);

  await b2.press('Enter');
  const b3 = grid.getByRole('gridcell', { name: /^B3, editable/ });
  await expect(b3).toBeFocused();
  await b3.press('Shift+Enter');
  await expect(b2).toBeFocused();
  await b2.press('Tab');
  const c2 = grid.getByRole('gridcell', { name: /^C2, editable/ });
  await expect(c2).toBeFocused();
  await c2.press('Shift+Tab');
  await expect(b2).toBeFocused();

  const d3 = grid.getByRole('gridcell', { name: /^D3, editable/ });
  const b2Box = await b2.boundingBox();
  const d3Box = await d3.boundingBox();
  if (!b2Box || !d3Box) throw new Error('Expected spreadsheet cells to have bounding boxes');
  await page.mouse.move(b2Box.x + b2Box.width / 2, b2Box.y + b2Box.height / 2);
  await page.mouse.down();
  await page.mouse.move(d3Box.x + d3Box.width / 2, d3Box.y + d3Box.height / 2);
  await page.mouse.up();
  await expect(grid.locator('.pl-spreadsheet-cell-selected')).toHaveCount(6);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');

  await editCell(grid, 'B2', '3');
  await editCell(grid, 'C2', '4');
  await editCell(grid, 'D2', '=1/0');
  await expect(grid.getByRole('gridcell', { name: /^D2, editable/ })).toContainText('#DIV/0!');
  await expect(parameterDemo.getByRole('status')).toContainText('#DIV/0!');
  await editCell(grid, 'D2', '=B2*C2');

  await expect(rawAnswer).toHaveValue(/"B2":3/);
  await expect(rawAnswer).not.toHaveValue(/"D2"/);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('7'));
  await b3.click();
  const formulaBar = parameterDemo.getByLabel('Formula for B3');
  await formulaBar.fill('17');
  await expect(rawAnswer).toHaveValue(/"B3":17/);
  await formulaBar.press('Escape');
  await expect(rawAnswer).not.toHaveValue(/"B3"/);

  await b3.click();
  await b3.press('ControlOrMeta+V');
  await expect(rawAnswer).toHaveValue(/"B3":7/);
  await parameterDemo.getByRole('button', { name: 'Undo' }).click();
  await expect(rawAnswer).not.toHaveValue(/"B3"/);

  await grid.getByRole('gridcell', { name: /^D2, editable/ }).click();
  await parameterDemo.getByRole('button', { name: 'Fill down' }).click();
  await expect(rawAnswer).toHaveValue(/[=]B3\*C3/);
  await parameterDemo.getByRole('button', { name: 'Undo' }).click();
  await expect(rawAnswer).not.toHaveValue(/[=]B3\*C3/);
  await parameterDemo.getByRole('button', { name: 'Redo' }).click();
  await expect(rawAnswer).toHaveValue(/[=]B3\*C3/);
  await parameterDemo.getByRole('button', { name: 'Undo' }).click();

  const inputsTab = parameterDemo.getByRole('tab', { name: 'Inputs' });
  const summaryTab = parameterDemo.getByRole('tab', { name: 'Summary' });
  await inputsTab.focus();
  await inputsTab.press('ArrowRight');
  await expect(summaryTab).toBeFocused();
  await expect(summaryTab).toHaveAttribute('aria-selected', 'true');
  const summaryGrid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Summary',
  });
  const readOnlyCell = summaryGrid.getByRole('gridcell', { name: /^A1, read-only/ });
  await readOnlyCell.click();
  await expect(summaryGrid.getByRole('textbox', { name: 'Edit cell A1' })).toHaveCount(0);
  await expect(parameterDemo.getByLabel('Formula for A1')).toBeDisabled();
  await expect(parameterDemo.getByRole('status')).toContainText('A1, read-only');

  await inputsTab.click();
  const firstCell = grid.getByRole('gridcell', { name: /^A1, read-only/ });
  await firstCell.click();
  await firstCell.press('Shift+Tab');
  expect(await grid.evaluate((element) => element.contains(document.activeElement))).toBe(false);

  const lastCell = grid.getByRole('gridcell', { name: /^D4, editable/ });
  await lastCell.click();
  await lastCell.press('Tab');
  expect(await grid.evaluate((element) => element.contains(document.activeElement))).toBe(false);

  await page.addScriptTag({ content: axe.source });
  const accessibilityResults = await page.evaluate(async () => {
    return await window.axe.run('.pl-spreadsheet', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  });
  expect(accessibilityResults.violations).toEqual([]);

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: GRADING_TIMEOUT });
  const submissionTable = page.getByRole('table', { name: 'Inputs', exact: true });
  await expect(submissionTable).toBeVisible();
  await expect(submissionTable.getByRole('columnheader', { name: 'D' })).toBeVisible();
  await expect(submissionTable.getByRole('rowheader', { name: '2' })).toBeVisible();
  const submissionD2 = submissionTable.getByRole('cell', { name: 'Cell D2' });
  const submissionD2Value = submissionD2.getByText('12', { exact: true });
  const submissionD2Formula = submissionD2.getByText('=B2*C2', { exact: true });
  await expect(submissionD2Value).toBeVisible();
  await expect(submissionD2Formula).toBeHidden();
  const formulaToggle = page.getByRole('switch', {
    name: 'Show formulas for Spreadsheet test',
  });
  await expect(formulaToggle).not.toBeChecked();
  await formulaToggle.check();
  await expect(submissionD2Value).toBeHidden();
  await expect(submissionD2Formula).toBeVisible();
  await formulaToggle.uncheck();
  await expect(submissionD2Value).toBeVisible();
  await expect(submissionD2Formula).toBeHidden();
  await page.addScriptTag({ content: axe.source });
  const readOnlyAccessibilityResults = await page.evaluate(async () => {
    return await window.axe.run('[data-testid="submission-block"] .pl-spreadsheet', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  });
  expect(readOnlyAccessibilityResults.violations).toEqual([]);

  await page.reload();
  await expect(rawAnswer).toHaveValue(/"B2":3/);
  expect(thirdPartyRequests).toEqual([]);
});

test('persists active formula drafts and rejected formulas', async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'spreadsheetElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const parameterDemo = page.getByRole('region', {
    name: 'Parameter and DataFrame workbook',
  });
  const grid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Inputs',
  });
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');

  await grid.getByRole('gridcell', { name: /^D2, editable/ }).dblclick();
  const editor = grid.getByRole('textbox', { name: 'Edit cell D2' });
  await editor.fill('=1/0');
  await expect(rawAnswer).toHaveValue(/[=]1\/0/);
  const formDataAnswer = await rawAnswer.evaluate((input: HTMLInputElement) => {
    input.value = 'stale';
    return new FormData(input.form!).get(input.name);
  });
  expect(formDataAnswer).toContain('=1/0');
  await page.getByRole('button', { name: /Save & Grade/ }).click();

  const submissionTable = page.getByRole('table', { name: 'Inputs', exact: true }).first();
  await expect(
    submissionTable.getByRole('cell', { name: 'Cell D2' }).getByText('#DIV/0!', { exact: true }),
  ).toBeVisible({ timeout: GRADING_TIMEOUT });
  await expect(rawAnswer).toHaveValue(/[=]1\/0/);

  const currentGrid = parameterDemo.getByRole('grid', {
    name: 'Spreadsheet test, sheet Inputs',
  });
  await currentGrid.getByRole('gridcell', { name: /^D2, editable/ }).dblclick();
  const rejectedEditor = currentGrid.getByRole('textbox', { name: 'Edit cell D2' });
  await rejectedEditor.fill('=RAND()');
  await page.getByRole('button', { name: /Save & Grade/ }).click();

  await expect(page.getByText('Function RAND is not supported.').first()).toBeVisible({
    timeout: GRADING_TIMEOUT,
  });
  await expect(
    parameterDemo.getByRole('gridcell', { name: /^D2, editable, #ERROR!/ }),
  ).toContainText('#ERROR!');
  await expect(rawAnswer).toHaveValue(/[=]RAND\(\)/);

  await page.reload();
  await expect(rawAnswer).toHaveValue(/[=]RAND\(\)/);
  await parameterDemo.getByRole('gridcell', { name: /^D2, editable, #ERROR!/ }).dblclick();
  await expect(parameterDemo.getByRole('textbox', { name: 'Edit cell D2' })).toHaveValue('=RAND()');
});

test('keeps file-backed grading cells outside the student range private', async ({
  page,
  courseInstance,
}) => {
  const question = await selectQuestionByQid({
    qid: 'spreadsheetFileElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const grid = page.getByRole('grid', {
    name: 'File-backed spreadsheet test, sheet Inputs',
  });
  await expect(grid.getByRole('columnheader', { name: 'A', exact: true })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'B', exact: true })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'C', exact: true })).toHaveCount(0);

  const decodedOptions = await page
    .locator('.pl-spreadsheet-root')
    .evaluate((element) => atob((element as HTMLElement).dataset.options ?? ''));
  expect(decodedOptions).not.toContain('HIDDEN_SENTINEL');
  expect(decodedOptions).not.toContain('=C2=6');
  const elementHtml = await page
    .locator('.pl-spreadsheet')
    .evaluate((element) => element.outerHTML);
  expect(elementHtml).not.toContain('HIDDEN_SENTINEL');
  expect(elementHtml).not.toContain('=C2=6');

  await editCell(grid, 'A1', '3');
  await editCell(grid, 'A2', '=A1+1');
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');
  await expect(rawAnswer).toHaveValue(/"A1":3/);
  await expect(rawAnswer).not.toHaveValue(/D2|HIDDEN_SENTINEL/);
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: GRADING_TIMEOUT });

  const submissionTable = page
    .getByTestId('submission-block')
    .getByRole('table', { name: 'Inputs' });
  await expect(submissionTable.getByRole('columnheader', { name: 'A', exact: true })).toBeVisible();
  await expect(submissionTable.getByRole('columnheader', { name: 'B', exact: true })).toBeVisible();
  await expect(submissionTable.getByRole('columnheader', { name: 'C', exact: true })).toHaveCount(
    0,
  );
  await expect(submissionTable).not.toContainText('HIDDEN_SENTINEL');
});

test('rejects file-backed formulas that reach hidden cells', async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'spreadsheetFileElement',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  const grid = page.getByRole('grid', {
    name: 'File-backed spreadsheet test, sheet Inputs',
  });
  for (const formula of [
    '=C1',
    '=VLOOKUP(2,A1:C2,3,FALSE)',
    '=INDEX(A:A,1)',
    '=IFERROR(MATCH(0,Inputs!A1:Hidden!A9,0),0)',
  ]) {
    await editCell(grid, 'A1', formula);
    await expect(page.getByRole('status')).toContainText('outside declared student ranges');
  }

  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(
    page.getByText('cannot reference cells outside declared student ranges').first(),
  ).toBeVisible({ timeout: GRADING_TIMEOUT });
  // The instructor preview's debug panels show the private grading data, so only
  // check the question and submission content that students also see.
  await expect(page.locator('.question-container')).not.toContainText('HIDDEN_SENTINEL');
});

declare global {
  interface Window {
    axe: typeof axe;
  }
}

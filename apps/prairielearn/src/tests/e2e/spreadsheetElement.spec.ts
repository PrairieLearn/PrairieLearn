import type { Locator } from '@playwright/test';
import axe from 'axe-core';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test.setTimeout(120_000);

async function editCell(grid: Locator, address: string, value: string) {
  const cell = grid.getByRole('gridcell', {
    name: new RegExp(`^${address}, editable`),
  });
  await cell.click();
  await cell.press('Enter');
  const editor = grid.getByRole('textbox', { name: `Edit cell ${address}` });
  await editor.press('ControlOrMeta+A');
  await editor.fill(value);
  await editor.press('Enter');
}

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
  await expect(grid).toBeVisible();
  await expect(parameterDemo.getByRole('tab', { name: 'Inputs' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const csvGrid = csvDemo.getByRole('grid', {
    name: 'CSV budget workbook, sheet CsvBudget',
  });
  await expect(csvGrid.getByRole('columnheader', { name: 'B', exact: true })).toBeVisible();
  await expect(csvGrid.getByRole('columnheader', { name: 'D', exact: true })).toBeVisible();
  await expect(csvGrid.getByRole('columnheader', { name: 'A', exact: true })).toHaveCount(0);
  await expect(csvGrid.getByRole('columnheader', { name: 'E', exact: true })).toHaveCount(0);
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

  await editCell(grid, 'B2', '3');
  await editCell(grid, 'C2', '4');
  await editCell(grid, 'D2', '=1/0');
  await expect(parameterDemo.getByRole('status')).toContainText('#DIV/0!');
  await editCell(grid, 'D2', '=B2*C2');

  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');
  await expect(rawAnswer).toHaveValue(/"B2":3/);
  await expect(rawAnswer).not.toHaveValue(/"D2"/);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('7'));
  const b3 = grid.getByRole('gridcell', { name: /^B3, editable/ });
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
  await summaryGrid.getByRole('gridcell', { name: /^B1, read-only/ }).click();
  await expect(parameterDemo.getByLabel('Formula for B1')).toBeDisabled();
  await expect(parameterDemo.getByRole('status')).toContainText('B1, read-only');

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
  await expect(page.getByText(/100%/).first()).toBeVisible();
  const submissionTable = page.getByRole('table', { name: 'Inputs', exact: true });
  await expect(submissionTable).toBeVisible();
  await expect(submissionTable.getByRole('columnheader', { name: 'D' })).toBeVisible();
  await expect(submissionTable.getByRole('rowheader', { name: '2' })).toBeVisible();
  await expect(submissionTable.getByRole('cell', { name: 'Cell D2' })).toHaveText('12');
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
  await expect(grid.getByRole('columnheader', { name: 'B', exact: true })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'C', exact: true })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'A', exact: true })).toHaveCount(0);
  await expect(grid.getByRole('columnheader', { name: 'D', exact: true })).toHaveCount(0);

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

  await editCell(grid, 'B2', '3');
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');
  await expect(rawAnswer).toHaveValue(/"B2":3/);
  await expect(rawAnswer).not.toHaveValue(/A1|D2|HIDDEN_SENTINEL/);
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await expect(page.getByText(/100%/).first()).toBeVisible();

  const submissionTable = page.getByRole('table', { name: 'Inputs' });
  await expect(submissionTable.getByRole('columnheader', { name: 'B', exact: true })).toBeVisible();
  await expect(submissionTable.getByRole('columnheader', { name: 'C', exact: true })).toBeVisible();
  await expect(submissionTable.getByRole('columnheader', { name: 'A', exact: true })).toHaveCount(
    0,
  );
  await expect(submissionTable.getByRole('columnheader', { name: 'D', exact: true })).toHaveCount(
    0,
  );
  await expect(submissionTable).not.toContainText('HIDDEN_SENTINEL');
});

test('rejects a file-backed formula that references a hidden cell', async ({
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
  await editCell(grid, 'B2', '=D2');
  await expect(page.getByRole('status')).toContainText('outside declared student ranges');
});

declare global {
  interface Window {
    axe: typeof axe;
  }
}

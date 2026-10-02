import type { Locator } from '@playwright/test';
import axe from 'axe-core';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test.setTimeout(120_000);

// Grading recalculates every spreadsheet element on the page, which can take tens of
// seconds when several Playwright workers share one machine.
const GRADING_TIMEOUT = 60_000;

function formulaBarFor(grid: Locator, address: string) {
  return grid
    .locator('xpath=ancestor::div[contains(@class, "pl-spreadsheet-editor")]')
    .getByRole('combobox', { name: `Formula for ${address}` });
}

async function editCell(grid: Locator, address: string, value: string) {
  const cell = grid.getByRole('gridcell', {
    name: new RegExp(`^${address}, editable`),
  });
  await cell.dblclick();
  const formulaBar = formulaBarFor(grid, address);
  await expect(formulaBar).toBeFocused();
  await formulaBar.fill(value);
  await formulaBar.press('Enter');
}

test('edits cells in the formula bar', async ({ page, courseInstance }) => {
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
  const b2FormulaBar = parameterDemo.getByRole('combobox', { name: 'Formula for B2' });
  const formulaView = parameterDemo.locator('.pl-spreadsheet-formula-view');

  await b2.click();
  await expect(b2).toBeFocused();
  await b2.click();
  await expect(b2).toBeFocused();
  await expect(grid.getByRole('textbox')).toHaveCount(0);

  await page.keyboard.type('987');
  await expect(b2FormulaBar).toBeFocused();
  await expect(b2FormulaBar).toHaveValue('987');
  // Moving editing into the bar flashes it.
  expect(await formulaView.evaluate((view) => view.getAnimations().length)).toBeGreaterThan(0);
  await expect(b2).toContainText('987');
  await expect(rawAnswer).toHaveValue(/"B2":987/);
  await b2FormulaBar.press('Escape');
  await expect(b2).toBeFocused();
  await expect(b2).toContainText('1');
  await expect(b2FormulaBar).toHaveValue('1');
  await expect(rawAnswer).not.toHaveValue(/"B2"/);

  await page.keyboard.type('987');
  await b2FormulaBar.press('Enter');
  await expect(b2).toContainText('987');
  await expect(grid.getByRole('gridcell', { name: /^B3, editable/ })).toBeFocused();

  await b2.dblclick();
  await expect(b2FormulaBar).toBeFocused();
  await expect(b2FormulaBar).toHaveValue('987');
  await b2FormulaBar.press('Escape');
  await b2.press('F2');
  await expect(b2FormulaBar).toBeFocused();
  await b2FormulaBar.press('End');
  await b2FormulaBar.press('0');
  await b2FormulaBar.press('Tab');
  await expect(b2).toContainText('9870');
  await expect(grid.getByRole('gridcell', { name: /^C2, editable/ })).toBeFocused();
  await expect(grid.getByRole('textbox')).toHaveCount(0);

  await page.keyboard.press('Delete');
  await expect(grid.getByRole('gridcell', { name: /^C2, editable, blank/ })).toBeVisible();

  await b2.click();
  await page.keyboard.type('=1/0');
  await expect(parameterDemo.locator('.pl-spreadsheet-value-error')).toHaveText(
    '#DIV/0! Division by zero.',
  );
  await b2FormulaBar.press('Backspace');
  await b2FormulaBar.press('Backspace');
  await expect(parameterDemo.locator('.pl-spreadsheet-value-error')).toHaveText('');
});

test('draws formulas as tiles in the formula bar', async ({ page, courseInstance }) => {
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
  const view = parameterDemo.locator('.pl-spreadsheet-formula-view');

  await grid.getByRole('gridcell', { name: /^B2, editable/ }).click();
  await formulaBar.fill('plain text');
  await expect(view).toHaveText('plain text');
  await expect(view.locator('.pl-spreadsheet-tile')).toHaveCount(0);

  await formulaBar.fill('=SUM($B$3:B4)+B3+"x"');
  await expect(view).toHaveAttribute('aria-hidden', 'true');
  await expect(view.locator('.pl-spreadsheet-tile')).toHaveText([
    '=',
    'SUM(',
    '$B$3:B4',
    ')',
    '+',
    'B3',
    '+',
    '"x"',
  ]);
  await expect(view.locator('.pl-spreadsheet-tile-shard').first()).toHaveClass(
    /pl-spreadsheet-left-convex.*pl-spreadsheet-right-concave/,
  );
  await expect(view.locator('.pl-spreadsheet-tile-reference').first()).toHaveClass(
    /pl-spreadsheet-ref-fill-0/,
  );
  await expect(view.locator('.pl-spreadsheet-tile-reference').last()).toHaveClass(
    /pl-spreadsheet-ref-fill-1/,
  );
  await expect(view.locator('.pl-spreadsheet-tile-string')).toHaveText('"x"');

  // Clicking a tile places the caret in the hidden input at the matching offset.
  const b3Tile = view.locator('.pl-spreadsheet-tile-reference').last();
  const b3Box = await b3Tile.boundingBox();
  if (!b3Box) throw new Error('Expected the B3 tile to have a bounding box');
  await page.mouse.click(b3Box.x + 2, b3Box.y + b3Box.height / 2);
  await expect(formulaBar).toBeFocused();
  expect(await formulaBar.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(14);
  await page.mouse.click(b3Box.x + b3Box.width - 2, b3Box.y + b3Box.height / 2);
  expect(await formulaBar.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(16);

  await formulaBar.fill('=(A2)');
  await expect(view.locator('.pl-spreadsheet-hole-name')).toHaveClass(/is-optional/);
});

test('shows live values while editing in the formula bar', async ({ page, courseInstance }) => {
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
  const cell = (address: string) =>
    grid.getByRole('gridcell', { name: new RegExp(`^${address}, `) });
  const formulaBar = parameterDemo.getByLabel('Formula for B2');
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');

  await cell('B2').click();
  await formulaBar.fill('=1+2');
  await expect(cell('B2')).toHaveText('3');
  // D2 is =B2*C2, so dependent cells update too.
  await expect(cell('D2')).toHaveText('6');
  await formulaBar.press('Escape');
  await expect(cell('B2')).toHaveText('1');
  await expect(cell('D2')).toHaveText('2');
  await expect(rawAnswer).not.toHaveValue(/"B2"/);
});

test('inserts references by pointing at cells', async ({ page, courseInstance }) => {
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
  const cell = (address: string) =>
    grid.getByRole('gridcell', { name: new RegExp(`^${address}, `) });
  const formulaBar = parameterDemo.getByRole('combobox', { name: 'Formula for B2' });
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');

  await cell('B2').click();
  await formulaBar.fill('=SUM(');
  await grid.scrollIntoViewIfNeeded();
  const c2Box = await cell('C2').boundingBox();
  const d3Box = await cell('D3').boundingBox();
  if (!c2Box || !d3Box) throw new Error('Expected spreadsheet cells to have bounding boxes');
  await page.mouse.move(c2Box.x + c2Box.width / 2, c2Box.y + c2Box.height / 2);
  await page.mouse.down();
  await page.mouse.move(d3Box.x + d3Box.width / 2, d3Box.y + d3Box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(formulaBar).toHaveValue('=SUM(C2:D3');
  await expect(formulaBar).toBeFocused();
  await expect(grid.locator('.pl-spreadsheet-ref-cell')).toHaveCount(4);

  await cell('A2').click();
  await expect(formulaBar).toHaveValue('=SUM(A2');

  // After typing, the arrow keys move the caret even where a reference could go.
  await formulaBar.pressSequentially(')+');
  await formulaBar.press('ArrowLeft');
  await expect(formulaBar).toHaveValue('=SUM(A2)+');
  expect(await formulaBar.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(8);
  await formulaBar.press('ArrowRight');

  // Right after pointing, they move and resize the reference instead.
  await cell('C3').click();
  await formulaBar.press('Shift+ArrowDown');
  await expect(formulaBar).toHaveValue('=SUM(A2)+C3:C4');
  await formulaBar.press('ArrowRight');
  await expect(formulaBar).toHaveValue('=SUM(A2)+D4');
  await formulaBar.press('Shift+ArrowLeft');
  await expect(formulaBar).toHaveValue('=SUM(A2)+C4:D4');

  await formulaBar.pressSequentially('*2');
  await formulaBar.press('ArrowLeft');
  await expect(formulaBar).toHaveValue('=SUM(A2)+C4:D4*2');

  await formulaBar.press('Enter');
  await expect(cell('B2')).toBeFocused();
  await expect(grid.locator('.pl-spreadsheet-ref-cell')).toHaveCount(0);
  await expect(rawAnswer).toHaveValue(/"B2":"=SUM\(A2\)\+C4:D4\*2"/);
});

test('shows the missing parts of a formula as holes', async ({ page, courseInstance }) => {
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
  const highlight = parameterDemo.locator('.pl-spreadsheet-formula-view');
  const status = parameterDemo.getByRole('status');
  const rawAnswer = page.locator('input.js-pl-spreadsheet-input[name="model"]');

  await grid.getByRole('gridcell', { name: /^B2, editable/ }).click();
  await formulaBar.fill('=SUMIF(');
  await expect(
    highlight.locator('.pl-spreadsheet-hole-argument.pl-spreadsheet-hole-range'),
  ).toHaveClass(/is-current/);
  await expect(highlight.locator('.pl-spreadsheet-hole-delimiter')).toHaveCount(1);

  await formulaBar.fill('=A2+B2');
  await formulaBar.press('ArrowLeft');
  await formulaBar.press('ArrowLeft');
  await formulaBar.press('Backspace');
  await expect(formulaBar).toHaveValue('=A2B2');
  await expect(highlight.locator('.pl-spreadsheet-hole-operator')).toHaveClass(/is-current/);
  await expect(parameterDemo.getByText('An operator is missing between two values.')).toBeVisible();
  await formulaBar.press('*');
  await expect(formulaBar).toHaveValue('=A2*B2');
  await expect(highlight.locator('.pl-spreadsheet-hole')).toHaveCount(0);

  await formulaBar.fill('=IF(A2>0,,1)+');
  await formulaBar.press('Home');
  await formulaBar.press('Tab');
  await expect(status).toHaveText('IF is missing value_if_true.');
  await expect(formulaBar).toBeFocused();
  await formulaBar.press('Tab');
  await expect(status).toHaveText('A value is missing.');
  await formulaBar.press('Shift+Tab');
  await formulaBar.pressSequentially('A3');
  await expect(formulaBar).toHaveValue('=IF(A2>0,A3,1)+');

  await formulaBar.fill('=ROUND(SUM(A2:B2');
  await formulaBar.press('Enter');
  await expect(rawAnswer).toHaveValue(/"B2":"=ROUND\(SUM\(A2:B2\)\)"/);
  await expect(status).toHaveText('B2: ROUND is missing digits.');
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
  await expect(formulaBar).toHaveValue('=1+SUMIF(,');
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

test('fills a row or column by dragging the fill handle', async ({ page, courseInstance }) => {
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
  const undo = parameterDemo.getByRole('button', { name: 'Undo' });
  const cell = (address: string) =>
    grid.getByRole('gridcell', { name: new RegExp(`^${address}, editable`) });

  async function dragFill(from: string, to: string) {
    await cell(from).click();
    await grid.locator('.rdg-cell-drag-handle').dragTo(cell(to));
  }

  // The fill follows the dominant direction of the drag rather than covering C3:D4.
  await dragFill('D2', 'C4');
  await expect(rawAnswer).toHaveValue(/"D3":"=B3\*C3"/);
  await expect(rawAnswer).toHaveValue(/"D4":"=B4\*C4"/);
  await expect(rawAnswer).not.toHaveValue(/"C[34]"/);
  // One drag is one undoable change.
  await undo.click();
  await expect(rawAnswer).not.toHaveValue(/"D[34]"/);

  await editCell(grid, 'D4', '=B4+C4');
  await dragFill('D4', 'D2');
  await expect(rawAnswer).toHaveValue(/"D3":"=B3\+C3"/);
  await expect(rawAnswer).toHaveValue(/"D2":"=B2\+C2"/);
  await undo.click();
  await expect(rawAnswer).not.toHaveValue(/"D3"/);

  await editCell(grid, 'B3', '=B2+1');
  await dragFill('B3', 'D3');
  await expect(rawAnswer).toHaveValue(/"C3":"=C2\+1"/);
  await expect(rawAnswer).toHaveValue(/"D3":"=D2\+1"/);
  await undo.click();
  await expect(rawAnswer).not.toHaveValue(/"[CD]3"/);

  await editCell(grid, 'D3', '=D2*10');
  await dragFill('D3', 'B3');
  await expect(rawAnswer).toHaveValue(/"C3":"=C2\*10"/);
  await expect(rawAnswer).toHaveValue(/"B3":"=B2\*10"/);
});

test('pops a spreadsheet out to fill the window', async ({ page, courseInstance }) => {
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
  const openButton = parameterDemo.getByRole('button', { name: 'Open spreadsheet full screen' });
  const popup = page.getByRole('dialog', { name: 'Spreadsheet test' });
  const b2 = grid.getByRole('gridcell', { name: /^B2, editable/ });

  await openButton.click();
  await expect(popup).toBeVisible();
  const viewport = page.viewportSize();
  const box = await popup.boundingBox();
  expect(box?.x).toBeGreaterThan(0);
  expect(box?.width).toBeGreaterThan((viewport?.width ?? 0) - 64);
  expect(box?.height).toBeGreaterThan((viewport?.height ?? 0) - 64);

  // Edits made in the popup are kept when it closes.
  await editCell(grid, 'B2', '42');
  await popup.getByRole('button', { name: 'Close full-screen spreadsheet' }).click();
  await expect(popup).toBeHidden();
  await expect(openButton).toBeFocused();
  await expect(b2).toContainText('42');
  await expect(rawAnswer).toHaveValue(/"B2":42/);

  await openButton.click();
  await page.mouse.click(4, 4);
  await expect(popup).toBeHidden();

  // Escape leaves an edit in progress before it closes the popup.
  await openButton.click();
  await b2.click();
  await page.keyboard.type('7');
  await page.keyboard.press('Escape');
  await expect(popup).toBeVisible();
  await expect(b2).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(b2).toContainText('42');
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
  const b2FormulaBar = parameterDemo.getByLabel('Formula for B2');
  await expect(b2FormulaBar).toBeFocused();
  await b2FormulaBar.fill('30');
  await expect(b2).toContainText('30');
  await b2FormulaBar.press('Enter');
  await expect(grid.getByRole('gridcell', { name: /^B3, editable/ })).toBeFocused();
  await expect(b2).toContainText('30');

  await b2.click();
  await expect(b2FormulaBar).toHaveValue('30');
  await b2FormulaBar.fill('31');
  await expect(b2).toContainText('31');
  await b2FormulaBar.press('Enter');
  // Editing that started in the bar returns to the same cell.
  await expect(b2).toBeFocused();
  await expect(b2).toContainText('31');

  await b2.dblclick();
  await b2FormulaBar.fill('999');
  await expect(rawAnswer).toHaveValue(/"B2":999/);
  await b2FormulaBar.press('Escape');
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
  await formulaBarFor(grid, 'D2').fill('=1/0');
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
  await formulaBarFor(currentGrid, 'D2').fill('=RAND()');
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
  await expect(parameterDemo.getByLabel('Formula for D2')).toHaveValue('=RAND()');
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

test('shows submitted workbooks like the editor', async ({ page, courseInstance }) => {
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
  await editCell(grid, 'A1', '3');
  await editCell(grid, 'A2', '=$A$1+2');
  await page.getByRole('button', { name: /Save & Grade/ }).click();

  const submission = page.getByTestId('submission-block');
  const table = submission.getByRole('table', { name: 'Inputs' });
  await expect(table.getByRole('cell', { name: 'Cell A2, incorrect' })).toHaveClass(
    'table-danger',
    {
      timeout: GRADING_TIMEOUT,
    },
  );
  await expect(table.getByRole('cell', { name: 'Cell A1', exact: true })).not.toHaveClass(
    'table-danger',
  );
  await expect(table.getByRole('cell', { name: 'Cell B1', exact: true })).toHaveClass(
    'pl-spreadsheet-cell-readonly',
  );

  const columnWidths = () =>
    table
      .getByRole('columnheader')
      .evaluateAll((headers) => headers.map((header) => header.getBoundingClientRect().width));
  const valueWidths = await columnWidths();
  await submission.getByRole('switch', { name: /Show formulas/ }).check();
  const formula = table.getByRole('cell', { name: 'Cell A2, incorrect' }).getByText('=$A$1+2');
  await expect(formula).toBeVisible();
  // The $ signs in absolute references must not start MathJax typesetting.
  await expect(submission.locator('mjx-container')).toHaveCount(0);
  expect(await columnWidths()).toEqual(valueWidths);
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

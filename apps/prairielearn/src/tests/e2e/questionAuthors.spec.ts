import fs from 'node:fs/promises';
import path from 'node:path';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { selectQuestionByQid } from '../../models/question.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const sql = loadSqlEquiv(import.meta.url);

test('edits authors with keyboard and button entry, cancellation, and persistence', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  const url = `/pl/course/${courseInstance.course_id}/question/${question.id}/settings`;
  const infoPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
  const originalInfo = await fs.readFile(infoPath, 'utf8');
  const original = JSON.parse(originalInfo);
  try {
    await page.goto(url);
    const input = page.getByRole('combobox', { name: 'Authors', exact: true });
    await input.fill('  keyboard-author  ');
    await input.press('Enter');
    const keyboardChip = page.getByRole('button', { name: 'Remove keyboard-author', exact: true });
    await expect(keyboardChip).toBeVisible();
    await input.fill('comma-author');
    await input.press(',');
    await expect(
      page.getByRole('button', { name: 'Remove comma-author', exact: true }),
    ).toBeVisible();
    await input.fill('button-author');
    await page.getByRole('button', { name: 'Add author', exact: true }).click();
    const buttonChip = page.getByRole('button', { name: 'Remove button-author', exact: true });
    await expect(buttonChip).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await input.fill('cancelled-author');
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual(original.authors);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(buttonChip).toHaveCount(0);
    await expect(keyboardChip).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Remove comma-author', exact: true }),
    ).toHaveCount(0);

    for (const uid of original.authors) {
      await page.getByRole('button', { name: `Remove ${uid}`, exact: true }).click();
    }
    await input.fill('saved-author');
    await page.getByRole('button', { name: 'Add author', exact: true }).click();
    const orcidUrl = 'https://orcid.org/0000-0002-1825-0097';
    await input.fill(orcidUrl);
    await input.press('Enter');
    const myself = page.getByRole('button', { name: 'Add myself', exact: true });
    await myself.click();
    await expect(myself).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('load');
    await expect(
      page.getByRole('button', { name: 'Remove saved-author', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /0000-0002-1825-0097/ })).toHaveAttribute(
      'href',
      orcidUrl,
    );
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual([
      'saved-author',
      orcidUrl,
      'dev@example.com',
    ]);
  } finally {
    await fs.writeFile(infoPath, originalInfo);
    await syncCourse(testCoursePath);
  }
});

test('preserves file authors when synced values are unknown', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  const url = `/pl/course/${courseInstance.course_id}/question/${question.id}/settings`;
  const infoPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
  const originalInfo = await fs.readFile(infoPath, 'utf8');
  const original = JSON.parse(originalInfo);
  try {
    await execute(sql.set_authors_unknown, { question_id: question.id });
    await page.goto(url);
    await page.getByLabel('Title', { exact: true }).fill(`${original.title} updated`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('load');
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual(original.authors);

    await execute(sql.set_authors_unknown, { question_id: question.id });
    await page.reload();
    await page.getByRole('button', { name: 'Add myself', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('load');
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual([
      ...original.authors,
      'dev@example.com',
    ]);
  } finally {
    await fs.writeFile(infoPath, originalInfo);
    await syncCourse(testCoursePath);
  }
});

test('saves pending author text with and without other settings changes', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  const question = await selectQuestionByQid({
    qid: 'addNumbers',
    course_id: courseInstance.course_id,
  });
  const url = `/pl/course/${courseInstance.course_id}/question/${question.id}/settings`;
  const infoPath = path.join(testCoursePath, 'questions', 'addNumbers', 'info.json');
  const originalInfo = await fs.readFile(infoPath, 'utf8');
  const original = JSON.parse(originalInfo);
  try {
    await page.goto(url);
    const input = page.getByRole('combobox', { name: 'Authors', exact: true });
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeHidden();
    await input.fill('pending-author');
    await expect(save).toBeVisible();
    await input.clear();
    await expect(save).toBeHidden();
    await input.fill('  pending-author  ');
    await save.click();
    await page.waitForLoadState('load');
    await expect(
      page.getByRole('button', { name: 'Remove pending-author', exact: true }),
    ).toBeVisible();
    expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual([
      ...original.authors,
      'pending-author',
    ]);

    const title = `${original.title} updated`;
    await page.getByLabel('Title', { exact: true }).fill(title);
    const orcidUrl = 'https://orcid.org/0000-0002-1825-0097';
    await input.fill(orcidUrl);
    await save.click();
    await page.waitForLoadState('load');
    await expect(page.getByRole('link', { name: /0000-0002-1825-0097/ })).toBeVisible();
    const saved = JSON.parse(await fs.readFile(infoPath, 'utf8'));
    expect(saved.title).toBe(title);
    expect(saved.authors).toEqual([...original.authors, 'pending-author', orcidUrl]);
  } finally {
    await fs.writeFile(infoPath, originalInfo);
    await syncCourse(testCoursePath);
  }
});

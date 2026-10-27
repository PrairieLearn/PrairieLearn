import fs from 'node:fs/promises';
import path from 'node:path';

import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectQuestionByQid } from '../../models/question.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

test('edits authors with keyboard validation, cancellation, and persistence', async ({
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
  const original = JSON.parse(await fs.readFile(infoPath, 'utf8'));
  const staff = await getOrCreateUser({
    uid: 'token-staff',
    name: 'Token Staff',
    uin: null,
    email: null,
  });
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: staff.uid,
    course_role: 'Viewer',
    authn_user_id: staff.id,
  });
  await page.goto(url);
  const input = page.getByRole('combobox', { name: 'Authors', exact: true });
  await expect(input).toHaveAttribute('placeholder', 'Add an author by UID');
  await expect(page.getByText('Not on course staff', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add author', exact: true })).toHaveCount(0);
  await input.fill('x'.repeat(256));
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill(` ${original.authors[0]} `);
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await input.fill('  keyboard-author  ');
  await input.press('Enter');
  const keyboardChip = page.getByRole('button', { name: 'Remove keyboard-author', exact: true });
  await expect(keyboardChip).toBeVisible();
  await input.fill('comma-author');
  await input.press(',');
  await expect(
    page.getByRole('button', { name: 'Remove comma-author', exact: true }),
  ).toBeVisible();
  expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).toEqual(original.authors);
  await input.fill(' keyboard-author ');
  await input.press(',');
  await expect(keyboardChip).toHaveCount(1);
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(keyboardChip).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove comma-author', exact: true })).toHaveCount(
    0,
  );

  // The existing Tags field still selects predefined options and removes them.
  await page.getByRole('button', { name: 'Show suggestions Tags', exact: true }).click();
  await page.getByRole('listbox').getByText('code', { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove code', exact: true }).click();

  for (const uid of original.authors) {
    await page.getByRole('button', { name: `Remove ${uid}`, exact: true }).click();
  }
  await expect(input).toBeVisible();
  await expect(page.getByText('No authors listed.', { exact: true })).toHaveCount(0);
  await input.fill(staff.uid);
  await input.press('Enter');
  await expect(
    page.getByRole('button', { name: /^Remove Token Staff\s+token-staff$/ }),
  ).toBeVisible();
  await expect(page.getByText('Token Staff', { exact: true })).toBeVisible();
  await expect(page.getByText('Token Staff', { exact: true })).toHaveClass(/text-body/);
  await expect(page.getByText(staff.uid, { exact: true })).toHaveClass(/text-secondary/);
  await input.fill('saved-author');
  await input.press('Enter');
  await expect(page.getByText('saved-author', { exact: true })).toHaveCSS('font-weight', '400');
  for (let i = 0; i < 11; i++) {
    await input.fill(`extra-author-${i}`);
    await input.press(',');
  }
  const myself = page.getByRole('button', { name: 'Add myself', exact: true });
  await myself.click();
  await expect(myself).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove dev@example.com', exact: true }).click();
  await expect(myself).toBeVisible();
  await myself.click();
  await expect(myself).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForLoadState('load');
  await expect(
    page.getByRole('button', { name: 'Remove saved-author', exact: true }),
  ).toBeVisible();
  const saved = JSON.parse(await fs.readFile(infoPath, 'utf8'));
  expect(saved.authors).toContain('saved-author');
  expect(saved.authors.length).toBeGreaterThan(10);
  expect(saved.authors.every((author: unknown) => typeof author === 'string')).toBe(true);
  await page.getByRole('button', { name: 'Remove saved-author', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: 'Remove saved-author', exact: true })).toHaveCount(
    0,
  );
  expect(JSON.parse(await fs.readFile(infoPath, 'utf8')).authors).not.toContain('saved-author');
});

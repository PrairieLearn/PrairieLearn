import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import {
  deleteCoursePermissions,
  insertCoursePermissionsByUserUid,
} from '../../models/course-permissions.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect, test } from './fixtures.js';

const sql = loadSqlEquiv(import.meta.url);

test('browses authors and question pages with source and deletion states', async ({
  page,
  courseInstance,
}) => {
  await execute(sql.insert_questions, { course_id: courseInstance.course_id });
  try {
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/questions`);
    await page.getByRole('link', { name: 'Authorship', exact: true }).click();
    const author = page.getByRole('combobox', { name: 'Author', exact: true });
    await author.selectOption('author-a');
    await page.getByRole('button', { name: 'Show questions' }).click();
    const table = page.getByRole('table', { name: 'Authored questions' });
    await expect(table.getByRole('row')).toHaveCount(51);
    await expect(table.getByRole('row').filter({ hasText: 'authorship-001' })).toContainText(
      'Source unresolved',
    );
    await expect(table.getByRole('row').filter({ hasText: 'authorship-002' })).toContainText(
      'Source linked',
    );
    await expect(table.getByRole('row').filter({ hasText: 'authorship-003' })).toContainText(
      'Draft',
    );
    await expect(table.getByText('authorship-051', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Next', exact: true }).click();
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByRole('row').filter({ hasText: 'authorship-051' })).toContainText(
      'Deleted',
    );
    await author.selectOption('author-b');
    await page.getByRole('button', { name: 'Show questions' }).click();
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByText('authorship-001', { exact: true })).toBeVisible();
  } finally {
    await execute(sql.delete_questions, { course_id: courseInstance.course_id });
  }
});

const PREVIEWER = {
  uid: 'authorship-preview@example.com',
  name: 'Authorship previewer',
  uin: 'authorship-preview',
};
const previewerTest = createTest({
  authUid: PREVIEWER.uid,
  authName: PREVIEWER.name,
  authUin: PREVIEWER.uin,
  authEmail: PREVIEWER.uid,
});

previewerTest('requires course Previewer permission', async ({ page, courseInstance }) => {
  const user = await getOrCreateUser(PREVIEWER);
  const url = `/pl/course/${courseInstance.course_id}/course_admin/questions/authorship`;
  const denied = await page.goto(url);
  expect(denied?.status()).toBe(403);
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: PREVIEWER.uid,
    course_role: 'Previewer',
    authn_user_id: '1',
  });
  try {
    const allowed = await page.goto(url);
    expect(allowed?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Question authorship', exact: true }),
    ).toBeVisible();
  } finally {
    await deleteCoursePermissions({
      course_id: courseInstance.course_id,
      user_id: user.id,
      authn_user_id: '1',
    });
  }
});

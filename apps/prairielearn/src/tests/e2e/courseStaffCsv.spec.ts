import fs from 'node:fs/promises';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../../models/course-permissions.js';
import {
  ensureUncheckedEnrollment,
  selectEnrollmentsForUsersInCourse,
} from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

test('supports upload and preview with the keyboard on a small screen', async ({
  page,
  courseInstance,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/staff`);
  const importButton = page.getByRole('button', { name: 'Import CSV', exact: true });
  await expect(importButton).toBeInViewport();
  await importButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const file = dialog.getByLabel('CSV file');
  await file.setInputFiles({
    name: 'mobile.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'uid,course\nlong-staff-identifier-for-responsive-preview@example.com,Viewer\n',
    ),
  });
  const preview = dialog.getByRole('button', { name: 'Preview changes', exact: true });
  await preview.focus();
  await page.keyboard.press('Enter');
  const changes = dialog.getByRole('button', { name: 'Users with changes (1)', exact: true });
  await expect(changes).toHaveAttribute('aria-expanded', 'true');
  await changes.focus();
  await page.keyboard.press('Enter');
  await expect(changes).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(changes).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByRole('button', { name: 'Confirm sync', exact: true })).toBeInViewport();
  await expect(dialog).toHaveAccessibleName('Import staff CSV');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(importButton).toBeFocused();
});

test('exports staff as a downloadable CSV', async ({ page, courseInstance }) => {
  const uid = 'csv-export@example.com';
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid,
    course_role: 'Viewer',
    authn_user_id: '1',
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/staff`);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('course-staff.csv');
  const text = await fs.readFile(await download.path(), 'utf8');
  expect(text.split(/\r?\n/)[0]).toMatch(/^uid,course,/);
  expect(text).toContain(`${uid},Viewer,`);
});

test('previews additions and unchanged staff separately, then updates the table', async ({
  page,
  courseInstance,
}) => {
  const unchangedUid = 'csv-unchanged@example.com';
  const addedUid = 'csv-added@example.com';
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: unchangedUid,
    course_role: 'Viewer',
    authn_user_id: '1',
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/staff`);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'staff.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`uid,course\n${unchangedUid},Viewer\n${addedUid},Editor\n`),
  });
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(dialog.getByText('1 added, 0 updated, 0 removed, 1 unchanged.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Preview changes', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('CSV file')).toHaveCount(0);
  await expect(dialog.getByText(addedUid, { exact: true })).toBeVisible();
  await expect(dialog.getByText(unchangedUid, { exact: true })).not.toBeVisible();
  const changed = dialog.getByRole('button', { name: 'Users with changes (1)', exact: true });
  await changed.click();
  await expect(dialog.getByText(addedUid, { exact: true })).not.toBeVisible();
  await dialog.getByRole('button', { name: 'Users without changes (1)', exact: true }).click();
  await expect(dialog.getByText(unchangedUid, { exact: true })).toBeVisible();
  await changed.click();
  await dialog.getByRole('button', { name: 'Confirm sync', exact: true }).click();
  await expect(dialog.getByText(/Staff synchronized: 1 added/)).toBeVisible();
  await dialog.getByText('Close', { exact: true }).click();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: addedUid })
      .getByRole('button', { name: 'Editor', exact: true }),
  ).toBeVisible();
});

test('shows readable upload errors and recovers with a valid file', async ({
  page,
  courseInstance,
}) => {
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/staff`);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Select a CSV file.');
  for (const content of ['', '   \n']) {
    await dialog
      .getByLabel('CSV file')
      .setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
    await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'The CSV file is empty. Select a file with a header and staff data.',
    );
    await expect(dialog.getByLabel('CSV file')).toHaveAttribute('aria-invalid', 'true');
  }
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'large.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(1024 * 1024 + 1, 'x'),
  });
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('CSV must be at most 1 MiB.');
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'invalid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('uid,course\ncsv-error@example.com,Manager\n'),
  });
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Manager');
  await expect(dialog.getByRole('button', { name: 'Confirm sync', exact: true })).toHaveCount(0);
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'valid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('uid,course\ncsv-error@example.com,Viewer\n'),
  });
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(dialog.getByText('1 added, 0 updated, 0 removed, 0 unchanged.')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('warns about enrollment removal and rejects stale previews before removing staff', async ({
  page,
  courseInstance,
}) => {
  const user = await getOrCreateUser({
    uid: 'csv-remove@example.com',
    name: 'CSV removal',
    uin: null,
  });
  await ensureUncheckedEnrollment({
    userId: user.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
  await insertCoursePermissionsByUserUid({
    course_id: courseInstance.course_id,
    uid: user.uid,
    course_role: 'Viewer',
    authn_user_id: '1',
  });
  await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/staff`);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const file = {
    name: 'remove.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`uid,course\n${user.uid},\n`),
  };
  await dialog.getByLabel('CSV file').setInputFiles(file);
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Removing staff also deletes these enrollments:',
  );
  await expect(dialog.getByRole('alert')).toContainText(`${courseInstance.short_name} (joined)`);
  await updateCoursePermissionsRole({
    course_id: courseInstance.course_id,
    user_id: user.id,
    course_role: 'Editor',
    authn_user_id: '1',
  });
  await dialog.getByRole('button', { name: 'Confirm sync', exact: true }).click();
  await expect(
    dialog.getByRole('alert').filter({ hasText: 'Generate a new preview' }),
  ).toBeVisible();
  expect(
    await selectEnrollmentsForUsersInCourse({
      courseId: courseInstance.course_id,
      userIds: [user.id],
    }),
  ).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Choose another file', exact: true }).click();
  await dialog.getByLabel('CSV file').setInputFiles(file);
  await dialog.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm sync', exact: true }).click();
  await expect(dialog.getByText(/Staff synchronized: 0 added, 0 updated, 1 removed/)).toBeVisible();
  await dialog.getByText('Close', { exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: user.uid })).toHaveCount(0);
  expect(
    await selectEnrollmentsForUsersInCourse({
      courseId: courseInstance.course_id,
      userIds: [user.id],
    }),
  ).toHaveLength(0);
});

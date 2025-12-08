import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface TestUser {
  uid: string;
  name: string;
}

// Test users for various scenarios
const VALID_STUDENT: TestUser = { uid: 'valid_student@test.com', name: 'Valid Student' };
const VALID_STUDENT_2: TestUser = { uid: 'valid_student2@test.com', name: 'Valid Student 2' };
const VALID_STUDENT_3: TestUser = { uid: 'valid_student3@test.com', name: 'Valid Student 3' };
const ENROLLED_STUDENT: TestUser = { uid: 'enrolled_student@test.com', name: 'Enrolled Student' };
const INVITED_STUDENT: TestUser = { uid: 'invited_student@test.com', name: 'Invited Student' };

/**
 * Creates test users and sets up the database for testing bulk invitations.
 */
async function createTestData() {
  // Enable modern publishing for the course instance
  await sqldb.execute(sql.enable_modern_publishing, {});

  // Enable the enrollment-management feature flag
  await sqldb.execute(sql.enable_enrollment_management_feature, {});

  // Make the dev user an administrator (required for enrollment management)
  await sqldb.execute(sql.set_dev_user_as_admin, {});

  // Create valid students (not enrolled)
  for (const student of [VALID_STUDENT, VALID_STUDENT_2, VALID_STUDENT_3]) {
    await sqldb.executeRow(sql.insert_or_update_user, { uid: student.uid, name: student.name });
  }

  // Create an already enrolled student
  const enrolledUserId = await sqldb.queryRow(
    sql.insert_or_update_user,
    { uid: ENROLLED_STUDENT.uid, name: ENROLLED_STUDENT.name },
    IdSchema,
  );
  await sqldb.execute(sql.insert_joined_enrollment, { user_id: enrolledUserId });

  // Create a student with a pending invitation (no user_id needed - uses pending_uid)
  await sqldb.execute(sql.insert_invited_enrollment, { pending_uid: INVITED_STUDENT.uid });
}

test.describe('Bulk invite students', () => {
  test.beforeAll(async () => {
    await syncCourse(EXAMPLE_COURSE_PATH);
    await createTestData();
  });

  test('can invite a single valid student', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');
    await expect(page).toHaveTitle(/Students/);

    // Click the invite button
    await page.getByRole('button', { name: 'Invite students' }).click();

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Invite students', { exact: true }),
    ).toBeVisible();

    // Enter a single valid UID
    await page.getByRole('textbox', { name: 'UIDs' }).fill(VALID_STUDENT.uid);

    // Click invite
    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Should show success message
    await expect(page.getByText('1 student successfully invited')).toBeVisible({
      timeout: 10000,
    });

    // Modal should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('can invite multiple valid students', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter multiple UIDs
    await page
      .getByRole('textbox', { name: 'UIDs' })
      .fill(`${VALID_STUDENT_2.uid}\n${VALID_STUDENT_3.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Should show success message for multiple students
    await expect(page.getByText('2 students successfully invited')).toBeVisible({
      timeout: 10000,
    });
  });

  test('shows inline error for single invalid student', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter an already enrolled student
    await page.getByRole('textbox', { name: 'UIDs' }).fill(ENROLLED_STUDENT.uid);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Should show inline error
    await expect(page.getByText('Already enrolled')).toBeVisible({ timeout: 10000 });

    // Modal should still be open
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('shows inline error when all students are invalid', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter multiple invalid UIDs
    await page
      .getByRole('textbox', { name: 'UIDs' })
      .fill(`${ENROLLED_STUDENT.uid}\n${INVITED_STUDENT.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Should show inline error about none being invitable
    await expect(page.getByText('None of the UIDs can be invited', { exact: false })).toBeVisible({
      timeout: 10000,
    });
  });

  test('invites valid students and shows skip info for invalid ones', async ({ page }) => {
    // Create a fresh valid student for this test
    await sqldb.executeRow(sql.insert_or_update_user, {
      uid: 'fresh_student@test.com',
      name: 'Fresh Student',
    });

    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter mix of valid and invalid UIDs
    await page
      .getByRole('textbox', { name: 'UIDs' })
      .fill(`fresh_student@test.com\n${ENROLLED_STUDENT.uid}`);

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    // Should show success message with skip info (no confirmation modal)
    await expect(page.getByText('1 student successfully invited')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('1 enrolled student skipped')).toBeVisible();

    // Modal should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto('/pl/course_instance/1/instructor/instance_admin/students');

    await page.getByRole('button', { name: 'Invite students' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'UIDs' }).fill('not-an-email');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    await expect(page.getByText('invalid', { exact: false })).toBeVisible({ timeout: 10000 });
  });
});

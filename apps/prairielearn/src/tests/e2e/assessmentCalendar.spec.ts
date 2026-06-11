import type { Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

// Relies on the hw19-accessControlUi fixture in testCourse: release
// 2026-04-10, due 2026-05-01, plus one "Section A" label override.
const STUDENT = { uid: 'e2e_cal_student@test.com', name: 'Calendar Student', uin: 'CAL001' };

async function impersonateUser(page: Page, uid: string, baseURL: string) {
  await page.context().addCookies([
    { name: 'pl2_requested_uid', value: uid, url: baseURL },
    { name: 'pl2_requested_data_changed', value: 'true', url: baseURL },
  ]);
}

test.describe('Assessment calendar view', () => {
  test.beforeAll(async ({ courseInstance }) => {
    const student = await getOrCreateUser(STUDENT);
    await ensureUncheckedEnrollment({
      userId: student.id,
      courseInstance,
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });
  });

  test('instructor can toggle to the calendar and see event details', async ({
    page,
    courseInstance,
  }) => {
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/assessments`,
    );
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/view=calendar/);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/assessments?view=calendar&month=2026-04`,
    );
    await expect(page.getByRole('heading', { name: 'April 2026' })).toBeVisible();
    await expect(page.getByRole('button', { name: /HW19.*available/ }).first()).toBeVisible();

    // The release chip may be collapsed behind a "+N more" expander.
    for (const expander of await page.getByRole('button', { name: /\+\d+ more/ }).all()) {
      await expander.click();
    }
    await expect(page.getByRole('button', { name: /HW19.*opens/ }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('heading', { name: 'May 2026' })).toBeVisible();

    await page
      .getByRole('button', { name: /HW19.*due/ })
      .first()
      .click();
    await expect(page.getByText('1 override')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View assessment' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit access' })).toBeVisible();
  });

  test('student sees their resolved dates on the calendar', async ({
    page,
    baseURL,
    courseInstance,
  }) => {
    await impersonateUser(page, STUDENT.uid, baseURL);

    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/view=calendar/);

    await page.goto(
      `/pl/course_instance/${courseInstance.id}/assessments?view=calendar&month=2026-05`,
    );
    await expect(page.getByRole('heading', { name: 'May 2026' })).toBeVisible();

    await page
      .getByRole('button', { name: /HW19.*due/ })
      .first()
      .click();
    await expect(page.getByRole('table', { name: 'Credit details' })).toBeVisible();
    // The student is not in Section A, so the default due date applies.
    await expect(page.getByText('1 override')).not.toBeVisible();
  });
});

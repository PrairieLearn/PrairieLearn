import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { createTest, expect } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const EXAM_UUID = 'e66122b5-c793-4235-9851-9a3aa80ae39b';
const STUDENT = {
  uid: 'report-cheating-e2e@example.com',
  name: 'Report Cheating E2E Student',
  uin: 'E2E-REPORT-CHEATING',
  email: 'report-cheating-e2e@example.com',
};
const ReportRequestSchema = z
  .object({
    __csrf_token: z.string(),
    report: z.string(),
  })
  .strict();
const test = createTest({
  authUid: STUDENT.uid,
  authName: STUDENT.name,
  authUin: STUDENT.uin,
  authEmail: STUDENT.email,
});

test('submits cheating reports from an active exam', async ({ page, courseInstance }) => {
  const user = await getOrCreateUser(STUDENT);
  await ensureUncheckedEnrollment({
    userId: user.id,
    courseInstance,
    authzData: dangerousFullSystemAuthz(),
    requiredRole: ['System'],
    actionDetail: 'implicit_joined',
  });
  const reservationId = await sqldb.queryScalar(
    sql.create_active_reservation,
    { exam_uuid: EXAM_UUID, user_id: user.id },
    IdSchema,
  );

  try {
    await page.goto(`/pl/course_instance/${courseInstance.id}/assessments`);
    await page.getByRole('link', { name: 'Exam for automatic test suite', exact: true }).click();
    await page.getByLabel('I certify and pledge the above.').check();
    await page.getByRole('button', { name: 'Start assessment' }).click();

    const openModalButton = page.getByRole('button', { name: 'Report cheating', exact: true });
    await expect(openModalButton).toBeVisible();
    await openModalButton.click();

    const modal = page.getByRole('dialog', { name: 'Report cheating' });
    const report = modal.getByLabel('What did you see?');
    const submitButton = modal.getByRole('button', { name: 'Submit report' });
    const cancelButton = modal.getByRole('button', { name: 'Cancel' });
    const requests: z.infer<typeof ReportRequestSchema>[] = [];
    const requestHeaders: Record<string, string>[] = [];
    let continueFirstRequest!: () => void;
    const continueFirstRequestPromise = new Promise<void>((resolve) => {
      continueFirstRequest = resolve;
    });
    let firstRequestStarted!: () => void;
    const firstRequestStartedPromise = new Promise<void>((resolve) => {
      firstRequestStarted = resolve;
    });

    await page.route('**/pl/report-cheating', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      requests.push(ReportRequestSchema.parse(route.request().postDataJSON()));
      requestHeaders.push(route.request().headers());
      if (requests.length === 1) {
        firstRequestStarted();
        await continueFirstRequestPromise;
      }

      const success = requests.length >= 3;
      await route.fulfill({
        status: success ? 200 : 502,
        contentType: 'application/json',
        body: JSON.stringify(
          success
            ? { message: 'Thank you. Your report was submitted.' }
            : { error: 'Report service unavailable.' },
        ),
      });
    });

    await report.fill('Student nearby is using a phone.');
    await submitButton.dblclick();
    await firstRequestStartedPromise;

    await expect(modal.getByText('Submitting report…')).toBeVisible();
    await expect(submitButton).toBeDisabled();
    await expect(cancelButton).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();

    continueFirstRequest();
    await expect(modal.getByRole('alert')).toHaveText('Report service unavailable.');
    expect(requests).toHaveLength(1);
    expect(requestHeaders[0]['content-type']).toBe('application/json');
    expect(requestHeaders[0].accept).toBe('application/json');

    await modal.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(modal.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(requests[1].report).toBe(requests[0].report);

    await report.fill('Edited report');
    await modal.getByRole('button', { name: 'Try again' }).click();
    await expect(modal.getByRole('status')).toHaveText('Thank you. Your report was submitted.');
    expect(requests).toHaveLength(3);
    expect(requests[2].report).not.toBe(requests[1].report);
    expect(requests[2].report).toBe('Edited report');

    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).toBeHidden();
  } finally {
    await sqldb.execute(sql.delete_reservation, { reservation_id: reservationId });
  }
});

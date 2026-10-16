import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { type AuthUser, getOrCreateUser } from './utils/auth.js';

const TITLE = 'Test disabling real-time grading and withholding grades';

// The user that the `pl_test_user=test_student` cookie authenticates as.
const student: AuthUser = {
  uid: 'student@example.com',
  name: 'Student User',
  uin: '000000001',
};

describe('Student gradebook lists unstarted assessments', { timeout: 60_000 }, function () {
  const siteUrl = `http://localhost:${config.serverPort}`;
  const courseInstanceBaseUrl = `${siteUrl}/pl/course_instance/1`;
  const gradebookUrl = `${courseInstanceBaseUrl}/gradebook`;
  // Student mode, at a date where the exam is available.
  const headers = { cookie: 'pl_test_user=test_student; pl_test_date=2000-01-19T00:00:01' };
  // Student mode, at a date before the exam is available.
  const headersUnavailable = {
    cookie: 'pl_test_user=test_student; pl_test_date=1999-01-01T00:00:01',
  };
  const context: Record<string, any> = {};

  beforeAll(async () => {
    await helperServer.before()();
    const { id } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam9-disableRealTimeGradingWithholdGrades',
    });
    context.assessmentUrl = `${courseInstanceBaseUrl}/assessment/${id}/`;

    const user = await getOrCreateUser(student);
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance: await selectCourseInstanceById('1'),
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });
  });

  afterAll(helperServer.after);

  test('shows an available, unstarted assessment as "Not started"', async () => {
    const response = await helperClient.fetchCheerio(gradebookUrl, { headers });
    assert.equal(response.status, 200);
    const row = response.$(`tr:contains("${TITLE}")`);
    assert.lengthOf(row, 1);
    assert.lengthOf(row.find('td:contains("Not started")'), 1);
    assert.lengthOf(row.find('div.progress'), 0);
  });

  test('omits an unstarted assessment that is not available', async () => {
    const response = await helperClient.fetchCheerio(gradebookUrl, {
      headers: headersUnavailable,
    });
    assert.equal(response.status, 200);
    assert.lengthOf(response.$(`tr:contains("${TITLE}")`), 0);
  });

  test('shows the score instead of "Not started" once the assessment is started', async () => {
    const page = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
    helperClient.extractAndSaveCSRFToken(context, page.$, 'form');
    const started = await helperClient.fetchCheerio(context.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'new_instance',
        __csrf_token: context.__csrf_token,
      }),
      headers,
    });
    assert.isTrue(started.ok);

    const response = await helperClient.fetchCheerio(gradebookUrl, { headers });
    const row = response.$(`tr:contains("${TITLE}")`);
    assert.lengthOf(row, 1);
    assert.lengthOf(row.find('td:contains("Not started")'), 0);
    // The instance is still open, so its score is shown (the withholding applies once it closes).
    const scorebar = row.find('[data-testid="scorebar"]');
    assert.lengthOf(scorebar, 1);
    assert.equal(scorebar.text().trim(), '0%');
  });
});

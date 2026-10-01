import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import { selectUserByUid } from '../models/user.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const TITLE = 'Test disabling real-time grading and withholding grades';

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
  });

  afterAll(helperServer.after);

  test('create and enroll the student', async () => {
    // Visiting the home page creates the test_student user.
    const response = await helperClient.fetchCheerio(`${siteUrl}/pl`, { headers });
    assert.isTrue(response.ok);
    const user = await selectUserByUid('student@example.com');
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance: await selectCourseInstanceById('1'),
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });
  });

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

  test('no longer says "Not started" once the assessment is started', async () => {
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
  });
});

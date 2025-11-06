import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureEnrollment } from '../models/enrollment.js';
import { selectUserByUid } from '../models/user.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe(
  'Exam assessment with showClosedAssessment AND showClosedAssessmentScore access rules',
  { timeout: 60_000 },
  function () {
    const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
    context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;
    context.gradeBookUrl = `${context.courseInstanceBaseUrl}/gradebook`;

    const headers = {
      cookie: 'pl_test_user=test_student; pl_test_date=1940-01-19T00:00:01',
      // need student mode to get a timed exam (instructor override bypasses this)
    };
    const headersTimeLimit = {
      cookie: 'pl_test_user=test_student; pl_test_date=1940-01-19T12:00:01',
    };

    beforeAll(async function () {
      await helperServer.before()();
      const { id: assessmentId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam9-disableRealTimeGradingWithholdGrades',
      });
      context.assessmentId = assessmentId;
      context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
    });

    afterAll(helperServer.after);

    // we need to access the homepage to create the test_student user in the DB
    test.sequential('visit home page', async () => {
      const response = await helperClient.fetchCheerio(context.baseUrl, {
        headers,
      });
      assert.isTrue(response.ok);
    });

    test.sequential('enroll the test student user in the course', async () => {
      const user = await selectUserByUid('student@example.com');
      const courseInstance = await selectCourseInstanceById('1');
      await ensureEnrollment({
        userId: user.user_id,
        courseInstance,
        requestedRole: 'System',
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
    });

    test.sequential('visit start exam page', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

      helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
    });

    test.sequential('start the exam', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: context.__csrf_token,
        }),
        headers,
      });
      assert.isTrue(response.ok);

      // We should have been redirected to the assessment instance
      const assessmentInstanceUrl = response.url;
      assert.include(assessmentInstanceUrl, '/assessment_instance/');
      context.assessmentInstanceUrl = assessmentInstanceUrl;

      // save the questionUrl for later
      const questionUrl = response.$('a:contains("Question 1")').attr('href');
      context.questionUrl = `${context.siteUrl}${questionUrl}`;

      context.__csrf_token = response.$('span[id=test_csrf_token]').text();
    });

    test.sequential('simulate a time limit expiration', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'timeLimitFinish',
          __csrf_token: context.__csrf_token,
        }),
        headers: headersTimeLimit,
      });
      assert.equal(response.status, 403);

      // We should have been redirected back to the same assessment instance
      assert.equal(response.url, context.assessmentInstanceUrl + '?timeLimitExpired=true');

      // we should not have any questions
      assert.lengthOf(response.$('a:contains("Question 1")'), 0);

      // we should have the "assessment closed" message
      const msg = response.$('[data-testid="assessment-closed-message"]');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment .* is no longer available/);
    });

    test.sequential('check the assessment instance is closed', async () => {
      const result = await sqldb.queryRow(
        sql.select_assessment_instances,
        AssessmentInstanceSchema,
      );
      assert.equal(result.open, false);
    });

    test.sequential(
      'check that accessing a question gives the "assessment closed" message',
      async () => {
        const response = await helperClient.fetchCheerio(context.questionUrl, {
          headers,
        });
        assert.equal(response.status, 403);

        assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 1);
        assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
      },
    );

    test.sequential('check that accessing assessment list shows score as withheld', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.equal(response.status, 200);

      assert.lengthOf(response.$('td:contains("Score not shown")'), 1); // score withheld message should show
      assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
    });

    test.sequential('check that accessing gradebook shows score as withheld', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.equal(response.status, 200);

      assert.lengthOf(response.$('td:contains("Score not shown")'), 1); // score withheld message should show
      assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
    });
  },
);

import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { gradeAssessmentInstance, makeAssessmentInstance } from '../lib/assessment.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import { selectUserByUid } from '../models/user.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

describe(
  'Modern access control: afterComplete visibility applies only after completion',
  { timeout: 60_000 },
  function () {
    const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
    context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;
    context.gradebookUrl = `${context.courseInstanceBaseUrl}/gradebook`;

    // The test assessment hw20-afterCompleteVisibility has:
    //   release 2026-01-01, due 2026-04-10, afterComplete { questions/score hidden }.
    // No `afterLastDeadline`, so the assessment becomes non-submittable (and thus
    // "complete" per the resolver) once the due date passes, even though the
    // homework instance stays open.
    // The timed exam uses the same hidden afterComplete policy, but reaches
    // instance-specific completion when its duration limit expires.
    const activeWindowCookie = 'pl_test_user=test_student; pl_test_date=2026-04-05T00:00:00Z';
    const afterTimeLimitCookie = 'pl_test_user=test_student; pl_test_date=2026-04-05T00:20:00Z';
    const afterCompleteCookie = 'pl_test_user=test_student; pl_test_date=2026-04-15T00:00:00Z';

    beforeAll(async function () {
      // The `enhanced-access-control` feature flag must be enabled during
      // sync so the assessment is marked `modern_access_control: true`.
      await withConfig({ features: { 'enhanced-access-control': true } }, async () => {
        await helperServer.before()();
      });
      const { id: assessmentId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'hw20-afterCompleteVisibility',
      });
      context.assessmentId = assessmentId;
      context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

      const { id: timedExamAssessmentId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam21-afterCompleteTimeLimit',
      });
      context.timedExamAssessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${timedExamAssessmentId}/`;

      context.passwordReviewAssessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam22-afterCompletePasswordReview',
      });
    });

    afterAll(helperServer.after);

    test.sequential('visit home page to create the student user', async () => {
      const response = await helperClient.fetchCheerio(context.baseUrl, {
        headers: { cookie: activeWindowCookie },
      });
      assert.isTrue(response.ok);
    });

    test.sequential('enroll the test student in the course', async () => {
      const user = await selectUserByUid('student@example.com');
      const courseInstance = await selectCourseInstanceById('1');
      await ensureUncheckedEnrollment({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
    });

    test.sequential('start the homework during the active window', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentUrl, {
        headers: { cookie: activeWindowCookie },
      });
      assert.isTrue(response.ok);
      assert.include(response.url, '/assessment_instance/');
      context.assessmentInstanceUrl = response.url;
    });

    test.sequential('start the timed exam during the active window', async () => {
      const startPage = await helperClient.fetchCheerio(context.timedExamAssessmentUrl, {
        headers: { cookie: activeWindowCookie },
      });
      assert.isTrue(startPage.ok);
      helperClient.extractAndSaveCSRFToken(context, startPage.$, '#confirm-form');

      const response = await helperClient.fetchCheerio(context.timedExamAssessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: context.__csrf_token,
        }),
        headers: { cookie: activeWindowCookie },
      });
      assert.isTrue(response.ok);
      assert.include(response.url, '/assessment_instance/');
      context.timedExamAssessmentInstanceUrl = response.url;
    });

    test.sequential(
      'create a password-protected timed exam instance during the active window',
      async () => {
        const user = await selectUserByUid('student@example.com');
        const assessmentInstanceId = await makeAssessmentInstance({
          assessment: context.passwordReviewAssessment,
          user_id: user.id,
          authn_user_id: user.id,
          mode: 'Public',
          time_limit_min: 10,
          date: new Date('2026-04-05T00:00:00Z'),
          client_fingerprint_id: null,
        });
        context.passwordReviewAssessmentInstanceId = assessmentInstanceId;
        context.passwordReviewAssessmentInstanceUrl = `${context.courseInstanceBaseUrl}/assessment_instance/${assessmentInstanceId}`;
      },
    );

    test.sequential(
      'student assessments list shows the score during the active window',
      async () => {
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, {
          headers: { cookie: activeWindowCookie },
        });
        assert.isTrue(response.ok);

        const row = response.$('tr:contains("After complete visibility")');
        assert.lengthOf(row, 1);
        // While active, the afterComplete policy must NOT apply: the score
        // cell renders a scorebar.
        assert.lengthOf(row.find('[data-testid="scorebar"]'), 1);
      },
    );

    test.sequential('student gradebook shows the score during the active window', async () => {
      const response = await helperClient.fetchCheerio(context.gradebookUrl, {
        headers: { cookie: activeWindowCookie },
      });
      assert.isTrue(response.ok);

      const row = response.$('tr:contains("After complete visibility")');
      assert.lengthOf(row, 1);
      assert.lengthOf(row.find('[data-testid="scorebar"]'), 1);
    });

    test.sequential(
      'student assessment instance page is accessible during the active window',
      async () => {
        const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
          headers: { cookie: activeWindowCookie },
        });
        assert.isTrue(response.ok);
        assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 0);
      },
    );

    test.sequential(
      'student assessments list omits available credit after the timed assessment expires',
      async () => {
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, {
          headers: { cookie: afterTimeLimitCookie },
        });
        assert.isTrue(response.ok);

        const row = response.$('tr:contains("After complete time limit visibility")');
        assert.lengthOf(row, 1);
        assert.equal(row.find('td').eq(2).text().trim(), '');
      },
    );

    test.sequential(
      'student can review an expired password-protected timed assessment without a password prompt',
      async () => {
        const response = await helperClient.fetchCheerio(
          context.passwordReviewAssessmentInstanceUrl,
          {
            headers: { cookie: afterTimeLimitCookie },
          },
        );
        assert.isTrue(response.ok);
        assert.include(response.url, '/assessment_instance/');
        assert.notInclude(response.url, '/password');
      },
    );

    test.sequential('close the password-protected timed exam before the deadline', async () => {
      const user = await selectUserByUid('student@example.com');
      await gradeAssessmentInstance({
        assessment_instance_id: context.passwordReviewAssessmentInstanceId,
        user_id: user.id,
        authn_user_id: user.id,
        requireOpen: true,
        close: true,
        ignoreGradeRateLimit: true,
        ignoreRealTimeGradingDisabled: true,
        client_fingerprint_id: null,
      });
    });

    test.sequential(
      'student assessments list omits available credit after an instance is closed',
      async () => {
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, {
          headers: { cookie: activeWindowCookie },
        });
        assert.isTrue(response.ok);

        const row = response.$('tr:contains("After complete password review")');
        assert.lengthOf(row, 1);
        assert.equal(row.find('td').eq(2).text().trim(), '');
      },
    );

    test.sequential(
      'student assessments list hides the score after the deadline passes',
      async () => {
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, {
          headers: { cookie: afterCompleteCookie },
        });
        assert.isTrue(response.ok);

        const row = response.$('tr:contains("After complete visibility")');
        assert.lengthOf(row, 1);
        assert.lengthOf(row.find('[data-testid="scorebar"]'), 0);
      },
    );

    test.sequential('student gradebook hides the score after the deadline passes', async () => {
      const response = await helperClient.fetchCheerio(context.gradebookUrl, {
        headers: { cookie: afterCompleteCookie },
      });
      assert.isTrue(response.ok);

      const row = response.$('tr:contains("After complete visibility")');
      assert.lengthOf(row, 1);
      assert.lengthOf(row.find('[data-testid="scorebar"]'), 0);
    });

    test.sequential(
      'student assessment instance page shows the closed message after the deadline passes',
      async () => {
        const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
          headers: { cookie: afterCompleteCookie },
        });
        assert.equal(response.status, 403);

        const message = response.$('[data-testid="assessment-closed-message"]');
        assert.lengthOf(message, 1);
        assert.match(message.text(), /Assessment is no longer available/);
        assert.lengthOf(response.$('[data-testid="scorebar"]'), 0);
      },
    );

    test.sequential(
      'student timed assessment instance page shows the closed message after the time limit expires',
      async () => {
        const response = await helperClient.fetchCheerio(context.timedExamAssessmentInstanceUrl, {
          headers: { cookie: afterTimeLimitCookie },
        });
        assert.equal(response.status, 403);

        const message = response.$('[data-testid="assessment-closed-message"]');
        assert.lengthOf(message, 1);
        assert.match(message.text(), /Assessment is no longer available/);
        assert.lengthOf(response.$('[data-testid="scorebar"]'), 0);
      },
    );
  },
);

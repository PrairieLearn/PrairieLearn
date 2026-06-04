import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { gradeAssessmentInstance, makeAssessmentInstance } from '../lib/assessment.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import type { Assessment } from '../lib/db-types.js';
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
    // exam21-afterCompleteTimeLimit uses the same hidden afterComplete policy,
    // but reaches instance-specific completion when its duration limit expires.
    // exam22-afterCompletePasswordReview is a date-controlled exam with both a
    // password and a time limit. Its afterComplete policy allows review so we
    // can verify review is not still gated by the password after the timer expires.
    const activeWindowCookie = 'pl_test_user=test_student; pl_test_date=2026-04-05T00:00:00Z';
    const afterTimeLimitCookie = 'pl_test_user=test_student; pl_test_date=2026-04-05T00:20:00Z';
    const afterCompleteCookie = 'pl_test_user=test_student; pl_test_date=2026-04-15T00:00:00Z';

    async function createAssessmentInstance({
      assessment,
      timeLimitMin,
    }: {
      assessment: Assessment;
      timeLimitMin: number | null;
    }) {
      return makeAssessmentInstance({
        assessment,
        user_id: context.userId,
        authn_user_id: context.userId,
        mode: 'Public',
        time_limit_min: timeLimitMin,
        date: new Date('2026-04-05T00:00:00Z'),
        client_fingerprint_id: null,
      });
    }

    function assessmentInstanceUrl(assessmentInstanceId: string) {
      return `${context.courseInstanceBaseUrl}/assessment_instance/${assessmentInstanceId}`;
    }

    beforeAll(async function () {
      // The `enhanced-access-control` feature flag must be enabled during
      // sync so the assessment is marked `modern_access_control: true`.
      await withConfig({ features: { 'enhanced-access-control': true } }, async () => {
        await helperServer.before()();
      });
      context.homeworkAssessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'hw20-afterCompleteVisibility',
      });

      context.timedExamAssessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam21-afterCompleteTimeLimit',
      });

      context.passwordTimedExamAssessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam22-afterCompletePasswordReview',
      });

      const homePage = await helperClient.fetchCheerio(context.baseUrl, {
        headers: { cookie: activeWindowCookie },
      });
      assert.isTrue(homePage.ok);

      const user = await selectUserByUid('student@example.com');
      context.userId = user.id;
      const courseInstance = await selectCourseInstanceById('1');
      await ensureUncheckedEnrollment({
        userId: context.userId,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
    });

    afterAll(helperServer.after);

    describe('homework completion after the due date', () => {
      beforeAll(async () => {
        const assessmentInstanceId = await createAssessmentInstance({
          assessment: context.homeworkAssessment,
          timeLimitMin: null,
        });
        context.assessmentInstanceUrl = assessmentInstanceUrl(assessmentInstanceId);
      });

      test(
        'student assessments list shows the score during the active window',
        { concurrent: false },
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

      test(
        'student gradebook shows the score during the active window',
        { concurrent: false },
        async () => {
          const response = await helperClient.fetchCheerio(context.gradebookUrl, {
            headers: { cookie: activeWindowCookie },
          });
          assert.isTrue(response.ok);

          const row = response.$('tr:contains("After complete visibility")');
          assert.lengthOf(row, 1);
          assert.lengthOf(row.find('[data-testid="scorebar"]'), 1);
        },
      );

      test(
        'student assessment instance page is accessible during the active window',
        { concurrent: false },
        async () => {
          const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
            headers: { cookie: activeWindowCookie },
          });
          assert.isTrue(response.ok);
          assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 0);
        },
      );

      test(
        'student assessments list hides the score after the deadline passes',
        { concurrent: false },
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

      test(
        'student gradebook hides the score after the deadline passes',
        { concurrent: false },
        async () => {
          const response = await helperClient.fetchCheerio(context.gradebookUrl, {
            headers: { cookie: afterCompleteCookie },
          });
          assert.isTrue(response.ok);

          const row = response.$('tr:contains("After complete visibility")');
          assert.lengthOf(row, 1);
          assert.lengthOf(row.find('[data-testid="scorebar"]'), 0);
        },
      );

      test(
        'student assessment instance page shows the closed message after the deadline passes',
        { concurrent: false },
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
    });

    describe('timed exam completion after the time limit expires', () => {
      beforeAll(async () => {
        const assessmentInstanceId = await createAssessmentInstance({
          assessment: context.timedExamAssessment,
          timeLimitMin: 10,
        });
        context.timedExamAssessmentInstanceUrl = assessmentInstanceUrl(assessmentInstanceId);
      });

      test('student assessments list omits available credit', { concurrent: false }, async () => {
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, {
          headers: { cookie: afterTimeLimitCookie },
        });
        assert.isTrue(response.ok);

        const row = response.$('tr:contains("After complete time limit visibility")');
        assert.lengthOf(row, 1);
        assert.equal(row.find('td').eq(2).text().trim(), '');
      });

      test(
        'student assessment instance page shows the closed message',
        { concurrent: false },
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
    });

    describe('expired password-protected timed exam', () => {
      beforeAll(async () => {
        const assessmentInstanceId = await createAssessmentInstance({
          assessment: context.passwordTimedExamAssessment,
          timeLimitMin: 10,
        });
        context.passwordTimedExamInstanceId = assessmentInstanceId;
        context.passwordTimedExamInstanceUrl = assessmentInstanceUrl(assessmentInstanceId);
      });

      test(
        'student can review after the time limit expires without a password prompt',
        { concurrent: false },
        async () => {
          const response = await helperClient.fetchCheerio(context.passwordTimedExamInstanceUrl, {
            headers: { cookie: afterTimeLimitCookie },
          });
          assert.isTrue(response.ok);
          assert.include(response.url, '/assessment_instance/');
          assert.notInclude(response.url, '/password');
        },
      );

      test(
        'student assessments list omits available credit after close',
        { concurrent: false },
        async () => {
          await gradeAssessmentInstance({
            assessment_instance_id: context.passwordTimedExamInstanceId,
            user_id: context.userId,
            authn_user_id: context.userId,
            requireOpen: true,
            close: true,
            ignoreGradeRateLimit: true,
            ignoreRealTimeGradingDisabled: true,
            client_fingerprint_id: null,
          });

          const response = await helperClient.fetchCheerio(context.assessmentListUrl, {
            headers: { cookie: activeWindowCookie },
          });
          assert.isTrue(response.ok);

          const row = response.$('tr:contains("Password-protected timed exam")');
          assert.lengthOf(row, 1);
          assert.equal(row.find('td').eq(2).text().trim(), '');
        },
      );
    });
  },
);

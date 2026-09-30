import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { run as finishTimedOutExams } from '../cron/finishTimedOutExams.js';
import { makeAssessmentInstance } from '../lib/assessment.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment, generateAndEnrollUsers } from '../models/enrollment.js';
import { selectOptionalSubmissionDraft } from '../models/submission-draft.js';
import {
  selectOptionalLatestSubmissionIdForVariant,
  selectSubmissionById,
} from '../models/submission.js';
import { selectUserByUid } from '../models/user.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;
const activeHeaders = { cookie: 'pl_test_user=test_student; pl_test_date=2026-04-05T00:05:00Z' };
const expiredHeaders = { cookie: 'pl_test_user=test_student; pl_test_date=2026-04-05T00:10:01Z' };
const afterGraceHeaders = { cookie: 'pl_test_date=2026-04-05T00:15:01Z' };
const sql = loadSqlEquiv(import.meta.url);

describe('Exam draft finalization', { timeout: 60_000, concurrent: false }, () => {
  let assessment: Awaited<ReturnType<typeof selectAssessmentByTid>>;
  let userId: string;

  beforeAll(async () => {
    // These exams are dated in the past, so background cron could close them during the test.
    config.cronActive = false;
    await helperServer.before()();
    config.cronActive = true;
  });
  afterAll(helperServer.after);

  beforeAll(async () => {
    await helperClient.fetchCheerio(`${siteUrl}/pl`, { headers: activeHeaders });
    const user = await selectUserByUid('student@example.com');
    userId = user.id;
    assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam21-afterCompleteTimeLimit',
    });
    await ensureUncheckedEnrollment({
      userId,
      courseInstance: await selectCourseInstanceById('1'),
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });
  });

  async function createExam() {
    const id = await makeAssessmentInstance({
      assessment,
      user_id: userId,
      authn_user_id: userId,
      mode: 'Public',
      time_limit_min: 10,
      date: new Date('2026-04-05T00:00:00Z'),
      client_fingerprint_id: null,
    });
    const url = `${courseInstanceUrl}/assessment_instance/${id}`;
    const overview = await helperClient.fetchCheerio(url, { headers: activeHeaders });
    assert.isTrue(overview.ok);
    const questionPath = overview.$('a:contains("Question 1")').attr('href');
    assert.isString(questionPath);
    const questionUrl = `${siteUrl}${questionPath}`;
    const question = await helperClient.fetchCheerio(questionUrl, { headers: activeHeaders });
    assert.isTrue(question.ok);
    return {
      id,
      url,
      questionUrl,
      variantId: question.$('.question-container').attr('data-variant-id')!,
      csrfToken: helperClient.getCSRFToken(question.$('.question-form')),
      baseSubmissionId: question.$('.question-form').attr('data-submission-draft-base')!,
    };
  }

  test('submits a selected draft before the grace period ends', async () => {
    const exam = await createExam();
    const saveResponse = await fetch(exam.questionUrl, {
      method: 'POST',
      headers: activeHeaders,
      body: new URLSearchParams({
        __action: 'save_draft',
        __csrf_token: exam.csrfToken,
        __variant_id: exam.variantId,
        __draft_base_submission_id: exam.baseSubmissionId,
        __draft_client_id: crypto.randomUUID(),
        __draft_revision: '1',
        c: '42',
      }),
    });
    assert.equal(saveResponse.status, 204);

    const prompt = await helperClient.fetchCheerio(exam.url, { headers: expiredHeaders });
    assert.isTrue(prompt.ok);
    assert.include(prompt.url, '/finalize_drafts');
    assert.include(prompt.$('h1').text(), 'Your exam time has ended');
    const draftOption = prompt.$('select[name="selected_drafts"] option[value!=""]').val();
    assert.equal(draftOption, `${exam.variantId}:${userId}`);

    const finished = await helperClient.fetchCheerio(prompt.url, {
      method: 'POST',
      headers: expiredHeaders,
      body: new URLSearchParams({
        __csrf_token: helperClient.getCSRFToken(prompt.$('form')),
        selected_drafts: String(draftOption),
      }),
    });
    assert.include(finished.url, 'timeLimitExpired=true');
    assert.isFalse((await selectAssessmentInstanceById(exam.id)).open);
    const submissionId = await selectOptionalLatestSubmissionIdForVariant({
      variant_id: exam.variantId,
    });
    assert.isNotNull(submissionId);
    const submission = await selectSubmissionById({ submission_id: submissionId });
    assert.deepEqual(submission.raw_submitted_answer, { c: '42' });
    assert.equal(submission.credit, 100);
    assert.isNull(
      await selectOptionalSubmissionDraft({ variant_id: exam.variantId, user_id: userId }),
    );
  });

  test('closes without restoring a draft after the grace period', async () => {
    const originalAuth = {
      authUid: config.authUid,
      authName: config.authName,
      authUin: config.authUin,
    };
    try {
      config.authUid = 'student2@example.com';
      config.authName = 'Student User 2';
      config.authUin = '000000002';
      await helperClient.fetchCheerio(`${siteUrl}/pl`, { headers: afterGraceHeaders });
      const secondUser = await selectUserByUid(config.authUid);
      await ensureUncheckedEnrollment({
        userId: secondUser.id,
        courseInstance: await selectCourseInstanceById('1'),
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
      const id = await makeAssessmentInstance({
        assessment,
        user_id: secondUser.id,
        authn_user_id: secondUser.id,
        mode: 'Public',
        time_limit_min: 10,
        date: new Date('2026-04-05T00:00:00Z'),
        client_fingerprint_id: null,
      });
      const response = await helperClient.fetchCheerio(
        `${courseInstanceUrl}/assessment_instance/${id}/finalize_drafts`,
        {
          headers: afterGraceHeaders,
        },
      );
      assert.include(response.url, 'timeLimitExpired=true');
      assert.isFalse((await selectAssessmentInstanceById(id)).open);
    } finally {
      Object.assign(config, originalAuth);
    }
  });

  test('closes an exam in the background once the five minutes have elapsed', async () => {
    const [user] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    const id = await makeAssessmentInstance({
      assessment,
      user_id: user.id,
      authn_user_id: user.id,
      mode: 'Public',
      time_limit_min: 10,
      date: new Date('2026-04-05T00:00:00Z'),
      client_fingerprint_id: null,
    });
    await execute(sql.set_date_limit_minutes_ago, { assessment_instance_id: id, minutes_ago: 4 });
    await finishTimedOutExams();
    assert.isTrue((await selectAssessmentInstanceById(id)).open);

    await execute(sql.set_date_limit_minutes_ago, { assessment_instance_id: id, minutes_ago: 6 });
    await finishTimedOutExams();
    assert.isFalse((await selectAssessmentInstanceById(id)).open);
  });
});

import { step } from 'mocha-steps';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import * as helperServer from './helperServer';
import { IdSchema } from '../lib/db-types';
import { config } from '../lib/config';
import { AuthUser, withUser } from './utils/auth';
import { fetchCheerio, getCSRFToken } from './helperClient';
import { assert } from 'chai';

const sql = loadSqlEquiv(__filename);

const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;
const studentUser: AuthUser = {
  uid: 'student@example.com',
  name: 'Example Student',
  uin: 'student',
};

describe('Instructor force-breaking variants', () => {
  let assessmentId: string;
  let partialCredit1AssessmentQuestionId: string;
  let partialCredit2AssessmentQuestionId: string;
  let partialCredit1VariantId: string;
  let partialCredit2VariantId: string;
  let assessmentStudentUrl: string;

  before(async () => {
    await helperServer.before()();

    assessmentId = await queryRow(sql.select_break_variants_exam, {}, IdSchema);
    assessmentStudentUrl = `${siteUrl}/pl/course_instance/1/assessment/${assessmentId}`;

    partialCredit1AssessmentQuestionId = await queryRow(
      sql.select_assessment_question,
      { qid: 'partialCredit1', assessment_id: assessmentId },
      IdSchema,
    );
    partialCredit2AssessmentQuestionId = await queryRow(
      sql.select_assessment_question,
      { qid: 'partialCredit2', assessment_id: assessmentId },
      IdSchema,
    );
  });
  after(helperServer.after);

  step('student starts assessment', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);

      const response = await fetchCheerio(assessmentStudentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: getCSRFToken(assessmentResponse.$),
        }),
      });
      assert.equal(response.status, 200);
    });
  });

  step('student creates and submits to first variant', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit1Url = assessmentResponse.$('a:contains("Question 1")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${partialCredit1Url}`);
      assert.equal(questionResponse.status, 200);

      partialCredit1VariantId = questionResponse
        .$('input[name=__variant_id]')
        .val()
        ?.toString() as string;

      const submissionResponse = await fetchCheerio(`${siteUrl}${partialCredit1Url}`, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: getCSRFToken(questionResponse.$),
          __variant_id: partialCredit1VariantId,
          s: '50',
        }),
      });
      assert.equal(submissionResponse.status, 200);
    });
  });

  step('student creates and submits to second variant', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit2Url = assessmentResponse.$('a:contains("Question 2")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${partialCredit2Url}`);
      assert.equal(questionResponse.status, 200);

      partialCredit2VariantId = questionResponse
        .$('input[name=__variant_id]')
        .val()
        ?.toString() as string;

      const submissionResponse = await fetchCheerio(`${siteUrl}${partialCredit2Url}`, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: getCSRFToken(questionResponse.$),
          __variant_id: partialCredit2VariantId,
          s: '50',
        }),
      });
      assert.equal(submissionResponse.status, 200);
    });
  });

  step('instructor breaks first variant via assessment question page', async () => {
    const assessmentQuestionsUrl = `${courseInstanceUrl}/instructor/assessment/${assessmentId}/questions`;

    const assessmentQuestionsResponse = await fetchCheerio(assessmentQuestionsUrl);
    const csrfToken = getCSRFToken(assessmentQuestionsResponse.$);

    const breakVariantsResponse = await fetchCheerio(assessmentQuestionsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'reset_question_variants',
        __csrf_token: csrfToken,
        unsafe_assessment_question_id: partialCredit1AssessmentQuestionId,
      }),
    });
    assert.equal(breakVariantsResponse.status, 200);
  });

  step('instructor breaks second variant via student instance page', async () => {
    const instanceUrl = `${courseInstanceUrl}/instructor/assessment_instance/1`;

    const instanceQuestion = await queryRow(
      sql.select_instance_question,
      { assessment_question_id: partialCredit2AssessmentQuestionId },
      IdSchema,
    );

    const instanceResponse = await fetchCheerio(instanceUrl);
    const csrfToken = getCSRFToken(instanceResponse.$);

    const breakVariantsResponse = await fetchCheerio(instanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'reset_question_variants',
        __csrf_token: csrfToken,
        unsafe_instance_question_id: instanceQuestion,
      }),
    });
    assert.equal(breakVariantsResponse.status, 200);
  });

  step('student sees new variant when revisiting first question', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const addNumbersUrl = assessmentResponse.$('a:contains("Question 1")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${addNumbersUrl}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val()?.toString() as string;
      assert.notEqual(variantId, partialCredit1VariantId);
    });
  });

  step('student sees new variant when revisiting second question', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const addNumbersUrl = assessmentResponse.$('a:contains("Question 2")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${addNumbersUrl}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val()?.toString() as string;
      assert.notEqual(variantId, partialCredit2VariantId);
    });
  });
});

import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { IdSchema } from '../lib/db-types.js';

import { fetchCheerio, getCSRFToken } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { type AuthUser, withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;
const studentUser: AuthUser = {
  uid: 'student@example.com',
  name: 'Example Student',
  uin: 'student',
  email: 'student@example.com',
};

describe('Instructor force-breaking variants', () => {
  let assessmentId: string;
  let partialCredit1AssessmentQuestionId: string;
  let partialCredit2AssessmentQuestionId: string;
  let partialCredit1VariantId: string;
  let partialCredit2VariantId: string;
  let assessmentStudentUrl: string;

  beforeAll(async () => {
    await helperServer.before()();

    assessmentId = await queryRow(sql.select_break_variants_exam, IdSchema);
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
  afterAll(helperServer.after);

  test.sequential('student starts assessment', async () => {
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

  test.sequential('student creates and submits to first variant', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit1Url = assessmentResponse.$('a:contains("Question 1")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${partialCredit1Url}`);
      assert.equal(questionResponse.status, 200);

      const variantIdInputValue = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantIdInputValue);

      partialCredit1VariantId = variantIdInputValue.toString();

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

  test.sequential('student creates and submits to second variant', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit2Url = assessmentResponse.$('a:contains("Question 2")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${partialCredit2Url}`);
      assert.equal(questionResponse.status, 200);

      const variantIdInputValue = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantIdInputValue);
      partialCredit2VariantId = variantIdInputValue.toString();

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

  test.sequential('instructor cannot break variants on Exam assessment via questions page', async () => {
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
    
    // Since this is an Exam assessment, the request should fail with a 400 error
    assert.equal(breakVariantsResponse.status, 400);
    
    // Check that the error message is present in the response body
    const responseText = await breakVariantsResponse.text();
    assert.include(responseText, 'Reset question variants is not supported for Exam assessments');
    assert.include(responseText, 'instance questions to become unopenable');
  });

  test.sequential('instructor cannot break variants on Exam assessment via instance page', async () => {
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
    
    // Since this is an Exam assessment, the request should fail with a 400 error
    assert.equal(breakVariantsResponse.status, 400);
    
    // Check that the error message is present in the response body
    const responseText = await breakVariantsResponse.text();
    assert.include(responseText, 'Reset question variants is not supported for Exam assessments');
    assert.include(responseText, 'instance questions to become unopenable');
  });

  test.sequential('student sees same variant when revisiting first question (reset was blocked)', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const addNumbersUrl = assessmentResponse.$('a:contains("Question 1")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${addNumbersUrl}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantId);
      // Since reset was blocked for Exam assessments, variant should remain the same
      assert.equal(variantId.toString(), partialCredit1VariantId);
    });
  });

  test.sequential('student sees same variant when revisiting second question (reset was blocked)', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const addNumbersUrl = assessmentResponse.$('a:contains("Question 2")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${addNumbersUrl}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantId);
      // Since reset was blocked for Exam assessments, variant should remain the same
      assert.equal(variantId.toString(), partialCredit2VariantId);
    });
  });
});

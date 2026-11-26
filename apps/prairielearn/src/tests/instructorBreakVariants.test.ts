import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import {
  type Assessment,
  type AssessmentQuestion,
  InstanceQuestionSchema,
} from '../lib/db-types.js';
import { updateInstanceQuestionScore } from '../lib/manualGrading.js';
import { selectAssessmentQuestionByQuestionId } from '../models/assessment-question.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectQuestionByQid } from '../models/question.js';

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

describe('Instructor force-breaking variants on homework', { concurrent: false }, () => {
  let assessment: Assessment;
  let partialCredit1AssessmentQuestion: AssessmentQuestion;
  let partialCredit2AssessmentQuestion: AssessmentQuestion;
  let partialCredit1VariantId: string;
  let partialCredit2VariantId: string;
  let assessmentStudentUrl: string;

  beforeAll(async () => {
    await helperServer.before()();

    assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    assessmentStudentUrl = `${siteUrl}/pl/course_instance/1/assessment/${assessment.id}`;

    partialCredit1AssessmentQuestion = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: (await selectQuestionByQid({ course_id: '1', qid: 'partialCredit1' })).id,
    });
    partialCredit2AssessmentQuestion = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: (await selectQuestionByQid({ course_id: '1', qid: 'partialCredit2' })).id,
    });
  });
  afterAll(helperServer.after);

  test('student creates and submits to first variant', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit1Url = assessmentResponse.$('a:contains("Partial credit 1")').attr('href');

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

  test('student creates and submits to second variant', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit2Url = assessmentResponse.$('a:contains("Partial credit 2")').attr('href');

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

  test('instructor breaks first variant via assessment question page', async () => {
    const assessmentQuestionsUrl = `${courseInstanceUrl}/instructor/assessment/${assessment.id}/questions`;

    const assessmentQuestionsResponse = await fetchCheerio(assessmentQuestionsUrl);
    const csrfToken = getCSRFToken(assessmentQuestionsResponse.$);

    const breakVariantsResponse = await fetchCheerio(assessmentQuestionsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'reset_question_variants',
        __csrf_token: csrfToken,
        unsafe_assessment_question_id: partialCredit1AssessmentQuestion.id,
      }),
    });
    assert.equal(breakVariantsResponse.status, 200);
  });

  test('instructor breaks second variant via student instance page', async () => {
    const instanceUrl = `${courseInstanceUrl}/instructor/assessment_instance/1`;

    const instanceQuestion = await queryScalar(
      sql.select_instance_question,
      { assessment_question_id: partialCredit2AssessmentQuestion.id },
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

  test('student sees new variant when revisiting first question', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit1Url = assessmentResponse.$('a:contains("Partial credit 1")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${partialCredit1Url}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantId);
      assert.notEqual(variantId.toString(), partialCredit1VariantId);
    });
  });

  test('student sees new variant when revisiting second question', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const partialCredit2Url = assessmentResponse.$('a:contains("Partial credit 2")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${partialCredit2Url}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantId);
      assert.notEqual(variantId.toString(), partialCredit2VariantId);
    });
  });

  const saveAnswer = async (linkText: string, answers: Record<string, string>) => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      const questionUrl = `${siteUrl}${assessmentResponse.$(`a:contains("${linkText}")`).attr('href')}`;
      const questionResponse = await fetchCheerio(questionUrl);
      const saveResponse = await fetchCheerio(questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save',
          __csrf_token: getCSRFToken(questionResponse.$),
          __variant_id: questionResponse.$('input[name=__variant_id]').val()!.toString(),
          ...answers,
        }),
      });
      assert.equal(saveResponse.status, 200);
    });
  };
  const selectAssessmentQuestion = async (qid: string) =>
    await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: (await selectQuestionByQid({ course_id: '1', qid })).id,
    });
  const selectInstanceQuestion = async (assessmentQuestion: AssessmentQuestion) =>
    await queryRow(
      sql.select_instance_question_row,
      { assessment_question_id: assessmentQuestion.id },
      InstanceQuestionSchema,
    );
  const resetVariants = async (assessmentQuestion: AssessmentQuestion) => {
    const assessmentQuestionsUrl = `${courseInstanceUrl}/instructor/assessment/${assessment.id}/questions`;
    const assessmentQuestionsResponse = await fetchCheerio(assessmentQuestionsUrl);
    const response = await fetchCheerio(assessmentQuestionsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'reset_question_variants',
        __csrf_token: getCSRFToken(assessmentQuestionsResponse.$),
        unsafe_assessment_question_id: assessmentQuestion.id,
      }),
    });
    assert.equal(response.status, 200);
  };

  test('resetting a variant discards an answer that was saved but never graded', async () => {
    const partialCredit6AssessmentQuestion = await selectAssessmentQuestion(
      'partialCredit6_no_partial',
    );
    await saveAnswer('Partial credit 1', { s: '100' });
    await saveAnswer('Partial credit 6', { s1: '100', s2: '100' });
    assert.equal((await selectInstanceQuestion(partialCredit1AssessmentQuestion)).status, 'saved');
    assert.equal((await selectInstanceQuestion(partialCredit6AssessmentQuestion)).status, 'saved');

    await resetVariants(partialCredit1AssessmentQuestion);
    await resetVariants(partialCredit6AssessmentQuestion);

    // The first question was graded before the discarded answer was saved.
    assert.equal(
      (await selectInstanceQuestion(partialCredit1AssessmentQuestion)).status,
      'incorrect',
    );
    assert.equal(
      (await selectInstanceQuestion(partialCredit6AssessmentQuestion)).status,
      'unanswered',
    );
  });

  test('resetting a variant keeps work that staff graded or still need to grade', async () => {
    const staffGradedAssessmentQuestion = await selectAssessmentQuestion(
      'partialCredit6_no_partial',
    );
    await saveAnswer('Partial credit 6', { s1: '100', s2: '100' });
    await updateInstanceQuestionScore({
      assessment,
      instance_question_id: (await selectInstanceQuestion(staffGradedAssessmentQuestion)).id,
      submission_id: null,
      check_modified_at: null,
      score: { points: 2 },
      authn_user_id: '1',
    });
    assert.equal((await selectInstanceQuestion(staffGradedAssessmentQuestion)).status, 'complete');
    await saveAnswer('Partial credit 6', { s1: '100', s2: '100' });
    assert.equal((await selectInstanceQuestion(staffGradedAssessmentQuestion)).status, 'saved');

    // This question has manual points and has never been graded.
    const manualAssessmentQuestion = await selectAssessmentQuestion('partialCredit3');
    await saveAnswer('Partial credit 3', { s: '100' });

    await resetVariants(staffGradedAssessmentQuestion);
    await resetVariants(manualAssessmentQuestion);

    assert.equal((await selectInstanceQuestion(staffGradedAssessmentQuestion)).status, 'complete');
    const manualInstanceQuestion = await selectInstanceQuestion(manualAssessmentQuestion);
    assert.equal(manualInstanceQuestion.status, 'saved');
    assert.isTrue(manualInstanceQuestion.requires_manual_grading);
  });
});

// We currently forbid resetting variants for Exam assessments.
// See https://github.com/PrairieLearn/PrairieLearn/issues/12977
describe('Instructor force-breaking variants on exam', { concurrent: false }, () => {
  let assessment: Assessment;
  let partialCredit1AssessmentQuestion: AssessmentQuestion;
  let partialCredit2AssessmentQuestion: AssessmentQuestion;
  let partialCredit1VariantId: string;
  let partialCredit2VariantId: string;
  let assessmentStudentUrl: string;

  beforeAll(async () => {
    await helperServer.before()();

    assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam15-breakVariants',
    });
    assessmentStudentUrl = `${siteUrl}/pl/course_instance/1/assessment/${assessment.id}`;

    partialCredit1AssessmentQuestion = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: (await selectQuestionByQid({ course_id: '1', qid: 'partialCredit1' })).id,
    });
    partialCredit2AssessmentQuestion = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: (await selectQuestionByQid({ course_id: '1', qid: 'partialCredit2' })).id,
    });
  });
  afterAll(helperServer.after);

  test('student starts assessment', async () => {
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

  test('student creates and submits to first variant', async () => {
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

  test('student creates and submits to second variant', async () => {
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

  test('instructor cannot break first variant via assessment question page', async () => {
    const assessmentQuestionsUrl = `${courseInstanceUrl}/instructor/assessment/${assessment.id}/questions`;

    const assessmentQuestionsResponse = await fetchCheerio(assessmentQuestionsUrl);
    const csrfToken = getCSRFToken(assessmentQuestionsResponse.$);

    const breakVariantsResponse = await fetchCheerio(assessmentQuestionsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'reset_question_variants',
        __csrf_token: csrfToken,
        unsafe_assessment_question_id: partialCredit1AssessmentQuestion.id,
      }),
    });
    assert.equal(breakVariantsResponse.status, 403);
  });

  test('instructor cannot break second variant via student instance page', async () => {
    const instanceUrl = `${courseInstanceUrl}/instructor/assessment_instance/1`;

    const instanceQuestion = await queryScalar(
      sql.select_instance_question,
      { assessment_question_id: partialCredit2AssessmentQuestion.id },
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
    assert.equal(breakVariantsResponse.status, 403);
  });

  test('student sees same variant when revisiting first question', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const addNumbersUrl = assessmentResponse.$('a:contains("Question 1")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${addNumbersUrl}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantId);
      assert.equal(variantId.toString(), partialCredit1VariantId);
    });
  });

  test('student sees same variant when revisiting second question', async () => {
    await withUser(studentUser, async () => {
      const assessmentResponse = await fetchCheerio(assessmentStudentUrl);
      assert.equal(assessmentResponse.status, 200);
      const addNumbersUrl = assessmentResponse.$('a:contains("Question 2")').attr('href');

      const questionResponse = await fetchCheerio(`${siteUrl}${addNumbersUrl}`);
      assert.equal(questionResponse.status, 200);

      const variantId = questionResponse.$('input[name=__variant_id]').val();
      assert.isDefined(variantId);
      assert.equal(variantId.toString(), partialCredit2VariantId);
    });
  });
});

import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

describe('Real-time grading control tests', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  describe('Exam assessment with real-time grading disabled', function () {
    const context: Record<string, any> = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

    beforeAll(async function () {
      const { id: assessmentId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam8-disableRealTimeGrading',
      });
      context.assessmentId = assessmentId;
      context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
    });

    test.sequential('visit start exam page', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentUrl);
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
      });
      assert.isTrue(response.ok);

      // We should have been redirected to the assessment instance
      const assessmentInstanceUrl = response.url;
      assert.include(assessmentInstanceUrl, '/assessment_instance/');
      context.assessmentInstanceUrl = assessmentInstanceUrl;

      const questionUrl = response.$('a:contains("Question 1")').attr('href');
      context.questionUrl = `${context.siteUrl}${questionUrl}`;
    });

    test.sequential('check for grade button on the assessment page', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentUrl);
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('form[name="grade-form"]'), 0);
    });

    test.sequential('check for grade button on a question page', async () => {
      const response = await helperClient.fetchCheerio(context.questionUrl);
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('button[name="__action"][value="grade"]'), 0);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    });

    test.sequential('try to manually grade request on the question page', async () => {
      const response = await fetch(context.assessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: context.__csrf_token,
        }),
      });

      assert.isFalse(response.ok);
      assert.equal(response.status, 403);
    });
  });

  // Note that this test doesn't test full hierarchical inheritance of the real-time
  // grading settings; that's already covered by the sync tests. Rather, we just have
  // two questions, one with real-time grading enabled, and one with it disabled. We
  // have disabled question shuffling to ensure a consistent order for the tests.
  describe('Mixed real-time grading control', function () {
    const context: Record<string, any> = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

    beforeAll(async function () {
      const { id: assessmentId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam17-mixedRealTimeGrading',
      });
      context.assessmentId = assessmentId;
      context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
    });

    test.sequential('start assessment with mixed real-time grading', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentUrl);
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, 'form');

      const startResponse = await helperClient.fetchCheerio(context.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: context.__csrf_token,
        }),
      });
      assert.isTrue(startResponse.ok);

      const assessmentInstanceUrl = startResponse.url;
      assert.include(assessmentInstanceUrl, '/assessment_instance/');
      context.assessmentInstanceUrl = assessmentInstanceUrl;
    });

    test.sequential('verify mixed grading UI on assessment instance page', async () => {
      const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl);
      assert.isTrue(response.ok);

      // Check that the assessment shows a global grade button since some questions allow real-time grading
      const gradeButton = response.$('form[name="grade-form"]');

      // Should have a global grade button since some questions allow real-time grading (mixed settings)
      assert.lengthOf(
        gradeButton,
        1,
        'Should show global grade button for mixed real-time grading assessment when some questions allow grading',
      );
    });

    test.sequential('verify question-specific grading controls', async () => {
      const assessmentResponse = await helperClient.fetchCheerio(context.assessmentInstanceUrl);
      const questionLinks = assessmentResponse.$('a[href*="/instance_question/"]');

      // Ensure we have the expected number of questions.
      assert.lengthOf(questionLinks, 2);

      // The first question has real-time grading enabled.
      const enabledQuestionHref = questionLinks.eq(0).attr('href');
      assert.ok(enabledQuestionHref);

      const enabledQuestionUrl = new URL(enabledQuestionHref, context.siteUrl);
      const enabledQuestionResponse = await helperClient.fetchCheerio(enabledQuestionUrl);
      assert.isTrue(enabledQuestionResponse.ok);

      // Grab the variant ID so we can make submissions.
      const enabledVariantId = enabledQuestionResponse
        .$('input[name=__variant_id]')
        .val()
        ?.toString() as string;

      // It should have both "Save" and "Save & Grade" buttons.
      assert.lengthOf(enabledQuestionResponse.$('button[name="__action"][value="save"]'), 1);
      assert.lengthOf(enabledQuestionResponse.$('button[name="__action"][value="grade"]'), 1);

      // We should be able to save an answer.
      const enabledSaveResponse = await helperClient.fetchCheerio(enabledQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save',
          __csrf_token: helperClient.getCSRFToken(enabledQuestionResponse.$),
          __variant_id: enabledVariantId,
          s: '100',
        }),
      });
      assert.isTrue(enabledSaveResponse.ok);

      // We should be able to grade an answer.
      const enabledGradeResponse = await helperClient.fetchCheerio(enabledQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: helperClient.getCSRFToken(enabledQuestionResponse.$),
          __variant_id: enabledVariantId,
          s: '100',
        }),
      });
      assert.isTrue(enabledGradeResponse.ok);

      // TODO: test both save and save+grade buttons.

      // The second question has real-time grading disabled.
      const disabledQuestionHref = questionLinks.eq(1).attr('href');
      assert.ok(disabledQuestionHref, 'Second question should have a valid href');

      const disabledQuestionUrl = new URL(disabledQuestionHref, context.siteUrl);
      const disabledQuestionResponse = await helperClient.fetchCheerio(disabledQuestionUrl);
      assert.isTrue(disabledQuestionResponse.ok);

      // Grab the variant ID so we can make submissions.
      const disabledVariantId = disabledQuestionResponse
        .$('input[name=__variant_id]')
        .val()
        ?.toString() as string;

      // It should only have a "Save" button.
      assert.lengthOf(disabledQuestionResponse.$('button[name="__action"][value="save"]'), 1);
      assert.lengthOf(disabledQuestionResponse.$('button[name="__action"][value="grade"]'), 0);

      // We should be able to save an answer.
      const disabledSaveResponse = await helperClient.fetchCheerio(disabledQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save',
          __csrf_token: helperClient.getCSRFToken(disabledQuestionResponse.$),
          __variant_id: disabledVariantId,
          s: '100',
        }),
      });
      assert.isTrue(disabledSaveResponse.ok);

      // We should NOT be able to grade an answer.
      const disabledGradeResponse = await helperClient.fetchCheerio(disabledQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: helperClient.getCSRFToken(disabledQuestionResponse.$),
          __variant_id: disabledVariantId,
          s: '100',
        }),
      });
      assert.equal(disabledGradeResponse.status, 403);
      assert.include(
        await disabledGradeResponse.text(),
        'Error: Real-time grading is not allowed for this question',
      );
    });
  });
});

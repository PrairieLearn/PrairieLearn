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
  // grading settings; that's already covered by the sync tests. Rather, we just
  // have three questions where it's either directly disabled (the first question) or
  // directly enabled (the second and third questions).
  //
  // We have disabled question shuffling to ensure a consistent order for the tests.
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
      const gradeButton = response.$('form[name="grade-form"] button[type="submit"]');
      assert.lengthOf(gradeButton, 1);
      assert.equal(gradeButton.attr('disabled'), 'disabled');
    });

    test.sequential('verify question-specific grading controls', async () => {
      const assessmentResponse = await helperClient.fetchCheerio(context.assessmentInstanceUrl);
      assert.isTrue(assessmentResponse.ok);
      const questionLinks = assessmentResponse.$('a[href*="/instance_question/"]');

      // Ensure we have the expected number of questions. There are 5 questions total, but we only
      // actually care about the first three for this test.
      assert.lengthOf(questionLinks, 5);

      // The first question has real-time grading disabled.
      const disabledQuestionHref = questionLinks.eq(0).attr('href');
      assert.ok(disabledQuestionHref, 'Second question should have a valid href');

      const disabledQuestionUrl = new URL(disabledQuestionHref, context.siteUrl);
      const disabledQuestionResponse = await helperClient.fetchCheerio(disabledQuestionUrl);
      assert.isTrue(disabledQuestionResponse.ok);

      // Grab the variant ID so we can make submissions.
      const disabledVariantId = disabledQuestionResponse
        .$('input[name=__variant_id]')
        .val() as string;

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

      // The second question has real-time grading enabled. We'll use this question
      // to test that the "Save & Grade" button on the instance question page works as expected.
      const enabledQuestionHref = questionLinks.eq(1).attr('href');
      assert.ok(enabledQuestionHref);

      const enabledQuestionUrl = new URL(enabledQuestionHref, context.siteUrl);
      const enabledQuestionResponse = await helperClient.fetchCheerio(enabledQuestionUrl);
      assert.isTrue(enabledQuestionResponse.ok);

      // Grab the variant ID so we can make submissions.
      const enabledVariantId = enabledQuestionResponse
        .$('input[name=__variant_id]')
        .val() as string;

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

      // The third question also has real-time grading enabled. We'll use this question to
      // test that the "Save N saved answers" button on the assessment instance page works
      // as expected. Specifically: it should only grade the third question, NOT the saved
      // answer to the second question where real-time grading was disabled.
      const otherEnabledQuestionHref = questionLinks.eq(2).attr('href');
      assert.ok(otherEnabledQuestionHref);

      const otherEnabledQuestionUrl = new URL(otherEnabledQuestionHref, context.siteUrl);
      const otherEnabledQuestionResponse = await helperClient.fetchCheerio(otherEnabledQuestionUrl);
      assert.isTrue(otherEnabledQuestionResponse.ok);

      // Grab the variant ID so we can make submissions.
      const otherEnabledVariantId = otherEnabledQuestionResponse
        .$('input[name=__variant_id]')
        .val() as string;

      // We should be able to save an answer.
      const otherEnabledSaveResponse = await helperClient.fetchCheerio(otherEnabledQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save',
          __csrf_token: helperClient.getCSRFToken(otherEnabledQuestionResponse.$),
          __variant_id: otherEnabledVariantId,
          s: '100',
        }),
      });
      assert.isTrue(otherEnabledSaveResponse.ok);
    });

    test.sequential('verify assessment instance grading controls', async () => {
      const assessmentResponse = await helperClient.fetchCheerio(context.assessmentInstanceUrl);
      assert.isTrue(assessmentResponse.ok);

      // We should be able to grade the saved answer from the assessment instance page.
      const otherEnabledGradeResponse = await helperClient.fetchCheerio(
        context.assessmentInstanceUrl,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'grade',
            __csrf_token: helperClient.getCSRFToken(assessmentResponse.$),
          }),
        },
      );
      assert.isTrue(otherEnabledGradeResponse.ok);

      // The first question (real-time grading disabled) should still be in the "Saved" state,
      // and its score should be pending.
      const tableRow = otherEnabledGradeResponse.$(
        'table[data-testid="assessment-questions"] tbody tr:nth-child(1)',
      );
      const badge = tableRow.find('span.badge');
      assert.lengthOf(badge, 2);
      assert.equal(badge.eq(0).text().trim(), 'saved');
      assert.equal(badge.eq(1).text().trim(), 'pending');

      // We should now be able to finish the entire assessment.
      //
      // First, make sure that the form and button actually exist.
      const modal = otherEnabledGradeResponse.$('#confirmFinishModal');
      const form = modal.closest('form');
      assert.lengthOf(form, 1);
      const finishButton = form.find('button[name="__action"][value="finish"]');
      assert.lengthOf(finishButton, 1);

      // Make a request to actually finish.
      const finishResponse = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'finish',
          __csrf_token: helperClient.getCSRFToken(form),
        }),
      });
      assert.isTrue(finishResponse.ok);

      const gradedTableRow = finishResponse.$(
        'table[data-testid="assessment-questions"] tbody tr:nth-child(1)',
      );
      const gradedBadge = gradedTableRow.find('span.badge');
      assert.lengthOf(gradedBadge, 1);
      assert.equal(gradedBadge.text().trim(), 'complete');
    });
  });
});

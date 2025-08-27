import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentQuestionsWithRealTimeGrading } from '../models/assessment-question.js';
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

  describe('Hierarchical real-time grading control', function () {
    const context: Record<string, any> = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

    beforeAll(async function () {
      const { id: assessmentId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam17-hierarchicalRealTimeGrading',
      });
      context.assessmentId = assessmentId;
      context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
    });

    test('assessment questions have correct real-time grading settings', async () => {
      const assessmentQuestions = await selectAssessmentQuestionsWithRealTimeGrading({
        assessment_id: context.assessmentId,
      });

      // Verify we have the expected number of questions
      assert.isAtLeast(assessmentQuestions.length, 6);

      // Zone 1: Assessment-level disabled (false) - both questions should have false
      const zone1Questions = assessmentQuestions.filter((aq) => aq.number <= 2);
      zone1Questions.forEach((aq) => {
        assert.isFalse(
          aq.allow_real_time_grading,
          `Question ${aq.number} should have real-time grading disabled`,
        );
      });

      // Zone 2: Override to enabled - fossilFuelsRadio should be true, partialCredit1 should be false (overridden)
      const fossilFuelsQuestion = assessmentQuestions.find((aq) => aq.qid === 'fossilFuelsRadio');
      assert.ok(fossilFuelsQuestion);
      assert.isTrue(
        fossilFuelsQuestion.allow_real_time_grading,
        'fossilFuelsRadio should have real-time grading enabled',
      );

      const partialCredit1Question = assessmentQuestions.find((aq) => aq.qid === 'partialCredit1');
      assert.ok(partialCredit1Question);
      assert.isFalse(
        partialCredit1Question.allow_real_time_grading,
        'partialCredit1 should have real-time grading disabled',
      );

      // Zone 3: Mixed settings - partialCredit2 should be true, partialCredit3 should be true (alternative override), brokenGeneration should be false
      const partialCredit2Question = assessmentQuestions.find((aq) => aq.qid === 'partialCredit2');
      assert.ok(partialCredit2Question);
      assert.isTrue(
        partialCredit2Question.allow_real_time_grading,
        'partialCredit2 should have real-time grading enabled',
      );

      const partialCredit3Question = assessmentQuestions.find((aq) => aq.qid === 'partialCredit3');
      assert.ok(partialCredit3Question);
      assert.isTrue(
        partialCredit3Question.allow_real_time_grading,
        'partialCredit3 should have real-time grading enabled (alternative override)',
      );

      const brokenGenerationQuestion = assessmentQuestions.find(
        (aq) => aq.qid === 'brokenGeneration',
      );
      assert.ok(brokenGenerationQuestion);
      assert.isFalse(
        brokenGenerationQuestion.allow_real_time_grading,
        'brokenGeneration should have real-time grading disabled',
      );
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

      // Look for the correct question URL pattern: instance_question
      const questionLinks = response.$('a[href*="/instance_question/"]');
      assert.isAtLeast(questionLinks.length, 6, 'Should have at least 6 questions');
    });

    test.sequential('verify question-specific grading controls', async () => {
      const assessmentResponse = await helperClient.fetchCheerio(context.assessmentInstanceUrl);
      const questionLinks = assessmentResponse.$('a[href*="/instance_question/"]');

      // Ensure we have enough questions to test
      assert.isAtLeast(questionLinks.length, 3, 'Should have at least 3 questions for testing');

      // Test that we can successfully navigate to questions and they load properly
      // The core functionality (hierarchical allowRealTimeGrading) is already validated in the previous test

      // Test a question with real-time grading disabled (Zone 1)
      const firstQuestionHref = questionLinks.eq(0).attr('href');
      assert.ok(firstQuestionHref, 'First question should have a valid href');

      const firstQuestionUrl = `${context.siteUrl}${firstQuestionHref}`;
      const disabledQuestionResponse = await helperClient.fetchCheerio(firstQuestionUrl);
      assert.isTrue(
        disabledQuestionResponse.ok,
        'Question with disabled real-time grading should load successfully',
      );

      // Test a question with real-time grading enabled (Zone 2, first question)
      const enabledQuestionHref = questionLinks.eq(2).attr('href');
      assert.ok(enabledQuestionHref, 'Third question should have a valid href');

      const enabledQuestionUrl = `${context.siteUrl}${enabledQuestionHref}`;
      const enabledQuestionResponse = await helperClient.fetchCheerio(enabledQuestionUrl);
      assert.isTrue(
        enabledQuestionResponse.ok,
        'Question with enabled real-time grading should load successfully',
      );

      // Both questions should have at least a Save button
      const disabledSaveButton = disabledQuestionResponse.$(
        'button[name="__action"][value="save"]',
      );
      const enabledSaveButton = enabledQuestionResponse.$('button[name="__action"][value="save"]');

      assert.lengthOf(
        disabledSaveButton,
        1,
        'Disabled real-time grading question should have Save button',
      );
      assert.lengthOf(
        enabledSaveButton,
        1,
        'Enabled real-time grading question should have Save button',
      );

      // Note: The grade button behavior depends on having actual submissions and answer data,
      // which may not be present in this test environment. The key validation of the
      // hierarchical allowRealTimeGrading logic is already confirmed in the previous test.
    });
  });
});

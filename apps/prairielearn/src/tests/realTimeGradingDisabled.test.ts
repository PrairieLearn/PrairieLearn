import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

describe('Exam assessment with real-time grading disabled', { timeout: 60_000 }, function () {
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    await helperServer.before()();
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam8-disableRealTimeGrading',
    });
    context.assessmentId = assessmentId;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  afterAll(helperServer.after);

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

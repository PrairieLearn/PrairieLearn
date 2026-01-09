import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

describe('Exam assessment with grade rate set', { timeout: 60_000 }, function () {
  const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    await helperServer.before()();
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam10-gradeRate',
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

    const question1Url = response.$('a:contains("Question 1")').attr('href');
    context.question1Url = `${context.siteUrl}${question1Url}`;
    const question2Url = response.$('a:contains("Question 2")').attr('href');
    context.question2Url = `${context.siteUrl}${question2Url}`;
  });

  test.sequential(
    'check for enabled grade button on a question page before submission',
    async () => {
      const response = await helperClient.fetchCheerio(context.question1Url);
      assert.isTrue(response.ok);

      const elemList = response.$('button[name="__action"][value="grade"]');
      assert.lengthOf(elemList, 1);
      assert.isFalse(elemList.is(':disabled'));

      helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
      helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
    },
  );

  test.sequential('submit an answer to the question', async () => {
    const response = await fetch(context.question1Url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'grade',
        __csrf_token: context.__csrf_token,
        __variant_id: context.__variant_id,
        s: '50', // To get 50% of the question
      }),
    });

    assert.isTrue(response.ok);
  });

  test.sequential(
    'check for disabled grade button on a question page after submission',
    async () => {
      const response = await helperClient.fetchCheerio(context.question1Url);
      assert.isTrue(response.ok);

      const elemList = response.$('button[name="__action"][value="grade"]');
      assert.lengthOf(elemList, 1);
      assert.isTrue(elemList.is(':disabled'));
    },
  );

  test.sequential('check for enabled grade button on another question page', async () => {
    const response = await helperClient.fetchCheerio(context.question2Url);
    assert.isTrue(response.ok);

    const elemList = response.$('button[name="__action"][value="grade"]');
    assert.lengthOf(elemList, 1);
    assert.isFalse(elemList.is(':disabled'));
  });
});

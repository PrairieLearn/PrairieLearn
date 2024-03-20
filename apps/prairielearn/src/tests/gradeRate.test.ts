import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';

import * as helperServer from './helperServer';
import * as helperClient from './helperClient';

const sql = sqldb.loadSqlEquiv(__filename);

describe('Exam assessment with grade rate set', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  before('set up testing server', async function () {
    await helperServer.before().call(this);
    const results = await sqldb.queryOneRowAsync(sql.select_exam, []);
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });
  after('shut down testing server', helperServer.after);

  step('visit start exam page', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
  });

  step('start the exam', async () => {
    const form = {
      __action: 'new_instance',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.assessmentUrl, {
      method: 'POST',
      form,
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

  step('check for enabled grade button on a question page before submission', async () => {
    const response = await helperClient.fetchCheerio(context.question1Url);
    assert.isTrue(response.ok);

    const elemList = response.$('button[name="__action"][value="grade"]');
    assert.lengthOf(elemList, 1);
    assert.isFalse(elemList.is(':disabled'));

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
  });

  step('submit an answer to the question', async () => {
    const form = {
      __action: 'grade',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      s: '50', // To get 50% of the question
    };
    const response = await helperClient.fetchCheerio(context.question1Url, {
      method: 'POST',
      form,
    });

    assert.isTrue(response.ok);
  });

  step('check for disabled grade button on a question page after submission', async () => {
    const response = await helperClient.fetchCheerio(context.question1Url);
    assert.isTrue(response.ok);

    const elemList = response.$('button[name="__action"][value="grade"]');
    assert.lengthOf(elemList, 1);
    assert.isTrue(elemList.is(':disabled'));
  });

  step('check for enabled grade button on another question page', async () => {
    const response = await helperClient.fetchCheerio(context.question2Url);
    assert.isTrue(response.ok);

    const elemList = response.$('button[name="__action"][value="grade"]');
    assert.lengthOf(elemList, 1);
    assert.isFalse(elemList.is(':disabled'));
  });
});

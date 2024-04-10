import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import * as helperServer from './helperServer';
import * as helperClient from './helperClient';

const sql = sqldb.loadSqlEquiv(__filename);

describe('Exam assessment with bonus points', function () {
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

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    const question1Url = response.$('a:contains("Partial credit 1")').attr('href');
    context.question1Url = `${context.siteUrl}${question1Url}`;
    const question2Url = response.$('a:contains("Partial credit 2")').attr('href');
    context.question2Url = `${context.siteUrl}${question2Url}`;
  });

  step('visit first question', async () => {
    const response = await helperClient.fetchCheerio(context.question1Url);
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
  });

  step('submit an answer to the first question', async () => {
    const form = {
      __action: 'grade',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      s: '75', // To get 75% of the question
    };
    const response = await helperClient.fetchCheerio(context.question1Url, {
      method: 'POST',
      form,
    });
    assert.isTrue(response.ok);
  });

  step('check assessment points', async () => {
    const params = {
      assessment_id: context.assessmentId,
    };
    const results = await sqldb.queryOneRowAsync(sql.read_assessment_instance_points, params);
    assert.equal(results.rowCount, 1);
    assert.equal(results.rows[0].points, 6);
    assert.equal(results.rows[0].score_perc, 60);
  });

  step('visit second question', async () => {
    const response = await helperClient.fetchCheerio(context.question2Url);
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
  });

  step('submit an answer to the second question', async () => {
    const form = {
      __action: 'grade',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      s: '100', // To get 100% of the question
    };
    const response = await helperClient.fetchCheerio(context.question2Url, {
      method: 'POST',
      form,
    });

    assert.isTrue(response.ok);
  });

  step('check assessment points', async () => {
    const params = {
      assessment_id: context.assessmentId,
    };
    const results = await sqldb.queryOneRowAsync(sql.read_assessment_instance_points, params);
    assert.equal(results.rowCount, 1);
    // 6+8 is 14, but limit should be 10+2 (max plus bonus)
    assert.equal(results.rows[0].points, 12);
    assert.equal(results.rows[0].score_perc, 120);
  });
});

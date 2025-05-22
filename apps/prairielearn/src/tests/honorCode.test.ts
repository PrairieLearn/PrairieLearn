import { assert } from 'chai';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const defaultHonorCodeText =
  'I certify that I am Dev User and I am allowed to take this assessment. I pledge on my honor that I will not give or receive any unauthorized assistance on this assessment and that all work will be my own.';

const customHonorCodeHtml =
  '<div class="px-3 py-2 honor-code"><h2>Honor Code</h2> <p>I, Dev User, pledge that I am allowed to take the following assessment and will not receive any unauthorized assistance.</p></div> <div class="card-footer d-flex justify-content-center"> <span class="form-check"> <input type="checkbox" class="form-check-input" id="certify-pledge"> <label class="form-check-label fw-bold" for="certify-pledge"> I certify and pledge the above. </label> </span> </div>';

describe('Exam assessment response to `requireHonorCode`', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  before('set up testing server', helperServer.before());

  after('shut down testing server', helperServer.after);

  it('visits the landing page of default assessment', async () => {
    const results = await sqldb.queryOneRowAsync(sql.select_exam, {
      number: '1',
    });
    const assessmentId = results.rows[0].id;
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-class-honor-code'), 1);
    assert.equal(
      response.$('div.test-class-honor-code').children().first().text().replace(/\s+/g, ' ').trim(),
      defaultHonorCodeText,
    );
  });

  it('visits landing page of assessment with disabled honor code', async () => {
    const results = await sqldb.queryOneRowAsync(sql.select_exam, {
      number: '13',
    });
    const assessmentId = results.rows[0].id;
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should not see the honor code div anymore
    assert.lengthOf(response.$('div.test-class-honor-code'), 0);
  });

  it('visits the landing page of assessment with a custom honor code', async () => {
    const results = await sqldb.queryOneRowAsync(sql.select_exam, {
      number: '2',
    });
    const assessmentId = results.rows[0].id;
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-class-honor-code'), 1);
    assert.equal(
      response.$('div.test-class-honor-code').html()?.replace(/\s+/g, ' ').trim(),
      customHonorCodeHtml,
    );
  });
});

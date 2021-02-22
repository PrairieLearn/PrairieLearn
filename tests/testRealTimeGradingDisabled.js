const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Exam assessment with real-time grading disabled', function() {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl= `${context.baseUrl}/course_instance/1`;

  before('set up testing server', async function() {
    await util.promisify(helperServer.before().bind(this))();
    const results = await sqldb.queryOneRowAsync(sql.select_exam8, []);
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
    const response = await helperClient.fetchCheerio(context.assessmentUrl, { method: 'POST', form });
    assert.isTrue(response.ok);

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    const questionUrl = response.$('a:contains("Question 1")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionUrl}`;
  });

  step('check for grade button on the assessment page', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    assert.lengthOf(response.$('form[name="grade-form"]'), 0);
  });

  step('check for grade button on a question page', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    assert.lengthOf(response.$('button[name="__action"][value="grade"]'), 0);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
  });

  step('try to manually grade request on the question page', async () => {
    const form = {
      __action: 'grade',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, { method: 'POST', form });

    assert.isFalse(response.ok);
    assert.equal(response.status, 403);
  });
});

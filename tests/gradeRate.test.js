const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Exam assessment with grade rate set', function () {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  before('set up testing server', async function () {
    await util.promisify(helperServer.before().bind(this))();
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

    let elemList = response.$('button[name="__action"][value="grade"]');
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

    let elemList = response.$('button[name="__action"][value="grade"]');
    assert.lengthOf(elemList, 1);
    assert.isTrue(elemList.is(':disabled'));
  });

  step('check for enabled grade button on another question page', async () => {
    const response = await helperClient.fetchCheerio(context.question2Url);
    assert.isTrue(response.ok);

    let elemList = response.$('button[name="__action"][value="grade"]');
    assert.lengthOf(elemList, 1);
    assert.isFalse(elemList.is(':disabled'));
  });
});

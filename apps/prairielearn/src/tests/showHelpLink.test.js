const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');

const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Show helpLink on some assessment', function () {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  const headers = {
    cookie: 'pl_test_user=test_student; pl_test_date=2000-01-19T00:00:01',
    // need student mode to get a timed exam (instructor override bypasses this)
  };

  before('set up testing server', async function () {
    await util.promisify(helperServer.before().bind(this))();
    const results = await sqldb.queryOneRowAsync(sql.select_exam8, []);
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });
  after('shut down testing server', helperServer.after);

  // we need to access the homepage to create the test_student user in the DB
  step('visit home page', async () => {
    const response = await helperClient.fetchCheerio(context.baseUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('enroll the test student user in the course', async () => {
    await sqldb.queryOneRowAsync(sql.enroll_student_in_course, []);
  });

  step('visit start exam page', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentUrl, {
      headers,
    });
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
      headers,
    });
    assert.isTrue(response.ok);

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    // save the questionUrl for later
    const questionUrl = response.$('a:contains("Question 1")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionUrl}`;

    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      'form[name="time-limit-finish-form"]'
    );
  });

  step('check that the question has the help link', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl, {
      headers,
    });
    const elemList = response.$('a:contains(Ask course staff for help with this question)');
    assert.lengthOf(elemList, 1);
  });
});

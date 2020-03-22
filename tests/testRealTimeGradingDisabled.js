const util = require('util');
const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');

/**
 * A wrapper around node-fetch that provides a few features:
 * * Automatic parsing with cheerio
 * * A `form` option akin to that from the `request` library
 */
const fetchCheerio = async (url, options = {}) => {
  if (options.form) {
    options.body = JSON.stringify(options.form);
    options.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    delete options.form;
  }
  const response = await fetch(url, options);
  const text = await response.text();
  response.$ = cheerio.load(text);
  // response.text() can only be called once, which we already did.
  // patch this so consumers can use it as normal.
  response.text = () => text;
  return response;
};

/**
 * This test validates the behavior of exams with real-time grading disabled.
 * It was deliberately written separately from `testExam.js` as a start to
 * breaking tests out of that monolith. It does not reuse existing conventions
 * from `testExam.js` in favor of experimenting with a different way of writing
 * PrairieLearn tests.
 */
describe('Exam assessment with real-time grading disabled', function() {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl= `${context.baseUrl}/course_instance/1`;

  /**
   * Utility function that extracts a CSRF token from a `__csrf_token` input
   * that is a descendent of the `parentSelector`, if one is specified.
   * The token will also be persisted to `context.__csrf_token`.
   */
  const extractAndSaveCSRFToken = ($, parentSelector = '') => {
    const csrfTokenInput = $(`${parentSelector} input[name="__csrf_token"]`);
    assert.lengthOf(csrfTokenInput, 1);
    const csrfToken = csrfTokenInput.val();
    assert.isString(csrfToken);
    context.__csrf_token = csrfToken;
    return csrfToken;
  };

  before('set up testing server', async function() {
    await util.promisify(helperServer.before().bind(this))();
    const results = await sqldb.queryOneRowAsync(sql.select_exam8, []);
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });
  after('shut down testing server', helperServer.after);

  step('visit start exam page', async () => {
    const response = await fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    extractAndSaveCSRFToken(response.$, 'form');
  });

  step('start the exam', async () => {
    const form = {
      __action: 'newInstance',
      __csrf_token: context.__csrf_token,
    };
    const response = await fetchCheerio(context.assessmentUrl, { method: 'POST', form });
    assert.isTrue(response.ok);

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    const questionUrl = response.$('a:contains("Question 1")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionUrl}`;
  });

  step('check for grade button on the assessment page', async () => {
    const response = await fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    assert.lengthOf(response.$('form[name="grade-form"]'), 0);
  });

  step('check for grade button on a question page', async () => {
    const response = await fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    assert.lengthOf(response.$('button[name="__action"][value="grade"]'), 0);

    extractAndSaveCSRFToken(response.$, '.question-form');
  });

  step('try to manually grade request on the question page', async () => {
    const form = {
      __action: 'grade',
      __csrf_token: context.__csrf_token,
    };
    const response = await fetchCheerio(context.assessmentInstanceUrl, { method: 'POST', form });

    assert.isFalse(response.ok);
    assert.equal(response.status, 403);
  });
});

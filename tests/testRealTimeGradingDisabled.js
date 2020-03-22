const util = require('util');
const ERR = require('async-stacktrace');
const _ = require('lodash');
const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');
const helperAttachFiles = require('./helperAttachFiles');

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

  before('set up testing server', async function() {
    await util.promisify(helperServer.before().bind(this))();
    const results = await sqldb.queryOneRowAsync(sql.select_exam2, []);
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });
  after('shut down testing server', helperServer.after);

  it('should load the start exam page', async () => {
    const response = await fetch(context.assessmentUrl).then(res => res.text());
    const $ = cheerio.load(response);

    assert.equal($('#start-assessment').text(), 'Start assessment');

    const csrfTokenInput = $('form input[name="__csrf_token"]');
    assert.lengthOf(csrfTokenInput, 1);
    context.__csrf_token = csrfTokenInput.val();
    assert.isString(context.__csrf_token);
  });

  it('should successfully start the exam', async () => {
    const form = {
      __action: 'newInstance',
      __csrf_token: context.__csrf_token,
    };
    const response = await fetch(context.assessmentUrl, {
      method: 'POST',
      body: JSON.stringify(form),
      headers: { 'Content-Type': 'application/json' },
    }).then(res => res.text());
    const $ = cheerio.load(response);

    const questionUrl = $('a:contains("Question 1")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionUrl}`;
  });

  it('should not have a grade button on the assessment page', async () => {
    const response = await fetch(context.assessmentUrl).then(res => res.text());
    const $ = cheerio.load(response);

    assert.lengthOf($('form[name="grade-form"]'), 0);
  });
});

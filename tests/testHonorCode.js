const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
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
  // Patch this so consumers can use it as normal.
  response.text = () => text;
  return response;
};

describe('Exam assessment response to `requireHonorCode`', function () {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  before('set up testing server', helperServer.before);

  after('shut down testing server', helperServer.after);

  step('get default exam info', async () => {
    const results = await sqldb.queryOneRowAsync(sql.select_exam, { number: '1' });
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  step('visit default exam landing page', async () => {
    const response = await fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-suite-honor-code'), 1);
  });

  step('get `"requireHonorCode": false` exam info', async () => {
    const results = await sqldb.queryOneRowAsync(sql.select_exam, { number: '2' });
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  step('visit `"requireHonorCode": false` exam landing page', async () => {
    const response = await fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    // We should not see the honor code div anymore
    assert.lengthOf(response.$('div.test-suite-honor-code'), 0);
  });
});

const assert = require('chai').assert;

const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Exam assessment response to `requireHonorCode`', function () {
  this.timeout(60000);

  const context = {};
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

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-class-honor-code'), 1);
  });

  it('visits landing page of assessment with disabled honor code', async () => {
    const results = await sqldb.queryOneRowAsync(sql.select_exam, {
      number: '13',
    });
    const assessmentId = results.rows[0].id;
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    // We should not see the honor code div anymore
    assert.lengthOf(response.$('div.test-class-honor-code'), 0);
  });
});

// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const fetch = require('node-fetch').default;
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqldb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';


describe('Question Sharing', function () {
  this.timeout(80000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await sqldb.queryAsync(sql.enable_question_sharing, {});
  });

  describe('Create a sharing set and add a question to it', () => {
    
    step('set test course sharing name', async () => {
      const sharingUrl = `${baseUrl}/course/1/course_admin/sharing`;
      let sharingPage = await (await fetch(sharingUrl)).text();
      let $sharingPage = cheerio.load(sharingPage);

      const token = $sharingPage('#test_csrf_token').text();
      const response = await fetch(sharingUrl, {
        method: 'POST',
        headers: { 'Content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          __action: 'choose_sharing_name',
          __csrf_token: token,
          course_sharing_name: 'test-course'
        }).toString(),
      });

      sharingPage = await (await fetch(sharingUrl)).text();
      assert(sharingPage.includes('test-course'));

    });

  });
});

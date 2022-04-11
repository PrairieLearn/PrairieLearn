const ERR = require('async-stacktrace');
const assert = require('chai').assert;
const requestp = require('request-promise-native');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const questionUrl = baseUrl + '/course_instance/1/instructor/question/1/preview';
const courseInstanceIssuesUrl = baseUrl + '/course_instance/1/instructor/course_admin/issues';
const courseIssuesUrl = baseUrl + '/course/1/course_admin/issues';

const locals = {};

describe('Issues', function () {
  this.timeout(10000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  doTest(questionUrl, courseInstanceIssuesUrl, 'course');
  doTest(questionUrl, courseIssuesUrl, 'course instance');
});

function doTest(questionUrl, issuesUrl, label) {
  let page, elemList;

  describe(`Report issue with question and close all issues in ${label}`, () => {
    it('should get question preview page', async () => {
      page = await requestp(questionUrl);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });

    it('should have a __csrf_token and a __variant_id', () => {
      elemList = locals.$('div[id="issueCollapse"] input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
      elemList = locals.$('div[id="issueCollapse"] input[name="__variant_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__variant_id = elemList[0].attribs.value;
      assert.isString(locals.__variant_id);
    });

    it('should post report_issue', async () => {
      const options = {
        url: questionUrl,
        followAllRedirects: true,
        resolveWithFullResponse: true,
      };
      options.form = {
        __action: 'report_issue',
        __csrf_token: locals.__csrf_token,
        description: 'Something bad happened',
        __variant_id: locals.__variant_id,
      };
      page = await requestp.post(options);
      locals.url = page.request.href; // eslint-disable-line require-atomic-updates
      locals.$ = cheerio.load(page.body); // eslint-disable-line require-atomic-updates
    });

    it('should have one open issue', (callback) => {
      sqldb.query(sql.select_open_issues, [], (err, result) => {
        if (ERR(err, callback)) return;
        if (result.rowCount !== 1) {
          callback(
            new Error(
              `found ${result.rowCount} issues (expected one issue):\n` +
                JSON.stringify(result.rows, null, '    ')
            )
          );
          return;
        }
        callback(null);
      });
    });

    it('should get issues page successfully', async () => {
      page = await requestp(issuesUrl);
      locals.$ = cheerio.load(page); // eslint-disable-line require-atomic-updates
    });

    it('should have a __csrf_token', () => {
      elemList = locals.$('div[id="closeAllIssuesModal"] input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });

    it('should post close_all', async () => {
      const options = {
        url: issuesUrl,
        followAllRedirects: true,
        resolveWithFullResponse: true,
      };
      options.form = {
        __action: 'close_all',
        __csrf_token: locals.__csrf_token,
      };
      page = await requestp.post(options);
      locals.url = page.request.href; // eslint-disable-line require-atomic-updates
      locals.$ = cheerio.load(page.body); // eslint-disable-line require-atomic-updates
    });

    it('should have zero open issues', (callback) => {
      sqldb.query(sql.select_open_issues, [], (err, result) => {
        if (ERR(err, callback)) return;
        if (result.rowCount > 0) {
          callback(
            new Error(
              `found ${result.rowCount} issues (expected zero issues):\n` +
                JSON.stringify(result.rows, null, '    ')
            )
          );
          return;
        }
        callback(null);
      });
    });
  });
}

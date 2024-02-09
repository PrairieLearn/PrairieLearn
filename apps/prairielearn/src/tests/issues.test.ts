import { assert } from 'chai';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';

import * as helperServer from './helperServer';

const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceIssuesUrl = baseUrl + '/course_instance/1/instructor/course_admin/issues';
const courseIssuesUrl = baseUrl + '/course/1/course_admin/issues';

describe('Issues', function () {
  this.timeout(10000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  doTest(courseInstanceIssuesUrl, 'course');
  doTest(courseIssuesUrl, 'course instance');
});

function doTest(issuesUrl: string, label: string) {
  describe(`Report issue with question and close all issues in ${label}`, () => {
    let questionUrl;

    step('should report an issue to a question', async () => {
      const questionId = (await sqldb.queryOneRowAsync(sql.select_question_id, [])).rows[0].id;
      questionUrl = `${baseUrl}/course_instance/1/instructor/question/${questionId}/preview`;
      let res = await fetch(questionUrl);
      let $ = cheerio.load(await res.text());

      const csrfToken = $('div[id="issueCollapse"] input[name="__csrf_token"]')
        .first()
        .attr('value');
      assert(typeof csrfToken === 'string');

      const variantId = $('div[id="issueCollapse"] input[name="__variant_id"]')
        .first()
        .attr('value');
      assert(typeof variantId === 'string');

      res = await fetch(questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'report_issue',
          __csrf_token: csrfToken,
          __variant_id: variantId,
          description: 'Something bad happened',
        }),
      });
      $ = cheerio.load(await res.text());

      const result = await sqldb.queryAsync(sql.select_open_issues, []);
      assert.equal(result.rowCount, 1, 'Expected one open issue');
    });

    step('should close all matching issues', async () => {
      let res = await fetch(issuesUrl);
      let $ = cheerio.load(await res.text());

      const csrfToken = $('div#closeMatchingIssuesModal input[name="__csrf_token"]')
        .first()
        .attr('value');
      assert(typeof csrfToken === 'string');

      const issueIds = $('div#closeMatchingIssuesModal input[name="unsafe_issue_ids"]')
        .first()
        .attr('value');
      assert(typeof issueIds === 'string');

      res = await fetch(issuesUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'close_matching',
          __csrf_token: csrfToken,
          unsafe_issue_ids: issueIds,
        }),
      });
      $ = cheerio.load(await res.text());

      const result = await sqldb.queryAsync(sql.select_open_issues, []);
      assert.equal(result.rowCount, 0, 'Expected zero open issues');
    });
  });
}

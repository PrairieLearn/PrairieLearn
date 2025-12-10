import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceIssuesUrl = baseUrl + '/course_instance/1/instructor/course_admin/issues';
const courseIssuesUrl = baseUrl + '/course/1/course_admin/issues';

describe('Issues', { timeout: 15_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  doTest(courseInstanceIssuesUrl, 'course');
  doTest(courseIssuesUrl, 'course instance');
});

function doTest(issuesUrl: string, label: string) {
  describe(`Report issue with question and close all issues in ${label}`, () => {
    let questionUrl;

    test.sequential('should report issues to a question', async () => {
      const questionId = await sqldb.queryRow(sql.select_question_id, IdSchema);
      questionUrl = `${baseUrl}/course_instance/1/instructor/question/${questionId}/preview`;
      let res = await fetch(questionUrl);
      const $ = cheerio.load(await res.text());

      const csrfToken = $('div[id="issueCollapse"] input[name="__csrf_token"]')
        .first()
        .attr('value');
      assert(typeof csrfToken === 'string');

      const variantId = $('div[id="issueCollapse"] input[name="__variant_id"]')
        .first()
        .attr('value');
      assert(typeof variantId === 'string');

      // We'll report three issues total so that we have a variety to close.
      // We give them distinct descriptions to test that "close matching" works.

      res = await fetch(questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'report_issue',
          __csrf_token: csrfToken,
          __variant_id: variantId,
          description: 'mountain breeze crisp',
        }),
      });
      assert.equal(res.status, 200);

      res = await fetch(questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'report_issue',
          __csrf_token: csrfToken,
          __variant_id: variantId,
          description: 'velvet sunset glow',
        }),
      });
      assert.equal(res.status, 200);

      res = await fetch(questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'report_issue',
          __csrf_token: csrfToken,
          __variant_id: variantId,
          description: 'whispering river serenade',
        }),
      });
      assert.equal(res.status, 200);

      const rowCount = await sqldb.execute(sql.select_open_issues);
      assert.equal(rowCount, 3, 'Expected three open issues');
    });

    test.sequential('should close issues matching a query', async () => {
      const issuesUrlWithQuery = `${issuesUrl}?q=is%3Aopen+mountain`;
      let res = await fetch(issuesUrlWithQuery);
      const $ = cheerio.load(await res.text());

      const csrfToken = $('div#closeMatchingIssuesModal input[name="__csrf_token"]')
        .first()
        .attr('value');
      assert(typeof csrfToken === 'string');

      const issueIds = $('div#closeMatchingIssuesModal input[name="unsafe_issue_ids"]')
        .first()
        .attr('value');
      assert(typeof issueIds === 'string');

      res = await fetch(issuesUrlWithQuery, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'close_matching',
          __csrf_token: csrfToken,
          unsafe_issue_ids: issueIds,
        }),
      });
      assert.equal(res.status, 200);

      const rowCount = await sqldb.execute(sql.select_open_issues);
      assert.equal(rowCount, 2, 'Expected two open issues');
    });

    test.sequential('should close all open issues', async () => {
      let res = await fetch(issuesUrl);
      const $ = cheerio.load(await res.text());

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
      assert.equal(res.status, 200);

      const rowCount = await sqldb.execute(sql.select_open_issues);
      assert.equal(rowCount, 0, 'Expected zero open issues');
    });
  });
}

import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const queriesUrl = `${baseUrl}/administrator/queries`;
const queryRunningQueriesUrl = `${baseUrl}/administrator/query/db_running_queries`;
const queryGenerateAndEnrollUrl = `${baseUrl}/administrator/query/generate_and_enroll_users`;

describe('AdministratorQuery page', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  test.sequential('visit queries page', async () => {
    const response = await helperClient.fetchCheerio(queriesUrl);
    assert.isTrue(response.ok);

    // we should have the "db_running_queries" entry
    const query = response.$('table a:contains("db_running_queries")');
    assert.lengthOf(query, 1);

    // we should have the "generate_and_enroll_users" entry (which does not have a SQL file)
    const query2 = response.$('table a:contains("generate_and_enroll_users")');
    assert.lengthOf(query2, 1);
  });

  test.sequential('visit query page for a query without params (runs immediately)', async () => {
    const response = await helperClient.fetchCheerio(queryRunningQueriesUrl);
    assert.isTrue(response.ok);

    // we should have results from the query
    const results = response.$('[data-testid="row-count"]');
    assert.lengthOf(results, 1);
  });

  test.sequential('visit query page for a query with params (runs on submit)', async () => {
    const response = await helperClient.fetchCheerio(queryGenerateAndEnrollUrl);
    assert.isTrue(response.ok);
    const __csrf_token = response.$('#test_csrf_token').text();
    assert.isNotEmpty(__csrf_token);

    const postResponse = await helperClient.fetchCheerio(queryGenerateAndEnrollUrl, {
      method: 'POST',
      body: new URLSearchParams({ count: '3', course_instance_id: '1', __csrf_token }),
    });
    assert.isTrue(postResponse.ok);

    // we should have results from the query
    const results = postResponse.$('[data-testid="row-count"]');
    assert.lengthOf(results, 1);
    assert.equal(results.text().replaceAll(/\s+/g, ' ').trim(), '3 rows');
    const table = postResponse.$('[data-testid="results-table"]');
    assert.lengthOf(table, 1);
    assert.lengthOf(table.find('thead th'), 5); // user_id, uid, name, course, course_instance
    assert.lengthOf(table.find('tbody tr'), 3);
  });
});

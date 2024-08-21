import { assert } from 'chai';
import { step } from 'mocha-steps';

import { config } from '../lib/config.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const baseUrl = `${siteUrl}/pl`;
const queriesUrl = `${baseUrl}/administrator/queries`;
const queryUrl = `${baseUrl}/administrator/query/db_running_queries`;
const queryUuidsUrl = `${baseUrl}/administrator/query/generate_uuids`;

describe('AdministratorQuery page', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  step('visit queries page', async () => {
    const response = await helperClient.fetchCheerio(queriesUrl);
    assert.isTrue(response.ok);

    // we should have the "db_running_queries.sql" entry
    const query = response.$('table a:contains("db_running_queries")');
    assert.lengthOf(query, 1);

    // we should have the "generate_uuids.js" entry (which does not have a SQL file)
    const query2 = response.$('table a:contains("generate_uuids")');
    assert.lengthOf(query2, 1);
  });

  step('visit query page for a SQL-based query', async () => {
    const response = await helperClient.fetchCheerio(queryUrl);
    assert.isTrue(response.ok);

    // we should have results from the query
    const results = response.$('[data-testid="row-count"]');
    assert.lengthOf(results, 1);
  });

  step('visit query page for a JS-based query', async () => {
    const response = await helperClient.fetchCheerio(queryUuidsUrl);
    assert.isTrue(response.ok);
    const __csrf_token = response.$('#test_csrf_token').text();
    assert.isNotEmpty(__csrf_token);

    const postResponse = await helperClient.fetchCheerio(queryUuidsUrl, {
      method: 'POST',
      form: { count: '3', __csrf_token },
    });
    assert.isTrue(postResponse.ok);

    // we should have results from the query
    const results = postResponse.$('[data-testid="row-count"]');
    assert.lengthOf(results, 1);
    assert.equal(results.text().replaceAll(/\s+/g, ' ').trim(), '3 rows');
    const table = postResponse.$('[data-testid="results-table"]');
    assert.lengthOf(table, 1);
    assert.lengthOf(table.find('tbody tr'), 3);
  });
});

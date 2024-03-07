import { assert } from 'chai';
import { step } from 'mocha-steps';

import { config } from '../lib/config';

import * as helperServer from './helperServer';
import * as helperClient from './helperClient';

describe('AdministratorQuery page', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.queriesUrl = `${context.baseUrl}/administrator/queries`;
  context.queryUrl = `${context.baseUrl}/administrator/query/db_running_queries`;

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  step('visit queries page', async () => {
    const response = await helperClient.fetchCheerio(context.queriesUrl);
    assert.isTrue(response.ok);

    // we should have the "db_running_queries.sql" entry
    const query = response.$('table a:contains("db_running_queries")');
    assert.lengthOf(query, 1);
  });

  step('visit query page', async () => {
    const response = await helperClient.fetchCheerio(context.queryUrl);
    assert.isTrue(response.ok);

    // we should have results from the query
    const results = response.$('.test-suite-row-count');
    assert.lengthOf(results, 1);
  });
});

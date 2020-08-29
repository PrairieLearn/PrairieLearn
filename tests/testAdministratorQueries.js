const assert = require('chai').assert;
const { step } = require('mocha-steps');

const config = require('../lib/config');

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('AdministratorQuery page', function() {
    this.timeout(60000);

    const context = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;
    context.queriesUrl = `${context.baseUrl}/administrator/queries`;
    context.queryUrl = `${context.baseUrl}/administrator/query/db_running_queries`;
    context.options = {headers: {cookie: 'pl_access_as_administrator=active'}};

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    step('visit queries page', async () => {
        const response = await helperClient.fetchCheerio(context.queriesUrl, context.options);
        assert.isTrue(response.ok);

        // we should have the "db_running_queries.sql" entry
        const query = response.$('table a:contains("db_running_queries")');
        assert.lengthOf(query, 1);
    });

    step('visit query page', async () => {
        const response = await helperClient.fetchCheerio(context.queryUrl, context.options);
        assert.isTrue(response.ok);

        // we should have results from the query
        const results = response.$('.test-suite-row-count');
        assert.lengthOf(results, 1);
    });
});

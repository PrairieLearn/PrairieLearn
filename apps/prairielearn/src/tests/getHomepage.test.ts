import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import * as helperServer from './helperServer';

const baseUrl = 'http://localhost:' + config.serverPort;

describe('GET /', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  it('should load and contain QA 101', async () => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    const page = await response.text();
    const $ = cheerio.load(page);
    assert.ok($('td a:contains("QA 101")').length);
  });
});

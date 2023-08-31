import * as assert from 'assert';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import * as helperServer from './helperServer';

const baseUrl = 'http://localhost:' + config.serverPort;

describe('GET /', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  let $: cheerio.CheerioAPI;
  it('should load successfully', async () => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    const page = await response.text();
    $ = cheerio.load(page);
  });
  it('should contain QA 101', () => {
    assert.ok($('td a:contains("QA 101")').length);
  });
});

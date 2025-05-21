import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const baseUrl = 'http://localhost:' + config.serverPort;

describe('GET /', function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  it('should load and contain QA 101', async () => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    const page = await response.text();
    const $ = cheerio.load(page);
    assert.ok($('td a:contains("QA 101")').length);
  });
});

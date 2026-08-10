import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

describe('GET /pl/login', { timeout: 20_000 }, () => {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  it('renders the login page for a valid institution ID', async () => {
    const response = await fetch(`${siteUrl}/pl/login?institution_id=1`);

    assert.equal(response.status, 200);
  });

  it('rejects a malformed institution ID', async () => {
    const url = new URL('/pl/login', siteUrl);
    url.searchParams.set('institution_id', "' UNION SELECT 1--");

    const response = await fetch(url);

    assert.equal(response.status, 400);
  });
});

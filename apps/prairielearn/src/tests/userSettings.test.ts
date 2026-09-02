import * as cheerio from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getUserTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { selectUserSettings } from '../models/user-settings.js';
import { createUserTrpcClient } from '../trpc/user/client.js';

import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;

describe('User settings', { timeout: 60_000, concurrent: false }, () => {
  let trpcClient: ReturnType<typeof createUserTrpcClient>;

  beforeAll(async () => {
    await withConfig({ trustProxy: true }, async () => {
      await helperServer.before()();
    });
  });
  beforeAll(() => {
    trpcClient = createUserTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        { url: getUserTrpcUrl(), authn_user_id: '1' },
        config.secretKey,
      ),
      urlBase: siteUrl,
    });
  });
  afterAll(helperServer.after);

  test('shows the current IP address in the user profile', async () => {
    const response = await fetch(`${siteUrl}/pl/settings`, {
      headers: { 'X-Forwarded-For': '203.0.113.42' },
    });
    assert(response.ok);

    const $ = cheerio.load(await response.text());
    const ipAddressRow = $('table[aria-label="User profile information"] tr').filter(
      (_, element) => $(element).find('th').text().trim() === 'IP address',
    );
    assert.lengthOf(ipAddressRow, 1);
    assert.equal(ipAddressRow.find('td').text().trim(), '203.0.113.42');
  });

  test('updates settings for the authenticated user', async () => {
    const updatedSettings = await trpcClient.settings.update.mutate({
      enableSingleKeyShortcuts: false,
    });

    assert.deepEqual(updatedSettings, { enableSingleKeyShortcuts: false });
    assert.deepInclude(await selectUserSettings({ user_id: '1' }), {
      user_id: '1',
      enable_single_key_shortcuts: false,
    });

    await trpcClient.settings.update.mutate({ enableSingleKeyShortcuts: true });
  });
});

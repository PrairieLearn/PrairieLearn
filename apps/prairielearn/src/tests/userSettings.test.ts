import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getUserTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { selectUserSettings } from '../models/user-settings.js';
import { createUserTrpcClient } from '../trpc/user/client.js';

import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

describe('User settings', { timeout: 60_000, concurrent: false }, () => {
  let trpcClient: ReturnType<typeof createUserTrpcClient>;

  beforeAll(helperServer.before());
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

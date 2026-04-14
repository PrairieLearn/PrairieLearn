import { TRPCClientError } from '@trpc/client';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { type AiGradingSettingsRouter } from '../ee/pages/instructorInstanceAdminAiGrading/trpc.js';
import { createAiGradingSettingsTrpcClient } from '../ee/pages/instructorInstanceAdminAiGrading/utils/trpc-client.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { decryptFromStorage } from '../lib/storage-crypt.js';
import { selectCredentials } from '../models/ai-grading-credentials.js';
import { selectCourseInstanceById } from '../models/course-instances.js';

import * as helperServer from './helperServer.js';
import { type AuthUser, getConfiguredUser, getOrCreateUser, withUser } from './utils/auth.js';

const siteUrl = 'http://localhost:' + config.serverPort;

const viewerUser: AuthUser = {
  uid: 'viewer1',
  name: 'Viewer User',
  uin: '00000099',
};

const aiGradingSettingsPath = '/pl/course_instance/1/instructor/instance_admin/ai_grading';

async function createTrpcClient(user?: AuthUser) {
  const dbUser = user ? await getOrCreateUser(user) : await getConfiguredUser();
  const csrfToken = generatePrefixCsrfToken(
    { url: aiGradingSettingsPath + '/trpc', authn_user_id: dbUser.id },
    config.secretKey,
  );

  return createAiGradingSettingsTrpcClient({
    csrfToken,
    urlBase: siteUrl + aiGradingSettingsPath,
  });
}

describe('AI grading credentials', () => {
  beforeAll(async () => {
    config.isEnterprise = true;
    await helperServer.before()();
  });
  afterAll(async () => {
    await helperServer.after();
    config.isEnterprise = false;
  });

  describe('CRUD operations', () => {
    let client: Awaited<ReturnType<typeof createTrpcClient>>;

    beforeAll(async () => {
      await features.enable('ai-grading');
      client = await createTrpcClient();
    });

    test.sequential('toggle custom API keys on', async () => {
      const result = await client.updateUseCustomApiKeys.mutate({ enabled: true });
      assert.isTrue(result.useCustomApiKeys);

      const ci = await selectCourseInstanceById('1');
      assert.isTrue(ci.ai_grading_use_custom_api_keys);
    });

    test.sequential('add an OpenAI credential', async () => {
      const result = await client.addCredential.mutate({
        provider: 'openai',
        secret_key: 'sk-test-openai-key-1234567890',
      });
      assert.equal(result.credential.provider, 'openai');
      assert.include(result.credential.apiKeyMasked, '...');
      assert.notInclude(result.credential.apiKeyMasked, 'sk-test-openai-key-1234567890');
    });

    test.sequential('verify credential is encrypted in the database', async () => {
      const credentials = await selectCredentials('1');
      assert.lengthOf(credentials, 1);
      assert.equal(credentials[0].provider, 'openai');
      assert.notEqual(credentials[0].encrypted_secret_key, 'sk-test-openai-key-1234567890');
      const decrypted = decryptFromStorage(credentials[0].encrypted_secret_key);
      assert.equal(decrypted, 'sk-test-openai-key-1234567890');
    });

    test.sequential('upsert replaces existing credential for same provider', async () => {
      await client.addCredential.mutate({
        provider: 'openai',
        secret_key: 'sk-test-openai-key-UPDATED',
      });
      const credentials = await selectCredentials('1');
      const openaiCreds = credentials.filter((c) => c.provider === 'openai');
      assert.lengthOf(openaiCreds, 1);
      const decrypted = decryptFromStorage(openaiCreds[0].encrypted_secret_key);
      assert.equal(decrypted, 'sk-test-openai-key-UPDATED');
    });

    test.sequential('add credentials for multiple providers', async () => {
      await client.addCredential.mutate({
        provider: 'anthropic',
        secret_key: 'sk-ant-test-key',
      });
      const credentials = await selectCredentials('1');
      assert.lengthOf(credentials, 2);
      const providers = credentials.map((c) => c.provider).sort();
      assert.deepEqual(providers, ['anthropic', 'openai']);
    });

    test.sequential('delete a credential', async () => {
      const credentials = await selectCredentials('1');
      const anthropicCred = credentials.find((c) => c.provider === 'anthropic');
      assert.isDefined(anthropicCred);

      await client.deleteCredential.mutate({ credential_id: anthropicCred.id });

      const remaining = await selectCredentials('1');
      assert.lengthOf(remaining, 1);
      assert.equal(remaining[0].provider, 'openai');
    });

    test.sequential('deleting a credential from another course instance is a no-op', async () => {
      const credentials = await selectCredentials('1');
      const openaiCred = credentials.find((c) => c.provider === 'openai');
      assert.isDefined(openaiCred);

      await client.deleteCredential.mutate({ credential_id: '999999' });

      const remaining = await selectCredentials('1');
      assert.lengthOf(remaining, 1);
    });

    test.sequential('toggle custom API keys off', async () => {
      const result = await client.updateUseCustomApiKeys.mutate({ enabled: false });
      assert.isFalse(result.useCustomApiKeys);

      const ci = await selectCourseInstanceById('1');
      assert.isFalse(ci.ai_grading_use_custom_api_keys);
    });

    test.sequential('API key input is trimmed server-side', async () => {
      await client.updateUseCustomApiKeys.mutate({ enabled: true });
      await client.addCredential.mutate({
        provider: 'google',
        secret_key: '  sk-google-with-whitespace  ',
      });
      const credentials = await selectCredentials('1');
      const googleCred = credentials.find((c) => c.provider === 'google');
      assert.isDefined(googleCred);
      const decrypted = decryptFromStorage(googleCred.encrypted_secret_key);
      assert.equal(decrypted, 'sk-google-with-whitespace');
    });
  });

  describe('authorization', () => {
    test.sequential('non-owner user cannot call mutations', async () => {
      const client = await withUser(viewerUser, () => createTrpcClient(viewerUser));
      await withUser(viewerUser, async () => {
        try {
          await client.updateUseCustomApiKeys.mutate({ enabled: true });
          assert.fail('Expected FORBIDDEN error');
        } catch (e) {
          assert.instanceOf(e, TRPCClientError);
          assert.equal((e as TRPCClientError<AiGradingSettingsRouter>).data?.code, 'FORBIDDEN');
        }
      });
    });
  });
});

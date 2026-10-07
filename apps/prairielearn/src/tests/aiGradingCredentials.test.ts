import { TRPCClientError } from '@trpc/client';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { resolveAiGradingKeys } from '../ee/lib/ai-grading/ai-grading-credentials.js';
import { type AiGradingSettingsRouter } from '../ee/pages/instructorInstanceAdminAiGrading/trpc.js';
import { createAiGradingSettingsTrpcClient } from '../ee/pages/instructorInstanceAdminAiGrading/utils/trpc-client.js';
import { config } from '../lib/config.js';
import { decryptFromStorage, encryptForStorage } from '../lib/encrypted-storage.js';
import { features } from '../lib/features/index.js';
import { selectCredentials } from '../models/ai-grading-credentials.js';
import { selectCourseInstanceById } from '../models/course-instances.js';

import * as helperServer from './helperServer.js';
import { type AuthUser, getConfiguredUser, getOrCreateUser, withUser } from './utils/auth.js';

const siteUrl = 'http://localhost:' + config.serverPort;
const sql = loadSqlEquiv(import.meta.url);

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

describe('AI grading credentials', { concurrent: false }, () => {
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

    test('toggle custom API keys on', async () => {
      const result = await client.updateUseCustomApiKeys.mutate({ enabled: true });
      assert.isTrue(result.useCustomApiKeys);

      const ci = await selectCourseInstanceById('1');
      assert.isTrue(ci.ai_grading_use_custom_api_keys);
    });

    test('add an OpenAI credential', async () => {
      const result = await client.addCredential.mutate({
        provider: 'openai',
        secret_key: 'sk-test-openai-key-1234567890',
      });
      assert.equal(result.credential.provider, 'openai');
      assert.include(result.credential.apiKeyMasked, '...');
      assert.notInclude(result.credential.apiKeyMasked, 'sk-test-openai-key-1234567890');
    });

    test('verify credential is encrypted in the database', async () => {
      const credentials = await selectCredentials('1');
      assert.lengthOf(credentials, 1);
      assert.equal(credentials[0].provider, 'openai');
      assert.isNull(credentials[0].base_url);
      assert.deepEqual(credentials[0].model_capabilities, {});
      assert.equal(credentials[0].config_version, 1);
      assert.notEqual(credentials[0].encrypted_secret_key, 'sk-test-openai-key-1234567890');
      const decrypted = decryptFromStorage(credentials[0].encrypted_secret_key);
      assert.equal(decrypted, 'sk-test-openai-key-1234567890');
    });

    test('upsert replaces existing credential for same provider', async () => {
      await client.addCredential.mutate({
        provider: 'openai',
        secret_key: 'sk-test-openai-key-UPDATED',
      });
      const credentials = await selectCredentials('1');
      const openaiCreds = credentials.filter((c) => c.provider === 'openai');
      assert.lengthOf(openaiCreds, 1);
      const decrypted = decryptFromStorage(openaiCreds[0].encrypted_secret_key);
      assert.equal(decrypted, 'sk-test-openai-key-UPDATED');
      assert.equal(openaiCreds[0].config_version, 2);
    });

    test('add credentials for multiple providers', async () => {
      await client.addCredential.mutate({
        provider: 'anthropic',
        secret_key: 'sk-ant-test-key',
      });
      const credentials = await selectCredentials('1');
      assert.lengthOf(credentials, 2);
      const providers = credentials.map((c) => c.provider).sort();
      assert.deepEqual(providers, ['anthropic', 'openai']);
    });

    test('delete a credential', async () => {
      const credentials = await selectCredentials('1');
      const anthropicCred = credentials.find((c) => c.provider === 'anthropic');
      assert.isDefined(anthropicCred);

      await client.deleteCredential.mutate({ credential_id: anthropicCred.id });

      const remaining = await selectCredentials('1');
      assert.lengthOf(remaining, 1);
      assert.equal(remaining[0].provider, 'openai');
    });

    test('deleting a credential from another course instance is a no-op', async () => {
      const credentials = await selectCredentials('1');
      const openaiCred = credentials.find((c) => c.provider === 'openai');
      assert.isDefined(openaiCred);

      await client.deleteCredential.mutate({ credential_id: '999999' });

      const remaining = await selectCredentials('1');
      assert.lengthOf(remaining, 1);
    });

    test('toggle custom API keys off', async () => {
      const result = await client.updateUseCustomApiKeys.mutate({ enabled: false });
      assert.isFalse(result.useCustomApiKeys);

      const ci = await selectCourseInstanceById('1');
      assert.isFalse(ci.ai_grading_use_custom_api_keys);
    });

    test('API key input is trimmed server-side', async () => {
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

  describe('custom provider preparation', () => {
    beforeEach(async () => {
      await execute(sql.delete_custom_credentials);
    });

    afterAll(async () => {
      await execute(sql.delete_custom_credentials);
    });

    async function insertCredential(
      overrides: {
        provider?: string;
        base_url?: string | null;
        model_capabilities?: unknown;
      } = {},
    ) {
      const user = await getConfiguredUser();
      await execute(sql.insert_custom_credential, {
        provider: 'openai-compatible',
        base_url: 'https://llm.example.edu/v1',
        ...overrides,
        model_capabilities: JSON.stringify(overrides.model_capabilities ?? {}),
        encrypted_secret_key: encryptForStorage('custom-provider-key'),
        created_by: user.id,
      });
    }

    test('reads custom capabilities without treating the key as Anthropic', async () => {
      await insertCredential({
        model_capabilities: {
          'university/model': { images: 'unsupported', pdf: 'supported' },
        },
      });
      const credentials = await selectCredentials('1');
      const custom = credentials.find((credential) => credential.provider === 'openai-compatible')!;
      assert.equal(custom.base_url, 'https://llm.example.edu/v1');
      assert.deepEqual(custom.model_capabilities, {
        'university/model': { images: 'unsupported', pdf: 'supported' },
      });
      const keys = await resolveAiGradingKeys(await selectCourseInstanceById('1'));
      assert.isNull(keys.anthropic);
      assert.equal(keys.openai?.apiKey, 'sk-test-openai-key-UPDATED');
    });

    test.each([null, ''])('rejects custom credentials with base URL %s', async (base_url) => {
      await expect(insertCredential({ base_url })).rejects.toMatchObject({
        constraint: 'ci_ai_grading_credentials_configuration_check',
      });
    });

    test('rejects a URL for an official provider', async () => {
      await expect(insertCredential({ provider: 'anthropic' })).rejects.toMatchObject({
        constraint: 'ci_ai_grading_credentials_configuration_check',
      });
    });

    test('rejects capabilities that are not an object', async () => {
      await expect(insertCredential({ model_capabilities: [] })).rejects.toMatchObject({
        constraint: 'ci_ai_grading_credentials_configuration_check',
      });
    });

    test('allows only one custom provider per course instance', async () => {
      await insertCredential();
      await expect(insertCredential()).rejects.toMatchObject({
        constraint: 'ci_ai_grading_credentials_ci_id_provider_key',
      });
    });

    test('does not enable custom provider writes through the existing API', async () => {
      const client = await createTrpcClient();
      const response = await client.addCredential
        .mutate({
          // @ts-expect-error Custom providers are intentionally unavailable in this API.
          provider: 'openai-compatible',
          secret_key: 'custom-provider-key',
        })
        .catch((error: unknown) => error);
      assert.instanceOf(response, TRPCClientError);
      assert.equal(response.data?.code, 'BAD_REQUEST');
    });
  });

  describe('authorization', () => {
    test('non-owner user cannot call mutations', async () => {
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

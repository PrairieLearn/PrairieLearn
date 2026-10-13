import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { getAppError } from '@prairielearn/trpc/client';

import * as discovery from '../ee/lib/ai-grading/ai-grading-model-discovery.js';
import { config } from '../lib/config.js';
import { decryptFromStorage } from '../lib/encrypted-storage.js';
import { features } from '../lib/features/index.js';
import { selectCredentials } from '../models/ai-grading-credentials.js';
import { selectAuditEvents } from '../models/audit-event.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import type { AiGradingProvidersError } from '../trpc/courseInstance/ai-grading-providers.js';
import { createCourseInstanceTrpcClient } from '../trpc/courseInstance/client.js';

import * as helperServer from './helperServer.js';
import { type AuthUser, getConfiguredUser, getOrCreateUser, withUser } from './utils/auth.js';

const editor: AuthUser = { uid: 'custom-provider-editor', name: 'Editor', uin: '00000123' };
const base_url = 'https://provider.example/v1/';
const secret_key = 'test-provider-secret-key';
const discover = vi.spyOn(discovery, 'discoverAiGradingModels');

async function client(courseInstanceId = '1', user?: AuthUser) {
  const dbUser = user ? await getOrCreateUser(user) : await getConfiguredUser();
  return createCourseInstanceTrpcClient({
    courseInstanceId,
    urlBase: `http://localhost:${config.serverPort}`,
    csrfToken: generatePrefixCsrfToken(
      {
        url: `/pl/course_instance/${courseInstanceId}/instructor/trpc`,
        authn_user_id: dbUser.id,
      },
      config.secretKey,
    ),
  });
}

describe('custom AI grading provider API', { concurrent: false }, () => {
  let credentialId: string;
  let authnUserId: string;
  const enterpriseBefore = config.isEnterprise;
  beforeAll(async () => {
    config.isEnterprise = true;
    await helperServer.before()();
    await features.enable('ai-grading');
    authnUserId = (await getConfiguredUser()).id;
    const user = await getOrCreateUser(editor);
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: user.uid,
      course_role: 'Previewer',
      authn_user_id: authnUserId,
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: user.id,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: authnUserId,
    });
  });
  beforeEach(() => {
    discover.mockReset();
    discover.mockResolvedValue(['model-a', 'model-b']);
  });
  afterAll(async () => {
    discover.mockRestore();
    await helperServer.after();
    config.isEnterprise = enterpriseBefore;
  });

  it('discovers before saving without persisting a credential', async () => {
    const api = await client();
    await expect(api.aiGradingProviders.discover.mutate({ base_url, secret_key })).resolves.toEqual(
      { models: ['model-a', 'model-b'] },
    );
    expect(await selectCredentials('1')).toEqual([]);
    expect(discover).toHaveBeenCalledWith({ baseUrl: base_url, apiKey: secret_key });
  });

  it('saves encrypted configuration with safe metadata and redacted audit', async () => {
    const api = await client();
    const result = await api.aiGradingProviders.save.mutate({
      base_url,
      secret_key,
      expected_credential_id: null,
    });
    credentialId = result.credential.id;
    expect(result.credential.base_url).toBe('https://provider.example/v1');
    expect(result.credential.apiKeyMasked).not.toContain(secret_key);
    expect(result.credential).not.toHaveProperty('encrypted_secret_key');
    const [stored] = await selectCredentials('1');
    expect(stored.encrypted_secret_key).not.toBe(secret_key);
    expect(decryptFromStorage(stored.encrypted_secret_key)).toBe(secret_key);
    const events = await selectAuditEvents({
      course_instance_id: '1',
      agent_authn_user_id: authnUserId,
      table_names: ['course_instance_ai_grading_credentials'],
    });
    expect(events).toHaveLength(1);
    expect(events[0].new_row).toMatchObject({
      encrypted_secret_key: '[REDACTED]',
      id: credentialId,
    });
  });

  it('lists only safe custom provider metadata for model selection', async () => {
    const api = await client();
    await expect(api.aiGradingProviders.list.query()).resolves.toEqual({
      credential: {
        id: credentialId,
        provider: 'openai-compatible',
        base_url: 'https://provider.example/v1',
      },
    });
    await withUser(editor, async () => {
      const editorApi = await client('1', editor);
      expect((await editorApi.aiGradingProviders.list.query()).credential?.id).toBe(credentialId);
    });
    const other = await client('2');
    await expect(other.aiGradingProviders.list.query()).resolves.toEqual({ credential: null });
  });

  it('loads models using only the saved server-side configuration', async () => {
    const api = await client();
    await expect(
      api.aiGradingProviders.models.query({ credential_id: credentialId }),
    ).resolves.toEqual({ models: ['model-a', 'model-b'] });
    expect(discover).toHaveBeenCalledWith({
      baseUrl: 'https://provider.example/v1',
      apiKey: secret_key,
      credentialIdentity: { courseInstanceId: '1', credentialId },
    });
  });

  it('keeps the old configuration when provider validation fails', async () => {
    discover.mockRejectedValue(
      new discovery.AiGradingModelDiscoveryError(
        'authentication',
        'The provider rejected the API key.',
      ),
    );
    const api = await client();
    await expect(
      api.aiGradingProviders.save.mutate({
        base_url,
        secret_key: 'bad-key',
        expected_credential_id: credentialId,
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    const [stored] = await selectCredentials('1');
    expect(stored.id).toBe(credentialId);
    expect(decryptFromStorage(stored.encrypted_secret_key)).toBe(secret_key);
  });

  it('rejects stale selections and creates a new identity on replacement', async () => {
    const api = await client();
    await expect(
      api.aiGradingProviders.save.mutate({ base_url, secret_key, expected_credential_id: null }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    const previousId = credentialId;
    const result = await api.aiGradingProviders.save.mutate({
      base_url,
      secret_key: 'replacement-secret',
      expected_credential_id: previousId,
    });
    credentialId = result.credential.id;
    expect(credentialId).not.toBe(previousId);
    expect(await selectCredentials('1')).toHaveLength(1);
    await expect(
      api.aiGradingProviders.save.mutate({
        base_url,
        secret_key,
        expected_credential_id: previousId,
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });

  it('does not load or delete another instance configuration', async () => {
    const api = await client('2');
    await expect(
      api.aiGradingProviders.models.query({ credential_id: credentialId }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    await expect(
      api.aiGradingProviders.destroy.mutate({ credential_id: credentialId }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    expect(discover).not.toHaveBeenCalled();
    expect(await selectCredentials('1')).toHaveLength(1);
  });

  it('allows grading editors to list models but reserves configuration changes for owners', async () => {
    await withUser(editor, async () => {
      const api = await client('1', editor);
      await expect(
        api.aiGradingProviders.models.query({ credential_id: credentialId }),
      ).resolves.toEqual({ models: ['model-a', 'model-b'] });
      await expect(
        api.aiGradingProviders.discover.mutate({ base_url, secret_key }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(
        api.aiGradingProviders.save.mutate({
          base_url,
          secret_key,
          expected_credential_id: credentialId,
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(
        api.aiGradingProviders.destroy.mutate({ credential_id: credentialId }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
  });

  it('deletes the saved configuration', async () => {
    const api = await client();
    await api.aiGradingProviders.destroy.mutate({ credential_id: credentialId });
    expect(await selectCredentials('1')).toEqual([]);
    await expect(
      api.aiGradingProviders.models.query({ credential_id: credentialId }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
  });

  it('rejects requests when the feature is unavailable', async () => {
    await features.disable('ai-grading');
    try {
      const api = await client();
      const error = await api.aiGradingProviders.discover
        .mutate({ base_url, secret_key })
        .catch((error) => getAppError<AiGradingProvidersError['Discover']>(error));
      expect(error).toMatchObject({
        code: 'UNKNOWN',
        message: 'Access denied (feature not available)',
      });
      expect(discover).not.toHaveBeenCalled();
    } finally {
      await features.enable('ai-grading');
    }
  });
});

import express from 'express';
import * as jose from 'jose';
import * as client from 'openid-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';
import * as postgres from '@prairielearn/postgres';

import { fetchRetry, getAccessToken, getOpenidClientConfig } from '../ee/lib/lti13.js';
import * as lti13Instance from '../ee/models/lti13Instance.js';
import { withConfig } from '../tests/utils/config.js';

import type { Lti13Instance } from './db-types.js';
import { ltiFetch } from './lti-fetch.js';
import { updateScore } from './ltiOutcomes.js';

afterEach(() => vi.restoreAllMocks());

describe('LTI outbound protection', () => {
  it('protects grade passback, token, JWKS, and AGS/NRPS requests in production', async () => {
    await withConfig({ devMode: false }, async () => {
      const fixtures = { url: 'https://127.0.0.1/endpoint', instance: {} };
      const { privateKey } = await jose.generateKeyPair('RS256', { extractable: true });
      fixtures.instance = {
        id: '1',
        issuer_params: {
          issuer: 'https://lms.example',
          jwks_uri: fixtures.url,
          token_endpoint: fixtures.url,
        },
        client_params: { client_id: 'test-client' },
        keystore: {
          keys: [{ ...(await jose.exportJWK(privateKey)), kid: 'test-key', alg: 'RS256' }],
        },
      };
      vi.spyOn(postgres, 'queryOptionalRow').mockResolvedValue({
        score_perc: 75,
        lis_result_sourcedid: 'result',
        date: new Date(),
        consumer_key: 'key',
        secret: 'secret',
        lis_outcome_service_url: fixtures.url,
      });
      vi.spyOn(lti13Instance, 'selectLti13Instance').mockResolvedValue(
        fixtures.instance as Lti13Instance,
      );
      const assertBlocked = async (request: () => Promise<unknown>) => {
        await expect(request()).rejects.toMatchObject({
          cause: expect.objectContaining({ message: 'Host did not resolve to a public address' }),
        });
      };

      await assertBlocked(() => updateScore('1'));
      await assertBlocked(() => getAccessToken('1'));
      await assertBlocked(() => fetchRetry(fixtures.url));

      const configuration = await getOpenidClientConfig(fixtures.instance as Lti13Instance);
      client.useIdTokenResponseType(configuration);
      const token = await new jose.SignJWT({ nonce: 'nonce' })
        .setProtectedHeader({ alg: 'RS256', kid: 'platform-key' })
        .setIssuer('https://lms.example')
        .setAudience('test-client')
        .setSubject('student')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);
      const callback = new URL('https://tool.example/callback');
      callback.hash = new URLSearchParams({ id_token: token }).toString();
      await assertBlocked(() => client.implicitAuthentication(configuration, callback, 'nonce'));
    });
  });

  it('allows local requests in development without additional configuration', async () => {
    const app = express();
    app.get('/', (_req, res) => res.send('local LMS'));
    await withServer(app, async ({ url }) => {
      await withConfig({ devMode: true }, async () => {
        const response = await ltiFetch(url);
        expect(await response.text()).toBe('local LMS');
      });
    });
  });
});

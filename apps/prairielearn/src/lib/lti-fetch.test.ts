import express from 'express';
import * as jose from 'jose';
import * as client from 'openid-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';
import { logger } from '@prairielearn/logger';
import * as postgres from '@prairielearn/postgres';
import * as publicFetchModule from '@prairielearn/public-fetch';

import { fetchRetry, getAccessToken, getOpenidClientConfig } from '../ee/lib/lti13.js';
import * as lti13Instance from '../ee/models/lti13Instance.js';
import { withConfig } from '../tests/utils/config.js';

import type { Lti13Instance } from './db-types.js';
import { ltiFetch } from './lti-fetch.js';
import { updateScore } from './ltiOutcomes.js';

afterEach(() => vi.restoreAllMocks());

describe('LTI outbound protection', () => {
  it.each(['127.0.0.1', '169.254.169.254'])(
    'protects grade passback, token, JWKS, and AGS/NRPS requests to %s by default',
    async (address) => {
      await withConfig({ devMode: true, ltiDevAllowedOrigins: [] }, async () => {
        const fixtures = { url: `https://${address}/endpoint`, instance: {} };
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
        const publicFetch = vi.spyOn(publicFetchModule, 'publicFetch');
        const warning = vi.spyOn(logger, 'warn');
        const assertBlocked = async (request: () => Promise<unknown>) => {
          publicFetch.mockClear();
          warning.mockClear();
          await expect(request()).rejects.toThrow();
          expect(publicFetch).toHaveBeenCalledTimes(1);
          expect(publicFetch.mock.calls[0][0]).toBe(fixtures.url);
          expect(warning).toHaveBeenCalledWith(expect.stringContaining('SSRF protection'));
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
    },
  );

  it('ignores the allowance outside development without repeating the configuration warning', async () => {
    await withConfig({ devMode: false, ltiDevAllowedOrigins: ['https://127.0.0.1'] }, async () => {
      const warning = vi.spyOn(logger, 'warn');
      await expect(ltiFetch('https://127.0.0.1')).rejects.toThrow();
      expect(warning).not.toHaveBeenCalledWith(
        'Ignoring ltiDevAllowedOrigins because devMode is disabled',
      );
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('SSRF protection'));
    });
  });

  it('allows only the exact development origin', async () => {
    const app = express();
    app.get('/', (_req, res) => res.send('local LMS'));
    await withServer(app, async ({ url }) => {
      await withConfig({ devMode: true, ltiDevAllowedOrigins: [new URL(url).origin] }, async () => {
        const response = await ltiFetch(url);
        expect(await response.text()).toBe('local LMS');
        await expect(ltiFetch('https://127.0.0.1')).rejects.toThrow();
      });
    });
  });

  it.each([302, 307])('does not follow a development redirect with status %s', async (status) => {
    const app = express();
    app.use(express.text());
    app.post('/redirect', (_req, res) => res.redirect(status, '/result'));
    let redirectedRequests = 0;
    app.all('/result', (_req, res) => {
      redirectedRequests++;
      res.send('redirect target');
    });
    await withServer(app, async ({ url }) => {
      await withConfig({ devMode: true, ltiDevAllowedOrigins: [new URL(url).origin] }, async () => {
        const response = await ltiFetch(`${url}/redirect`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'grade',
        });
        expect(response.status).toBe(status);
        expect(response.headers.get('location')).toBe('/result');
        await response.body?.cancel();
        expect(redirectedRequests).toBe(0);
      });
    });
  });

  it('does not label ordinary network failures as address blocks', async () => {
    vi.spyOn(publicFetchModule, 'publicFetch').mockRejectedValue(
      new TypeError('fetch failed', {
        cause: new Error('ECONNRESET'),
      }),
    );
    const warning = vi.spyOn(logger, 'warn');
    await expect(ltiFetch('https://lms.example')).rejects.toThrow('fetch failed');
    expect(warning).not.toHaveBeenCalled();
  });

  it('preserves caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Caller cancelled'));
    await expect(ltiFetch('https://lms.example', { signal: controller.signal })).rejects.toThrow(
      'Caller cancelled',
    );
  });
});

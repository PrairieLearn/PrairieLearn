import express from 'express';
import * as jose from 'jose';
import * as client from 'openid-client';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';

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
      await withConfig({ devMode: false }, async () => {
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

  it.each([302, 307])('follows development redirects with status %s', async (status) => {
    const app = express();
    app.use(express.text());
    app.post('/redirect', (_req, res) => res.redirect(status, '/result'));
    let redirectedRequests = 0;
    app.all('/result', (_req, res) => {
      redirectedRequests++;
      res.send('redirect target');
    });
    await withServer(app, async ({ url }) => {
      await withConfig({ devMode: true }, async () => {
        const response = await ltiFetch(`${url}/redirect`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'grade',
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('redirect target');
        expect(redirectedRequests).toBe(1);
      });
    });
  });

  it('does not label ordinary network failures as address blocks', async () => {
    await withConfig({ devMode: false }, async () => {
      vi.spyOn(publicFetchModule, 'publicFetch').mockRejectedValue(
        new TypeError('fetch failed', {
          cause: new Error('ECONNRESET'),
        }),
      );
      const warning = vi.spyOn(logger, 'warn');
      await expect(ltiFetch('https://lms.example')).rejects.toThrow('fetch failed');
      expect(warning).not.toHaveBeenCalled();
    });
  });

  it('preserves caller cancellation', async () => {
    await withConfig({ devMode: false }, async () => {
      const controller = new AbortController();
      controller.abort(new Error('Caller cancelled'));
      await expect(ltiFetch('https://lms.example', { signal: controller.signal })).rejects.toThrow(
        'Caller cancelled',
      );
    });
  });

  it('adapts Request inputs to Undici with overrides and cancellation intact', async () => {
    await withConfig({ devMode: false }, async () => {
      const controller = new AbortController();
      const originalPublicFetch = publicFetchModule.publicFetch;
      const publicFetch = vi
        .spyOn(publicFetchModule, 'publicFetch')
        .mockImplementation(async (input, init) => {
          assert(init instanceof Request);
          const request = init;
          expect(request.method).toBe('PUT');
          expect(request.headers.get('content-type')).toBe('text/plain');
          expect(request.headers.get('x-lti-test')).toBe('override');
          expect(await request.clone().text()).toBe('grade');
          expect(request.redirect).toBe('error');
          controller.abort(new Error('Caller cancelled'));
          expect(request.signal.aborted).toBe(true);
          expect(request.signal.reason).toBe(controller.signal.reason);
          return originalPublicFetch(input, init);
        });
      const request = new Request('https://lms.example/grades', {
        method: 'POST',
        body: 'grade',
        headers: { 'x-lti-test': 'original' },
        signal: controller.signal,
        redirect: 'error',
      });
      await expect(
        ltiFetch(request, {
          method: 'PUT',
          headers: { 'content-type': 'text/plain', 'x-lti-test': 'override' },
        }),
      ).rejects.toThrow('Caller cancelled');
      expect(publicFetch).toHaveBeenCalledTimes(1);
      expect(publicFetch.mock.calls[0][0]).toBe(request.url);
    });
  });
});

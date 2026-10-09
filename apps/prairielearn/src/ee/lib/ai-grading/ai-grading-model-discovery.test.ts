import type * as http from 'node:http';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

import * as pem from 'pem';
import { beforeAll, describe, expect, it } from 'vitest';

import { Cache } from '@prairielearn/cache';
import { createPublicFetch } from '@prairielearn/public-fetch';

import {
  discoverAiGradingModels,
  normalizeAiGradingBaseUrl,
} from './ai-grading-model-discovery.js';

let certificate: pem.CertificateCreationResult;
beforeAll(async () => {
  certificate = await new Promise((resolve, reject) => {
    pem.createCertificate(
      {
        selfSigned: true,
        commonName: 'public.example',
        altNames: ['public.example', 'other.example'],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
});

async function withServer(
  handler: http.RequestListener,
  run: (baseUrl: string, options: Parameters<typeof discoverAiGradingModels>[1]) => Promise<void>,
) {
  const server = https.createServer(
    { cert: certificate.certificate, key: certificate.serviceKey },
    handler,
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const fetch = createPublicFetch({
    ca: certificate.certificate,
    resolveAddress: async () => '127.0.0.1',
  });
  try {
    await run(`https://public.example:${port}/v1`, { fetch });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe('AI grading model discovery', () => {
  it('normalizes the API path without adding v1', () => {
    expect(normalizeAiGradingBaseUrl(' https://provider.example/api/// ')).toBe(
      'https://provider.example/api',
    );
  });

  it.each([
    'http://provider.example',
    'not a URL',
    'https://user:password@provider.example',
    'https://provider.example?key=secret',
    'https://provider.example/#fragment',
  ])('rejects invalid endpoint %s', (baseUrl) => {
    expect(() => normalizeAiGradingBaseUrl(baseUrl)).toThrow();
  });

  it('requests models with authorization and returns sorted unique IDs', async () => {
    await withServer(
      (request, response) => {
        expect(request.url).toBe('/v1/models');
        expect(request.headers.authorization).toBe('Bearer test-key');
        response.end(
          JSON.stringify({ data: [{ id: 'z', owned_by: 'university' }, { id: 'a' }, { id: 'z' }] }),
        );
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).resolves.toEqual(['a', 'z']);
      },
    );
  });

  it.each([false, true])(
    'follows redirects and scopes authorization (cross origin: %s)',
    async (crossOrigin) => {
      const authorization: (string | undefined)[] = [];
      await withServer(
        (request, response) => {
          authorization.push(request.headers.authorization);
          if (request.url === '/v1/models') {
            const destination = crossOrigin
              ? `https://other.example:${response.socket?.localPort}/catalog`
              : '/catalog';
            response.writeHead(302, { Location: destination });
            response.end();
          } else {
            response.end('{"data":[]}');
          }
        },
        async (baseUrl, options) => {
          await expect(
            discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
          ).resolves.toEqual([]);
          expect(authorization).toEqual([
            'Bearer test-key',
            crossOrigin ? undefined : 'Bearer test-key',
          ]);
        },
      );
    },
  );

  it('rejects redirects to insecure HTTP', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(302, { Location: 'http://public.example/catalog' });
        response.end();
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).rejects.toMatchObject({ code: 'request_failed' });
      },
    );
  });

  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'not_found'],
    [429, 'rate_limit'],
    [500, 'provider_error'],
  ])('classifies HTTP %s without exposing the response', async (status, code) => {
    await withServer(
      (_request, response) => {
        response.writeHead(Number(status));
        response.end('secret provider diagnostics');
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).rejects.toMatchObject({ code });
      },
    );
  });

  it.each([
    'not json',
    '{}',
    '{"data":[{"id":""}]}',
    '{"data":[{"id":"   "}]}',
    JSON.stringify({ data: [{ id: 'x'.repeat(257) }] }),
    JSON.stringify({ data: Array.from({ length: 1001 }, () => ({ id: 'model' })) }),
  ])('rejects an invalid catalog %#', async (body) => {
    await withServer(
      (_request, response) => response.end(body),
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).rejects.toMatchObject({ code: 'invalid_response' });
      },
    );
  });

  it('bounds streamed responses without Content-Length', async () => {
    await withServer(
      (_request, response) => {
        response.write(' '.repeat(1024 * 1024));
        response.end('extra');
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).rejects.toMatchObject({ code: 'response_too_large' });
      },
    );
  });

  it('bounds decompressed responses', async () => {
    await withServer(
      (_request, response) => {
        const body = gzipSync(' '.repeat(1024 * 1024 + 1));
        response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': body.byteLength });
        response.end(body);
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).rejects.toMatchObject({ code: 'response_too_large' });
      },
    );
  });

  it('rejects an oversized Content-Length before reading the body', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Length': 1024 * 1024 + 1 });
        response.flushHeaders();
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, options),
        ).rejects.toMatchObject({ code: 'response_too_large' });
      },
    );
  });

  it('does not cache failures or include provider diagnostics in errors', async () => {
    const modelCache = new Cache();
    await modelCache.init({ type: 'memory', keyPrefix: 'test:' });
    let requests = 0;
    try {
      await withServer(
        (_request, response) => {
          requests++;
          if (requests === 1) {
            response.writeHead(401);
            response.end('secret provider diagnostics');
          } else {
            response.end('{"data":[]}');
          }
        },
        async (baseUrl, options) => {
          const input = {
            baseUrl,
            apiKey: 'test-key',
            credentialIdentity: { courseInstanceId: '1', credentialId: '2' },
          };
          const cachedOptions = { ...options, modelCache };
          await expect(discoverAiGradingModels(input, cachedOptions)).rejects.toMatchObject({
            code: 'authentication',
            message: 'The provider rejected the API key. Check the key and try again.',
          });
          await expect(discoverAiGradingModels(input, cachedOptions)).resolves.toEqual([]);
          expect(requests).toBe(2);
        },
      );
    } finally {
      await modelCache.close();
    }
  });

  it('times out while reading the body after headers arrive', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200);
        response.flushHeaders();
        response.write('{"data":');
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key' }, { ...options, timeoutMs: 100 }),
        ).rejects.toMatchObject({ code: 'timeout' });
      },
    );
  });

  it('caches saved configurations separately and never caches unsaved keys', async () => {
    const modelCache = new Cache();
    await modelCache.init({ type: 'memory', keyPrefix: 'test:' });
    let requests = 0;
    try {
      await withServer(
        (_request, response) => {
          requests++;
          response.end('{"data":[]}');
        },
        async (baseUrl, options) => {
          const input = {
            baseUrl,
            apiKey: 'test-key',
            credentialIdentity: { courseInstanceId: '1', credentialId: '2' },
          };
          const cachedOptions = { ...options, modelCache };
          await discoverAiGradingModels(input, cachedOptions);
          await discoverAiGradingModels(input, cachedOptions);
          expect(requests).toBe(1);
          await discoverAiGradingModels(
            { ...input, credentialIdentity: { courseInstanceId: '1', credentialId: '3' } },
            cachedOptions,
          );
          await discoverAiGradingModels(
            { ...input, credentialIdentity: { courseInstanceId: '4', credentialId: '2' } },
            cachedOptions,
          );
          expect(requests).toBe(3);
          await discoverAiGradingModels({ baseUrl, apiKey: 'unsaved-key' }, cachedOptions);
          await discoverAiGradingModels({ baseUrl, apiKey: 'unsaved-key' }, cachedOptions);
          expect(requests).toBe(5);
          await modelCache.del('ai-grading-models:1:2');
          await discoverAiGradingModels(input, cachedOptions);
          expect(requests).toBe(6);
        },
      );
    } finally {
      await modelCache.close();
    }
  });

  it('sets a short Redis TTL and refreshes an expired catalog', async () => {
    const modelCache = new Cache();
    const keyPrefix = `test-ai-grading-discovery:${crypto.randomUUID()}:`;
    await modelCache.init({ type: 'redis', keyPrefix, redisUrl: 'redis://localhost:6379/' });
    let requests = 0;
    try {
      await withServer(
        (_request, response) => {
          requests++;
          response.end(JSON.stringify({ data: [{ id: `model-${requests}` }] }));
        },
        async (baseUrl, options) => {
          const input = {
            baseUrl,
            apiKey: 'test-key',
            credentialIdentity: { courseInstanceId: '1', credentialId: '2' },
          };
          const cachedOptions = { ...options, modelCache };
          await expect(discoverAiGradingModels(input, cachedOptions)).resolves.toEqual(['model-1']);
          const ttl = await modelCache.redisClient!.pttl(`${keyPrefix}ai-grading-models:1:2`);
          expect(ttl).toBeGreaterThan(290_000);
          expect(ttl).toBeLessThanOrEqual(300_000);
          await expect(discoverAiGradingModels(input, cachedOptions)).resolves.toEqual(['model-1']);
          await modelCache.redisClient!.pexpire(`${keyPrefix}ai-grading-models:1:2`, 0);
          await expect(discoverAiGradingModels(input, cachedOptions)).resolves.toEqual(['model-2']);
        },
      );
    } finally {
      await modelCache.reset();
      await modelCache.close();
    }
  });
});

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
        altNames: ['public.example'],
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
    'not a URL',
    'https://provider.example?key=secret',
    'https://provider.example/#fragment',
  ])('rejects invalid endpoint %s', (baseUrl) => {
    expect(() => normalizeAiGradingBaseUrl(baseUrl)).toThrow(
      expect.objectContaining({ code: 'invalid_endpoint' }),
    );
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
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key', courseInstanceId: '1' }, options),
        ).resolves.toEqual(['a', 'z']);
      },
    );
  });

  it.each([
    [400, 'request_rejected', 400],
    [401, 'authentication', 400],
    [403, 'access_denied', 400],
    [404, 'not_found', 400],
    [422, 'request_rejected', 400],
    [429, 'rate_limit', 429],
    [500, 'provider_error', 502],
  ])('classifies HTTP %s without exposing the response', async (status, code, httpStatus) => {
    await withServer(
      (_request, response) => {
        response.writeHead(Number(status));
        response.end('secret provider diagnostics');
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key', courseInstanceId: '1' }, options),
        ).rejects.toMatchObject({
          code,
          status: httpStatus,
          message: expect.not.stringContaining('secret provider diagnostics'),
        });
      },
    );
  });

  it.each(['not json', '{}', '{"data":[{"id":""}]}', '{"data":[{"id":"   "}]}'])(
    'rejects an invalid catalog %#',
    async (body) => {
      await withServer(
        (_request, response) => response.end(body),
        async (baseUrl, options) => {
          await expect(
            discoverAiGradingModels(
              { baseUrl, apiKey: 'test-key', courseInstanceId: '1' },
              options,
            ),
          ).rejects.toMatchObject({ code: 'invalid_response' });
        },
      );
    },
  );

  it('rejects large HTML pages before applying the response size limit', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<html>' + 'x'.repeat(1024 * 1024));
      },
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key', courseInstanceId: '1' }, options),
        ).rejects.toMatchObject({
          code: 'invalid_response',
          message: expect.stringContaining('web page'),
        });
      },
    );
  });

  it.each([
    [JSON.stringify({ data: [{ id: 'x'.repeat(257) }] }), 'catalog_limit'],
    [
      JSON.stringify({ data: Array.from({ length: 1001 }, () => ({ id: 'model' })) }),
      'catalog_limit',
    ],
  ])('distinguishes supported limits from invalid catalogs %#', async (body, code) => {
    await withServer(
      (_request, response) => response.end(body),
      async (baseUrl, options) => {
        await expect(
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key', courseInstanceId: '1' }, options),
        ).rejects.toMatchObject({ code });
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
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key', courseInstanceId: '1' }, options),
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
          discoverAiGradingModels({ baseUrl, apiKey: 'test-key', courseInstanceId: '1' }, options),
        ).rejects.toMatchObject({ code: 'response_too_large' });
      },
    );
  });

  it('does not cache failed discovery requests', async () => {
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
            courseInstanceId: '1',
          };
          const cachedOptions = { ...options, modelCache };
          await expect(discoverAiGradingModels(input, cachedOptions)).rejects.toMatchObject({
            code: 'authentication',
          });
          await expect(discoverAiGradingModels(input, cachedOptions)).resolves.toEqual([]);
          expect(requests).toBe(2);
        },
      );
    } finally {
      await modelCache.close();
    }
  });

  it('caches configurations by course instance, normalized URL, and API key', async () => {
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
            courseInstanceId: '1',
          };
          const cachedOptions = { ...options, modelCache };
          await discoverAiGradingModels(input, cachedOptions);
          await discoverAiGradingModels(input, cachedOptions);
          expect(requests).toBe(1);
          await discoverAiGradingModels({ ...input, apiKey: 'other-key' }, cachedOptions);
          await discoverAiGradingModels({ ...input, courseInstanceId: '4' }, cachedOptions);
          expect(requests).toBe(3);
          await discoverAiGradingModels({ ...input, baseUrl: `${baseUrl}/other` }, cachedOptions);
          expect(requests).toBe(4);
          await discoverAiGradingModels({ ...input, baseUrl: `${baseUrl}///` }, cachedOptions);
          expect(requests).toBe(4);
        },
      );
    } finally {
      await modelCache.close();
    }
  });
});

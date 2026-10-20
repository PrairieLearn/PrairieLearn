import type * as http from 'node:http';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Output, generateText } from 'ai';
import * as pem from 'pem';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { type PublicFetch, createPublicFetch } from '@prairielearn/public-fetch';

import { createAiGradingFetch } from './ai-grading-fetch.js';

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
  run: (baseUrl: string, fetch: typeof globalThis.fetch) => Promise<void>,
  timeoutMs = 120_000,
) {
  const server = https.createServer(
    { cert: certificate.certificate, key: certificate.serviceKey },
    handler,
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const publicFetch: PublicFetch = createPublicFetch({
    ca: certificate.certificate,
    resolveAddress: async () => '127.0.0.1',
  });
  try {
    await run(
      `https://public.example:${port}/v1`,
      createAiGradingFetch({ fetch: publicFetch, timeoutMs }),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe('bounded custom AI grading requests', () => {
  it('lets the compatible SDK consume a bounded structured grading response', async () => {
    await withServer(
      (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            id: 'completion',
            object: 'chat.completion',
            created: 0,
            model: 'campus-text',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"grade":1}' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      },
      async (baseUrl, fetch) => {
        const provider = createOpenAICompatible({
          name: 'custom',
          baseURL: baseUrl,
          apiKey: 'test-key',
          supportsStructuredOutputs: true,
          fetch,
        });
        const result = await generateText({
          model: provider('campus-text'),
          prompt: 'Grade this',
          output: Output.object({ schema: z.object({ grade: z.number() }) }),
          maxRetries: 0,
        });
        expect(result.output).toEqual({ grade: 1 });
      },
    );
  });

  it('preserves status, headers and the response body', async () => {
    await withServer(
      (request, response) => {
        expect(request.headers.authorization).toBe('Bearer test-key');
        response.writeHead(400, { 'Content-Type': 'application/json', 'X-Request-Id': 'test-id' });
        response.end('{"error":"unsupported attachment"}');
      },
      async (baseUrl, fetch) => {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: 'Bearer test-key' },
          body: '{}',
        });
        expect(response.status).toBe(400);
        expect(response.headers.get('x-request-id')).toBe('test-id');
        expect(await response.json()).toEqual({ error: 'unsupported attachment' });
      },
    );
  });

  it('rejects an oversized Content-Length before reading the body', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Length': 1024 * 1024 + 1 });
        response.flushHeaders();
      },
      async (baseUrl, fetch) => {
        await expect(fetch(baseUrl)).rejects.toThrow('too large');
      },
    );
  });

  it.each([200, 400])('bounds streamed bodies with status %s', async (status) => {
    await withServer(
      (_request, response) => {
        response.writeHead(status);
        response.write(' '.repeat(1024 * 1024));
        response.end('extra');
      },
      async (baseUrl, fetch) => {
        await expect(fetch(baseUrl)).rejects.toThrow('too large');
      },
    );
  });

  it.each([200, 400])('bounds decompressed bodies with status %s', async (status) => {
    await withServer(
      (_request, response) => {
        response.writeHead(status, { 'Content-Encoding': 'gzip' });
        response.end(gzipSync(' '.repeat(1024 * 1024 + 1)));
      },
      async (baseUrl, fetch) => {
        await expect(fetch(baseUrl)).rejects.toThrow('too large');
      },
    );
  });

  it('returns a decompressed response without stale encoding headers', async () => {
    await withServer(
      (_request, response) => {
        const body = gzipSync('{"grade":1}');
        response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': body.byteLength });
        response.end(body);
      },
      async (baseUrl, fetch) => {
        const response = await fetch(baseUrl);
        expect(response.headers.has('content-encoding')).toBe(false);
        expect(response.headers.has('content-length')).toBe(false);
        expect(await response.json()).toEqual({ grade: 1 });
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
          if (request.url === '/v1') {
            const destination = crossOrigin
              ? `https://other.example:${response.socket?.localPort}/completion`
              : '/completion';
            response.writeHead(307, { Location: destination });
            response.end();
          } else {
            response.end('{"grade":1}');
          }
        },
        async (baseUrl, fetch) => {
          expect(
            await (await fetch(baseUrl, { headers: { Authorization: 'Bearer test-key' } })).json(),
          ).toEqual({ grade: 1 });
          expect(authorization).toEqual([
            'Bearer test-key',
            crossOrigin ? undefined : 'Bearer test-key',
          ]);
        },
      );
    },
  );

  it.each([false, true])(
    'times out before completing the response (headers sent: %s)',
    async (headersSent) => {
      let received = false;
      await withServer(
        (_request, response) => {
          received = true;
          if (headersSent) {
            response.writeHead(200);
            response.flushHeaders();
            response.write('{');
          }
        },
        async (baseUrl, fetch) => {
          await expect(fetch(baseUrl)).rejects.toThrow(
            'did not finish the grading request in time',
          );
          expect(received).toBe(true);
        },
        100,
      );
    },
  );

  it('preserves caller cancellation while reading the body', async () => {
    let received = false;
    await withServer(
      (_request, response) => {
        received = true;
        response.writeHead(200);
        response.flushHeaders();
        response.write('{');
      },
      async (baseUrl, fetch) => {
        const signal = AbortSignal.timeout(100);
        await expect(fetch(baseUrl, { signal })).rejects.toThrow();
        expect(received).toBe(true);
      },
    );
  });
});

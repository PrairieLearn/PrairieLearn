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
        altNames: ['public.example'],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
});

async function withServer(
  handler: http.RequestListener,
  run: (baseUrl: string, fetch: typeof globalThis.fetch) => Promise<void>,
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
    await run(`https://public.example:${port}/v1`, createAiGradingFetch({ fetch: publicFetch }));
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

  it('reports an oversized grading response', async () => {
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
});

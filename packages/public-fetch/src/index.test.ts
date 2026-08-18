import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  createPublicFetch,
  isPublicIpAddress,
  publicFetch,
  resolvePublicAddress,
} from './index.js';

async function withHttpServer(
  handler: http.RequestListener,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function readRequest(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
}

describe('isPublicIpAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.100.100.200',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.0.1',
    '224.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '64:ff9b::7f00:1',
    '2001:db8::1',
    '2002:7f00:1::',
    'fc00::1',
    'fe80::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );
});

describe('resolvePublicAddress', () => {
  it('rejects a hostname if any resolved address is not public', async () => {
    await expect(
      resolvePublicAddress('example.com', {
        lookupAddresses: async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }],
      }),
    ).rejects.toThrow('public address');
  });

  it('returns the first address when every resolved address is public', async () => {
    await expect(
      resolvePublicAddress('example.com', {
        lookupAddresses: async () => [{ address: '8.8.8.8' }, { address: '1.1.1.1' }],
      }),
    ).resolves.toBe('8.8.8.8');
  });
});

describe('publicFetch', () => {
  it('pins connections to the resolved address and follows redirects', async () => {
    const requests: { url: string; headers: http.IncomingHttpHeaders }[] = [];
    await withHttpServer(
      (request, response) => {
        requests.push({ url: request.url ?? '', headers: request.headers });
        if (request.url === '/redirect') {
          response.writeHead(302, { Location: '/resource' });
          response.end();
          return;
        }
        response.end('contents');
      },
      async (port) => {
        const resolvedHostnames: string[] = [];
        const fetch = createPublicFetch({
          resolveAddress: async (hostname) => {
            resolvedHostnames.push(hostname);
            return '127.0.0.1';
          },
        });
        const response = await fetch(`http://public.example:${port}/redirect`, {
          headers: { Host: 'internal.example', 'User-Agent': 'PrairieLearn-Test/1.0' },
        });

        await expect(response.text()).resolves.toBe('contents');
        expect(resolvedHostnames).toEqual(['public.example', 'public.example']);
        expect(requests.map((request) => request.url)).toEqual(['/redirect', '/resource']);
        expect(requests[0].headers.host).toBe(`public.example:${port}`);
        expect(requests[0].headers['user-agent']).toBe('PrairieLearn-Test/1.0');
      },
    );
  });

  it('supports Fetch request methods, bodies, and responses', async () => {
    await withHttpServer(
      async (request, response) => {
        const body = await readRequest(request);
        response.writeHead(201, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ method: request.method, body }));
      },
      async (port) => {
        const fetch = createPublicFetch({ resolveAddress: async () => '127.0.0.1' });
        const response = await fetch(`http://public.example:${port}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'grade' }),
        });

        expect(response.status).toBe(201);
        expect(response.headers.get('content-type')).toBe('application/json');
        await expect(response.json()).resolves.toEqual({
          method: 'POST',
          body: '{"event":"grade"}',
        });
      },
    );
  });

  it.each(['127.0.0.1', '2130706433', '0x7f000001', '[::ffff:127.0.0.1]'])(
    'rejects loopback destination %s before making a request',
    async (hostname) => {
      let requestCount = 0;
      await withHttpServer(
        (_request, response) => {
          requestCount += 1;
          response.end('contents');
        },
        async (port) => {
          await expect(publicFetch(`http://${hostname}:${port}/resource`)).rejects.toThrow();
        },
      );
      expect(requestCount).toBe(0);
    },
  );

  it('rejects credentials before resolving the host', async () => {
    let didResolve = false;
    const fetch = createPublicFetch({
      resolveAddress: async () => {
        didResolve = true;
        return '127.0.0.1';
      },
    });

    await expect(fetch('https://user:password@public.example/resource')).rejects.toThrow(
      'credentials',
    );
    expect(didResolve).toBe(false);
  });

  it('rejects non-HTTP protocols before resolving the host', async () => {
    let didResolve = false;
    const fetch = createPublicFetch({
      resolveAddress: async () => {
        didResolve = true;
        return '127.0.0.1';
      },
    });

    await expect(fetch('data:text/plain,contents')).rejects.toThrow('HTTP or HTTPS');
    expect(didResolve).toBe(false);
  });

  it('rejects a redirect to a non-public address before connecting', async () => {
    let internalRequestCount = 0;
    await withHttpServer(
      (_request, response) => {
        internalRequestCount += 1;
        response.end('internal');
      },
      async (internalPort) => {
        await withHttpServer(
          (_request, response) => {
            response.writeHead(302, {
              Location: `http://127.0.0.1:${internalPort}/internal`,
            });
            response.end();
          },
          async (redirectPort) => {
            const fetch = createPublicFetch({
              resolveAddress: async (hostname) => {
                if (hostname === 'public.example') return '127.0.0.1';
                return resolvePublicAddress(hostname);
              },
            });

            await expect(fetch(`http://public.example:${redirectPort}/redirect`)).rejects.toThrow();
          },
        );
      },
    );
    expect(internalRequestCount).toBe(0);
  });

  it('uses the Fetch redirect limit', async () => {
    let requestCount = 0;
    await withHttpServer(
      (_request, response) => {
        requestCount += 1;
        response.writeHead(302, { Location: '/redirect' });
        response.end();
      },
      async (port) => {
        const fetch = createPublicFetch({ resolveAddress: async () => '127.0.0.1' });
        await expect(fetch(`http://public.example:${port}/redirect`)).rejects.toThrow();
      },
    );
    expect(requestCount).toBe(21);
  });

  it('can be aborted while resolving the host', async () => {
    const fetch = createPublicFetch({ resolveAddress: async () => new Promise(() => {}) });

    await expect(
      fetch('https://public.example/resource', { signal: AbortSignal.timeout(10) }),
    ).rejects.toThrow();
  });

  it('applies an abort signal while streaming the response body', async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200);
        response.write('partial');
      },
      async (port) => {
        const fetch = createPublicFetch({ resolveAddress: async () => '127.0.0.1' });
        const response = await fetch(`http://public.example:${port}/resource`, {
          signal: AbortSignal.timeout(10),
        });

        await expect(response.text()).rejects.toThrow();
      },
    );
  });

  it('does not forward sensitive headers across origins', async () => {
    const requestHeaders: http.IncomingHttpHeaders[] = [];
    await withHttpServer(
      (request, finalResponse) => {
        requestHeaders.push(request.headers);
        finalResponse.end('contents');
      },
      async (finalPort) => {
        await withHttpServer(
          (request, redirectResponse) => {
            requestHeaders.push(request.headers);
            redirectResponse.writeHead(302, {
              Location: `http://other.example:${finalPort}/resource`,
            });
            redirectResponse.end();
          },
          async (redirectPort) => {
            const fetch = createPublicFetch({ resolveAddress: async () => '127.0.0.1' });
            const response = await fetch(`http://public.example:${redirectPort}/redirect`, {
              headers: {
                Authorization: 'Bearer token',
                Cookie: 'session=secret',
                'X-Request-Id': 'request-id',
              },
            });
            await response.text();
          },
        );
      },
    );

    expect(requestHeaders[0].authorization).toBe('Bearer token');
    expect(requestHeaders[0].cookie).toBe('session=secret');
    expect(requestHeaders[1].authorization).toBeUndefined();
    expect(requestHeaders[1].cookie).toBeUndefined();
    expect(requestHeaders[1]['x-request-id']).toBe('request-id');
  });
});

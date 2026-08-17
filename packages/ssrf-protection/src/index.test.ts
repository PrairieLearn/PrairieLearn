import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { isPublicIpAddress, requestFromPublicUrl, resolvePublicAddress } from './index.js';

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

async function readResponse(response: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) {
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

describe('requestFromPublicUrl', () => {
  it('pins each request and redirect to the resolved address', async () => {
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
        const response = await requestFromPublicUrl(
          new URL(`http://public.example:${port}/redirect`),
          {
            headers: { Host: 'internal.example', 'User-Agent': 'PrairieLearn-Test/1.0' },
            maxRedirects: 1,
            resolveAddress: async (hostname) => {
              resolvedHostnames.push(hostname);
              return '127.0.0.1';
            },
          },
        );

        await expect(readResponse(response)).resolves.toBe('contents');
        expect(resolvedHostnames).toEqual(['public.example', 'public.example']);
        expect(requests.map((request) => request.url)).toEqual(['/redirect', '/resource']);
        expect(requests[0].headers.host).toBe(`public.example:${port}`);
        expect(requests[0].headers['user-agent']).toBe('PrairieLearn-Test/1.0');
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
          await expect(
            requestFromPublicUrl(new URL(`http://${hostname}:${port}/resource`)),
          ).rejects.toThrow('public address');
        },
      );
      expect(requestCount).toBe(0);
    },
  );

  it('rejects credentials before resolving the host', async () => {
    let didResolve = false;

    await expect(
      requestFromPublicUrl(new URL('https://user:password@public.example/resource'), {
        resolveAddress: async () => {
          didResolve = true;
          return '127.0.0.1';
        },
      }),
    ).rejects.toThrow('credentials');
    expect(didResolve).toBe(false);
  });

  it('rejects non-HTTP protocols before resolving the host', async () => {
    let didResolve = false;

    await expect(
      requestFromPublicUrl(new URL('file:///etc/passwd'), {
        resolveAddress: async () => {
          didResolve = true;
          return '127.0.0.1';
        },
      }),
    ).rejects.toThrow('HTTP or HTTPS');
    expect(didResolve).toBe(false);
  });

  it('limits redirects', async () => {
    let requestCount = 0;
    await withHttpServer(
      (_request, response) => {
        requestCount += 1;
        response.writeHead(302, { Location: '/redirect' });
        response.end();
      },
      async (port) => {
        await expect(
          requestFromPublicUrl(new URL(`http://public.example:${port}/redirect`), {
            maxRedirects: 3,
            resolveAddress: async () => '127.0.0.1',
          }),
        ).rejects.toThrow('redirect limit');
      },
    );
    expect(requestCount).toBe(4);
  });

  it('times out while resolving the host', async () => {
    await expect(
      requestFromPublicUrl(new URL('https://public.example/resource'), {
        timeoutMs: 10,
        resolveAddress: async () => new Promise(() => {}),
      }),
    ).rejects.toThrow('timed out');
  });

  it('applies the timeout while streaming the response body', async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200);
        response.write('partial');
      },
      async (port) => {
        const response = await requestFromPublicUrl(
          new URL(`http://public.example:${port}/resource`),
          {
            timeoutMs: 10,
            resolveAddress: async () => '127.0.0.1',
          },
        );

        await expect(readResponse(response)).rejects.toThrow();
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
            const response = await requestFromPublicUrl(
              new URL(`http://public.example:${redirectPort}/redirect`),
              {
                headers: {
                  Authorization: 'Bearer token',
                  Cookie: 'session=secret',
                  'X-Request-Id': 'request-id',
                },
                maxRedirects: 1,
                resolveAddress: async () => '127.0.0.1',
              },
            );
            await readResponse(response);
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

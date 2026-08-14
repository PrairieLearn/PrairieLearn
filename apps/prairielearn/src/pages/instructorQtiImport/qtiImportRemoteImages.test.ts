import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  QtiImportRemoteImageLocalizer,
  fetchRemoteImage,
  isPublicIpAddress,
} from './qtiImportRemoteImages.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

describe('QtiImportRemoteImageLocalizer', () => {
  it('stores remote images and rewrites all references to local pl-figure elements', async () => {
    const requestedUrls: string[] = [];
    const localizer = new QtiImportRemoteImageLocalizer(async (url) => {
      requestedUrls.push(url.href);
      return { content: Buffer.from('image contents'), extension: 'png' };
    });

    const result = await localizer.localizeQuestionHtml(
      [
        '<p><img src="https://canvas.example/files/1/preview?verifier=secret" alt="Graph" width="200"></p>',
        '<img src="https://canvas.example/files/1/preview?verifier=secret">',
      ].join(''),
      new Set(),
    );

    expect(requestedUrls).toEqual(['https://canvas.example/files/1/preview?verifier=secret']);
    expect(result.localizedImageCount).toBe(1);
    expect(result.failedImageCount).toBe(0);
    expect(result.files).toHaveLength(1);
    expect(result.html).not.toContain('canvas.example');
    expect(result.html).not.toContain('verifier');
    expect(result.html.match(/<pl-figure/g)).toHaveLength(2);
    expect(result.html).toContain('directory="clientFilesQuestion"');
    expect(result.html).toContain('alt="Graph"');
    expect(result.html).toContain('width="200"');
  });

  it('normalizes protocol-relative image URLs and ignores fragments when deduplicating', async () => {
    const requestedUrls: string[] = [];
    const localizer = new QtiImportRemoteImageLocalizer(async (url) => {
      requestedUrls.push(url.href);
      return { content: Buffer.from('image contents'), extension: 'jpg' };
    });

    const result = await localizer.localizeQuestionHtml(
      [
        '<img src=" //canvas.example/files/1/preview#first">',
        '<img src="//canvas.example/files/1/preview#second">',
      ].join(''),
      new Set(),
    );

    expect(requestedUrls).toEqual(['https://canvas.example/files/1/preview']);
    expect(result.localizedImageCount).toBe(1);
    expect(result.html.match(/<pl-figure/g)).toHaveLength(2);
  });

  it('leaves a remote reference unchanged when it cannot be fetched', async () => {
    const localizer = new QtiImportRemoteImageLocalizer(async () => {
      throw new Error('unavailable');
    });
    const html = '<img src="https://canvas.example/files/1/preview?verifier=secret">';

    const result = await localizer.localizeQuestionHtml(html, new Set());

    expect(result.html).toBe(html);
    expect(result.files).toHaveLength(0);
    expect(result.localizedImageCount).toBe(0);
    expect(result.failedImageCount).toBe(1);
  });

  it('does not overwrite an existing client file with the generated filename', async () => {
    const content = Buffer.from('image contents');
    const digest = '9665359084eaabf7';
    const localizer = new QtiImportRemoteImageLocalizer(async () => ({
      content,
      extension: 'png',
    }));

    const result = await localizer.localizeQuestionHtml(
      '<img src="https://canvas.example/image.png">',
      new Set([`remote-${digest}.png`]),
    );

    expect(result.files.has(`remote-${digest}-2.png`)).toBe(true);
    expect(result.html).toContain(`file-name="remote-${digest}-2.png"`);
  });

  it('limits the number of remote images processed across an import', async () => {
    const localizer = new QtiImportRemoteImageLocalizer(async (url) => ({
      content: Buffer.from(url.pathname),
      extension: 'png',
    }));
    const html = Array.from(
      { length: 101 },
      (_, index) => `<img src="https://canvas.example/image-${index}.png">`,
    ).join('');

    const result = await localizer.localizeQuestionHtml(html, new Set());

    expect(result.localizedImageCount).toBe(100);
    expect(result.failedImageCount).toBe(1);
    expect(result.html).toContain('https://canvas.example/image-100.png');
  });

  it('bounds concurrent remote image requests', async () => {
    let activeRequestCount = 0;
    let maximumActiveRequestCount = 0;
    const localizer = new QtiImportRemoteImageLocalizer(async () => {
      activeRequestCount += 1;
      maximumActiveRequestCount = Math.max(maximumActiveRequestCount, activeRequestCount);
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeRequestCount -= 1;
      return { content: Buffer.from('image contents'), extension: 'png' };
    });
    const html = Array.from(
      { length: 10 },
      (_, index) => `<img src="https://canvas.example/image-${index}.png">`,
    ).join('');

    await localizer.localizeQuestionHtml(html, new Set());

    expect(maximumActiveRequestCount).toBe(5);
  });

  it('stops starting downloads after reaching the aggregate byte limit', async () => {
    const content = Buffer.alloc(10 * 1024 * 1024);
    let fetchCount = 0;
    const localizer = new QtiImportRemoteImageLocalizer(async (_url, consumeBytes) => {
      fetchCount += 1;
      consumeBytes(content.byteLength);
      return { content, extension: 'png' };
    });
    const html = Array.from(
      { length: 20 },
      (_, index) => `<img src="https://canvas.example/image-${index}.png">`,
    ).join('');

    const result = await localizer.localizeQuestionHtml(html, new Set());

    expect(fetchCount).toBeLessThan(20);
    expect(result.localizedImageCount).toBe(5);
    expect(result.failedImageCount).toBe(15);
  });
});

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

describe('fetchRemoteImage', () => {
  it('pins each request and redirect to a validated address without forwarding credentials', async () => {
    const requests: { url: string; headers: http.IncomingHttpHeaders }[] = [];
    await withHttpServer(
      (request, response) => {
        requests.push({ url: request.url ?? '', headers: request.headers });
        if (request.url === '/redirect') {
          response.writeHead(302, { Location: '/image.png' });
          response.end();
          return;
        }
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': ONE_PIXEL_PNG.byteLength,
        });
        response.end(ONE_PIXEL_PNG);
      },
      async (port) => {
        const resolvedHostnames: string[] = [];
        const result = await fetchRemoteImage(new URL(`http://public.example:${port}/redirect`), {
          resolveAddress: async (hostname) => {
            resolvedHostnames.push(hostname);
            return '127.0.0.1';
          },
        });

        expect(result).toEqual({ content: ONE_PIXEL_PNG, extension: 'png' });
        expect(resolvedHostnames).toEqual(['public.example', 'public.example']);
        expect(requests.map((request) => request.url)).toEqual(['/redirect', '/image.png']);
        expect(requests[0].headers.host).toBe(`public.example:${port}`);
        expect(requests[0].headers.authorization).toBeUndefined();
        expect(requests[0].headers.cookie).toBeUndefined();
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
          response.writeHead(200, { 'Content-Type': 'image/png' });
          response.end(ONE_PIXEL_PNG);
        },
        async (port) => {
          await expect(
            fetchRemoteImage(new URL(`http://${hostname}:${port}/image.png`)),
          ).rejects.toThrow('public address');
        },
      );
      expect(requestCount).toBe(0);
    },
  );

  it('rejects content whose detected type does not match the response header', async () => {
    let downloadedBytes = 0;
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'image/jpeg' });
        response.end(ONE_PIXEL_PNG);
      },
      async (port) => {
        await expect(
          fetchRemoteImage(new URL(`http://public.example:${port}/image`), {
            resolveAddress: async () => '127.0.0.1',
            consumeBytes: (byteLength) => {
              downloadedBytes += byteLength;
            },
          }),
        ).rejects.toThrow('does not match');
      },
    );
    expect(downloadedBytes).toBe(ONE_PIXEL_PNG.byteLength);
  });

  it('rejects responses over the per-image size limit before reading the body', async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': 10 * 1024 * 1024 + 1,
        });
        response.end();
      },
      async (port) => {
        await expect(
          fetchRemoteImage(new URL(`http://public.example:${port}/image`), {
            resolveAddress: async () => '127.0.0.1',
          }),
        ).rejects.toThrow('too large');
      },
    );
  });

  it('rejects streamed responses over the per-image size limit', async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.write(Buffer.alloc(10 * 1024 * 1024));
        response.end(Buffer.alloc(1));
      },
      async (port) => {
        await expect(
          fetchRemoteImage(new URL(`http://public.example:${port}/image`), {
            resolveAddress: async () => '127.0.0.1',
          }),
        ).rejects.toThrow('too large');
      },
    );
  });

  it('rejects URLs containing credentials before resolving the host', async () => {
    let didResolve = false;

    await expect(
      fetchRemoteImage(new URL('https://user:password@public.example/image.png'), {
        resolveAddress: async () => {
          didResolve = true;
          return '127.0.0.1';
        },
      }),
    ).rejects.toThrow('credentials');
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
          fetchRemoteImage(new URL(`http://public.example:${port}/redirect`), {
            resolveAddress: async () => '127.0.0.1',
          }),
        ).rejects.toThrow('redirect limit');
      },
    );
    expect(requestCount).toBe(4);
  });
});

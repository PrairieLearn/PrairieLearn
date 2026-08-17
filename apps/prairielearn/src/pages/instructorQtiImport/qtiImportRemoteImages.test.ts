import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { QtiImportRemoteImageLocalizer, fetchRemoteImage } from './qtiImportRemoteImages.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const SIMPLE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><path onload="alert(1)" d="M0 0" /></svg>',
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
    expect(result.html).toContain('display="inline"');
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

describe('fetchRemoteImage', () => {
  it('downloads supported image content with QTI request headers', async () => {
    const requestHeaders: http.IncomingHttpHeaders[] = [];
    await withHttpServer(
      (request, response) => {
        requestHeaders.push(request.headers);
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': ONE_PIXEL_PNG.byteLength,
        });
        response.end(ONE_PIXEL_PNG);
      },
      async (port) => {
        const result = await fetchRemoteImage(new URL(`http://public.example:${port}/image.png`), {
          resolveAddress: async () => '127.0.0.1',
        });

        expect(result).toEqual({ content: ONE_PIXEL_PNG, extension: 'png' });
        expect(requestHeaders[0].accept).toBe(
          'image/avif, image/gif, image/jpeg, image/png, image/svg+xml, image/webp',
        );
        expect(requestHeaders[0]['user-agent']).toBe('PrairieLearn-QTI-Importer/1.0');
      },
    );
  });

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

  it('accepts and sanitizes SVG images', async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
        response.end(SIMPLE_SVG);
      },
      async (port) => {
        const result = await fetchRemoteImage(
          new URL(`http://public.example:${port}/equation.svg`),
          { resolveAddress: async () => '127.0.0.1' },
        );

        expect(result.extension).toBe('svg');
        expect(result.content.toString()).toContain('<path');
        expect(result.content.toString()).not.toContain('onload');
      },
    );
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
});

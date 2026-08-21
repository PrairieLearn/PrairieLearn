import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetch as undiciFetch } from 'undici';
import { describe, expect, it } from 'vitest';

import type { PublicFetch } from '@prairielearn/public-fetch';

import { PLEmitter } from './emitters/pl-emitter.js';
import { QtiImportRemoteImageCopier, fetchRemoteImage } from './remote-image-copier.js';
import type { IRAssessment, IRQuestion } from './types/ir.js';

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

function createLocalFetch(port: number): PublicFetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    url.protocol = 'http:';
    url.hostname = '127.0.0.1';
    url.port = String(port);
    return undiciFetch(url, init);
  };
}

function makeQuestion(overrides: Partial<IRQuestion> = {}): IRQuestion {
  return {
    sourceId: 'source-q1',
    title: 'Question',
    promptHtml: '<p>Question</p>',
    body: {
      type: 'multiple-choice',
      choices: [
        { id: 'a', html: 'Yes', correct: true },
        { id: 'b', html: 'No', correct: false },
      ],
    },
    assets: new Map(),
    gradingMethod: 'Internal',
    ...overrides,
  };
}

function makeAssessment(question: IRQuestion): IRAssessment {
  return {
    sourceId: 'assessment',
    title: 'Assessment',
    sourceType: 'assessment',
    questions: [question],
  };
}

describe('QtiImportRemoteImageCopier', () => {
  it('processes conversion results and records uncopied-image warnings', async () => {
    const copier = new QtiImportRemoteImageCopier(async () => {
      throw new Error('unavailable');
    });

    const result = await new PLEmitter().emitProcessed(
      makeAssessment(
        makeQuestion({
          promptHtml:
            '<img src="https://canvas.example/unavailable.png"><img src="://invalid.example/image.png">',
        }),
      ),
      { processors: [copier] },
    );

    expect(result.warnings).toEqual([
      {
        questionId: 'source-q1',
        message:
          '2 remote images could not be copied because of their URLs, availability, size, or format.',
      },
    ]);
  });

  it('copies remote feedback images before emission and resolves their client-file URLs', async () => {
    const requestedUrls: string[] = [];
    const copier = new QtiImportRemoteImageCopier(async (url) => {
      requestedUrls.push(url.href);
      return { content: Buffer.from('feedback image'), extension: 'png' };
    });
    const imageUrl = 'https://canvas.example/feedback.png?verifier=secret';

    const result = await new PLEmitter().emitProcessed(
      makeAssessment(
        makeQuestion({
          promptHtml: `<p>Question <img src="${imageUrl}"></p>`,
          feedback: {
            correct: `<p>Correct <img src="${imageUrl}" alt="Explanation"></p>`,
            perAnswer: { Yes: `<img src="${imageUrl}" class="answer-feedback">` },
          },
        }),
      ),
      { processors: [copier] },
    );

    const question = result.questions[0];
    expect(requestedUrls).toEqual([imageUrl]);
    expect(question.clientFiles.size).toBe(1);
    expect(question.serverPy).not.toContain('canvas.example');
    expect(question.serverPy).toContain('<img src=');
    expect(question.serverPy).not.toContain('<pl-figure');
    expect(question.serverPy).toContain('{{ options.client_files_question_url }}/remote-');
    expect(question.serverPy).toContain('def render(data, html):');
    expect(question.serverPy).toContain('data["options"]["client_files_question_url"]');
    expect(question.questionHtml).toContain(
      'feedback="<img src=&quot;{{ options.client_files_question_url }}/remote-',
    );
    expect(question.questionHtml).not.toContain('canvas.example');
    expect(question.questionHtml).toContain('<pl-figure');
    expect(copier.getCopyResult(question).remoteImagesCopied).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('warns when a feedback image cannot be copied and preserves its remote URL', async () => {
    const copier = new QtiImportRemoteImageCopier(async () => {
      throw new Error('unavailable');
    });
    const imageUrl = 'https://canvas.example/feedback.png';

    const result = await new PLEmitter().emitProcessed(
      makeAssessment(makeQuestion({ feedback: { incorrect: `<img src="${imageUrl}">` } })),
      { processors: [copier] },
    );

    expect(result.questions[0].serverPy).toContain(imageUrl);
    expect(result.warnings).toEqual([
      {
        questionId: 'source-q1',
        message:
          '1 remote image could not be copied because of its URL, availability, size, or format.',
      },
    ]);
  });

  it('copies remote images and rewrites all references to local pl-figure elements', async () => {
    const requestedUrls: string[] = [];
    const copier = new QtiImportRemoteImageCopier(async (url) => {
      requestedUrls.push(url.href);
      return { content: Buffer.from('image contents'), extension: 'png' };
    });

    const result = await copier.copyRemoteImages(
      [
        '<p><img src="https://canvas.example/files/1/preview?verifier=secret" alt="Graph" width="200"></p>',
        '<img src="https://canvas.example/files/1/preview?verifier=secret">',
      ].join(''),
      new Set(),
    );

    expect(requestedUrls).toEqual(['https://canvas.example/files/1/preview?verifier=secret']);
    expect(result.remoteImagesCopied).toBe(1);
    expect(result.failedImageCount).toBe(0);
    expect(result.unattemptedRemoteImageCount).toBe(0);
    expect(result.files.size).toBe(1);
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
    const copier = new QtiImportRemoteImageCopier(async (url) => {
      requestedUrls.push(url.href);
      return { content: Buffer.from('image contents'), extension: 'jpg' };
    });

    const result = await copier.copyRemoteImages(
      [
        '<img src=" //canvas.example/files/1/preview#first">',
        '<img src="//canvas.example/files/1/preview#second">',
      ].join(''),
      new Set(),
    );

    expect(requestedUrls).toEqual(['https://canvas.example/files/1/preview']);
    expect(result.remoteImagesCopied).toBe(1);
    expect(result.html.match(/<pl-figure/g)).toHaveLength(2);
  });

  it('leaves a remote reference unchanged when it cannot be fetched', async () => {
    const copier = new QtiImportRemoteImageCopier(async () => {
      throw new Error('unavailable');
    });
    const html = '<img src="https://canvas.example/files/1/preview?verifier=secret">';

    const result = await copier.copyRemoteImages(html, new Set());

    expect(result.html).toBe(html);
    expect(result.files.size).toBe(0);
    expect(result.remoteImagesCopied).toBe(0);
    expect(result.failedImageCount).toBe(1);
    expect(result.unattemptedRemoteImageCount).toBe(0);
  });

  it('counts insecure or malformed remote references that were not attempted', async () => {
    let fetchCount = 0;
    const copier = new QtiImportRemoteImageCopier(async () => {
      fetchCount += 1;
      return { content: Buffer.from('image contents'), extension: 'png' };
    });

    const result = await copier.copyRemoteImages(
      '<img src="http://canvas.example/insecure.png"><img src="://invalid.example/image.png">',
      new Set(),
    );

    expect(fetchCount).toBe(0);
    expect(result.failedImageCount).toBe(0);
    expect(result.unattemptedRemoteImageCount).toBe(2);
  });

  it('does not overwrite an existing client file with the generated filename', async () => {
    const content = Buffer.from('image contents');
    const digest = '9665359084eaabf7';
    const copier = new QtiImportRemoteImageCopier(async () => ({
      content,
      extension: 'png',
    }));

    const result = await copier.copyRemoteImages(
      '<img src="https://canvas.example/image.png">',
      new Set([`remote-${digest}.png`]),
    );

    expect(result.files.has(`remote-${digest}-2.png`)).toBe(true);
    expect(result.html).toContain(`file-name="remote-${digest}-2.png"`);
  });

  it('limits the number of remote images copied across an import', async () => {
    const copier = new QtiImportRemoteImageCopier(async (url) => ({
      content: Buffer.from(url.pathname),
      extension: 'png',
    }));
    const html = Array.from(
      { length: 101 },
      (_, index) => `<img src="https://canvas.example/image-${index}.png">`,
    ).join('');

    const result = await copier.copyRemoteImages(html, new Set());

    expect(result.remoteImagesCopied).toBe(100);
    expect(result.failedImageCount).toBe(1);
    expect(result.html).toContain('https://canvas.example/image-100.png');
  });

  it('bounds concurrent remote image requests', async () => {
    let activeRequestCount = 0;
    let maximumActiveRequestCount = 0;
    const copier = new QtiImportRemoteImageCopier(async () => {
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

    await copier.copyRemoteImages(html, new Set());

    expect(maximumActiveRequestCount).toBe(5);
  });

  it('hands a released request slot to the queued batch before starting a later batch', async () => {
    const copier = new QtiImportRemoteImageCopier();
    const startedRequests: string[] = [];
    const releaseActiveRequests: (() => void)[] = [];
    const scheduleRequest = (name: string, block = false) =>
      copier['scheduleRequest'](() => {
        startedRequests.push(name);
        if (!block) return Promise.resolve();
        return new Promise<void>((resolve) => releaseActiveRequests.push(resolve));
      });
    const initialRequests = Array.from({ length: 5 }, (_, index) =>
      scheduleRequest(`initial-${index}`, true),
    );
    const queuedRequest = scheduleRequest('initial-queued');

    expect(startedRequests).toEqual([
      'initial-0',
      'initial-1',
      'initial-2',
      'initial-3',
      'initial-4',
    ]);

    releaseActiveRequests.shift()?.();
    const laterRequest = new Promise<void>((resolve, reject) => {
      // Run after the active request releases its slot but before the queued request resumes.
      queueMicrotask(() => scheduleRequest('later').then(resolve, reject));
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(startedRequests.slice(5)).toEqual(['initial-queued', 'later']);

    releaseActiveRequests.forEach((release) => release());
    await Promise.all([...initialRequests, queuedRequest, laterRequest]);
  });

  it('stops starting downloads after reaching the aggregate byte limit', async () => {
    const content = Buffer.alloc(10 * 1024 * 1024);
    let fetchCount = 0;
    const copier = new QtiImportRemoteImageCopier(async (_url, consumeBytes) => {
      fetchCount += 1;
      consumeBytes(content.byteLength);
      return { content, extension: 'png' };
    });
    const html = Array.from(
      { length: 20 },
      (_, index) => `<img src="https://canvas.example/image-${index}.png">`,
    ).join('');

    const result = await copier.copyRemoteImages(html, new Set());

    expect(fetchCount).toBeLessThan(20);
    expect(result.remoteImagesCopied).toBe(5);
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
        const result = await fetchRemoteImage(new URL('https://public.example/image.png'), {
          fetch: createLocalFetch(port),
        });

        expect(result).toEqual({ content: ONE_PIXEL_PNG, extension: 'png' });
        expect(requestHeaders[0].accept).toBe(
          'image/avif, image/gif, image/jpeg, image/png, image/webp',
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
          fetchRemoteImage(new URL('https://public.example/image'), {
            fetch: createLocalFetch(port),
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
          fetchRemoteImage(new URL('https://public.example/image'), {
            fetch: createLocalFetch(port),
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
          fetchRemoteImage(new URL('https://public.example/image'), {
            fetch: createLocalFetch(port),
          }),
        ).rejects.toThrow('too large');
      },
    );
  });
});

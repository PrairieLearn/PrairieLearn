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

async function processPrompt(
  promptHtml: string,
  copier: QtiImportRemoteImageCopier,
  assets: IRQuestion['assets'] = new Map(),
) {
  return new PLEmitter().emitProcessed(makeAssessment(makeQuestion({ promptHtml, assets })), {
    processors: [copier],
  });
}

describe('QtiImportRemoteImageCopier', () => {
  it('processes conversion results and records uncopied-image warnings', async () => {
    const requestedUrls: string[] = [];
    const copier = new QtiImportRemoteImageCopier(async (url) => {
      requestedUrls.push(url.href);
      throw new Error('unavailable');
    });

    const result = await new PLEmitter().emitProcessed(
      makeAssessment(
        makeQuestion({
          promptHtml:
            '<img src="https://canvas.example/unavailable.png"><img src="http://canvas.example/insecure.png"><img src="://invalid.example/image.png">',
          feedback: {
            incorrect: '<img src="https://canvas.example/feedback.png">',
          },
        }),
      ),
      { processors: [copier] },
    );

    expect(requestedUrls).toEqual([
      'https://canvas.example/feedback.png',
      'https://canvas.example/unavailable.png',
    ]);
    expect(result.questions[0].questionHtml).toContain('https://canvas.example/unavailable.png');
    expect(result.questions[0].questionHtml).toContain('http://canvas.example/insecure.png');
    expect(result.questions[0].questionHtml).toContain('://invalid.example/image.png');
    expect(result.questions[0].serverPy).toContain('https://canvas.example/feedback.png');
    expect(result.warnings).toEqual([
      {
        questionId: 'source-q1',
        code: 'remote-image-copy-failed',
        message:
          '4 remote image references could not be copied into the course and were left unchanged. Their URLs may be invalid or insecure, or the images may be unavailable, too large, or in an unsupported format.',
      },
    ]);
    expect(result.reports).toEqual([
      {
        type: 'remote-image-copy',
        questionId: 'source-q1',
        referencesFound: 4,
        referencesCopied: 0,
        referencesLeftRemote: 4,
        filesCreated: 0,
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
    expect(result.warnings).toEqual([]);
    expect(result.reports).toEqual([
      {
        type: 'remote-image-copy',
        questionId: 'source-q1',
        referencesFound: 3,
        referencesCopied: 3,
        referencesLeftRemote: 0,
        filesCreated: 1,
      },
    ]);
  });

  it('copies remote images and rewrites all references to local pl-figure elements', async () => {
    const requestedUrls: string[] = [];
    const copier = new QtiImportRemoteImageCopier(async (url) => {
      requestedUrls.push(url.href);
      return { content: Buffer.from('image contents'), extension: 'png' };
    });

    const result = await processPrompt(
      [
        '<p><img src="https://canvas.example/files/1/preview?verifier=secret#first" alt="Graph" width="200"></p>',
        '<img src="//canvas.example/files/1/preview?verifier=secret#second">',
      ].join(''),
      copier,
    );
    const question = result.questions[0];

    expect(requestedUrls).toEqual(['https://canvas.example/files/1/preview?verifier=secret']);
    expect(question.clientFiles.size).toBe(1);
    expect(question.questionHtml).not.toContain('canvas.example');
    expect(question.questionHtml).not.toContain('verifier');
    expect(question.questionHtml.match(/<pl-figure/g)).toHaveLength(2);
    expect(question.questionHtml).toContain('directory="clientFilesQuestion"');
    expect(question.questionHtml).toContain('display="inline"');
    expect(question.questionHtml).toContain('alt="Graph"');
    expect(question.questionHtml).toContain('width="200"');
    expect(result.warnings).toEqual([]);
    expect(result.reports).toEqual([
      {
        type: 'remote-image-copy',
        questionId: 'source-q1',
        referencesFound: 2,
        referencesCopied: 2,
        referencesLeftRemote: 0,
        filesCreated: 1,
      },
    ]);
  });

  it('does not overwrite an existing client file with the generated filename', async () => {
    const content = Buffer.from('image contents');
    const digest = '9665359084eaabf7';
    const copier = new QtiImportRemoteImageCopier(async () => ({
      content,
      extension: 'png',
    }));

    const result = await processPrompt(
      '<img src="https://canvas.example/image.png">',
      copier,
      new Map([
        [
          `remote-${digest}.png`,
          { type: 'base64', value: Buffer.from('different contents').toString('base64') },
        ],
      ]),
    );

    expect(result.questions[0].clientFiles.has(`remote-${digest}-2.png`)).toBe(true);
    expect(result.questions[0].questionHtml).toContain(`file-name="remote-${digest}-2.png"`);
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

    const result = await processPrompt(html, copier);

    expect(result.questions[0].questionHtml.match(/<pl-figure/g)).toHaveLength(100);
    expect(result.questions[0].questionHtml).toContain('https://canvas.example/image-100.png');
    expect(result.warnings[0].code).toBe('remote-image-copy-failed');
    expect(result.reports[0]).toEqual({
      type: 'remote-image-copy',
      questionId: 'source-q1',
      referencesFound: 101,
      referencesCopied: 100,
      referencesLeftRemote: 1,
      filesCreated: 100,
    });
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

    await processPrompt(html, copier);

    expect(maximumActiveRequestCount).toBe(5);
  });

  it('hands a released request slot to the queued batch before starting a later batch', async () => {
    const startedRequests: string[] = [];
    const releaseActiveRequests: (() => void)[] = [];
    const copier = new QtiImportRemoteImageCopier(async (url) => {
      startedRequests.push(url.pathname);
      if (url.pathname !== '/initial-queued.png' && url.pathname !== '/later.png') {
        await new Promise<void>((resolve) => releaseActiveRequests.push(resolve));
      }
      return { content: Buffer.from(url.pathname), extension: 'png' };
    });
    const initialBatch = processPrompt(
      Array.from(
        { length: 6 },
        (_, index) =>
          `<img src="https://canvas.example/${index === 5 ? 'initial-queued' : `initial-${index}`}.png">`,
      ).join(''),
      copier,
    );
    const laterBatch = processPrompt('<img src="https://canvas.example/later.png">', copier);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(startedRequests).toEqual([
      '/initial-0.png',
      '/initial-1.png',
      '/initial-2.png',
      '/initial-3.png',
      '/initial-4.png',
    ]);

    releaseActiveRequests.shift()?.();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(startedRequests.slice(5)).toEqual(['/initial-queued.png', '/later.png']);

    releaseActiveRequests.forEach((release) => release());
    await Promise.all([initialBatch, laterBatch]);
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

    const result = await processPrompt(html, copier);

    expect(fetchCount).toBeLessThan(20);
    expect(result.questions[0].questionHtml.match(/<pl-figure/g)).toHaveLength(5);
    expect(result.warnings[0].code).toBe('remote-image-copy-failed');
    expect(result.reports[0]).toEqual({
      type: 'remote-image-copy',
      questionId: 'source-q1',
      referencesFound: 20,
      referencesCopied: 5,
      referencesLeftRemote: 15,
      filesCreated: 1,
    });
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

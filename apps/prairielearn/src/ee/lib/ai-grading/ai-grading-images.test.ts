import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { publicFetch } from '@prairielearn/public-fetch';

import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from '../../../lib/chunks.js';
import { config } from '../../../lib/config.js';
import { getDynamicFile } from '../../../lib/question-variant.js';

import { type QuestionImageContext, loadQuestionImage } from './ai-grading-images.js';

vi.mock('@prairielearn/public-fetch', { spy: true });
vi.mock('../../../lib/chunks.js', () => ({
  ensureChunksForCourseAsync: vi.fn(),
  getRuntimeDirectoryForCourse: vi.fn(),
}));
vi.mock('../../../lib/question-variant.js', () => ({ getDynamicFile: vi.fn() }));

const context = {
  urls: {
    clientFilesQuestionUrl: '/question/1/clientFilesQuestion',
    clientFilesCourseUrl: '/question/1/clientFilesCourse',
    clientFilesQuestionGeneratedFileUrl: '/question/1/generatedFilesQuestion/variant/2',
  },
  question: { id: '1', directory: 'test' },
  questionCourse: { id: '3' },
  variantCourse: { id: '4' },
  variant: { id: '2' },
  userId: '5',
  authnUserId: '6',
} as QuestionImageContext;

let root: string;
let image: Buffer;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ai-grading-images-'));
  image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  await mkdir(path.join(root, 'questions/test/clientFilesQuestion'), { recursive: true });
  await mkdir(path.join(root, 'clientFilesCourse'));
  await writeFile(path.join(root, 'questions/test/clientFilesQuestion/image.png'), image);
  await writeFile(path.join(root, 'clientFilesCourse/image.png'), image);
  await writeFile(path.join(root, 'secret.png'), image);
  await symlink(
    path.join(root, 'secret.png'),
    path.join(root, 'questions/test/clientFilesQuestion/escape.png'),
  );
});

afterAll(async () => rm(root, { recursive: true, force: true }));

beforeEach(() => {
  vi.mocked(publicFetch).mockReset();
  vi.mocked(getDynamicFile).mockReset();
  vi.mocked(ensureChunksForCourseAsync).mockClear();
  vi.mocked(getRuntimeDirectoryForCourse).mockReturnValue(root);
  config.serverCanonicalHost = 'http://localhost:3000';
});

/** The loader uses the shared Fetch response fields; Undici's types also require textStream. */
function makeResponse(
  body: ConstructorParameters<typeof Response>[0],
  init?: ConstructorParameters<typeof Response>[1],
) {
  return new Response(body, init) as unknown as Awaited<ReturnType<typeof publicFetch>>;
}

describe('loadQuestionImage', () => {
  it('decodes inline images without a network request', async () => {
    expect(
      await loadQuestionImage(`data:image/png;base64,${image.toString('base64')}`, context),
    ).toEqual({ data: image.toString('base64'), mediaType: 'image/png' });
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['clientFilesQuestion', '/question/1/clientFilesQuestion/image.png', '3'],
    ['clientFilesCourse', '/question/1/clientFilesCourse/image.png', '4'],
  ])('loads %s assets internally', async (_, src, courseId) => {
    const result = await loadQuestionImage(src, context);
    expect(result.data).toBe(image.toString('base64'));
    expect(ensureChunksForCourseAsync).toHaveBeenCalledWith(courseId, expect.any(Object));
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it('generates files using the current variant context', async () => {
    vi.mocked(getDynamicFile).mockResolvedValue(image);
    await loadQuestionImage('/question/1/generatedFilesQuestion/variant/2/image.png', context);
    expect(getDynamicFile).toHaveBeenCalledWith({
      filename: 'image.png',
      variant: context.variant,
      submission: null,
      question: context.question,
      variant_course: context.variantCourse,
      user_id: context.userId,
      authn_user_id: context.authnUserId,
    });
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it.each([
    '/admin',
    '/question/1/generatedFilesQuestion/variant/99/image.png',
    '/question/99/clientFilesQuestion/image.png',
    '/question/1/clientFilesQuestion/%2e%2e%2fsecret.png',
    '/question/1/clientFilesQuestion/escape.png',
  ])('rejects access outside the current assets: %s', async (src) => {
    await expect(loadQuestionImage(src, context)).rejects.toThrow();
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://127.0.0.1/image.png',
    'https://[::1]/image.png',
    'http://example.com/image.png',
  ])('rejects unsafe external destinations: %s', async (src) => {
    await expect(loadQuestionImage(src, context)).rejects.toThrow();
  });

  it('uses publicFetch for external images and detects their actual media type', async () => {
    vi.mocked(publicFetch).mockResolvedValue(
      makeResponse(new Uint8Array(image), {
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const result = await loadQuestionImage('https://example.com/image', context);
    expect(result.mediaType).toBe('image/png');
    expect(publicFetch).toHaveBeenCalledWith(new URL('https://example.com/image'), {
      signal: expect.any(AbortSignal),
    });
  });

  it('cancels responses as soon as the image limit is exceeded', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.alloc(10 * 1024 * 1024));
        controller.enqueue(Buffer.alloc(1));
      },
      cancel,
    });
    vi.mocked(publicFetch).mockResolvedValue(makeResponse(body));
    await expect(loadQuestionImage('https://example.com/image', context)).rejects.toThrow(
      'size limit',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('applies the request deadline while reading the response body', async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    vi.mocked(publicFetch).mockImplementation(async (_, init) => {
      return makeResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init!.signal!.addEventListener('abort', () => controller.error(init!.signal!.reason));
          },
        }),
      );
    });
    try {
      const loading = loadQuestionImage('https://example.com/image', context);
      const failure = loading.catch((error: unknown) => error);
      expect(timeout).toHaveBeenCalledWith(10_000);
      const error = new Error('Download deadline exceeded');
      deadline.abort(error);
      await expect(failure).resolves.toBe(error);
    } finally {
      timeout.mockRestore();
    }
  });

  it('rejects non-image responses', async () => {
    vi.mocked(publicFetch).mockResolvedValue(makeResponse('<html>Not an image</html>'));
    await expect(loadQuestionImage('https://example.com/image', context)).rejects.toThrow();
  });
});

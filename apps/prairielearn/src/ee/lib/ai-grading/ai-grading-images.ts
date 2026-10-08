import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

import sharp from 'sharp';

import { publicFetch } from '@prairielearn/public-fetch';

import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from '../../../lib/chunks.js';
import { config } from '../../../lib/config.js';
import type { Course, Question, Variant } from '../../../lib/db-types.js';
import type { QuestionUrls } from '../../../lib/question-render.types.js';
import { getDynamicFile } from '../../../lib/question-variant.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;

export interface QuestionImageContext {
  urls: QuestionUrls;
  question: Question;
  questionCourse: Course;
  variantCourse: Course;
  variant: Variant;
  userId: string;
  authnUserId: string;
}

async function readImage(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > MAX_IMAGE_BYTES) throw new Error('Question image exceeds the size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function assetFilename(url: URL, prefix: string, base: URL): string | null {
  const assetUrl = new URL(`${prefix}/`, base);
  if (url.origin !== assetUrl.origin || !url.pathname.startsWith(assetUrl.pathname)) return null;

  const filename = decodeURIComponent(url.pathname.slice(assetUrl.pathname.length));
  if (
    !filename ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    filename.split('/').some((part) => part === '..' || part === '.') ||
    path.isAbsolute(filename)
  ) {
    throw new Error('Invalid question image filename');
  }
  return filename;
}

async function readCourseImage(root: string, filename: string): Promise<Buffer> {
  const realRoot = await realpath(root);
  const realFile = await realpath(path.resolve(realRoot, filename));
  const relative = path.relative(realRoot, realFile);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Question image is outside its asset directory');
  }
  return readImage(createReadStream(realFile));
}

export async function loadQuestionImage(src: string, context: QuestionImageContext) {
  const base = new URL(
    config.serverCanonicalHost ?? `${config.serverType}://${config.hostname}:${config.serverPort}`,
  );
  const url = new URL(src, base);
  let image: Buffer;

  if (url.protocol === 'data:') {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(src);
    if (!match || match[1].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
      throw new Error('Invalid or oversized inline question image');
    }
    image = Buffer.from(match[1], 'base64');
  } else {
    if (url.username || url.password) throw new Error('Question image URL contains credentials');
    const questionFilename = assetFilename(url, context.urls.clientFilesQuestionUrl, base);
    const courseFilename = assetFilename(url, context.urls.clientFilesCourseUrl, base);
    const generatedFilename = assetFilename(
      url,
      context.urls.clientFilesQuestionGeneratedFileUrl,
      base,
    );

    if (questionFilename !== null) {
      assert(context.question.directory !== null);
      await ensureChunksForCourseAsync(context.questionCourse.id, {
        type: 'question',
        questionId: context.question.id,
      });
      image = await readCourseImage(
        path.join(
          getRuntimeDirectoryForCourse(context.questionCourse),
          'questions',
          context.question.directory,
          'clientFilesQuestion',
        ),
        questionFilename,
      );
    } else if (courseFilename !== null) {
      await ensureChunksForCourseAsync(context.variantCourse.id, { type: 'clientFilesCourse' });
      image = await readCourseImage(
        path.join(getRuntimeDirectoryForCourse(context.variantCourse), 'clientFilesCourse'),
        courseFilename,
      );
    } else if (generatedFilename !== null) {
      image = await getDynamicFile({
        filename: generatedFilename,
        variant: context.variant,
        submission: null,
        question: context.question,
        variant_course: context.variantCourse,
        user_id: context.userId,
        authn_user_id: context.authnUserId,
        maxFileBytes: MAX_IMAGE_BYTES,
      });
    } else {
      // Same-origin URLs must identify an asset for this question, never an arbitrary server route.
      if (url.origin === base.origin) {
        throw new Error('Unrecognized PrairieLearn question image URL');
      }
      const response = await publicFetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`Failed to load question image: ${response.status}`);
      }
      image = await readImage(response.body);
    }
  }

  if (image.length > MAX_IMAGE_BYTES) throw new Error('Question image exceeds the size limit');
  const { format } = await sharp(image).metadata();
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
    throw new Error('Unsupported question image format');
  }
  return { data: image.toString('base64'), mediaType: `image/${format}` };
}

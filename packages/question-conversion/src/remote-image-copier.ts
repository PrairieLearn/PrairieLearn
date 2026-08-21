import crypto from 'node:crypto';

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { fileTypeFromBuffer } from 'file-type';

import {
  type PublicFetch,
  type ResolveAddress,
  createPublicFetch,
  publicFetch,
  validatePublicHttpsUrl,
} from '@prairielearn/public-fetch';

import type { ConversionProcessor, ConversionResult } from './emitters/emitter.js';
import type { IRItemContainer, IRQuestion } from './types/ir.js';
import type { PLQuestionOutput } from './types/pl-output.js';
import { CLIENT_FILES_QUESTION_URL } from './utils/html.js';

// These limits cap both remote work and the amount of binary data retained by a conversion. The
// 10 MiB per-image limit matches PrairieLearn's image-upload limit; 100 URLs and 50 MiB total allow
// image-heavy assessments without letting one import monopolize memory. Five concurrent requests
// keep fan-out bounded, and the 10-second timeout prevents an unresponsive host from stalling the
// conversion for long.
const MAX_REMOTE_IMAGE_COUNT = 100;
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_REMOTE_IMAGE_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_REQUESTS = 5;
const USER_AGENT = 'PrairieLearn-QTI-Importer/1.0';

const SUPPORTED_IMAGE_TYPES = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const ACCEPTED_IMAGE_CONTENT_TYPES = [...SUPPORTED_IMAGE_TYPES.keys()].join(', ');

export interface FetchedRemoteImage {
  content: Buffer;
  extension: string;
}

export interface RemoteImageCopyResult {
  html: string;
  files: Map<string, Buffer>;
  remoteImagesCopied: number;
  failedImageCount: number;
  unattemptedRemoteImageCount: number;
}

type ConsumeBytes = (byteLength: number) => void;
type FetchRemoteImage = (url: URL, consumeBytes: ConsumeBytes) => Promise<FetchedRemoteImage>;
type ImageReplacement = 'pl-figure' | 'img';

interface RemoteImageCopyStats {
  remoteImagesCopied: number;
  failedImageCount: number;
  unattemptedRemoteImageCount: number;
}

interface RemoteImageFragmentsCopyResult extends RemoteImageCopyStats {
  html: string[];
  files: Map<string, Buffer>;
}

const EMPTY_COPY_STATS: RemoteImageCopyStats = {
  remoteImagesCopied: 0,
  failedImageCount: 0,
  unattemptedRemoteImageCount: 0,
};

/**
 * Copies remote images across one complete QTI conversion while enforcing import-wide limits.
 * A single instance must be shared by every converted entry in the conversion.
 */
export class QtiImportRemoteImageCopier implements ConversionProcessor {
  private attemptedImageCount = 0;
  private downloadedImageBytes = 0;
  private storedImageBytes = 0;
  private activeRequestCount = 0;
  private readonly requestQueue: (() => void)[] = [];
  private readonly fetchCache = new Map<string, Promise<FetchedRemoteImage>>();
  private readonly feedbackCopyStats = new WeakMap<
    IRItemContainer,
    Map<string, RemoteImageCopyStats>
  >();

  private readonly questionCopyResults = new WeakMap<PLQuestionOutput, RemoteImageCopyResult>();

  constructor(
    private readonly fetchImage: FetchRemoteImage = (url, consumeBytes) =>
      fetchRemoteImage(url, { consumeBytes }),
  ) {}

  private fetchWithCache(url: URL): Promise<FetchedRemoteImage> {
    let promise = this.fetchCache.get(url.href);
    if (!promise) {
      if (this.attemptedImageCount >= MAX_REMOTE_IMAGE_COUNT) {
        throw new Error('QTI import contains too many remote images to copy');
      }
      this.attemptedImageCount += 1;

      promise = this.scheduleRequest(async () => {
        if (this.downloadedImageBytes >= MAX_TOTAL_REMOTE_IMAGE_BYTES) {
          throw new Error('Remote images to copy exceed the total size limit');
        }
        // Count bytes while streaming so invalid image payloads consume the same import-wide
        // budget as valid ones.
        return this.fetchImage(url, (byteLength) => {
          this.downloadedImageBytes += byteLength;
          if (this.downloadedImageBytes > MAX_TOTAL_REMOTE_IMAGE_BYTES) {
            throw new Error('Remote images to copy exceed the total size limit');
          }
        });
      });
      this.fetchCache.set(url.href, promise);
    }
    return promise;
  }

  private async scheduleRequest<T>(request: () => Promise<T>): Promise<T> {
    if (this.activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
      await new Promise<void>((resolve) => {
        this.requestQueue.push(resolve);
      });
    } else {
      this.activeRequestCount += 1;
    }
    try {
      return await request();
    } finally {
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        nextRequest();
      } else {
        this.activeRequestCount -= 1;
      }
    }
  }

  async copyRemoteImages(
    html: string,
    existingFilenames: Set<string>,
  ): Promise<RemoteImageCopyResult> {
    return this.copyHtml(html, existingFilenames, new Map(), 'pl-figure');
  }

  private async copyHtml(
    html: string,
    existingFilenames: Set<string>,
    existingFiles: ReadonlyMap<string, Buffer | string>,
    replacement: ImageReplacement,
  ): Promise<RemoteImageCopyResult> {
    const result = await this.copyHtmlFragments(
      [html],
      existingFilenames,
      existingFiles,
      replacement,
    );
    return { ...result, html: result.html[0] };
  }

  private async copyHtmlFragments(
    html: readonly string[],
    existingFilenames: Set<string>,
    existingFiles: ReadonlyMap<string, Buffer | string>,
    replacement: ImageReplacement,
  ): Promise<RemoteImageFragmentsCopyResult> {
    const fragments = html.map((originalHtml) => ({
      originalHtml,
      $: cheerio.load(originalHtml, null, false),
      changed: false,
    }));
    const imagesByUrl = new Map<
      string,
      {
        url: URL;
        elements: { $image: cheerio.Cheerio<Element>; fragmentIndex: number }[];
      }
    >();
    let unattemptedRemoteImageCount = 0;

    for (const [fragmentIndex, fragment] of fragments.entries()) {
      fragment.$('img[src]').each((_, element) => {
        const $image = fragment.$(element);
        const source = $image.attr('src');
        if (!source) return;
        const url = parseRemoteImageUrl(source);
        if (!url) {
          if (/^(?:https?:\/\/|:\/\/)/i.test(source.trim())) {
            unattemptedRemoteImageCount += 1;
          }
          return;
        }

        const image = { $image, fragmentIndex };
        const existing = imagesByUrl.get(url.href);
        if (existing) {
          existing.elements.push(image);
        } else {
          imagesByUrl.set(url.href, { url, elements: [image] });
        }
      });
    }

    const files = new Map<string, Buffer>();
    const filenameByDigest = new Map<string, string>();
    for (const [filename, content] of existingFiles) {
      if (!Buffer.isBuffer(content)) continue;
      filenameByDigest.set(contentDigest(content), filename);
    }
    let remoteImagesCopied = 0;
    let failedImageCount = 0;

    const copyPromises: Promise<void>[] = [];
    for (const { url, elements } of imagesByUrl.values()) {
      copyPromises.push(
        (async () => {
          let image: FetchedRemoteImage;
          try {
            image = await this.fetchWithCache(url);
          } catch {
            failedImageCount += 1;
            return;
          }

          const digest = contentDigest(image.content);
          // Content-addressed names deduplicate identical downloads and avoid trusting a remote
          // URL's path as a course filename.
          let filename = filenameByDigest.get(digest);
          if (!filename) {
            if (this.storedImageBytes + image.content.byteLength > MAX_TOTAL_REMOTE_IMAGE_BYTES) {
              failedImageCount += 1;
              return;
            }

            filename = allocateFilename(`remote-${digest}.${image.extension}`, existingFilenames);
            filenameByDigest.set(digest, filename);
            existingFilenames.add(filename);
            files.set(filename, image.content);
            this.storedImageBytes += image.content.byteLength;
          }

          for (const { $image, fragmentIndex } of elements) {
            const $ = fragments[fragmentIndex].$;
            if (replacement === 'img') {
              $image.attr('src', `${CLIENT_FILES_QUESTION_URL}/${filename}`);
            } else {
              const $figure = $('<pl-figure></pl-figure>');
              $figure.attr('file-name', filename);
              $figure.attr('directory', 'clientFilesQuestion');
              $figure.attr('display', 'inline');

              const alt = $image.attr('alt');
              const width = $image.attr('width');
              if (alt) $figure.attr('alt', alt);
              if (width) $figure.attr('width', width);
              $image.replaceWith($figure);
            }
            fragments[fragmentIndex].changed = true;
          }
          remoteImagesCopied += 1;
        })(),
      );
    }
    await Promise.all(copyPromises);

    return {
      html: fragments.map((fragment) =>
        fragment.changed ? fragment.$.html() : fragment.originalHtml,
      ),
      files,
      remoteImagesCopied,
      failedImageCount,
      unattemptedRemoteImageCount,
    };
  }

  async copyIntoQuestion(question: PLQuestionOutput): Promise<RemoteImageCopyResult> {
    const result = await this.copyHtml(
      question.questionHtml,
      new Set(question.clientFiles.keys()),
      question.clientFiles,
      'pl-figure',
    );
    question.questionHtml = result.html;
    for (const [filename, content] of result.files) {
      question.clientFiles.set(filename, content);
    }
    return result;
  }

  private async copyFeedback(question: IRQuestion): Promise<RemoteImageCopyStats> {
    const feedback = question.feedback;
    if (!feedback) return EMPTY_COPY_STATS;

    const html: string[] = [];
    const updateHtml: ((html: string) => void)[] = [];
    const addFragment = (fragment: string, update: (html: string) => void) => {
      html.push(fragment);
      updateHtml.push(update);
    };
    if (feedback.correct) {
      addFragment(feedback.correct, (value) => {
        feedback.correct = value;
      });
    }
    if (feedback.incorrect) {
      addFragment(feedback.incorrect, (value) => {
        feedback.incorrect = value;
      });
    }
    if (feedback.general) {
      addFragment(feedback.general, (value) => {
        feedback.general = value;
      });
    }
    const perAnswer = feedback.perAnswer;
    if (perAnswer) {
      for (const answer of Object.keys(perAnswer)) {
        addFragment(perAnswer[answer], (value) => {
          perAnswer[answer] = value;
        });
      }
    }
    if (html.length === 0) return EMPTY_COPY_STATS;

    const existingFiles = new Map<string, Buffer>();
    for (const [filename, asset] of question.assets) {
      if (asset.type === 'base64') {
        existingFiles.set(filename, Buffer.from(asset.value, 'base64'));
      }
    }
    const result = await this.copyHtmlFragments(
      html,
      new Set(question.assets.keys()),
      existingFiles,
      'img',
    );
    for (const [filename, content] of result.files) {
      question.assets.set(filename, {
        type: 'base64',
        value: content.toString('base64'),
      });
    }
    result.html.forEach((value, index) => updateHtml[index](value));

    return result;
  }

  async beforeEmit(itemContainer: IRItemContainer): Promise<void> {
    const statsByQuestionId = new Map<string, RemoteImageCopyStats>();
    this.feedbackCopyStats.set(itemContainer, statsByQuestionId);
    await Promise.all(
      itemContainer.questions.map(async (question) => {
        statsByQuestionId.set(question.sourceId, await this.copyFeedback(question));
      }),
    );
  }

  async afterEmit(result: ConversionResult, itemContainer: IRItemContainer): Promise<void> {
    const feedbackStats = this.feedbackCopyStats.get(itemContainer);
    const copyResults = await Promise.all(
      result.questions.map(async (question) => {
        const copyResult = await this.copyIntoQuestion(question);
        addCopyStats(copyResult, feedbackStats?.get(question.sourceId) ?? EMPTY_COPY_STATS);
        this.questionCopyResults.set(question, copyResult);
        return copyResult;
      }),
    );

    for (const [index, copyResult] of copyResults.entries()) {
      const uncopiedCount = copyResult.failedImageCount + copyResult.unattemptedRemoteImageCount;
      if (uncopiedCount === 0) continue;
      result.warnings.push({
        questionId: result.questions[index].sourceId,
        message: `${uncopiedCount} remote image${uncopiedCount === 1 ? '' : 's'} could not be copied because of ${uncopiedCount === 1 ? 'its URL' : 'their URLs'}, availability, size, or format.`,
      });
    }
  }

  getCopyResult(question: PLQuestionOutput): RemoteImageCopyResult {
    return (
      this.questionCopyResults.get(question) ?? {
        html: question.questionHtml,
        files: new Map(),
        ...EMPTY_COPY_STATS,
      }
    );
  }
}

function contentDigest(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function addCopyStats(target: RemoteImageCopyStats, source: RemoteImageCopyStats): void {
  target.remoteImagesCopied += source.remoteImagesCopied;
  target.failedImageCount += source.failedImageCount;
  target.unattemptedRemoteImageCount += source.unattemptedRemoteImageCount;
}

function parseRemoteImageUrl(source: string): URL | null {
  try {
    const trimmedSource = source.trim();
    const url = trimmedSource.startsWith('//')
      ? new URL(`https:${trimmedSource}`)
      : new URL(trimmedSource);
    validatePublicHttpsUrl(url);
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function allocateFilename(preferredFilename: string, existingFilenames: Set<string>): string {
  if (!existingFilenames.has(preferredFilename)) return preferredFilename;

  const extensionIndex = preferredFilename.lastIndexOf('.');
  const stem = preferredFilename.slice(0, extensionIndex);
  const extension = preferredFilename.slice(extensionIndex);
  let suffix = 2;
  while (existingFilenames.has(`${stem}-${suffix}${extension}`)) suffix += 1;
  return `${stem}-${suffix}${extension}`;
}

export async function fetchRemoteImage(
  initialUrl: URL,
  {
    resolveAddress,
    fetch = resolveAddress ? createPublicFetch({ resolveAddress }) : publicFetch,
    consumeBytes,
  }: {
    fetch?: PublicFetch;
    resolveAddress?: ResolveAddress;
    consumeBytes?: ConsumeBytes;
  } = {},
): Promise<FetchedRemoteImage> {
  const response = await fetch(initialUrl, {
    headers: {
      Accept: ACCEPTED_IMAGE_CONTENT_TYPES,
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error('Remote image returned an unsuccessful response');
  }

  const declaredContentType = normalizeContentType(response.headers.get('content-type'));
  if (!declaredContentType || !SUPPORTED_IMAGE_TYPES.has(declaredContentType)) {
    await response.body?.cancel();
    throw new Error('Remote image has an unsupported content type');
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new Error('Remote image is too large');
  }

  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of response.body ?? []) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    consumeBytes?.(buffer.byteLength);
    if (byteLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error('Remote image is too large');
    }
    chunks.push(buffer);
  }

  const content = Buffer.concat(chunks, byteLength);
  const detectedType = await fileTypeFromBuffer(content);
  if (detectedType?.mime !== declaredContentType) {
    throw new Error('Remote image content does not match its content type');
  }
  const extension = SUPPORTED_IMAGE_TYPES.get(detectedType.mime);
  if (!extension) {
    throw new Error('Remote image has an unsupported format');
  }
  return { content, extension };
}

function normalizeContentType(value: string | null): string | null {
  if (!value) return null;
  const contentType = value.split(';', 1)[0].trim().toLowerCase();
  return contentType === 'image/jpg' ? 'image/jpeg' : contentType;
}

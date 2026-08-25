import crypto from 'node:crypto';

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { fileTypeFromBuffer } from 'file-type';

import { type PublicFetch, publicFetch, validatePublicHttpsUrl } from '@prairielearn/public-fetch';

import type { ConversionProcessor, ConversionProcessorResult } from './emitters/emitter.js';
import type { IRItemContainer, IRQuestion } from './types/ir.js';
import { QUESTION_ASSET_URL_PREFIX } from './utils/html.js';

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

interface FetchedRemoteImage {
  content: Buffer;
  extension: string;
}

type ConsumeBytes = (byteLength: number) => void;
type FetchRemoteImage = (url: URL, consumeBytes: ConsumeBytes) => Promise<FetchedRemoteImage>;
interface CopyRemoteImagesOptions {
  reservedFilenames: Set<string>;
  existingFiles: ReadonlyMap<string, Buffer | string>;
}

interface MutableHtmlFragment {
  html: string;
  writeBack: (html: string) => void;
}

interface RemoteImageCopyOutcome {
  filesCreated: number;
  referencesLeftRemote: number;
}

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

  constructor(
    private readonly fetchImage: FetchRemoteImage = (url, consumeBytes) =>
      fetchRemoteImage(url, { consumeBytes }),
  ) {}

  private fetchImageWithCache(url: URL): Promise<FetchedRemoteImage> {
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

  /**
   * Copies remote images across a batch of HTML fragments. Processing them together deduplicates
   * images shared by multiple fragments.
   */
  private async copyRemoteImagesInHtmlFragments(
    htmlFragments: readonly MutableHtmlFragment[],
    { reservedFilenames, existingFiles }: CopyRemoteImagesOptions,
  ) {
    const fragments = htmlFragments.map((fragment) => ({
      ...fragment,
      $: cheerio.load(fragment.html, null, false),
      changed: false,
    }));
    const imagesByUrl = new Map<
      string,
      {
        url: URL;
        elements: { $image: cheerio.Cheerio<Element>; fragmentIndex: number }[];
      }
    >();
    const outcome = { referencesLeftRemote: 0 };

    for (const [fragmentIndex, fragment] of fragments.entries()) {
      fragment.$('img[src]').each((_, element) => {
        const $image = fragment.$(element);
        const source = $image.attr('src');
        if (!source) return;
        const url = parseRemoteImageUrl(source);
        if (!url) {
          if (isRemoteImageReference(source)) {
            outcome.referencesLeftRemote += 1;
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

    const createdFiles = new Map<string, Buffer>();
    const filenameByDigest = new Map<string, string>();
    for (const [filename, content] of existingFiles) {
      if (!Buffer.isBuffer(content)) continue;
      filenameByDigest.set(contentDigest(content), filename);
    }
    const copyPromises: Promise<void>[] = [];
    for (const { url, elements } of imagesByUrl.values()) {
      copyPromises.push(
        (async () => {
          let image: FetchedRemoteImage;
          try {
            image = await this.fetchImageWithCache(url);
          } catch {
            outcome.referencesLeftRemote += elements.length;
            return;
          }

          const digest = contentDigest(image.content);
          // Content-addressed names deduplicate identical downloads and avoid trusting a remote
          // URL's path as a course filename.
          let filename = filenameByDigest.get(digest);
          if (!filename) {
            if (this.storedImageBytes + image.content.byteLength > MAX_TOTAL_REMOTE_IMAGE_BYTES) {
              outcome.referencesLeftRemote += elements.length;
              return;
            }

            filename = allocateFilename(`remote-${digest}.${image.extension}`, reservedFilenames);
            filenameByDigest.set(digest, filename);
            reservedFilenames.add(filename);
            createdFiles.set(filename, image.content);
            this.storedImageBytes += image.content.byteLength;
          }

          for (const { $image, fragmentIndex } of elements) {
            $image.attr('src', `${QUESTION_ASSET_URL_PREFIX}${filename}`);
            fragments[fragmentIndex].changed = true;
          }
        })(),
      );
    }
    await Promise.all(copyPromises);

    for (const fragment of fragments) {
      if (fragment.changed) fragment.writeBack(fragment.$.html());
    }

    return {
      createdFiles,
      ...outcome,
      filesCreated: createdFiles.size,
    };
  }

  /**
   * Collects the HTML fragments in a question without making assumptions about how an emitter
   * will embed them. This processor only replaces remote image URLs with question-asset URLs;
   * output-specific element rewriting stays in the emitter.
   */
  private collectHtmlFragments(question: IRQuestion): MutableHtmlFragment[] {
    const fragments: MutableHtmlFragment[] = [];
    const addFragment = (html: string, writeBack: (html: string) => void) => {
      fragments.push({ html, writeBack });
    };

    addFragment(question.promptHtml, (html) => {
      question.promptHtml = html;
    });

    const collectHtmlProperties = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collectHtmlProperties);
      } else if (value && typeof value === 'object') {
        for (const [key, property] of Object.entries(value)) {
          if (typeof property === 'string' && (key === 'html' || key.endsWith('Html'))) {
            addFragment(property, (html) => {
              (value as Record<string, unknown>)[key] = html;
            });
          } else {
            collectHtmlProperties(property);
          }
        }
      }
    };
    collectHtmlProperties(question.body);

    const feedback = question.feedback;
    if (feedback) {
      for (const key of ['correct', 'incorrect'] as const) {
        const html = feedback[key];
        if (html) {
          addFragment(html, (html) => {
            feedback[key] = html;
          });
        }
      }
      for (const feedbackById of [feedback.perChoice, feedback.perBlank]) {
        if (!feedbackById) continue;
        for (const [id, html] of feedbackById) {
          addFragment(html, (html) => {
            feedbackById.set(id, html);
          });
        }
      }
    }

    return fragments;
  }

  private async processQuestion(question: IRQuestion): Promise<RemoteImageCopyOutcome> {
    const fragments = this.collectHtmlFragments(question);

    const existingFiles = new Map<string, Buffer>();
    for (const [filename, asset] of question.assets) {
      if (asset.type === 'base64') {
        existingFiles.set(filename, Buffer.from(asset.value, 'base64'));
      }
    }
    const { createdFiles, ...outcome } = await this.copyRemoteImagesInHtmlFragments(fragments, {
      reservedFilenames: new Set(question.assets.keys()),
      existingFiles,
    });
    for (const [filename, content] of createdFiles) {
      question.assets.set(filename, {
        type: 'base64',
        value: content.toString('base64'),
      });
    }
    return outcome;
  }

  async process(itemContainer: IRItemContainer): Promise<ConversionProcessorResult> {
    const outcomes = await Promise.all(
      itemContainer.questions.map((question) => this.processQuestion(question)),
    );
    const reports: NonNullable<ConversionProcessorResult['reports']> = [];
    const warnings: NonNullable<ConversionProcessorResult['warnings']> = [];

    for (const [index, outcome] of outcomes.entries()) {
      const question = itemContainer.questions[index];
      if (outcome.filesCreated > 0) {
        reports.push({
          type: 'remote-image-copy',
          questionId: question.sourceId,
          filesCreated: outcome.filesCreated,
        });
      }
      if (outcome.referencesLeftRemote === 0) continue;

      const referenceCount = outcome.referencesLeftRemote;
      const cause =
        referenceCount === 1
          ? 'Its URL may be invalid or insecure, or the image may be unavailable, too large, or in an unsupported format.'
          : 'Their URLs may be invalid or insecure, or the images may be unavailable, too large, or in an unsupported format.';
      warnings.push({
        questionId: question.sourceId,
        code: 'remote-image-copy-failed',
        message: `${referenceCount} image${referenceCount === 1 ? '' : 's'} could not be copied into the course and ${referenceCount === 1 ? 'was' : 'were'} left unchanged. ${cause}`,
      });
    }

    return { reports, warnings };
  }
}

function isRemoteImageReference(source: string): boolean {
  return /^(?:https?:)?\/\/|^:\/\//i.test(source.trim());
}

function contentDigest(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
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
    fetch = publicFetch,
    consumeBytes,
  }: {
    fetch?: PublicFetch;
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

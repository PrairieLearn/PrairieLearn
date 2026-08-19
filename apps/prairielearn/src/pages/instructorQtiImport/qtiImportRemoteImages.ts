import crypto from 'node:crypto';

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { fileTypeFromBuffer } from 'file-type';

import {
  type ResolveAddress,
  createPublicFetch,
  publicFetch,
  validatePublicHttpUrl,
} from '@prairielearn/public-fetch';

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

interface RemoteImageCopyResult {
  html: string;
  files: Map<string, Buffer>;
  remoteImagesCopied: number;
  failedImageCount: number;
}

type ConsumeBytes = (byteLength: number) => void;
type FetchRemoteImage = (url: URL, consumeBytes: ConsumeBytes) => Promise<FetchedRemoteImage>;

/**
 * Copies remote images across one complete QTI upload while enforcing import-wide limits.
 * A single instance must be shared by every converted entry in the upload.
 */
export class QtiImportRemoteImageCopier {
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
    }
    this.activeRequestCount += 1;
    try {
      return await request();
    } finally {
      this.activeRequestCount -= 1;
      this.requestQueue.shift()?.();
    }
  }

  async copyRemoteImages(
    html: string,
    existingFilenames: Set<string>,
  ): Promise<RemoteImageCopyResult> {
    const $ = cheerio.load(html, null, false);
    const imagesByUrl = new Map<string, { url: URL; elements: cheerio.Cheerio<Element>[] }>();

    $('img[src]').each((_, element) => {
      const source = $(element).attr('src');
      if (!source) return;
      const url = parseRemoteImageUrl(source);
      if (!url) return;

      const existing = imagesByUrl.get(url.href);
      if (existing) {
        existing.elements.push($(element));
      } else {
        imagesByUrl.set(url.href, { url, elements: [$(element)] });
      }
    });

    const files = new Map<string, Buffer>();
    const filenameByDigest = new Map<string, string>();
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

          const digest = crypto
            .createHash('sha256')
            .update(image.content)
            .digest('hex')
            .slice(0, 16);
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

          for (const $image of elements) {
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
          remoteImagesCopied += 1;
        })(),
      );
    }
    await Promise.all(copyPromises);

    return {
      html: remoteImagesCopied > 0 ? $.html() : html,
      files,
      remoteImagesCopied,
      failedImageCount,
    };
  }
}

function parseRemoteImageUrl(source: string): URL | null {
  try {
    const trimmedSource = source.trim();
    const url = trimmedSource.startsWith('//')
      ? new URL(`https:${trimmedSource}`)
      : new URL(trimmedSource);
    validatePublicHttpUrl(url);
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
    consumeBytes,
  }: {
    resolveAddress?: ResolveAddress;
    consumeBytes?: ConsumeBytes;
  } = {},
): Promise<FetchedRemoteImage> {
  const fetch = resolveAddress ? createPublicFetch({ resolveAddress }) : publicFetch;
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

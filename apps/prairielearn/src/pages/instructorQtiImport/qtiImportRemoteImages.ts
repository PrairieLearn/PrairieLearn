import crypto from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { fileTypeFromBuffer } from 'file-type';
import ipaddr from 'ipaddr.js';

const MAX_REMOTE_IMAGE_COUNT = 100;
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_REMOTE_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_REQUESTS = 5;

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

interface RemoteImageLocalizationResult {
  html: string;
  files: Map<string, Buffer>;
  localizedImageCount: number;
  failedImageCount: number;
}

type ConsumeBytes = (byteLength: number) => void;
type FetchRemoteImage = (url: URL, consumeBytes: ConsumeBytes) => Promise<FetchedRemoteImage>;

/**
 * Localizes remote images across one complete QTI upload while enforcing import-wide limits.
 * A single instance must be shared by every converted entry in the upload.
 */
export class QtiImportRemoteImageLocalizer {
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
        throw new Error('QTI import contains too many remote images');
      }
      this.attemptedImageCount += 1;

      promise = this.scheduleRequest(async () => {
        if (this.downloadedImageBytes >= MAX_TOTAL_REMOTE_IMAGE_BYTES) {
          throw new Error('QTI import remote images exceed the total size limit');
        }
        // Count bytes while streaming so invalid image payloads consume the same import-wide
        // budget as valid ones.
        return this.fetchImage(url, (byteLength) => {
          this.downloadedImageBytes += byteLength;
          if (this.downloadedImageBytes > MAX_TOTAL_REMOTE_IMAGE_BYTES) {
            throw new Error('QTI import remote images exceed the total size limit');
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

  async localizeQuestionHtml(
    html: string,
    existingFilenames: Set<string>,
  ): Promise<RemoteImageLocalizationResult> {
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
    let localizedImageCount = 0;
    let failedImageCount = 0;

    const localizationPromises: Promise<void>[] = [];
    for (const { url, elements } of imagesByUrl.values()) {
      localizationPromises.push(
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

            const alt = $image.attr('alt');
            const width = $image.attr('width');
            if (alt) $figure.attr('alt', alt);
            if (width) $figure.attr('width', width);
            $image.replaceWith($figure);
          }
          localizedImageCount += 1;
        })(),
      );
    }
    await Promise.all(localizationPromises);

    return {
      html: localizedImageCount > 0 ? $.html() : html,
      files,
      localizedImageCount,
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
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
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

export function isPublicIpAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export async function fetchRemoteImage(
  initialUrl: URL,
  {
    resolveAddress = resolvePublicAddress,
    consumeBytes,
  }: {
    resolveAddress?: (hostname: string, deadline: number) => Promise<string>;
    consumeBytes?: ConsumeBytes;
  } = {},
): Promise<FetchedRemoteImage> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let url = initialUrl;

  for (let redirectCount = 0; ; redirectCount += 1) {
    validateRemoteImageUrl(url);
    const address = await resolveAddress(url.hostname, deadline);
    const response = await requestUrl(url, address, deadline);

    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location;
      response.destroy();
      if (!location || redirectCount >= MAX_REDIRECTS) {
        throw new Error('Remote image exceeded the redirect limit');
      }
      url = new URL(location, url);
      continue;
    }

    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error('Remote image returned an unsuccessful response');
    }

    const declaredContentType = normalizeContentType(response.headers['content-type']);
    if (!declaredContentType || !SUPPORTED_IMAGE_TYPES.has(declaredContentType)) {
      response.destroy();
      throw new Error('Remote image has an unsupported content type');
    }

    const contentLength = Number(response.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
      response.destroy();
      throw new Error('Remote image is too large');
    }

    const chunks: Buffer[] = [];
    let byteLength = 0;
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      try {
        consumeBytes?.(buffer.byteLength);
      } catch (error) {
        response.destroy();
        throw error;
      }
      if (byteLength > MAX_REMOTE_IMAGE_BYTES) {
        response.destroy();
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
}

function validateRemoteImageUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Remote image URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Remote image URL must not contain credentials');
  }
}

async function resolvePublicAddress(hostname: string, deadline: number): Promise<string> {
  const unwrappedHostname = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  const addresses = isIP(unwrappedHostname)
    ? [{ address: unwrappedHostname }]
    : await withDeadline(dnsLookup(unwrappedHostname, { all: true, verbatim: true }), deadline);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Remote image host did not resolve to a public address');
  }
  return addresses[0].address;
}

function requestUrl(url: URL, address: string, deadline: number): Promise<http.IncomingMessage> {
  const transport = url.protocol === 'https:' ? https : http;
  const originalHostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const timeout = Math.max(1, deadline - Date.now());

  return new Promise((resolve, reject) => {
    function clearRequestTimeout() {
      clearTimeout(timeoutId);
    }
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: address,
        port: url.port || undefined,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: ACCEPTED_IMAGE_CONTENT_TYPES,
          Connection: 'close',
          Host: url.host,
        },
        agent: false,
        ...(url.protocol === 'https:' &&
          !isIP(originalHostname) && { servername: originalHostname }),
      },
      (response) => {
        response.once('end', clearRequestTimeout);
        response.once('close', clearRequestTimeout);
        resolve(response);
      },
    );
    const timeoutId = setTimeout(() => {
      request.destroy(new Error('Remote image request timed out'));
    }, timeout);
    request.once('error', (error) => {
      clearRequestTimeout();
      reject(error);
    });
    request.end();
  });
}

async function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const timeout = Math.max(1, deadline - Date.now());
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Remote image request timed out')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeContentType(value: string | undefined): string | null {
  if (!value) return null;
  const contentType = value.split(';', 1)[0].trim().toLowerCase();
  return contentType === 'image/jpg' ? 'image/jpeg' : contentType;
}

import crypto from 'node:crypto';

import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { fileTypeFromBuffer } from 'file-type';
import he from 'he';

import { type PublicFetch, publicFetch, validatePublicHttpsUrl } from '@prairielearn/public-fetch';

import type { ConversionProcessor, ConversionResult } from './emitters/emitter.js';
import { deduplicateChoices } from './emitters/pl-emit-utils.js';
import type { IRItemContainer, IRQuestion } from './types/ir.js';
import type { PLQuestionOutput } from './types/pl-output.js';
import {
  CLIENT_FILES_QUESTION_URL,
  loadHtmlFragmentPreservingEntities,
  rewriteImagesAsPlFigure,
} from './utils/html.js';

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
type ImageOutputElement = 'pl-figure' | 'img';

interface CopyRemoteImagesOptions {
  reservedFilenames: Set<string>;
  existingFiles: ReadonlyMap<string, Buffer | string>;
  outputElement: ImageOutputElement;
}

interface RemoteImageCopyOutcome {
  filesCreated: number;
  referencesLeftRemote: number;
}

function emptyRemoteImageCopyOutcome(): RemoteImageCopyOutcome {
  return {
    filesCreated: 0,
    referencesLeftRemote: 0,
  };
}

function combineRemoteImageCopyOutcomes(
  ...outcomes: readonly RemoteImageCopyOutcome[]
): RemoteImageCopyOutcome {
  return outcomes.reduce<RemoteImageCopyOutcome>(
    (combined, outcome) => ({
      filesCreated: combined.filesCreated + outcome.filesCreated,
      referencesLeftRemote: combined.referencesLeftRemote + outcome.referencesLeftRemote,
    }),
    emptyRemoteImageCopyOutcome(),
  );
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
  private readonly feedbackAttributeOutcomesByItemContainer = new WeakMap<
    IRItemContainer,
    Map<string, RemoteImageCopyOutcome>
  >();

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

  private async copyRemoteImagesInHtml(html: string, options: CopyRemoteImagesOptions) {
    const { rewrittenHtmlFragments, ...result } = await this.copyRemoteImagesInHtmlFragments(
      [html],
      options,
    );
    return { ...result, rewrittenHtml: rewrittenHtmlFragments[0] };
  }

  /**
   * Copies remote images across a batch of HTML fragments and returns the rewritten fragments in
   * the same order. Processing them together deduplicates images shared by multiple fragments.
   */
  private async copyRemoteImagesInHtmlFragments(
    htmlFragments: readonly string[],
    { reservedFilenames, existingFiles, outputElement }: CopyRemoteImagesOptions,
  ) {
    const fragments = htmlFragments.map((originalHtml) => ({
      originalHtml,
      $: loadHtmlFragmentPreservingEntities(originalHtml),
      changed: false,
    }));
    const imagesByUrl = new Map<
      string,
      {
        url: URL;
        elements: { $image: cheerio.Cheerio<Element>; fragmentIndex: number }[];
      }
    >();
    const outcome = emptyRemoteImageCopyOutcome();

    for (const [fragmentIndex, fragment] of fragments.entries()) {
      fragment.$('img[src]').each((_, element) => {
        const $image = fragment.$(element);
        const source = he.decode($image.attr('src') ?? '');
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
            $image.attr('src', `${CLIENT_FILES_QUESTION_URL}/${filename}`);
            fragments[fragmentIndex].changed = true;
          }
        })(),
      );
    }
    await Promise.all(copyPromises);

    return {
      rewrittenHtmlFragments: fragments.map((fragment) => {
        if (!fragment.changed) return fragment.originalHtml;
        const rewrittenHtml = fragment.$.html();
        const rewrittenOutputHtml =
          outputElement === 'pl-figure'
            ? rewriteImagesAsPlFigure(rewrittenHtml, { display: 'inline' })
            : rewrittenHtml;
        return rewrittenOutputHtml;
      }),
      createdFiles,
      ...outcome,
      filesCreated: createdFiles.size,
    };
  }

  /**
   * Copies remote images from emitted question HTML into its client files. Running after emission
   * covers the prompt, answer choices, and any other HTML produced by a body handler.
   */
  private async copyRemoteImagesInQuestionHtml(
    question: PLQuestionOutput,
  ): Promise<RemoteImageCopyOutcome> {
    const { createdFiles, rewrittenHtml, ...outcome } = await this.copyRemoteImagesInHtml(
      question.questionHtml,
      {
        reservedFilenames: new Set(question.clientFiles.keys()),
        existingFiles: question.clientFiles,
        outputElement: 'pl-figure',
      },
    );
    question.questionHtml = rewrittenHtml;
    for (const [filename, content] of createdFiles) {
      question.clientFiles.set(filename, content);
    }
    return outcome;
  }

  /**
   * Copies remote images in feedback that the emitter serializes inside HTML attributes.
   *
   * Static answer-panel feedback is copied from the emitted question HTML. Multiple-choice
   * per-answer feedback must instead be rewritten in the IR because it is escaped inside a
   * `feedback` attribute, where the emitted-HTML pass cannot inspect it as nested markup.
   */
  private async copyRemoteImagesInFeedbackAttributes(
    question: IRQuestion,
  ): Promise<RemoteImageCopyOutcome> {
    const perAnswer = question.feedback?.perAnswer;
    if (
      question.body.type !== 'multiple-choice' ||
      question.body.display === 'dropdown' ||
      !perAnswer
    ) {
      return emptyRemoteImageCopyOutcome();
    }

    const choices = deduplicateChoices(question.body.choices);
    if (!choices.some((choice) => choice.correct)) return emptyRemoteImageCopyOutcome();

    const fragments: { html: string; writeBack: (rewrittenHtml: string) => void }[] = [];
    const addFragment = (html: string, writeBack: (rewrittenHtml: string) => void) => {
      fragments.push({ html, writeBack });
    };
    for (const choice of choices) {
      const feedbackHtml = perAnswer[choice.html];
      if (!feedbackHtml) continue;
      addFragment(feedbackHtml, (value) => {
        perAnswer[choice.html] = value;
      });
    }
    if (fragments.length === 0) return emptyRemoteImageCopyOutcome();

    const existingFiles = new Map<string, Buffer>();
    for (const [filename, asset] of question.assets) {
      if (asset.type === 'base64') {
        existingFiles.set(filename, Buffer.from(asset.value, 'base64'));
      }
    }
    const { createdFiles, rewrittenHtmlFragments, ...outcome } =
      await this.copyRemoteImagesInHtmlFragments(
        fragments.map((fragment) => fragment.html),
        {
          reservedFilenames: new Set(question.assets.keys()),
          existingFiles,
          // This markup is emitted inside an element attribute, so it must remain ordinary HTML
          // rather than being converted to a nested PrairieLearn element.
          outputElement: 'img',
        },
      );
    for (const [filename, content] of createdFiles) {
      question.assets.set(filename, {
        type: 'base64',
        value: content.toString('base64'),
      });
    }
    rewrittenHtmlFragments.forEach((rewrittenHtml, index) => {
      fragments[index].writeBack(rewrittenHtml);
    });

    return outcome;
  }

  async beforeEmit(itemContainer: IRItemContainer): Promise<void> {
    const outcomes = new Map<string, RemoteImageCopyOutcome>();
    this.feedbackAttributeOutcomesByItemContainer.set(itemContainer, outcomes);
    await Promise.all(
      itemContainer.questions.map(async (question) => {
        outcomes.set(question.sourceId, await this.copyRemoteImagesInFeedbackAttributes(question));
      }),
    );
  }

  async afterEmit(result: ConversionResult, itemContainer: IRItemContainer): Promise<void> {
    const feedbackAttributeOutcomes =
      this.feedbackAttributeOutcomesByItemContainer.get(itemContainer) ?? new Map();
    const questionHtmlOutcomes = await Promise.all(
      result.questions.map((question) => this.copyRemoteImagesInQuestionHtml(question)),
    );

    for (const [index, questionHtmlOutcome] of questionHtmlOutcomes.entries()) {
      const question = result.questions[index];
      const outcome = combineRemoteImageCopyOutcomes(
        feedbackAttributeOutcomes.get(question.sourceId) ?? emptyRemoteImageCopyOutcome(),
        questionHtmlOutcome,
      );
      if (outcome.filesCreated > 0) {
        result.reports.push({
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
      result.warnings.push({
        questionId: question.sourceId,
        code: 'remote-image-copy-failed',
        message: `${referenceCount} image${referenceCount === 1 ? '' : 's'} could not be copied into the course and ${referenceCount === 1 ? 'was' : 'were'} left unchanged. ${cause}`,
      });
    }
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

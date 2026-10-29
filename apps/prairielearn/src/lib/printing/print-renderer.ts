import * as https from 'node:https';

import { type Browser, type BrowserContext, chromium } from 'playwright';

import { ValueType, getCounter, getHistogram, metrics } from '@prairielearn/opentelemetry';

import { config } from '../config.js';

import { createPdfOutput } from './pdf-output.js';
import {
  PRINT_ASSET_TOKEN_HEADER,
  type PrintAssetScope,
  beginPrintAssetAccess,
  classifyPrintAssetPath,
} from './print-asset-access.js';
import type { PrintablePageOutput } from './printable-page-output.js';
import { RenderQueue } from './render-queue.js';

const QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE = 'question-block-size-overflow';

export class QuestionBlockSizeOverflowError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuestionBlockSizeOverflowError';
  }
}

const DEFAULT_RENDER_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_QUEUED_RENDERS = 50;
const DEFAULT_CLOUDFLARE_MAX_QUEUED_RENDERS = 50;
const DEFAULT_CLOUDFLARE_CONCURRENT_RENDERS = 4;
const CLOUDFLARE_KEEP_ALIVE_MS = 180_000;
const DEFAULT_CONTEXT_CLOSE_GRACE_MS = 5_000;
const SOCKET_IO_PATH = '/socket.io/';

async function fetchCloudflareAsset(url: URL, signal: AbortSignal, assetToken?: string) {
  const headers = assetToken ? { [PRINT_ASSET_TOKEN_HEADER]: assetToken } : undefined;
  if (url.protocol === 'https:' && url.hostname === 'localhost') {
    // The local development server can use a certificate that Node does not trust. This
    // exception applies only to requests back to the same machine, never to public hosts.
    return await new Promise<{ status: number; contentType: string; body: Buffer }>(
      (resolve, reject) => {
        https
          .get(
            url,
            {
              headers,
              rejectUnauthorized: false,
              signal,
            },
            async (response) => {
              try {
                const chunks: Buffer[] = [];
                for await (const chunk of response) chunks.push(Buffer.from(chunk));
                resolve({
                  status: response.statusCode ?? 502,
                  contentType: response.headers['content-type'] ?? 'application/octet-stream',
                  body: Buffer.concat(chunks),
                });
              } catch (error) {
                reject(error);
              }
            },
          )
          .on('error', reject);
      },
    );
  }
  const response = await fetch(url, {
    headers,
    redirect: 'manual',
    signal,
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    body: Buffer.from(await response.arrayBuffer()),
  };
}

function urlAtOrigin(url: URL, origin: string): URL {
  const result = new URL(origin);
  // Assign the path separately so a leading // cannot replace the intended host.
  result.pathname = url.pathname;
  result.search = url.search;
  return result;
}

export interface PrintRendererOptions {
  /** Cloudflare Browser Run credentials. */
  cloudflare?: { accountId: string; apiToken: string };
  /** Renders that would wait behind more than this many others fail immediately. */
  maxQueuedRenders?: number;
  /** Independent browser contexts that may render at once. */
  maxConcurrentRenders?: number;
  /** Default end-to-end deadline for one render, including its time in the queue. */
  timeoutMs?: number;
  /** How long a browser context may take to close before the whole browser is discarded. */
  contextCloseGraceMs?: number;
}

export interface RenderPageOptions {
  /**
   * Page URL on the local application server. Cloudflare uses a separate navigation origin,
   * but protected assets are fetched from this URL's origin, including in production.
   */
  url: string;
  /** Browser page origin, required with Cloudflare and ignored by local Chromium. */
  browserOrigin?: string;
  /** Browser-paginated HTML to serve at `url`. */
  html: string;
  /** Restricts browser requests and grants short-lived access to required assets. */
  assetScope?: PrintAssetScope;
  /** Execute question scripts while preparing a new preview. */
  runScripts?: boolean;
  /** Overrides the renderer's default deadline. `0` disables the deadline. */
  timeoutMs?: number;
  /** Cancels queued work and closes any browser context already rendering this page. */
  signal?: AbortSignal;
}

export type RenderPdfOptions = RenderPageOptions;
type ActiveRenderPageOptions = RenderPageOptions & {
  assetAccess?: { token: string; scope: PrintAssetScope };
};

/**
 * Reuses one browser connection with a bounded number of isolated rendering contexts. The browser
 * is opened on first use, reopened after a disconnect, and closed during shutdown.
 */
export class PrintRenderer {
  private readonly cloudflare: PrintRendererOptions['cloudflare'];
  private readonly defaultTimeoutMs: number;
  private readonly contextCloseGraceMs: number;
  private readonly worker: RenderQueue;
  private browserPromise: Promise<Browser> | null = null;
  private browser: Browser | null = null;
  private closed = false;

  constructor({
    cloudflare,
    maxQueuedRenders,
    maxConcurrentRenders,
    timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
    contextCloseGraceMs = DEFAULT_CONTEXT_CLOSE_GRACE_MS,
  }: PrintRendererOptions = {}) {
    this.cloudflare = cloudflare;
    this.defaultTimeoutMs = timeoutMs;
    this.contextCloseGraceMs = contextCloseGraceMs;
    const waitingLimit =
      maxQueuedRenders ??
      (cloudflare ? DEFAULT_CLOUDFLARE_MAX_QUEUED_RENDERS : DEFAULT_MAX_QUEUED_RENDERS);
    this.worker = new RenderQueue(
      maxConcurrentRenders ?? (cloudflare ? DEFAULT_CLOUDFLARE_CONCURRENT_RENDERS : 1),
      waitingLimit,
      Math.floor(waitingLimit / 4),
    );
  }

  getLoad() {
    return this.worker.getLoad();
  }

  renderPdf(options: RenderPdfOptions): Promise<Buffer> {
    return this.render(options, createPdfOutput());
  }

  render<T>(options: RenderPageOptions, output: PrintablePageOutput<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The print renderer has been closed'));
    const access = options.assetScope
      ? beginPrintAssetAccess(options.assetScope, config.secretKey)
      : null;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const kind = output.label === 'preview' ? 'preview' : 'export';
    const meter = metrics.getMeter('prairielearn');
    const queueWait = getHistogram(meter, 'print.render.queue_wait', {
      unit: 'milliseconds',
      valueType: ValueType.DOUBLE,
    });
    const duration = getHistogram(meter, 'print.render.duration', {
      unit: 'milliseconds',
      valueType: ValueType.DOUBLE,
    });
    const failures = getCounter(meter, 'print.render.failures', { valueType: ValueType.INT });
    const load = this.worker.getLoad();
    getHistogram(meter, 'print.render.waiting', { valueType: ValueType.INT }).record(load.waiting, {
      kind,
    });
    getHistogram(meter, 'print.render.active', { valueType: ValueType.INT }).record(load.active, {
      kind,
    });
    const startedAt = performance.now();
    let acquiredAt: number | null = null;
    return this.worker
      .run(
        (queueWaitMs) => {
          acquiredAt = performance.now();
          queueWait.record(queueWaitMs, { kind });
          if (this.closed) throw new Error('The print renderer has been closed');
          const remainingTimeoutMs = timeoutMs === 0 ? 0 : Math.max(1, timeoutMs - queueWaitMs);
          return this.renderWithPermit(
            {
              ...options,
              timeoutMs: remainingTimeoutMs,
              ...(access
                ? {
                    assetAccess: {
                      token: access.token,
                      scope: access.scope,
                    },
                  }
                : {}),
            },
            output,
          );
        },
        timeoutMs,
        output.label,
        kind,
        options.signal,
      )
      .catch((error: unknown) => {
        if (acquiredAt === null) queueWait.record(performance.now() - startedAt, { kind });
        failures.add(1, { kind });
        throw error;
      })
      .finally(() => {
        duration.record(performance.now() - startedAt, { kind });
        getHistogram(meter, 'print.render.rss', {
          unit: 'bytes',
          valueType: ValueType.INT,
        }).record(process.memoryUsage().rss, { kind });
      });
  }

  /** Rejects queued renders and closes the browser. Further renders are refused. */
  async close(): Promise<void> {
    this.closed = true;
    this.worker.rejectAll(new Error('The print renderer has been closed'));
    const browserPromise = this.browserPromise;
    this.browserPromise = null;
    this.browser = null;
    const browser = await browserPromise?.catch(() => null);
    await browser?.close();
  }

  private getBrowser(timeoutMs: number): Promise<Browser> {
    if (!this.browserPromise) {
      const browserPromise = this.openBrowser(timeoutMs).then(
        (browser) => {
          this.browser = browser;
          browser.on('disconnected', () => this.forgetBrowser(browser));
          return browser;
        },
        (error: unknown) => {
          if (this.browserPromise === browserPromise) this.browserPromise = null;
          throw error;
        },
      );
      this.browserPromise = browserPromise;
    }
    return this.browserPromise;
  }

  private openBrowser(timeoutMs: number): Promise<Browser> {
    if (this.cloudflare) {
      return chromium.connectOverCDP(
        `wss://api.cloudflare.com/client/v4/accounts/${this.cloudflare.accountId}/browser-run/devtools/browser?keep_alive=${CLOUDFLARE_KEEP_ALIVE_MS}`,
        { headers: { Authorization: `Bearer ${this.cloudflare.apiToken}` }, timeout: timeoutMs },
      );
    }
    return chromium.launch({ headless: true, timeout: timeoutMs });
  }

  private forgetBrowser(browser: Browser): void {
    if (this.browser !== browser) return;
    this.browser = null;
    this.browserPromise = null;
  }

  private discardBrowser(browser: Browser): void {
    this.forgetBrowser(browser);
    void browser.close().catch(() => undefined);
  }

  /** Closes a context, discarding the whole browser if the context does not close promptly. */
  private async discardContext(browser: Browser, context: BrowserContext): Promise<void> {
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([
      // Closing the context cancels pending route.fetch() calls. Their rejections must not
      // escape as unhandled errors after the render has already finished or failed.
      context
        .unrouteAll({ behavior: 'ignoreErrors' })
        .then(() => context.close())
        .then(
          () => true,
          () => false,
        ),
      new Promise<boolean>((resolve) => {
        graceTimer = setTimeout(() => resolve(false), this.contextCloseGraceMs);
      }),
    ]);
    if (graceTimer) clearTimeout(graceTimer);
    if (!closed) this.discardBrowser(browser);
  }

  private async renderWithPermit<T>(
    {
      url,
      browserOrigin,
      html,
      assetAccess,
      runScripts = false,
      timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
      signal: requestSignal,
    }: ActiveRenderPageOptions,
    output: PrintablePageOutput<T>,
  ): Promise<T> {
    requestSignal?.throwIfAborted();
    const deadline = timeoutMs === 0 ? null : Date.now() + timeoutMs;
    const remainingTimeoutMs = () => (deadline === null ? 0 : Math.max(1, deadline - Date.now()));
    const localUrl = new URL(url);
    let navigationUrl = localUrl.href;
    if (this.cloudflare) {
      if (!browserOrigin) {
        throw new Error('browserOrigin is required for Cloudflare print rendering');
      }
      navigationUrl = urlAtOrigin(localUrl, browserOrigin).href;
    }
    const renderOrigin = new URL(navigationUrl).origin;
    const deadlineController = new AbortController();
    const signal = requestSignal
      ? AbortSignal.any([requestSignal, deadlineController.signal])
      : deadlineController.signal;
    let onAbort!: () => void;
    const canceled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const deadlineTimer =
      deadline === null
        ? undefined
        : setTimeout(
            () =>
              deadlineController.abort(
                new Error(`Timed out after ${timeoutMs} ms rendering the ${output.label}`),
              ),
            remainingTimeoutMs(),
          );
    const clearDeadline = () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      signal.removeEventListener('abort', onAbort);
    };
    const browser = await Promise.race([this.getBrowser(remainingTimeoutMs()), canceled])
      .then((browser) => {
        signal.throwIfAborted();
        return browser;
      })
      .catch((error: unknown) => {
        // Other renders may still be waiting for this shared browser connection.
        clearDeadline();
        throw error;
      });

    const state: { context: BrowserContext | null; outputPromise?: Promise<T> } = {
      context: null,
    };
    const assetController = new AbortController();

    const render = async () => {
      signal.throwIfAborted();
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        javaScriptEnabled: runScripts,
        ...(output.deviceScaleFactor ? { deviceScaleFactor: output.deviceScaleFactor } : {}),
      });
      if (signal.aborted) {
        await this.discardContext(browser, context);
        signal.throwIfAborted();
      }
      state.context = context;

      // Only required same-origin assets may be loaded. Realtime traffic is refused
      // outright: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling,
      // and a handful of open polls can occupy every HTTP/1.1 connection to the server and starve
      // the page's own script and image loads.
      await context.route('**/*', async (route) => {
        try {
          const request = route.request();
          const requestUrl = new URL(request.url());
          if (requestUrl.href === navigationUrl && request.isNavigationRequest()) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: html });
            return;
          }
          const assetRoute = classifyPrintAssetPath(
            requestUrl.pathname,
            assetAccess?.scope ?? null,
            config.assetsPrefix,
          );
          if (
            request.method() !== 'GET' ||
            requestUrl.origin !== renderOrigin ||
            requestUrl.pathname.startsWith(SOCKET_IO_PATH) ||
            !assetRoute
          ) {
            await route.abort('blockedbyclient');
            return;
          }
          // Public app assets need no session, so Cloudflare can fetch them directly.
          const isAppAsset = requestUrl.pathname.startsWith(`${config.assetsPrefix}/`);
          if (this.cloudflare && !config.devMode && isAppAsset) {
            await route.continue();
            return;
          }
          // Playwright only routes the first request in a redirect chain, so proxied requests
          // cannot follow redirects without potentially leaving the allowed origin.
          const assetToken = isAppAsset ? undefined : assetAccess?.token;
          if (this.cloudflare) {
            const assetUrl = urlAtOrigin(requestUrl, localUrl.origin);
            const response = await fetchCloudflareAsset(
              assetUrl,
              assetController.signal,
              assetToken,
            );
            if (response.status >= 300 && response.status < 400) {
              await route.abort('blockedbyclient');
              return;
            }
            await route.fulfill({
              status: response.status,
              contentType: response.contentType,
              body: response.body,
            });
          } else {
            const response = await route.fetch({
              maxRedirects: 0,
              ...(assetToken ? { headers: { [PRINT_ASSET_TOKEN_HEADER]: assetToken } } : {}),
            });
            if (response.status() >= 300 && response.status() < 400) {
              await route.abort('blockedbyclient');
              return;
            }
            await route.fulfill({ response });
          }
        } catch {
          await route.abort('failed').catch(() => undefined);
        }
      });
      await context.routeWebSocket('**/*', async (webSocket) => {
        await webSocket.close({ code: 1008, reason: 'WebSockets are disabled while printing' });
      });

      const page = await context.newPage();
      await page.emulateMedia({ media: 'screen' });
      const response = await page.goto(navigationUrl, {
        waitUntil: 'load',
        timeout: remainingTimeoutMs(),
      });
      if (response === null) throw new Error('The printable page did not return a response');
      if (!response.ok()) {
        throw new Error(`The printable page returned HTTP ${response.status()}`);
      }

      if (runScripts) {
        await page.waitForFunction(
          () => ['ready', 'error'].includes(document.documentElement.dataset.printStatus ?? ''),
          undefined,
          { timeout: remainingTimeoutMs() },
        );
      }
      const printState = await page.evaluate(() => ({
        status: document.documentElement.dataset.printStatus ?? null,
        error: document.documentElement.dataset.printError ?? null,
        errorCode: document.documentElement.dataset.printErrorCode ?? null,
      }));
      if (printState.status === 'error') {
        const message = `The printable page failed: ${printState.error ?? 'No pagination error was provided'}`;
        if (printState.errorCode === QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE) {
          throw new QuestionBlockSizeOverflowError(message);
        }
        throw new Error(message);
      }
      if (printState.status !== 'ready') {
        throw new Error(`The printable page reported an unexpected status: ${printState.status}`);
      }

      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images, (image) => image.decode().catch(() => undefined)),
        );
      });

      signal.throwIfAborted();
      state.outputPromise = output.produce(page, signal);
      return await state.outputPromise;
    };

    try {
      return await Promise.race([render(), canceled]);
    } finally {
      clearDeadline();
      assetController.abort();
      const openContext = state.context;
      // A context created after cancellation may still be pending, so discard its browser.
      if (signal.aborted && !openContext) this.discardBrowser(browser);
      if (openContext) {
        await this.discardContext(browser, openContext);
      }
      if (signal.aborted) {
        // Closing the context cancels Playwright work, but output generation may already be
        // packing a Word document in Node. Keep the permit until that work actually settles.
        await state.outputPromise?.catch(() => undefined);
      }
    }
  }
}

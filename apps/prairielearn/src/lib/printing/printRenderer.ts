import * as https from 'node:https';

import { type Browser, type BrowserContext, chromium } from 'playwright';

import { createPdfOutput } from './pdfOutput.js';
import type { PrintablePageOutput } from './printablePageOutput.js';

const QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE = 'question-block-size-overflow';

export class QuestionBlockSizeOverflowError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuestionBlockSizeOverflowError';
  }
}

const DEFAULT_RENDER_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_QUEUED_RENDERS = 16;
const DEFAULT_CLOUDFLARE_MAX_QUEUED_RENDERS = 64;
const DEFAULT_CLOUDFLARE_CONCURRENT_RENDERS = 4;
const CLOUDFLARE_KEEP_ALIVE_MS = 180_000;
const DEFAULT_CONTEXT_CLOSE_GRACE_MS = 5_000;
const SOCKET_IO_PATH = '/socket.io/';

interface SemaphoreWaiter {
  queuedAt: number;
  resolve: (queueWaitMs: number) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

class Semaphore {
  private activeCount = 0;
  private readonly waiters: SemaphoreWaiter[] = [];

  constructor(
    private readonly limit: number,
    private readonly maxWaiters: number,
  ) {}

  async run<T>(
    callback: (queueWaitMs: number) => Promise<T>,
    timeoutMs: number,
    outputLabel: string,
  ): Promise<T> {
    const queueWaitMs = await this.acquire(timeoutMs, outputLabel);
    try {
      return await callback(queueWaitMs);
    } finally {
      this.release();
    }
  }

  rejectAll(error: Error): void {
    const waiters = [...this.waiters];
    this.waiters.length = 0;
    for (const waiter of waiters) {
      if (waiter.timeout) clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  private async acquire(timeoutMs: number, outputLabel: string): Promise<number> {
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return 0;
    }

    if (this.waiters.length >= this.maxWaiters) {
      throw new Error('Too many print renders are already waiting');
    }

    return new Promise<number>((resolve, reject) => {
      const waiter: SemaphoreWaiter = { queuedAt: Date.now(), resolve, reject };
      if (timeoutMs > 0) {
        waiter.timeout = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index === -1) return;
          this.waiters.splice(index, 1);
          reject(new Error(`Timed out after ${timeoutMs} ms waiting to render the ${outputLabel}`));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // The active permit is transferred directly to the oldest waiter.
      if (next.timeout) clearTimeout(next.timeout);
      next.resolve(Date.now() - next.queuedAt);
    } else {
      this.activeCount -= 1;
    }
  }
}

async function fetchCloudflareAsset(url: URL, cookieHeader?: string) {
  if (url.protocol === 'https:' && url.hostname === 'localhost') {
    // The local development server can use a certificate that Node does not trust. This
    // exception applies only to requests back to the same machine, never to public hosts.
    return await new Promise<{ status: number; contentType: string; body: Buffer }>(
      (resolve, reject) => {
        https
          .get(
            url,
            {
              headers: cookieHeader ? { cookie: cookieHeader } : undefined,
              rejectUnauthorized: false,
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
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    redirect: 'manual',
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    body: Buffer.from(await response.arrayBuffer()),
  };
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
  url: string;
  /** Public page origin used by Cloudflare; the request itself is intercepted. */
  browserOrigin?: string;
  /** Browser-paginated HTML to serve at `url`. */
  html: string;
  cookieHeader?: string;
  /** Execute question scripts while preparing a new preview. */
  runScripts?: boolean;
  /** Overrides the renderer's default deadline. `0` disables the deadline. */
  timeoutMs?: number;
}

export type RenderPdfOptions = RenderPageOptions;

/**
 * Reuses one browser connection with a bounded number of isolated rendering contexts. The browser
 * is opened on first use, reopened after a disconnect, and closed during shutdown.
 */
export class PrintRenderer {
  private readonly cloudflare: PrintRendererOptions['cloudflare'];
  private readonly defaultTimeoutMs: number;
  private readonly contextCloseGraceMs: number;
  private readonly worker: Semaphore;
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
    this.worker = new Semaphore(
      maxConcurrentRenders ?? (cloudflare ? DEFAULT_CLOUDFLARE_CONCURRENT_RENDERS : 1),
      maxQueuedRenders ??
        (cloudflare ? DEFAULT_CLOUDFLARE_MAX_QUEUED_RENDERS : DEFAULT_MAX_QUEUED_RENDERS),
    );
  }

  renderPdf(options: RenderPdfOptions): Promise<Buffer> {
    return this.render(options, createPdfOutput());
  }

  render<T>(options: RenderPageOptions, output: PrintablePageOutput<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The print renderer has been closed'));
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    return this.worker.run(
      (queueWaitMs) => {
        if (this.closed) throw new Error('The print renderer has been closed');
        const remainingTimeoutMs = timeoutMs === 0 ? 0 : Math.max(1, timeoutMs - queueWaitMs);
        return this.renderWithPermit({ ...options, timeoutMs: remainingTimeoutMs }, output);
      },
      timeoutMs,
      output.label,
    );
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
      cookieHeader,
      runScripts = false,
      timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
    }: RenderPageOptions,
    output: PrintablePageOutput<T>,
  ): Promise<T> {
    const deadline = timeoutMs === 0 ? null : Date.now() + timeoutMs;
    const remainingTimeoutMs = () => (deadline === null ? 0 : Math.max(1, deadline - Date.now()));
    const localUrl = new URL(url);
    const navigationUrl = this.cloudflare
      ? new URL(`${localUrl.pathname}${localUrl.search}`, browserOrigin ?? 'https://example.com')
          .href
      : url;
    const renderOrigin = new URL(navigationUrl).origin;
    const browser = await this.getBrowser(remainingTimeoutMs());

    const state: { context: BrowserContext | null; timedOut: boolean } = {
      context: null,
      timedOut: false,
    };
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const render = async () => {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        javaScriptEnabled: runScripts,
        ...(output.deviceScaleFactor ? { deviceScaleFactor: output.deviceScaleFactor } : {}),
        ...(!this.cloudflare && cookieHeader ? { extraHTTPHeaders: { cookie: cookieHeader } } : {}),
      });
      state.context = context;

      // Only same-origin GET requests may use the forwarded cookie. Realtime traffic is refused
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
          if (
            request.method() !== 'GET' ||
            requestUrl.origin !== renderOrigin ||
            requestUrl.pathname.startsWith(SOCKET_IO_PATH)
          ) {
            await route.abort('blockedbyclient');
            return;
          }
          // Playwright only routes the first request in a redirect chain, so a redirect could
          // otherwise leave the allowed origin without passing through these checks again.
          if (this.cloudflare) {
            const assetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, localUrl.origin);
            const response = await fetchCloudflareAsset(assetUrl, cookieHeader);
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
            const response = await route.fetch({ maxRedirects: 0 });
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
        await Promise.all(Array.from(document.images, (image) => image.decode()));
      });

      return await output.produce(page);
    };

    try {
      if (deadline === null) return await render();
      const deadlineExpired = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => {
          state.timedOut = true;
          reject(new Error(`Timed out after ${timeoutMs} ms rendering the ${output.label}`));
        }, remainingTimeoutMs());
      });
      return await Promise.race([render(), deadlineExpired]);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      const openContext = state.context;
      // A context created after the deadline may still be pending, so discard its browser.
      if (state.timedOut && !openContext) this.discardBrowser(browser);
      if (openContext) {
        await this.discardContext(browser, openContext);
      }
    }
  }
}

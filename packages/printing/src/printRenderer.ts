import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';

import { type DocxOutputOptions, createDocxOutput } from './docxOutput.js';
import type { PageCodeOptions } from './pageCode.js';
import { createPdfOutput } from './pdfOutput.js';

const QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE = 'question-block-size-overflow';

export class QuestionBlockSizeOverflowError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuestionBlockSizeOverflowError';
  }
}

const DEFAULT_RENDER_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_QUEUED_RENDERS = 16;
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

export interface PrintRendererOptions {
  /**
   * A Playwright browser server to connect to instead of launching Chromium locally. The server
   * and package Playwright versions must match.
   */
  browserWSEndpoint?: string;
  /** Renders that would wait behind more than this many others fail immediately. */
  maxQueuedRenders?: number;
  /** Default end-to-end deadline for one render, including its time in the queue. */
  timeoutMs?: number;
  /** How long a browser context may take to close before the whole browser is discarded. */
  contextCloseGraceMs?: number;
}

export interface RenderPageOptions {
  url: string;
  cookieHeader?: string;
  /** Overrides the renderer's default deadline. `0` disables the deadline. */
  timeoutMs?: number;
}

export type RenderPdfOptions = RenderPageOptions & { pageCode?: PageCodeOptions };
export type RenderDocxOptions = RenderPageOptions & DocxOutputOptions;

export interface PrintablePageOutput<T> {
  /** Names the output in timeout messages, for example `PDF`. */
  label: string;
  /** Device pixel ratio of the rendering context. Element screenshots scale with it. */
  deviceScaleFactor?: number;
  /** Installs output-specific capture hooks before navigating to the printable page. */
  prepare?: (page: Page) => Promise<void>;
  /** Produces the output from a page whose pagination has reported `ready`. */
  produce: (page: Page) => Promise<T>;
}

/**
 * Renders printable pages with a single, long-lived Chromium. Renders run one at a time so that a
 * burst of print requests never multiplies browser memory; each render gets its own short-lived
 * browser context for cookie isolation. The browser is launched on first use, relaunched after a
 * crash or disconnect, and closed by `close()` during shutdown.
 */
export class PrintRenderer {
  private readonly browserWSEndpoint: string | undefined;
  private readonly defaultTimeoutMs: number;
  private readonly contextCloseGraceMs: number;
  private readonly worker: Semaphore;
  private browserPromise: Promise<Browser> | null = null;
  private browser: Browser | null = null;
  private closed = false;

  constructor({
    browserWSEndpoint,
    maxQueuedRenders = DEFAULT_MAX_QUEUED_RENDERS,
    timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
    contextCloseGraceMs = DEFAULT_CONTEXT_CLOSE_GRACE_MS,
  }: PrintRendererOptions = {}) {
    this.browserWSEndpoint = browserWSEndpoint;
    this.defaultTimeoutMs = timeoutMs;
    this.contextCloseGraceMs = contextCloseGraceMs;
    this.worker = new Semaphore(1, maxQueuedRenders);
  }

  renderPdf(options: RenderPdfOptions): Promise<Buffer> {
    return this.render(options, createPdfOutput(options.pageCode));
  }

  renderDocx({ cover, footerLabel, ...options }: RenderDocxOptions): Promise<Buffer> {
    return this.render(options, createDocxOutput({ cover, footerLabel }));
  }

  render<T>(options: RenderPageOptions, output: PrintablePageOutput<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The print renderer has been closed'));
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    return this.worker.run(
      (queueWaitMs) => {
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
    return this.browserWSEndpoint
      ? chromium.connect(this.browserWSEndpoint, {
          exposeNetwork: '<loopback>',
          timeout: timeoutMs,
        })
      : chromium.launch({ headless: true, timeout: timeoutMs });
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
    const closedInTime = await Promise.race([
      context.close().then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        graceTimer = setTimeout(() => resolve(false), this.contextCloseGraceMs);
      }),
    ]);
    if (graceTimer) clearTimeout(graceTimer);
    if (!closedInTime) this.discardBrowser(browser);
  }

  private async renderWithPermit<T>(
    { url, cookieHeader, timeoutMs = DEFAULT_RENDER_TIMEOUT_MS }: RenderPageOptions,
    output: PrintablePageOutput<T>,
  ): Promise<T> {
    const deadline = timeoutMs === 0 ? null : Date.now() + timeoutMs;
    const remainingTimeoutMs = () => (deadline === null ? 0 : Math.max(1, deadline - Date.now()));
    const renderOrigin = new URL(url).origin;
    const browser = await this.getBrowser(remainingTimeoutMs());

    let context: BrowserContext | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    const render = async () => {
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        ...(output.deviceScaleFactor ? { deviceScaleFactor: output.deviceScaleFactor } : {}),
        ...(cookieHeader ? { extraHTTPHeaders: { cookie: cookieHeader } } : {}),
      });

      // Only same-origin GET requests may use the forwarded cookie. Realtime traffic is refused
      // outright: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling,
      // and a handful of open polls can occupy every HTTP/1.1 connection to the server and starve
      // the page's own script and image loads.
      await context.route('**/*', async (route) => {
        const request = route.request();
        const requestUrl = new URL(request.url());
        if (
          request.method() !== 'GET' ||
          requestUrl.origin !== renderOrigin ||
          requestUrl.pathname.startsWith(SOCKET_IO_PATH)
        ) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
      await context.routeWebSocket('**/*', async (webSocket) => {
        await webSocket.close({ code: 1008, reason: 'WebSockets are disabled while printing' });
      });

      const page = await context.newPage();
      await output.prepare?.(page);
      await page.emulateMedia({ media: 'screen' });
      const response = await page.goto(url, {
        waitUntil: 'load',
        timeout: remainingTimeoutMs(),
      });
      if (response === null) throw new Error('The printable page did not return a response');
      if (!response.ok()) {
        throw new Error(`The printable page returned HTTP ${response.status()}`);
      }

      await page.waitForFunction(
        () => {
          const status = document.documentElement.dataset.printStatus;
          return status === 'ready' || status === 'error';
        },
        undefined,
        { timeout: remainingTimeoutMs() },
      );
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

      return await output.produce(page);
    };

    try {
      if (deadline === null) return await render();
      const deadlineExpired = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Timed out after ${timeoutMs} ms rendering the ${output.label}`));
        }, remainingTimeoutMs());
      });
      return await Promise.race([render(), deadlineExpired]);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      const openContext: BrowserContext | null = context;
      if (timedOut) {
        // The worker must not wait on a hung page; tear it down in the background.
        if (openContext) void this.discardContext(browser, openContext);
        else this.discardBrowser(browser);
      } else if (openContext) {
        await this.discardContext(browser, openContext);
      }
    }
  }
}

import { chromium } from 'playwright';

export const PAPER_SIZES = ['Letter', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

const QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE = 'question-block-size-overflow';

export class QuestionBlockSizeOverflowError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuestionBlockSizeOverflowError';
  }
}

const DEFAULT_PDF_RENDER_TIMEOUT_MS = 120_000;
const MAX_CONCURRENT_PDF_RENDERS = 2;
const MAX_QUEUED_PDF_RENDERS = 4;

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

  async run<T>(callback: (queueWaitMs: number) => Promise<T>, timeoutMs: number): Promise<T> {
    const queueWaitMs = await this.acquire(timeoutMs);
    try {
      return await callback(queueWaitMs);
    } finally {
      this.release();
    }
  }

  private async acquire(timeoutMs: number): Promise<number> {
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return 0;
    }

    if (this.waiters.length >= this.maxWaiters) {
      throw new Error('Too many PDF renders are already waiting');
    }

    return new Promise<number>((resolve, reject) => {
      const waiter: SemaphoreWaiter = { queuedAt: Date.now(), resolve, reject };
      if (timeoutMs > 0) {
        waiter.timeout = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index === -1) return;
          this.waiters.splice(index, 1);
          reject(new Error(`Timed out after ${timeoutMs} ms waiting to render the PDF`));
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

const pdfRenderSemaphore = new Semaphore(MAX_CONCURRENT_PDF_RENDERS, MAX_QUEUED_PDF_RENDERS);

export interface RenderUrlToPdfOptions {
  url: string;
  cookieHeader?: string;
  timeoutMs?: number;
  browserWSEndpoint?: string;
}

export function renderUrlToPdf(options: RenderUrlToPdfOptions): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PDF_RENDER_TIMEOUT_MS;
  return pdfRenderSemaphore.run((queueWaitMs) => {
    const remainingTimeoutMs = timeoutMs === 0 ? 0 : Math.max(1, timeoutMs - queueWaitMs);
    return renderUrlToPdfWithPermit({ ...options, timeoutMs: remainingTimeoutMs });
  }, timeoutMs);
}

async function renderUrlToPdfWithPermit({
  url,
  cookieHeader,
  timeoutMs = DEFAULT_PDF_RENDER_TIMEOUT_MS,
  browserWSEndpoint,
}: RenderUrlToPdfOptions): Promise<Buffer> {
  const deadline = timeoutMs === 0 ? null : Date.now() + timeoutMs;
  const remainingTimeoutMs = () => (deadline === null ? 0 : Math.max(1, deadline - Date.now()));
  const renderUrl = new URL(url);
  const renderOrigin = renderUrl.origin;
  const renderPathname = renderUrl.pathname.replace(/\/+$/, '') || '/';
  const browser = browserWSEndpoint
    ? await chromium.connect(browserWSEndpoint, {
        exposeNetwork: '<loopback>',
        timeout: remainingTimeoutMs(),
      })
    : await chromium.launch({ headless: true, timeout: remainingTimeoutMs() });

  let browserClosePromise: Promise<void> | undefined;
  const closeBrowser = () => (browserClosePromise ??= browser.close());
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const renderPdf = async () => {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        ...(cookieHeader ? { extraHTTPHeaders: { cookie: cookieHeader } } : {}),
      });

      await context.route('**/*', async (route) => {
        const request = route.request();
        const requestUrl = new URL(request.url());
        if (request.method() !== 'GET' || requestUrl.origin !== renderOrigin) {
          await route.abort('blockedbyclient');
          return;
        }

        const requestPathname = requestUrl.pathname.replace(/\/+$/, '') || '/';
        if (requestPathname === renderPathname) {
          await route.continue({
            headers: {
              ...(await request.allHeaders()),
              accept: 'text/html',
            },
          });
          return;
        }
        await route.continue();
      });
      await context.routeWebSocket('**/*', async (webSocket) => {
        await webSocket.close({ code: 1008, reason: 'WebSockets are disabled while printing' });
      });

      const page = await context.newPage();
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

      await page.emulateMedia({ media: 'print' });
      return await page.pdf({
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
        printBackground: true,
        tagged: true,
      });
    };

    if (deadline === null) return await renderPdf();
    const timeUntilDeadline = deadline - Date.now();
    if (timeUntilDeadline <= 0) {
      timedOut = true;
      void closeBrowser().catch(() => undefined);
      throw new Error(`Timed out after ${timeoutMs} ms rendering the PDF`);
    }
    const deadlineExpired = new Promise<never>((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        timedOut = true;
        void closeBrowser().catch(() => undefined);
        reject(new Error(`Timed out after ${timeoutMs} ms rendering the PDF`));
      }, timeUntilDeadline);
    });
    return await Promise.race([renderPdf(), deadlineExpired]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (!timedOut) await closeBrowser();
  }
}

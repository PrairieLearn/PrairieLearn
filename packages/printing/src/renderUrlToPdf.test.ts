import type { Browser, BrowserContext, Page, Response, Route, WebSocketRoute } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playwrightMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  launch: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { connect: playwrightMocks.connect, launch: playwrightMocks.launch },
}));

import { QuestionBlockSizeOverflowError, renderUrlToPdf } from './renderUrlToPdf.js';

const EXPECTED_MAX_CONCURRENT_PDF_RENDERS = 2;
const EXPECTED_MAX_QUEUED_PDF_RENDERS = 4;

function createBrowserHarness({
  response = { ok: () => true, status: () => 200 } as Response,
  printStatus = 'ready',
  printError = null,
  printErrorCode = null,
}: {
  response?: Response | null;
  printStatus?: 'error' | 'ready';
  printError?: string | null;
  printErrorCode?: string | null;
} = {}) {
  let routeHandler: ((route: Route) => Promise<void>) | undefined;
  let webSocketHandler: ((webSocket: WebSocketRoute) => Promise<void>) | undefined;
  const pdf = Buffer.from('%PDF-test');
  const page = {
    emulateMedia: vi.fn(async () => undefined),
    goto: vi.fn(async () => response),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({
      status: printStatus,
      error: printError,
      errorCode: printErrorCode,
    })),
    pdf: vi.fn(async () => pdf),
  } as unknown as Page;
  const context = {
    route: vi.fn(async (_pattern, handler) => {
      routeHandler = handler;
    }),
    routeWebSocket: vi.fn(async (_pattern, handler) => {
      webSocketHandler = handler;
    }),
    newPage: vi.fn(async () => page),
  } as unknown as BrowserContext;
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  } as unknown as Browser;
  playwrightMocks.connect.mockResolvedValue(browser);
  playwrightMocks.launch.mockResolvedValue(browser);

  return {
    browser,
    context,
    page,
    pdf,
    getRouteHandler: () => routeHandler,
    getWebSocketHandler: () => webSocketHandler,
  };
}

function mockPdfRendersBlockedBy(blocker: Promise<void>): void {
  playwrightMocks.launch.mockImplementation(async () => {
    const page = {
      emulateMedia: vi.fn(async () => undefined),
      goto: vi.fn(async () => ({ ok: () => true, status: () => 200 }) as Response),
      waitForFunction: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => ({ status: 'ready', error: null })),
      pdf: vi.fn(async () => {
        await blocker;
        return Buffer.from('%PDF-test');
      }),
    } as unknown as Page;
    const context = {
      route: vi.fn(async () => undefined),
      routeWebSocket: vi.fn(async () => undefined),
      newPage: vi.fn(async () => page),
    } as unknown as BrowserContext;
    return {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined),
    } as unknown as Browser;
  });
}

describe('renderUrlToPdf', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    playwrightMocks.connect.mockReset();
    playwrightMocks.launch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a ready same-origin page and closes Chromium', async () => {
    const harness = createBrowserHarness();

    const result = await renderUrlToPdf({
      url: 'https://localhost:3000/print?paper_size=Letter',
      cookieHeader: 'session=test',
      timeoutMs: 1234,
    });

    expect(result).toEqual(harness.pdf);
    expect(playwrightMocks.connect).not.toHaveBeenCalled();
    expect(playwrightMocks.launch).toHaveBeenCalledExactlyOnceWith({
      headless: true,
      timeout: 1234,
    });
    expect(harness.browser.newContext).toHaveBeenCalledExactlyOnceWith({
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      extraHTTPHeaders: { cookie: 'session=test' },
    });
    expect(harness.page.emulateMedia).toHaveBeenNthCalledWith(1, { media: 'screen' });
    expect(harness.page.emulateMedia).toHaveBeenNthCalledWith(2, { media: 'print' });
    expect(harness.page.goto).toHaveBeenCalledExactlyOnceWith(
      'https://localhost:3000/print?paper_size=Letter',
      { waitUntil: 'load', timeout: 1234 },
    );
    expect(harness.page.pdf).toHaveBeenCalledExactlyOnceWith({
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
    expect(harness.browser.close).toHaveBeenCalledOnce();

    const routeHandler = harness.getRouteHandler();
    expect(routeHandler).toBeDefined();
    const continueRequest = vi.fn(async () => undefined);
    await routeHandler!({
      request: () => ({
        method: () => 'GET',
        url: () => 'https://localhost:3000/assets/question.png',
      }),
      abort: vi.fn(),
      continue: continueRequest,
    } as unknown as Route);
    expect(continueRequest).toHaveBeenCalledOnce();

    const webSocketHandler = harness.getWebSocketHandler();
    expect(webSocketHandler).toBeDefined();
    const closeWebSocket = vi.fn(async () => undefined);
    await webSocketHandler!({ close: closeWebSocket } as unknown as WebSocketRoute);
    expect(closeWebSocket).toHaveBeenCalledExactlyOnceWith({
      code: 1008,
      reason: 'WebSockets are disabled while printing',
    });
  });

  it('keeps Chromium open until PDF generation finishes', async () => {
    const harness = createBrowserHarness();
    let resolvePdf!: (pdf: Buffer) => void;
    const pendingPdf = new Promise<Buffer>((resolve) => {
      resolvePdf = resolve;
    });
    vi.mocked(harness.page.pdf).mockImplementation(async () => await pendingPdf);

    const render = renderUrlToPdf({ url: 'http://localhost:3000/print' });
    await vi.waitFor(() => expect(harness.page.pdf).toHaveBeenCalledOnce());
    expect(harness.browser.close).not.toHaveBeenCalled();

    resolvePdf(harness.pdf);
    await expect(render).resolves.toEqual(harness.pdf);
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it('times out stalled PDF generation and releases permits for queued renders', async () => {
    const firstStalledHarness = createBrowserHarness();
    const secondStalledHarness = createBrowserHarness();
    const succeedingHarness = createBrowserHarness();
    vi.mocked(firstStalledHarness.page.pdf).mockImplementation(
      async () => await new Promise<Buffer>(() => undefined),
    );
    vi.mocked(secondStalledHarness.page.pdf).mockImplementation(
      async () => await new Promise<Buffer>(() => undefined),
    );
    playwrightMocks.launch.mockReset();
    playwrightMocks.launch
      .mockResolvedValueOnce(firstStalledHarness.browser)
      .mockResolvedValueOnce(secondStalledHarness.browser)
      .mockResolvedValueOnce(succeedingHarness.browser);

    const results = await Promise.allSettled([
      renderUrlToPdf({ url: 'http://localhost:3000/print/stalled-1', timeoutMs: 20 }),
      renderUrlToPdf({ url: 'http://localhost:3000/print/stalled-2', timeoutMs: 20 }),
      renderUrlToPdf({ url: 'http://localhost:3000/print/succeeds', timeoutMs: 200 }),
    ]);

    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: new Error('Timed out after 20 ms rendering the PDF'),
    });
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: new Error('Timed out after 20 ms rendering the PDF'),
    });
    expect(results[2]).toEqual({ status: 'fulfilled', value: succeedingHarness.pdf });
    expect(firstStalledHarness.browser.close).toHaveBeenCalledOnce();
    expect(secondStalledHarness.browser.close).toHaveBeenCalledOnce();
    expect(succeedingHarness.browser.close).toHaveBeenCalledOnce();
  });

  it('connects to a remote browser server when configured', async () => {
    const harness = createBrowserHarness();

    const result = await renderUrlToPdf({
      url: 'http://localhost:3000/print?paper_size=Letter',
      browserWSEndpoint: 'ws://printing-browser:3000/',
    });

    expect(result).toEqual(harness.pdf);
    expect(playwrightMocks.connect).toHaveBeenCalledExactlyOnceWith('ws://printing-browser:3000/', {
      exposeNetwork: '<loopback>',
      timeout: 120_000,
    });
    expect(playwrightMocks.launch).not.toHaveBeenCalled();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it('blocks cross-origin and mutating requests', async () => {
    const harness = createBrowserHarness();
    await renderUrlToPdf({
      url: 'http://localhost:3000/print?paper_size=A4',
    });
    const routeHandler = harness.getRouteHandler();
    expect(routeHandler).toBeDefined();

    for (const request of [
      { method: 'POST', url: 'http://localhost:3000/pl/mutate' },
      { method: 'GET', url: 'https://example.com/exfiltrate' },
    ]) {
      const abort = vi.fn(async () => undefined);
      await routeHandler!({
        request: () => ({
          method: () => request.method,
          url: () => request.url,
        }),
        abort,
        continue: vi.fn(),
      } as unknown as Route);
      expect(abort).toHaveBeenCalledExactlyOnceWith('blockedbyclient');
    }
  });

  it('forces printable-page subrequests to request HTML while preserving headers', async () => {
    const harness = createBrowserHarness();
    await renderUrlToPdf({
      url: 'http://localhost:3000/print?paper_size=A4',
      cookieHeader: 'session=test',
    });
    const routeHandler = harness.getRouteHandler();
    expect(routeHandler).toBeDefined();

    const continueRequest = vi.fn(async () => undefined);
    await routeHandler!({
      request: () => ({
        method: () => 'GET',
        url: () => 'http://localhost:3000/print?paper_size=A4',
        allHeaders: async () => ({
          accept: 'application/pdf',
          cookie: 'session=test',
          'x-request-id': 'request-id',
        }),
      }),
      abort: vi.fn(),
      continue: continueRequest,
    } as unknown as Route);

    expect(continueRequest).toHaveBeenCalledExactlyOnceWith({
      headers: {
        accept: 'text/html',
        cookie: 'session=test',
        'x-request-id': 'request-id',
      },
    });
  });

  it('limits the number of simultaneously active Chromium renders', async () => {
    let releaseFirstWave!: () => void;
    const firstWave = new Promise<void>((resolve) => {
      releaseFirstWave = resolve;
    });
    let activeBrowsers = 0;
    let peakActiveBrowsers = 0;
    let launchedBrowsers = 0;

    playwrightMocks.launch.mockImplementation(async () => {
      const launchIndex = launchedBrowsers++;
      activeBrowsers += 1;
      peakActiveBrowsers = Math.max(peakActiveBrowsers, activeBrowsers);

      const page = {
        emulateMedia: vi.fn(async () => undefined),
        goto: vi.fn(async () => ({ ok: () => true, status: () => 200 }) as Response),
        waitForFunction: vi.fn(async () => undefined),
        evaluate: vi.fn(async () => ({ status: 'ready', error: null })),
        pdf: vi.fn(async () => {
          if (launchIndex < EXPECTED_MAX_CONCURRENT_PDF_RENDERS) await firstWave;
          return Buffer.from('%PDF-test');
        }),
      } as unknown as Page;
      const context = {
        route: vi.fn(async () => undefined),
        routeWebSocket: vi.fn(async () => undefined),
        newPage: vi.fn(async () => page),
      } as unknown as BrowserContext;
      return {
        newContext: vi.fn(async () => context),
        close: vi.fn(async () => {
          activeBrowsers -= 1;
        }),
      } as unknown as Browser;
    });

    const renders = Array.from({ length: EXPECTED_MAX_CONCURRENT_PDF_RENDERS + 1 }, (_, index) =>
      renderUrlToPdf({
        url: `http://localhost:3000/print/${index}`,
      }),
    );

    await vi.waitFor(() => {
      expect(playwrightMocks.launch).toHaveBeenCalledTimes(EXPECTED_MAX_CONCURRENT_PDF_RENDERS);
    });
    expect(peakActiveBrowsers).toBe(EXPECTED_MAX_CONCURRENT_PDF_RENDERS);

    releaseFirstWave();
    await Promise.all(renders);

    expect(playwrightMocks.launch).toHaveBeenCalledTimes(EXPECTED_MAX_CONCURRENT_PDF_RENDERS + 1);
    expect(peakActiveBrowsers).toBe(EXPECTED_MAX_CONCURRENT_PDF_RENDERS);
    expect(activeBrowsers).toBe(0);
  });

  it('rejects renders when the wait queue is full', async () => {
    let releaseRenders!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseRenders = resolve;
    });
    mockPdfRendersBlockedBy(blocker);

    const acceptedRenders = Array.from(
      { length: EXPECTED_MAX_CONCURRENT_PDF_RENDERS + EXPECTED_MAX_QUEUED_PDF_RENDERS },
      (_, index) =>
        renderUrlToPdf({
          url: `http://localhost:3000/print/${index}`,
          timeoutMs: 0,
        }),
    );

    try {
      await expect(
        renderUrlToPdf({ url: 'http://localhost:3000/print/overloaded', timeoutMs: 0 }),
      ).rejects.toThrow('Too many PDF renders are already waiting');
    } finally {
      releaseRenders();
      await Promise.all(acceptedRenders);
    }

    expect(playwrightMocks.launch).toHaveBeenCalledTimes(
      EXPECTED_MAX_CONCURRENT_PDF_RENDERS + EXPECTED_MAX_QUEUED_PDF_RENDERS,
    );
  });

  it('times out while waiting for a render permit', async () => {
    let releaseRenders!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseRenders = resolve;
    });
    mockPdfRendersBlockedBy(blocker);
    const activeRenders = Array.from({ length: EXPECTED_MAX_CONCURRENT_PDF_RENDERS }, (_, index) =>
      renderUrlToPdf({ url: `http://localhost:3000/print/${index}`, timeoutMs: 0 }),
    );

    await vi.waitFor(() => {
      expect(playwrightMocks.launch).toHaveBeenCalledTimes(EXPECTED_MAX_CONCURRENT_PDF_RENDERS);
    });
    try {
      await expect(
        renderUrlToPdf({ url: 'http://localhost:3000/print/waiting', timeoutMs: 10 }),
      ).rejects.toThrow('Timed out after 10 ms waiting to render the PDF');
    } finally {
      releaseRenders();
      await Promise.all(activeRenders);
    }
    expect(playwrightMocks.launch).toHaveBeenCalledTimes(EXPECTED_MAX_CONCURRENT_PDF_RENDERS);
  });

  it('surfaces pagination failures and still closes Chromium', async () => {
    const harness = createBrowserHarness({ printStatus: 'error', printError: 'Paged.js failed' });

    await expect(
      renderUrlToPdf({
        url: 'http://localhost:3000/print?paper_size=Letter',
      }),
    ).rejects.toThrow('The printable page failed: Paged.js failed');
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it('identifies explicit question block overflows', async () => {
    const harness = createBrowserHarness({
      printStatus: 'error',
      printError:
        'Question 4 needs 451px, but the requested half print block provides 450px. Use auto or a larger block size.',
      printErrorCode: 'question-block-size-overflow',
    });

    const render = renderUrlToPdf({
      url: 'http://localhost:3000/print?paper_size=Letter',
    });
    await expect(render).rejects.toEqual(
      expect.objectContaining({
        name: 'QuestionBlockSizeOverflowError',
        message:
          'The printable page failed: Question 4 needs 451px, but the requested half print block provides 450px. Use auto or a larger block size.',
      }),
    );
    await expect(render).rejects.toBeInstanceOf(QuestionBlockSizeOverflowError);
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it('does not translate unrecognized printable-page failures into block overflows', async () => {
    const harness = createBrowserHarness({
      printStatus: 'error',
      printError: 'Paged.js failed',
      printErrorCode: 'unknown-print-error',
    });

    const render = renderUrlToPdf({
      url: 'http://localhost:3000/print?paper_size=Letter',
    });
    await expect(render).rejects.not.toBeInstanceOf(QuestionBlockSizeOverflowError);
    await expect(render).rejects.toThrow('The printable page failed: Paged.js failed');
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it('surfaces pagination failures that do not include an error message', async () => {
    const harness = createBrowserHarness({ printStatus: 'error' });

    await expect(
      renderUrlToPdf({
        url: 'http://localhost:3000/print?paper_size=Letter',
      }),
    ).rejects.toThrow('The printable page failed: No pagination error was provided');
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it('rejects missing and unsuccessful page responses', async () => {
    const missingResponseHarness = createBrowserHarness({ response: null });
    await expect(
      renderUrlToPdf({
        url: 'http://localhost:3000/print?paper_size=Letter',
      }),
    ).rejects.toThrow('The printable page did not return a response');
    expect(missingResponseHarness.browser.close).toHaveBeenCalledOnce();

    const unsuccessfulResponseHarness = createBrowserHarness({
      response: { ok: () => false, status: () => 403 } as Response,
    });
    await expect(
      renderUrlToPdf({
        url: 'http://localhost:3000/print?paper_size=A4',
      }),
    ).rejects.toThrow('The printable page returned HTTP 403');
    expect(unsuccessfulResponseHarness.browser.close).toHaveBeenCalledOnce();
  });
});

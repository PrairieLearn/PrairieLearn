/* eslint-disable @typescript-eslint/unbound-method -- The browser harness methods are Vitest spies passed to expect. */
import type { Browser, BrowserContext, Page, Response, Route, WebSocketRoute } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playwrightMocks = vi.hoisted(() => ({
  connectOverCDP: vi.fn(),
  launch: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { connectOverCDP: playwrightMocks.connectOverCDP, launch: playwrightMocks.launch },
}));

import {
  PrintRenderer,
  QuestionBlockSizeOverflowError,
  type RenderPdfOptions,
} from './printRenderer.js';

const READY_HTML =
  '<!doctype html><html data-print-status="ready"><body>Prepared pages</body></html>';

function renderPdf(
  renderer: PrintRenderer,
  options: Omit<RenderPdfOptions, 'html'> & { html?: string },
): Promise<Buffer> {
  return renderer.renderPdf({ ...options, html: options.html ?? READY_HTML });
}

interface HarnessOptions {
  response?: Response | null;
  printStatus?: 'error' | 'ready';
  printError?: string | null;
  printErrorCode?: string | null;
  /** Called for every `page.pdf()`; lets a test stall or fail individual renders. */
  pdf?: (renderIndex: number) => Promise<Buffer>;
  contextClose?: () => Promise<void>;
}

function createBrowserHarness({
  response = { ok: () => true, status: () => 200 } as Response,
  printStatus = 'ready',
  printError = null,
  printErrorCode = null,
  pdf = async () => Buffer.from('%PDF-test'),
  contextClose = async () => undefined,
}: HarnessOptions = {}) {
  let routeHandler: ((route: Route) => Promise<void>) | undefined;
  let webSocketHandler: ((webSocket: WebSocketRoute) => Promise<void>) | undefined;
  let renderIndex = 0;
  let openContexts = 0;
  let peakOpenContexts = 0;
  const pages: Page[] = [];
  const contexts: BrowserContext[] = [];

  const browser = {
    newContext: vi.fn(async () => {
      openContexts += 1;
      peakOpenContexts = Math.max(peakOpenContexts, openContexts);
      const page = {
        emulateMedia: vi.fn(async () => undefined),
        goto: vi.fn(async () => response),
        waitForFunction: vi.fn(async () => undefined),
        evaluate: vi.fn(async () => ({
          status: printStatus,
          error: printError,
          errorCode: printErrorCode,
        })),
        pdf: vi.fn(async () => await pdf(renderIndex++)),
      } as unknown as Page;
      const context = {
        route: vi.fn(async (_pattern, handler) => {
          routeHandler = handler;
        }),
        routeWebSocket: vi.fn(async (_pattern, handler) => {
          webSocketHandler = handler;
        }),
        unrouteAll: vi.fn(async () => undefined),
        newPage: vi.fn(async () => page),
        close: vi.fn(async () => {
          await contextClose();
          openContexts -= 1;
        }),
      } as unknown as BrowserContext;
      pages.push(page);
      contexts.push(context);
      return context;
    }),
    close: vi.fn(async () => undefined),
    on: vi.fn(),
  } as unknown as Browser;
  playwrightMocks.connectOverCDP.mockResolvedValue(browser);
  playwrightMocks.launch.mockResolvedValue(browser);

  return {
    browser,
    pages,
    contexts,
    getRouteHandler: () => routeHandler,
    getWebSocketHandler: () => webSocketHandler,
    getPeakOpenContexts: () => peakOpenContexts,
    getOpenContexts: () => openContexts,
    disconnect: () => {
      const handler = vi.mocked(browser.on).mock.calls.at(0)?.[1] as (() => void) | undefined;
      if (!handler) throw new Error('The renderer did not listen for browser disconnects');
      handler();
    },
  };
}

function createGate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('PrintRenderer', () => {
  beforeEach(() => {
    playwrightMocks.connectOverCDP.mockReset();
    playwrightMocks.launch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders PDFs in fresh contexts on one shared Chromium', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    const harness = createBrowserHarness();
    const renderer = new PrintRenderer({ timeoutMs: 1234 });

    const first = await renderPdf(renderer, {
      url: 'https://localhost:3000/print?paper_size=Letter',
      cookieHeader: 'session=test',
    });
    const second = await renderPdf(renderer, { url: 'https://localhost:3000/print?paper_size=A4' });

    expect(first).toEqual(Buffer.from('%PDF-test'));
    expect(second).toEqual(Buffer.from('%PDF-test'));
    expect(playwrightMocks.connectOverCDP).not.toHaveBeenCalled();
    expect(playwrightMocks.launch).toHaveBeenCalledExactlyOnceWith({
      headless: true,
      timeout: 1234,
    });
    expect(harness.browser.newContext).toHaveBeenCalledTimes(2);
    expect(harness.browser.newContext).toHaveBeenNthCalledWith(1, {
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      javaScriptEnabled: false,
      extraHTTPHeaders: { cookie: 'session=test' },
    });
    expect(harness.browser.newContext).toHaveBeenNthCalledWith(2, {
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      javaScriptEnabled: false,
    });
    for (const context of harness.contexts) expect(context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).not.toHaveBeenCalled();

    const page = harness.pages[0];
    expect(page.emulateMedia).toHaveBeenNthCalledWith(1, { media: 'screen' });
    expect(page.emulateMedia).toHaveBeenNthCalledWith(2, { media: 'print' });
    expect(page.goto).toHaveBeenCalledExactlyOnceWith(
      'https://localhost:3000/print?paper_size=Letter',
      { waitUntil: 'load', timeout: expect.any(Number) },
    );
    expect(page.pdf).toHaveBeenCalledExactlyOnceWith({
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
  });

  it('prints pre-paginated HTML without running page scripts or loading the preview route', async () => {
    const harness = createBrowserHarness();
    const url = 'http://localhost:3000/paper/preview?paper_size=Letter';
    const html = '<html data-print-status="ready"><body>Prepared pages</body></html>';

    await renderPdf(new PrintRenderer(), { url, html });

    expect(harness.browser.newContext).toHaveBeenCalledExactlyOnceWith({
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      javaScriptEnabled: false,
    });
    expect(harness.pages[0].waitForFunction).not.toHaveBeenCalled();
    const fulfill = vi.fn(async () => undefined);
    const fetch = vi.fn();
    await harness.getRouteHandler()!({
      request: () => ({ url: () => url, isNavigationRequest: () => true }),
      fulfill,
      fetch,
    } as unknown as Route);
    expect(fulfill).toHaveBeenCalledExactlyOnceWith({
      status: 200,
      contentType: 'text/html',
      body: html,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows same-origin GET requests and blocks everything else', async () => {
    const harness = createBrowserHarness();
    await renderPdf(new PrintRenderer(), { url: 'http://localhost:3000/print?paper_size=A4' });
    const routeHandler = harness.getRouteHandler();
    expect(routeHandler).toBeDefined();

    const response = { status: () => 200 };
    const fetch = vi.fn(async () => response);
    const fulfill = vi.fn(async () => undefined);
    await routeHandler!({
      request: () => ({
        method: () => 'GET',
        url: () => 'http://localhost:3000/assets/question.png',
      }),
      abort: vi.fn(),
      fetch,
      fulfill,
    } as unknown as Route);
    expect(fulfill).toHaveBeenCalledExactlyOnceWith({ response });

    for (const request of [
      { method: 'POST', url: 'http://localhost:3000/pl/mutate' },
      { method: 'GET', url: 'https://example.com/exfiltrate' },
      // socket.io polling would otherwise hold HTTP connections open for the whole render.
      { method: 'GET', url: 'http://localhost:3000/socket.io/?EIO=4&transport=polling' },
    ]) {
      const abort = vi.fn(async () => undefined);
      await routeHandler!({
        request: () => ({ method: () => request.method, url: () => request.url }),
        abort,
        fetch,
      } as unknown as Route);
      expect(abort).toHaveBeenCalledExactlyOnceWith('blockedbyclient');
    }
    expect(fetch).toHaveBeenCalledExactlyOnceWith({ maxRedirects: 0 });

    const webSocketHandler = harness.getWebSocketHandler();
    expect(webSocketHandler).toBeDefined();
    const closeWebSocket = vi.fn(async () => undefined);
    await webSocketHandler!({ close: closeWebSocket } as unknown as WebSocketRoute);
    expect(closeWebSocket).toHaveBeenCalledExactlyOnceWith({
      code: 1008,
      reason: 'WebSockets are disabled while printing',
    });
  });

  it('aborts requests when fetching their response fails', async () => {
    const harness = createBrowserHarness();
    await renderPdf(new PrintRenderer(), { url: 'http://localhost:3000/print' });
    const routeHandler = harness.getRouteHandler();
    expect(routeHandler).toBeDefined();

    const abort = vi.fn(async () => undefined);
    await routeHandler!({
      request: () => ({
        method: () => 'GET',
        url: () => 'http://localhost:3000/assets/question.png',
      }),
      fetch: vi.fn(async () => {
        throw new Error('Connection reset');
      }),
      abort,
    } as unknown as Route);

    expect(abort).toHaveBeenCalledExactlyOnceWith('failed');
  });

  it('connects once to Cloudflare Browser Run when configured', async () => {
    const harness = createBrowserHarness();
    const renderer = new PrintRenderer({ cloudflare: { accountId: 'account', apiToken: 'token' } });

    await renderPdf(renderer, { url: 'http://localhost:3000/print?paper_size=Letter' });
    await renderPdf(renderer, { url: 'http://localhost:3000/print?paper_size=A4' });

    expect(playwrightMocks.connectOverCDP).toHaveBeenCalledExactlyOnceWith(
      'wss://api.cloudflare.com/client/v4/accounts/account/browser-run/devtools/browser?keep_alive=60000',
      { headers: { Authorization: 'Bearer token' }, timeout: 120_000 },
    );
    expect(playwrightMocks.launch).not.toHaveBeenCalled();
    expect(harness.browser.newContext).toHaveBeenCalledTimes(2);
  });

  it('runs four Cloudflare renders concurrently and queues the next one', async () => {
    const gate = createGate();
    const harness = createBrowserHarness({
      pdf: async () => {
        await gate.opened;
        return Buffer.from('%PDF-test');
      },
    });
    const renderer = new PrintRenderer({ cloudflare: { accountId: 'account', apiToken: 'token' } });
    const renders = Array.from({ length: 5 }, (_, index) =>
      renderPdf(renderer, { url: `http://localhost:3000/print/${index}` }),
    );
    await vi.waitFor(() => expect(harness.pages).toHaveLength(4));
    expect(harness.getPeakOpenContexts()).toBe(4);
    gate.open();
    await Promise.all(renders);
    expect(harness.pages).toHaveLength(5);
  });

  it('renders one page at a time and queues the rest', async () => {
    const gate = createGate();
    const harness = createBrowserHarness({
      pdf: async (renderIndex) => {
        if (renderIndex === 0) await gate.opened;
        return Buffer.from(`%PDF-${renderIndex}`);
      },
    });
    const renderer = new PrintRenderer();

    const renders = [0, 1, 2].map((index) =>
      renderPdf(renderer, { url: `http://localhost:3000/print/${index}` }),
    );
    await vi.waitFor(() => expect(harness.pages).toHaveLength(1));
    expect(harness.browser.newContext).toHaveBeenCalledOnce();

    gate.open();
    await expect(Promise.all(renders)).resolves.toEqual([
      Buffer.from('%PDF-0'),
      Buffer.from('%PDF-1'),
      Buffer.from('%PDF-2'),
    ]);
    expect(playwrightMocks.launch).toHaveBeenCalledOnce();
    expect(harness.getPeakOpenContexts()).toBe(1);
    expect(harness.getOpenContexts()).toBe(0);
  });

  it('rejects renders when the wait queue is full', async () => {
    const gate = createGate();
    createBrowserHarness({
      pdf: async () => {
        await gate.opened;
        return Buffer.from('%PDF-test');
      },
    });
    const renderer = new PrintRenderer({ maxQueuedRenders: 2 });
    const accepted = [0, 1, 2].map((index) =>
      renderPdf(renderer, { url: `http://localhost:3000/print/${index}`, timeoutMs: 0 }),
    );

    try {
      await expect(
        renderPdf(renderer, { url: 'http://localhost:3000/print/overloaded', timeoutMs: 0 }),
      ).rejects.toThrow('Too many print renders are already waiting');
    } finally {
      gate.open();
      await Promise.all(accepted);
    }
  });

  it('times out while waiting for the worker', async () => {
    const gate = createGate();
    createBrowserHarness({
      pdf: async () => {
        await gate.opened;
        return Buffer.from('%PDF-test');
      },
    });
    const renderer = new PrintRenderer();
    const active = renderPdf(renderer, { url: 'http://localhost:3000/print/active', timeoutMs: 0 });

    try {
      await expect(
        renderPdf(renderer, { url: 'http://localhost:3000/print/waiting', timeoutMs: 10 }),
      ).rejects.toThrow('Timed out after 10 ms waiting to render the PDF');
    } finally {
      gate.open();
      await active;
    }
  });

  it('times out a stalled render, closes its context, and keeps serving', async () => {
    const harness = createBrowserHarness({
      pdf: async (renderIndex) => {
        if (renderIndex === 0) await new Promise<never>(() => undefined);
        return Buffer.from('%PDF-test');
      },
    });
    const renderer = new PrintRenderer();

    const results = await Promise.allSettled([
      renderPdf(renderer, { url: 'http://localhost:3000/print/stalled', timeoutMs: 20 }),
      renderPdf(renderer, { url: 'http://localhost:3000/print/succeeds', timeoutMs: 2000 }),
    ]);

    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: new Error('Timed out after 20 ms rendering the PDF'),
    });
    expect(results[1]).toEqual({ status: 'fulfilled', value: Buffer.from('%PDF-test') });
    expect(harness.contexts[0].close).toHaveBeenCalledOnce();
    expect(harness.browser.close).not.toHaveBeenCalled();
    expect(playwrightMocks.launch).toHaveBeenCalledOnce();
  });

  it('waits for timed-out context cleanup before starting another render', async () => {
    const closeGate = createGate();
    const harness = createBrowserHarness({
      pdf: async (renderIndex) =>
        renderIndex === 0 ? await new Promise<never>(() => undefined) : Buffer.from('%PDF-test'),
      contextClose: async () => await closeGate.opened,
    });
    const renderer = new PrintRenderer();

    const first = renderPdf(renderer, {
      url: 'http://localhost:3000/print/stalled',
      timeoutMs: 20,
    });
    const second = renderPdf(renderer, {
      url: 'http://localhost:3000/print/next',
      timeoutMs: 2000,
    });

    try {
      await vi.waitFor(() => expect(harness.contexts[0].close).toHaveBeenCalledOnce());
      await new Promise((resolve) => setImmediate(resolve));
      expect(harness.browser.newContext).toHaveBeenCalledOnce();
      expect(harness.getOpenContexts()).toBe(1);
    } finally {
      closeGate.open();
    }

    await expect(first).rejects.toThrow('Timed out after 20 ms rendering the PDF');
    await expect(second).resolves.toEqual(Buffer.from('%PDF-test'));
    expect(harness.getPeakOpenContexts()).toBe(1);
  });

  it('discards the browser when closing a context fails', async () => {
    const firstBrowser = createBrowserHarness({
      contextClose: async () => {
        throw new Error('Context close failed');
      },
    });
    const renderer = new PrintRenderer();

    await renderPdf(renderer, { url: 'http://localhost:3000/print/first' });
    expect(firstBrowser.browser.close).toHaveBeenCalledOnce();

    createBrowserHarness();
    await renderPdf(renderer, { url: 'http://localhost:3000/print/second' });
    expect(playwrightMocks.launch).toHaveBeenCalledTimes(2);
  });

  it('discards the browser when a context does not close promptly', async () => {
    const harness = createBrowserHarness({
      pdf: async () => await new Promise<never>(() => undefined),
      contextClose: async () => await new Promise<never>(() => undefined),
    });
    const renderer = new PrintRenderer({ contextCloseGraceMs: 10 });

    await expect(
      renderPdf(renderer, { url: 'http://localhost:3000/print/stalled', timeoutMs: 20 }),
    ).rejects.toThrow('Timed out after 20 ms rendering the PDF');
    await vi.waitFor(() => expect(harness.browser.close).toHaveBeenCalledOnce());

    // The next render gets a fresh browser instead of the discarded one.
    createBrowserHarness();
    await renderPdf(renderer, { url: 'http://localhost:3000/print/next' });
    expect(playwrightMocks.launch).toHaveBeenCalledTimes(2);
  });

  it('relaunches Chromium after it disconnects', async () => {
    const harness = createBrowserHarness();
    const renderer = new PrintRenderer();

    await renderPdf(renderer, { url: 'http://localhost:3000/print/first' });
    harness.disconnect();
    await renderPdf(renderer, { url: 'http://localhost:3000/print/second' });

    expect(playwrightMocks.launch).toHaveBeenCalledTimes(2);
  });

  it('surfaces pagination failures and keeps the browser', async () => {
    const harness = createBrowserHarness({ printStatus: 'error', printError: 'Paged.js failed' });

    await expect(
      renderPdf(new PrintRenderer(), { url: 'http://localhost:3000/print?paper_size=Letter' }),
    ).rejects.toThrow('The printable page failed: Paged.js failed');
    expect(harness.contexts[0].close).toHaveBeenCalledOnce();
    expect(harness.browser.close).not.toHaveBeenCalled();
  });

  it('identifies explicit question block overflows', async () => {
    createBrowserHarness({
      printStatus: 'error',
      printError:
        'Question 4 needs 451px, but the requested half print block provides 450px. Use auto or a larger block size.',
      printErrorCode: 'question-block-size-overflow',
    });

    const render = renderPdf(new PrintRenderer(), {
      url: 'http://localhost:3000/print?paper_size=Letter',
    });
    await expect(render).rejects.toBeInstanceOf(QuestionBlockSizeOverflowError);
    await expect(render).rejects.toThrow(
      'The printable page failed: Question 4 needs 451px, but the requested half print block provides 450px. Use auto or a larger block size.',
    );
  });

  it('does not translate unrecognized printable-page failures into block overflows', async () => {
    createBrowserHarness({
      printStatus: 'error',
      printError: 'Paged.js failed',
      printErrorCode: 'unknown-print-error',
    });

    const render = renderPdf(new PrintRenderer(), {
      url: 'http://localhost:3000/print?paper_size=Letter',
    });
    await expect(render).rejects.not.toBeInstanceOf(QuestionBlockSizeOverflowError);
    await expect(render).rejects.toThrow('The printable page failed: Paged.js failed');
  });

  it('surfaces pagination failures that do not include an error message', async () => {
    createBrowserHarness({ printStatus: 'error' });

    await expect(
      renderPdf(new PrintRenderer(), { url: 'http://localhost:3000/print?paper_size=Letter' }),
    ).rejects.toThrow('The printable page failed: No pagination error was provided');
  });

  it('does not open a browser when closed before an admitted render starts', async () => {
    const renderer = new PrintRenderer();
    const render = renderPdf(renderer, { url: 'http://localhost:3000/print', timeoutMs: 0 });
    const failure = render.catch((error: unknown) => error);

    await renderer.close();

    expect(await failure).toMatchObject({ message: 'The print renderer has been closed' });
    expect(playwrightMocks.launch).not.toHaveBeenCalled();
  });

  it('rejects missing and unsuccessful page responses', async () => {
    createBrowserHarness({ response: null });
    await expect(
      renderPdf(new PrintRenderer(), { url: 'http://localhost:3000/print?paper_size=Letter' }),
    ).rejects.toThrow('The printable page did not return a response');

    createBrowserHarness({ response: { ok: () => false, status: () => 403 } as Response });
    await expect(
      renderPdf(new PrintRenderer(), { url: 'http://localhost:3000/print?paper_size=A4' }),
    ).rejects.toThrow('The printable page returned HTTP 403');
  });

  it('closes the browser and rejects queued renders on close()', async () => {
    const gate = createGate();
    const harness = createBrowserHarness({
      pdf: async () => {
        await gate.opened;
        return Buffer.from('%PDF-test');
      },
    });
    const renderer = new PrintRenderer();
    const active = renderPdf(renderer, { url: 'http://localhost:3000/print/active', timeoutMs: 0 });
    const queued = renderPdf(renderer, { url: 'http://localhost:3000/print/queued', timeoutMs: 0 });
    await vi.waitFor(() => expect(harness.pages).toHaveLength(1));

    await renderer.close();

    await expect(queued).rejects.toThrow('The print renderer has been closed');
    expect(harness.browser.close).toHaveBeenCalledOnce();
    await expect(renderPdf(renderer, { url: 'http://localhost:3000/print/late' })).rejects.toThrow(
      'The print renderer has been closed',
    );
    gate.open();
    await expect(active).resolves.toEqual(Buffer.from('%PDF-test'));
  });
});

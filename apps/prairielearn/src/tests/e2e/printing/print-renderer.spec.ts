import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Page } from 'playwright';

import { config } from '../../../lib/config.js';
import { createPdfOutput } from '../../../lib/printing/pdf-output.js';
import { PrintRenderer, type RenderPageOptions } from '../../../lib/printing/print-renderer.js';
import { expect, test } from '../fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

function readyHtml(body: string) {
  return `<!doctype html><html data-print-status="ready"><body>${body}</body></html>`;
}

function renderPdf(renderer: PrintRenderer, options: RenderPageOptions) {
  return renderer.render(options, createPdfOutput());
}

/**
 * Serves SVGs under `config.assetsPrefix`, except `redirect`, which redirects to `/destination`.
 * Requests under `held/` stay open until released, which keeps a render busy.
 */
async function startAssetServer() {
  const requests: string[] = [];
  const held = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  const hold = (path: string) => {
    let entry = held.get(path);
    if (!entry) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      entry = { promise, resolve };
      held.set(path, entry);
    }
    return entry;
  };
  const server: Server = createServer(async (request, response) => {
    const path = request.url!;
    requests.push(path);
    if (path.startsWith(`${config.assetsPrefix}/held/`)) await hold(path).promise;
    if (path === `${config.assetsPrefix}/redirect`) {
      response.writeHead(302, { Location: '/destination' });
      response.end();
    } else if (path.startsWith(`${config.assetsPrefix}/`)) {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(SVG);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    heldPath: (name: string) => `${config.assetsPrefix}/held/${name}`,
    release: (path: string) => hold(path).resolve(),
    waitForRequest: (path: string) => expect.poll(() => requests).toContain(path),
    close: async () => {
      for (const { resolve } of held.values()) resolve();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test('renders allowed same-origin assets and blocks other requests and redirects', async () => {
  const figurePath = `${config.assetsPrefix}/figure.svg`;
  const redirectPath = `${config.assetsPrefix}/redirect`;
  const server = await startAssetServer();
  const otherServer = await startAssetServer();
  const renderer = new PrintRenderer();
  try {
    const pdf = await renderPdf(renderer, {
      url: `${server.origin}/print`,
      html: readyHtml(
        `<img src="${figurePath}"><img src="/private"><img src="${otherServer.origin}${figurePath}">`,
      ),
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(server.requests).toContain(figurePath);
    expect(server.requests).not.toContain('/private');
    expect(otherServer.requests).toEqual([]);

    const pdfWithBlockedImage = await renderPdf(renderer, {
      url: `${server.origin}/print`,
      html: readyHtml(`<img src="${redirectPath}">`),
    });
    expect(pdfWithBlockedImage.subarray(0, 5).toString()).toBe('%PDF-');
    expect(server.requests).toContain(redirectPath);
    expect(server.requests).not.toContain('/destination');
  } finally {
    await renderer.close();
    await server.close();
    await otherServer.close();
  }
});

test('waits for the page to report its print status only when scripts run', async () => {
  const server = await startAssetServer();
  const renderer = new PrintRenderer();
  const setStatus = (status: string, error = '') =>
    `<!doctype html><html><body><script>
      setTimeout(() => {
        document.documentElement.dataset.printError = '${error}';
        document.documentElement.dataset.printStatus = '${status}';
      }, 100);
    </script></body></html>`;
  try {
    const pdf = await renderPdf(renderer, {
      url: `${server.origin}/print`,
      html: setStatus('ready'),
      runScripts: true,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    await expect(
      renderPdf(renderer, {
        url: `${server.origin}/print`,
        html: setStatus('error', 'Pagination failed'),
        runScripts: true,
      }),
    ).rejects.toThrow('The printable page failed: Pagination failed');

    await expect(
      renderPdf(renderer, { url: `${server.origin}/print`, html: setStatus('ready') }),
    ).rejects.toThrow('The printable page reported an unexpected status: null');
  } finally {
    await renderer.close();
    await server.close();
  }
});

test('renders one page at a time and bounds the wait queue', async () => {
  const server = await startAssetServer();
  const renderer = new PrintRenderer({ maxConcurrentRenders: 1, maxQueuedRenders: 2 });
  const firstPath = server.heldPath('first');
  const secondPath = server.heldPath('second');
  try {
    const first = renderPdf(renderer, {
      url: `${server.origin}/first`,
      html: readyHtml(`<img src="${firstPath}">`),
    });
    await server.waitForRequest(firstPath);

    const second = renderPdf(renderer, {
      url: `${server.origin}/second`,
      html: readyHtml(`<img src="${secondPath}">`),
    });
    const timedOut = renderPdf(renderer, {
      url: `${server.origin}/timed-out`,
      html: readyHtml('Timed out'),
      timeoutMs: 200,
    });
    const timeoutFailure = expect(timedOut).rejects.toThrow(
      'Timed out after 200 ms waiting to render the PDF',
    );
    await expect(
      renderPdf(renderer, { url: `${server.origin}/busy`, html: readyHtml('Busy') }),
    ).rejects.toThrow('Print rendering is busy');
    await timeoutFailure;

    const controller = new AbortController();
    const aborted = renderPdf(renderer, {
      url: `${server.origin}/aborted`,
      html: readyHtml('Aborted'),
      signal: controller.signal,
    });
    controller.abort(new Error('The request was closed'));
    await expect(aborted).rejects.toThrow('The request was closed');

    expect(server.requests).not.toContain(secondPath);
    server.release(firstPath);
    expect((await first).subarray(0, 5).toString()).toBe('%PDF-');
    await server.waitForRequest(secondPath);
    server.release(secondPath);
    expect((await second).subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await renderer.close();
    await server.close();
  }
});

test('cancels a render with an in-flight asset request and renders the next document', async () => {
  const server = await startAssetServer();
  const renderer = new PrintRenderer();
  try {
    await renderPdf(renderer, { url: `${server.origin}/warmup`, html: readyHtml('Warmup') });

    const timedOutPath = server.heldPath('timed-out');
    const timedOut = renderPdf(renderer, {
      url: `${server.origin}/timed-out`,
      html: readyHtml(`<img src="${timedOutPath}">`),
      timeoutMs: 5_000,
    });
    const timeoutFailure = expect(timedOut).rejects.toThrow(
      'Timed out after 5000 ms rendering the PDF',
    );
    await server.waitForRequest(timedOutPath);
    await timeoutFailure;

    const abortedPath = server.heldPath('aborted');
    const controller = new AbortController();
    const aborted = renderPdf(renderer, {
      url: `${server.origin}/aborted`,
      html: readyHtml(`<img src="${abortedPath}">`),
      signal: controller.signal,
    });
    await server.waitForRequest(abortedPath);
    controller.abort(new Error('The request was closed'));
    await expect(aborted).rejects.toThrow('The request was closed');

    const pdf = await renderPdf(renderer, {
      url: `${server.origin}/ready`,
      html: readyHtml('Next document'),
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await renderer.close();
    await server.close();
  }
});

test('relaunches Chromium after it disconnects between renders', async () => {
  const server = await startAssetServer();
  const renderer = new PrintRenderer();
  const options = { url: `${server.origin}/print`, html: readyHtml('Prepared pages') };
  const browserOutput = {
    label: 'browser',
    produce: async (page: Page) => page.context().browser()!,
  };
  try {
    const firstBrowser = await renderer.render(options, browserOutput);
    await firstBrowser.close();
    const nextBrowser = await renderer.render(options, browserOutput);
    expect(nextBrowser).not.toBe(firstBrowser);
    expect(nextBrowser.isConnected()).toBe(true);
  } finally {
    await renderer.close();
    await server.close();
  }
});

test('rejects queued and later renders once closed', async () => {
  const server = await startAssetServer();
  const renderer = new PrintRenderer();
  const heldPath = server.heldPath('active');
  try {
    const active = renderPdf(renderer, {
      url: `${server.origin}/active`,
      html: readyHtml(`<img src="${heldPath}">`),
    });
    const activeFailure = expect(active).rejects.toThrow();
    await server.waitForRequest(heldPath);
    const queued = renderPdf(renderer, {
      url: `${server.origin}/queued`,
      html: readyHtml('Queued'),
    });
    const queuedFailure = expect(queued).rejects.toThrow('The print renderer has been closed');

    await renderer.close();
    await queuedFailure;
    await activeFailure;
    await expect(
      renderPdf(renderer, { url: `${server.origin}/late`, html: readyHtml('Late') }),
    ).rejects.toThrow('The print renderer has been closed');
  } finally {
    await renderer.close();
    await server.close();
  }
});

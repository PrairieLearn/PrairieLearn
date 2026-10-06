import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Page } from '@playwright/test';

import { PrintRenderer } from '@prairielearn/printing';

import { expect, test } from './fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

test('renders allowed resources and blocks redirects before requesting their destination', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    if (request.url === '/redirect') {
      response.writeHead(302, {
        Location: `http://localhost:${(server.address() as AddressInfo).port}/destination`,
      });
      response.end();
    } else if (request.url === '/figure.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><html data-print-status="ready"><body><img src="/figure.svg"></body></html>',
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const renderer = new PrintRenderer();
  try {
    const pdf = await renderer.renderPdf({ url: `${origin}/print` });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(requests).toContain('/figure.svg');

    await expect(renderer.renderPdf({ url: `${origin}/redirect` })).rejects.toThrow();
    expect(requests).toContain('/redirect');
    expect(requests).not.toContain('/destination');
  } finally {
    await renderer.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('closes a failed render with an in-flight asset request and renders the next document', async () => {
  let resolveAssetRequest: () => void;
  const assetRequested = new Promise<void>((resolve) => {
    resolveAssetRequest = resolve;
  });
  const server = createServer((request, response) => {
    if (request.url === '/slow') {
      resolveAssetRequest();
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(
      request.url === '/failed'
        ? '<!doctype html><html><body><script>void fetch("/slow");</script></body></html>'
        : '<!doctype html><html data-print-status="ready"><body>Next document</body></html>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const renderer = new PrintRenderer();
  let renderPage: Page;
  try {
    const failedRender = renderer.render(
      { url: `${origin}/failed` },
      {
        label: 'test document',
        prepare: async (page) => {
          renderPage = page;
        },
        produce: async () => 'Unexpected output',
      },
    );
    const failure = expect(failedRender).rejects.toThrow(
      'The printable page failed: Broken question',
    );
    await assetRequested;
    await renderPage!.evaluate(() => {
      document.documentElement.dataset.printError = 'Broken question';
      document.documentElement.dataset.printStatus = 'error';
    });
    await failure;

    const pdf = await renderer.renderPdf({ url: `${origin}/ready` });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await renderer.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

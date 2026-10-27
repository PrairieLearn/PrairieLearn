import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { PrintRenderer, type RenderPageOptions } from '../../lib/printing/print-renderer.js';

import { expect, test } from './fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

function renderPdf(renderer: PrintRenderer, options: RenderPageOptions) {
  return renderer.render(options, {
    label: 'PDF',
    produce: async (page) => await page.pdf(),
  });
}

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
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const renderer = new PrintRenderer();
  try {
    const pdf = await renderPdf(renderer, {
      url: `${origin}/print`,
      html: '<!doctype html><html data-print-status="ready"><body><img src="/figure.svg"></body></html>',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(requests).toContain('/figure.svg');

    const pdfWithBlockedImage = await renderPdf(renderer, {
      url: `${origin}/print`,
      html: '<!doctype html><html data-print-status="ready"><body><img src="/redirect"></body></html>',
    });
    expect(pdfWithBlockedImage.subarray(0, 5).toString()).toBe('%PDF-');
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
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const renderer = new PrintRenderer();
  try {
    await renderPdf(renderer, {
      url: `${origin}/warmup`,
      html: '<!doctype html><html data-print-status="ready"><body>Warmup</body></html>',
    });

    const failedRender = renderPdf(renderer, {
      url: `${origin}/failed`,
      html: '<!doctype html><html data-print-status="ready"><body><img src="/slow"></body></html>',
      timeoutMs: 5_000,
    });
    const failure = expect(failedRender).rejects.toThrow(
      'Timed out after 5000 ms rendering the PDF',
    );
    const assetRequestStarted = await Promise.race([
      assetRequested.then(() => true),
      failure.then(() => false),
    ]);
    expect(assetRequestStarted).toBe(true);
    await failure;

    const pdf = await renderPdf(renderer, {
      url: `${origin}/ready`,
      html: '<!doctype html><html data-print-status="ready"><body>Next document</body></html>',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await renderer.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

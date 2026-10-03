import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

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

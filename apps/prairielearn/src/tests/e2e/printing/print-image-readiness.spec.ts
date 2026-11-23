import { type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { waitForPrintImages } from '../../../lib/client/printing/print-image-layout.js';
import { expect, test } from '../fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

test('waits for regular, lazy, and shadow-root images', async ({ page }) => {
  const responses = new Map<string, ServerResponse>();
  const server = createServer((request, response) => {
    responses.set(request.url!, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const sendImage = (response: ServerResponse) => {
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
  };
  try {
    await page.setContent(
      `<div id="source"><img src="${origin}/light.svg"><img srcset="${origin}/srcset.svg"><div id="host"></div><div style="height: 10000px"></div><img loading="lazy" src="${origin}/lazy.svg"></div>`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.locator('#host').evaluate((host, origin) => {
      const image = document.createElement('img');
      image.src = `${origin}/shadow.svg`;
      host.attachShadow({ mode: 'open' }).append(image);
    }, origin);
    await expect.poll(() => responses.size).toBe(3);
    expect(responses.has('/lazy.svg')).toBe(false);

    let complete = false;
    const waiting = page
      .locator('#source')
      .evaluate(waitForPrintImages, 30_000)
      .then((failedImages) => {
        complete = true;
        return failedImages;
      });
    await expect.poll(() => responses.has('/lazy.svg')).toBe(true);
    sendImage(responses.get('/light.svg')!);
    await page.waitForFunction(() => document.querySelector('img')!.complete);
    expect(complete).toBe(false);

    sendImage(responses.get('/shadow.svg')!);
    await page.waitForFunction(
      () => document.querySelector('#host')!.shadowRoot!.querySelector('img')!.complete,
    );
    expect(complete).toBe(false);

    sendImage(responses.get('/srcset.svg')!);
    await page.waitForFunction(
      () => document.querySelector<HTMLImageElement>('img[srcset]')!.complete,
    );
    expect(complete).toBe(false);

    sendImage(responses.get('/lazy.svg')!);
    expect(await waiting).toHaveLength(0);
    expect(complete).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

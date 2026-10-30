import { type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  waitForExcalidrawCanvases,
  waitForPrintImages,
} from '../../../lib/client/print-image-layout.js';
import { expect, test } from '../fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

test('waits for images in the question and its shadow roots', async ({ page }) => {
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
      `<div id="source"><img src="${origin}/light.svg"><img srcset="${origin}/srcset.svg"><div id="host"></div></div>`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.locator('#host').evaluate((host, origin) => {
      const image = document.createElement('img');
      image.src = `${origin}/shadow.svg`;
      host.attachShadow({ mode: 'open' }).append(image);
    }, origin);
    await expect.poll(() => responses.size).toBe(3);

    let complete = false;
    const waiting = page
      .locator('#source')
      .evaluate(waitForPrintImages)
      .then(() => {
        complete = true;
      });
    sendImage(responses.get('/light.svg')!);
    await page.waitForFunction(() => document.querySelector('img')!.complete);
    expect(complete).toBe(false);

    sendImage(responses.get('/shadow.svg')!);
    await page.waitForFunction(
      () => document.querySelector('#host')!.shadowRoot!.querySelector('img')!.complete,
    );
    expect(complete).toBe(false);

    sendImage(responses.get('/srcset.svg')!);
    await waiting;
    expect(complete).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('waits for each Excalidraw canvas to render', async ({ page }) => {
  await page.setContent(
    '<div id="source"><div class="excalidraw-root"></div><div class="excalidraw-root"></div></div>',
  );

  let complete = false;
  const waiting = page
    .locator('#source')
    .evaluate(waitForExcalidrawCanvases)
    .then(() => {
      complete = true;
    });

  const drawings = page.locator('.excalidraw-root');
  await drawings.first().evaluate((drawing) => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    drawing.append(canvas);
  });
  expect(complete).toBe(false);

  await drawings
    .first()
    .locator('canvas')
    .evaluate((canvas) => {
      canvas.setAttribute('width', '100');
      canvas.setAttribute('height', '100');
    });
  expect(complete).toBe(false);

  await drawings.last().evaluate((drawing) => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    drawing.append(canvas);
  });
  await waiting;
  expect(complete).toBe(true);
});

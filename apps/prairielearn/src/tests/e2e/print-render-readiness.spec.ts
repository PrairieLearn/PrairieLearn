import { waitForPrintableElements } from '../../lib/client/printing/print-render-readiness.js';

import { expect, test } from './fixtures.js';

test.use({ baseURL: '' });

test('waits for rendered elements before printing', async ({ page }) => {
  await page.setContent(
    '<div id="source"><div id="first" data-pl-render-status="pending"></div><div id="second" data-pl-render-status="pending"></div></div>',
  );

  let complete = false;
  const waiting = page
    .locator('#source')
    .evaluate(waitForPrintableElements)
    .then(() => {
      complete = true;
    });

  await page.locator('#first').evaluate((host) => {
    host.attachShadow({ mode: 'open', clonable: true }).innerHTML = '<span>Rendered content</span>';
    host.setAttribute('data-pl-render-status', 'ready');
  });
  expect(complete).toBe(false);

  await page.locator('#second').evaluate((host) => {
    host.setAttribute('data-pl-render-status', 'ready');
  });
  await waiting;
  expect(complete).toBe(true);
  expect(
    await page
      .locator('#first')
      .evaluate((host) => (host.cloneNode(true) as HTMLElement).shadowRoot?.textContent),
  ).toBe('Rendered content');
});

test('reports element rendering failures', async ({ page }) => {
  await page.setContent('<div id="source"><div data-pl-render-status="pending"></div></div>');

  const waiting = expect(
    page.locator('#source').evaluate(waitForPrintableElements),
  ).rejects.toThrow('A printable element could not be rendered');
  await page.locator('[data-pl-render-status]').evaluate((host) => {
    host.setAttribute('data-pl-render-status', 'error');
  });
  await waiting;
});

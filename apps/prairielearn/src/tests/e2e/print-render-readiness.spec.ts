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
    .evaluate(waitForPrintableElements, 30_000)
    .then((failedElements) => {
      complete = true;
      return failedElements;
    });

  await page.locator('#first').evaluate((host) => {
    host.attachShadow({ mode: 'open', clonable: true }).innerHTML = '<span>Rendered content</span>';
    host.setAttribute('data-pl-render-status', 'ready');
  });
  expect(complete).toBe(false);

  await page.locator('#second').evaluate((host) => {
    host.insertAdjacentHTML('afterend', '<div id="late" data-pl-render-status="pending"></div>');
    host.setAttribute('data-pl-render-status', 'ready');
  });
  expect(complete).toBe(false);

  await page.locator('#late').evaluate((host) => {
    host.setAttribute('data-pl-render-status', 'ready');
  });
  expect(await waiting).toHaveLength(0);
  expect(complete).toBe(true);
  expect(
    await page
      .locator('#first')
      .evaluate((host) => (host.cloneNode(true) as HTMLElement).shadowRoot?.textContent),
  ).toBe('Rendered content');
});

test('reports failed and stuck elements when the time runs out', async ({ page }) => {
  await page.setContent(
    '<div id="source"><div data-pl-render-status="error"></div><div data-pl-render-status="pending"></div><div data-pl-render-status="ready"></div></div>',
  );

  const failedElements = await page.locator('#source').evaluate(waitForPrintableElements, 100);
  expect(failedElements).toHaveLength(2);
});

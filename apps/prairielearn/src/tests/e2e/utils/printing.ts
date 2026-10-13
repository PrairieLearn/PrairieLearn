import type { Page } from '@playwright/test';

import { generateCsrfToken } from '../../../middlewares/csrfToken.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { expect } from '../fixtures.js';

export async function waitForPrintablePage(page: Page): Promise<void> {
  const root = page.locator(':root');
  await expect(root).toHaveAttribute('data-print-status', /^(ready|error)$/, { timeout: 120_000 });
  const state = await root.evaluate((element) => ({
    status: element.dataset.printStatus,
    error: element.dataset.printError,
  }));
  expect(state).toEqual({ status: 'ready', error: undefined });
}

export async function downloadPrintableWord(page: Page, paperUrl: string, search: string) {
  const source = await page.evaluate(() =>
    JSON.parse(document.getElementById('pl-print-docx-source')!.textContent),
  );
  const { id, html } = await page.evaluate(() => {
    const copy = document.documentElement.cloneNode(true) as HTMLElement;
    const id = copy.dataset.printSnapshotId!;
    copy.removeAttribute('data-print-snapshot-id');
    copy
      .querySelectorAll('script, noscript, iframe, meta[http-equiv="refresh"]')
      .forEach((node) => {
        node.remove();
      });
    return { id, html: `<!doctype html>\n${copy.outerHTML}` };
  });
  const { id: authnUserId } = await getConfiguredUser();
  return await page.request.post(`${paperUrl}/docx?${search}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': generateCsrfToken({ url: `${paperUrl}/docx`, authnUserId }),
    },
    data: JSON.stringify({ id, html, source }),
    timeout: 120_000,
  });
}

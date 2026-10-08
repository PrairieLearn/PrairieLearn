import fs from 'node:fs/promises';
import path from 'node:path';

import type { AssetsManifest } from '@prairielearn/compiled-assets';

import { expect, test } from './fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

test('reports missing print bootstrap through the page error state', async ({ page }) => {
  const buildDirectory = path.resolve(import.meta.dirname, '../../../public/build');
  const manifest: AssetsManifest = JSON.parse(
    await fs.readFile(path.join(buildDirectory, 'manifest.json'), 'utf8'),
  );
  await page.setContent(`
    <!doctype html><html data-print-status="loading"><body>
      <div id="exam-print-status" role="status">Preparing exam</div>
      <div id="exam-print-source"></div><div id="exam-print-pages"></div>
    </body></html>
  `);
  await page.addScriptTag({
    path: path.join(buildDirectory, manifest['scripts/examPrintingClient.ts'].assetPath),
  });
  await expect(page.locator('html')).toHaveAttribute('data-print-status', 'error');
  await expect(page.getByRole('status')).toHaveText(
    'Unable to paginate this exam: Exam printing bootstrap is missing',
  );
});

import fs from 'node:fs/promises';
import path from 'node:path';

import { Packer } from 'docx';
import * as unzipper from 'unzipper';

import type { AssetsManifest } from '@prairielearn/compiled-assets';

import type { DocxSource } from '../../lib/printing/docxBrowser.js';
import { createDocxDocument } from '../../lib/printing/docxDocument.js';

import { expect, test } from './fixtures.js';

// These browser-only tests do not need the application server.
test.use({ baseURL: '' });

test('exports shadow-root figures and visible slotted text from a paginated page', async ({
  page,
}) => {
  const appDirectory = path.resolve(import.meta.dirname, '../../..');
  const buildDirectory = path.join(appDirectory, 'public/build');
  const manifest: AssetsManifest = JSON.parse(
    await fs.readFile(path.join(buildDirectory, 'manifest.json'), 'utf8'),
  );
  await page.goto('about:blank');
  await page.setContent(`
    <!doctype html><html data-print-status="loading" data-print-include-cover="false" data-print-document="exam" data-print-paper-size="Letter"><body>
      <main id="exam-print-source" class="exam-print-document">
        <div class="exam-questions">
          <section class="printing-question printing-question-freeform" data-question-number="1">
            <div class="question-block"><div class="question-body">
              <div id="xss-test"><strong slot="term">Assigned text</strong><span>Unassigned content</span></div>
            </div></div>
          </section>
        </div>
      </main>
      <div id="exam-print-pages"></div>
    </body></html>
  `);
  await page.evaluate(() => {
    Reflect.set(window, 'PagedConfig', { auto: false });
    Reflect.set(window, '__PL_PRINT_READINESS_PROMISES__', []);
    const shadow = document
      .querySelector('#xss-test')!
      .attachShadow({ mode: 'open', clonable: true });
    shadow.innerHTML = `
      <style>.hidden { display: none; }</style>
      <p>Shadow question <slot name="term">Unused fallback</slot></p>
      <p><slot name="instructions">Fallback instructions</slot></p>
      <span class="hidden">Hidden answer</span>
      <div id="nested"></div>
      <svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" aria-label="Shadow diagram">
        <rect width="80" height="40" fill="red"/>
      </svg>
    `;
    shadow.querySelector('#nested')!.attachShadow({ mode: 'open', clonable: true }).innerHTML =
      '<p>Nested question text</p>';
  });
  await page.addStyleTag({
    path: path.join(buildDirectory, manifest['stylesheets/examPrinting.css'].assetPath),
  });
  await page.addStyleTag({ content: '@page { size: Letter; }' });
  await page.addScriptTag({
    path: path.join(appDirectory, 'node_modules/pagedjs/dist/paged.polyfill.min.js'),
  });
  await page.addScriptTag({
    path: path.join(buildDirectory, manifest['scripts/examPrintingClient.ts'].assetPath),
  });
  await expect(page.locator(':root')).toHaveAttribute('data-print-status', 'ready');

  const source = await page.evaluate(
    () => Reflect.get(window, '__PL_PRINT_DOCX_SOURCE__') as DocxSource | undefined,
  );
  expect(source).toBeDefined();
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector('.pagedjs_page')!.getBoundingClientRect();
    const area = document.querySelector('.pagedjs_area')!.getBoundingClientRect();
    return {
      pageWidth: sheet.width,
      pageHeight: sheet.height,
      marginTop: area.top - sheet.top,
      marginRight: sheet.right - area.right,
      marginBottom: sheet.bottom - area.bottom,
      marginLeft: area.left - sheet.left,
    };
  });
  const figures = await Promise.all(
    source!.figures.map(async (figure) => ({
      ...figure,
      png: await page.locator(`[data-docx-figure="${figure.id}"]`).first().screenshot(),
    })),
  );
  const docx = createDocxDocument({
    geometry,
    footerLabel: 'Shadow content exam',
    source: source!,
    figures,
  });
  const zip = await unzipper.Open.buffer(await Packer.toBuffer(docx));
  const documentXml = (
    await zip.files.find((file) => file.path === 'word/document.xml')!.buffer()
  ).toString('utf8');
  expect(documentXml).toContain('Shadow question');
  expect(documentXml.match(/Assigned text/g)).toHaveLength(1);
  expect(documentXml).toContain('Fallback instructions');
  expect(documentXml).toContain('Nested question text');
  expect(documentXml).not.toMatch(/Unused fallback|Unassigned content|Hidden answer|display: none/);
  expect(
    zip.files.filter((file) => file.path.startsWith('word/media/') && file.path.endsWith('.png')),
  ).toHaveLength(1);
});

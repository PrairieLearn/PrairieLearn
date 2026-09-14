import path from 'node:path';

import { test as base, expect } from '@playwright/test';

// Include the shared Window.MathJax declaration without running browser initialization in Node.
// eslint-disable-next-line unicorn/require-module-specifiers
import type {} from '../../lib/client/mathjax.js';

// Exercise the standalone element assets without starting a server or database.
const test = base.extend({ baseURL: 'http://file-editor.test' });
const appRoot = path.resolve(import.meta.dirname, '../../..');

interface SplitViewEditor {
  editor: {
    setValue: (value: string) => void;
    insert: (value: string) => void;
    setOptions: (options: { minLines: number; maxLines: number }) => void;
    getOption: (name: 'minLines' | 'maxLines') => number | undefined;
  };
}

declare global {
  interface Window {
    splitViewEditor: SplitViewEditor;
  }
}

const initial = 'A proof with $x_i^2$ and $\\sum_{i=1}^n i$.\n\nConclusion with $n$.';

test.beforeEach(async ({ page }) => {
  await page.route('http://file-editor.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
        <script type="importmap">{"imports":{"marked":"/node_modules/marked/lib/marked.esm.js","@prairielearn/marked-mathjax":"/node_modules/@prairielearn/marked-mathjax/dist/index.js"}}</script>
        <script>window.MathJax={options:{ignoreHtmlClass:'mathjax_ignore|tex2jax_ignore',processHtmlClass:'mathjax_process'},tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']]},svg:{linebreaks:{inline:false}},loader:{paths:{'mathjax-newcm':'/node_modules/@mathjax/mathjax-newcm-font'}}};</script>
        <script src="/node_modules/mathjax/tex-svg.js"></script>
        <script src="/node_modules/jquery/dist/jquery.min.js"></script>
        <script src="/node_modules/ace-builds/src-min-noconflict/ace.js"></script>
        <script src="/node_modules/dompurify/dist/purify.min.js"></script>
        <script src="/elements/pl-file-editor/pl-file-editor.js"></script>
        <link rel="stylesheet" href="/elements/pl-file-editor/pl-file-editor.css">
        <div id="file-editor-test"><input type="hidden"><div class="card">
          <div class="card-header file-editor-header"><button type="button" class="fullscreen-button" hidden><span class="fullscreen-label">Enter fullscreen</span></button></div>
          <div class="editor"></div><div class="card-footer file-editor-preview-label">Preview</div><div class="preview mathjax_process"></div>
        </div></div>`,
      });
      return;
    }
    await route.fulfill({
      path: path.join(appRoot, pathname),
      contentType: pathname.endsWith('.js')
        ? 'text/javascript'
        : pathname.endsWith('.css')
          ? 'text/css'
          : 'application/octet-stream',
    });
  });
  await page.goto('/');
  await page.evaluate(async (value) => {
    await window.MathJax.startup.promise;
    // The constructor is supplied by the standalone script, not a module import.
    const { PLFileEditor } = window as unknown as {
      PLFileEditor: new (uuid: string, options: Record<string, unknown>) => SplitViewEditor;
    };
    window.splitViewEditor = new PLFileEditor('test', {
      preview: 'markdown',
      currentContents: btoa(value),
      readOnly: false,
    });
  }, initial);
  await expect(page.locator('.preview mjx-container')).toHaveCount(3);
});

test('fullscreen places the live editor and preview side by side and restores layout', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  const overlay = await page.getByRole('dialog', { name: 'File editor' }).boundingBox();
  expect(overlay).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  const editor = await page.locator('.editor').boundingBox();
  const preview = await page.locator('.preview').boundingBox();
  expect(preview!.x).toBeGreaterThanOrEqual(editor!.x + editor!.width - 1);
  expect(Math.abs(editor!.y - preview!.y)).toBeLessThan(1);
  expect(editor!.height).toBeGreaterThan(400);
  await page.evaluate(() => window.splitViewEditor.editor.setValue('Fullscreen answer $x$'));
  expect(await page.locator('input').inputValue()).toBe(btoa('Fullscreen answer $x$'));
  await expect(page.locator('.preview')).toContainText('Fullscreen answer');
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  const restoredEditor = await page.locator('.editor').boundingBox();
  const restoredPreview = await page.locator('.preview').boundingBox();
  expect(restoredPreview!.y).toBeGreaterThanOrEqual(restoredEditor!.y + restoredEditor!.height);
  expect(await page.locator('input').inputValue()).toBe(btoa('Fullscreen answer $x$'));
});

test('Escape closes the viewport overlay and restores editor height options', async ({ page }) => {
  await page.evaluate(() =>
    window.splitViewEditor.editor.setOptions({ minLines: 5, maxLines: Infinity }),
  );
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  expect(await page.evaluate(() => window.splitViewEditor.editor.getOption('maxLines'))).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  expect(await page.evaluate(() => window.splitViewEditor.editor.getOption('minLines'))).toBe(5);
  expect(await page.evaluate(() => window.splitViewEditor.editor.getOption('maxLines'))).toBe(
    Infinity,
  );
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeFocused();
});

test('overlay contains focus and restores page scrolling on close', async ({ page }) => {
  await page.evaluate(() => {
    document.body.style.overflow = 'auto';
    const backgroundButton = document.createElement('button');
    backgroundButton.textContent = 'Background action';
    document.body.append(backgroundButton);
  });
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.getByRole('button', { name: 'Background action', includeHidden: true }).focus();
  expect(
    await page.evaluate(() =>
      document.querySelector('#file-editor-test')!.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('auto');
});

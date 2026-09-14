import fs from 'node:fs/promises';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

test.beforeEach(async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'demo/imageCapture',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
});

test('converts HEIC to a resized JPEG and submits it', async ({ page }) => {
  const converterRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/heic-to/')) converterRequests.push(request.url());
  });
  const input = page.getByLabel('Upload image').first();
  const hiddenInput = page.locator('.js-hidden-capture-input').first();
  const buffer = await fs.readFile(new URL('fixtures/imageCapture/large.heic', import.meta.url));

  expect(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/heic-to/')),
    ),
  ).toHaveLength(0);
  await input.setInputFiles({ name: 'photo.HEIC', mimeType: '', buffer });
  await expect(hiddenInput).toHaveValue(/^data:image\/jpeg;base64,/);
  expect(converterRequests).toHaveLength(1);
  await expect(
    page.getByRole('status', { name: 'Image upload', includeHidden: true }).first(),
  ).toBeEmpty();
  await expect(page.getByAltText('Captured image preview').first()).toBeVisible();
  const dimensions = await hiddenInput.evaluate(async (element: HTMLInputElement) => {
    const image = new Image();
    image.src = element.value;
    await image.decode();
    return [image.width, image.height];
  });
  expect(dimensions).toEqual([2000, 1000]);

  await page.getByRole('button', { name: 'Crop/rotate' }).first().click();
  await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByAltText('Captured image preview').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('converted-heic.png') });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByAltText('Captured image preview').first()).toBeVisible();
  await expect(page.getByText('Failed to load submission', { exact: false })).toHaveCount(0);
});

test('preserves the previous image after conversion failure and allows retry', async ({ page }) => {
  const input = page.getByLabel('Upload image').first();
  const hiddenInput = page.locator('.js-hidden-capture-input').first();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  await input.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png });
  await expect(hiddenInput).toHaveValue(/^data:image\/png;base64,/);
  const previousValue = await hiddenInput.inputValue();
  const invalidFile = {
    name: 'image.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('invalid'),
  };
  await input.setInputFiles(invalidFile);
  await expect(page.getByRole('status', { name: 'Image upload' }).first()).toHaveText(
    'Could not load this image. Try uploading a JPEG or PNG.',
  );
  await expect(hiddenInput).toHaveValue(previousValue);
  await expect(page.getByAltText('Captured image preview').first()).toBeVisible();
  await expect(input).toHaveValue('');
  await input.setInputFiles(invalidFile);
  await expect(page.getByRole('status', { name: 'Image upload' }).first()).toHaveText(
    'Could not load this image. Try uploading a JPEG or PNG.',
  );
  await expect(hiddenInput).toHaveValue(previousValue);
  await expect(page.getByAltText('Captured image preview').first()).toBeVisible();
});

test('a newer upload supersedes a pending HEIC conversion', async ({ page }) => {
  let releaseConverter!: () => void;
  const converterGate = new Promise<void>((resolve) => {
    releaseConverter = resolve;
  });
  await page.route('**/heic-to/dist/csp/heic-to.min.js', async (route) => {
    await converterGate;
    await route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function heicTo() { throw new Error("conversion failed"); }',
    });
  });
  const input = page.getByLabel('Upload image').first();
  await input.setInputFiles({
    name: 'image.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('pending'),
  });
  await expect(page.getByText('Loading...', { exact: true }).first()).toBeAttached();
  await expect(page.locator('.js-uploaded-image-container .spinner-border').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('upload-loading.png') });
  await input.setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('.js-hidden-capture-input').first()).toHaveValue(/^data:image\/png;/);
  const response = page.waitForResponse('**/heic-to/dist/csp/heic-to.min.js');
  releaseConverter();
  await response;
  await expect(
    page.getByRole('status', { name: 'Image upload', includeHidden: true }).first(),
  ).toBeEmpty();
});

test('deletion supersedes a pending conversion', async ({ page }) => {
  const input = page.getByLabel('Upload image').first();
  const hiddenInput = page.locator('.js-hidden-capture-input').first();
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  await input.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer });
  await expect(hiddenInput).toHaveValue(/^data:image\/png;/);

  let releaseConverter!: () => void;
  const converterGate = new Promise<void>((resolve) => {
    releaseConverter = resolve;
  });
  await page.route('**/heic-to/dist/csp/heic-to.min.js', async (route) => {
    await converterGate;
    await route.fulfill({
      contentType: 'text/javascript',
      body: `export async function heicTo({ blob }) {
        return new Blob([await blob.arrayBuffer()], { type: 'image/png' });
      }`,
    });
  });
  // Wait for the stale upload's FileReader callback, not just the converter download.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Called with the original receiver below.
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      this.addEventListener('loadend', () => {
        document.body.dataset.uploadRead = 'true';
      });
      read.call(this, blob);
    };
  });
  await input.setInputFiles({ name: 'image.heic', mimeType: 'image/heic', buffer });
  await expect(page.locator('.js-uploaded-image-container .spinner-border').first()).toBeVisible();
  const deleteButton = page.getByRole('button', { name: /Delete/ });
  // The existing delete handler is attached after the popover's opening transition.
  const popoverShown = deleteButton.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.addEventListener('shown.bs.popover', () => resolve(), { once: true });
      }),
  );
  await deleteButton.click();
  await popoverShown;
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(hiddenInput).toHaveValue('');
  releaseConverter();
  await expect(page.locator('body')).toHaveAttribute('data-upload-read', 'true');
  await expect(hiddenInput).toHaveValue('');
  await expect(page.getByAltText('Captured image preview')).toHaveCount(0);
  await expect(page.getByText('No image captured yet.', { exact: false }).first()).toBeVisible();
});

test('deletion supersedes an upload waiting for image decoding', async ({ page }) => {
  const input = page.getByLabel('Upload image').first();
  const hiddenInput = page.locator('.js-hidden-capture-input').first();
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  await input.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer });
  await expect(hiddenInput).toHaveValue(/^data:image\/png;/);
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Called with the original receiver below.
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      document.body.dataset.decodeStarted = 'true';
      await new Promise<void>((resolve) => {
        document.addEventListener('release-image-decode', () => resolve(), { once: true });
      });
      document.body.dataset.decodeFinished = 'true';
    };
  });
  await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer });
  await expect(page.locator('body')).toHaveAttribute('data-decode-started', 'true');
  const deleteButton = page.getByRole('button', { name: /Delete/ });
  // The existing delete handler is attached after the popover's opening transition.
  const popoverShown = deleteButton.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.addEventListener('shown.bs.popover', () => resolve(), { once: true });
      }),
  );
  await deleteButton.click();
  await popoverShown;
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(hiddenInput).toHaveValue('');
  await page.evaluate(() => document.dispatchEvent(new Event('release-image-decode')));
  await expect(page.locator('body')).toHaveAttribute('data-decode-finished', 'true');
  await expect(hiddenInput).toHaveValue('');
  await expect(page.getByAltText('Captured image preview')).toHaveCount(0);
});

test('a decoding failure restores the previous preview and submission', async ({ page }) => {
  const input = page.getByLabel('Upload image').first();
  const hiddenInput = page.locator('.js-hidden-capture-input').first();
  await input.setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(hiddenInput).toHaveValue(/^data:image\/png;/);
  const previousValue = await hiddenInput.inputValue();
  await input.setInputFiles({
    name: 'broken.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('invalid image'),
  });
  await expect(page.getByRole('status', { name: 'Image upload' }).first()).toHaveText(
    'Could not load this image. Try uploading a JPEG or PNG.',
  );
  await expect(hiddenInput).toHaveValue(previousValue);
  await expect(page.getByAltText('Captured image preview').first()).toBeVisible();
});

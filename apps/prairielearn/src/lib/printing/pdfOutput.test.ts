import type { Page } from 'playwright';
import { expect, it, vi } from 'vitest';

import { createPdfOutput } from './pdfOutput.js';

it.each([
  ['A4', 'A4'],
  [undefined, 'Letter'],
] as const)('prints %s pages on %s sheets', async (paperSize, format) => {
  const emulateMedia = vi.fn(async () => undefined);
  const pdf = vi.fn(async () => Buffer.from('%PDF'));
  const page = {
    emulateMedia,
    evaluate: vi.fn(async () => paperSize),
    pdf,
  } as unknown as Page;

  await createPdfOutput().produce(page);

  expect(emulateMedia).toHaveBeenCalledWith({ media: 'print' });
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ format }));
});

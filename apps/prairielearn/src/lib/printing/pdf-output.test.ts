import type { Page } from 'playwright';
import { expect, it, vi } from 'vitest';

import { createPdfOutput } from './pdf-output.js';

it('uses the page CSS for paper size', async () => {
  const emulateMedia = vi.fn(async () => undefined);
  const pdf = vi.fn(async () => Buffer.from('%PDF'));
  const page = {
    emulateMedia,
    pdf,
  } as unknown as Page;

  const output = await createPdfOutput().produce(page);

  expect(emulateMedia).toHaveBeenCalledWith({ media: 'print' });
  expect(pdf).toHaveBeenCalledWith({
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
    printBackground: true,
    tagged: true,
  });
  expect(output).toEqual(Buffer.from('%PDF'));
});

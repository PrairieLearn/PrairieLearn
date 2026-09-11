import { type PageCodeOptions, addPdfPageCodes } from './pageCode.js';
import type { PrintablePageOutput } from './printRenderer.js';

export const PAPER_SIZES = ['Letter', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/** Prints the paginated page with Chromium's PDF engine; the page's `@page` CSS sets the sheet size. */
export function createPdfOutput(pageCode?: PageCodeOptions): PrintablePageOutput<Buffer> {
  return {
    label: 'PDF',
    produce: async (page) => {
      if (pageCode) await addPdfPageCodes(page, pageCode);
      await page.emulateMedia({ media: 'print' });
      return await page.pdf({
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
        printBackground: true,
        tagged: true,
      });
    },
  };
}

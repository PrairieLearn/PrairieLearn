import { type PageCodeOptions, addPdfPageCodes } from './pageCode.js';
import type { PrintablePageOutput } from './printablePageOutput.js';

/** Prints the paginated page with Chromium's PDF engine at the selected sheet size. */
export function createPdfOutput(pageCode?: PageCodeOptions): PrintablePageOutput<Buffer> {
  return {
    label: 'PDF',
    produce: async (page) => {
      if (pageCode) await addPdfPageCodes(page, pageCode);
      await page.emulateMedia({ media: 'print' });
      const paperSize = await page.evaluate(() => document.documentElement.dataset.printPaperSize);
      return await page.pdf({
        format: paperSize === 'A4' ? 'A4' : 'Letter',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        printBackground: true,
        tagged: true,
      });
    },
  };
}

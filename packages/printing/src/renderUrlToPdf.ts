import { type RenderPrintablePageOptions, renderPrintablePage } from './printablePage.js';

export const PAPER_SIZES = ['Letter', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export type RenderUrlToPdfOptions = RenderPrintablePageOptions;

export function renderUrlToPdf(options: RenderUrlToPdfOptions): Promise<Buffer> {
  return renderPrintablePage(options, {
    outputLabel: 'PDF',
    produce: async (page) => {
      await page.emulateMedia({ media: 'print' });
      return await page.pdf({
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
        printBackground: true,
        tagged: true,
      });
    },
  });
}

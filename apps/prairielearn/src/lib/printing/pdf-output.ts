import { preparePdfAccessibility } from './pdf-accessibility-browser.js';
import { PrintPdfAccessibilityError } from './pdf-accessibility-error.js';
import { finalizePrintPdf } from './pdf-accessibility.js';
import type { PrintablePageOutput } from './printable-page-output.js';

export const PAPER_SIZES = ['Letter', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/** Print the paginated page and restore source-declared PDF semantics. */
export function createPdfOutput(): PrintablePageOutput<Buffer> {
  return {
    label: 'PDF',
    produce: async (page, signal) => {
      await page.emulateMedia({ media: 'print' });
      const manifest = await page.evaluate(preparePdfAccessibility);
      if ('error' in manifest) throw new PrintPdfAccessibilityError(manifest.error);
      signal?.throwIfAborted();
      const pdf = await page.pdf({
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
        printBackground: true,
        tagged: true,
      });
      return await finalizePrintPdf(pdf, manifest, signal);
    },
  };
}

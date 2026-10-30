import { preparePdfAccessibility } from './pdf-accessibility-browser.js';
import { PrintPdfAccessibilityError } from './pdf-accessibility-error.js';
import { finalizePrintPdf } from './pdf-accessibility.js';
import type { PrintablePageOutput } from './printable-page-output.js';

/** Print the paginated page and restore source-declared PDF semantics. */
export function createPdfOutput({ accessible = true } = {}): PrintablePageOutput<Buffer> {
  return {
    label: 'PDF',
    produce: async (page, signal) => {
      await page.emulateMedia({ media: 'print' });
      const manifest = accessible ? await page.evaluate(preparePdfAccessibility) : null;
      if (manifest && 'error' in manifest) throw new PrintPdfAccessibilityError(manifest.error);
      signal?.throwIfAborted();
      const pdf = await page.pdf({
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
        printBackground: true,
        tagged: accessible,
      });
      return manifest ? await finalizePrintPdf(pdf, manifest, signal) : pdf;
    },
  };
}

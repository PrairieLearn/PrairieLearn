import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { preparePdfAccessibility } from './pdf-accessibility-browser.js';
import { finalizePrintPdf, validatePrintPdf, withPrintPdfDirectory } from './pdf-tools.js';
import type { PrintablePageOutput } from './printable-page-output.js';

/** Prints the paginated page, restores source-declared PDF semantics, and validates the final bytes. */
export function createPdfOutput(): PrintablePageOutput<Buffer> {
  return {
    label: 'PDF',
    produce: async (page, signal) => {
      await page.emulateMedia({ media: 'print' });
      const manifest = await page.evaluate(preparePdfAccessibility);
      return await withPrintPdfDirectory(async (directory) => {
        const input = path.join(directory, 'rendered.pdf');
        const output = path.join(directory, 'accessible.pdf');
        await page.pdf({
          path: input,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          preferCSSPageSize: true,
          printBackground: true,
          tagged: true,
        });
        await finalizePrintPdf(input, output, manifest, signal);
        await validatePrintPdf(output, signal);
        return await readFile(output);
      });
    },
  };
}

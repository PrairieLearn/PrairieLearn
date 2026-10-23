import { Packer } from 'docx';
import type { Page } from 'playwright';

import type { DocxSource } from './docx-browser.js';
import type { DocxFigure } from './docx-content-context.js';
import { type PrintedPageGeometry, createDocxDocument } from './docx-document.js';
import type { PrintableCover } from './printable-cover.js';
import type { PrintablePageOutput } from './printable-page-output.js';

const IMAGE_DEVICE_SCALE_FACTOR = 2;

export interface DocxOutputOptions {
  /** Editable source captured by the preview before pagination. */
  source: DocxSource;
  /**
   * The optional cover page content. Omit it to start with the questions. A function receives the paginated page's root `data-*` attributes,
   * which lets callers include values that are only known after the page has rendered.
   */
  cover?:
    | PrintableCover
    | ((pageDataset: Readonly<Record<string, string | undefined>>) => PrintableCover);
  /** Text placed before the page counter in every footer, for example `Form ID 13`. */
  footerLabel: string;
}

/** Builds an editable Word document from questions captured before pagination. */
export function createDocxOutput({
  cover,
  footerLabel,
  source,
}: DocxOutputOptions): PrintablePageOutput<Buffer> {
  return {
    label: 'DOCX',
    deviceScaleFactor: IMAGE_DEVICE_SCALE_FACTOR,
    produce: async (page) => {
      const pageDataset = await page.evaluate(() => ({ ...document.documentElement.dataset }));
      const geometry = await readPrintedPageGeometry(page);
      const figures: DocxFigure[] = [];
      for (const figure of source.figures) {
        const element = page.locator(`.pagedjs_page [data-docx-figure="${figure.id}"]`).first();
        figures.push({
          ...figure,
          png: await element.screenshot({ type: 'png', scale: 'device' }),
        });
      }
      const wordDocument = createDocxDocument({
        geometry,
        cover: typeof cover === 'function' ? cover(pageDataset) : cover,
        footerLabel,
        source,
        figures,
      });
      return await Packer.toBuffer(wordDocument);
    },
  };
}

async function readPrintedPageGeometry(page: Page): Promise<PrintedPageGeometry> {
  return await page.evaluate(() => {
    const firstPage = document.querySelector('.pagedjs_page');
    const contentArea = firstPage?.querySelector('.pagedjs_area');
    if (!firstPage || !contentArea) {
      throw new Error('The printable page did not produce any paginated pages');
    }
    const pageRect = firstPage.getBoundingClientRect();
    const areaRect = contentArea.getBoundingClientRect();
    return {
      pageWidth: pageRect.width,
      pageHeight: pageRect.height,
      marginTop: areaRect.top - pageRect.top,
      marginRight: pageRect.right - areaRect.right,
      marginBottom: pageRect.bottom - areaRect.bottom,
      marginLeft: areaRect.left - pageRect.left,
    };
  });
}

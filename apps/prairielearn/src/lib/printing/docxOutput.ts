import type { Page } from 'playwright';

import { compiledScriptPath } from '../assets.js';

import type { DocxSource } from './docxBrowser.js';
import type { DocxFigure } from './docxContent.js';
import type { PrintedPageGeometry } from './docxDocument.js';
import type { PrintableCover } from './printableCover.js';
import type { PrintablePageOutput } from './printablePageOutput.js';

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

/** Builds editable Word content from the normalized, unpaginated questions. */
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
      await page.addScriptTag({ url: compiledScriptPath('printDocxClient.ts') });
      const bytes = await page.evaluate(
        async (options) => {
          const build = Reflect.get(window, '__PL_BUILD_PRINT_DOCX__') as
            ((value: typeof options) => Promise<number[]>) | undefined;
          if (!build) throw new Error('Word builder did not load');
          return await build(options);
        },
        {
          geometry,
          cover: typeof cover === 'function' ? cover(pageDataset) : cover,
          footerLabel,
          source,
          figures: figures.map((figure) => ({ ...figure, png: Array.from(figure.png) })),
        },
      );
      return Buffer.from(bytes);
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

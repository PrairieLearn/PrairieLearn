import type { Page } from 'playwright';

import { generateQrCodeSvg } from '@prairielearn/qr-code';

export interface PageCodeOptions {
  /** Supplies application-owned, versioned metadata for a one-based physical page number. */
  encodePage: (pageNumber: number) => string;
}

async function generatePageCodes(count: number, options: PageCodeOptions): Promise<string[]> {
  return await Promise.all(
    Array.from({ length: count }, (_, index) => generateQrCodeSvg(options.encodePage(index + 1))),
  );
}

/** This function also runs through Playwright's evaluate, so it must be self-contained. */
async function insertPageCodes(svgs: string[]): Promise<void> {
  const images = Array.from(document.querySelectorAll('.pagedjs_page'), (sheet, index) => {
    const code = document.createElement('img');
    code.className = 'printing-page-code';
    code.alt = `Page ${index + 1} identification code`;
    code.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgs[index])}`;
    const footer = sheet.querySelector('.pagedjs_margin-bottom-left .pagedjs_margin-content');
    if (!footer) throw new Error('The printable page has no QR code footer area');
    footer.replaceChildren(code);
    return code;
  });
  await Promise.all(images.map((image) => image.decode()));
}

/** Inserts preview codes after pagination, before the page reports that it is ready. */
export async function addPreviewPageCodes(options: PageCodeOptions): Promise<void> {
  const codes = await generatePageCodes(document.querySelectorAll('.pagedjs_page').length, options);
  await insertPageCodes(codes);
}

/** Replaces preview codes with the final export's identity without changing pagination. */
export async function addPdfPageCodes(page: Page, options: PageCodeOptions): Promise<void> {
  const codes = await generatePageCodes(await page.locator('.pagedjs_page').count(), options);
  await page.evaluate(insertPageCodes, codes);
}

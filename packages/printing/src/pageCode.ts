import type { Page } from 'playwright';

import { generateQrCodeSvg } from '@prairielearn/qr-code';

export interface PageCodeOptions {
  /** Supplies application-owned, versioned metadata for a one-based physical page number. */
  encodePage: (pageNumber: number) => string;
}

/** Inserts codes into space reserved by the printable template, after final pagination. */
export async function addPdfPageCodes(page: Page, options: PageCodeOptions): Promise<void> {
  const count = await page.locator('.pagedjs_page').count();
  const codes = await Promise.all(
    Array.from({ length: count }, (_, index) => generateQrCodeSvg(options.encodePage(index + 1))),
  );
  await page.evaluate((svgs) => {
    document.querySelectorAll<HTMLElement>('.pagedjs_page').forEach((sheet, index) => {
      const code = document.createElement('img');
      code.className = 'printing-page-code';
      code.alt = `Page ${index + 1} identification code`;
      code.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgs[index])}`;
      const footer = sheet.querySelector('.pagedjs_margin-bottom-left .pagedjs_margin-content');
      if (!footer) throw new Error('The printable page has no QR code footer area');
      footer.replaceChildren(code);
    });
  }, codes);
  await page.locator('.printing-page-code').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
  });
}

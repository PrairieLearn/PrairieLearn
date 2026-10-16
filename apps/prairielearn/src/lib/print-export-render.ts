import type { PDFDocument } from 'pdf-lib';

import { HttpStatusError } from '@prairielearn/error';

import { config } from './config.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { type PaperSize, createPdfOutput } from './printing/pdf-output.js';
import { type PrintDocument, getPrintRenderer, validatePrintDocument } from './printing.js';

export interface PrintExportWork {
  document: 'exam' | 'answer_key' | 'booklet';
  copies: number;
  filename: string;
  snapshots: {
    formLabel: string;
    paperSize: PaperSize;
    printDocument: PrintDocument;
    previewUrl: string;
    html: string;
  }[];
  covers: { name: string; base64: string }[];
  cookieHeader?: string;
}

export async function renderPrintExport(
  work: PrintExportWork,
  parsedCovers?: PDFDocument[],
): Promise<Buffer> {
  const covers =
    parsedCovers ??
    (await readPrintCoverPages(
      work.covers.map(
        ({ name, base64 }) =>
          new File([Buffer.from(base64, 'base64')], name, { type: 'application/pdf' }),
      ),
    ));
  const renderer = getPrintRenderer();
  const forms: { pdf: Buffer; coverPageCount: number }[] = [];
  const answerKeys: Buffer[] = [];
  for (const snapshot of work.snapshots) {
    const pdfOutput = createPdfOutput();
    const rendered = await renderer.render(
      {
        url: snapshot.previewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: snapshot.html,
        cookieHeader: work.cookieHeader,
      },
      {
        label: work.document === 'booklet' ? 'booklet PDF' : 'PDF',
        produce: async (page) => {
          const identity = await page.evaluate(() => ({
            document: document.documentElement.dataset.printDocument,
            formLabel: document.documentElement.dataset.printFormLabel,
            paperSize: document.documentElement.dataset.printPaperSize,
          }));
          if (
            identity.document !== snapshot.printDocument ||
            identity.formLabel !== snapshot.formLabel ||
            identity.paperSize !== snapshot.paperSize
          ) {
            throw new HttpStatusError(400, 'The printable pages do not match the selected form.');
          }
          const state = await validatePrintDocument(page);
          return { pdf: await pdfOutput.produce(page), coverPageCount: state.coverPageCount };
        },
      },
    );
    if (work.document === 'booklet' && snapshot.printDocument === 'answer_key') {
      answerKeys.push(rendered.pdf);
    } else {
      forms.push(rendered);
    }
  }
  return await assemblePrintPacket({ forms, covers, copies: work.copies, answerKeys });
}

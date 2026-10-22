import type { PDFDocument } from 'pdf-lib';

import { HttpStatusError } from '@prairielearn/error';

import { config } from './config.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { createPdfOutput } from './printing/pdf-output.js';
import type { PrintAssetScope } from './printing/print-asset-access.js';
import { type PrintDocument, getPrintRenderer, validatePrintDocument } from './printing.js';

export interface PrintExportWork {
  document: 'exam' | 'answer_key' | 'booklet';
  copies: number;
  filename: string;
  snapshots: {
    formLabel: string;
    printDocument: PrintDocument;
    previewUrl: string;
    html: string;
    assetScope: PrintAssetScope;
  }[];
  covers: { name: string; base64: string }[];
}

export async function renderPrintExport(
  work: PrintExportWork,
  parsedCovers?: PDFDocument[],
  shutdownSignal?: AbortSignal,
): Promise<Buffer> {
  const covers =
    parsedCovers ??
    (await readPrintCoverPages(
      work.covers.map(
        ({ name, base64 }) =>
          new File([Buffer.from(base64, 'base64')], name, { type: 'application/pdf' }),
      ),
    ));
  if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
  const renderer = getPrintRenderer();
  const forms: { pdf: Buffer; coverPageCount: number }[] = [];
  const answerKeys: Buffer[] = [];
  for (const snapshot of work.snapshots) {
    if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
    const pdfOutput = createPdfOutput();
    const rendered = await renderer.render(
      {
        url: snapshot.previewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: snapshot.html,
        assetScope: snapshot.assetScope,
      },
      {
        label: work.document === 'booklet' ? 'booklet PDF' : 'PDF',
        produce: async (page) => {
          const identity = await page.evaluate(() => ({
            document: document.documentElement.dataset.printDocument,
            formLabel: document.documentElement.dataset.printFormLabel,
          }));
          if (
            identity.document !== snapshot.printDocument ||
            identity.formLabel !== snapshot.formLabel
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
  if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
  return await assemblePrintPacket({ forms, covers, copies: work.copies, answerKeys });
}

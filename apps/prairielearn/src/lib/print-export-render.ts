import { HttpStatusError } from '@prairielearn/error';

import { config } from './config.js';
import { type PrintCover, assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { type PrintDocument, getPrintRenderer, validatePrintDocument } from './printing/index.js';
import { createPdfOutput } from './printing/pdf-output.js';
import type { PrintAssetScope } from './printing/print-asset-access.js';

export interface PrintExportWork {
  document: 'assessment' | 'answer_key' | 'booklet';
  copies: number;
  filename: string;
  snapshots: {
    formLabel: string;
    printDocument: PrintDocument;
    localPreviewUrl: string;
    html: string;
    assetScope: PrintAssetScope;
  }[];
  covers: { name: string; base64: string }[];
}

export async function renderPrintExport(
  work: PrintExportWork,
  parsedCovers?: PrintCover[],
  shutdownSignal?: AbortSignal,
): Promise<Buffer> {
  const covers =
    parsedCovers ??
    (await readPrintCoverPages(
      work.covers.map(
        ({ name, base64 }) =>
          new File([Buffer.from(base64, 'base64')], name, { type: 'application/pdf' }),
      ),
      shutdownSignal,
    ));
  if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
  const renderer = getPrintRenderer();
  const forms: { pdf: Buffer; coverPageCount: number }[] = [];
  const answerKeys: Buffer[] = [];
  const pdfOutput = createPdfOutput({
    accessible:
      work.document !== 'booklet' &&
      work.snapshots.length === 1 &&
      work.copies === 1 &&
      covers.length === 0,
  });
  for (const snapshot of work.snapshots) {
    if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
    const rendered = await renderer.render(
      {
        url: snapshot.localPreviewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: snapshot.html,
        assetScope: snapshot.assetScope,
        signal: shutdownSignal,
      },
      {
        label: work.document === 'booklet' ? 'booklet PDF' : 'PDF',
        produce: async (page, signal) => {
          const identity = await page.evaluate(() => ({
            document: document.documentElement.dataset.printDocument,
            formLabel: document.documentElement.dataset.printFormLabel,
          }));
          shutdownSignal?.throwIfAborted();
          if (
            identity.document !== snapshot.printDocument ||
            identity.formLabel !== snapshot.formLabel
          ) {
            throw new HttpStatusError(400, 'The printable pages do not match the selected form.');
          }
          const state = await validatePrintDocument(page);
          shutdownSignal?.throwIfAborted();
          return {
            pdf: await pdfOutput.produce(page, signal),
            coverPageCount: state.coverPageCount,
          };
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
  return await assemblePrintPacket({
    forms,
    covers,
    copies: work.copies,
    answerKeys,
    signal: shutdownSignal,
  });
}

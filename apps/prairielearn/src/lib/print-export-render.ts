import type { Page } from 'playwright';

import { HttpStatusError } from '@prairielearn/error';

import { config } from './config.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import type { DocxSource } from './printing/docx-browser.js';
import { createDocxOutput } from './printing/docx-output.js';
import {
  type PrintDocument,
  getPrintRenderer,
  isBrowserRenderingAvailable,
  validatePrintDocument,
} from './printing/index.js';
import { createPdfOutput } from './printing/pdf-output.js';
import type { PrintFormAssetScope } from './printing/print-asset-access.js';
import type { PrintableCover } from './printing/printable-cover.js';

interface PrintExportSnapshot {
  formLabel: string;
  printDocument: PrintDocument;
  localPreviewUrl: string;
  html: string;
  assetScope: PrintFormAssetScope;
}

export type PrintExportWork =
  | {
      format: 'pdf';
      document: 'assessment' | 'answer_key' | 'booklet';
      copies: number;
      filename: string;
      snapshots: PrintExportSnapshot[];
      covers: { name: string; base64: string }[];
    }
  | {
      format: 'docx';
      document: PrintDocument;
      filename: string;
      snapshot: PrintExportSnapshot;
      source: DocxSource;
      cover?: PrintableCover;
      footerLabel: string;
    };

async function validateSnapshot(
  page: Page,
  snapshot: PrintExportSnapshot,
  shutdownSignal?: AbortSignal,
) {
  const identity = await page.evaluate(() => ({
    printFormId: document.documentElement.dataset.printFormId,
    document: document.documentElement.dataset.printDocument,
    formLabel: document.documentElement.dataset.printFormLabel,
  }));
  shutdownSignal?.throwIfAborted();
  if (
    identity.printFormId !== snapshot.assetScope.printFormId ||
    identity.document !== snapshot.printDocument ||
    identity.formLabel !== snapshot.formLabel
  ) {
    throw new HttpStatusError(400, 'The printable pages do not match the selected form.');
  }
  const state = await validatePrintDocument(page);
  shutdownSignal?.throwIfAborted();
  return state;
}

export async function renderPrintExport(
  work: PrintExportWork,
  shutdownSignal?: AbortSignal,
): Promise<Buffer> {
  const covers =
    work.format === 'pdf'
      ? await readPrintCoverPages(
          work.covers.map(
            ({ name, base64 }) =>
              new File([Buffer.from(base64, 'base64')], name, { type: 'application/pdf' }),
          ),
          shutdownSignal,
        )
      : [];
  if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
  if (!isBrowserRenderingAvailable()) {
    throw new HttpStatusError(
      503,
      `${work.format === 'docx' ? 'Word' : 'PDF'} rendering is not configured on this server.`,
    );
  }
  const renderer = getPrintRenderer();
  if (work.format === 'docx') {
    const output = createDocxOutput({
      source: work.source,
      cover: work.cover,
      footerLabel: work.footerLabel,
    });
    return await renderer.render(
      {
        url: work.snapshot.localPreviewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: work.snapshot.html,
        assetScope: work.snapshot.assetScope,
        signal: shutdownSignal,
      },
      {
        ...output,
        produce: async (page) => {
          await validateSnapshot(page, work.snapshot, shutdownSignal);
          const contents = await output.produce(page);
          shutdownSignal?.throwIfAborted();
          return contents;
        },
      },
    );
  }
  const forms: { pdf: Buffer; coverPageCount: number }[] = [];
  const answerKeys: Buffer[] = [];
  const pdfOutput = createPdfOutput();
  for (const snapshot of work.snapshots) {
    if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
    const rendered = await renderer.render<{ pdf: Buffer; coverPageCount: number }>(
      {
        url: snapshot.localPreviewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: snapshot.html,
        assetScope: snapshot.assetScope,
        signal: shutdownSignal,
      },
      {
        label: work.document === 'booklet' ? 'booklet PDF' : 'PDF',
        produce: async (page) => {
          const state = await validateSnapshot(page, snapshot, shutdownSignal);
          return {
            pdf: await pdfOutput.produce(page),
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

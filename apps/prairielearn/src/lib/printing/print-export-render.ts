import type { Page } from 'playwright';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { serializePrintDocument } from '../client/print-document.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../client/printing/print-snapshot.js';
import { config } from '../config.js';

import { createDocxOutput } from './docx-output.js';
import { DocxSourceSchema } from './docx-source-schema.js';
import { createPdfOutput } from './pdf-output.js';
import { PrintAssetScopeDataSchema } from './print-asset-access.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { digestPrintHtml } from './print-snapshot-id.js';
import { PrintableCoverSchema } from './printable-cover.js';

import { getPrintRenderer, validatePrintDocument } from './index.js';

const PrintExportSnapshotSchema = z.object({
  formLabel: z.string(),
  printDocument: z.enum(['assessment', 'answer_key']),
  localPreviewUrl: z.url(),
  html: z.string(),
  /** Signed digest of the preview HTML, checked once the page is loaded. */
  htmlDigest: z.string(),
  assetScope: PrintAssetScopeDataSchema,
});
type PrintExportSnapshot = z.infer<typeof PrintExportSnapshotSchema>;

export const PrintExportWorkSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('pdf'),
    document: z.enum(['assessment', 'answer_key', 'booklet']),
    copies: z.number().int().positive(),
    filename: z.string(),
    snapshots: z.array(PrintExportSnapshotSchema),
    covers: z.array(z.object({ name: z.string(), base64: z.string() })),
  }),
  z.object({
    format: z.literal('docx'),
    document: z.enum(['assessment', 'answer_key']),
    filename: z.string(),
    snapshot: PrintExportSnapshotSchema,
    source: DocxSourceSchema,
    cover: PrintableCoverSchema.optional(),
    footerLabel: z.string(),
  }),
]);
export type PrintExportWork = z.infer<typeof PrintExportWorkSchema>;

/**
 * Rejects pages that differ from the signed preview. The browser normalizes the
 * submitted HTML, so the comparison doesn't block the Node event loop.
 */
async function validateSnapshot(
  page: Page,
  snapshot: PrintExportSnapshot,
  shutdownSignal?: AbortSignal,
) {
  const html = await page.locator(':root').evaluate(serializePrintDocument);
  shutdownSignal?.throwIfAborted();
  if (digestPrintHtml(html) !== snapshot.htmlDigest) {
    throw new HttpStatusError(400, STALE_PRINT_SNAPSHOT_MESSAGE);
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

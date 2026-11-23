import { z } from 'zod';

import { config } from '../config.js';

import { createDocxOutput } from './docx-output.js';
import { createPdfOutput } from './pdf-output.js';
import { PrintAssetScopeDataSchema } from './print-asset-access.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { readPrintSnapshot } from './print-snapshots.js';

import { getPrintRenderer, validatePrintDocument } from './index.js';

const PrintExportSnapshotSchema = z.object({
  formLabel: z.string(),
  printDocument: z.enum(['assessment', 'answer_key']),
  localPreviewUrl: z.url(),
  key: z.string(),
  assetScope: PrintAssetScopeDataSchema,
});

export const PrintExportWorkSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('pdf'),
    document: z.enum(['assessment', 'answer_key']),
    filename: z.string(),
    snapshots: z.array(PrintExportSnapshotSchema),
    covers: z.array(z.object({ name: z.string(), base64: z.string() })),
  }),
  z.object({
    format: z.literal('docx'),
    document: z.enum(['assessment', 'answer_key']),
    filename: z.string(),
    snapshot: PrintExportSnapshotSchema,
  }),
]);
export type PrintExportWork = z.infer<typeof PrintExportWorkSchema>;

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
    const { html, docx } = await readPrintSnapshot(work.snapshot.key);
    const output = createDocxOutput(docx);
    return await renderer.render(
      {
        url: work.snapshot.localPreviewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html,
        assetScope: work.snapshot.assetScope,
        signal: shutdownSignal,
      },
      {
        ...output,
        produce: async (page) => {
          await validatePrintDocument(page);
          shutdownSignal?.throwIfAborted();
          const contents = await output.produce(page);
          shutdownSignal?.throwIfAborted();
          return contents;
        },
      },
    );
  }
  const forms: { pdf: Buffer; coverPageCount: number }[] = [];
  const pdfOutput = createPdfOutput();
  for (const snapshot of work.snapshots) {
    if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
    const { html } = await readPrintSnapshot(snapshot.key);
    const rendered = await renderer.render<{ pdf: Buffer; coverPageCount: number }>(
      {
        url: snapshot.localPreviewUrl,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html,
        assetScope: snapshot.assetScope,
        signal: shutdownSignal,
      },
      {
        label: 'PDF',
        produce: async (page) => {
          const state = await validatePrintDocument(page);
          shutdownSignal?.throwIfAborted();
          return {
            pdf: await pdfOutput.produce(page),
            coverPageCount: state.coverPageCount,
          };
        },
      },
    );
    forms.push(rendered);
  }
  if (shutdownSignal?.aborted) throw new Error('Print export was interrupted');
  return await assemblePrintPacket({
    forms,
    covers,
    signal: shutdownSignal,
  });
}

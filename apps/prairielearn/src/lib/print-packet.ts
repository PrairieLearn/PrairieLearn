import { PDFDocument, PDFPage } from 'pdf-lib';

import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
  MAX_PACKET_PAGES,
} from './client/print-packet.js';

export class PrintPacketError extends Error {}

/** Parse uploads once, before starting any browser renders. */
export async function readPrintCoverPages(files: File[]): Promise<PDFDocument[]> {
  if (files.length > MAX_COVER_FILES) {
    throw new PrintPacketError(`Upload at most ${MAX_COVER_FILES} cover PDFs.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_COVER_BYTES) {
    throw new PrintPacketError('Cover PDFs must total at most 10 MB.');
  }
  const covers: PDFDocument[] = [];
  let pageCount = 0;
  for (const file of files) {
    let cover: PDFDocument;
    try {
      cover = await PDFDocument.load(await file.arrayBuffer(), { throwOnInvalidObject: true });
    } catch (error) {
      throw new PrintPacketError(
        `“${file.name}” could not be read. Upload a valid PDF without password protection.`,
        { cause: error },
      );
    }
    if (cover.getPageCount() === 0) {
      throw new PrintPacketError(`“${file.name}” contains no pages.`);
    }
    pageCount += cover.getPageCount();
    if (pageCount > MAX_COVER_PAGES) {
      throw new PrintPacketError(
        `Cover PDFs must contain at most ${MAX_COVER_PAGES} pages in total.`,
      );
    }
    covers.push(cover);
  }
  return covers;
}

/** Cycle complete student copies, inserting uploaded pages after each standard cover. */
export async function assemblePrintPacket({
  forms,
  covers,
  copies,
}: {
  forms: { pdf: Uint8Array; coverPageCount: number }[];
  covers: PDFDocument[];
  copies: number;
}): Promise<Buffer> {
  const sources = await Promise.all(
    forms.map(async (form) => ({
      document: await PDFDocument.load(form.pdf),
      coverPageCount: form.coverPageCount,
    })),
  );
  const coverPageCount = covers.reduce((total, cover) => total + cover.getPageCount(), 0);
  let totalPages = 0;
  for (let copy = 0; copy < copies; copy++) {
    const form = sources[copy % sources.length];
    totalPages += form.document.getPageCount() + coverPageCount;
  }
  if (totalPages > MAX_PACKET_PAGES) {
    throw new PrintPacketError(
      `This export exceeds ${MAX_PACKET_PAGES.toLocaleString('en-US')} pages. Export fewer copies at a time.`,
    );
  }

  const packet = await PDFDocument.create();
  const copiedCovers = (
    await Promise.all(covers.map((cover) => packet.copyPages(cover, cover.getPageIndices())))
  ).flat();
  const copiedForms = await Promise.all(
    sources.map(async ({ document, coverPageCount }) => ({
      pages: await packet.copyPages(document, document.getPageIndices()),
      coverPageCount,
    })),
  );
  for (let copy = 0; copy < copies; copy++) {
    const form = copiedForms[copy % copiedForms.length];
    const pages = [
      ...form.pages.slice(0, form.coverPageCount),
      ...copiedCovers,
      ...form.pages.slice(form.coverPageCount),
    ];
    for (const page of pages) {
      // Each physical page needs its own page-tree entry, while sharing fonts and images.
      const node = page.node.clone();
      packet.addPage(PDFPage.of(node, packet.context.register(node), packet));
    }
  }
  return Buffer.from(await packet.save());
}

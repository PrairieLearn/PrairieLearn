import { setImmediate } from 'node:timers/promises';

import { PDFDocument, PDFHexString, PDFName, PDFPage, PDFString } from 'pdf-lib';

import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
  MAX_PACKET_PAGES,
} from './client/print-packet.js';

export class PrintPacketError extends Error {}

export interface PrintCover {
  pdf: Uint8Array;
  pageCount: number;
}

/** Parse uploads once, before starting any browser renders. */
export async function readPrintCoverPages(
  files: File[],
  signal?: AbortSignal,
): Promise<PrintCover[]> {
  if (files.length > MAX_COVER_FILES) {
    throw new PrintPacketError(`Upload at most ${MAX_COVER_FILES} cover PDFs.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_COVER_BYTES) {
    throw new PrintPacketError('Cover PDFs must total at most 10 MB.');
  }
  const covers: PrintCover[] = [];
  let pageCount = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    let cover: PDFDocument;
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      cover = await PDFDocument.load(bytes, {
        throwOnInvalidObject: true,
        updateMetadata: false,
      });
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
    covers.push({ pdf: bytes, pageCount: cover.getPageCount() });
  }
  return covers;
}

/** Cycle complete student copies, then append each form's answer key once. */
export async function assemblePrintPacket({
  forms,
  covers,
  copies,
  answerKeys = [],
  signal,
}: {
  forms: { pdf: Uint8Array; coverPageCount: number }[];
  covers: PrintCover[];
  copies: number;
  answerKeys?: Uint8Array[];
  signal?: AbortSignal;
}): Promise<Buffer> {
  const sources = await Promise.all(
    forms.map(async (form) => ({
      ...form,
      document: await PDFDocument.load(form.pdf, { updateMetadata: false }),
    })),
  );
  const answerKeyDocuments = await Promise.all(answerKeys.map((pdf) => PDFDocument.load(pdf)));
  const coverPageCount = covers.reduce((total, cover) => total + cover.pageCount, 0);
  let totalPages = answerKeyDocuments.reduce((total, key) => total + key.getPageCount(), 0);
  for (let copy = 0; copy < copies; copy++) {
    const form = sources[copy % sources.length];
    totalPages += form.document.getPageCount() + coverPageCount;
  }
  if (totalPages > MAX_PACKET_PAGES) {
    throw new PrintPacketError(
      `This export exceeds ${MAX_PACKET_PAGES.toLocaleString('en-US')} pages. Export fewer copies at a time.`,
    );
  }

  signal?.throwIfAborted();
  if (forms.length === 1 && copies === 1 && covers.length === 0 && answerKeys.length === 0) {
    return Buffer.from(forms[0].pdf);
  }

  // A packet preserves printed pages; its new catalog does not claim PDF/UA conformance.
  const packet = await PDFDocument.create();
  packet.setTitle(`${sources[0].document.getTitle() ?? 'Assessment'} — print packet`);
  const language = sources[0].document.catalog.lookup(PDFName.of('Lang'));
  if (language instanceof PDFString || language instanceof PDFHexString) {
    packet.setLanguage(language.decodeText());
  }
  const copiedCovers = [];
  for (const cover of covers) {
    signal?.throwIfAborted();
    const document = await PDFDocument.load(cover.pdf, { updateMetadata: false });
    copiedCovers.push(...(await packet.copyPages(document, document.getPageIndices())));
  }
  const copiedForms = [];
  for (const { document, coverPageCount } of sources) {
    signal?.throwIfAborted();
    copiedForms.push({
      pages: await packet.copyPages(document, document.getPageIndices()),
      coverPageCount,
    });
  }
  for (let copy = 0; copy < copies; copy++) {
    await setImmediate();
    signal?.throwIfAborted();
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
  for (const key of answerKeyDocuments) {
    signal?.throwIfAborted();
    const pages = await packet.copyPages(key, key.getPageIndices());
    for (const page of pages) packet.addPage(page);
  }
  const output = await packet.save();
  signal?.throwIfAborted();
  return Buffer.from(output);
}

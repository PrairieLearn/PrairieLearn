import { setImmediate } from 'node:timers/promises';

import {
  AnnotationFlags,
  PDFAnnotation,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRawStream,
} from 'pdf-lib';

import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
  MAX_PACKET_PAGES,
} from '../client/printing/print-packet.js';

export class PrintPacketError extends Error {}

function needsFormAppearances(document: PDFDocument): boolean {
  const form = document.catalog.lookup(PDFName.of('AcroForm'));
  if (form instanceof PDFDict && form.lookup(PDFName.of('NeedAppearances')) === PDFBool.True) {
    return true;
  }
  for (const page of document.getPages()) {
    for (const reference of page.node.Annots()?.asArray() ?? []) {
      const dictionary = document.context.lookup(reference, PDFDict);
      if (dictionary.lookup(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;
      const widget = PDFAnnotation.fromDict(dictionary);
      if (
        widget.hasFlag(AnnotationFlags.Hidden) ||
        (widget.hasFlag(AnnotationFlags.NoView) && !widget.hasFlag(AnnotationFlags.Print))
      ) {
        continue;
      }
      const normal = widget.AP()?.lookup(PDFName.of('N'));
      if (normal instanceof PDFRawStream) continue;
      const state = widget.getAppearanceState();
      if (normal instanceof PDFDict && state && normal.lookup(state) instanceof PDFRawStream) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/** Parse uploads once, before starting any browser renders. */
export async function readPrintCoverPages(
  files: File[],
  signal?: AbortSignal,
): Promise<PDFDocument[]> {
  if (files.length > MAX_COVER_FILES) {
    throw new PrintPacketError(`Upload at most ${MAX_COVER_FILES} cover PDFs.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_COVER_BYTES) {
    throw new PrintPacketError('Cover PDFs must total at most 10 MB.');
  }
  const covers: PDFDocument[] = [];
  let pageCount = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    let cover: PDFDocument;
    let needsAppearances: boolean;
    try {
      cover = await PDFDocument.load(await file.arrayBuffer(), {
        throwOnInvalidObject: true,
        updateMetadata: false,
      });
      needsAppearances = needsFormAppearances(cover);
    } catch (error) {
      throw new PrintPacketError(
        `“${file.name}” could not be read. Upload a valid PDF without password protection.`,
        { cause: error },
      );
    }
    if (cover.getPageCount() === 0) {
      throw new PrintPacketError(`“${file.name}” contains no pages.`);
    }
    if (needsAppearances) {
      throw new PrintPacketError(
        `“${file.name}” has form fields that may print blank. Print it to a new PDF, then upload that copy.`,
      );
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

/** Combine each selected form once, padding shorter forms to the longest form's page count. */
export async function assemblePrintPacket({
  forms,
  covers,
  signal,
}: {
  forms: { pdf: Uint8Array; coverPageCount: number }[];
  covers: PDFDocument[];
  signal?: AbortSignal;
}): Promise<Buffer> {
  const sources = await Promise.all(
    forms.map(async (form) => ({
      ...form,
      document: await PDFDocument.load(form.pdf, { updateMetadata: false }),
    })),
  );
  const uploadedCoverPageCount = covers.reduce((total, cover) => total + cover.getPageCount(), 0);
  const pagesPerForm = Math.max(
    ...sources.map(({ document }) => document.getPageCount() + uploadedCoverPageCount),
  );
  const totalPages = pagesPerForm * forms.length;
  if (totalPages > MAX_PACKET_PAGES) {
    throw new PrintPacketError(
      `This export exceeds ${MAX_PACKET_PAGES.toLocaleString('en-US')} pages. Export fewer forms at a time.`,
    );
  }

  signal?.throwIfAborted();
  if (forms.length === 1 && covers.length === 0) {
    return Buffer.from(forms[0].pdf);
  }

  const packet = await PDFDocument.create();
  const copiedCovers = [];
  for (const cover of covers) {
    signal?.throwIfAborted();
    copiedCovers.push(...(await packet.copyPages(cover, cover.getPageIndices())));
  }
  for (const { document, coverPageCount } of sources) {
    await setImmediate();
    signal?.throwIfAborted();
    const copiedPages = await packet.copyPages(document, document.getPageIndices());
    const pages = [
      ...copiedPages.slice(0, coverPageCount),
      ...copiedCovers,
      ...copiedPages.slice(coverPageCount),
    ];
    for (const page of pages) {
      // Uploaded covers may appear in several forms, so each page needs its own page-tree entry.
      const node = page.node.clone();
      packet.addPage(PDFPage.of(node, packet.context.register(node), packet));
    }
    const lastPage = document.getPage(document.getPageCount() - 1);
    for (let page = pages.length; page < pagesPerForm; page++) {
      const blank = packet.addPage([lastPage.getWidth(), lastPage.getHeight()]);
      blank.setRotation(lastPage.getRotation());
    }
  }
  const output = await packet.save();
  signal?.throwIfAborted();
  return Buffer.from(output);
}

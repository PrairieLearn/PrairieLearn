import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';

import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
  MAX_PACKET_PAGES,
} from './client/print-packet.js';
import {
  PrintPdfValidationError,
  runPrintPdfTool,
  validatePrintPdf,
  withPrintPdfDirectory,
} from './printing/pdf-tools.js';

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
  if (covers.length > 0) {
    await withPrintPdfDirectory(async (directory) => {
      for (const [index, cover] of covers.entries()) {
        const filename = path.join(directory, `cover-${index}.pdf`);
        await writeFile(filename, cover.pdf);
        try {
          await validatePrintPdf(filename, signal);
        } catch (error) {
          signal?.throwIfAborted();
          if (!(error instanceof PrintPdfValidationError)) throw error;
          throw new PrintPacketError(
            `“${files[index].name}” did not pass PDF/UA-1 accessibility validation. Repair its document tags, image descriptions, table headers, and language in an accessible PDF editor, then upload it again.`,
            { cause: error },
          );
        }
      }
    });
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

  return await withPrintPdfDirectory(async (directory) => {
    const formPaths = await Promise.all(
      forms.map(async ({ pdf }, index) => {
        const filename = path.join(directory, `form-${index}.pdf`);
        await writeFile(filename, pdf);
        return filename;
      }),
    );
    const coverPaths = await Promise.all(
      covers.map(async (cover, index) => {
        const filename = path.join(directory, `cover-${index}.pdf`);
        await writeFile(filename, cover.pdf);
        return filename;
      }),
    );
    const keyPaths = await Promise.all(
      answerKeys.map(async (pdf, index) => {
        const filename = path.join(directory, `answer-key-${index}.pdf`);
        await writeFile(filename, pdf);
        return filename;
      }),
    );
    const parts: string[] = [];
    const append = (filename: string, first = 0, last = 0) => {
      parts.push(`${filename}\t${first}\t${last}`);
    };
    for (let copy = 0; copy < copies; copy++) {
      const index = copy % sources.length;
      const form = sources[index];
      const filename = formPaths[index];
      if (covers.length === 0) {
        append(filename);
        continue;
      }
      if (form.coverPageCount > 0) append(filename, 1, form.coverPageCount);
      for (const cover of coverPaths) append(cover);
      if (form.coverPageCount < form.document.getPageCount()) {
        append(filename, form.coverPageCount + 1, form.document.getPageCount());
      }
    }
    for (const key of keyPaths) append(key);
    const manifest = path.join(directory, 'parts.tsv');
    await writeFile(manifest, parts.join('\n'));
    const title = `${sources[0].document.getTitle() ?? 'Assessment'} — print packet`;
    const language = sources[0].document.catalog
      .lookup(PDFName.of('Lang'), PDFString, PDFHexString)
      .decodeText();
    const merged = path.join(directory, 'merged.pdf');
    const output = path.join(directory, 'packet.pdf');
    await runPrintPdfTool('PrintPdf', ['merge', merged, title, language, manifest], signal);
    await runPrintPdfTool(
      'PrintPdfFinalize',
      ['metadata', merged, output, title, language],
      signal,
    );
    await validatePrintPdf(output, signal);
    return await readFile(output);
  });
}

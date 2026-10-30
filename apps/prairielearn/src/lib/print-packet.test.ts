import { PDFBool, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import { MAX_COVER_BYTES, MAX_COVER_FILES, MAX_COVER_PAGES } from './client/print-packet.js';
import { DEFAULT_PRINT_SETTINGS } from './client/print-preparation.js';
import { PrintPacketMetadataSchema } from './print-packet-schema.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';

async function pdfWithPages(widths: number[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (const width of widths) document.addPage([width, 700]);
  return document.save({ addDefaultPage: false });
}

async function coverFile(widths: number[]): Promise<File> {
  return new File([Buffer.from(await pdfWithPages(widths))], 'instructions.pdf', {
    type: 'application/pdf',
  });
}

describe('print packets', () => {
  test('cycles complete copies and inserts every cover after a multipage standard cover', async () => {
    const covers = await readPrintCoverPages([await coverFile([501, 502]), await coverFile([503])]);
    const packet = await assemblePrintPacket({
      forms: [
        { pdf: await pdfWithPages([101, 102, 103]), coverPageCount: 2 },
        { pdf: await pdfWithPages([201, 202]), coverPageCount: 1 },
        { pdf: await pdfWithPages([301, 302]), coverPageCount: 1 },
      ],
      covers,
      copies: 4,
    });
    const result = await PDFDocument.load(packet);
    expect(result.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      101, 102, 501, 502, 503, 103, 201, 501, 502, 503, 202, 301, 501, 502, 503, 302, 101, 102, 501,
      502, 503, 103,
    ]);
    expect(new Set(result.getPages().map((page) => page.ref.toString())).size).toBe(
      result.getPageCount(),
    );
  });

  test('prints repeated copies without uploaded covers', async () => {
    const pdf = Buffer.from(await pdfWithPages([101, 102]));
    expect(
      await assemblePrintPacket({ forms: [{ pdf, coverPageCount: 1 }], covers: [], copies: 1 }),
    ).toEqual(pdf);
    const result = await PDFDocument.load(
      await assemblePrintPacket({
        forms: [{ pdf, coverPageCount: 1 }],
        covers: [],
        copies: 3,
      }),
    );
    expect(result.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      101, 102, 101, 102, 101, 102,
    ]);
  });

  test('appends each answer key once after all student copies with uploaded covers', async () => {
    const covers = await readPrintCoverPages([await coverFile([501, 502])]);
    const result = await PDFDocument.load(
      await assemblePrintPacket({
        forms: [
          { pdf: await pdfWithPages([101, 102]), coverPageCount: 1 },
          { pdf: await pdfWithPages([201, 202]), coverPageCount: 1 },
        ],
        covers,
        copies: 3,
        answerKeys: [await pdfWithPages([601, 602]), await pdfWithPages([701, 702, 703])],
      }),
    );
    expect(result.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      101, 501, 502, 102, 201, 501, 502, 202, 101, 501, 502, 102, 601, 602, 701, 702, 703,
    ]);
  });

  test('accepts saved cover appearances and rejects unreadable or incomplete covers', async () => {
    await expect(readPrintCoverPages([new File(['not a PDF'], 'bad.pdf')])).rejects.toThrow(
      'valid PDF without password protection',
    );
    await expect(readPrintCoverPages([await coverFile([])])).rejects.toThrow('contains no pages');
    expect((await readPrintCoverPages([await coverFile([100])]))[0].getPageCount()).toBe(1);
    const filled = await PDFDocument.create();
    const page = filled.addPage([500, 300]);
    const form = filled.getForm();
    const name = form.createTextField('student');
    name.setText('Morgan');
    name.addToPage(page, { x: 20, y: 150, width: 300, height: 40 });
    const checkbox = form.createCheckBox('confirmed');
    checkbox.addToPage(page, { x: 20, y: 100, width: 20, height: 20 });
    checkbox.check();
    form.updateFieldAppearances();
    const asFile = async () =>
      new File([Buffer.from(await filled.save({ updateFieldAppearances: false }))], 'form.pdf');
    const covers = await readPrintCoverPages([await asFile()]);
    const packet = await PDFDocument.load(
      await assemblePrintPacket({
        forms: [{ pdf: await pdfWithPages([100]), coverPageCount: 0 }],
        covers,
        copies: 2,
      }),
    );
    for (const index of [0, 2]) {
      const widgets = packet.getPage(index).node.Annots()!;
      const textAppearance = widgets
        .lookup(0, PDFDict)
        .lookup(PDFName.of('AP'), PDFDict)
        .lookup(PDFName.of('N'), PDFStream);
      expect(textAppearance.getContents()).toEqual(
        Buffer.from(
          name.acroField.getWidgets()[0].AP()!.lookup(PDFName.of('N'), PDFStream).getContents(),
        ),
      );
      const checked = widgets.lookup(1, PDFDict);
      expect(
        checked
          .lookup(PDFName.of('AP'), PDFDict)
          .lookup(PDFName.of('N'), PDFDict)
          .lookup(checked.lookup(PDFName.of('AS'), PDFName)),
      ).toBeInstanceOf(PDFRawStream);
    }
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
    await expect(readPrintCoverPages([await asFile()])).rejects.toThrow('flattened PDF');
    form.acroForm.dict.delete(PDFName.of('NeedAppearances'));
    name.acroField.getWidgets()[0].dict.delete(PDFName.of('AP'));
    await expect(readPrintCoverPages([await asFile()])).rejects.toThrow('flattened PDF');
    const encrypted = await PDFDocument.create();
    encrypted.addPage();
    encrypted.context.trailerInfo.Encrypt = encrypted.context.obj({});
    await expect(
      readPrintCoverPages([new File([Buffer.from(await encrypted.save())], 'encrypted.pdf')]),
    ).rejects.toThrow('valid PDF without password protection');
  });

  test('bounds uploaded files, bytes, and pages', async () => {
    const file = await coverFile([100]);
    await expect(
      readPrintCoverPages(Array.from({ length: MAX_COVER_FILES + 1 }, () => file)),
    ).rejects.toThrow('Upload at most');
    await expect(
      readPrintCoverPages([new File([new Uint8Array(MAX_COVER_BYTES + 1)], 'large.pdf')]),
    ).rejects.toThrow('at most 10 MB');
    await expect(
      readPrintCoverPages([
        await coverFile(Array.from({ length: MAX_COVER_PAGES + 1 }, () => 100)),
      ]),
    ).rejects.toThrow('100 pages in total');
  });

  test('bounds total output pages before copying pages', async () => {
    await expect(
      assemblePrintPacket({
        forms: [
          { pdf: await pdfWithPages(Array.from({ length: 21 }, () => 100)), coverPageCount: 1 },
        ],
        covers: [],
        copies: 500,
      }),
    ).rejects.toThrow('exceeds 10,000 pages');
  });

  test('includes appended answer keys in the total page limit', async () => {
    await expect(
      assemblePrintPacket({
        forms: [
          { pdf: await pdfWithPages(Array.from({ length: 20 }, () => 100)), coverPageCount: 1 },
        ],
        covers: [],
        copies: 500,
        answerKeys: [await pdfWithPages([200])],
      }),
    ).rejects.toThrow('exceeds 10,000 pages');
  });
});

describe('print packet settings', () => {
  const instance = { assessmentInstanceId: '1', formLabel: 'A', settings: DEFAULT_PRINT_SETTINGS };
  const metadata = { instances: [instance], copies: 45, document: 'assessment' };

  test('rejects duplicate instance IDs or labels, unknown settings, and invalid layout values', () => {
    for (const instances of [
      [instance, { ...instance, formLabel: 'B' }],
      [instance, { ...instance, assessmentInstanceId: '2' }],
      [{ ...instance, settings: { ...instance.settings, paperSize: 'Legal' } }],
      [{ ...instance, settings: { ...instance.settings, extra: true } }],
      [{ ...instance, settings: { ...instance.settings, excludedQuestions: ['1', '1'] } }],
      [{ ...instance, settings: { ...instance.settings, identityFields: 'a'.repeat(41) } }],
    ]) {
      expect(PrintPacketMetadataSchema.safeParse({ ...metadata, instances }).success).toBe(false);
    }
  });
});

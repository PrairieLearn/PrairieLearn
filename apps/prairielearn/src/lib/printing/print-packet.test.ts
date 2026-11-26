import { PDFBool, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
} from '../client/printing/print-packet.js';

import { PrintPacketMetadataSchema } from './print-packet-schema.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { DEFAULT_PRINT_SETTINGS, PrintSettingsSchema } from './print-settings.js';

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
  test('inserts uploaded covers and pads shorter student forms', async () => {
    const covers = await readPrintCoverPages([await coverFile([501, 502]), await coverFile([503])]);
    const packet = await assemblePrintPacket({
      forms: [
        { pdf: await pdfWithPages([101, 102, 103]), coverPageCount: 2 },
        { pdf: await pdfWithPages([201, 202]), coverPageCount: 1 },
        { pdf: await pdfWithPages([301, 302]), coverPageCount: 1 },
      ],
      covers,
    });
    const result = await PDFDocument.load(packet);
    expect(result.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      101, 102, 501, 502, 503, 103, 201, 501, 502, 503, 202, 202, 301, 501, 502, 503, 302, 302,
    ]);
    expect(new Set(result.getPages().map((page) => page.ref.toString())).size).toBe(
      result.getPageCount(),
    );
  });

  test('keeps a single document unchanged when there are no uploaded covers', async () => {
    const pdf = Buffer.from(await pdfWithPages([101, 102]));
    expect(await assemblePrintPacket({ forms: [{ pdf, coverPageCount: 1 }], covers: [] })).toEqual(
      pdf,
    );
  });

  test('pads shorter answer keys without adding uploaded covers', async () => {
    const result = await PDFDocument.load(
      await assemblePrintPacket({
        forms: [
          { pdf: await pdfWithPages([601, 602]), coverPageCount: 1 },
          { pdf: await pdfWithPages([701, 702, 703]), coverPageCount: 1 },
        ],
        covers: [],
      }),
    );
    expect(result.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      601, 602, 602, 701, 702, 703,
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
        forms: [
          { pdf: await pdfWithPages([100]), coverPageCount: 0 },
          { pdf: await pdfWithPages([200]), coverPageCount: 0 },
        ],
        covers,
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
    await expect(readPrintCoverPages([await asFile()])).rejects.toThrow(
      'form fields that may print blank',
    );
    form.acroForm.dict.delete(PDFName.of('NeedAppearances'));
    name.acroField.getWidgets()[0].dict.delete(PDFName.of('AP'));
    await expect(readPrintCoverPages([await asFile()])).rejects.toThrow(
      'form fields that may print blank',
    );
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

  test('bounds normalized output pages before copying pages', async () => {
    const pdf = await pdfWithPages(Array.from({ length: 385 }, () => 100));
    await expect(
      assemblePrintPacket({
        forms: Array.from({ length: 26 }, () => ({ pdf, coverPageCount: 1 })),
        covers: [],
      }),
    ).rejects.toThrow('exceeds 10,000 pages');
  });
});

describe('print packet metadata', () => {
  const form = { printFormId: '1' };
  const metadata = { forms: [form], document: 'assessment' };

  test('rejects duplicate form IDs and client-supplied labels or settings', () => {
    expect(PrintPacketMetadataSchema.safeParse(metadata).success).toBe(true);
    for (const forms of [
      [form, { ...form }],
      [{ ...form, formLabel: 'B' }],
      [{ ...form, settings: DEFAULT_PRINT_SETTINGS }],
    ]) {
      expect(PrintPacketMetadataSchema.safeParse({ ...metadata, forms }).success).toBe(false);
    }
  });
});

describe('print settings', () => {
  test('rejects unknown settings and invalid layout values', () => {
    for (const settings of [
      { ...DEFAULT_PRINT_SETTINGS, paperSize: 'Legal' },
      { ...DEFAULT_PRINT_SETTINGS, extra: true },
      { ...DEFAULT_PRINT_SETTINGS, excludedQuestions: ['1', '1'] },
      { ...DEFAULT_PRINT_SETTINGS, identityFields: 'a'.repeat(41) },
    ]) {
      expect(PrintSettingsSchema.safeParse(settings).success).toBe(false);
    }
  });
});

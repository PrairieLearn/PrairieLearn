import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { MAX_COVER_BYTES, MAX_COVER_FILES, MAX_COVER_PAGES } from './client/print-packet.js';
import { DEFAULT_PRINT_SETTINGS } from './client/print-preparation.js';
import { PrintPacketMetadataSchema } from './print-packet-schema.js';
import { assemblePrintPacket, readPrintCoverPages } from './print-packet.js';
import { createPdfOutput } from './printing/pdf-output.js';

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
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser.close();
  });

  async function printPages(widths: number[], language = 'en'): Promise<Buffer> {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="${language}"><head>
        <title>Assessment</title><style>body { font: 8pt Arial; }
        ${widths.map((width, index) => `@page p${index} { size: ${width}pt 700pt; margin: 8pt; }`).join('')}
        </style></head><body>
        ${widths
          .map(
            (width, index) => `<section style="page:p${index}">
          <h1>Page ${width}</h1><table><tr><th scope="col">Value</th></tr><tr><td>${width}</td></tr></table>
        </section>`,
          )
          .join('')}
        </body></html>`);
      return await createPdfOutput().produce(page);
    } finally {
      await page.close();
    }
  }

  async function uploadedCover(widths: number[]): Promise<File> {
    return new File([new Uint8Array(await printPages(widths, 'fr'))], 'instructions.pdf', {
      type: 'application/pdf',
    });
  }

  test('cycles complete copies and inserts every cover after a multipage standard cover', async () => {
    const covers = await readPrintCoverPages([
      await uploadedCover([501, 502]),
      await uploadedCover([503]),
    ]);
    const packet = await assemblePrintPacket({
      forms: [
        { pdf: await printPages([101, 102, 103]), coverPageCount: 2 },
        { pdf: await printPages([201, 202]), coverPageCount: 1 },
        { pdf: await printPages([301, 302]), coverPageCount: 1 },
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
    expect(
      new Set(
        result.getPages().map((page) => page.node.get(PDFName.of('StructParents'))?.toString()),
      ).size,
    ).toBe(result.getPageCount());
    const languages: string[] = [];
    const headings: PDFDict[] = [];

    function visit(node: PDFDict | PDFArray): void {
      if (node instanceof PDFArray) {
        for (let index = 0; index < node.size(); index++) {
          const child = node.lookup(index);
          if (child instanceof PDFDict || child instanceof PDFArray) visit(child);
        }
      } else {
        const language = node.get(PDFName.of('Lang'));
        if (language instanceof PDFString) languages.push(language.decodeText());
        if (node.get(PDFName.of('S')) === PDFName.of('H1')) headings.push(node);
        const child = node.lookup(PDFName.of('K'));
        if (child instanceof PDFDict || child instanceof PDFArray) visit(child);
      }
    }
    visit(result.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict));
    expect(languages).toContain('fr');
    expect(headings).toHaveLength(result.getPageCount());
    expect(new Set(headings).size).toBe(result.getPageCount());
  }, 60_000);

  test('prints repeated copies without uploaded covers', async () => {
    const pdf = await printPages([101, 102]);
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
  }, 60_000);

  test('appends each answer key once after all student copies with uploaded covers', async () => {
    const covers = await readPrintCoverPages([await uploadedCover([501, 502])]);
    const result = await PDFDocument.load(
      await assemblePrintPacket({
        forms: [
          { pdf: await printPages([101, 102]), coverPageCount: 1 },
          { pdf: await printPages([201, 202]), coverPageCount: 1 },
        ],
        covers,
        copies: 3,
        answerKeys: [await printPages([601, 602]), await printPages([701, 702, 703])],
      }),
    );
    expect(result.getPages().map((page) => Math.round(page.getWidth()))).toEqual([
      101, 501, 502, 102, 201, 501, 502, 202, 101, 501, 502, 102, 601, 602, 701, 702, 703,
    ]);
  }, 60_000);

  test('rejects invalid, empty, encrypted, and untagged cover documents', async () => {
    await expect(readPrintCoverPages([new File(['not a PDF'], 'bad.pdf')])).rejects.toThrow(
      'valid PDF without password protection',
    );
    await expect(readPrintCoverPages([await coverFile([])])).rejects.toThrow('contains no pages');
    await expect(readPrintCoverPages([await coverFile([100])])).rejects.toThrow(
      'instructions.pdf” did not pass PDF/UA-1',
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

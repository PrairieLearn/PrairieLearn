import JSZip from 'jszip';
import type { Browser, BrowserContext, Locator, Page, Response } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const playwrightMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  launch: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { connect: playwrightMocks.connect, launch: playwrightMocks.launch },
}));

import { PrintRenderer } from './printRenderer.js';
import type { PrintableCover } from './printableCover.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A US Letter sheet at 96 CSS pixels per inch with 0.55in top and side margins and a 0.68in
// bottom margin, matching the printable page's CSS.
const LETTER_GEOMETRY = {
  pageWidth: 816,
  pageHeight: 1056,
  marginTop: 52.8,
  marginRight: 52.8,
  marginBottom: 65.28,
  marginLeft: 52.8,
};

const cover: PrintableCover = {
  eyebrow: 'XC 101',
  eyebrowDetail: 'Example Course',
  title: 'E4',
  subtitle: 'Exam including autograded and manually graded questions',
  fields: [
    { label: 'Name', wide: true },
    { label: 'Section' },
    { label: 'Student ID' },
    { label: 'Date' },
  ],
  summary: [
    { term: 'Questions', value: '3' },
    { term: 'Points', value: '15' },
  ],
  sections: [
    {
      heading: 'Instructions',
      blocks: [
        { type: 'list', ordered: true, items: ['Write your name.', 'Show your work.'] },
        { type: 'paragraph', text: 'No calculators.' },
      ],
    },
    {
      heading: 'Academic integrity pledge',
      blocks: [{ type: 'list', ordered: false, items: ['I pledge on my honor.'] }],
      signatureLabel: 'Signature',
    },
  ],
  footer: 'Spring 2015  |  Form ID 13',
};

function createQuestionLocator(pageIndex: number, width: number, height: number): Locator {
  return {
    evaluate: vi.fn(async () => ({ pageIndex, width, height })),
    screenshot: vi.fn(async () => Buffer.concat([PNG_SIGNATURE, Buffer.from(`${pageIndex}`)])),
  } as unknown as Locator;
}

function createBrowserHarness({
  questions = [
    createQuestionLocator(1, 710.4, 300.25),
    createQuestionLocator(1, 710.4, 400),
    createQuestionLocator(2, 710.4, 937.9),
  ],
  pageDataset = { printQuestionCount: '3', printMaxPoints: '15' },
}: { questions?: Locator[]; pageDataset?: Record<string, string> } = {}) {
  const page = {
    emulateMedia: vi.fn(async () => undefined),
    goto: vi.fn(async () => ({ ok: () => true, status: () => 200 }) as Response),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi
      .fn()
      .mockResolvedValueOnce({ status: 'ready', error: null, errorCode: null })
      .mockResolvedValueOnce(pageDataset)
      .mockResolvedValueOnce(LETTER_GEOMETRY),
    locator: vi.fn(() => ({ all: async () => questions })),
  } as unknown as Page;
  const context = {
    route: vi.fn(async () => undefined),
    routeWebSocket: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  } as unknown as BrowserContext;
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
    on: vi.fn(),
  } as unknown as Browser;
  playwrightMocks.launch.mockResolvedValue(browser);
  return { browser, context, page, questions };
}

async function readDocx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`${path} is missing from the document`);
    return await file.async('string');
  };
  return {
    files: Object.keys(zip.files).sort(),
    documentXml: await read('word/document.xml'),
    footerXml: await read('word/footer1.xml'),
  };
}

describe('renderDocx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the cover natively and every printed question as an image on its PDF page', async () => {
    const harness = createBrowserHarness();

    const docx = await new PrintRenderer().renderDocx({
      url: 'https://localhost:3000/print',
      cover,
      footerLabel: 'Form ID 13',
    });
    const { files, documentXml, footerXml } = await readDocx(docx);

    expect(harness.browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({ deviceScaleFactor: 2 }),
    );
    expect(harness.page.locator).toHaveBeenCalledWith('.pagedjs_page .printing-question');
    for (const question of harness.questions) {
      expect(question.screenshot).toHaveBeenCalledWith({ type: 'png', scale: 'device' });
    }
    expect(files.filter((file) => file.startsWith('word/media/'))).toHaveLength(3);
    expect(documentXml.match(/<w:drawing>/g)).toHaveLength(3);
    // The cover ends page 1; each later PDF page starts with a page break.
    expect(documentXml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    expect(documentXml).toContain('<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
    expect(documentXml).toContain('<w:pgMar w:top="792" w:right="792" w:bottom="979" w:left="792"');
    // Images keep their CSS pixel size (9525 EMU per pixel) with a pixel trimmed from the height.
    expect(documentXml).toContain(`<wp:extent cx="${710 * 9525}" cy="${299 * 9525}"/>`);
    expect(documentXml).toContain(`<wp:extent cx="${710 * 9525}" cy="${936 * 9525}"/>`);
    for (const value of [
      'XC 101',
      'E4',
      'Name',
      'Student ID',
      'QUESTIONS',
      'Write your name.',
      'No calculators.',
      'Signature',
      'Spring 2015  |  Form ID 13',
    ]) {
      expect(documentXml).toContain(value);
    }
    expect(footerXml).toContain('Form ID 13  |  Page ');
    expect(footerXml).toContain('PAGE');
    expect(footerXml).toContain('NUMPAGES');
  });

  it('lets the cover depend on the rendered page dataset', async () => {
    createBrowserHarness({ pageDataset: { printQuestionCount: '7', printMaxPoints: '50' } });
    const buildCover = vi.fn(
      (dataset: Readonly<Record<string, string | undefined>>): PrintableCover => ({
        ...cover,
        summary: [
          { term: 'Questions', value: dataset.printQuestionCount ?? '' },
          { term: 'Points', value: dataset.printMaxPoints ?? '' },
        ],
      }),
    );

    const docx = await new PrintRenderer().renderDocx({
      url: 'https://localhost:3000/print',
      cover: buildCover,
      footerLabel: 'Answer key  |  Form ID 13',
    });
    const { documentXml } = await readDocx(docx);

    expect(buildCover).toHaveBeenCalledWith({ printQuestionCount: '7', printMaxPoints: '50' });
    expect(documentXml).toContain('>7<');
    expect(documentXml).toContain('>50<');
  });

  it('scales images wider than the printable area down to fit', async () => {
    createBrowserHarness({ questions: [createQuestionLocator(1, 1420.8, 200)] });

    const docx = await new PrintRenderer().renderDocx({
      url: 'https://localhost:3000/print',
      cover,
      footerLabel: 'Form ID 13',
    });
    const { documentXml } = await readDocx(docx);

    expect(documentXml).toContain(`<wp:extent cx="${710 * 9525}" cy="${99 * 9525}"/>`);
  });

  it('fails when a question is not inside a paginated page', async () => {
    createBrowserHarness({ questions: [createQuestionLocator(-1, 710.4, 200)] });

    await expect(
      new PrintRenderer().renderDocx({
        url: 'https://localhost:3000/print',
        cover,
        footerLabel: 'Form ID 13',
      }),
    ).rejects.toThrow('A printed question is not on a paginated page');
  });
});

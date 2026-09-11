import JSZip from 'jszip';
import type { Browser, BrowserContext, Page, Response } from 'playwright';
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

const source = {
  html: `<article class="printing-question" data-question-number="1"><div class="question-body">
    <p data-docx-block="true">Find the derivative <span data-docx-math='&lt;math xmlns="http://www.w3.org/1998/Math/MathML"&gt;&lt;mfrac&gt;&lt;mi&gt;x&lt;/mi&gt;&lt;mn&gt;2&lt;/mn&gt;&lt;/mfrac&gt;&lt;/math&gt;'></span>.</p>
    <span data-print-response-line data-docx-width="200"></span>
    <ol><li>First choice</li><li>Second choice</li></ol>
    <table><tr><th>Variable</th><th>Value</th></tr><tr><td>x</td><td>2</td></tr></table>
    <img data-docx-figure="1">
  </div></article>
  <article class="printing-question" data-question-number="2"><div class="question-body">
    <p data-docx-block="true">Explain your reasoning.</p>
    <div class="printing-response-area"><div class="printing-response-label">Response</div><div class="printing-response-lines" data-docx-height="192"></div></div>
  </div></article>`,
  figures: [{ id: '1', width: 100, height: 60, alt: 'A plotted function' }],
};

function createBrowserHarness({
  pageDataset = { printQuestionCount: '3', printMaxPoints: '15' },
  docxSource = source,
}: { pageDataset?: Record<string, string>; docxSource?: typeof source | null } = {}) {
  const figure = { screenshot: vi.fn(async () => PNG_SIGNATURE) };
  const page = {
    addInitScript: vi.fn(async () => undefined),
    emulateMedia: vi.fn(async () => undefined),
    goto: vi.fn(async () => ({ ok: () => true, status: () => 200 }) as Response),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi
      .fn()
      .mockResolvedValueOnce({ status: 'ready', error: null, errorCode: null })
      .mockResolvedValueOnce(pageDataset)
      .mockResolvedValueOnce(LETTER_GEOMETRY)
      .mockResolvedValueOnce(docxSource),
    locator: vi.fn(() => ({ first: () => figure })),
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
  return { browser, context, page, figure };
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

  it('keeps question text, math, lists, tables, and answer spaces editable', async () => {
    const harness = createBrowserHarness();
    const docx = await new PrintRenderer().renderDocx({
      url: 'https://localhost:3000/print',
      cover,
      footerLabel: 'Form ID 13',
    });
    const { files, documentXml, footerXml } = await readDocx(docx);
    expect(harness.page.addInitScript).toHaveBeenCalled();
    expect(harness.page.locator).toHaveBeenCalledWith('.pagedjs_page [data-docx-figure="1"]');
    expect(harness.figure.screenshot).toHaveBeenCalledTimes(1);
    expect(
      files.filter((file) => file.startsWith('word/media/') && file.endsWith('.png')),
    ).toHaveLength(1);
    expect(documentXml.match(/<w:drawing>/g)).toHaveLength(1);
    expect(documentXml).toContain('<m:oMath>');
    expect(documentXml).toContain('<m:f>');
    expect(documentXml).toContain('Find the derivative');
    expect(documentXml).toContain('First choice');
    expect(documentXml).toContain('Explain your reasoning.');
    expect(documentXml).toContain('w:hRule="atLeast"');
    expect(documentXml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
    expect(documentXml).toContain('<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
    expect(documentXml).toContain('A plotted function');
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

  it('fails rather than silently falling back to question screenshots', async () => {
    createBrowserHarness({ docxSource: null });
    await expect(
      new PrintRenderer().renderDocx({
        url: 'https://localhost:3000/print',
        cover,
        footerLabel: 'Form ID 13',
      }),
    ).rejects.toThrow('The printable page did not capture editable question content');
  });
});

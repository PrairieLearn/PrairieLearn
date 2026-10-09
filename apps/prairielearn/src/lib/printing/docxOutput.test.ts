import { load } from 'cheerio';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocxDocument } from './docxDocument.js';
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
    stylesXml: await read('word/styles.xml'),
  };
}

async function renderDocx({
  cover,
  footerLabel,
  pageDataset = { printQuestionCount: '3', printMaxPoints: '15' },
}: {
  cover?:
    PrintableCover | ((dataset: Readonly<Record<string, string | undefined>>) => PrintableCover);
  footerLabel: string;
  pageDataset?: Record<string, string>;
}) {
  const document = createDocxDocument({
    geometry: LETTER_GEOMETRY,
    cover: typeof cover === 'function' ? cover(pageDataset) : cover,
    footerLabel,
    source,
    figures: [{ ...source.figures[0], png: PNG_SIGNATURE }],
  });
  return await Packer.toBuffer(document);
}

describe('createDocxDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes authored cover figures alongside editable instructions', async () => {
    const docx = await renderDocx({
      cover: {
        ...cover,
        sections: [
          {
            heading: 'Instructions',
            blocks: [
              { type: 'paragraph', text: 'Use this diagram.' },
              {
                type: 'figure',
                src: '/diagram.png',
                alt: 'Circuit diagram',
                png: Array.from(PNG_SIGNATURE),
                width: 100,
                height: 60,
              },
            ],
          },
        ],
      },
      footerLabel: 'Form A',
    });
    const { documentXml, files } = await readDocx(docx);
    expect(documentXml).toContain('Use this diagram.');
    expect(documentXml).toContain('Circuit diagram');
    expect(files.filter((file) => file.startsWith('word/media/'))).toHaveLength(2);
  });

  it('keeps cover grading scores blank and fills columns before rows', async () => {
    const docx = await renderDocx({
      cover: {
        ...cover,
        gradingTable: { questionNumbers: ['1', '2', '3', '4', '5'], rowsPerColumn: 3 },
      },
      footerLabel: 'Form A',
    });
    const { documentXml } = await readDocx(docx);
    expect(documentXml.match(/(?:[1-5]|Total) {3}__________/g)).toEqual([
      '1   __________',
      '4   __________',
      '2   __________',
      '5   __________',
      '3   __________',
      'Total   __________',
    ]);
  });

  it.each([0, -2, 1.9])(
    'uses one row for an invalid grading row count of %s',
    async (rowsPerColumn) => {
      const docx = await renderDocx({
        cover: { ...cover, gradingTable: { questionNumbers: ['1', '2'], rowsPerColumn } },
        footerLabel: 'Form A',
      });
      const { documentXml } = await readDocx(docx);
      expect(documentXml).toContain('1   __________');
      expect(documentXml).toContain('2   __________');
      expect(documentXml).toContain('Total   __________');
    },
  );

  it('keeps a wide cover field in sequence after a partially filled row', async () => {
    const docx = await renderDocx({
      cover: {
        ...cover,
        fields: [{ label: 'Section' }, { label: 'Full name', wide: true }, { label: 'Date' }],
      },
      footerLabel: 'Form A',
    });
    const { documentXml } = await readDocx(docx);
    const word = load(documentXml, { xmlMode: true });
    const labels = word('w\\:t')
      .map((_, element) => word(element).text())
      .get();
    expect(labels.indexOf('Section')).toBeLessThan(labels.indexOf('Full name'));
    expect(labels.indexOf('Full name')).toBeLessThan(labels.indexOf('Date'));
  });

  it('keeps question text, math, lists, tables, and answer spaces editable', async () => {
    const docx = await renderDocx({
      cover,
      footerLabel: 'Form ID 13',
    });
    const { files, documentXml, footerXml, stylesXml } = await readDocx(docx);
    const styles = load(stylesXml, { xmlMode: true });
    const defaultParagraphStyle = styles('w\\:style[w\\:type="paragraph"][w\\:default="1"]');
    expect(defaultParagraphStyle).toHaveLength(1);
    expect(defaultParagraphStyle.attr('w:styleId')).toBe('Normal');
    expect(defaultParagraphStyle.find('w\\:sz').attr('w:val')).toBe('21');
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

  it('starts with questions without a leading page break when the cover is omitted', async () => {
    const docx = await renderDocx({
      footerLabel: 'Form A',
    });
    const { documentXml, footerXml } = await readDocx(docx);
    expect(documentXml).toContain('Find the derivative');
    expect(documentXml).not.toContain(cover.title);
    expect(documentXml).not.toContain('<w:pageBreakBefore/>');
    expect(footerXml).toContain('Form A');
  });

  it('lets the cover depend on the rendered page dataset', async () => {
    const buildCover = vi.fn(
      (dataset: Readonly<Record<string, string | undefined>>): PrintableCover => ({
        ...cover,
        summary: [
          { term: 'Questions', value: dataset.printQuestionCount ?? '' },
          { term: 'Points', value: dataset.printMaxPoints ?? '' },
        ],
      }),
    );

    const docx = await renderDocx({
      cover: buildCover,
      footerLabel: 'Answer key  |  Form ID 13',
      pageDataset: { printQuestionCount: '7', printMaxPoints: '50' },
    });
    const { documentXml } = await readDocx(docx);

    expect(buildCover).toHaveBeenCalledWith({ printQuestionCount: '7', printMaxPoints: '50' });
    expect(documentXml).toContain('>7<');
    expect(documentXml).toContain('>50<');
  });
});

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { Page } from 'playwright';

import type { PrintableCover, PrintableCoverField, PrintableTextBlock } from './printableCover.js';
import { type RenderPrintablePageOptions, renderPrintablePage } from './printablePage.js';

export interface RenderUrlToDocxOptions extends RenderPrintablePageOptions {
  /**
   * The cover page content. A function receives the paginated page's root `data-*` attributes,
   * which lets callers include values that are only known after the page has rendered.
   */
  cover:
    | PrintableCover
    | ((pageDataset: Readonly<Record<string, string | undefined>>) => PrintableCover);
  /** Text placed before the page counter in every footer, for example `Form ID 13`. */
  footerLabel: string;
}

/** Sheet and margin geometry measured from the first paginated page, in CSS pixels. */
interface PrintedPageGeometry {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

interface PrintedQuestionImage {
  pageIndex: number;
  width: number;
  height: number;
  png: Buffer;
}

/** One CSS pixel is 0.75pt, and Word measures page geometry in twentieths of a point. */
const DXA_PER_PX = 15;
const IMAGE_DEVICE_SCALE_FACTOR = 2;
const FOOTER_DISTANCE_DXA = 400;
const FONT = 'Arial';
const BODY_FONT_SIZE = 21;
const SMALL_FONT_SIZE = 16;
const LABEL_FONT_SIZE = 15;
const QUESTION_IMAGE_STYLE_ID = 'PrintedQuestionImage';
const ORDERED_LIST_REFERENCE = 'printable-ordered-list';
const BULLET_LIST_REFERENCE = 'printable-bullet-list';
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const RULE_BORDER = { style: BorderStyle.SINGLE, size: 8, color: '111111' };

/**
 * Renders a paginated printable page to a Word document. The cover and running footer are
 * native, editable Word content; every printed question becomes one image so that the question
 * looks exactly as it does in the PDF, and page breaks reproduce the PDF's pagination.
 */
export function renderUrlToDocx(options: RenderUrlToDocxOptions): Promise<Buffer> {
  const { cover, footerLabel, ...pageOptions } = options;
  return renderPrintablePage(pageOptions, {
    outputLabel: 'DOCX',
    deviceScaleFactor: IMAGE_DEVICE_SCALE_FACTOR,
    produce: async (page) => {
      const pageDataset = await page.evaluate(() => ({ ...document.documentElement.dataset }));
      const geometry = await readPrintedPageGeometry(page);
      const questionImages = await captureQuestionImages(page);
      return await buildDocx({
        geometry,
        cover: typeof cover === 'function' ? cover(pageDataset) : cover,
        footerLabel,
        questionImages,
      });
    },
  });
}

async function readPrintedPageGeometry(page: Page): Promise<PrintedPageGeometry> {
  return await page.evaluate(() => {
    const firstPage = document.querySelector('.pagedjs_page');
    const contentArea = firstPage?.querySelector('.pagedjs_area');
    if (!firstPage || !contentArea) {
      throw new Error('The printable page did not produce any paginated pages');
    }
    const pageRect = firstPage.getBoundingClientRect();
    const areaRect = contentArea.getBoundingClientRect();
    return {
      pageWidth: pageRect.width,
      pageHeight: pageRect.height,
      marginTop: areaRect.top - pageRect.top,
      marginRight: pageRect.right - areaRect.right,
      marginBottom: pageRect.bottom - areaRect.bottom,
      marginLeft: areaRect.left - pageRect.left,
    };
  });
}

async function captureQuestionImages(page: Page): Promise<PrintedQuestionImage[]> {
  const questions = await page.locator('.pagedjs_page .printing-question').all();
  const images: PrintedQuestionImage[] = [];
  for (const question of questions) {
    const placement = await question.evaluate((element) => {
      const pages = [...document.querySelectorAll('.pagedjs_page')];
      const pageElement = element.closest('.pagedjs_page');
      const rect = element.getBoundingClientRect();
      return {
        pageIndex: pageElement ? pages.indexOf(pageElement) : -1,
        width: rect.width,
        height: rect.height,
      };
    });
    if (placement.pageIndex < 0) throw new Error('A printed question is not on a paginated page');
    const png = await question.screenshot({ type: 'png', scale: 'device' });
    images.push({ ...placement, png });
  }
  return images;
}

function toDxa(px: number): number {
  return Math.round(px * DXA_PER_PX);
}

function text(
  value: string,
  options: { bold?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text: value,
    bold: options.bold,
    size: options.size ?? BODY_FONT_SIZE,
    color: options.color,
    font: FONT,
  });
}

class ListNumbering {
  private instances = 0;

  next(ordered: boolean): { reference: string; level: number; instance: number } {
    // Each list gets its own numbering instance so ordered lists restart at 1.
    this.instances += 1;
    return {
      reference: ordered ? ORDERED_LIST_REFERENCE : BULLET_LIST_REFERENCE,
      level: 0,
      instance: this.instances,
    };
  }
}

function buildTextBlocks(blocks: PrintableTextBlock[], numbering: ListNumbering): Paragraph[] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case 'heading':
        return [
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [text(block.text, { bold: true, size: BODY_FONT_SIZE + 1 })],
          }),
        ];
      case 'paragraph':
        return [new Paragraph({ spacing: { after: 80 }, children: [text(block.text)] })];
      case 'list': {
        const listNumbering = numbering.next(block.ordered);
        return block.items.map(
          (item) =>
            new Paragraph({
              numbering: listNumbering,
              spacing: { after: 60 },
              children: [text(item)],
            }),
        );
      }
    }
  });
}

function buildFieldLines(fields: PrintableCoverField[], widthDxa: number): (Table | Paragraph)[] {
  const rows: PrintableCoverField[][] = [];
  let sharedRow: PrintableCoverField[] = [];
  for (const field of fields) {
    if (field.wide) {
      rows.push([field]);
      continue;
    }
    sharedRow.push(field);
    if (sharedRow.length === 3) {
      rows.push(sharedRow);
      sharedRow = [];
    }
  }
  if (sharedRow.length > 0) rows.push(sharedRow);

  return rows.flatMap((row) => {
    const columnWidth = Math.floor(widthDxa / row.length);
    return [
      new Table({
        width: { size: columnWidth * row.length, type: WidthType.DXA },
        columnWidths: row.map(() => columnWidth),
        borders: {
          top: NO_BORDER,
          bottom: NO_BORDER,
          left: NO_BORDER,
          right: NO_BORDER,
          insideHorizontal: NO_BORDER,
          insideVertical: NO_BORDER,
        },
        rows: [
          new TableRow({
            height: { value: 620, rule: HeightRule.EXACT },
            children: row.map(
              (field) =>
                new TableCell({
                  width: { size: columnWidth, type: WidthType.DXA },
                  margins: { left: 60, right: 200 },
                  borders: {
                    top: NO_BORDER,
                    left: NO_BORDER,
                    right: NO_BORDER,
                    bottom: RULE_BORDER,
                  },
                  verticalAlign: VerticalAlign.BOTTOM,
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 0 },
                      children: [text(field.label, { size: LABEL_FONT_SIZE, color: '333333' })],
                    }),
                  ],
                }),
            ),
          }),
        ],
      }),
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [] }),
    ];
  });
}

function buildSummary(cover: PrintableCover, widthDxa: number): Table {
  const columnWidth = Math.floor(widthDxa / cover.summary.length);
  return new Table({
    width: { size: columnWidth * cover.summary.length, type: WidthType.DXA },
    columnWidths: cover.summary.map(() => columnWidth),
    rows: [
      new TableRow({
        children: cover.summary.map(
          (item) =>
            new TableCell({
              width: { size: columnWidth, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { after: 20 },
                  children: [
                    text(item.term.toUpperCase(), {
                      bold: true,
                      size: LABEL_FONT_SIZE,
                      color: '555555',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 0 },
                  children: [text(item.value, { bold: true, size: BODY_FONT_SIZE + 1 })],
                }),
              ],
            }),
        ),
      }),
    ],
  });
}

function buildCover(cover: PrintableCover, contentWidthDxa: number): (Paragraph | Table)[] {
  const numbering = new ListNumbering();
  const line = (
    value: string,
    options: Parameters<typeof text>[1],
    spacing: { before?: number; after: number },
  ) => new Paragraph({ spacing, children: [text(value, options)] });

  return [
    line(cover.eyebrow, { bold: true, size: 28 }, { after: 0 }),
    ...(cover.eyebrowDetail
      ? [line(cover.eyebrowDetail, { size: 19, color: '444444' }, { after: 160 })]
      : []),
    line(cover.title, { bold: true, size: 48 }, { after: 40 }),
    ...(cover.subtitle
      ? [line(cover.subtitle, { size: 24, color: '333333' }, { after: 120 })]
      : []),
    ...(cover.documentLabel
      ? [line(cover.documentLabel, { size: 20, color: '444444' }, { after: 120 })]
      : []),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    ...buildFieldLines(cover.fields, contentWidthDxa),
    ...(cover.summary.length > 0
      ? [
          buildSummary(cover, contentWidthDxa),
          new Paragraph({ spacing: { after: 200 }, children: [] }),
        ]
      : []),
    ...cover.sections.flatMap((section) => [
      line(section.heading, { bold: true, size: 24 }, { before: 200, after: 80 }),
      ...buildTextBlocks(section.blocks, numbering),
      ...(section.signatureLabel
        ? [
            new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
            ...buildFieldLines(
              [{ label: section.signatureLabel }],
              Math.floor(contentWidthDxa / 2),
            ),
          ]
        : []),
    ]),
    line(cover.footer, { size: SMALL_FONT_SIZE, color: '555555' }, { before: 400, after: 0 }),
  ];
}

function buildQuestionPages(images: PrintedQuestionImage[], contentWidthPx: number): Paragraph[] {
  return images.map((image, index) => {
    const startsPage = index === 0 || image.pageIndex !== images[index - 1].pageIndex;
    const scale = Math.min(1, contentWidthPx / image.width);
    return new Paragraph({
      style: QUESTION_IMAGE_STYLE_ID,
      pageBreakBefore: startsPage,
      children: [
        new ImageRun({
          type: 'png',
          data: image.png,
          // Word lays out in whole points, so a page whose questions exactly fill the printable
          // height would otherwise spill its last question onto an extra page. The trimmed pixel
          // falls inside the question's own bottom spacing.
          transformation: {
            width: Math.max(1, Math.floor(image.width * scale)),
            height: Math.max(1, Math.floor(image.height * scale) - 1),
          },
        }),
      ],
    });
  });
}

function buildFooter(footerLabel: string): Footer {
  const footerText = { size: SMALL_FONT_SIZE, color: '555555', font: FONT };
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${footerLabel}  |  Page `, ...footerText }),
          new TextRun({ children: [PageNumber.CURRENT], ...footerText }),
          new TextRun({ text: ' of ', ...footerText }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], ...footerText }),
        ],
      }),
    ],
  });
}

async function buildDocx({
  geometry,
  cover,
  footerLabel,
  questionImages,
}: {
  geometry: PrintedPageGeometry;
  cover: PrintableCover;
  footerLabel: string;
  questionImages: PrintedQuestionImage[];
}): Promise<Buffer> {
  const contentWidthPx = geometry.pageWidth - geometry.marginLeft - geometry.marginRight;
  const listLevel = (
    format: (typeof LevelFormat)[keyof typeof LevelFormat],
    levelText: string,
  ) => ({
    level: 0,
    format,
    text: levelText,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540, hanging: 300 } } },
  });

  const document = new Document({
    creator: 'PrairieLearn',
    title: cover.title,
    styles: {
      default: { document: { run: { font: FONT, size: BODY_FONT_SIZE } } },
      paragraphStyles: [
        {
          id: QUESTION_IMAGE_STYLE_ID,
          name: 'Printed question image',
          basedOn: 'Normal',
          // The paragraph mark's descender would otherwise add space below every question image.
          run: { size: 2 },
          paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO } },
        },
      ],
    },
    numbering: {
      config: [
        { reference: ORDERED_LIST_REFERENCE, levels: [listLevel(LevelFormat.DECIMAL, '%1.')] },
        { reference: BULLET_LIST_REFERENCE, levels: [listLevel(LevelFormat.BULLET, '•')] },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: toDxa(geometry.pageWidth), height: toDxa(geometry.pageHeight) },
            margin: {
              top: toDxa(geometry.marginTop),
              right: toDxa(geometry.marginRight),
              bottom: toDxa(geometry.marginBottom),
              left: toDxa(geometry.marginLeft),
              header: FOOTER_DISTANCE_DXA,
              footer: FOOTER_DISTANCE_DXA,
            },
          },
        },
        footers: { default: buildFooter(footerLabel) },
        children: [
          ...buildCover(cover, toDxa(contentWidthPx)),
          ...buildQuestionPages(questionImages, contentWidthPx),
        ],
      },
    ],
  });
  return await Packer.toBuffer(document);
}

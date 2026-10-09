import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  ImportedXmlComponent,
  LevelFormat,
  PageNumber,
  Paragraph,
  RunProperties,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

import { assertNever } from '@prairielearn/utils';

import type { DocxSource } from './docxBrowser.js';
import { type DocxFigure, buildDocxContent } from './docxContent.js';
import type { PrintableCover, PrintableCoverField, PrintableTextBlock } from './printableCover.js';

/** Sheet and margin geometry measured from the first paginated page, in CSS pixels. */
export interface PrintedPageGeometry {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

/** One CSS pixel is 0.75pt, and Word measures page geometry in twentieths of a point. */
const DXA_PER_PX = 15;
const FOOTER_DISTANCE_DXA = 400;
const FONT = 'Arial';
const BODY_FONT_SIZE = 21;
const SMALL_FONT_SIZE = 16;
const LABEL_FONT_SIZE = 15;
const ORDERED_LIST_REFERENCE = 'printable-ordered-list';
const BULLET_LIST_REFERENCE = 'printable-bullet-list';
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const RULE_BORDER = { style: BorderStyle.SINGLE, size: 8, color: '111111' };

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

function buildTextBlocks(
  blocks: PrintableTextBlock[],
  numbering: ListNumbering,
  contentWidthDxa: number,
): Paragraph[] {
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
      case 'figure': {
        if (!block.png || !block.width || !block.height) {
          throw new Error('A cover figure is missing from the Word export');
        }
        const scale = Math.min(1, contentWidthDxa / DXA_PER_PX / block.width, 740 / block.height);
        return [
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new ImageRun({
                type: 'png',
                data: Uint8Array.from(block.png),
                altText: { name: block.alt, title: block.alt, description: block.alt },
                transformation: {
                  width: Math.max(1, Math.round(block.width * scale)),
                  height: Math.max(1, Math.round(block.height * scale)),
                },
              }),
            ],
          }),
        ];
      }
      default:
        return assertNever(block);
    }
  });
}

function buildFieldLines(fields: PrintableCoverField[], widthDxa: number): (Table | Paragraph)[] {
  const rows: PrintableCoverField[][] = [];
  let sharedRow: PrintableCoverField[] = [];
  for (const field of fields) {
    if (field.wide) {
      if (sharedRow.length > 0) {
        rows.push(sharedRow);
        sharedRow = [];
      }
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

function buildGradingTable(
  gradingTable: NonNullable<PrintableCover['gradingTable']>,
  widthDxa: number,
): Table {
  const labels = [...gradingTable.questionNumbers, 'Total'];
  const rows = Math.max(1, Math.min(Math.floor(gradingTable.rowsPerColumn), labels.length));
  const columns = Math.ceil(labels.length / rows);
  const columnWidth = Math.floor(widthDxa / columns);
  return new Table({
    width: { size: widthDxa, type: WidthType.DXA },
    columnWidths: Array.from({ length: columns }, () => columnWidth),
    rows: Array.from(
      { length: rows },
      (_, row) =>
        new TableRow({
          height: { value: 420, rule: HeightRule.ATLEAST },
          children: Array.from({ length: columns }, (_, column) => {
            const label = labels[column * rows + row];
            return new TableCell({
              margins: { left: 100, right: 100, top: 60, bottom: 60 },
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: label
                    ? [text(`${label}   __________`, { bold: label === 'Total' })]
                    : [],
                }),
              ],
            });
          }),
        }),
    ),
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
      ...buildTextBlocks(section.blocks, numbering, contentWidthDxa),
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
    ...(cover.gradingTable
      ? [
          line('Grading', { bold: true, size: 24 }, { before: 200, after: 80 }),
          buildGradingTable(cover.gradingTable, contentWidthDxa),
        ]
      : []),
    line(cover.footer, { size: SMALL_FONT_SIZE, color: '555555' }, { before: 400, after: 0 }),
  ];
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

export function createDocxDocument({
  geometry,
  cover,
  footerLabel,
  source,
  figures,
}: {
  geometry: PrintedPageGeometry;
  cover?: PrintableCover;
  footerLabel: string;
  source: DocxSource;
  figures: DocxFigure[];
}): Document {
  const contentWidthPx = geometry.pageWidth - geometry.marginLeft - geometry.marginRight;
  const content = buildDocxContent(
    source.html,
    figures,
    contentWidthPx,
    geometry.pageHeight - geometry.marginTop - geometry.marginBottom,
    !!cover,
  );
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

  // Pages needs an explicit default paragraph style to size imported equations correctly.
  const normalStyle = new ImportedXmlComponent('w:style', {
    'w:type': 'paragraph',
    'w:styleId': 'Normal',
    'w:default': '1',
  });
  normalStyle.push(new ImportedXmlComponent('w:name', { 'w:val': 'Normal' }));
  normalStyle.push(new RunProperties({ font: FONT, size: BODY_FONT_SIZE }));

  const document = new Document({
    creator: 'PrairieLearn',
    title: cover?.title,
    styles: {
      default: { document: { run: { font: FONT, size: BODY_FONT_SIZE } } },
      importedStyles: [normalStyle],
    },
    numbering: {
      config: [
        { reference: ORDERED_LIST_REFERENCE, levels: [listLevel(LevelFormat.DECIMAL, '%1.')] },
        { reference: BULLET_LIST_REFERENCE, levels: [listLevel(LevelFormat.BULLET, '•')] },
        ...content.numbering,
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
        children: [...(cover ? buildCover(cover, toDxa(contentWidthPx)) : []), ...content.children],
      },
    ],
  });
  return document;
}

import { load } from 'cheerio';
import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  HeightRule,
  type INumberingOptions,
  ImageRun,
  ImportedXmlComponent,
  LevelFormat,
  Paragraph,
  type ParagraphChild,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  Math as WordMath,
} from 'docx';
import { mml2omml } from 'mathml2omml';

import type { DocxSource } from './docxBrowser.js';

type HtmlNode = ReturnType<ReturnType<typeof load>>['0'];
type HtmlElement = Extract<HtmlNode, { type: 'tag' | 'script' | 'style' }>;
type Block = Paragraph | Table;
interface Format {
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  small?: boolean;
  sub?: boolean;
  sup?: boolean;
  underline?: boolean;
}
export type DocxFigure = DocxSource['figures'][number] & { png: Buffer };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const RULE = { style: BorderStyle.SINGLE, size: 8, color: '333333' };
const GRID = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
const NO_BORDERS = {
  top: NONE,
  bottom: NONE,
  left: NONE,
  right: NONE,
  insideHorizontal: NONE,
  insideVertical: NONE,
};

/** MathML is converted to native Office Math, including fractions, matrices, and scripts. */
class EditableMath extends WordMath {
  constructor(mathml: string) {
    super({ children: [] });
    const $ = load(mml2omml(mathml, { disableDecode: true }), { xmlMode: true });
    const convert = (node: HtmlNode): ImportedXmlComponent | string => {
      if (node.type === 'text') return node.data;
      if (!('attribs' in node)) throw new Error('Unexpected node in Office Math');
      const component = new ImportedXmlComponent(node.name, node.attribs);
      for (const child of node.children) component.push(convert(child));
      return component;
    };
    for (const node of $('m\\:oMath').contents()) this.root.push(convert(node));
  }
}

/** Maps normalized question HTML to editable Word content; only figures become images. */
export function buildDocxContent(
  html: string,
  figures: DocxFigure[],
  contentWidthPx: number,
  contentHeightPx = 900,
) {
  const $ = load(html, null, false);
  const figureById = new Map(figures.map((figure) => [figure.id, figure]));
  const numbering: INumberingOptions['config'][number][] = [];
  const widthDxa = Math.round(contentWidthPx * 15);
  const attribute = (node: HtmlElement, name: string) => node.attribs[name];
  const has = (node: HtmlElement, selector: string) => $(node).is(selector);
  const number = (node: HtmlElement, name: string, fallback: number) =>
    Number(attribute(node, name) ?? fallback);
  let keepFollowing = false;
  const text = (value: string, format: Format = {}) =>
    new TextRun({
      text: value,
      font: format.mono ? 'Courier New' : 'Arial',
      size: format.small ? 17 : 21,
      bold: format.bold,
      italics: format.italic,
      subScript: format.sub,
      superScript: format.sup,
      underline: format.underline ? {} : undefined,
    });
  const paragraph = (
    children: ParagraphChild[],
    options: ConstructorParameters<typeof Paragraph>[0] = {},
  ) =>
    new Paragraph({
      spacing: { after: 100, line: 260 },
      keepLines: true,
      keepNext: keepFollowing,
      children,
      ...(typeof options === 'string' ? {} : options),
    });
  const empty = () =>
    paragraph([], { spacing: { before: 0, after: 0, line: 20 }, run: { size: 2 } });

  function keepTogether(children: Block[], maxWidth: number): Block[] {
    const width = Math.round(maxWidth * 15);
    return [
      new Table({
        width: { size: width, type: WidthType.DXA },
        columnWidths: [width],
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [...children, empty()],
              }),
            ],
          }),
        ],
      }),
      empty(),
    ];
  }

  function image(node: HtmlElement, maxWidth: number): ImageRun {
    const figure = figureById.get(attribute(node, 'data-docx-figure'));
    if (!figure) throw new Error('A question figure is missing from the Word export');
    const scale = Math.min(1, maxWidth / figure.width, 740 / figure.height);
    return new ImageRun({
      type: 'png',
      data: figure.png,
      altText: { name: figure.alt, title: figure.alt, description: figure.alt },
      transformation: {
        width: Math.max(1, Math.round(figure.width * scale)),
        height: Math.max(1, Math.round(figure.height * scale)),
      },
    });
  }

  function formatFor(node: HtmlElement, format: Format): Format {
    return {
      ...format,
      bold: format.bold || has(node, 'b, strong, th, [data-docx-bold]'),
      italic: format.italic || has(node, 'i, em, [data-docx-italic]'),
      mono: format.mono || has(node, 'code, kbd, samp, pre'),
      small: format.small || has(node, 'small, .printing-response-placeholder'),
      sub: format.sub || node.name === 'sub',
      sup: format.sup || node.name === 'sup',
      underline: format.underline || node.name === 'u',
    };
  }

  function inline(nodes: HtmlNode[], format: Format, maxWidth: number): ParagraphChild[] {
    return nodes.flatMap((node): ParagraphChild[] => {
      if (node.type === 'text') {
        return [text(format.mono ? node.data : node.data.replaceAll(/\s+/g, ' '), format)];
      }
      if (!('attribs' in node)) return [];
      const next = formatFor(node, format);
      if (attribute(node, 'data-docx-math')) {
        return [new EditableMath(attribute(node, 'data-docx-math'))];
      }
      if (attribute(node, 'data-docx-figure')) return [image(node, maxWidth)];
      if (node.name === 'br') return [new TextRun({ break: 1 })];
      if (has(node, '[data-print-response-line]')) {
        const width = Math.min(number(node, 'data-docx-width', 180), maxWidth * 0.85);
        return [text('_'.repeat(Math.max(4, Math.floor(width / 7.5))))];
      }
      if (has(node, 'input[type="checkbox"], input[type="radio"], .printing-choice-marker')) {
        return [text(has(node, 'input[type="radio"]') ? '○ ' : '☐ ')];
      }
      if (node.name === 'input') return [];
      const children = inline(node.children, next, maxWidth);
      const href = attribute(node, 'href');
      if (node.name === 'a' && href && /^(https?:|mailto:)/.test(href)) {
        return [new ExternalHyperlink({ link: href, children })];
      }
      return children;
    });
  }

  function response(node: HtmlElement, maxWidth: number): Block[] {
    const label = $(node).find('.printing-response-label').first().text();
    const lines = $(node).find('.printing-response-lines').first()[0];
    const height = lines && 'attribs' in lines ? number(lines, 'data-docx-height', 206) : 206;
    const drawing = has(node, '.printing-drawing-response');
    const count = drawing ? 1 : Math.max(2, Math.round(height / 32));
    const size = Math.round(maxWidth * 15);
    const previousKeepFollowing = keepFollowing;
    keepFollowing = true;
    const blocks = [
      ...(label
        ? [
            paragraph([text(label, { bold: true, small: true })], {
              keepNext: true,
              spacing: { before: 100, after: 60 },
            }),
          ]
        : []),
      new Table({
        width: { size, type: WidthType.DXA },
        columnWidths: [size],
        borders: NO_BORDERS,
        rows: Array.from(
          { length: count },
          () =>
            new TableRow({
              height: { value: drawing ? Math.round(height * 15) : 480, rule: HeightRule.ATLEAST },
              children: [
                new TableCell({
                  margins: { top: 0, bottom: 0, left: 40, right: 40 },
                  borders: drawing
                    ? { top: GRID, bottom: GRID, left: GRID, right: GRID }
                    : { top: NONE, left: NONE, right: NONE, bottom: RULE },
                  children: [empty()],
                }),
              ],
            }),
        ),
      }),
    ];
    keepFollowing = previousKeepFollowing;
    return [...blocks, empty()];
  }

  function orderField(label?: string): TableCell {
    return new TableCell({
      width: { size: 720, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [
        ...(label ? [paragraph([text(label, { small: true })], { spacing: { after: 40 } })] : []),
        new Table({
          width: { size: 360, type: WidthType.DXA },
          columnWidths: [360],
          borders: { top: RULE, bottom: RULE, left: RULE, right: RULE },
          rows: [
            new TableRow({
              height: { value: 360, rule: HeightRule.ATLEAST },
              children: [new TableCell({ children: [empty()], margins: { top: 0, bottom: 0 } })],
            }),
          ],
        }),
        empty(),
      ],
    });
  }

  function ordering(node: HtmlElement, maxWidth: number): Block[] {
    const isGroup = has(node, '.printing-order-choice-group');
    const options = isGroup
      ? $(node).find('.printing-order-options > li').toArray()
      : $(node).children('li').toArray();
    const width = Math.round(maxWidth * 15);
    const indentation = $(node).find('.printing-order-indent').length > 0;
    const ordered = $(node).find('.printing-order-selection').length === 0;
    const fieldsWidth = indentation ? 1440 : 720;
    const label = $(node).find('.printing-order-choice-heading').first().text();
    const previousKeepFollowing = keepFollowing;
    keepFollowing = previousKeepFollowing || isGroup;
    const rows = options.map((option) => {
      const content = $(option).find('.printing-order-block-content').first()[0];
      return new TableRow({
        cantSplit: true,
        children: [
          orderField(indentation ? (ordered ? 'Order' : 'Use') : undefined),
          ...(indentation ? [orderField('Indent')] : []),
          new TableCell({
            width: { size: width - fieldsWidth, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 80 },
            children:
              content && 'children' in content
                ? walk(content.children, {}, maxWidth - fieldsWidth / 15 - 8)
                : [empty()],
          }),
        ],
      });
    });
    if (isGroup) {
      rows.unshift(
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              columnSpan: indentation ? 3 : 2,
              children: [paragraph([text(label, { bold: true, small: true })], { keepNext: true })],
            }),
          ],
        }),
      );
    }
    keepFollowing = previousKeepFollowing;
    const optionTable = new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: [...(indentation ? [720, 720] : [720]), width - fieldsWidth],
      borders: isGroup
        ? {
            top: GRID,
            bottom: GRID,
            left: GRID,
            right: GRID,
            insideHorizontal: NONE,
            insideVertical: NONE,
          }
        : NO_BORDERS,
      rows,
    });
    if (!isGroup) return [optionTable, empty()];
    return keepTogether([optionTable], maxWidth);
  }

  function table(node: HtmlElement, maxWidth: number): Block[] {
    const matrix = $(node).closest('.pl-matrix-component-input-container').length > 0;
    const cells = (row: HtmlNode) =>
      $(row)
        .children(matrix ? 'td:not([rowspan])' : 'td, th')
        .toArray();
    const measuredWidth = number(node, 'data-docx-width', maxWidth);
    maxWidth = Math.min(maxWidth, measuredWidth || maxWidth);
    const rows = $(node)
      .children('thead, tbody, tfoot')
      .children('tr')
      .add($(node).children('tr'))
      .toArray();
    if (rows.length === 0) return [];
    const columnCount = Math.max(
      ...rows.map((row) => cells(row).reduce((sum, cell) => sum + number(cell, 'colspan', 1), 0)),
    );
    const columnWidth = Math.floor((maxWidth * 15) / columnCount);
    return [
      new Table({
        width: { size: columnWidth * columnCount, type: WidthType.DXA },
        columnWidths: Array.from({ length: columnCount }, () => columnWidth),
        borders: matrix ? { ...NO_BORDERS, left: RULE, right: RULE } : undefined,
        rows: rows.map(
          (row) =>
            new TableRow({
              tableHeader: $(row).parent().is('thead'),
              children: cells(row).map((cell) => {
                const span = number(cell, 'colspan', 1);
                return new TableCell({
                  width: { size: columnWidth * span, type: WidthType.DXA },
                  columnSpan: span,
                  rowSpan: number(cell, 'rowspan', 1),
                  shading: cell.name === 'th' ? { fill: 'F2F2F2' } : undefined,
                  margins: { top: 80, bottom: 80, left: 100, right: 100 },
                  borders: matrix ? { top: NONE, bottom: NONE } : undefined,
                  children: walk(
                    cell.children,
                    { bold: cell.name === 'th' },
                    (columnWidth * span) / 15 - 14,
                  ),
                });
              }),
            }),
        ),
      }),
      empty(),
    ];
  }

  function selectionOption(node: HtmlElement, maxWidth: number): Block[] {
    const control = $(node).find('input[type="checkbox"], input[type="radio"]').first();
    const key = $(node)
      .find('.pl-checkbox-key-label, .pl-multiple-choice-key-label')
      .first()
      .text();
    const answer = $(node).find('.pl-checkbox-answer, .pl-multiple-choice-answer').first();
    const content = answer.length > 0 ? answer : $(node).clone();
    content.find('input').remove();
    const width = Math.round(maxWidth * 15);
    const columnWidths = key ? [400, 480, width - 880] : [400, width - 400];
    return [
      new Table({
        width: { size: width, type: WidthType.DXA },
        columnWidths,
        borders: { ...NO_BORDERS, bottom: { ...GRID, color: 'DDDDDD' } },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              [
                paragraph(
                  [
                    new TextRun({
                      text: control.attr('type') === 'radio' ? '○' : '☐',
                      font: 'Arial',
                      size: 28,
                    }),
                  ],
                  { spacing: { after: 0 } },
                ),
              ],
              ...(key ? [[paragraph([text(key, { bold: true })], { spacing: { after: 0 } })]] : []),
              walk(content.contents().toArray(), {}, (width - (key ? 880 : 400)) / 15 - 8),
            ].map(
              (children, index) =>
                new TableCell({
                  width: { size: columnWidths[index], type: WidthType.DXA },
                  margins: { top: 100, bottom: 100, left: 40, right: 40 },
                  children,
                }),
            ),
          }),
        ],
      }),
      empty(),
    ];
  }

  function walk(nodes: HtmlNode[], format: Format = {}, maxWidth = contentWidthPx): Block[] {
    const blocks: Block[] = [];
    let runs: ParagraphChild[] = [];
    const flush = () => {
      if (runs.length > 0) blocks.push(paragraph(runs));
      runs = [];
    };
    for (const node of nodes) {
      if (node.type === 'text' && !node.data.trim()) {
        if (runs.length > 0) runs.push(text(' '));
        continue;
      }
      if (!('attribs' in node)) {
        runs.push(...inline([node], format, maxWidth));
        continue;
      }
      if (has(node, '.printing-response-area')) {
        flush();
        blocks.push(...response(node, maxWidth));
        continue;
      }
      if (has(node, '.printing-order-choice-group, .printing-order-options')) {
        flush();
        blocks.push(...ordering(node, maxWidth));
        continue;
      }
      if (has(node, '.printing-response-instructions, .printing-checkbox-instructions')) {
        flush();
        blocks.push(
          paragraph(inline(node.children, formatFor(node, format), maxWidth), { keepNext: true }),
        );
        continue;
      }
      if (has(node, '.printing-selection-option')) {
        flush();
        blocks.push(...selectionOption(node, maxWidth));
        continue;
      }
      if (
        has(node, '.printing-keep-together') &&
        number(node, 'data-docx-height', Infinity) < contentHeightPx * 0.8
      ) {
        flush();
        const previousKeepFollowing = keepFollowing;
        keepFollowing = true;
        const group = walk(node.children, formatFor(node, format), maxWidth);
        // Paragraph keep-next does not reliably keep adjacent Word tables together.
        blocks.push(
          ...(group.some((block) => block instanceof Table)
            ? keepTogether(group, maxWidth)
            : group),
        );
        keepFollowing = previousKeepFollowing;
        blocks.push(empty());
        continue;
      }
      if (node.name === 'table') {
        flush();
        blocks.push(...table(node, maxWidth));
        continue;
      }
      if ($(node).find('.printing-selection-option, .input-group').length > 0) {
        flush();
        blocks.push(...walk(node.children, format, maxWidth));
        continue;
      }
      if (node.name === 'p') {
        flush();
        const next = $(node).next();
        blocks.push(
          paragraph(inline(node.children, formatFor(node, format), maxWidth), {
            keepNext:
              keepFollowing ||
              next.is('[data-docx-figure], .printing-keep-together') ||
              next.find('[data-docx-figure]').length > 0,
          }),
        );
        continue;
      }
      if (has(node, '.input-group') && $(node).find('table, .printing-response-area').length > 0) {
        flush();
        blocks.push(...walk(node.children, format, maxWidth));
        continue;
      }
      if (has(node, '.form-check, .checkbox, .radio, .trueFalse, .input-group, .printing-choice')) {
        flush();
        blocks.push(paragraph(inline(node.children, format, maxWidth)));
        continue;
      }
      if (node.name === 'ul' || node.name === 'ol') {
        flush();
        const reference = `question-list-${numbering.length}`;
        const ordered = node.name === 'ol';
        numbering.push({
          reference,
          levels: [
            {
              level: 0,
              format: ordered
                ? ({
                    A: LevelFormat.UPPER_LETTER,
                    a: LevelFormat.LOWER_LETTER,
                    I: LevelFormat.UPPER_ROMAN,
                    i: LevelFormat.LOWER_ROMAN,
                  }[attribute(node, 'type')] ?? LevelFormat.DECIMAL)
                : LevelFormat.BULLET,
              text: ordered ? '%1.' : '•',
              start: number(node, 'start', 1),
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 420, hanging: 220 } } },
            },
          ],
        });
        for (const item of $(node).children('li')) {
          blocks.push(
            paragraph(
              inline(
                item.children.filter(
                  (child) => !('attribs' in child) || !['ul', 'ol'].includes(child.name),
                ),
                format,
                maxWidth - 28,
              ),
              { numbering: { reference, level: 0 } },
            ),
          );
          for (const nested of $(item).children('ul, ol')) {
            blocks.push(...walk([nested], format, maxWidth - 28));
          }
        }
        continue;
      }
      if (node.name === 'pre') {
        flush();
        for (const line of $(node).text().replace(/\n$/, '').split('\n')) {
          blocks.push(
            paragraph([text(line, { mono: true })], { spacing: { after: 0, line: 240 } }),
          );
        }
        blocks.push(empty());
        continue;
      }
      if (/^h[1-6]$/.test(node.name)) {
        flush();
        blocks.push(
          paragraph(inline(node.children, { ...format, bold: true }, maxWidth), {
            keepNext: true,
            spacing: { before: 160, after: 80 },
          }),
        );
        continue;
      }
      if (node.name === 'hr') {
        flush();
        blocks.push(paragraph([], { border: { bottom: GRID } }));
        continue;
      }
      if (attribute(node, 'data-docx-display')) {
        flush();
        blocks.push(
          paragraph(inline([node], format, maxWidth), { alignment: AlignmentType.CENTER }),
        );
        continue;
      }
      if (attribute(node, 'data-docx-figure')) {
        flush();
        blocks.push(paragraph([image(node, maxWidth)]));
        continue;
      }
      if (attribute(node, 'data-docx-block') && !has(node, '[data-print-response-line]')) {
        flush();
        blocks.push(...walk(node.children, formatFor(node, format), maxWidth));
        continue;
      }
      runs.push(...inline([node], format, maxWidth));
    }
    flush();
    return blocks.length > 0 ? blocks : [empty()];
  }

  const children = $('.printing-question')
    .toArray()
    .flatMap((question, index) => {
      // Preserve small questions as a unit; long questions remain free to span Word pages.
      keepFollowing = number(question, 'data-docx-height', Infinity) < contentHeightPx * 0.7;
      const blocks = [
        paragraph(
          [text(`Question ${attribute(question, 'data-question-number')}`, { bold: true })],
          {
            pageBreakBefore: index === 0,
            keepNext: true,
            spacing: { before: 240, after: 120 },
            border: { bottom: GRID },
          },
        ),
        ...walk(
          $(question).find('.question-body').first().contents().toArray().length > 0
            ? $(question).find('.question-body').first().contents().toArray()
            : $(question).find('.question-container > .card-body').first().contents().toArray(),
        ),
      ];
      const keepQuestion = keepFollowing && blocks.some((block) => block instanceof Table);
      keepFollowing = false;
      return keepQuestion ? keepTogether(blocks, contentWidthPx) : [...blocks, empty()];
    });
  return { children, numbering, widthDxa };
}

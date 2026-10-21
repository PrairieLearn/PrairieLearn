/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- Cheerio's string node types are declared as DOM enum values. */
import { load } from 'cheerio';
import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  type INumberingOptions,
  type IParagraphOptions,
  ImageRun,
  ImportedXmlComponent,
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

import type { DocxSource } from './docx-browser.js';

export type HtmlNode = ReturnType<ReturnType<typeof load>>['0'];
export type HtmlElement = Extract<HtmlNode, { type: 'tag' | 'script' | 'style' }>;
export type Block = Paragraph | Table;
export type RenderBlocks = (nodes: HtmlNode[], format: Format, maxWidth: number) => Block[];
export interface Format {
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  small?: boolean;
  sub?: boolean;
  sup?: boolean;
  underline?: boolean;
}
export type DocxFigure = DocxSource['figures'][number] & { png: Uint8Array };
export const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
export const RULE = { style: BorderStyle.SINGLE, size: 8, color: '333333' };
export const GRID = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
export const MAX_TABLE_DIMENSION = 64;
export const NO_BORDERS = {
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

export function createDocxContentContext(html: string, figures: DocxFigure[]) {
  const $ = load(html, null, false);
  const figureById = new Map(figures.map((figure) => [figure.id, figure]));
  const state = { numbering: [] as INumberingOptions['config'][number][], keepFollowing: false };
  const attribute = (node: HtmlElement, name: string) => node.attribs[name];
  const has = (node: HtmlElement, selector: string) => $(node).is(selector);
  const number = (node: HtmlElement, name: string, fallback: number) =>
    Number(Object.hasOwn(node.attribs, name) ? attribute(node, name) : fallback);
  const alignment = (node: HtmlElement) =>
    attribute(node, 'data-docx-align') === 'center'
      ? AlignmentType.CENTER
      : attribute(node, 'data-docx-align') === 'right'
        ? AlignmentType.RIGHT
        : undefined;
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
  const paragraph = (children: ParagraphChild[], options: IParagraphOptions = {}) =>
    new Paragraph({
      spacing: { after: 100, line: 260 },
      keepLines: true,
      keepNext: state.keepFollowing,
      children,
      ...options,
    });
  const empty = () =>
    paragraph([], { spacing: { before: 0, after: 0, line: 20 }, run: { size: 2 } });

  function withKeepFollowing<T>(value: boolean, render: () => T): T {
    const previous = state.keepFollowing;
    state.keepFollowing = value;
    try {
      return render();
    } finally {
      state.keepFollowing = previous;
    }
  }

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
      mono: format.mono || has(node, 'code, kbd, samp, pre, [data-docx-mono]'),
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
      if (
        has(node, '.printing-response-placeholder') &&
        $(node).parent().is('.printing-response-field')
      ) {
        return [new TextRun({ break: 1 }), ...inline(node.children, next, maxWidth)];
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

  return {
    $,
    state,
    attribute,
    has,
    number,
    alignment,
    text,
    paragraph,
    empty,
    withKeepFollowing,
    keepTogether,
    image,
    formatFor,
    inline,
  };
}

export type DocxContentContext = ReturnType<typeof createDocxContentContext>;

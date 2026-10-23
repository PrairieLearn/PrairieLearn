/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- Cheerio's string node types are declared as DOM enum values. */
import { HeightRule, Table, TableCell, TableRow, WidthType } from 'docx';

import {
  type Block,
  type DocxContentContext,
  type Format,
  GRID,
  type HtmlElement,
  type HtmlNode,
  NONE,
  NO_BORDERS,
  RULE,
} from './docx-content-context.js';

export function renderGuidedInputGroup(
  ctx: DocxContentContext,
  node: HtmlElement,
  format: Format,
  maxWidth: number,
): Table | null {
  const { $, has, number, paragraph, inline, formatFor } = ctx;
  const children = $(node)
    .contents()
    .toArray()
    .filter((child) => (child.type === 'text' ? child.data.trim() !== '' : 'attribs' in child));
  const fields = children.filter(
    (child): child is HtmlElement => 'attribs' in child && has(child, '.printing-response-field'),
  );
  if (
    fields.length !== 1 ||
    children.some((child) => 'attribs' in child && has(child, 'table, .printing-response-area'))
  ) {
    return null;
  }

  const field = fields[0];
  const line = $(field).children('[data-print-response-line]').toArray().at(0);
  const hint = $(field).children('.printing-response-placeholder').toArray().at(0);
  if (!line || !hint || !('attribs' in line) || !('attribs' in hint)) return null;

  const fieldIndex = children.indexOf(field);
  const before = children.slice(0, fieldIndex);
  const after = children.slice(fieldIndex + 1);
  const measuredWidth = (child: HtmlNode) =>
    'attribs' in child
      ? number(child, 'data-docx-width', $(child).text().length * 8)
      : child.type === 'text'
        ? child.data.trim().length * 8
        : 0;
  const columns = [
    ...(before.length > 0
      ? [
          {
            nodes: before,
            width: before.reduce((sum, child) => sum + measuredWidth(child), 0) + 5,
          },
        ]
      : []),
    { nodes: [field], width: number(field, 'data-docx-width', 180) + (after.length > 0 ? 5 : 0) },
    ...(after.length > 0
      ? [
          {
            nodes: after,
            width: after.reduce((sum, child) => sum + measuredWidth(child), 0),
          },
        ]
      : []),
  ];
  const scale = Math.min(1, maxWidth / columns.reduce((sum, column) => sum + column.width, 0));
  const widths = columns.map((column) => Math.max(15, Math.round(column.width * scale * 15)));
  const size = widths.reduce((sum, width) => sum + width, 0);
  return new Table({
    width: { size, type: WidthType.DXA },
    columnWidths: widths,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: columns.map(
          (column, index) =>
            new TableCell({
              width: { size: widths[index], type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              borders: NO_BORDERS,
              children:
                column.nodes[0] === field
                  ? [
                      paragraph(inline([line], format, column.width), {
                        spacing: { before: 0, after: 0, line: 240 },
                        keepNext: true,
                      }),
                      paragraph(inline(hint.children, formatFor(hint, format), column.width), {
                        spacing: { before: 0, after: 0, line: 200 },
                      }),
                    ]
                  : [paragraph(inline(column.nodes, format, column.width))],
            }),
        ),
      }),
    ],
  });
}

export function renderResponse(
  ctx: DocxContentContext,
  node: HtmlElement,
  maxWidth: number,
): Block[] {
  const { $, number, has, paragraph, inline, text, empty, withKeepFollowing } = ctx;
  const label = $(node).find('.printing-response-label').first().text();
  const instructions = $(node).find('.printing-response-instructions').toArray();
  const lines = $(node).find('.printing-response-lines').first().toArray().at(0);
  const height = lines && 'attribs' in lines ? number(lines, 'data-docx-height', 206) : 206;
  const drawing = has(node, '.printing-drawing-response');
  const count = drawing ? 1 : Math.max(2, Math.round(height / 32));
  const size = Math.round(maxWidth * 15);
  const blocks = withKeepFollowing(true, () => [
    ...(label
      ? [
          paragraph([text(label, { bold: true, small: true })], {
            keepNext: true,
            spacing: { before: 100, after: 60 },
          }),
        ]
      : []),
    ...instructions.map((instruction) =>
      paragraph(inline(instruction.children, { small: true }, maxWidth), {
        keepNext: true,
        spacing: { before: 0, after: 60 },
      }),
    ),
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
  ]);
  return [...blocks, empty()];
}

import { Table, TableCell, TableRow, WidthType } from 'docx';

import {
  type Block,
  type DocxContentContext,
  type Format,
  GRID,
  type HtmlElement,
  type HtmlNode,
  MAX_TABLE_DIMENSION,
  NONE,
  NO_BORDERS,
  RULE,
  type RenderBlocks,
} from './docx-content-context.js';

export function renderHtmlTable(
  ctx: DocxContentContext,
  node: HtmlElement,
  maxWidth: number,
  renderBlocks: RenderBlocks,
): Block[] {
  const { $, number, paragraph, text, empty } = ctx;
  const matrix = $(node).closest('.pl-matrix-component-input-container').length > 0;
  const cells = (row: HtmlNode) =>
    $(row)
      .children(matrix ? 'td:not([rowspan])' : 'td, th')
      .toArray();
  const fallback = () => {
    const content = $(node).text().trim();
    return content ? [paragraph([text(content)])] : [];
  };
  const measuredWidth = number(node, 'data-docx-width', maxWidth);
  maxWidth = Math.min(maxWidth, measuredWidth || maxWidth);
  const rows = $(node)
    .children('thead, tbody, tfoot')
    .children('tr')
    .add($(node).children('tr'))
    .toArray()
    .filter((row) => cells(row).length > 0);
  if (rows.length === 0) return fallback();
  let columnCount = 0;
  for (const row of rows) {
    let rowColumnCount = 0;
    for (const cell of cells(row)) {
      const columnSpan = number(cell, 'colspan', 1);
      const rowSpan = number(cell, 'rowspan', 1);
      if (
        !Number.isSafeInteger(columnSpan) ||
        !Number.isSafeInteger(rowSpan) ||
        columnSpan < 1 ||
        rowSpan < 1 ||
        columnSpan > MAX_TABLE_DIMENSION ||
        rowSpan > MAX_TABLE_DIMENSION
      ) {
        return fallback();
      }
      rowColumnCount += columnSpan;
      if (rowColumnCount > MAX_TABLE_DIMENSION) return fallback();
    }
    columnCount = Math.max(columnCount, rowColumnCount);
  }
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
                children: renderBlocks(
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

export function renderDetails(
  ctx: DocxContentContext,
  node: HtmlElement,
  maxWidth: number,
  format: Format,
  renderBlocks: RenderBlocks,
): Block[] {
  const { $, paragraph, inline, empty } = ctx;
  const width = Math.round(maxWidth * 15);
  const innerWidth = maxWidth - 20;
  const summary = $(node).children('summary, .printing-details-heading').first().toArray().at(0);
  const content = node.children.filter((child) => child !== summary);
  return [
    new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: [width],
      borders: { top: GRID, bottom: GRID, left: GRID, right: GRID },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: 'F7F7F7' },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                ...(summary
                  ? [
                      paragraph(inline(summary.children, { ...format, bold: true }, innerWidth), {
                        keepNext: true,
                        spacing: { before: 0, after: 80 },
                      }),
                    ]
                  : []),
                ...renderBlocks(content, format, innerWidth),
              ],
            }),
          ],
        }),
      ],
    }),
    empty(),
  ];
}

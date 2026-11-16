import { HeightRule, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

import {
  type Block,
  type DocxContentContext,
  GRID,
  type HtmlElement,
  NONE,
  NO_BORDERS,
  RULE,
  type RenderBlocks,
} from './docx-content-context.js';

function orderField(ctx: DocxContentContext, label?: string): TableCell {
  const { paragraph, text, empty } = ctx;
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

export function renderOrdering(
  ctx: DocxContentContext,
  node: HtmlElement,
  maxWidth: number,
  renderBlocks: RenderBlocks,
): Block[] {
  const { $, state, has, paragraph, text, empty, keepTogether, withKeepFollowing } = ctx;
  const isGroup = has(node, '.printing-order-choice-group');
  const options = isGroup
    ? $(node).find('.printing-order-options > li').toArray()
    : $(node).children('li').toArray();
  const width = Math.round(maxWidth * 15);
  const indentation = $(node).find('.printing-order-indent').length > 0;
  const ordered = $(node).find('.printing-order-selection').length === 0;
  const fieldsWidth = indentation ? 1440 : 720;
  const label = $(node).find('.printing-order-choice-heading').first().text();
  const rows = withKeepFollowing(state.keepFollowing || isGroup, () => {
    const rows = options.map((option) => {
      const content = $(option).find('.printing-order-block-content').first().toArray().at(0);
      return new TableRow({
        cantSplit: true,
        children: [
          orderField(ctx, indentation ? (ordered ? 'Order' : 'Use') : undefined),
          ...(indentation ? [orderField(ctx, 'Indent')] : []),
          new TableCell({
            width: { size: width - fieldsWidth, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 80 },
            children:
              content && 'children' in content
                ? renderBlocks(content.children, {}, maxWidth - fieldsWidth / 15 - 8)
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
    return rows;
  });
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

export function renderSelectionOption(
  ctx: DocxContentContext,
  node: HtmlElement,
  maxWidth: number,
  renderBlocks: RenderBlocks,
): Block[] {
  const { $, paragraph, text, empty } = ctx;
  const control = $(node).find('input[type="checkbox"], input[type="radio"]').first();
  const key = $(node).find('.pl-checkbox-key-label, .pl-multiple-choice-key-label').first().text();
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
            renderBlocks(content.contents().toArray(), {}, (width - (key ? 880 : 400)) / 15 - 8),
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

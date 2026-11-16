import { AlignmentType, LevelFormat } from 'docx';

import {
  type Block,
  type DocxContentContext,
  type Format,
  GRID,
  type HtmlElement,
  type HtmlNode,
  type RenderBlocks,
} from './docx-content-context.js';

export function renderParagraph(
  ctx: DocxContentContext,
  node: HtmlElement,
  format: Format,
  maxWidth: number,
): Block[] {
  const { $, state, alignment, paragraph, inline, formatFor } = ctx;
  const next = $(node).next();
  return [
    paragraph(inline(node.children, formatFor(node, format), maxWidth), {
      alignment: alignment(node),
      keepNext:
        state.keepFollowing ||
        next.is('[data-docx-figure], .printing-keep-together') ||
        next.find('[data-docx-figure]').length > 0,
    }),
  ];
}

function renderList(
  ctx: DocxContentContext,
  node: HtmlElement,
  format: Format,
  maxWidth: number,
  renderBlocks: RenderBlocks,
): Block[] {
  const { $, state, number, attribute, has, paragraph, inline, formatFor } = ctx;
  if ($(node).children('.pl-order-block').length > 0) {
    return $(node)
      .children('.pl-order-block')
      .toArray()
      .map((item) => {
        const indent = Math.round(number(item, 'data-docx-indent', 0) * 15);
        return paragraph(inline(item.children, formatFor(item, format), maxWidth - indent / 15), {
          indent: { left: indent + 100 },
          spacing: { after: 60, line: 240 },
        });
      });
  }

  const reference = `question-list-${state.numbering.length}`;
  const ordered = node.name === 'ol';
  state.numbering.push({
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

  const blocks: Block[] = [];
  for (const item of $(node).children('li')) {
    let numbered = false;
    let inlineNodes: HtmlNode[] = [];
    const flushItem = () => {
      if (inlineNodes.length > 0 || !numbered) {
        blocks.push(
          paragraph(
            inline(inlineNodes, format, maxWidth - 28),
            numbered ? {} : { numbering: { reference, level: 0 } },
          ),
        );
        numbered = true;
        inlineNodes = [];
      }
    };
    for (const child of item.children) {
      if (
        'attribs' in child &&
        (child.name === 'ul' ||
          child.name === 'ol' ||
          has(child, '.printing-response-area') ||
          $(child).find('.printing-response-area').length > 0)
      ) {
        flushItem();
        blocks.push(...renderBlocks([child], format, maxWidth - 28));
      } else {
        inlineNodes.push(child);
      }
    }
    flushItem();
  }
  return blocks;
}

export function renderHtmlElement(
  ctx: DocxContentContext,
  node: HtmlElement,
  format: Format,
  maxWidth: number,
  renderBlocks: RenderBlocks,
): Block[] | null {
  const { $, attribute, has, alignment, text, paragraph, empty, image, formatFor, inline } = ctx;
  if (node.name === 'ul' || node.name === 'ol') {
    return renderList(ctx, node, format, maxWidth, renderBlocks);
  }
  if (node.name === 'pre') {
    return [
      ...$(node)
        .text()
        .replace(/\n$/, '')
        .split('\n')
        .map((line) =>
          paragraph([text(line, { mono: true })], { spacing: { after: 0, line: 240 } }),
        ),
      empty(),
    ];
  }
  if (/^h[1-6]$/.test(node.name)) {
    return [
      paragraph(inline(node.children, { ...format, bold: true }, maxWidth), {
        alignment: alignment(node),
        keepNext: true,
        spacing: { before: 160, after: 80 },
      }),
    ];
  }
  if (node.name === 'hr') return [paragraph([], { border: { bottom: GRID } })];
  if (attribute(node, 'data-docx-display')) {
    return [paragraph(inline([node], format, maxWidth), { alignment: AlignmentType.CENTER })];
  }
  if (attribute(node, 'data-docx-figure')) {
    return [paragraph([image(node, maxWidth)], { alignment: alignment(node) })];
  }
  if (attribute(node, 'data-docx-block') && !has(node, '[data-print-response-line]')) {
    return renderBlocks(node.children, formatFor(node, format), maxWidth);
  }
  return null;
}

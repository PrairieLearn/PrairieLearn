/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- Cheerio's string node types are declared as DOM enum values. */
import { Paragraph, type ParagraphChild, Table } from 'docx';

import { renderOrdering, renderSelectionOption } from './docx-content-choices.js';
import {
  type Block,
  type DocxFigure,
  type Format,
  GRID,
  type HtmlElement,
  type HtmlNode,
  createDocxContentContext,
} from './docx-content-context.js';
import { renderHtmlElement, renderParagraph } from './docx-content-elements.js';
import { renderGuidedInputGroup, renderResponse } from './docx-content-responses.js';
import { renderDetails, renderHtmlTable } from './docx-content-tables.js';

/**
 * Converts question HTML captured before pagination into editable Word content.
 * The captured HTML leaves out hidden content, and figures become images.
 */
export function buildDocxContent(
  html: string,
  figures: DocxFigure[],
  contentWidthPx: number,
  contentHeightPx = 900,
  startOnNewPage = true,
) {
  const ctx = createDocxContentContext(html, figures);
  const {
    $,
    state,
    attribute,
    has,
    number,
    text,
    paragraph,
    empty,
    keepTogether,
    withKeepFollowing,
    formatFor,
    inline,
  } = ctx;

  function renderBlock(node: HtmlElement, format: Format, maxWidth: number): Block[] | null {
    if (has(node, '.printing-response-area')) return renderResponse(ctx, node, maxWidth);
    if (has(node, '.printing-answer-key-label')) {
      return [
        paragraph(inline(node.children, { bold: true, small: true }, maxWidth), {
          keepNext: true,
          spacing: { before: 100, after: 60 },
        }),
      ];
    }
    if (has(node, '.printing-order-choice-group, .printing-order-options')) {
      return renderOrdering(ctx, node, maxWidth, walk);
    }
    if (has(node, '.printing-response-instructions, .printing-checkbox-instructions')) {
      return [
        paragraph(inline(node.children, formatFor(node, format), maxWidth), { keepNext: true }),
      ];
    }
    if (has(node, '.printing-selection-option')) {
      return renderSelectionOption(ctx, node, maxWidth, walk);
    }
    if (node.name === 'details' || has(node, '.printing-details')) {
      return renderDetails(ctx, node, maxWidth, format, walk);
    }
    if (
      has(node, '.printing-keep-together') &&
      number(node, 'data-docx-height', Infinity) < contentHeightPx * 0.8
    ) {
      const blocks = withKeepFollowing(true, () => {
        const group = walk(node.children, formatFor(node, format), maxWidth);
        // Paragraph keep-next does not reliably keep adjacent Word tables together.
        return group.some((block) => block instanceof Table)
          ? keepTogether(group, maxWidth)
          : group;
      });
      return [...blocks, empty()];
    }
    if (node.name === 'table') return renderHtmlTable(ctx, node, maxWidth, walk);
    if (
      $(node).find(
        '.printing-selection-option, .printing-select-options, .input-group, .printing-answer-key',
      ).length > 0
    ) {
      return walk(node.children, format, maxWidth);
    }
    if (
      node.name !== 'ul' &&
      node.name !== 'ol' &&
      $(node).find('.printing-response-area').length > 0
    ) {
      return walk(node.children, formatFor(node, format), maxWidth);
    }
    if (node.name === 'p') return renderParagraph(ctx, node, format, maxWidth);
    if (has(node, '.input-group')) {
      const group = renderGuidedInputGroup(ctx, node, format, maxWidth);
      if (group) return [group];
    }
    if (has(node, '.input-group') && $(node).find('table, .printing-response-area').length > 0) {
      return walk(node.children, format, maxWidth);
    }
    if (has(node, '.form-check, .input-group, .printing-choice')) {
      return [paragraph(inline(node.children, format, maxWidth))];
    }
    return renderHtmlElement(ctx, node, format, maxWidth, walk);
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
      const rendered = 'attribs' in node ? renderBlock(node, format, maxWidth) : null;
      if (rendered !== null) {
        flush();
        blocks.push(...rendered);
      } else {
        runs.push(...inline([node], format, maxWidth));
      }
    }
    flush();
    return blocks.length > 0 ? blocks : [empty()];
  }

  const questions = $('.printing-question').toArray();
  const children = questions.flatMap((question, index) => {
    // Preserve small questions as a unit; long questions remain free to span Word pages.
    state.keepFollowing = number(question, 'data-docx-height', Infinity) < contentHeightPx * 0.7;
    const questionBody = $(question).find('.question-body').first().contents().toArray();
    const blocks = [
      paragraph([text(`Question ${attribute(question, 'data-question-number')}`, { bold: true })], {
        pageBreakBefore: startOnNewPage && index === 0,
        keepNext: true,
        spacing: { before: 240, after: 120 },
        border: { bottom: GRID },
      }),
      ...walk(
        questionBody.length > 0
          ? questionBody
          : $(question).find('.question-container > .card-body').first().contents().toArray(),
      ),
    ];
    const keepQuestion = state.keepFollowing && blocks.some((block) => block instanceof Table);
    state.keepFollowing = false;
    const questionBlocks = keepQuestion
      ? keepTogether(blocks, contentWidthPx)
      : [...blocks, empty()];
    return index < questions.length - 1
      ? [
          ...questionBlocks,
          new Paragraph({ spacing: { after: 780, line: 20 }, run: { size: 2 }, children: [] }),
        ]
      : questionBlocks;
  });
  return { children, numbering: state.numbering };
}

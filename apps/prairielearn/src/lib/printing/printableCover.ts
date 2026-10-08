/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- Cheerio's string node types are declared as DOM enum values. */
import * as cheerio from 'cheerio';

type HtmlNode = ReturnType<ReturnType<typeof cheerio.load>>['0'];
type HtmlElement = Extract<HtmlNode, { type: 'tag' | 'script' | 'style' }>;

export type PrintableTextBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

export interface PrintableCoverField {
  label: string;
  /** A wide field takes a full row of the cover; other fields share rows. */
  wide?: boolean;
}

interface PrintableCoverSummaryItem {
  term: string;
  value: string;
}

export interface PrintableCoverSection {
  heading: string;
  blocks: PrintableTextBlock[];
  /** When set, the section ends with a labeled signature line. */
  signatureLabel?: string;
}

/** Content of a document's cover page, independent of any output format. */
export interface PrintableCover {
  /** Small text above the title, for example a course short name. */
  eyebrow: string;
  eyebrowDetail?: string;
  title: string;
  subtitle?: string;
  /** Distinguishes variants of the same document, for example `Answer key`. */
  documentLabel?: string;
  fields: PrintableCoverField[];
  summary: PrintableCoverSummaryItem[];
  sections: PrintableCoverSection[];
  gradingTable?: { questionNumbers: string[]; rowsPerColumn: number };
  footer: string;
}

function normalizeText(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Reduces an HTML fragment to headings, paragraphs, and flat lists so that author-provided cover
 * text such as assessment instructions can be reproduced in formats without an HTML renderer.
 * Inline formatting is dropped and nested lists are flattened into their parent item's text.
 */
export function htmlToTextBlocks(html: string): PrintableTextBlock[] {
  const $ = cheerio.load(html, null, false);
  const blocks: PrintableTextBlock[] = [];
  const blockTags = new Set(['article', 'blockquote', 'div', 'ol', 'p', 'section', 'ul']);
  const ignoredTags = new Set(['script', 'style', 'noscript', 'template']);
  const isBlock = (node: HtmlNode): node is HtmlElement =>
    node.type === 'tag' && (blockTags.has(node.tagName) || /^h[1-6]$/.test(node.tagName));

  function contentText(node: HtmlNode): string {
    if (node.type === 'text') return node.data;
    if (node.type !== 'tag' || ignoredTags.has(node.tagName)) return '';
    if (node.tagName === 'br') return ' ';
    return node.children
      .map((child) => `${contentText(child)}${isBlock(child) ? ' ' : ''}`)
      .join('');
  }

  function append(nodes: HtmlNode[]): void {
    let inlineText = '';
    const flush = () => {
      const text = normalizeText(inlineText);
      if (text) blocks.push({ type: 'paragraph', text });
      inlineText = '';
    };

    for (const node of nodes) {
      if (node.type === 'tag' && ignoredTags.has(node.tagName)) continue;
      if (!isBlock(node)) {
        inlineText += contentText(node);
        continue;
      }
      flush();
      if (/^h[1-6]$/.test(node.tagName)) {
        const text = normalizeText(contentText(node));
        if (text) blocks.push({ type: 'heading', text });
      } else if (node.tagName === 'ul' || node.tagName === 'ol') {
        const items = $(node)
          .children('li')
          .toArray()
          .map((item) => normalizeText(contentText(item)))
          .filter((item) => item !== '');
        if (items.length > 0) {
          blocks.push({ type: 'list', ordered: node.tagName === 'ol', items });
        }
      } else {
        append(node.children);
      }
    }
    flush();
  }

  append($.root().contents().toArray());

  return blocks;
}

import * as cheerio from 'cheerio';

export type PrintableTextBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

export interface PrintableCoverField {
  label: string;
  /** A wide field takes a full row of the cover; other fields share rows. */
  wide?: boolean;
}

export interface PrintableCoverSummaryItem {
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

  for (const node of $.root().contents()) {
    if (node.type === 'text') {
      const text = normalizeText(node.data);
      if (text) blocks.push({ type: 'paragraph', text });
      continue;
    }
    if (node.type !== 'tag') continue;

    const element = $(node);
    const tagName = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      const text = normalizeText(element.text());
      if (text) blocks.push({ type: 'heading', text });
    } else if (tagName === 'ul' || tagName === 'ol') {
      const items = element
        .children('li')
        .toArray()
        .map((item) => normalizeText($(item).text()))
        .filter((item) => item !== '');
      if (items.length > 0) blocks.push({ type: 'list', ordered: tagName === 'ol', items });
    } else {
      const text = normalizeText(element.text());
      if (text) blocks.push({ type: 'paragraph', text });
    }
  }

  return blocks;
}

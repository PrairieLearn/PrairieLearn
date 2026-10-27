/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- Cheerio's string node types are declared as DOM enum values. */
import * as cheerio from 'cheerio';

type HtmlNode = ReturnType<ReturnType<typeof cheerio.load>>['0'];
type HtmlElement = Extract<HtmlNode, { type: 'tag' | 'script' | 'style' }>;

export interface PrintableTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  script?: 'subscript' | 'superscript';
}

type TextFormat = Omit<PrintableTextRun, 'text'>;

export type PrintableTextBlock =
  | { type: 'heading'; runs: PrintableTextRun[] }
  | { type: 'paragraph'; runs: PrintableTextRun[] }
  | { type: 'list'; ordered: boolean; items: PrintableTextRun[][] };

export interface PrintableCoverField {
  label: string;
  /** A wide field takes a full row of the cover; other fields share rows. */
  wide?: boolean;
}

interface PrintableCoverSummaryItem {
  term: string;
  value: string;
}

interface PrintableCoverSection {
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

function normalizeRuns(runs: PrintableTextRun[]): PrintableTextRun[] {
  const normalized: PrintableTextRun[] = [];
  for (const run of runs) {
    const previous = normalized.at(-1);
    let text = run.text.replaceAll(/\s+/g, ' ');
    if (!previous || previous.text.endsWith(' ')) text = text.trimStart();
    if (!text) continue;
    if (
      previous &&
      (['bold', 'italic', 'underline', 'strike', 'code', 'script'] as const).every(
        (key) => previous[key] === run[key],
      )
    ) {
      previous.text += text;
    } else {
      normalized.push({ ...run, text });
    }
  }
  const last = normalized.at(-1);
  if (last) {
    last.text = last.text.trimEnd();
    if (!last.text) normalized.pop();
  }
  return normalized;
}

/**
 * Reduces an HTML fragment to headings, paragraphs, and flat lists so that
 * author-provided cover content can be reproduced in formats without an HTML renderer.
 * Inline formatting is preserved. Images are dropped, and nested lists are flattened into their parent item's text.
 */
export function htmlToTextBlocks(html: string): PrintableTextBlock[] {
  const $ = cheerio.load(html, null, false);
  const blocks: PrintableTextBlock[] = [];
  const blockTags = new Set(['article', 'blockquote', 'div', 'ol', 'p', 'section', 'ul']);
  const ignoredTags = new Set(['script', 'style', 'noscript', 'template', 'img', 'svg']);
  const isHidden = (node: HtmlElement): boolean => {
    for (const element of $(node).parents().addBack()) {
      if (
        $(element).is('[hidden], [aria-hidden="true"]') ||
        /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(
          $(element).attr('style') ?? '',
        )
      ) {
        return true;
      }
    }
    return false;
  };
  const isBlock = (node: HtmlNode): node is HtmlElement =>
    node.type === 'tag' && (blockTags.has(node.tagName) || /^h[1-6]$/.test(node.tagName));

  function contentRuns(node: HtmlNode, format: TextFormat = {}): PrintableTextRun[] {
    if (node.type === 'text') return [{ text: node.data, ...format }];
    if (node.type !== 'tag' || ignoredTags.has(node.tagName) || isHidden(node)) return [];
    if (node.tagName === 'br') return [{ text: ' ', ...format }];
    const next = { ...format };
    switch (node.tagName) {
      case 'b':
      case 'strong':
        next.bold = true;
        break;
      case 'i':
      case 'em':
        next.italic = true;
        break;
      case 'u':
        next.underline = true;
        break;
      case 's':
      case 'del':
      case 'strike':
        next.strike = true;
        break;
      case 'code':
      case 'kbd':
      case 'samp':
      case 'pre':
        next.code = true;
        break;
      case 'sub':
        next.script = 'subscript';
        break;
      case 'sup':
        next.script = 'superscript';
        break;
    }
    return node.children.flatMap((child) => [
      ...contentRuns(child, next),
      ...(isBlock(child) ? [{ text: ' ' }] : []),
    ]);
  }

  function append(nodes: HtmlNode[]): void {
    let inlineRuns: PrintableTextRun[] = [];
    const flush = () => {
      const runs = normalizeRuns(inlineRuns);
      if (runs.length > 0) blocks.push({ type: 'paragraph', runs });
      inlineRuns = [];
    };

    for (const node of nodes) {
      if (node.type === 'tag' && (ignoredTags.has(node.tagName) || isHidden(node))) continue;
      if (!isBlock(node)) {
        inlineRuns.push(...contentRuns(node));
        continue;
      }
      flush();
      if (/^h[1-6]$/.test(node.tagName)) {
        const runs = normalizeRuns(contentRuns(node));
        if (runs.length > 0) blocks.push({ type: 'heading', runs });
      } else if (node.tagName === 'ul' || node.tagName === 'ol') {
        const items = $(node)
          .children('li')
          .toArray()
          .map((item) => normalizeRuns(contentRuns(item)))
          .filter((item) => item.length > 0);
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

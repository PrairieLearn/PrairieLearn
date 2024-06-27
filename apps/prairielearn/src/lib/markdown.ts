// @ts-check
import type { Root as HastRoot, Element } from 'hast';
import type { Root as MdastRoot, Code, Html, Text } from 'mdast';
import type { Math, InlineMath } from 'mdast-util-math';
import raw from 'rehype-raw';
import sanitize from 'rehype-sanitize';
import stringify from 'rehype-stringify';
import gfm from 'remark-gfm';
import math from 'remark-math';
import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import { type TransformCallback, type Transformer, unified } from 'unified';
import type { Node } from 'unist';
import { type Test, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

import { HtmlValue, html, joinHtml } from '@prairielearn/html';

// The ? symbol is used to make the match non-greedy (i.e., match the shortest
// possible string that fulfills the regex). See
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Quantifiers#types
const regex = /<markdown>(.*?)<\/markdown>/gms;
const escapeRegex = /(<\/?markdown)(#+)>/g;
const langRegex = /([^\\{]*)?(\{(.*)\})?/;

function visitCodeBlock(ast: MdastRoot) {
  return visit(ast, 'code', (node: Code, index, parent) => {
    const { lang, value } = node;
    const attrs: HtmlValue[] = [];

    const res = lang?.match(langRegex);
    if (res) {
      const language = res[1];
      const highlightLines = res[3];
      if (language) {
        attrs.push(html`language="${language}"`);
      }
      if (highlightLines) {
        attrs.push(html`highlight-lines="${highlightLines}"`);
      }
    }

    const newNode: Html = {
      type: 'html',
      value: html`<pl-code ${joinHtml(attrs, ' ')}>${value}</pl-code>`.toString(),
    };
    parent?.children.splice(index ?? 0, 1, newNode);
  });
}

/**
 * This visitor is used for inline markdown processing, particularly for cases where the result is
 * expected to be shown in a single line without a block. In essence, if the result of the
 * conversion contains a single paragraph (`p`) with some content, it replaces the paragraph itself
 * with the content of the paragraph.
 */
function visitCheckSingleParagraph(ast: HastRoot) {
  return visit(ast, 'root', (node) => {
    if (node.children.length === 1) {
      const child = node.children[0] as Element;
      if (child.tagName === 'p') {
        node.children = child.children;
      }
    }
  });
}

/**
 * By default, `remark-math` installs compilers to transform the AST back into
 * HTML, which ends up wrapping the math in unwanted spans and divs. Since all
 * math will be rendered on the client, we have our own visitor that will replace
 * any `math` or `inlineMath` nodes with raw text values wrapped in the appropriate
 * fences.
 */
function visitMathBlock(ast: MdastRoot) {
  return visit(ast, ['math', 'inlineMath'] as Test, (node: Math | InlineMath, index, parent) => {
    const startFence = node.type === 'math' ? '$$\n' : '$';
    const endFence = node.type === 'math' ? '\n$$' : '$';
    const text: Text = {
      type: 'text',
      value: startFence + node.value + endFence,
    };
    parent?.children.splice(index ?? 0, 1, text);
  });
}

function makeHandler<R extends Node>(visitor: (ast: R) => undefined): () => Transformer<R, R> {
  return () => (ast: R, vFile: VFile, callback?: TransformCallback<R>) => {
    visitor(ast);

    if (typeof callback === 'function') {
      return callback(undefined, ast, vFile);
    }
    return ast;
  };
}

const handleCode = makeHandler(visitCodeBlock);
const handleMath = makeHandler(visitMathBlock);

const defaultProcessor = unified()
  .use(markdown)
  .use(math)
  .use(handleMath)
  .use(gfm)
  .use(remark2rehype, { allowDangerousHtml: true })
  .use(raw)
  .use(sanitize)
  .use(stringify);

const inlineProcessor = unified()
  .use(markdown)
  .use(math)
  .use(handleMath)
  .use(gfm)
  .use(remark2rehype, { allowDangerousHtml: true })
  .use(raw)
  .use(sanitize)
  .use(makeHandler(visitCheckSingleParagraph))
  .use(stringify);

// The question processor also includes the use of pl-code instead of pre,
// and does not sanitize scripts
const questionProcessor = unified()
  .use(markdown)
  .use(math)
  .use(handleCode)
  .use(handleMath)
  .use(gfm)
  .use(remark2rehype, { allowDangerousHtml: true })
  .use(raw)
  .use(stringify);

export function processQuestion(html: string) {
  return html.replace(regex, (_match, originalContents: string) => {
    // We'll handle escapes before we pass off the string to our Markdown pipeline
    const decodedContents = originalContents.replace(
      escapeRegex,
      (_match, prefix: string, hashes: string) => {
        return `${prefix}${'#'.repeat(hashes.length - 1)}>`;
      },
    );
    const res = questionProcessor.processSync(decodedContents);
    return res.value.toString();
  });
}

export async function processContent(original: string) {
  return (await defaultProcessor.process(original)).value.toString();
}

/**
 * This function is similar to `processContent`, except that if the content fits a single line
 * (paragraph) it will return the content without a `p` tag.
 */
export async function processContentInline(original: string) {
  return (await inlineProcessor.process(original)).value.toString();
}

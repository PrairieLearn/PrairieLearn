import type { Element, Root as HastRoot } from 'hast';
import type { Root as MdastRoot, Text } from 'mdast';
import type { InlineMath, Math } from 'mdast-util-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remark2rehype from 'remark-rehype';
import {
  type Plugin,
  type PluginTuple,
  type Processor,
  type TransformCallback,
  type Transformer,
  unified,
} from 'unified';
import type { Node } from 'unist';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

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
  return visit(ast, ['math', 'inlineMath'], (node, index, parent) => {
    const startFence = node.type === 'math' ? '$$\n' : '$';
    const endFence = node.type === 'math' ? '\n$$' : '$';
    const text: Text = {
      type: 'text',
      value: startFence + (node as Math | InlineMath).value + endFence,
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

export function createProcessor({
  mdastVisitors,
  hastVisitors,
  sanitize = true,
  allowHtml = true,
  interpretMath = true,
}: {
  mdastVisitors?: ((ast: MdastRoot) => undefined)[];
  hastVisitors?: ((ast: HastRoot) => undefined)[];
  /**
   * If allowHtml is false, this will remove the tags themselves for inline HTML but will remove the full block for block HTML.
   * See https://spec.commonmark.org/0.31.2/#raw-html for more details on inline vs block HTML in Markdown.
   * For example, if the input is `<h1>Block HTML</h1>` the entire block will be removed. If the input is `<em>Inline HTML</em>`,
   * the `<em>` tags will be removed the output will be just the text content without any HTML tags (`Inline HTML`).
   */
  sanitize?: boolean;
  allowHtml?: boolean;
  interpretMath?: boolean;
} = {}) {
  const plugins: (Plugin<any, any, any> | PluginTuple<any, any, any>)[] = [
    remarkParse,
    ...(interpretMath ? [remarkMath] : []),
    ...(mdastVisitors ?? []).map((visitor) => makeHandler(visitor)),
    ...(interpretMath ? [makeHandler(visitMathBlock)] : []),
    remarkGfm,
    [remark2rehype, { allowDangerousHtml: allowHtml }],
    ...(!allowHtml ? [] : [rehypeRaw]),
    ...(sanitize ? [rehypeSanitize] : []),
    ...(hastVisitors ?? []).map((visitor) => makeHandler(visitor)),
    rehypeStringify,
  ];

  return plugins.reduce((processor: Processor, plugin) => {
    if (Array.isArray(plugin)) return processor.use(...plugin);
    return processor.use(plugin);
  }, unified());
}

const processorCache = new Map<string, Processor>();
function getProcessor(options: {
  inline: boolean;
  allowHtml: boolean;
  interpretMath: boolean;
}): Processor {
  const key = `${options.inline}:${options.allowHtml}:${options.interpretMath}`;
  let processor = processorCache.get(key);
  if (!processor) {
    processor = createProcessor({
      hastVisitors: options.inline ? [visitCheckSingleParagraph] : [],
      allowHtml: options.allowHtml,
      interpretMath: options.interpretMath,
    });
    processorCache.set(key, processor);
  }
  return processor;
}

/**
 * Converts markdown to HTML. If `inline` is true, and the result fits a single
 * paragraph, the content is returned inline without the paragraph tag.
 */
export async function markdownToHtml(
  original: string,
  {
    inline = false,
    allowHtml = true,
    interpretMath = true,
  }: { inline?: boolean; allowHtml?: boolean; interpretMath?: boolean } = {},
) {
  const processor = getProcessor({ inline, allowHtml, interpretMath });
  return (await processor.process(original)).value.toString();
}

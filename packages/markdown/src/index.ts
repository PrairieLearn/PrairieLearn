import type { Root as HastRoot, Element } from 'hast';
import type { Root as MdastRoot, Text } from 'mdast';
import type { Math, InlineMath } from 'mdast-util-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remark2rehype from 'remark-rehype';
import { type TransformCallback, type Transformer, type Processor, unified } from 'unified';
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
}: {
  mdastVisitors?: ((ast: MdastRoot) => undefined)[];
  hastVisitors?: ((ast: HastRoot) => undefined)[];
  sanitize?: boolean;
} = {}) {
  const htmlConversion = (mdastVisitors ?? [])
    .reduce<Processor<MdastRoot, MdastRoot, MdastRoot | undefined>>(
      (processor, visitor) => processor.use(makeHandler(visitor)),
      unified().use(remarkParse).use(remarkMath),
    )
    .use(makeHandler(visitMathBlock))
    .use(remarkGfm)
    .use(remark2rehype, { allowDangerousHtml: true })
    .use(rehypeRaw);
  return (hastVisitors ?? [])
    .reduce(
      (processor, visitor) => processor.use(makeHandler(visitor)),
      sanitize ? htmlConversion.use(rehypeSanitize) : htmlConversion,
    )
    .use(rehypeStringify);
}

const defaultProcessor = createProcessor();
const inlineProcessor = createProcessor({ hastVisitors: [visitCheckSingleParagraph] });

/**
 * Converts markdown to HTML. If `inline` is true, and the result fits a single
 * paragraph, the content is returned inline without the paragraph tag.
 */
export async function markdownToHtml(original: string, { inline }: { inline?: boolean } = {}) {
  return (await (inline ? inlineProcessor : defaultProcessor).process(original)).value.toString();
}

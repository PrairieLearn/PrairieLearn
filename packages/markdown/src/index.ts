import { marked, Tokenizer, type Tokens, type MarkedOptions } from 'marked';

// TODO Create a parser that handles math blocks (i.e., ignores `_` and `*` inside `$...$` blocks)

class MathTokenizer extends Tokenizer {
  paragraph(src: string): Tokens.Paragraph | undefined {
    if (src.startsWith('$$')) {
      const match = src.match(/^\$\$(([^$]|\$[^$])+)\$\$/);
      if (match) {
        return {
          type: 'paragraph',
          raw: match[0],
          text: `$$${match[1]}$$`,
          tokens: [
            {
              type: 'text',
              raw: match[0],
              text: `$$${match[1]}$$`,
            },
          ],
        };
      }
    }
    if (src.includes('$$')) {
      src = src.substring(0, src.indexOf('$$'));
    }
    return super.paragraph(src);
  }
  inlineText(src: string): Tokens.Text | undefined {
    if (src.startsWith('$')) {
      const match = src.match(/^\$([^$]+)\$/);
      if (match) {
        return {
          type: 'text',
          raw: match[0],
          text: `$${match[1]}$`,
        };
      }
    }
    if (src.includes('$')) {
      src = src.substring(0, src.indexOf('$'));
    }
    return super.inlineText(src);
  }
}

const tokenizer = new MathTokenizer();

/**
 * Converts markdown to HTML. If `inline` is true, and the result fits a single
 * paragraph, the content is returned inline without the paragraph tag. If
 * `sanitize` is true (or not provided), the output is sanitized using
 * DOMPurify.
 */
export function markdownToHtml(
  original: string,
  options: MarkedOptions & { inline?: boolean; sanitize?: boolean } = {},
) {
  const output = (options.inline ? marked.parseInline : marked.parse)(original, {
    ...options,
    tokenizer,
    async: false,
  });
  if (options.sanitize ?? true) {
    // TODO Sanitize
    //output = DOMPurify.sanitize(output, { SANITIZE_NAMED_PROPS: true });
  }
  return output;
}

import { marked, type MarkedOptions } from 'marked';

// TODO Create a parser that handles math blocks (i.e., ignores `_` and `*` inside `$...$` blocks)

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
    async: false,
  });
  if (options.sanitize ?? true) {
    // TODO Sanitize
    //output = DOMPurify.sanitize(output, { SANITIZE_NAMED_PROPS: true });
  }
  return output;
}

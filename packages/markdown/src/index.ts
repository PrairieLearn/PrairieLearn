import DOMPurify from 'isomorphic-dompurify';
import { Marked, type MarkedExtension } from 'marked';
// @ts-expect-error MathJax does not include types
import mathjax from 'mathjax';

import { addMathjaxExtension } from '@prairielearn/marked-mathjax';

export async function createMarkedInstance({
  sanitize = true,
  allowHtml = true,
  interpretMath = true,
  extensions,
}: {
  sanitize?: boolean;
  /**
   * If allowHtml is false, this will remove the tags themselves for inline HTML but will remove the full block for block HTML.
   * See https://spec.commonmark.org/0.31.2/#raw-html for more details on inline vs block HTML in Markdown.
   * For example, if the input is `<h1>Block HTML</h1>` the entire block will be removed. If the input is `<em>Inline HTML</em>`,
   * the `<em>` tags will be removed the output will be just the text content without any HTML tags (`Inline HTML`).
   */
  allowHtml?: boolean;
  interpretMath?: boolean;
  extensions?: MarkedExtension[];
} = {}) {
  const marked = new Marked();

  if (interpretMath) {
    const MathJax = await mathjax.init({
      options: { ignoreHtmlClass: 'mathjax_ignore|tex2jax_ignore' },
      tex: {
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)'],
        ],
      },
      loader: { load: ['input/tex'] },
    });
    addMathjaxExtension(marked, MathJax);
  }

  if (!allowHtml) {
    marked.use({ renderer: { html: (_token) => '' } });
  }

  if (extensions) {
    marked.use(...extensions);
  }

  if (sanitize) {
    marked.use({ hooks: { postprocess: (html) => DOMPurify.sanitize(html) } });
  }

  return marked;
}

const markedInstanceCache = new Map<string, Promise<Marked>>();

/**
 * Returns a cached instance of Marked with the specified options. Does not
 * handle extensions, callers that rely on extensions should perform their own
 * caching.
 */
function getMarkedInstance(options: {
  sanitize: boolean;
  allowHtml: boolean;
  interpretMath: boolean;
}): Promise<Marked> {
  const key = `${options.sanitize}:${options.allowHtml}:${options.interpretMath}`;
  let markedPromise = markedInstanceCache.get(key);
  if (!markedPromise) {
    markedPromise = createMarkedInstance({
      sanitize: options.sanitize,
      allowHtml: options.allowHtml,
      interpretMath: options.interpretMath,
    });
    // Cache the promise so that subsequent calls with the same options return
    // the same instance. This ensures that we don't enter race conditions where
    // multiple calls to getMarkedInstance with the same options create multiple
    // instances of Marked if they are called before the first one resolves.
    markedInstanceCache.set(key, markedPromise);
  }
  return markedPromise.catch((err) => {
    // If the promise fails, remove it from the cache so that the next call
    // will try to create a new instance.
    markedInstanceCache.delete(key);
    throw err;
  });
}

/**
 * Converts markdown to HTML.
 *
 * @param original The markdown string to convert.
 * @param options Options for the conversion.
 * @param options.sanitize If true, sanitizes the HTML output to prevent XSS
 * attacks.
 * @param options.inline If true, parses the markdown as inline content,
 * otherwise as block content.
 * @param options.allowHtml If true, allows HTML tags in the markdown. If false,
 * HTML tags will be removed from the output.
 * @param options.interpretMath If true, prepares and escapes LaTeX strings to
 * be parsed by MathJax (assumes MathJax is available client-side).
 * @returns The HTML string resulting from the conversion.
 */
export async function markdownToHtml(
  original: string,
  {
    sanitize = true,
    inline = false,
    allowHtml = true,
    interpretMath = true,
  }: { sanitize?: boolean; inline?: boolean; allowHtml?: boolean; interpretMath?: boolean } = {},
) {
  const marked = await getMarkedInstance({ sanitize, allowHtml, interpretMath });
  return await (inline ? marked.parseInline : marked.parse)(original, { async: true });
}

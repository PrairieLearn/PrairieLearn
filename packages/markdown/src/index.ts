import { Marked, type MarkedExtension } from 'marked';
// @ts-expect-error MathJax does not include types
import mathjax from 'mathjax';

import { addMathjaxExtension } from '@prairielearn/marked-mathjax';

import { sanitizeHtml } from './sanitize.js';

// We can safely do this at the top level, as this only takes ~10ms to load.
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

export function createMarkedInstance({
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
    addMathjaxExtension(marked, MathJax);
  }

  if (!allowHtml) {
    marked.use({ renderer: { html: (_token) => '' } });
  }

  if (extensions) {
    marked.use(...extensions);
  }

  if (sanitize) {
    marked.use({ hooks: { postprocess: (html) => sanitizeHtml(html) } });
  }

  return marked;
}

const markedInstanceCache = new Map<string, Marked>();

/**
 * Returns a cached instance of Marked with the specified options. Does not
 * handle extensions, callers that rely on extensions should perform their own
 * caching.
 */
function getMarkedInstance(options: {
  sanitize: boolean;
  allowHtml: boolean;
  interpretMath: boolean;
}): Marked {
  const key = `${options.sanitize}:${options.allowHtml}:${options.interpretMath}`;
  let instance = markedInstanceCache.get(key);
  if (!instance) {
    instance = createMarkedInstance({
      sanitize: options.sanitize,
      allowHtml: options.allowHtml,
      interpretMath: options.interpretMath,
    });
    markedInstanceCache.set(key, instance);
  }
  return instance;
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
export function markdownToHtml(
  original: string,
  {
    sanitize = true,
    inline = false,
    allowHtml = true,
    interpretMath = true,
  }: { sanitize?: boolean; inline?: boolean; allowHtml?: boolean; interpretMath?: boolean } = {},
): string {
  const marked = getMarkedInstance({ sanitize, allowHtml, interpretMath });
  return (inline ? marked.parseInline : marked.parse)(original, { async: false });
}

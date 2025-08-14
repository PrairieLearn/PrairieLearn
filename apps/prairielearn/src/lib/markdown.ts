import type { Tokens } from 'marked';

import { type HtmlValue, html, joinHtml } from '@prairielearn/html';
import { createMarkedInstance } from '@prairielearn/markdown';

// The ? symbol is used to make the match non-greedy (i.e., match the shortest
// possible string that fulfills the regex). See
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Quantifiers#types
const regex = /<markdown>(.*?)<\/markdown>/gms;
const escapeRegex = /(<\/?markdown)(#+)>/g;
const langRegex = /([^\\{]*)?(\{(.*)\})?/;

// The question processor also includes the use of pl-code instead of pre,
// and does not sanitize scripts
const questionMarked = await createMarkedInstance({
  sanitize: false,
  extensions: [
    {
      renderer: {
        code: ({ text, lang }) => {
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

          return html`<pl-code ${joinHtml(attrs, ' ')}>${text}</pl-code>`.toString();
        },
      },
      extensions: [
        {
          // Historically, our markdown processor has been loose with escaping
          // characters used by MathJax, leading to cases where `\\$` or `\\\$`
          // was required to escape a dollar sign. This extension ensures that
          // any question relying on this behavior continues to work as it was
          // intended.
          name: 'escape_math_delim',
          level: 'inline',
          start: (src) => src.match(/\\{1,3}\$/)?.index,
          tokenizer(src): Tokens.Escape | undefined {
            const rawMatch = src.match(/^\\{1,3}\$/);
            if (rawMatch?.index !== 0) return undefined;
            // Return a token that will be processed by the renderer.
            return { type: 'escape', raw: rawMatch[0], text: '$' };
          },
        },
      ],
    },
  ],
});

export function processQuestion(html: string) {
  return html.replaceAll(regex, (_match, originalContents: string) => {
    // We'll handle escapes before we pass off the string to our Markdown pipeline
    const decodedContents = originalContents.replaceAll(
      escapeRegex,
      (_match, prefix: string, hashes: string) => {
        return `${prefix}${'#'.repeat(hashes.length - 1)}>`;
      },
    );
    return questionMarked.parse(decodedContents, { async: false });
  });
}

import { marked, Renderer, type Tokens } from 'marked';

import { type HtmlValue, html, joinHtml } from '@prairielearn/html';

// The ? symbol is used to make the match non-greedy (i.e., match the shortest
// possible string that fulfills the regex). See
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Quantifiers#types
const regex = /<markdown>(.*?)<\/markdown>/gms;
const escapeRegex = /(<\/?markdown)(#+)>/g;
const langRegex = /([^\\{]*)?(\{(.*)\})?/;

class QuestionRenderer extends Renderer {
  code({ text, lang }: Tokens.Code): string {
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
  }
}

const renderer = new QuestionRenderer();

export function processQuestion(html: string) {
  return html.replace(regex, (_match, originalContents: string) => {
    // We'll handle escapes before we pass off the string to our Markdown pipeline
    const decodedContents = originalContents.replace(
      escapeRegex,
      (_match, prefix: string, hashes: string) => {
        return `${prefix}${'#'.repeat(hashes.length - 1)}>`;
      },
    );
    return marked.parse(decodedContents, { renderer, async: false });
  });
}

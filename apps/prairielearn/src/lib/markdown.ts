import type { Root as MdastRoot, Code, Html } from 'mdast';
import { visit } from 'unist-util-visit';

import { type HtmlValue, html, joinHtml } from '@prairielearn/html';
import { createProcessor } from '@prairielearn/markdown';

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

// The question processor also includes the use of pl-code instead of pre,
// and does not sanitize scripts
const questionProcessor = createProcessor({ mdastVisitors: [visitCodeBlock], sanitize: false });

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

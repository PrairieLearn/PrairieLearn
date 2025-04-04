const startMath = /(\$|\\\(|\\\[)/;

import { type Marked } from 'marked';

export function addMathjaxExtension(marked: Marked, MathJax: any) {
  const mathjaxInput = MathJax.startup.getInputJax() ?? [];
  marked.use({
    renderer: {
      // Any leaf text token (without child tokens) that is not math
      // should be ignored by MathJax. This includes escaped characters
      // like `\\` and `\$`, which we don't want MathJax to double-escape.
      // The text input is already escaped by marked itself.
      text: (token) =>
        'tokens' in token && token.tokens
          ? false
          : `<span class="mathjax_ignore">${token.text}</span>`,
    },
    extensions: [
      {
        name: 'math',
        // Even though we support both inline (via `$` and `\(`) and block (via
        // `$$` and `\[`) math, we treat all math as inline in the context of
        // markdown processing. MathJax creates math blocks even if the
        // delimiters are in the middle of a paragraph.
        level: 'inline',
        start: (src) => src.match(startMath)?.index,
        tokenizer(src) {
          // Check if the string starts with a math delimiter. If the
          // delimiter is further in the string, start() will take care of
          // calling the tokenizer again.
          if (src.match(startMath)?.index !== 0) return undefined;
          // Use MathJax API to retrieve the math content.
          for (const inputJax of mathjaxInput) {
            const foundMath = inputJax.findMath([src])?.find((math: any) => math.start?.n === 0);
            if (foundMath) {
              const raw = src.substring(0, foundMath.end.n);
              return {
                type: 'math',
                raw,
                text: raw
                  .replaceAll('&', '&amp;')
                  .replaceAll('<', '&lt;')
                  .replaceAll('>', '&gt;')
                  .replaceAll('"', '&quot;')
                  .replaceAll("'", '&#39;'),
              };
            }
          }
        },
        renderer: ({ text }) => text,
      },
    ],
  });
}

export default addMathjaxExtension;

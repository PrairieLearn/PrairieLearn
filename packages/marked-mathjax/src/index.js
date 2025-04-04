/* global MathJax */

const startMath = /(\$|\\\(|\\\[)/;
const mathjaxInput = MathJax.startup.getInputJax() ?? [];

export function addMathjaxExtension(marked) {
  marked.use({
    renderer: {
      // Any leaf text token (without child tokens) that is not math
      // should be ignored by MathJax. This includes escaped characters
      // like `\\` and `\$`, which we don't want MathJax to double-escape.
      // The text input is already escaped by marked itself.
      text: ({ text, tokens }) => (tokens ? false : `<span class="mathjax_ignore">${text}</span>`),
    },
    extensions: [
      {
        name: 'math',
        level: 'inline',
        start: (src) => src.match(startMath)?.index,
        tokenizer(src) {
          // Check if the string starts with a math delimiter. If the
          // delimiter is further in the string, start() will take care of
          // calling the tokenizer again.
          if (src.match(startMath)?.index !== 0) return false;
          // Use MathJax API to retrieve the math content.
          for (const inputJax of mathjaxInput) {
            const foundMath = inputJax.findMath([src])?.find((math) => math.start?.n === 0);
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

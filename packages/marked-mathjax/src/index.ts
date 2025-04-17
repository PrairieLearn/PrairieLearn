import type { Marked } from 'marked';
import type { MathJaxObject } from 'mathjax-full/js/components/startup.js';

const startMath = /(\$|\\\(|\\\[)/;

/**
 * Adds an extension to marked to handle math in a manner compatible with our
 * use of Mathjax in PrairieLearn.
 *
 * @param marked - The marked instance to extend.
 * @param MathJax - The MathJax instance to use for rendering math. In
 * client-side code, this will be `window.MathJax`. The current version does not
 * yet support server-side rendering. A future extension of this package may
 * support server-side rendering if an instance of MathJax is created (either
 * here or in the caller).
 */
export function addMathjaxExtension(marked: Marked, MathJax: MathJaxObject) {
  const mathjaxInput = MathJax.startup.getInputJax() ?? [];
  marked.use({
    renderer: {
      // Any leaf text token (without child tokens) that is not math
      // should be ignored by MathJax. This includes escaped characters
      // like `\\` and `\$`, which we don't want MathJax to double-escape.
      // The text input is already escaped by marked itself.
      text: (token) =>
        token.type == 'text' && (token.tokens || token.escaped)
          ? false // If there are children, let default renderer handle it.
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
            const foundMath = inputJax.findMath([src])?.find((math) => math.start?.n === 0);
            if (foundMath?.end?.n !== undefined) {
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
          // Did not find any math.
          return undefined;
        },
        renderer: ({ text }) => text,
      },
    ],
  });
}

export default addMathjaxExtension;

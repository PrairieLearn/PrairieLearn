import type { Marked } from 'marked';

const startMath = /(\$|\\\(|\\\[)/;

/**
 * Adds an extension to marked to handle math in a manner compatible with our
 * use of Mathjax in PrairieLearn.
 *
 * @param marked - The marked instance to extend.
 * @param MathJax - The MathJax instance to use for rendering math. In
 * client-side code, this is `window.MathJax` (ensure `MathJax.startup.promise`
 * has been resolved). In server-side code, this is the result of
 * `require('mathjax').init()`.
 */
export function addMathjaxExtension(marked: Marked, MathJax: any) {
  const mathjaxInput = MathJax.startup.getInputJax() ?? [];
  marked.use({
    hooks: {
      // This hook ensures that, if a math token is to be found inside an
      // em/strong token, no `*` or `_` characters are interpreted as em/strong
      // termination. This is done by masking the content that the em/strong
      // interpreter use to find the termination characters.
      emStrongMask(src) {
        // Fast-path: no potential math delimiters present
        if (!startMath.test(src)) return src;
        for (const inputJax of mathjaxInput) {
          for (const foundMath of inputJax.findMath([src])) {
            src =
              src.slice(0, foundMath.start.n) +
              'a'.repeat(foundMath.end.n - foundMath.start.n) +
              src.slice(foundMath.end.n);
          }
        }
        return src;
      },
    },
    renderer: {
      // Any leaf text token that is not math should be ignored by MathJax.
      // Note:
      // * Escaped characters like `\\` and `\$` (type == 'escaped') are ignored
      //   since we don't want MathJax to double-escape.
      // * Text inside some elements (e.g., list items) will call the renderer
      //   with child tokens for preprocessing, we return false so the default
      //   renderer renders the children individually.
      // * After child tokens are rendered, this renderer is called again with
      //   the result (and escaped set to true). At that point the text is
      //   already rendered with escape characters as needed, so nothing to do.
      text: (token) => {
        if (token.type === 'text' && (token.tokens || token.escaped)) return false;
        if (/[$\\]/.test(token.text)) {
          return `<span class="mathjax_ignore">${token.text}</span>`;
        }
        return false;
      },
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
            if (foundMath?.end?.n !== undefined) {
              const raw = src.slice(0, foundMath.end.n);
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

/** Remove duplicate choices by HTML text, preferring the correct one when duplicates exist. */
export function deduplicateChoices<T extends { html: string; correct: boolean }>(
  choices: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const choice of choices) {
    const existing = seen.get(choice.html);
    if (!existing || (!existing.correct && choice.correct)) {
      seen.set(choice.html, choice);
    }
  }
  return [...seen.values()];
}

/** Escape Mustache delimiters so imported content remains literal during template rendering. */
export function escapeMustacheDelimiters(html: string): string {
  return html
    .replaceAll('{{{', '&#123;&#123;&#123;')
    .replaceAll('}}}', '&#125;&#125;&#125;')
    .replaceAll('{{', '&#123;&#123;')
    .replaceAll('}}', '&#125;&#125;');
}

/**
 * Convert a Canvas formula string to a valid Python expression.
 *
 * Canvas uses [varname] for variable references and supports common math functions.
 * Differences from Python:
 *   - [varname]  → varname
 *   - log(x)     → math.log10(x)  (Canvas log = base-10)
 *   - ln(x)      → math.log(x)    (Canvas ln = natural log)
 *   - sqrt/sin/cos/tan/etc → math.<fn>(...)
 *   - ^          → **              (exponentiation)
 */
export function convertFormulaToPython(formula: string): string {
  let py = formula.replaceAll(/\[(\w+)\]/g, '$1');
  // Use negative lookbehind to avoid re-matching already-prefixed math.log(...).
  py = py.replaceAll(/(?<!math\.)\blog\s*\(/g, 'math.log10(');
  py = py.replaceAll(/(?<!math\.)\bln\s*\(/g, 'math.log(');
  for (const fn of ['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'ceil', 'floor']) {
    py = py.replaceAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'), `math.${fn}(`);
  }
  py = py.replaceAll('^', '**');
  return py;
}

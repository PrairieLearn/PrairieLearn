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

/**
 * Append lines to a grade() body that push global correct/incorrect feedback onto `_messages`.
 * Both branches are independent — a question can show both if it somehow satisfies both.
 */
export function appendGlobalFeedback(
  lines: string[],
  correct: string | undefined,
  incorrect: string | undefined,
): void {
  if (correct && incorrect) {
    lines.push(
      '    if data["score"] >= 1.0:',
      `        _messages.append(${JSON.stringify(correct)})`,
      '    else:',
      `        _messages.append(${JSON.stringify(incorrect)})`,
    );
  } else if (correct) {
    lines.push(
      '    if data["score"] >= 1.0:',
      `        _messages.append(${JSON.stringify(correct)})`,
    );
  } else if (incorrect) {
    lines.push(
      '    if data["score"] < 1.0:',
      `        _messages.append(${JSON.stringify(incorrect)})`,
    );
  }
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

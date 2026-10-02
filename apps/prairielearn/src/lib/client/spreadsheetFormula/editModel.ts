// Tracks the structure of the formula being edited across keystrokes. The text stays
// the source of truth; this only remembers deletions that a fresh parse would
// otherwise misread, following the prototype's repair rules: a deleted operator leaves
// an operator hole instead of merging its neighbors, and a deleted `)` leaves a
// delimiter hole where it was instead of the call silently extending to the end.

import { type FormulaHole, type FormulaPhantom, parseFormula } from './parser.js';

const OPERATOR_CHARACTERS = new Set(['+', '-', '*', '/', '^', '&']);

export interface FormulaEditState {
  formula: string;
  phantoms: FormulaPhantom[];
}

/** Returns the phantoms for `formula` after it was edited from `previous`. */
export function nextPhantoms(previous: FormulaEditState, formula: string): FormulaPhantom[] {
  const fresh = parseFormula(formula);
  if (!fresh || fresh.complete) return [];

  const before = previous.formula;
  let prefix = 0;
  while (prefix < before.length && prefix < formula.length && before[prefix] === formula[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < formula.length - prefix &&
    before[before.length - 1 - suffix] === formula[formula.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removedEnd = before.length - suffix;
  const insertedLength = formula.length - suffix - prefix;
  const shift = insertedLength - (removedEnd - prefix);

  const phantoms = previous.phantoms.flatMap((phantom): FormulaPhantom[] => {
    if (phantom.position < prefix) return [phantom];
    if (phantom.position === prefix) {
      // Typing the missing `)` or operator where a phantom sits resolves it; typing
      // anything else there pushes it along.
      const inserted = formula.slice(prefix, prefix + insertedLength);
      if (
        phantom.kind === 'close' ? inserted.startsWith(')') : OPERATOR_CHARACTERS.has(inserted[0])
      ) {
        return [];
      }
      return [{ ...phantom, position: phantom.position + insertedLength }];
    }
    if (phantom.position < removedEnd) return [];
    return [{ ...phantom, position: phantom.position + shift }];
  });

  if (removedEnd - prefix === 1 && insertedLength === 0) {
    const removed = before[prefix];
    const previousStructure = parseFormula(before, previous.phantoms);
    if (removed === ')' && previousStructure?.closePositions.includes(prefix)) {
      phantoms.push({ kind: 'close', position: prefix });
    } else if (
      OPERATOR_CHARACTERS.has(removed) &&
      previousStructure?.operatorPositions.includes(prefix)
    ) {
      phantoms.push({ kind: 'split', position: prefix });
    }
  }
  return phantoms;
}

/**
 * Appends the closing parentheses missing at the end of a formula, like Google Sheets
 * and Excel do when a formula is entered.
 */
export function closeTrailingParentheses(formula: string): string {
  const structure = parseFormula(formula);
  if (!structure) return formula;
  const contentEnd = formula.trimEnd().length;
  const missing = structure.holes.filter(
    (hole) => hole.kind === 'delimiter' && hole.position >= contentEnd,
  ).length;
  return formula.trimEnd() + ')'.repeat(missing) + formula.slice(contentEnd);
}

export function describeHole(hole: FormulaHole): string {
  switch (hole.kind) {
    case 'argument':
      return hole.argument
        ? `${hole.functionName} is missing ${hole.argument.name}.`
        : `${hole.functionName} has an empty argument.`;
    case 'operand':
      return 'A value is missing.';
    case 'operator':
      return 'An operator is missing between two values.';
    case 'delimiter':
      return 'A closing parenthesis is missing.';
  }
}

/** Describes the first thing missing from a formula, or null if nothing is. */
export function describeFirstHole(formula: string): string | null {
  const hole = parseFormula(formula)?.holes[0];
  return hole ? describeHole(hole) : null;
}

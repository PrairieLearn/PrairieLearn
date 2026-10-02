import {
  FORMULA_FUNCTION_SIGNATURES,
  type FormulaFunctionSignature,
  argumentAt,
} from './functions.js';
import { type FormulaToken, formulaTokens } from './lexer.js';

// Offsets in this module index the full formula text, including the leading `=`.

const MAX_COMPLETIONS = 8;
const OPERAND_POSITION_KINDS = new Set(['lparen', 'comma', 'operator', 'comparison']);
const CONSTANTS = new Set(['TRUE', 'FALSE']);

function previousSignificant(tokens: FormulaToken[], index: number): FormulaToken | null {
  for (let position = index - 1; position >= 0; position -= 1) {
    if (tokens[position].kind !== 'whitespace') return tokens[position];
  }
  return null;
}

function nextSignificant(tokens: FormulaToken[], index: number): FormulaToken | null {
  for (let position = index + 1; position < tokens.length; position += 1) {
    if (tokens[position].kind !== 'whitespace') return tokens[position];
  }
  return null;
}

interface FormulaCompletion {
  /** The span of the identifier being completed. */
  start: number;
  end: number;
  /** Whether an opening parenthesis already follows the identifier. */
  hasParen: boolean;
  matches: FormulaFunctionSignature[];
}

/** Function names matching the identifier the caret is in, if it is in an operand position. */
export function getCompletion(formula: string, caret: number): FormulaCompletion | null {
  const tokens = formulaTokens(formula);
  if (!tokens) return null;
  const index = tokens.findIndex((token) => token.start < caret && caret <= token.end);
  if (index === -1) return null;
  const token = tokens[index];
  // `LOG1` lexes as a cell reference and `TRUE` as a boolean, but both may be a function name in progress.
  const isIdentifier =
    token.kind === 'name' ||
    token.kind === 'function' ||
    token.kind === 'boolean' ||
    (token.kind === 'ref' && /^[A-Za-z]+[0-9]*$/.test(token.text));
  if (!isIdentifier) return null;
  const previous = previousSignificant(tokens, index);
  if (previous && !OPERAND_POSITION_KINDS.has(previous.kind)) return null;

  const prefix = formula.slice(token.start, caret).toUpperCase();
  const names = [...FORMULA_FUNCTION_SIGNATURES.keys()];
  const prefixMatches = names.filter((name) => name.startsWith(prefix)).sort();
  const substringMatches = names
    .filter((name) => !name.startsWith(prefix) && name.includes(prefix))
    .sort();
  const matches = [...prefixMatches, ...substringMatches]
    .slice(0, MAX_COMPLETIONS)
    .map((name) => FORMULA_FUNCTION_SIGNATURES.get(name)!);
  if (matches.length === 0) return null;
  return {
    start: token.start,
    end: token.end,
    hasParen: nextSignificant(tokens, index)?.kind === 'lparen',
    matches,
  };
}

/** Replaces the completed identifier, returning the new formula and caret position. */
export function applyCompletion(
  formula: string,
  completion: FormulaCompletion,
  signature: FormulaFunctionSignature,
): { formula: string; caret: number } {
  const before = formula.slice(0, completion.start);
  const after = formula.slice(completion.end);
  if (CONSTANTS.has(signature.name) || completion.hasParen) {
    return {
      formula: `${before}${signature.name}${after}`,
      caret: before.length + signature.name.length + (completion.hasParen ? 1 : 0),
    };
  }
  if (signature.args.length === 0) {
    const inserted = `${signature.name}()`;
    return { formula: `${before}${inserted}${after}`, caret: before.length + inserted.length };
  }
  // Commas for every required argument lay out a hole for each, which Tab steps through.
  // Text after the call is closed off so that it doesn't become the last argument.
  const required = signature.args.findIndex((argument) => argument.optional);
  const commas = ','.repeat((required === -1 ? signature.args.length : required) - 1);
  const close = after.trim() === '' ? '' : ')';
  const opening = `${signature.name}(`;
  return {
    formula: `${before}${opening}${commas}${close}${after}`,
    caret: before.length + opening.length,
  };
}

export interface FormulaSignatureHint {
  signature: FormulaFunctionSignature;
  argumentIndex: number;
  /** The name of the current argument, or null if the call has more arguments than it accepts. */
  argumentName: string | null;
}

/** The innermost known function call that contains the caret, and which argument the caret is in. */
export function getSignatureHint(formula: string, caret: number): FormulaSignatureHint | null {
  const tokens = formulaTokens(formula);
  if (!tokens) return null;
  const stack: ({ name: string; argumentIndex: number } | null)[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.end > caret) break;
    if (token.kind === 'lparen') {
      const previous = previousSignificant(tokens, index);
      stack.push(
        previous?.kind === 'function'
          ? { name: previous.text.toUpperCase(), argumentIndex: 0 }
          : null,
      );
    } else if (token.kind === 'rparen') {
      stack.pop();
    } else if (token.kind === 'comma') {
      const frame = stack.at(-1);
      if (frame) frame.argumentIndex += 1;
    }
  }
  const frame = stack.at(-1);
  if (!frame) return null;
  const signature = FORMULA_FUNCTION_SIGNATURES.get(frame.name);
  if (!signature) return null;
  return {
    signature,
    argumentIndex: frame.argumentIndex,
    argumentName: argumentAt(signature, frame.argumentIndex)?.name ?? null,
  };
}

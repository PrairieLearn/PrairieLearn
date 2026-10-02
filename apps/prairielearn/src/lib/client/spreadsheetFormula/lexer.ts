// Total tokenizer for spreadsheet formula text (the part after the leading `=`).
// It never throws: anything it cannot classify becomes an `error` token, so the
// formula bar can highlight every keystroke of a half-typed formula. The
// concatenated token text always equals the input.

type FormulaTokenKind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'function'
  | 'ref'
  | 'range'
  | 'name'
  | 'operator'
  | 'comparison'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'whitespace'
  | 'error';

export interface FormulaToken {
  kind: FormulaTokenKind;
  text: string;
  start: number;
  end: number;
  /** Set on a `string` token whose closing quote has not been typed yet. */
  unterminated?: boolean;
}

const IDENTIFIER = String.raw`[A-Za-z_][A-Za-z0-9_.]*`;
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?[0-9]+`;
const COLUMN = String.raw`\$?[A-Za-z]{1,3}`;
const ROW = String.raw`\$?[0-9]+`;
const QUOTED_SHEET = String.raw`'(?:[^']|'')*'`;
const SHEET_PREFIX = String.raw`(?:${QUOTED_SHEET}|${IDENTIFIER})!`;
// Neither a cell reference nor a range endpoint may run into further identifier characters
// or an opening parenthesis (`LOG10(` is a function call, not cell LOG10).
const NOT_IDENTIFIER_CONTINUATION = String.raw`(?![A-Za-z0-9_.(!])`;

const RANGE_PATTERN = new RegExp(
  String.raw`(?:${SHEET_PREFIX})?(?:${CELL}|${COLUMN}|${ROW}):(?:${SHEET_PREFIX})?(?:${CELL}|${COLUMN}|${ROW})${NOT_IDENTIFIER_CONTINUATION}`,
  'y',
);
const REF_PATTERN = new RegExp(
  String.raw`(?:${SHEET_PREFIX})?${CELL}${NOT_IDENTIFIER_CONTINUATION}`,
  'y',
);
const FUNCTION_PATTERN = new RegExp(String.raw`${IDENTIFIER}(?=\s*\()`, 'y');
const BOOLEAN_PATTERN = new RegExp(String.raw`(?:TRUE|FALSE)${NOT_IDENTIFIER_CONTINUATION}`, 'iy');
const NAME_PATTERN = new RegExp(IDENTIFIER, 'y');
const NUMBER_PATTERN = /(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/y;
const WHITESPACE_PATTERN = /\s+/y;
const COMPARISON_PATTERN = /<=|>=|<>|[=<>]/y;
const OPERATOR_CHARACTERS = new Set(['+', '-', '*', '/', '^', '&', '%']);

function matchAt(pattern: RegExp, text: string, index: number): string | null {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0] ?? null;
}

/** Returns the end index of a `"…"` string starting at `index`, or `null` if it is unterminated. */
function stringEnd(text: string, index: number): number | null {
  let position = index + 1;
  while (position < text.length) {
    if (text[position] === '"') {
      if (text[position + 1] === '"') {
        position += 2;
        continue;
      }
      return position + 1;
    }
    position += 1;
  }
  return null;
}

export function tokenizeFormula(text: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let index = 0;

  function push(kind: FormulaTokenKind, end: number, unterminated?: boolean) {
    tokens.push({
      kind,
      text: text.slice(index, end),
      start: index,
      end,
      ...(unterminated ? { unterminated } : {}),
    });
    index = end;
  }

  while (index < text.length) {
    const character = text[index];

    const whitespace = matchAt(WHITESPACE_PATTERN, text, index);
    if (whitespace) {
      push('whitespace', index + whitespace.length);
      continue;
    }

    if (character === '"') {
      const end = stringEnd(text, index);
      push('string', end ?? text.length, end === null);
      continue;
    }

    // Ranges are tried before numbers and names so `1:3`, `A:C`, and `Sheet1!A1:B2` stay whole.
    const range = matchAt(RANGE_PATTERN, text, index);
    if (range) {
      push('range', index + range.length);
      continue;
    }

    const ref = matchAt(REF_PATTERN, text, index);
    if (ref) {
      push('ref', index + ref.length);
      continue;
    }

    if (character === "'") {
      // A quoted sheet name that is not (yet) followed by a valid reference.
      const closing = matchAt(new RegExp(QUOTED_SHEET, 'y'), text, index);
      push('error', closing ? index + closing.length : text.length);
      continue;
    }

    const functionName = matchAt(FUNCTION_PATTERN, text, index);
    if (functionName) {
      push('function', index + functionName.length);
      continue;
    }

    const boolean = matchAt(BOOLEAN_PATTERN, text, index);
    if (boolean) {
      push('boolean', index + boolean.length);
      continue;
    }

    const name = matchAt(NAME_PATTERN, text, index);
    if (name) {
      push('name', index + name.length);
      continue;
    }

    const number = matchAt(NUMBER_PATTERN, text, index);
    if (number) {
      push('number', index + number.length);
      continue;
    }

    const comparison = matchAt(COMPARISON_PATTERN, text, index);
    if (comparison) {
      push('comparison', index + comparison.length);
      continue;
    }

    if (OPERATOR_CHARACTERS.has(character)) {
      push('operator', index + 1);
    } else if (character === '(') {
      push('lparen', index + 1);
    } else if (character === ')') {
      push('rparen', index + 1);
    } else if (character === ',') {
      push('comma', index + 1);
    } else {
      push('error', index + 1);
    }
  }

  return tokens;
}

/**
 * Tokenizes a whole formula including its leading `=`, with offsets into the whole
 * formula, or returns null if the text is not a formula. No token spans a `boundary`.
 */
export function formulaTokens(formula: string, boundaries: number[] = []): FormulaToken[] | null {
  if (!formula.startsWith('=')) return null;
  const cuts = [...new Set(boundaries)]
    .filter((boundary) => boundary > 1 && boundary < formula.length)
    .sort((a, b) => a - b);
  const tokens: FormulaToken[] = [];
  let start = 1;
  for (const end of [...cuts, formula.length]) {
    for (const token of tokenizeFormula(formula.slice(start, end))) {
      tokens.push({ ...token, start: token.start + start, end: token.end + start });
    }
    start = end;
  }
  return tokens;
}

/** Normalizes a `ref` or `range` token so equivalent references (`$a$1`, `A1`) compare equal. */
function referenceKey(token: FormulaToken): string {
  return token.text.replaceAll('$', '').toUpperCase();
}

interface FormulaReference {
  token: FormulaToken;
  key: string;
  colorIndex: number;
}

const FORMULA_REFERENCE_COLOR_COUNT = 5;

/** Assigns each distinct reference a color, in order of first appearance, like Google Sheets. */
export function formulaReferences(tokens: FormulaToken[]): FormulaReference[] {
  const colors = new Map<string, number>();
  const references: FormulaReference[] = [];
  for (const token of tokens) {
    if (token.kind !== 'ref' && token.kind !== 'range') continue;
    const key = referenceKey(token);
    if (!colors.has(key)) colors.set(key, colors.size % FORMULA_REFERENCE_COLOR_COUNT);
    references.push({ token, key, colorIndex: colors.get(key)! });
  }
  return references;
}
